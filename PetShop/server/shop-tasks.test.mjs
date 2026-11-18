import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RequestGameStore } from './request-store.mjs';
import { purchasePrice, youngPurchaseBase } from './business.mjs';

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
  now+=30*minute;
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
  assert.equal(panel(reopened).actions[0].label,'已领取');
  assert.equal(reopened.shop().taskShortcut.choice.label,'任务已全部完成');
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
