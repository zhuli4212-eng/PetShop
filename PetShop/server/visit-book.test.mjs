import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameStore } from './game-store.mjs';
import { beijingTime, lifeDates } from './care.mjs';
import { recordMilestone } from './visit-book.mjs';
import { createPetShopServer } from './main.mjs';

const minute=60_000, day=1440*minute;
function fixture(t) {
  const dir=mkdtempSync(path.join(os.tmpdir(),'petshop-visit-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let now=Date.parse('2026-11-16T09:00:00+08:00'),seq=0;
  const options={wall:()=>now,monotonic:()=>0};
  let store=new GameStore(dir,options);
  const profileId=store.shop().profileId;
  return {
    get store(){return store;},get now(){return now;},
    later:elapsed=>{now+=elapsed;},restart:()=>{store=new GameStore(dir,options);store.resumeExisting();},
    pulse:(foreground=true,read=[],client='client-a')=>store.heartbeat(client,foreground,{profileId,seq:++seq,read}).letter,
    act:(type,args={})=>store.act({type,args,version:store.shop().version,profileId,requestId:'ledger-test-'+ ++seq})
  };
}

test('首次进入可跳过交接；多客户端、重连、顺序颠倒和换账号不重复读信或领资产',t=>{
  const f=fixture(t),start=f.now;
  const {store}=f;
  assert.equal(f.pulse().page.title,'旧店交接');
  assert.equal(f.pulse(true,['opening']),null);
  assert.equal(store.state.pets.length,2);
  assert.equal(store.state.coins,680);
  assert.equal(f.pulse(true,[],'client-b'),null);
  f.pulse(false);
  f.later(20_000);f.pulse(true,[],'client-b');
  f.restart();assert.equal(f.pulse(),null);
  const profileId=f.store.shop().profileId;
  f.store.heartbeat('client-c',true,{profileId,seq:10,read:[]});
  f.store.heartbeat('client-c',false,{profileId,seq:9});
  assert.equal(f.store.readers.get('client-c').foreground,true);
  assert.throws(()=>f.store.heartbeat('client-c',true,{profileId:'other',seq:11,read:['opening']}),/切换/);
  assert.equal(f.store.state.createdAt,start);
});

test('后台运行和停服后按计划列出出生、成年、自然死亡、补单与参赛结果；摘要不重复入账',t=>{
  const f=fixture(t);
  f.pulse(true,['opening']);
  const {store}=f;
  f.act('care.checkin');
  const [mother,father]=store.state.pets;
  f.act('care.breed',{species:'rabbit',mother:mother.id,father:father.id,guide:-1});
  const bornAt=store.state.rooms.rabbit.job.endsAt;
  const s=structuredClone(store.state);
  s.orders[0]={order:null,readyAt:f.now+30*minute};
  s.show.entries.example={id:'example',mode:'public',theme:{name:'春日'},pet:{name:'旧参赛兔'},
    result:f.now+day,payout:f.now+2*day,outcome:{tier:'silver'},cashPaid:17,cashClosed:true};
  store.save(s);
  f.pulse(false);f.later(3*minute);store.checkpoint();
  f.later(day);store.checkpoint();f.restart();
  f.later(4*day);
  const report=f.pulse(), rows=report.page.rows;
  assert.equal(report.page.title,'离店期间');
  assert.match(rows.find(r=>r.title.includes('房出生')).text,new RegExp(beijingTime(bornAt)));
  assert.ok(rows.some(r=>r.title==='小花 自然死亡'&&r.text.startsWith(beijingTime(lifeDates(mother).deathAt))));
  assert.ok(rows.some(r=>r.title==='谷穗 已成年'));
  assert.ok(rows.some(r=>r.title.includes('补单')));
  assert.ok(rows.some(r=>r.title.includes('春日')&&r.text.includes('银杯')));
  assert.ok(rows.some(r=>r.title.includes('排名结算')&&r.text.includes('17')));
  assert.ok(rows.some(r=>r.title.includes('后备')&&r.link?.page==='profile'));
  assert.ok(rows.some(r=>r.title==='研究所尚未开放'));
  assert.deepEqual(f.pulse().ids,report.ids);
  const quantities=[f.store.state.coins,f.store.state.pets.length];
  assert.equal(f.pulse(true,report.ids),null);
  f.restart();assert.equal(f.pulse(),null);
  assert.ok(f.store.page('login',{}).page.rows.some(r=>r.link?.page==='lastVisit'));
  assert.deepEqual(f.store.page('lastVisit',{}).page.rows,rows);
  assert.deepEqual([f.store.state.coins,f.store.state.pets.length],quantities);
});

test('短暂失联仍在线时不生成摘要，心跳超时的返回可以查到在售种源；旧摘要确认不会吞下新事项',t=>{
  const f=fixture(t);
  f.pulse(true,['opening']);f.act('care.checkin');
  const s=structuredClone(f.store.state);
  s.shopXp=10;
  s.pets=s.pets.filter(p=>p.sex==='母');
  s.rooms.rabbit.shelf.offers[0]=null;
  f.store.save(s);
  f.later(30*minute);
  const first=f.pulse();
  assert.ok(first.page.rows.some(r=>r.title==='兔房当前货架'&&r.link.args.species==='rabbit'&&r.text.includes('金币')));
  f.pulse(false);f.later(4*day);
  const combined=f.pulse();
  assert.ok(combined.ids.length>first.ids.length);
  const rest=f.pulse(true,first.ids);
  assert.ok(rest.page.rows.some(r=>r.title.includes('自然死亡')));
  assert.ok(!rest.page.rows.some(r=>r.title.includes('已成年')));
  f.pulse(true,rest.ids);
  for(let i=0;i<6;i++){f.later(20_000);assert.equal(f.pulse(),null);}
});

test('旧档跳过开场；回收不触发首次活体交易，来客兼首售合并，三节点完毕只收束一次',t=>{
  const f=fixture(t);
  const s=structuredClone(f.store.state);
  delete s.visitBook;
  s.journal=[{key:'trade',at:f.now,text:'旧的首次生意'}];
  s.sales=[{channel:'recycle',at:f.now,lines:[]}];
  f.store.save(s);f.restart();
  assert.equal(f.pulse(),null);
  const next=structuredClone(f.store.state);
  assert.equal(next.journal.length,0);
  recordMilestone(next,'sale.commit',{channel:'recycle'},f.now);
  assert.equal(next.journal.length,0);
  recordMilestone(next,'sale.commit',{channel:'guest'},f.now);
  assert.equal(next.visitBook.stories.length,1);
  assert.match(next.visitBook.stories[0].text,/第一笔[\s\S]*书店/);
  recordMilestone(next,'care.unlock',{species:'cat'},f.now);
  recordMilestone(next,'care.unlock',{species:'dog'},f.now);
  assert.equal(next.visitBook.stories.length,2);
  assert.equal(next.journal.filter(n=>n.key==='closing').length,1);
  f.store.save(next);
  const letter=f.pulse();assert.equal(letter.page.title,'账簿新页');
  assert.match(letter.page.rows.at(-1).text,/账簿仍会继续/);
  const manual=f.store.page('login',{}).page;
  assert.deepEqual(manual.readNoteIds,letter.ids);
  assert.equal(f.pulse(true,manual.readNoteIds),null);
  assert.deepEqual(f.store.page('login',{}).page.readNoteIds,[]);
});

test('正式 HTTP 入口传递读信回执，跳过引导后可以从登记簿重读',async t=>{
  const f=fixture(t);
  const server=createPetShopServer(undefined,{store:f.store});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port+'/api/';
  const shop=await (await fetch(base+'shop')).json();
  const request=async(path,body)=>{
    const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal(res.status,200);return res.json();
  };
  const clientId='http-test-client',foreground=true;
  const initial=await request('heartbeat',{clientId,foreground,reader:{seq:1,profileId:shop.profileId}});
  assert.equal(initial.letter.page.title,'旧店交接');
  const manual=await request('page',{page:'openingGuide'});
  assert.deepEqual(manual.page.readNoteIds,initial.letter.ids);
  const skipped=await request('heartbeat',{clientId,foreground,reader:{seq:2,profileId:shop.profileId,read:manual.page.readNoteIds}});
  assert.equal(skipped.letter,null);
  assert.ok((await request('page',{page:'login'})).page.rows.some(r=>r.link?.page==='openingGuide'));
  const archive=await request('page',{page:'openingGuide'});
  assert.equal(archive.page.title,'旧店交接');
  assert.deepEqual(archive.page.readNoteIds,[]);
  assert.deepEqual(f.store.state.care.claimIds,[]);
});
