import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root, replaceOutputs } from './build-files.mjs';

const manifestFile=path.join(root,'.openai/hosting.json');
const hosting=JSON.parse(await readFile(manifestFile,'utf8'));
if(hosting.static||hosting.d1!=='DB')throw Error('This Worker requires a DB binding and a Worker hosting manifest.');
const migrationDir=path.join(root,'drizzle');
if(!(await readdir(migrationDir)).some(name=>name.endsWith('.sql')))throw Error('Missing schema migrations in drizzle/');
await readFile(path.join(migrationDir,'meta/_journal.json'),'utf8');
await readFile(path.join(root,'client/index.html'),'utf8');

await replaceOutputs(['dist'],async stage=>{
  const dist=path.join(stage,'dist'),server=path.join(dist,'server'),metadata=path.join(dist,'.openai');
  await mkdir(server,{recursive:true});
  await mkdir(metadata);
  await cp(path.join(root,'client'),path.join(dist,'client'),{recursive:true});
  await cp(manifestFile,path.join(metadata,'hosting.json'));
  await cp(migrationDir,path.join(metadata,'drizzle'),{recursive:true});
  const result=await build({
    absWorkingDir:root,entryPoints:['server/worker-entry.mjs'],outfile:path.join(server,'index.js'),
    bundle:true,format:'esm',platform:'neutral',target:'es2022',charset:'utf8',metafile:true,
    external:['node:crypto','node:buffer','cloudflare:workers'],
  });
  const imports=Object.values(result.metafile.outputs).flatMap(output=>output.imports.map(i=>i.path));
  if(imports.some(name=>!['node:crypto','node:buffer','cloudflare:workers'].includes(name))){
    throw Error('Unexpected module dependency in the deployed Worker: '+imports.join(', '));
  }
  const wrangler={
    name:'maisui-petshop-game',main:'index.js',compatibility_date:'2026-05-15',
    compatibility_flags:['nodejs_compat'],
    assets:{binding:'ASSETS',directory:'../client',run_worker_first:true,not_found_handling:'none'},
    d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}],
  };
  // Sites provisions the production DB from hosting.json. This ID is the starter's local preview placeholder.
  await writeFile(path.join(server,'wrangler.json'),JSON.stringify(wrangler,null,2)+'\n');
});
console.log('Built the Web Mobile client and bundled Worker with D1 migration metadata.');
