import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import worker from './worker.mjs';
import {RequestGameStore} from '../../PetShop/server/request-store.mjs';
import {makePet} from '../../PetShop/server/care.mjs';
import {GAME_EPOCH,showPage} from '../../PetShop/server/show.mjs';
import {openOnlineShows} from './online-shows.mjs';

const DAY=86400000,HOUR=3600000,base=GAME_EPOCH+14*DAY+HOUR;
const hash=s=>createHash('sha256').update(s).digest('hex');
async function fixture(t) {
  const folder=await mkdtemp(path.join(tmpdir(),'petshop-shared-shows-'));
  await copyFile(new URL('../aliyun/sqlite.mjs',import.meta.url),path.join(folder,'sqlite.mjs'));
  await copyFile(new URL('./schema.sql',import.meta.url),path.join(folder,'schema.sql'));
  const {openAccountDatabase}=await import(pathToFileURL(path.join(folder,'sqlite.mjs')));
  const filename=path.join(folder,'isolated.sqlite');let db=openAccountDatabase(filename),now=base;
  t.mock.method(Date,'now',()=>now);
  t.after(async()=>{db.close();await rm(folder,{recursive:true,force:true,maxRetries:3});});
  function actor(name,grade='S+') {
    const g=new RequestGameStore(null,{wall:()=>now,onboarding:false}),s=g.state;
    s.createdAt=now-20*DAY;s.coins=10000;s.shopXp=30000;s.visitBook.opening=false;
    for(const species of ['cat','dog'])s.rooms[species]=structuredClone(s.rooms.rabbit);
    s.pets=['rabbit','cat','dog'].map((species,i)=>makePet(new Set(),species,['angora','british','shiba'][i],'公',now-DAY,'验收样本'));
    for(const p of s.pets)p.traits.forEach(trait=>{trait.grade=grade;});
    const a={id:randomUUID(),username:name,token:randomBytes(32).toString('base64url')};
    db.prepare('INSERT INTO trial_accounts(id,name_key,username,snapshot) VALUES(?,?,?,?)').bind(a.id,name,name,JSON.stringify(g.snapshot())).run();
    db.prepare('INSERT INTO trial_sessions(digest,account_id,expires_at) VALUES(?,?,?)').bind(hash(a.token),a.id,now+90*DAY).run();
    return a;
  }
  async function api(a,route,data,status=200) {
    const response=await worker.fetch(new Request('https://play.zhu-li-4212.xyz/petshop-api/v1/'+route,{method:data?'POST':'GET',
      headers:{Origin:'https://play.zhu-li-4212.xyz','Content-Type':'application/json',Authorization:'Bearer '+a.token},body:data&&JSON.stringify(data)}),{DB:db});
    const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result;
  }
  async function review(a) {
    const home=await api(a,'page',{page:'show',args:{mode:'public'}});
    const row=home.page.rows.find(row=>row.visual?.mode==='public'&&row.link);
    const round=await api(a,'page',{page:row.link.page,args:row.link.args});
    const animal=round.page.rows.find(row=>row.animal);assert.ok(animal,JSON.stringify(round));
    return api(a,'page',{page:'show.review',args:animal.link.args});
  }
  function command(review,requestId=randomUUID()) {
    const action=review.page.actions.find(a=>a.type==='show.enter');assert.ok(action);
    return {...action,profileId:review.shop.profileId,version:review.shop.version,requestId};
  }
  return {actor,api,review,command,clock:n=>{now=n;},get db(){return db;},
    restart:()=>{db.close();db=openAccountDatabase(filename,{requireExisting:true});},
    snapshot:a=>JSON.parse(db.prepare('SELECT snapshot FROM trial_accounts WHERE id=?').bind(a.id).first().snapshot)};
}
const safe=value=>assert.doesNotMatch(JSON.stringify(value),/coreAttribute|rootSeed|"rules"|抽签|承诺|种子|模拟选手|本地模拟|本地测试/);

test('正式玩家共用赛期与隐藏核心，旧档启用新私人赛且不泄露模拟抽签或隐藏规则',async t=>{
  const f=await fixture(t),a=f.actor('甲店'),b=f.actor('乙店');
  const x=await f.review(a),y=await f.review(b);safe(x);safe(y);
  assert.equal(x.page.actions[0].args.event,y.page.actions[0].args.event);
  assert.equal(x.page.actions[0].args.theme,y.page.actions[0].args.theme);
  assert.equal(f.db.prepare('SELECT count(*) n FROM petshop_public_rounds').first().n,1);
  assert.equal(f.snapshot(a).state.show.scoringVersion,2);
  assert.deepEqual(f.snapshot(a).state.show.activePrivate.choices.map(t=>t.rules.attributes.length),[1,3,5]);
  assert.equal(x.page.actions[0].args.event,'online-public-2');
  const before=await f.api(a,'page',{page:'show.board',args:{event:x.page.actions[0].args.event}});safe(before);assert.equal(before.page.rows.length,0);
  const account=await f.api(a,'page',{page:'login',args:{}});
  assert.equal(account.page.subtitle,'店主账号 · 甲店');
  assert.doesNotMatch(JSON.stringify(account.page),/试玩|测试|模拟支付/);
  assert.ok(account.page.actions.every(a=>a.page!=='payment'));
  const legacy=await f.api(a,'page',{page:'show.board',args:{event:'public-1'}});safe(legacy);
});

test('并发重试仅提交一次，报名快照与共享榜事务一致；跨店真实同分、无模拟补位、重启离线结算不重发',async t=>{
  const f=await fixture(t),a=f.actor('甲店'),b=f.actor('乙店'),low=f.actor('低分店','E');
  const review=await f.review(a),cmd=f.command(review);
  const [first,retry]=await Promise.all([f.api(a,'action',cmd),f.api(a,'action',cmd)]);assert.deepEqual(first,retry);
  for(const owner of [b,low])await f.api(owner,'action',f.command(await f.review(owner)));
  assert.equal(f.db.prepare('SELECT count(*) n FROM petshop_public_entries').first().n,3);
  const event=cmd.args.event;
  const round=JSON.parse(f.db.prepare('SELECT snapshot FROM petshop_public_rounds WHERE id=?').bind(event).first().snapshot);
  f.clock(round.result);f.restart();
  const boards=await Promise.all([a,b].map(owner=>f.api(owner,'page',{page:'show.board',args:{event}})));
  safe(boards[0]);assert.deepEqual(boards[0].page,boards[1].page);
  assert.match(boards[0].page.subtitle,/参赛 3 位 · 过线 2 位/);
  assert.equal(boards[0].page.rows[0].text,'2 位');
  const list=await f.api(a,'page',{page:'show.tier',args:{event,tier:'all'}});safe(list);
  assert.equal(list.page.rows.length,3);assert.ok(list.page.rows.every(row=>!JSON.stringify(row).includes('模拟')));
  for(const owner of [a,b,low])await f.api(owner,'shop');
  const states=[a,b,low].map(owner=>f.snapshot(owner).state);
  for(const s of states.slice(0,2)){assert.equal(s.show.entries[event].outcome.tieRank,1);assert.equal(s.show.entries[event].outcome.tieSize,2);assert.equal(s.show.entries[event].outcome.tier,'laurel');assert.equal(s.coins,10020);}
  assert.equal(states[2].show.entries[event].outcome.tier,null);assert.equal(states[2].coins,10000);
  f.clock(round.payout+DAY);f.restart();
  for(const owner of [a,b,low]){
    const once=await f.api(owner,'shop'),twice=await f.api(owner,'shop');assert.equal(once.coins,twice.coins);
    assert.equal(f.snapshot(owner).state.show.entries[event].cashClosed,true);
  }
  assert.deepEqual(await f.api(a,'receipts/'+cmd.requestId),first);
});

test('共享报名写入失败整笔回滚，不能只扣费／占用本轮；截止后与旧模拟接口均拒绝报名',async t=>{
  const f=await fixture(t),a=f.actor('事务验收');
  const view=await f.review(a),cmd=f.command(view),before=f.snapshot(a);
  f.db.prepare("CREATE TRIGGER reject_shared BEFORE INSERT ON petshop_public_entries BEGIN SELECT RAISE(ABORT,'forced failure'); END").run();
  await f.api(a,'action',cmd,503);assert.deepEqual(f.snapshot(a),before);
  f.db.prepare('DROP TRIGGER reject_shared').run();
  await f.api(a,'action',cmd);
  const b=f.actor('截止验收'),preview=await f.review(b),late=f.command(preview);
  const round=JSON.parse(f.db.prepare('SELECT snapshot FROM petshop_public_rounds WHERE id=?').bind(late.args.event).first().snapshot);
  f.clock(round.close);
  await f.api(b,'action',late,409);
  const current=await f.api(b,'shop');
  await f.api(b,'action',{...late,requestId:randomUUID(),version:current.version,args:{...late.args,event:'public-2'}},409);
  assert.equal(f.db.prepare('SELECT count(*) n FROM petshop_public_entries').first().n,1);
});

test('未到正式首期开赛时展示既有周赛时间，不混入旧模拟赛；已报名私人赛原快照继续结算',async t=>{
  const f=await fixture(t);f.clock(GAME_EPOCH+12*DAY);const a=f.actor('周赛迁移');
  const old=f.snapshot(a),g=new RequestGameStore(old,{wall:()=>GAME_EPOCH+12*DAY});g.page('show');
  const privateTheme=g.state.show.activePrivate.choices[0];
  const pet=g.state.pets[0];pet.bornAt=GAME_EPOCH+11*DAY;
  const preview=showPage(g.state,'show.review',{mode:'private',event:g.state.show.activePrivate.id,theme:privateTheme.id,pet:pet.id},GAME_EPOCH+12*DAY);
  g.act({...preview.actions[0],requestId:randomUUID(),profileId:g.state.profileId,version:g.state.version});
  const oldEntry=structuredClone(g.state.show.entries[g.state.show.activePrivate.id]);
  f.db.prepare('UPDATE trial_accounts SET snapshot=? WHERE id=?').bind(JSON.stringify(g.snapshot()),a.id).run();
  const page=await f.api(a,'page',{page:'show',args:{mode:'public'}});safe(page);
  const next=page.page.rows.find(row=>row.visual?.mode==='public');assert.match(next.text,/报名开放/);
  assert.equal(next.link.args.event,'online-public-2');
  assert.deepEqual(f.snapshot(a).state.show.entries[oldEntry.id].theme,oldEntry.theme);
  f.clock(GAME_EPOCH+13*DAY);await f.api(a,'shop');assert.ok(f.snapshot(a).state.show.entries[oldEntry.id].outcome);
});

test('一千个正式账号共同榜单按实际分数档排名，同分同奖且不填充模拟对手',async t=>{
  const f=await fixture(t),first=f.actor('规模0');const cmd=f.command(await f.review(first));await f.api(first,'action',cmd);
  const entry=JSON.parse(f.db.prepare('SELECT entry FROM petshop_public_entries').first().entry);
  for(let i=1;i<1000;i++){
    const a=f.actor('规模'+i);
    f.db.prepare('INSERT INTO petshop_public_entries(round_id,account_id,username,entry) VALUES(?,?,?,?)').bind(entry.id,a.id,a.username,JSON.stringify({...entry,pet:{...entry.pet,id:randomUUID(),name:'样本'+i}})).run();
  }
  f.clock(entry.result);
  const board=await f.api(first,'page',{page:'show.board',args:{event:entry.id}});safe(board);
  assert.match(board.page.subtitle,/参赛 1000 位 · 过线 1000 位/);assert.equal(board.page.rows[0].text,'1000 位');
  assert.ok(board.page.rows.slice(1,5).every(row=>row.text==='0 位'));
  const list=await f.api(first,'page',{page:'show.tier',args:{event:entry.id,tier:'all'}});safe(list);
  assert.equal(list.page.rows.length,20);assert.match(list.page.subtitle,/1 \/ 50/);
  const last=await f.api(first,'page',{page:'show.tier',args:{event:entry.id,tier:'all',cursor:49}});
  assert.equal(last.page.rows.length,20);assert.match(last.page.subtitle,/50 \/ 50/);
  assert.ok(f.db.prepare('SELECT ranking FROM petshop_public_rounds WHERE id=?').bind(entry.id).first().ranking);
});

test('全服排名冻结且不会因玩家时钟提前发奖，提交截止由数据库事务再次检查',async t=>{
  const f=await fixture(t),a=f.actor('服务器时间');
  const cmd=f.command(await f.review(a));await f.api(a,'action',cmd);
  const snap=f.snapshot(a);snap.state.clock=base+40*DAY;
  f.db.prepare('UPDATE trial_accounts SET snapshot=? WHERE id=?').bind(JSON.stringify(snap),a.id).run();
  await f.api(a,'shop');assert.ok(!f.snapshot(a).state.show.entries[cmd.args.event].outcome);
  const b=f.actor('事务截止'),late=f.command(await f.review(b)),before=f.snapshot(b);
  f.db.prepare('UPDATE petshop_public_rounds SET close_at=? WHERE id=?').bind(base-1,cmd.args.event).run();
  await f.api(b,'action',late,409);assert.deepEqual(f.snapshot(b),before);
  assert.equal(f.db.prepare('SELECT count(*) n FROM petshop_public_entries').first().n,1);
});
