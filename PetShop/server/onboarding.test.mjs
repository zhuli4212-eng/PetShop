import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameStore } from './game-store.mjs';
import { lifeDates, stageOf } from './care.mjs';

function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'petshop-opening-test-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let now=Date.UTC(2026,10,19,1),store;
  const options={wall:()=>now,monotonic:()=>0,onboarding:true};
  const reopen=()=>{store=new GameStore(dir,options);store.shop();};
  reopen();
  const page=(key,args={})=>store.page(key,args).page;
  const command=(type,args={})=>{
    const {profileId,version}=store.shop();
    return {type,args,profileId,version,requestId:randomUUID()};
  };
  const act=(type,args)=>store.act(command(type,args));
  const choose=a=>act(a.type,a.args);
  const sale=(channel,ids,targetId)=>page('saleQuote',{channel,ids,targetId}).actions[0];
  function start(){
    act('onboarding.openRoom');
    choose(page('roomNutrition').actions[0]);
    const [mother,father]=store.state.onboarding.starters;
    choose(page('breed',{mother,father}).actions[0]);
    now+=5000;
    return page('litter');
  }
  return {get store(){return store;},get state(){return store.state;},get now(){return now;},
    reopen,page,command,act,choose,sale,start,advance:ms=>{now+=ms;return store.shop();}};
}

test('交接信可重读，关掉照常经营，首对赠餐和首窝特例仍然生效', t=>{
  const f=fixture(t);
  const {page,act,choose,command,reopen}=f;
  const introductory=page('openingGuide');
  assert.equal(introductory.visual.openingBooklet.length,9);
  assert.equal(introductory.visual.openingBooklet[2].caption,'进兔房点「投喂」，把这份营养餐喂给它们，两只小兔就会长大。');
  assert.equal(f.store.heartbeat('test-reader',true,{profileId:f.state.profileId,seq:1}).letter.page.title,'交接信');
  assert.equal(f.store.heartbeat('test-reader',true,{profileId:f.state.profileId,seq:2,read:['opening']}).letter,null);
  assert.deepEqual(f.store.shop().rooms,[]);
  assert.equal(page('market').title,'自由市场');
  assert.equal(f.store.shop().onboarding,undefined);
  const open=command('onboarding.openRoom');
  const receipt=f.store.act(open);
  reopen();
  assert.deepEqual(f.store.act(open),receipt);
  assert.equal(f.state.pets.length,2);
  assert.equal(f.state.rooms.rabbit.nutritionStock.premium,1);
  assert.ok(f.state.pets.every(p=>p.breedKey==='domestic'&&stageOf(p,f.now)==='幼年'));
  const dates=f.state.pets.map(p=>lifeDates(p).deathAt);
  choose(page('roomNutrition').actions[0]);
  assert.ok(f.state.pets.every(p=>stageOf(p,f.now)==='成年'));
  assert.deepEqual(f.state.pets.map(p=>lifeDates(p).deathAt),dates);
  assert.equal(f.state.rooms.rabbit.nutrition,undefined);
  assert.equal(f.state.rooms.rabbit.nutritionStock.premium,0);
  const [mother,father]=f.state.onboarding.starters;
  const review=page('breed',{mother,father});
  assert.equal(review.presentation.waitText,'5 秒');
  choose(review.actions[0]);
  const job=f.state.rooms.rabbit.job;
  assert.equal(job.endsAt-f.now,5000);
  assert.deepEqual(job.offspring.map(p=>p.sex),['母','公','母','公']);
  assert.ok(job.offspring.every(p=>p.breedKey==='domestic'&&p.traits.every(t=>t.grade==='B')));
  f.advance(4000);reopen();
  assert.equal(f.state.rooms.rabbit.job.endsAt,job.endsAt);
  f.advance(1000);
  const children=page('litter').rows.filter(r=>r.litterMember);
  assert.equal(children.length,4);
  assert.equal(page('pet',{id:children[2].animal.id}).presentation.traits.length,6);
  assert.throws(()=>act('care.retain',{id:mother,retained:true}),/已繁育动物无法留种/);
});

test('首窝保留一公一母，只卖一只，奖励和后续道具到账一次',t=>{
  const f=fixture(t);
  const litter=f.start();
  const [mother,father,sell,stay]=litter.rows.filter(r=>r.litterMember).map(r=>r.animal.id);
  const identity={species:'rabbit',bornAt:litter.presentation.bornAt};
  assert.equal(f.page('litterKeep',identity).title,'首窝留种与出售');
  assert.equal(f.page('openingLitterSale',{...identity,ids:[mother,sell]}).rows[0].title,'请选择一公一母留种。');
  const selection=f.page('openingLitterSale',{...identity,ids:[mother,father]});
  assert.deepEqual(selection.rows.map(r=>r.select),[sell,stay]);
  const quote=f.page('openingLitterQuote',{...identity,keepIds:[mother,father],ids:[sell]});
  assert.equal(quote.actions[0].label,'确认选择');
  f.choose(quote.actions[0]);
  assert.equal(f.state.pets.find(p=>p.id===sell),undefined);
  assert.ok(f.state.pets.find(p=>p.id===stay)&&!f.state.pets.find(p=>p.id===stay).retained);
  assert.deepEqual(f.state.pets.filter(p=>p.retained).map(p=>p.id),[mother,father]);
  // These visits before acceptance must not count toward the first formal group.
  f.page('pet',{id:mother});f.page('lab');
  const balance=f.state.coins;
  const claim=f.command('onboarding.claim');
  const receipt=f.store.act(claim);
  f.reopen();
  assert.deepEqual(f.store.act(claim),receipt);
  assert.throws(()=>f.act('onboarding.claim'),/奖励已领取/);
  assert.equal(f.state.coins,balance+40);
  assert.equal(f.state.rooms.rabbit.nutritionStock.premium,2);
  assert.match(f.page('tasks').subtitle,/安置兔房 · 0 \/ 3/);
  f.page('pet',{id:mother});
  f.choose(f.page('roomNutrition').actions[0]);
  f.page('lab');
  const first=f.page('tasks');
  assert.deepEqual(first.visual.rewards.map(r=>r.name),['金币','优质兔兔营养餐']);
  const formalClaim=f.command(first.actions[0].type,first.actions[0].args);
  const formalReceipt=f.store.act(formalClaim);
  f.reopen();
  assert.deepEqual(f.store.act(formalClaim),formalReceipt);
  assert.equal(f.state.rooms.rabbit.nutritionStock.quality,1);
  assert.match(f.page('tasks').subtitle,/经营第一批兔子 · 0 \/ 3/);
  assert.deepEqual(f.page('tasks').visual.rewards.map(r=>r.name),['金币','兔用选育指导单']);
});

test('主动出售原亲本仍结算另一只寿终、回收补种、补贴和首单特殊定价',t=>{
  const f=fixture(t);
  const young=f.start().rows.find(r=>r.litterMember).animal.id;
  const [mother,father]=f.state.onboarding.starters;
  f.choose(f.sale('market',[mother]));
  assert.equal(f.state.onboarding.remainingId,father);
  assert.equal(stageOf(f.state.pets.find(p=>p.id===father),f.now),'已故');
  f.choose(f.sale('recycle',[father]));
  const offers=f.state.onboarding.offers;
  assert.equal(offers.length,2);
  f.state.coins=1;
  const purchase=f.page('offer',{id:offers[0].id});
  assert.match(purchase.rows[0].text,/抵扣 199 金币 · 实付 1 金币/);
  f.choose(purchase.actions[0]);
  f.choose(f.page('offer',{id:offers[1].id}).actions[0]);
  const purchased=f.state.pets.filter(p=>offers.some(a=>a.id===p.id));
  assert.ok(purchased.every(p=>p.breedKey==='lop'&&stageOf(p,f.now)==='成年'));
  assert.equal(f.state.onboarding.seedAid,399);
  assert.equal(f.state.coins,0);
  f.act('care.breed',{mother:purchased[0].id,father:purchased[1].id});
  assert.equal(f.state.rooms.rabbit.job.endsAt-f.now,120000);
  f.state.shopXp=200;
  f.advance(20*60_000);
  const order=f.sale('order',[young],f.state.onboarding.orderId);
  assert.deepEqual(order.args.amounts,[108]);
  f.choose(order);
  assert.equal(f.state.orders[0].readyAt,f.now+30*60_000);
});

test('旧档缺兔和已领开店奖励均可换用交接信继续',t=>{
  const f=fixture(t);
  f.act('onboarding.openRoom');
  const old=structuredClone(f.state);
  delete old.onboarding.booklet;
  old.onboarding.step=3;
  old.pets.pop();
  f.store.save(old);f.reopen();
  assert.equal(f.state.pets.length,2);
  assert.equal(f.state.rooms.rabbit.nutritionStock.premium,1);
  assert.equal(f.state.onboarding.recoveredTargets.length,1);
  f.choose(f.page('roomNutrition').actions[0]);
  assert.ok(f.state.pets.every(p=>stageOf(p,f.now)==='成年'));
  const claimed=structuredClone(f.state);
  delete claimed.onboarding.booklet;
  claimed.onboarding.step=17;
  claimed.onboarding.claimedAt=f.now;
  f.store.save(claimed);f.reopen();
  assert.match(f.page('tasks').subtitle,/安置兔房 · 0 \/ 3/);
  assert.throws(()=>f.act('onboarding.claim'),/奖励已领取/);
  assert.equal(f.state.rooms.rabbit.nutritionStock.premium,0);
});
