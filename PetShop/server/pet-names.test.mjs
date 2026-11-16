import test from 'node:test';
import assert from 'node:assert/strict';
import { careAction, initCare, tickCare, SPECIES } from './care.mjs';
import { purchasePrice, youngPurchaseBase } from './business.mjs';
import { petNames, takePetName } from './pet-names.mjs';

const now=Date.UTC(2026,10,16), minute=60_000, day=24*60*minute;
function shop() {
  const s={coins:40000,ratingBps:0};
  initCare(s,now);
  s.care.seed='test-shop-name-seed';
  s.rooms.rabbit.shelf=null;
  tickCare(s,now);
  return s;
}
function allNames(s) {
  const names=s.pets.map(p=>p.name);
  for(const room of Object.values(s.rooms)) {
    names.push(...room.shelf.offers.filter(Boolean).map(p=>p.name));
    names.push(...(room.job?.offspring??[]).map(p=>p.name));
  }
  return names;
}
function buy(s,species,offer) {
  const price=purchasePrice(s,youngPurchaseBase(offer));
  return careAction(s,'care.buyPet',{species,id:offer.id,batch:s.rooms[species].shelf.number,price},now);
}
function withoutNames(offers) {
  return offers.map(({name,...properties})=>properties);
}

test('名字库提供不同的中文短名，全部用完后也能跳过旧编号',()=>{
  assert.ok(petNames.length>=300);
  assert.equal(new Set(petNames).size,petNames.length);
  assert.ok(petNames.every(name=>/^[\u3400-\u9fff]{2,3}$/u.test(name)));
  const used=new Set(petNames);
  const base=petNames[0];
  used.add(base+'·2');used.add(base+'·3');
  assert.equal(takePetName(used,0),base+'·4');
  assert.equal(takePetName(used,0),base+'·5');
});

test('多日签到、跨物种新房礼包、各房货架和同窝幼体共用店内名字',t=>{
  t.mock.method(Math,'random',()=>0);
  const s=shop();
  careAction(s,'care.checkin',{},now);
  assert.deepEqual(s.pets.map(p=>p.name),['小花','小白','谷穗','小麦']);
  const [mother,father]=s.pets;
  careAction(s,'care.breed',{mother:mother.id,father:father.id},now);
  const promised=structuredClone(s.rooms.rabbit.job.offspring);
  for(const species of ['cat','dog']) {
    careAction(s,'care.unlock',{species,price:SPECIES[species].roomCost},now);
    const pair=s.pets.filter(p=>p.species===species);
    assert.deepEqual(s.rooms[species].openingReceipt.pair.map(p=>p.name),pair.map(p=>p.name));
  }
  const [offer]=s.rooms.dog.shelf.offers,price=purchasePrice(s,youngPurchaseBase(offer)),before=s.coins;
  assert.match(buy(s,'dog',offer),new RegExp(offer.name+'已入住'));
  assert.equal(s.coins,before-price);
  assert.equal(s.pets.at(-1).name,offer.name);
  assert.equal(s.pets.at(-1).id,offer.id);
  const names=allNames(s);
  assert.equal(new Set(names).size,names.length);
  tickCare(s,now+2*minute);
  assert.deepEqual(s.pets.slice(-promised.length),promised);
  for(let d=1;d<=7;d++) careAction(s,'care.checkin',{},now+d*day);
  const after=allNames(s);
  assert.equal(new Set(after).size,after.length);
});

test('换批名字避让其他房在售名字和在册名字，只影响新批次的名字',()=>{
  const s=shop(),at=now+30*minute;
  careAction(s,'care.unlock',{species:'cat',price:SPECIES.cat.roomCost},now+10*minute);
  const control=structuredClone(s);
  tickCare(control,at);
  const predicted=control.rooms.rabbit.shelf.offers;
  s.pets[0].name=predicted[0].name;
  s.rooms.cat.shelf.offers[0].name=predicted[1].name;
  const cat=structuredClone(s.rooms.cat.shelf), restart=structuredClone(s);
  tickCare(s,at);tickCare(restart,at);
  assert.deepEqual(s.rooms.cat.shelf,cat);
  const actual=s.rooms.rabbit.shelf.offers;
  assert.ok(actual.every(p=>predicted.every(old=>old.name!==p.name)));
  assert.deepEqual(withoutNames(actual),withoutNames(predicted));
  assert.deepEqual(s.rooms.rabbit.shelf,restart.rooms.rabbit.shelf);
  assert.equal(tickCare(s,at+minute),false);
  assert.deepEqual(s.rooms.rabbit.shelf.offers,actual);
});

test('旧档重名留在动物与既有快照，买入旧重名货位只说明本次入住新名',()=>{
  const s=shop(),[mother,father]=s.pets;
  mother.name='旧团'; father.name='旧团';
  careAction(s,'care.breed',{mother:mother.id,father:father.id},now);
  const room=s.rooms.rabbit;
  for(const child of room.job.offspring) child.name='旧团';
  room.shelf.offers[0].name='旧团';
  const saved=JSON.stringify(s),restored=JSON.parse(saved);
  initCare(restored,now);tickCare(restored,now);
  assert.equal(JSON.stringify(restored),saved);
  const offered=restored.rooms.rabbit.shelf.offers[0];
  const previousPets=structuredClone(restored.pets),job=structuredClone(restored.rooms.rabbit.job);
  const receipt=buy(restored,'rabbit',offered);
  const arrived=restored.pets.at(-1);
  assert.notEqual(arrived.name,offered.name);
  assert.equal(arrived.id,offered.id);
  assert.ok(receipt.includes(offered.name)&&receipt.includes(arrived.name));
  assert.deepEqual(restored.pets.slice(0,-1),previousPets);
  assert.deepEqual(restored.rooms.rabbit.job,job);
  tickCare(restored,job.endsAt);
  assert.deepEqual(restored.pets.slice(-job.offspring.length),job.offspring);
});

test('名字碰撞与名字耗尽均保持原版遗传随机序列',t=>{
  const base=shop(),crowded=structuredClone(base);
  crowded.pets.push(...petNames.map(name=>({...base.pets[0],id:'tester-'+name,name})));
  let seed,draws;
  t.mock.method(Math,'random',()=>{
    draws++;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/2**32;
  });
  function breed(s) {
    seed=251;draws=0;
    const [mother,father]=s.pets;
    careAction(s,'care.breed',{mother:mother.id,father:father.id},now);
    assert.equal(draws,94);
    return s.rooms.rabbit.job.offspring.map(({sex,breedKey,coatIndex,traits})=>({sex,breedKey,coatIndex,traits}));
  }
  const expected=breed(base);
  assert.deepEqual(expected.map(p=>[p.sex,p.coatIndex,p.traits.map(t=>t.grade).join('')]),
    [['母',3,'BABBBB'],['公',1,'ABCBBB'],['母',2,'BBBABB'],['公',2,'BBBACB']]);
  assert.deepEqual(breed(crowded),expected);
  assert.ok(crowded.rooms.rabbit.job.offspring.every(p=>p.name.includes('·')));
});
