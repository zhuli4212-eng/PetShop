import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const service = '外网试玩/accounts';
const entry = service + '/worker.mjs';
const externals = ['node:crypto', 'node:buffer', 'cloudflare:workers'];
const options = {
  absWorkingDir:root, entryPoints:[entry], bundle:true, platform:'neutral',
  format:'esm', target:'es2022', charset:'utf8', external:externals, metafile:true,
};
const json = value => JSON.stringify(value, null, 2) + '\n';

async function copySource(target, source, destination) {
  const output = path.join(target, destination);
  await mkdir(path.dirname(output), {recursive:true});
  await cp(source, output, {recursive:true});
}

async function copyTo(target, source, destination = source) {
  await copySource(target, path.join(root,source), destination);
}

async function prepare(target, gameSource) {
  if (target === path.resolve(root)) throw Error('Choose the separate Site source checkout.');
  const template = '云端经营版';
  const packageFile = path.join(root, template, 'package.json');
  const tools = createRequire(packageFile)('esbuild');
  const rules = gameSource || path.join(root,'PetShop/server');
  const names = path.join(root,'PetShop/server/account-name.mjs');
  // Resolve from the release snapshot before building the graph, so changes in its transitive imports are respected.
  const graph = await tools.build({...options, write:false, plugins:[{
    name:'game-source', setup(builder) {
      builder.onResolve({filter:/^\.\.\/\.\.\/PetShop\/server\//},args => {
        if (path.resolve(args.importer) !== path.join(root,entry)) return;
        const leaf = args.path.slice('../../PetShop/server/'.length);
        return {path:leaf === 'account-name.mjs' ? names : path.resolve(rules,leaf)};
      });
      builder.onResolve({filter:/^\.\//},args => {
        if (path.resolve(args.importer) === names) return {path:path.resolve(rules,args.path)};
      });
    },
  }]});
  // Only actual module inputs are packaged. Runtime databases, accounts and local configuration are outside this graph.
  for (const file of Object.keys(graph.metafile.inputs)) {
    if (file === entry || file === service + '/passwords.mjs') { await copyTo(target,file); continue; }
    const source = path.resolve(root,file);
    const leaf = source === names ? 'account-name.mjs' : path.relative(rules,source);
    if (!/^[\w-]+\.(mjs|json)$/.test(leaf)) {
      throw Error('Review new Worker build input before copying it: ' + file);
    }
    await copySource(target,source,'PetShop/server/'+leaf);
  }
  await copyTo(target, service + '/build-sites.mjs');
  await copyTo(target, service + '/schema.sql');
  await copyTo(target, service + '/drizzle', 'drizzle');
  await copyTo(target, template + '/scripts/build-files.mjs', 'scripts/build-files.mjs');
  for (const file of ['.gitignore','pnpm-lock.yaml','pnpm-workspace.yaml']) await copyTo(target, template+'/'+file, file);
  const pkg = JSON.parse(await readFile(packageFile,'utf8'));
  pkg.name = 'maisui-petshop-trial-accounts';
  pkg.scripts = {build:'node '+service+'/build-sites.mjs',preview:'wrangler dev --local --config dist/server/wrangler.json --persist-to .wrangler/state --ip 127.0.0.1 --inspector-port 0'};
  await writeFile(path.join(target, 'package.json'), json(pkg));

  const manifest = path.join(target, '.openai', 'hosting.json');
  let identity = {};
  try { identity = JSON.parse(await readFile(manifest,'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  delete identity.static;
  await mkdir(path.dirname(manifest), {recursive:true});
  await writeFile(manifest, json({...identity, d1:'DB', r2:null}));
  console.log('Prepared account service source at', target);
}

async function build() {
  const tools = createRequire(path.join(root,'package.json'))('esbuild');
  const { replaceOutputs } = await import('../../scripts/build-files.mjs');
  const hosting = JSON.parse(await readFile(path.join(root,'.openai/hosting.json'),'utf8'));
  if (hosting.static || hosting.d1 !== 'DB') throw Error('The account service needs a Worker with D1 binding DB.');
  await replaceOutputs(['dist'],async stage => {
    const dist = path.join(stage, 'dist'), server = path.join(dist, 'server');
    await mkdir(server, {recursive:true});
    await mkdir(path.join(dist,'client'));
    await mkdir(path.join(dist,'.openai'));
    const bundle = await tools.build({...options, outfile:path.join(server,'index.js')});
    for (const output of Object.values(bundle.metafile.outputs)) {
      for (const imported of output.imports) if (!externals.includes(imported.path)) {
        throw Error('Unresolved Worker runtime dependency: '+imported.path);
      }
    }
    const wrangler = {
      name:'maisui-petshop-trial-accounts',main:'index.js',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],
      assets:{binding:'ASSETS',directory:'../client',run_worker_first:true,not_found_handling:'none'},
      d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}],
    };
    await writeFile(path.join(server,'wrangler.json'),json(wrangler));
    await copyTo(dist,'.openai/hosting.json');
    await copyTo(dist,'drizzle','.openai/drizzle');
    const landing = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>麦穗宠物店 · 试玩账号服务</title><main><h1>麦穗宠物店</h1><p><a href="https://play.zhu-li-4212.xyz/petshop/">进入试玩，登录店铺</a></p></main></html>\n';
    await writeFile(path.join(dist,'client/index.html'),landing);
  });
  console.log('Built the account Worker, client and D1 migrations at', path.join(root,'dist'));
}

if (process.argv[2] === '--prepare' && (process.argv.length === 4 || process.argv.length === 6 && process.argv[4] === '--game-source')) {
  await prepare(path.resolve(process.argv[3]), process.argv[5] && path.resolve(process.argv[5]));
}
else if (process.argv.length === 2) await build();
else throw Error('Usage: node build-sites.mjs [--prepare <site-source-checkout> [--game-source <published-shared-directory>]]');
