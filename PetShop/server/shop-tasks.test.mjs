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
  assert.equal(panel(g).subtitle,'进行中');
  assert.throws(()=>act(g,'task.claim',rabbitTask),/请先完成/);
  const [firstMother,firstFather]=g.state.pets;
  act(g,'care.breed',{mother:firstMother.id,father:firstFather.id});
  assert.equal(panel(g).rows[1].text,'繁育中，等待首窝出生');
  now+=2*minute;
  assert.equal(panel(g).rows[1].done,true);
  assert.equal(panel(g).rows[2].done,false);

  const batch=g.state.rooms.rabbit.shelf;
  for(const offer of [...batch.offers]){
    act(g,'care.buyPet',{id:offer.id,batch:batch.number,price:purchasePrice(g.state,youngPurchaseBase(offer))});
  }
  const mother=batch.offers.find(p=>p.sex==='母').id, father=batch.offers.find(p=>p.sex==='公').id;
  assert.throws(()=>act(g,'care.breed',{mother,father}),/可繁育/);
  assert.equal(panel(g).subtitle,'进行中');
  now+=30*minute;
  const coins=g.state.coins;
  act(g,'care.breed',{mother,father});
  assert.equal(g.state.coins,coins);
  assert.equal(panel(g).subtitle,'可领取');
  assert.deepEqual(panel(g).actions[0].args,rabbitTask);
  assert.equal(g.state.rooms.rabbit.nutritionStock,undefined);
  assert.equal(g.state.tasks[rabbitTask.id].motherId,mother);

  const legacy=g.snapshot();
  delete legacy.tasks;
  assert.equal(panel(new RequestGameStore(legacy,options)).subtitle,'可领取');
  const restored=new RequestGameStore(g.snapshot(),options);
  const xp=restored.state.shopXp;
  const claim=command(restored,'task.claim',rabbitTask);
  const receipt=restored.act(claim);
  const reopened=new RequestGameStore(restored.snapshot(),options);
  assert.deepEqual(reopened.act(claim),receipt);
  assert.throws(()=>act(reopened,'task.claim',rabbitTask),/奖励已领取/);
  assert.equal(panel(reopened).subtitle,'已领取');
  assert.equal(reopened.state.coins,coins+40);
  assert.equal(reopened.state.shopXp,xp);
  assert.equal(reopened.state.rooms.rabbit.nutritionStock.premium,2);
  assert.equal(reopened.state.rooms.rabbit.nutrition,undefined);
  act(reopened,'care.feed',{species:'rabbit',tier:'premium'});
  assert.equal(reopened.state.rooms.rabbit.nutritionStock.premium,1);
});
