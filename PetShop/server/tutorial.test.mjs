import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestGameStore } from './request-store.mjs';
import { randomUUID } from 'node:crypto';

const now=Date.UTC(2026,10,17,1), options={wall:()=>now,monotonic:()=>0};
function store(){return new RequestGameStore(null,options);}
function act(g,type,args={},requestId=randomUUID()){
  const shop=g.shop();
  return g.act({requestId,profileId:shop.profileId,version:shop.version,type,args});
}
function pair(g){
  const [mother,father]=g.state.pets;
  const actions=g.page('breed',{species:'rabbit',mother:mother.id,father:father.id}).page.actions;
  return actions.find(a=>a.type==='care.breed');
}
function offer(g){
  const row=g.page('shelf',{species:'rabbit'}).page.rows.find(r=>r.link?.page==='offer');
  return g.page(row.link.page,row.link.args).page;
}
const status=g=>g.shop().tutorial;

test('新店四步按真实操作入账，低级货架仅一次原价采购，订单只读可重载，两处浏览顺序不限',()=>{
  for(const marketFirst of [false,true]){
    let g=store();
    assert.equal(status(g).step,1);
    assert.equal(g.page('tutorial',{}).page.actions[0].page,'breed');
    assert.deepEqual(g.page('tutorial',{}).page.readNoteIds,['opening']);
    const locked=e=>e.status===403;
    assert.throws(()=>g.page('shelf',{species:'rabbit'}),locked);
    assert.throws(()=>g.page('orders',{}),locked);
    const action=pair(g);
    assert.equal(status(g).step,1);
    assert.throws(()=>act(g,action.type,{...action.args,mother:'missing'}));
    const requestId=randomUUID();
    const receipt=act(g,action.type,action.args,requestId);
    assert.deepEqual(act(g,action.type,action.args,requestId),receipt);
    assert.ok(g.state.rooms.rabbit.job);assert.equal(status(g).step,2);
    assert.equal(g.shop().shopLevel,1);
    assert.throws(()=>g.page('shelf',{species:'cat'}),locked);
    assert.throws(()=>g.page('services',{species:'rabbit'}),locked);
    const buy=offer(g).actions.find(a=>a.type==='care.buyPet'),before=g.state.coins;
    assert.throws(()=>act(g,buy.type,{...buy.args,price:buy.args.price+1}));
    assert.equal(status(g).step,2);assert.equal(g.state.coins,before);
    const purchaseId=randomUUID();
    act(g,buy.type,buy.args,purchaseId);
    g=new RequestGameStore(g.snapshot(),options);
    act(g,buy.type,buy.args,purchaseId);
    assert.equal(status(g).step,3);assert.equal(g.state.coins,before-buy.args.price);
    assert.equal(g.state.pets.filter(p=>p.source==='研究所采购').length,1);
    const remaining=offer(g);
    assert.ok(remaining.actions.every(a=>a.type!=='care.buyPet'));
    assert.throws(()=>act(g,'care.buyPet',{...buy.args,id:g.state.rooms.rabbit.shelf.offers.find(Boolean).id}),locked);
    const count=g.state.pets.length;
    g.page('profile',{});assert.equal(status(g).step,3);
    act(g,'care.checkin');assert.equal(g.state.pets.length,count+2);
    assert.equal(status(g).step,4);
    assert.equal(status(g).completed,false);
    const first=marketFirst?'market':'orders',second=marketFirst?'orders':'market';
    const a=g.page(first,{}),repeat=g.page(first,{});
    assert.deepEqual(a.shop.tutorial,repeat.shop.tutorial);
    assert.equal(a.shop.tutorial.ordersViewed,!marketFirst);
    assert.equal(a.shop.tutorial.marketViewed,marketFirst);
    g=new RequestGameStore(g.snapshot(),options);
    assert.equal(g.page(second,{}).shop.tutorial.completed,true);
    const reloaded=g.page('orders',{}).page;
    assert.ok(reloaded.visual.preview&&reloaded.rows.length===3&&reloaded.rows.every(r=>!r.link&&!r.visual));
    assert.deepEqual(reloaded.actions.map(a=>a.page),['tutorial']);
    assert.throws(()=>g.page('orderDesk',{id:g.state.orders[0].order.id}),locked);
    assert.throws(()=>act(g,'order.cancel',{id:g.state.orders[0].order.id}),locked);
    assert.equal(g.state.shopXp,0);
    assert.ok(g.page('tutorial',{}).page.rows.every(r=>r.done&&!r.current));
  }
});

test('提前签到和看市场不会要求重复，旧店只看说明，种兔不足时给出签到和成长时刻',()=>{
  const g=store();
  g.page('market',{});act(g,'care.checkin');
  assert.equal(status(g).step,1);
  const action=pair(g);act(g,action.type,action.args);
  const buy=offer(g).actions[0];act(g,buy.type,buy.args);
  assert.equal(status(g).step,4);assert.equal(status(g).marketViewed,true);
  assert.deepEqual(g.page('tutorial',{}).page.actions.map(a=>a.page),['orders']);
  assert.equal(g.page('orders',{}).shop.tutorial.completed,true);
  const old=g.snapshot();delete old.state.visitBook.tutorial;
  const legacy=new RequestGameStore(old,options);
  assert.equal(legacy.shop().tutorial,undefined);
  const guide=legacy.page('tutorial',{}).page;
  assert.equal(guide.presentation.archived,true);
  assert.equal(guide.rows.length,4);assert.deepEqual(guide.actions.map(a=>a.type),['ui.back']);
  assert.equal(legacy.page('openingGuide',{}).page.actions[0].page,'tutorial');
  assert.equal(legacy.page('profile',{}).page.presentation.signed,true);
  assert.throws(()=>legacy.page('orders',{}),e=>e.status===403);
  const low=store(),sold=low.state.pets.map(p=>p.id);
  const sale=low.page('saleQuote',{channel:'market',ids:sold}).page.actions[0];
  act(low,sale.type,sale.args);
  assert.ok(low.page('tutorial',{}).page.actions.some(a=>a.page==='profile'));
  act(low,'care.checkin');
  assert.match(low.page('tutorial',{}).page.rows[0].text,/最早于北京时间/);
  const gap=store(),[mother,father]=gap.state.pets;
  mother.bornAt=now-4*24*60*60_000-30*60_000+1;
  father.bornAt=now;
  assert.match(gap.page('tutorial',{}).page.rows[0].text,/先签到/);
});
