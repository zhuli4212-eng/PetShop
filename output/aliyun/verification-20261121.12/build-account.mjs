import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const folder=path.dirname(fileURLToPath(import.meta.url));
const source=path.resolve(folder,'../source-breeding-ui-20261121');
const {build}=createRequire(path.join(source,'云端经营版/package.json'))('esbuild');
await build({entryPoints:[path.join(source,'外网试玩/accounts/worker.mjs')],outfile:path.join(folder,'pages/_worker.js'),bundle:true,platform:'neutral',format:'esm',target:'es2022',charset:'utf8',external:['node:crypto','node:buffer','cloudflare:workers'],minify:true,legalComments:'eof',metafile:true}).then(result=>console.log('Normal account service built:',Object.keys(result.metafile.inputs).length,'source modules'));
