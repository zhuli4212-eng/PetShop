import assert from 'node:assert/strict';
import { cp, lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { root, replaceOutputs } from './build-files.mjs';

const game=path.resolve(process.argv[2]||path.join(root,'../PetShop'));
const clientFiles=['assets','cocos-js','src','application.js','index.html','index.js','style.css'];
const editorFiles=['assets','settings','package.json','tsconfig.json','tools/build-web-mobile.json'];
const sharedFiles=[
  'request-store.mjs','shop-engine.mjs','care.mjs','defect.mjs','pet-names.mjs','care-pages.mjs','business.mjs',
  'research-effects.mjs','show.mjs','shop-features.mjs','shop-progression.mjs','visit-book.mjs',
  'shop-feature-levels.json','show-events.json',
];

async function copyAllowed(source,target,names) {
  for(const name of names) {
    const from=path.join(source,name),to=path.join(target,name);
    await mkdir(path.dirname(to),{recursive:true});
    await cp(from,to,{recursive:true,filter:async file=>{
      const stat=await lstat(file);
      if(!stat.isFile()&&!stat.isDirectory())throw Error('Unexpected link or special file in game inputs: '+file);
      return true;
    }});
  }
}

const backend=path.join(game,'server');
const csv=(await readFile(path.join(backend,'show-events.csv'),'utf8')).trim().split(/\r?\n/).slice(1);
const events=csv.map(line=>{
  const [id,name,...cells]=line.split(',');
  return {id,name,targets:cells.slice(0,6),weights:cells.slice(6).map(Number)};
});
const eventJson=JSON.parse(await readFile(path.join(backend,'show-events.json'),'utf8'));
assert.deepEqual(eventJson,events,'The bundled event configuration differs from the designer CSV');
const web=path.join(game,'build/web-mobile');
assert.deepEqual((await readdir(web)).sort(),[...clientFiles].sort(),'Unexpected Web Mobile build layout');

await replaceOutputs(['client','shared','cocos-source'],async stage=>{
  await copyAllowed(web,path.join(stage,'client'),clientFiles);
  await copyAllowed(backend,path.join(stage,'shared'),sharedFiles);
  await copyAllowed(game,path.join(stage,'cocos-source'),editorFiles);
});
console.log('Synchronized the official Web Mobile build, Cocos project sources and '+sharedFiles.length+' game modules/configurations.');
