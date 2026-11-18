import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RequestGameStore } from './request-store.mjs';
import { lifeDates, stageOf } from './care.mjs';

const minutes=60_000, start=Date.UTC(2026,10,18,4);
function fixture(){
  let now=start;
  const options={wall:()=>now,monotonic:()=>0};
  return {
    make(snapshot=null){return new RequestGameStore(snapshot,options);},
    at(elapsed){now=start+elapsed;},
  };
}
function request(g,type,args){
  const {profileId,version}=g.shop();
  return {requestId:randomUUID(),profileId,version,type,args};
}
const feed=(g,species,tier)=>g.act(request(g,'care.feed',{species,tier}));
const roomPage=(g,species)=>g.page('rooms',{species}).page;

test('按物种与档次展示库存、图标和倍率，现有存档默认无库存',()=>{
  const g=fixture().make();
  const old=g.page('roomNutrition',{species:'rabbit'}).page;
  assert.equal(old.actions[0].disabled,true);
  assert.match(old.visual.hint,/库存 0 份/);
  assert.equal(roomPage(g,'rabbit').presentation.nutrition,undefined);
  g.state.shopXp=36;
  g.state.rooms.cat=structuredClone(g.state.rooms.rabbit);
  g.state.rooms.dog=structuredClone(g.state.rooms.rabbit);
  for(const [species,name] of [['rabbit','兔兔'],['cat','猫猫'],['dog','狗狗']]){
    g.state.rooms[species].nutritionStock={select:2};
    const page=g.page('roomNutrition',{species,tier:'select'}).page;
    assert.deepEqual(page.rows.map(r=>r.visual.rate),[1.5,1.8,2]);
    assert.deepEqual(page.rows.map(r=>r.art),['quality','select','premium'].map(t=>`rooms/${species}-nutrition-${t}`));
    assert.equal(page.rows.filter(r=>r.visual.selected)[0].title,'精选'+name+'营养餐');
    assert.equal(page.actions[0].disabled,false);
    const detail=g.page('nutritionDetail',{species,tier:'select'}).page;
    assert.equal(detail.rows.find(r=>r.title==='库存').text,'2 份');
    assert.equal(detail.rows.find(r=>r.title==='价格').text,'待定');
    assert.equal(g.page('nutritionShop',{species}).page.actions,undefined);
  }
});

test('投喂按房间扣一份，防重、防叠加，只提前成年前的时点',()=>{
  const clock=fixture(),g=clock.make();
  const [mother,father]=g.state.pets;
  const rabbit={...structuredClone(mother),id:'young-rabbit',bornAt:start-4*minutes};
  const cat={...structuredClone(father),id:'young-cat',species:'cat',breedKey:'british',bornAt:start-20*minutes};
  g.state.pets.push(rabbit,cat);
  g.state.rooms.cat=structuredClone(g.state.rooms.rabbit);
  g.state.rooms.rabbit.nutritionStock={quality:1,premium:1};
  g.state.rooms.cat.nutritionStock={select:2};
  const originalCat=lifeDates(cat),originalRabbit=lifeDates(rabbit),originalAdult=lifeDates(mother);
  assert.throws(()=>feed(g,'rabbit','select'),/库存不足/);
  assert.throws(()=>feed(g,'dog','premium'),/请先开放/);
  const command=request(g,'care.feed',{species:'rabbit',tier:'quality'});
  const applied=g.act(command);
  assert.deepEqual(g.act(command),applied);
  assert.deepEqual(g.state.rooms.rabbit.nutritionStock,{quality:0,premium:1});
  assert.equal(g.state.rooms.cat.nutritionStock.select,2);
  assert.throws(()=>feed(g,'rabbit','premium'),/仍在生效/);
  const dates=id=>lifeDates(g.state.pets.find(p=>p.id===id));
  assert.deepEqual(dates(rabbit.id),{...originalRabbit,growthAt:start+320_000,adultAt:start+1_040_000});
  assert.deepEqual(dates(cat.id),originalCat);
  assert.deepEqual(dates(mother.id),originalAdult);
  feed(g,'cat','select');
  assert.equal(dates(cat.id).adultAt,start+46*minutes);
  assert.equal(dates(cat.id).deathAt,originalCat.deathAt);
  assert.equal(roomPage(g,'cat').presentation.nutrition.rate,1.8);
  clock.at(30*minutes);
  assert.equal(roomPage(g,'cat').presentation.nutrition,undefined);
  feed(g,'cat','select');
  assert.equal(dates(cat.id).adultAt,start+30*minutes+Math.ceil(16*minutes*10/18));
  assert.equal(g.state.rooms.cat.nutritionStock.select,0);
  assert.equal(g.state.coins,680);
});

test('离线出生按预计出生时刻共享余时，繁育期限和寿命不受影响',()=>{
  for(const birthInWindow of [true,false]){
    const clock=fixture(),g=clock.make();
    const [mother,father]=g.state.pets;
    g.state.rooms.rabbit.nutritionStock={premium:1};
    feed(g,'rabbit','premium');
    const when= birthInWindow ? 27 : 29;
    clock.at(when*minutes);
    g.act(request(g,'care.breed',{species:'rabbit',mother:mother.id,father:father.id}));
    const job=g.state.rooms.rabbit.job;
    assert.equal(job.endsAt,start+(when+2)*minutes);
    const saved=g.snapshot();
    clock.at(40*minutes);
    const reopened=clock.make(saved);
    assert.equal(roomPage(reopened,'rabbit').presentation.nutrition,undefined);
    assert.equal(reopened.state.rooms.rabbit.job,null);
    assert.equal(reopened.state.rooms.rabbit.nutritionStock.premium,0);
    const children=reopened.state.pets.filter(p=>p.motherId===mother.id);
    assert.equal(children.length,job.offspring.length);
    for(const child of children){
      assert.equal(child.bornAt,job.endsAt);
      const natural=lifeDates({...child,maturation:undefined}),actual=lifeDates(child);
      const shift=birthInWindow?minutes:0;
      assert.deepEqual(actual,{...natural,growthAt:natural.growthAt-shift,adultAt:natural.adultAt-shift});
      assert.equal(stageOf(child,actual.adultAt),'成年');
    }
  }
});
