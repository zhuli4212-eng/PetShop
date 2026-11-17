// Run from any directory after building. PETSHOP_TEST_RUNTIME may point at an isolated
// npm checkout containing Miniflare; no Cloudflare account or network service is used.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RequestGameStore } from '../shared/request-store.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(process.env.PETSHOP_TEST_RUNTIME?path.resolve(process.env.PETSHOP_TEST_RUNTIME,'package.json'):import.meta.url);
const {Miniflare}=process.env.PETSHOP_TEST_RUNTIME?require('miniflare'):createRequire(require.resolve('wrangler'))('miniflare');
const state=await mkdtemp(path.join(tmpdir(),'petshop-cloud-regression-'));
if(path.dirname(path.resolve(state))!==path.resolve(tmpdir())||!path.basename(state).startsWith('petshop-cloud-regression-'))throw Error('Unexpected temporary directory');
const tester='petshop-local-tester',owner='petshop-local-owner';
const importKey=randomUUID();
let runtime;
async function start(){
  runtime=new Miniflare({
    name:'petshop-cloud-test',modules:true,scriptPath:path.join(root,'dist/server/index.js'),host:'127.0.0.1',port:0,
    compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:{PETSHOP_MIGRATION_KEY:importKey},
    d1Databases:['DB'],d1Persist:path.join(state,'d1'),
    assets:{directory:path.join(root,'dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}}
  });
  return String(await runtime.ready);
}
async function api(url,who,route,input){
  const headers={};
  if(who)headers['oai-authenticated-user-id']=who;
  if(input!==undefined)headers['content-type']='application/json';
  const res=await fetch(new URL('/api/'+route,url),{method:input===undefined?'GET':'POST',headers,
    body:input===undefined?undefined:JSON.stringify(input),redirect:'manual'});
  const data=await res.text();
  return {status:res.status,body:data&&res.headers.get('content-type')?.includes('application/json')?JSON.parse(data):{error:data.slice(0,600)}};
}
async function accepted(url,who,route,input){
  const r=await api(url,who,route,input);
  assert.equal(r.status,200,route+': '+JSON.stringify(r.body?.error));return r.body;
}
async function runBrowser(url){
  const proc=spawn(process.env.PYTHON||'python',['-B',path.join(root,'tests/check-mobile.py'),url],{stdio:'inherit',windowsHide:true});
  await new Promise((resolve,reject)=>{proc.on('error',reject);proc.on('close',code=>code===0?resolve():reject(Error('Mobile test exited '+code)));});
}
async function checkLegacyParents(url,db) {
  let now=Date.now()-180000;
  const game=new RequestGameStore(null,{wall:()=>now,monotonic:()=>0});
  game.state.shopXp=1000;
  const [mother,father]=game.state.pets.map(p=>p.id);
  const act=(type,args)=>{
    const {profileId,version}=game.shop();
    return game.act({type,args,requestId:randomUUID(),profileId,version});
  };
  for(const id of [mother,father])act('care.retain',{id,retained:true});
  act('care.breed',{species:'rabbit',mother,father});
  now+=120001;
  game.shop();
  act('care.retain',{id:father,retained:true});
  const legacy=game.snapshot();
  legacy.state.pets.find(p=>p.id===mother).retained=true;
  delete legacy.state.care.parentRetentionChecked;
  const who='petshop-old-breeding-test',account='player:'+who;
  await db.prepare('INSERT INTO cloud_shops(account_id,revision,snapshot) VALUES (?,1,?)').bind(account,JSON.stringify(legacy)).run();
  const market=(await accepted(url,who,'page',{page:'market',args:{filter:'种源'}})).page;
  assert.deepEqual(market.rows.map(row=>row.link.args.id),[father]);
  const litter=(await accepted(url,who,'page',{page:'litter',args:{species:'rabbit'}})).page;
  const newborns=legacy.state.rooms.rabbit.lastLitter.ids;
  assert.deepEqual(litter.rows.filter(row=>newborns.includes(row.animal?.id)).map(row=>row.animal.id),newborns);
  assert.equal(litter.animals.length,newborns.length);
  const row=await db.prepare('SELECT snapshot FROM cloud_shops WHERE account_id=?').bind(account).first();
  const saved=JSON.parse(row.snapshot).state;
  assert.deepEqual(saved.pets.map(p=>p.id),legacy.state.pets.map(p=>p.id));
  assert.equal(saved.coins,legacy.state.coins);
  assert.deepEqual(saved.sales,legacy.state.sales);
  assert.equal(saved.pets.find(p=>p.id===mother).retained,false);
}
try {
  let url=await start();
  const db=await runtime.getD1Database('DB');
  const migrationDir=path.join(root,'drizzle');
  const migrations=(await readdir(migrationDir)).filter(file=>file.endsWith('.sql')).sort();
  assert.ok(migrations.length,'Expected at least one D1 migration');
  for(const file of migrations){
    const sql=await readFile(path.join(migrationDir,file),'utf8');
    for(const statement of sql.split(/--> statement-breakpoint|;\s*(?:\r?\n|$)/).map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
  }
  const anonymous=await api(url,null,'shop');
  assert.ok([401,403].includes(anonymous.status),'Anonymous shop status '+anonymous.status+' '+JSON.stringify(anonymous.body?.error));
  const legacy=new RequestGameStore().snapshot().state;
  delete legacy.visitBook.tutorial;
  legacy.coins=1777;
  legacy.pets[0].retained=true;
  const transfer=key=>fetch(new URL('/internal/import',url),{method:'POST',headers:{
    'content-type':'application/json','authorization':'Bearer '+key},body:JSON.stringify(legacy)});
  assert.equal((await transfer('incorrect-local-test-value')).status,404);
  assert.equal((await transfer(importKey)).status,201);
  assert.equal((await transfer(importKey)).status,409);
  const other=await accepted(url,owner,'shop'),shop=await accepted(url,tester,'shop');
  await checkLegacyParents(url,db);
  assert.equal(other.profileId,legacy.profileId);
  assert.equal(other.coins,1777);
  assert.notEqual(shop.profileId,other.profileId);
  assert.equal(other.tutorial,undefined);
  const handbook=(await accepted(url,owner,'page',{page:'tutorial',args:{}})).page;
  assert.equal(handbook.presentation.archived,true);
  assert.deepEqual(handbook.actions.map(action=>action.type),['ui.back']);
  assert.equal(shop.tutorial.step,1);
  const parentId=sex=>legacy.pets.find(p=>p.sex===sex).id;
  const pair=(await accepted(url,owner,'page',{page:'breed',args:{species:'rabbit',mother:parentId('母'),father:parentId('公')}})).page;
  assert.equal(pair.presentation.kind,'pairConfirm');
  assert.equal(pair.presentation.mutationPreview.fields.length,5);
  const {defectPercent,perfectPercent}=pair.presentation.mutationPreview.defect;
  assert.equal(defectPercent,2);
  assert.equal(perfectPercent,5);
  assert.ok(pair.actions.some(action=>action.label==='不使用指导单'&&action.active&&action.args.guide===-1));
  for (const page of ['market','sale']) {
    const args=page==='sale'?{channel:'market',species:'rabbit',filter:'种源'}:{filter:'种源'};
    const result=(await accepted(url,owner,'page',{page,args})).page;
    assert.deepEqual(result.filters[0].map(option=>option.label),['全部','种源','未繁育']);
    assert.deepEqual(result.filters[1].map(option=>option.label),['全部','幼年','成长','成年','老年','已故']);
    assert.equal(result.rows.length,1);
    assert.equal(result.rows[0].visual.name,legacy.pets[0].name);
    assert.ok(result.rows[0].visual.blockedReason.includes('种源'));
    assert.equal(result.rows[0].select,undefined);
    assert.equal(result.visual.eligibleCount,0);
  }
  const players=async who=>(await accepted(url,who,'page',{page:'rooms',args:{species:'rabbit'}})).page.rows.filter(r=>r.animal).length;
  assert.equal(await players(tester),2);
  const cmd={requestId:'cloud-concurrent-checkin',profileId:shop.profileId,version:shop.version,type:'care.checkin',args:{}};
  const duplicates=await Promise.all(Array.from({length:6},()=>accepted(url,tester,'action',cmd)));
  for(const result of duplicates)assert.deepEqual(result,duplicates[0]);
  assert.equal(await players(tester),4);
  const room = async args => (await accepted(url,tester,'page',{page:'rooms',args:{species:'rabbit',...args}})).page;
  const roster = await room({});
  assert.deepEqual(roster.filters[0].map(option=>option.label), ['全部','种源','未繁育']);
  assert.deepEqual(roster.filters[1].map(option=>option.label), ['全部','幼年','成长','成年','老年','已故']);
  const young = await room({filter:'未繁育',stage:'幼年'});
  const expected = roster.rows.flatMap(row=>row.animal?.stage==='幼年' && row.animal.status==='未繁育' ? [row.animal.id] : []);
  assert.equal(expected.length,2);
  assert.deepEqual(young.presentation.residents.map(p=>p.id),expected);
  assert.deepEqual((await room({stage:'已故'})).presentation.residents,[]);
  assert.equal((await accepted(url,tester,'shop')).coins,680);
  assert.equal(await players(owner),2);
  assert.deepEqual(await accepted(url,tester,'receipts/'+cmd.requestId),duplicates[0]);
  assert.equal((await api(url,owner,'receipts/'+cmd.requestId)).status,404);
  assert.ok([403,404,405].includes((await api(url,tester,'local-show-maintenance',{command:'list'})).status));
  await runtime.dispose();runtime=undefined;
  url=await start();
  assert.equal((await accepted(url,tester,'shop')).profileId,shop.profileId);
  assert.equal(await players(tester),4);
  assert.deepEqual(await accepted(url,tester,'receipts/'+cmd.requestId),duplicates[0]);
  console.log('Cloud API passed: one-time save import, independent players, concurrent idempotency, exact receipts, D1 restart and local maintenance isolation.');
  await runBrowser(url);
} finally {
  if(runtime)await runtime.dispose();
  await rm(state,{recursive:true,force:true});
}
