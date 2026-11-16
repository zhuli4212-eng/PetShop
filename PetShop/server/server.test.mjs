import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPetShopServer } from './main.mjs';
import { GameStore } from './game-store.mjs';
import { GAME_EPOCH } from './show.mjs';
import { credentialPath } from './local-maintenance.mjs';

test('同一服务提供首页、开局快照和 Cocos 游戏文件', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'petshop-web-test-'));
  await writeFile(path.join(root, 'index.html'), '<title>宠物店</title>');
  await writeFile(path.join(root, '店内 100%.wasm'), Buffer.from([0, 97, 115, 109]));
  const server = createPetShopServer(root,{saveDirectory:path.join(root,'saves')});
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async()=>{
    await new Promise(resolve=>server.close(resolve));
    await rm(root,{recursive:true,force:true});
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  const health = await fetch(base + '/api/health');
  assert.deepEqual(await health.json(), { service: 'petshop', status: 'ok', protocol: 1, gameplay:1 });
  const origin = 'http://localhost:7456';
  const shop = await fetch(base + '/api/shop', { headers: { origin } });
  assert.equal(shop.headers.get('Access-Control-Allow-Origin'), origin);
  const state=await shop.json();
  assert.equal(state.name,'宠物店');assert.equal(state.coins,680);assert.ok(state.profileId);
  assert.equal(state.mode,'local_sim');assert.deepEqual(state.rooms,['rabbit']);
  assert.deepEqual(state.entrances,['rooms','login','market','profile','breed']);
  assert.equal(state.shopLevel,1);
  assert.deepEqual(state.featureAccess.orders,{name:'普通订单',requiredLevel:2,unlocked:false});
  const locked=await fetch(base+'/api/page',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({page:'orderDesk',args:{id:'unused',shopLevel:60}})});
  assert.equal(locked.status,403);assert.match((await locked.json()).error,/2 级/);
  const page = await fetch(base + '/?from=editor');
  assert.equal(await page.text(), '<title>宠物店</title>');
  assert.match(page.headers.get('content-type'), /text\/html/);
  const wasm = await fetch(base + '/' + encodeURIComponent('店内 100%.wasm'));
  assert.equal(wasm.headers.get('content-type'), 'application/wasm');
  assert.deepEqual(Buffer.from(await wasm.arrayBuffer()), Buffer.from([0, 97, 115, 109]));
  const head = await fetch(base + '/index.html', { method: 'HEAD' });
  assert.equal(Number(head.headers.get('content-length')), Buffer.byteLength('<title>宠物店</title>'));
  assert.equal(await head.text(), '');
  assert.equal((await fetch(base + '/missing.js')).status, 404);
  assert.equal((await fetch(base + '/api/shop', { method: 'POST' })).status, 405);
});

test('同机维护工具向已运行服务作废整期，重试及重启只退原额一次，关闭时落盘最后时刻',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'petshop-maint-'));
  const web=path.join(root,'web'),dir=path.join(root,'save'),maintenanceDirectory=path.join(root,'operator');
  await mkdir(web);
  let now=GAME_EPOCH, server;
  const clock={wall:()=>now,monotonic:()=>0};
  const store=new GameStore(dir,clock);
  t.after(async()=>{
    if(server?.listening)await new Promise(resolve=>server.close(resolve));
    await rm(root,{recursive:true,force:true});
  });
  store.shop();store.state.shopXp=30;store.state.createdAt=now-2*86400000;store.save(store.state);
  const owner=store.shop();
  const race=store.page('show.review',{mode:'private',event:'private-0',theme:'P01',pet:store.state.pets[0].id}).page.actions[0];
  store.act({type:race.type,args:race.args,requestId:'registered-before-void',profileId:owner.profileId,version:owner.version});
  server=createPetShopServer(web,{store,maintenanceDirectory});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  const endpoint='http://127.0.0.1:'+port+'/api/local-show-maintenance';
  const key=await readFile(credentialPath(maintenanceDirectory,port),'utf8');
  const post=(headers,body)=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await post({}, {command:'list'})).status,403);
  assert.equal((await post({Authorization:'Bearer '+key,Origin:'http://127.0.0.1:'+port},{command:'list'})).status,403);
  const cli=(...args)=>promisify(execFile)(process.execPath,[fileURLToPath(new URL('../tools/maintain-show.mjs',import.meta.url)),...args],{
    env:{...process.env,PETSHOP_MAINTENANCE_DIR:maintenanceDirectory,PETSHOP_PORT:String(port)},
  });
  assert.match((await cli('list')).stdout,/private-0/);
  assert.equal(store.state.coins,660);
  assert.match((await cli('void','private-0','测试赛表错误')).stdout,/退还原报名费 20 金币/);
  assert.match((await cli('void','private-0','再次执行')).stdout,/测试赛表错误/);
  assert.equal(store.state.coins,680);
  await cli('void','public-0','公开期作废');
  assert.throws(()=>store.act({type:race.type,args:{...race.args,mode:'public',event:'public-0',theme:'O01'},
    requestId:'cannot-enter-void-round',profileId:owner.profileId,version:store.shop().version}),/作废/);
  now+=1234;
  await new Promise(resolve=>server.close(resolve));
  assert.equal(JSON.parse(await readFile(store.file,'utf8')).clock,now);
  now=GAME_EPOCH+6*86400000;
  const restored=new GameStore(dir,clock);restored.shop();
  assert.equal(restored.state.show.voids['private-0'].refund,20);
  assert.equal(restored.state.show.voids['public-0'].refund,0);
  assert.equal(restored.state.show.entries['private-0'].outcome,undefined);
  assert.equal(restored.state.coins,680);assert.deepEqual(restored.state.show.cups,{});
  assert.ok(restored.page('show.archive',{}).page.rows.some(r=>/技术作废/.test(r.title)&&!r.link));
  assert.equal(restored.page('show.board',{event:'public-0'}).page.rows.length,0);
  assert.throws(()=>restored.maintainShow('void','private-99','未来赛期'),/本期/);
  assert.throws(()=>restored.act({type:'show.void',args:{},requestId:'player-cannot-void',profileId:owner.profileId,
    version:restored.shop().version}),/未识别/);
});
