import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GameStore } from './game-store.mjs';
import { RequestGameStore } from './request-store.mjs';
import { careAction, initCare, makePet, makeReservationOffer, admitPurchasedPet, startLitter, tickCare } from './care.mjs';
import { businessPage, businessAction, businessHeartbeat, initBusiness, salePrice } from './business.mjs';
import { getPetTags, traitCapacity, tagIdFor, TRAIT_FIELDS } from './animal-traits.mjs';
import { defectTrait } from './defect.mjs';

const T=Date.UTC(2026,10,20,1),MINUTE=60_000;
const legacyTraits=()=>TRAIT_FIELDS.map((type,i)=>({type,grade:'B',label:['温顺','清秀','柔软','匀称','紧凑'][i],rarity:'普通'})).concat(defectTrait('B'));
const legacyPet=p=>{p.traits=legacyTraits();delete p.tagRulesVersion;delete p.tagCount;return p;};
const content=p=>p.traits.map(t=>({type:t.type,grade:t.grade,label:t.label,rarity:t.rarity}));
function fresh() {const s={coins:1000000};initCare(s,T);initBusiness(s,T);return s;}
function assertNew(p) {
  assert.equal(p.traits.length,6);assert.equal(p.tagRulesVersion,2);
  assert.ok(p.tagCount>=1&&p.tagCount<=traitCapacity(p).limit);
  assert.equal(getPetTags(p).length,p.tagCount);
  assert.ok(getPetTags(p).every(t=>typeof t.tagId==='string'));
}
const quoted=(s,channel,ids,targetId)=>businessPage(s,'saleQuote',{channel,ids,targetId},T).actions[0].args;

test('开店、签到、新房、普通货架、预约、普通与教学出生都应用新标签规则，入住不重抽',()=>{
  const s=fresh();s.pets.forEach(assertNew);s.rooms.rabbit.shelf.offers.forEach(assertNew);
  careAction(s,'care.checkin',{},T);s.pets.slice(-2).forEach(assertNew);
  for(const species of ['cat','dog']) {
    careAction(s,'care.unlock',{species,price:species==='cat'?6000:60000},T);
    s.pets.slice(-2).forEach(assertNew);s.rooms[species].shelf.offers.forEach(assertNew);
  }
  const offer=makeReservationOffer(s,'cat','2026-11-20','maine','母');assertNew(offer);
  const frozen=structuredClone(offer);
  const admitted=admitPurchasedPet(s,s.rooms.cat,offer,T);assertNew(admitted);
  assert.deepEqual(admitted.traits,frozen.traits);assert.equal(admitted.tagCount,frozen.tagCount);
  assert.deepEqual(offer,frozen);
  const [mother,father]=s.pets;
  startLitter(s,{species:'rabbit',mother:mother.id,father:father.id},T);
  const offspring=structuredClone(s.rooms.rabbit.job.offspring);offspring.forEach(assertNew);
  tickCare(s,T+2*MINUTE);assert.deepEqual(s.pets.slice(-offspring.length),offspring);

  const teaching=fresh();
  startLitter(teaching,{species:'rabbit',mother:teaching.pets[0].id,father:teaching.pets[1].id},T,{waitMs:5000,plannedSexes:['母','公','母','公']});
  teaching.rooms.rabbit.job.offspring.forEach(p=>{assertNew(p);assert.ok(p.traits.every(t=>t.grade==='B'));});
  const gift=makePet(new Set(),'rabbit','domestic','母',T,'无亲本赠送');assertNew(gift);
  assert.equal(gift.motherId,null);assert.equal(gift.fatherId,null);
});

test('实际繁育先独立生成六项评级，再抽标签；缺维亲本可繁育且不把缺陷算标签',t=>{
  const s=fresh();
  for(const p of s.pets) {
    p.traits=legacyTraits();
    p.traits.slice(0,5).forEach(trait=>{trait.grade='A';trait.label=null;trait.rarity=null;trait.tagId=null;});
  }
  t.mock.method(Math,'random',()=>.05);
  startLitter(s,{species:'rabbit',mother:s.pets[0].id,father:s.pets[1].id},T);
  for(const p of s.rooms.rabbit.job.offspring) {
    assertNew(p);
    assert.deepEqual(p.traits.slice(0,5).map(trait=>trait.grade),['S','S','S','S','S']);
    assert.ok(getPetTags(p).every(tag=>tag.label&&tag.rarity==='普通'));
  }
});

test('旧存档货架和待产窝恢复时保留五标签，购买及出生不裁剪；迁移只执行一次',()=>{
  let now=T;
  const env={wall:()=>now,monotonic:()=>0};
  const game=new RequestGameStore(null,env),s=game.state;
  s.pets.forEach(legacyPet);s.rooms.rabbit.shelf.offers.forEach(legacyPet);
  startLitter(s,{species:'rabbit',mother:s.pets[0].id,father:s.pets[1].id},T);
  s.rooms.rabbit.job.offspring.forEach(legacyPet);
  const frozen=structuredClone(s.rooms.rabbit.job.offspring),stock=structuredClone(s.rooms.rabbit.shelf.offers[0]);
  const snapshot=game.snapshot();
  const restored=new RequestGameStore(snapshot,env);
  assert.equal(restored.dirty,true);
  assert.deepEqual(content(restored.state.pets[0]),content(snapshot.state.pets[0]));
  assert.equal(restored.state.rooms.rabbit.job.offspring[0].tagCount,5);
  const stable=new RequestGameStore(restored.snapshot(),env);
  assert.equal(stable.dirty,false);
  assert.deepEqual(stable.snapshot(),restored.snapshot());
  const bought=admitPurchasedPet(stable.state,stable.state.rooms.rabbit,stable.state.rooms.rabbit.shelf.offers[0],T);
  assert.deepEqual(content(bought),content(stock));assert.equal(bought.tagCount,5);assert.equal(bought.tagRulesVersion,1);
  now+=2*MINUTE;stable.shop();
  for(const original of frozen) {
    const born=stable.state.pets.find(p=>p.id===original.id);
    assert.deepEqual(content(born),content(original));assert.equal(born.tagCount,5);assert.equal(born.tagRulesVersion,1);
  }
  assert.deepEqual(snapshot.state.rooms.rabbit.job.offspring,frozen);
});

test('复评在实际已有标签等概率选择，旧五标签保留次数，旧指定维度请求拒绝且不扣券',t=>{
  for(let selected=0;selected<5;selected++) {
    const s=fresh(),pet=legacyPet(s.pets[0]);pet.reviews=2;s.rooms.rabbit.items.review=3;
    const before=content(pet),grades=pet.traits.map(x=>x.grade);
    const draws=[selected/5+.001,.95];t.mock.method(Math,'random',()=>draws.shift()??0);
    const text=careAction(s,'care.review',{species:'rabbit',id:pet.id},T);
    assert.equal(pet.reviewHistory.at(-1).field,selected);
    assert.equal(pet.traits[selected].rarity,'稀有');
    assert.deepEqual(pet.traits.map(x=>x.label),before.map(x=>x.label));
    assert.deepEqual(pet.traits.map(x=>x.grade),grades);
    assert.equal(getPetTags(pet).length,5);assert.equal(pet.reviews,3);assert.equal(s.rooms.rabbit.items.review,2);
    assert.match(text,/普通 → 稀有/);
    assert.throws(()=>careAction(s,'care.review',{species:'rabbit',id:pet.id},T),/不足/);
    t.mock.restoreAll();
  }
  const s=fresh(),p=s.pets[0];s.rooms.rabbit.items.review=1;
  const original=structuredClone(s);
  assert.throws(()=>careAction(s,'care.review',{species:'rabbit',id:p.id,field:0},T),/规则已更新/);
  assert.deepEqual(s,original);
});

test('复评回执写盘、重登和重复请求不重抽不重复扣券，旧回执仍可重放',t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'petshop-tags-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const env={wall:()=>T,monotonic:()=>0};
  let store=new GameStore(directory,env);store.shop();
  store.state.shopXp=1000;store.state.rooms.rabbit.items.review=3;
  const pet=legacyPet(store.state.pets[0]);pet.reviews=1;
  const oldArgs={species:'rabbit',id:pet.id,field:4};
  const oldResult={requestId:'legacy-review-done',message:'旧复评结果',version:store.state.version};
  store.state.receipts['legacy-review-done']={key:JSON.stringify(['care.review',{field:4,id:pet.id,species:'rabbit'}]),result:oldResult};
  store.save(store.state);
  store=new GameStore(directory,env);const shop=store.shop();
  const command={type:'care.review',args:{species:'rabbit',id:pet.id},requestId:'new-review-once',profileId:shop.profileId,version:shop.version};
  t.mock.method(Math,'random',()=>0);
  const result=store.act(command),saved=structuredClone(store.state);
  assert.deepEqual(store.act(command),result);assert.deepEqual(store.state,saved);
  store=new GameStore(directory,env);
  assert.deepEqual(store.act(command),result);
  assert.equal(store.state.pets.find(p=>p.id===pet.id).reviews,2);
  assert.equal(store.state.rooms.rabbit.items.review,2);
  assert.deepEqual(store.act({...command,requestId:'legacy-review-done',args:oldArgs}),oldResult);
});

test('普通订单按稳定ID且兼容旧标签名，复评不改资格但变价后整笔旧报价拒绝',t=>{
  const s=fresh(),p=legacyPet(s.pets[0]);s.rooms.rabbit.items.review=1;
  p.traits[0].tagId=tagIdFor(0,p.traits[0].label);
  const order={id:'new-tag-order',species:'rabbit',tagId:p.traits[0].tagId,tag:'不参与匹配的展示文字',rate:155,diff:1};
  s.orders[0]={order};
  const quote=quoted(s,'order',[p.id],order.id),balance=s.coins;
  t.mock.method(Math,'random',()=>0);
  careAction(s,'care.review',{species:'rabbit',id:p.id},T);
  assert.notEqual(salePrice(s,p,T,'order',155),quote.amounts[0]);
  assert.throws(()=>businessAction(s,'sale.commit',quote,T),/现价|重新核价/);
  assert.equal(s.coins,balance);assert.ok(s.pets.includes(p));
  const freshQuote=quoted(s,'order',[p.id],order.id);assert.equal(freshQuote.ids[0],p.id);
  delete order.tagId;order.tag=p.traits[0].label;
  assert.equal(quoted(s,'order',[p.id],order.id).ids[0],p.id);
  order.tagId=tagIdFor(1,'清秀');order.tag=p.traits[0].label;
  // Both real tags can match regardless of their display text. A different ID cannot.
  order.tagId='appearance:unknown';
  assert.throws(()=>quoted(s,'order',[p.id],order.id),/不再符合/);
});

test('新来客只要求真实已有标签与至少A；复评降档不失格，旧来客继续核验已显示稀有度',t=>{
  const s=fresh(),p=legacyPet(s.pets[0]);p.traits[0].grade='A';
  const others=s.pets[1];others.traits.forEach(trait=>trait.grade='B');
  s.visitors.sessions={'client:test':T};s.visitors.elapsed=10*MINUTE-5000;s.visitors.misses=2;
  businessHeartbeat(s,{clientId:'test',foreground:true},T+5000);
  const guest=s.visitors.active,request=guest.requirement;
  assert.equal(request.dimension,0);assert.equal(request.tagId,tagIdFor(0,'温顺'));
  assert.equal(request.tagRulesVersion,2);assert.equal(Object.hasOwn(request,'rarity'),false);
  p.traits[0].rarity='稀有';s.rooms.rabbit.items.review=1;
  t.mock.method(Math,'random',()=>0);
  careAction(s,'care.review',{species:'rabbit',id:p.id},T);
  assert.equal(p.traits[0].rarity,'普通');
  assert.equal(quoted(s,'guest',[p.id],guest.id).ids[0],p.id);
  guest.requirement={species:'rabbit',breed:p.breedKey,stage:'成年',dimension:0,tag:'温顺',rarity:'稀有'};
  assert.throws(()=>quoted(s,'guest',[p.id],guest.id),/不再符合/);
  p.traits[0].rarity='稀有';assert.equal(quoted(s,'guest',[p.id],guest.id).ids[0],p.id);
  p.traits[0].grade='B';assert.throws(()=>quoted(s,'guest',[p.id],guest.id),/不再符合/);
});

test('没有候选标签的物种不生成不可达标签委托，保留原难度与品种分支',()=>{
  const s=fresh();s.rooms.rabbit.shelf.offers=[];
  s.pets.forEach(p=>p.traits.slice(0,5).forEach(t=>{t.tagId=null;t.label=null;t.rarity=null;}));
  for(let sample=0;sample<60;sample++) {
    delete s.orders;initBusiness(s,T);
    for(const {order} of s.orders) {
      assert.ok(!order.tag&&!order.tagId);
      assert.equal(order.rate,[135,155,180][order.diff]);
      if(order.diff)assert.ok(order.breed);
    }
  }
});
