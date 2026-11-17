import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const {values} = parseArgs({options:{release:{type:'string'}, out:{type:'string'}}});
if (!values.release || !values.out) {
  throw Error('Usage: node build-pages-native.mjs --release <V3 checkout> --out <Pages directory>');
}

const provenance = '3967f2ba7b164e9e2cc84396b6f4ccf107deb44a';
const releasedDigest = 'def788d2c26c1a652e6caee5cf738e3b559cb9c9e46eeadc31594cd9ce6c7111';
const worker = await readFile(path.resolve(values.release, 'dist/server/index.js'));
if (createHash('sha256').update(worker).digest('hex') !== releasedDigest) {
  throw Error('Expected the released account Worker from V3 (' + provenance + ').');
}

const {build} = createRequire(path.resolve(here, '../../云端经营版/package.json'))('esbuild');
const result = await build({
  absWorkingDir:path.resolve(here, '../..'),
  entryPoints:[path.join(here, 'pages-native.mjs')], write:false, bundle:true,
  format:'esm', platform:'neutral', target:'es2022', charset:'utf8',
  external:['node:crypto', 'node:buffer', 'cloudflare:workers'],
  plugins:[{name:'released-accounts', setup(builder) {
    builder.onResolve({filter:/^petshop:released-accounts$/}, () => ({path:'V3', namespace:'released-accounts'}));
    builder.onLoad({filter:/.*/, namespace:'released-accounts'}, () => ({contents:worker, loader:'js'}));
  }}],
});

const out = path.resolve(values.out);
await mkdir(out, {recursive:true});
await writeFile(path.join(out,'_worker.js'), result.outputFiles[0].contents);
await copyFile(path.join(here,'_routes.json'), path.join(out,'_routes.json'));
console.log('Built native Pages API from V3 ' + provenance + ' at ' + out);
