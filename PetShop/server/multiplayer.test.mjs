import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createMultiplayerServer } from './multiplayer.mjs';

const webEntry='<!doctype html><html><head><script src="/index.js"></script></head><body>隔离店铺</body></html>';

async function fixture(t,publicOrigin) {
  const dir=await mkdtemp(path.join(tmpdir(),'petshop-multiplayer-http-'));
  const webRoot=path.join(dir,'www');
  await mkdir(webRoot);
  await writeFile(path.join(webRoot,'index.html'),webEntry);
  await writeFile(path.join(webRoot,'index.js'),'/* multiplayer fixture */');
  let server,base;
  const stop=async()=>{
    if(!server?.listening)return;
    const closed=new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    server.closeIdleConnections();
    await closed;
  };
  async function start(){
    server=createMultiplayerServer({dataDirectory:path.join(dir,'data'),webRoot,publicOrigin});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    base='http://127.0.0.1:'+server.address().port;
  }
  t.after(async()=>{await stop();await rm(dir,{recursive:true,force:true});});
  await start();
  const request=(route,{data,cookie,origin,method,headers}={})=>{
    const verb=method||(data===undefined?'GET':'POST');
    return fetch(base+route,{method:verb,redirect:'manual',
      headers:{...(cookie&&{Cookie:cookie}),...(data!==undefined&&{'Content-Type':'application/json'}),
        ...(verb==='POST'&&origin!==null&&{Origin:origin??base}),...headers},
      ...(data!==undefined&&{body:JSON.stringify(data)})});
  };
  return {request,restart:async()=>{await stop();await start();},webRoot};
}
const cookieOf=res=>res.headers.get('set-cookie')?.split(';')[0];

test('两个账号的签到、名册、操作回执和心跳只使用各自的经营档；重启后仍可续店',async t=>{
  const f=await fixture(t),r=f.request;
  assert.equal((await r('/')).headers.get('location'),'/login');
  assert.equal((await r('/api/shop')).status,401);
  assert.equal((await r('/auth/login',{data:{username:'未登记的名字'}})).status,404);
  const [a,b]=await Promise.all(['月兔','松果'].map(username=>r('/auth/register',{data:{username}})));
  assert.equal(a.status,200);assert.equal(b.status,200);
  const alice=cookieOf(a),bob=cookieOf(b);
  assert.notEqual(alice,bob);
  assert.match(a.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(a.headers.get('set-cookie'),/; Secure/);
  assert.equal((await r('/auth/register',{data:{username:'月兔'}})).status,409);
  const getShop=async cookie=>(await r('/api/shop',{cookie})).json();
  const page=async(cookie,page,args={})=>(await r('/api/page',{cookie,data:{page,args}})).json();
  const sa=await getShop(alice),sb=await getShop(bob);
  assert.notEqual(sa.profileId,sb.profileId);assert.equal(sa.coins,680);assert.equal(sb.coins,680);
  const command={requestId:'welcome-checkin-alpha',profileId:sa.profileId,version:sa.version,type:'care.checkin',args:{}};
  assert.equal((await r('/api/action',{cookie:bob,data:command})).status,409);
  const success=await r('/api/action',{cookie:alice,data:command});
  assert.equal(success.status,200);
  assert.equal((await r('/api/receipts/'+command.requestId,{cookie:alice})).status,200);
  assert.equal((await r('/api/receipts/'+command.requestId,{cookie:bob})).status,404);
  assert.equal((await page(alice,'rooms')).page.presentation.count,4);
  assert.equal((await page(bob,'rooms')).page.presentation.count,2);
  const heartbeat={clientId:'mp-handset',foreground:true,reader:{profileId:sa.profileId,seq:1,read:['opening']}};
  assert.equal((await r('/api/heartbeat',{cookie:bob,data:heartbeat})).status,409);
  assert.equal((await r('/api/heartbeat',{cookie:alice,data:heartbeat})).status,200);
  assert.match((await page(alice,'login')).page.subtitle,/多人.*月兔/);
  const handoff=await r('/api/page',{cookie:alice,data:{page:'multiplayerAccount'}});
  assert.equal(handoff.headers.get('x-petshop-account'),'switch');
  assert.equal((await r('/api/page',{cookie:alice,data:{page:'rooms'}})).headers.has('x-petshop-account'),false);
  const html=await (await r((await a.json()).entry,{cookie:alice})).text();
  assert.match(html,/auth\/game-account\.js/);
  assert.equal(await readFile(path.join(f.webRoot,'index.html'),'utf8'),webEntry);
  assert.equal((await r('/index.js',{cookie:alice})).status,200);
  await f.restart();
  assert.equal((await getShop(alice)).profileId,sa.profileId);
  assert.equal((await page(alice,'rooms')).page.presentation.count,4);
  assert.equal((await getShop(bob)).profileId,sb.profileId);
  const another=cookieOf(await r('/auth/login',{data:{username:'月兔'}}));
  assert.notEqual(another,alice);
  assert.equal((await getShop(another)).profileId,sa.profileId);
  const switched=cookieOf(await r('/auth/login',{cookie:alice,data:{username:'松果'}}));
  assert.equal((await getShop(switched)).profileId,sb.profileId);
  assert.equal((await r('/api/shop',{cookie:alice})).status,401);
  assert.equal((await r('/auth/logout',{cookie:switched,data:{}})).status,200);
  assert.equal((await r('/api/shop',{cookie:switched})).status,401);
  assert.equal((await r('/api/shop',{cookie:bob})).status,200);
});

test('每次进入需手动确认，短时许可绑定当前会话且并发也只消费一次，旧标签不能操作另一店',async t=>{
  const {request:r,restart}=await fixture(t);
  async function sign(route,username,cookie){
    const res=await r('/auth/'+route,{data:{username},cookie});
    assert.equal(res.status,200);
    const data=await res.json();
    assert.match(data.entry,/^\/play\?entry=[\w-]+$/);
    return {...data,cookie:cookieOf(res)};
  }
  async function needsLogin(path,cookie,method){
    const res=await r(path,{cookie,method});
    assert.equal(res.status,303);assert.equal(res.headers.get('location'),'/login');
    assert.equal(res.headers.get('cache-control'),'no-store');
  }
  const alice=await sign('register','西街兔A'),other=await sign('login','西街兔A');
  for(const url of ['/','/index.html?from=bookmark','/play'])await needsLogin(url,alice.cookie);
  assert.deepEqual(await (await r('/auth/session',{cookie:alice.cookie})).json(),{authenticated:true,username:'西街兔A'});
  await needsLogin(alice.entry,other.cookie);await needsLogin(alice.entry,undefined);
  await needsLogin(alice.entry,alice.cookie,'HEAD');
  const admitted=await Promise.all([r(alice.entry,{cookie:alice.cookie}),r(alice.entry,{cookie:alice.cookie})]);
  assert.deepEqual(admitted.map(x=>x.status).sort(),[200,303]);
  const html=await admitted.find(x=>x.status===200).text();
  const account=html.match(/<head><meta name="petshop-game-account" content="([\w-]+)"><script src="\/auth\/game-account\.js"><\/script><script src="\/index\.js">/i)?.[1];
  assert.ok(account,'游戏首次发送请求之前已绑定店主');
  await needsLogin(alice.entry,alice.cookie);
  const manual=await sign('login',' 西街兔a ',alice.cookie),nextTab=await sign('login','西街兔Ａ',alice.cookie);
  assert.equal(manual.username,'西街兔A');assert.equal(manual.cookie,alice.cookie);assert.equal(nextTab.cookie,alice.cookie);
  assert.notEqual(manual.entry,nextTab.entry);
  for(const url of [manual.entry,nextTab.entry])assert.equal((await r(url,{cookie:alice.cookie})).status,200);

  const bob=await sign('register','北街猫B',alice.cookie);
  await needsLogin(alice.entry,bob.cookie);
  assert.equal((await r('/api/shop',{cookie:alice.cookie})).status,401);
  const oldTab={'X-PetShop-Game-Account':account};
  assert.equal((await r('/api/shop',{cookie:bob.cookie,headers:oldTab})).status,401);
  const shop=await (await r('/api/shop',{cookie:bob.cookie})).json();
  const requestId='stale-shop-checkin-test';
  const claim={requestId,profileId:shop.profileId,version:shop.version,type:'care.checkin',args:{}};
  assert.equal((await r('/api/action',{cookie:bob.cookie,headers:oldTab,data:claim})).status,401);
  assert.equal((await r('/api/receipts/'+requestId,{cookie:bob.cookie})).status,404);
  assert.equal((await r('/api/shop',{cookie:other.cookie,headers:oldTab})).status,200);
  const accountB=(await (await r(bob.entry,{cookie:bob.cookie})).text()).match(/petshop-game-account" content="([\w-]+)"/)?.[1];
  assert.ok(accountB);assert.notEqual(accountB,account);
  assert.equal((await r('/api/action',{cookie:bob.cookie,headers:{'X-PetShop-Game-Account':accountB},data:claim})).status,200);
  const pending=await sign('login','北街猫B',bob.cookie);
  await restart();
  await needsLogin(pending.entry,bob.cookie);
  assert.equal((await (await r('/auth/session',{cookie:bob.cookie})).json()).username,'北街猫B');
  const expiring=await sign('login','北街猫B',bob.cookie);
  const future=Date.now()+61_000;
  const clock=t.mock.method(Date,'now',()=>future);
  await needsLogin(expiring.entry,bob.cookie);
  clock.mock.restore();
  const abandoned=await sign('login','北街猫B',bob.cookie);
  assert.equal((await r('/auth/logout',{cookie:bob.cookie,data:{}})).status,200);
  await needsLogin(abandoned.entry,bob.cookie);
});

test('公网启动等待固定来源，Cookie 带 Secure，来路和多人路由按配置限制',async t=>{
  let address=null;
  const r=(await fixture(t,()=>address)).request;
  assert.equal((await r('/api/health')).status,503);
  address='https://market.example';
  const page=await r('/login?switch');
  assert.equal(page.status,200);
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.match(page.headers.get('content-security-policy'),/media-src 'self'/);
  const login=await page.text();
  assert.match(login,/id="shop-name">麦穗宠物店/);
  assert.match(login,/id="login-music" src="\/auth\/login-music\.mp3"/);
  const music=await r('/auth/login-music.mp3');
  assert.equal(music.status,200);
  assert.equal(music.headers.get('content-type'),'audio/mpeg');
  const clip=new Uint8Array(await music.arrayBuffer());
  assert.ok(clip.byteLength>10_000);
  const range=await r('/auth/login-music.mp3',{headers:{Range:'bytes=0-1'}});
  assert.equal(range.status,206);
  assert.equal(range.headers.get('content-range'),'bytes 0-1/'+clip.byteLength);
  assert.deepEqual(new Uint8Array(await range.arrayBuffer()),clip.subarray(0,2));
  for(const asset of ['/auth/login.css','/auth/login.js','/auth/game-account.js','/auth/shopfront.png'])
    assert.equal((await r(asset)).status,200);
  const form={data:{username:'试用店铺'}};
  assert.equal((await r('/auth/register',{...form,origin:null})).status,403);
  assert.equal((await r('/auth/register',{...form,origin:'https://elsewhere.example',
    headers:{'X-Forwarded-Host':'elsewhere.example','X-Forwarded-Proto':'https'}})).status,403);
  const signup=await r('/auth/register',{...form,origin:address});
  assert.equal(signup.status,200);
  assert.match(signup.headers.get('set-cookie'),/^__Host-petshop-mp=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/);
  const cookie=cookieOf(signup);
  for(const route of ['/api/local-show-maintenance','/api/import','/multiplayer.sqlite'])
    assert.equal((await r(route,{cookie})).status,404);
  assert.equal((await r('/auth/logout',{cookie,data:{},origin:null})).status,403);
  const session=await (await r('/auth/session',{cookie})).json();
  assert.deepEqual(session,{authenticated:true,username:'试用店铺'});
  address='https://changed.example';
  assert.equal((await r('/auth/login',{...form,origin:address})).status,403);
  assert.equal((await r('/auth/login',{...form,origin:'https://market.example'})).status,200);
});

test('同名登录的限速能跨进程重启，不影响同来源的其他账号',async t=>{
  const f=await fixture(t),r=f.request;
  for(let i=0;i<60;i++)
    assert.equal((await r('/auth/login',{data:{username:'测试限速'}})).status,404);
  await f.restart();
  const limited=await r('/auth/login',{data:{username:'测试限速'}});
  assert.equal(limited.status,429);
  assert.ok(Number(limited.headers.get('retry-after'))>0);
  assert.equal((await r('/auth/register',{data:{username:'不同的名字'}})).status,200);
});
