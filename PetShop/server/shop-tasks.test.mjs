import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RequestGameStore } from './request-store.mjs';
import { purchasePrice, youngPurchaseBase } from './business.mjs';
import { lifeDates } from './care.mjs';

const start=Date.UTC(2026,10,18,4), minute=60_000;
const rabbitTask={id:'rabbit-pair'};
const panel=g=>g.page('tasks',{}).page;
function command(g,type,args) {
  const {profileId,version}=g.shop();
  return {requestId:randomUUID(),profileId,version,type,args};
}
const act=(g,type,args)=>g.act(command(g,type,args));

test('任务读取真实购入与配对，奖励领取一次并可在兔房投喂',()=>{
  let now=start;
  const options={wall:()=>now,monotonic:()=>0};
  const g=new RequestGameStore(null,options);
  g.state.shopXp=36;
  assert.equal(panel(g).subtitle,'0 / 6 已完成');
  assert.equal(panel(g).actions[0].disabled,true);
  assert.deepEqual(g.shop().taskShortcut,{completed:0,total:6,choice:{label:'开始兔子繁育',page:'breed',args:{species:'rabbit'}}});
  assert.throws(()=>act(g,'task.claim',rabbitTask),/请先完成/);
  const [firstMother,firstFather]=g.state.pets;
  act(g,'care.breed',{mother:firstMother.id,father:firstFather.id});
  assert.equal(panel(g).rows[0].done,true);
  now+=2*minute;
  assert.equal(panel(g).rows[1].done,false);

  const batch=g.state.rooms.rabbit.shelf;
  for(const offer of [...batch.offers]){
    act(g,'care.buyPet',{id:offer.id,batch:batch.number,price:purchasePrice(g.state,youngPurchaseBase(offer))});
  }
  const mother=batch.offers.find(p=>p.sex==='母').id, father=batch.offers.find(p=>p.sex==='公').id;
  assert.throws(()=>act(g,'care.breed',{mother,father}),/可繁育/);
  assert.equal(panel(g).subtitle,'2 / 6 已完成');
  now=Math.max(...g.state.pets.filter(p=>p.id===mother||p.id===father).map(p=>lifeDates(p).adultAt));
  const coins=g.state.coins;
  act(g,'care.breed',{mother,father});
  assert.equal(g.state.coins,coins);
  assert.equal(panel(g).subtitle,'3 / 6 已完成');
  assert.deepEqual(panel(g).actions[0].args,rabbitTask);
  assert.equal(g.state.rooms.rabbit.nutritionStock,undefined);
  assert.equal(g.state.tasks[rabbitTask.id].motherId,mother);

  const legacy=g.snapshot();
  delete legacy.state.tasks;
  assert.equal(panel(new RequestGameStore(legacy,options)).subtitle,'3 / 6 已完成');
  assert.throws(()=>act(g,'task.claim',rabbitTask),/请先完成全部/);
  g.page('market',{});
  act(g,'care.checkin',{});
  g.page('orders',{});
  assert.ok(panel(g).rows.every(r=>r.done));
  assert.equal(panel(g).subtitle,'6 / 6 已完成');
  assert.deepEqual(g.shop().taskShortcut,{completed:6,total:6,choice:{label:'领取任务奖励',page:'tasks'}});
  assert.equal(panel(g).actions[0].disabled,false);
  const restored=new RequestGameStore(g.snapshot(),options);
  const xp=restored.state.shopXp;
  const claim=command(restored,'task.claim',rabbitTask);
  const receipt=restored.act(claim);
  const reopened=new RequestGameStore(restored.snapshot(),options);
  assert.deepEqual(reopened.act(claim),receipt);
  assert.throws(()=>act(reopened,'task.claim',rabbitTask),/奖励已领取/);
  assert.match(panel(reopened).subtitle,/安置兔房/);
  assert.equal(reopened.shop().taskShortcut.choice.label,'给兔房投喂营养餐');
  assert.equal(reopened.state.coins,coins+40);
  assert.equal(reopened.state.shopXp,xp);
  assert.equal(reopened.state.rooms.rabbit.nutritionStock.premium,2);
  assert.equal(reopened.state.rooms.rabbit.nutrition,undefined);
  act(reopened,'care.feed',{species:'rabbit',tier:'premium'});
  assert.equal(reopened.state.rooms.rabbit.nutritionStock.premium,1);
});

test('独立任务入口保留旧进度，锁定页可查看条件且不计完成',()=>{
  const options={wall:()=>start,monotonic:()=>0};
  const g=new RequestGameStore(null,options);
  assert.throws(()=>g.page('tutorial',{}),e=>e.status===404);
  const {rows}=panel(g);
  assert.deepEqual(rows.map(r=>r.link.page),['breed','lab','profile','orders','market','breed']);
  for(const key of ['lab','orders']){
    assert.throws(()=>g.page(key,{}),e=>e.status===403);
    const page=g.page(key,{fromTasks:true}).page;
    assert.equal(page.presentation.kind,'featureLocked');
    assert.match(page.rows[0].text,/2 级/);
  }
  assert.equal(panel(g).subtitle,'0 / 6 已完成');
  g.page('market',{});
  act(g,'care.checkin',{});
  assert.equal(panel(g).subtitle,'2 / 6 已完成');

  const old=g.snapshot();
  delete old.state.tasks.opening;
  old.state.visitBook.tutorial={bred:true,bought:true,claimed:true,ordersViewed:true,marketViewed:false};
  const reopened=new RequestGameStore(old,options);
  assert.deepEqual(panel(reopened).rows.map(r=>r.done),[true,true,true,true,false,false]);
  assert.equal(reopened.state.visitBook.tutorial,undefined);
  assert.equal(reopened.page('openingGuide',{}).page.actions[0].page,'tasks');
});

test('未开猫房可按经营结果完成全部十五组，组号不显示，重进可继续领奖',()=>{
  let now=start;
  const options={wall:()=>now,monotonic:()=>0};
  let game=new RequestGameStore(null,options);
  game.state.onboarding={finishedAt:start,firstLitterAt:start-1};
  game.state.coins=4000;
  game.state.shopXp=10;
  const page=(key,args={})=>game.page(key,args).page;
  const choose=choice=>act(game,choice.type,choice.args);

  assert.match(panel(game).subtitle,/^安置兔房/);
  assert.throws(()=>act(game,'task.claim',{id:'rabbit-shop-ready'}),/当前一组/);
  act(game,'care.checkin',{});
  game.state.rooms.rabbit.nutritionStock={premium:2};
  choose(page('roomNutrition').actions[0]);
  page('lab',{tab:'seed'});page('lab',{tab:'services'});page('research');
  for(const slot of game.state.orders.slice(0,2))act(game,'order.cancel',{id:slot.order.id,source:'free'});
  for(const branch of [0,1,2])choose(page('researchNode',{species:'rabbit',branch}).actions.find(a=>a.type==='research.upgrade'));

  let parents=game.state.pets.slice(0,2);
  for(let cycle=0;cycle<9;cycle++){
    if(cycle){
      now+=30*minute;
      game.shop();
      if(cycle===1)choose(page('roomNutrition').actions[0]);
      page('orders');
      const {number,offers}=game.state.rooms.rabbit.shelf;
      const ids=offers.map(offer=>offer.id);
      for(const offer of [...offers])act(game,'care.buyPet',{id:offer.id,batch:number,price:purchasePrice(game.state,youngPurchaseBase(offer))});
      parents=game.state.pets.filter(p=>ids.includes(p.id));
      now=Math.max(...parents.map(p=>lifeDates(p).adultAt));
    }
    const pairing=Object.fromEntries(parents.map(p=>[p.sex==='母'?'mother':'father',p.id]));
    act(game,'care.breed',pairing);
    now=game.state.rooms.rabbit.job.endsAt;
    page('litter');
    const [child,...litter]=game.state.rooms.rabbit.lastLitter.ids;
    page('pet',{id:child});
    act(game,'care.retain',{id:child,retained:true});
    act(game,'care.retain',{id:child,retained:false});
    choose(page('saleQuote',{channel:'market',ids:[child,...litter,...parents.map(p=>p.id)]}).actions[0]);
  }

  const claimed=new Set();
  for(let group=0;group<15;group++){
    const current=panel(game), claim=current.actions[0];
    assert.doesNotMatch(current.subtitle,/第\s*\d+\s*[\/组]/);
    assert.ok(current.rows.every(row=>row.done&&row.link?.page),current.subtitle);
    assert.equal(claim.disabled,false,current.subtitle);
    const before=game.state.coins;
    choose(claim);claimed.add(claim.args.id);
    assert.equal(game.state.coins-before,current.visual.rewards[0].quantity);
    game=new RequestGameStore(game.snapshot(),options);
  }
  assert.equal(claimed.size,15);
  assert.equal(game.state.rooms.cat,undefined);
  assert.equal(panel(game).actions[0].label,'已领取');
  assert.match(game.shop().taskShortcut.choice.label,/经营任务已完成/);
});
