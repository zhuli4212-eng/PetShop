import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { RequestGameStore } from './request-store.mjs';
import { themes } from './show.mjs';

const opened=Date.parse('2026-11-16T12:00:00+08:00');
const roundTrip=store=>JSON.parse(JSON.stringify(store.snapshot()));
function clock() {
  let now=opened;
  return {wall:()=>now,monotonic:()=>0,advance:ms=>{now+=ms;}};
}

test('单请求经营档在独立副本成交，丢弃竞争副本及跨请求重放均不会重复发放',()=>{
  const timer=clock(), first=new RequestGameStore(null,timer), shop=first.shop();
  assert.equal(first.dirty,true);
  assert.equal(shop.coins,680);
  assert.equal(first.maintainShow,undefined);
  const data=roundTrip(first), original=JSON.stringify(data);
  const command={requestId:'cloud-checkin-request',type:'care.checkin',args:{},profileId:shop.profileId,version:shop.version};
  const a=new RequestGameStore(data,timer), b=new RequestGameStore(data,timer);
  assert.equal(a.dirty,false);
  const result=a.act(command);b.act(command);
  assert.equal(a.dirty,true);
  assert.equal(JSON.stringify(data),original);
  const winning=roundTrip(a);
  const reload=new RequestGameStore(winning,timer);
  assert.deepEqual(reload.act(command),result);
  assert.deepEqual(reload.receipt(command.requestId),result);
  assert.throws(()=>reload.act({...command,requestId:'cloud-other-checkin'}),/变化/);
  assert.equal(reload.dirty,false);
  assert.equal(reload.page('rooms',{}).page.presentation.count,4);
  assert.deepEqual(roundTrip(reload),winning);
});

test('心跳序号、前台区间跨请求恢复，不以反复加载快照作为离店或清空来客计时',()=>{
  const timer=clock(), store=new RequestGameStore(null,timer), shop=store.shop();
  const sale=store.page('saleQuote',{channel:'market',ids:store.state.pets.map(p=>p.id)}).page.actions[0];
  store.act({...sale,requestId:'cloud-unlock-guest',version:shop.version,profileId:shop.profileId});
  const version=store.shop().version;
  const client='customer-phone-a',reader=(seq,read=[])=>({profileId:shop.profileId,seq,read});
  const first=store.heartbeat(client,true,reader(1));
  assert.ok(first.letter.ids.includes('opening'));
  timer.advance(20_000);
  const second=new RequestGameStore(roundTrip(store),timer);
  const tradeLetter=second.heartbeat(client,true,reader(2,first.letter.ids)).letter;
  assert.ok(tradeLetter && !tradeLetter.ids.includes('opening'));
  assert.equal(second.state.visitors.elapsed,20_000);
  assert.equal(second.state.version,version);
  assert.equal(second.dirty,true);
  const committed=roundTrip(second);
  const stale=new RequestGameStore(committed,timer);
  stale.heartbeat(client,false,reader(1));
  assert.equal(stale.dirty,false);
  assert.deepEqual(roundTrip(stale),committed);
  timer.advance(20_000);
  const next=new RequestGameStore(committed,timer);
  assert.equal(next.heartbeat(client,true,reader(3,tradeLetter.ids)).letter,null);
  assert.equal(next.state.visitors.elapsed,40_000);
  assert.deepEqual(next.snapshot().readers,[[client,{seq:3,at:opened+40_000,foreground:true}]]);
});

test('过期请求失败前仍结算已到期的一窝，外层可独立提交这个变更',()=>{
  const timer=clock(), game=new RequestGameStore(null,timer), shop=game.shop();
  const [mother,father]=game.state.pets;
  const command={profileId:shop.profileId,version:shop.version,type:'care.breed',requestId:'cloud-breed-a-litter',
    args:{species:'rabbit',mother:mother.id,father:father.id}};
  game.act(command);
  let snapshot=roundTrip(game);
  timer.advance(120_000);
  const later=new RequestGameStore(snapshot,timer);
  assert.throws(()=>later.act({...command,requestId:'cloud-expired-retry'}),/变化/);
  assert.ok(later.dirty);
  assert.equal(later.state.rooms.rabbit.job,null);
  const children=later.state.pets.filter(p=>p.motherId===mother.id);
  assert.ok(children.length>=3 && children.every(p=>p.bornAt===opened+120_000));
  snapshot=roundTrip(later);
  const reread=new RequestGameStore(snapshot,timer);
  assert.equal(reread.shop().version,later.state.version);
  assert.equal(reread.dirty,false);
  assert.deepEqual(roundTrip(reread),snapshot);
});

test('无效的请求快照被拒绝，现行赛事 JSON 与设计 CSV 的 40 项完全一致',()=>{
  const game=new RequestGameStore(null,clock());
  assert.throws(()=>new RequestGameStore({state:null,readers:[]}),e=>e.status===503);
  assert.throws(()=>new RequestGameStore({state:game.snapshot().state,readers:[['bad',{}]]}),e=>e.status===503);
  const csv=readFileSync(new URL('./show-events.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1);
  const grades=['E','D','C','B','A','S','S+'];
  assert.equal(themes.length,40);
  assert.deepEqual(themes.map(t=>[t.id,t.name,...t.targets.map(v=>grades[v]),...t.weights].join(',')),csv);
});
