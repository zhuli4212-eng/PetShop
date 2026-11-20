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
  assert.match(old.visual.hint,/暂无营养餐/);
  assert.deepEqual(old.rows.map(r=>r.visual.stock),[0,0,0]);
  assert.equal(roomPage(g,'rabbit').presentation.nutrition,undefined);
  g.state.shopXp=36;
  g.state.coins=10_000;
  g.state.rooms.cat=structuredClone(g.state.rooms.rabbit);
  g.state.rooms.dog=structuredClone(g.state.rooms.rabbit);
  for(const [species,name,prices] of [['rabbit','兔兔',[80,90,100]],['cat','猫猫',[320,360,400]],['dog','狗狗',[800,900,1000]]]){
    g.state.rooms[species].nutritionStock={select:2};
    const page=g.page('roomNutrition',{species,tier:'select'}).page;
    assert.deepEqual(page.rows.map(r=>r.visual.rate),[1.5,1.8,2]);
    assert.deepEqual(page.rows.map(r=>r.visual.stock),[0,2,0]);
    assert.deepEqual(page.rows.map(r=>r.art),['quality','select','premium'].map(t=>`rooms/${species}-nutrition-${t}`));
    assert.equal(page.rows.filter(r=>r.visual.selected)[0].title,'精选'+name+'营养餐');
    assert.equal(page.actions[0].disabled,false);
    const detail=g.page('nutritionDetail',{species,tier:'select'}).page;
    assert.equal(detail.rows.find(r=>r.title==='库存').text,'2 份');
    assert.equal(detail.rows.find(r=>r.title==='价格').text,prices[1]+' 金币');
    const shop=g.page('nutritionShop',{species,tier:'select'}).page;
    assert.deepEqual(shop.rows.map(r=>r.visual.price),prices);
    assert.deepEqual(shop.rows.map(r=>r.visual.stock),[0,2,0]);
    assert.equal(shop.rows[1].current,true);
    for(const [index,row] of shop.rows.entries()){
      const {type,args,confirm}=row.action, price=prices[index], before=g.state.coins;
      assert.deepEqual(args,{species,tier:['quality','select','premium'][index],price});
      assert.match(confirm,new RegExp('花费 '+price+' 金币'));
      g.act(request(g,type,args));
      assert.equal(g.state.coins,before-price);
      assert.equal(g.state.rooms[species].nutritionStock[args.tier],index===1?3:1);
    }
  }
});

test('购买营养餐按已确认的单价扣款入库存，重试、拒绝与投喂各自独立',()=>{
  const clock=fixture(),g=clock.make();
  const args={species:'rabbit',tier:'premium',price:100};
  assert.throws(()=>g.act(request(g,'care.buyNutrition',args)),/培育中心/);
  g.state.shopXp=36;
  const locked=g.page('nutritionShop',{species:'cat'}).page.rows[2].action;
  assert.equal(locked.disabled,true);
  assert.throws(()=>g.act(request(g,'care.buyNutrition',locked.args)),/请先开放/);
  assert.throws(()=>g.act(request(g,'care.buyNutrition',{...args,price:10})),/报价有变化/);
  assert.throws(()=>g.act(request(g,'care.buyNutrition',{...args,tier:'invalid'})),/档次/);
  assert.equal(g.state.coins,680);
  assert.equal(g.state.rooms.rabbit.nutritionStock,undefined);

  const purchase=request(g,'care.buyNutrition',args);
  const applied=g.act(purchase);
  assert.deepEqual(g.act(purchase),applied);
  assert.equal(g.state.coins,580);
  assert.deepEqual(g.state.rooms.rabbit.nutritionStock,{premium:1});
  assert.equal(g.state.rooms.rabbit.nutrition,undefined);

  feed(g,'rabbit','premium');
  const effect=structuredClone(g.state.rooms.rabbit.nutrition);
  g.act(request(g,'care.buyNutrition',args));
  const reopened=clock.make(g.snapshot());
  assert.equal(reopened.state.coins,480);
  assert.deepEqual(reopened.state.rooms.rabbit.nutritionStock,{premium:1});
  assert.deepEqual(reopened.state.rooms.rabbit.nutrition,effect);

  reopened.state.coins=99;
  const unaffordable=reopened.page('nutritionShop',{species:'rabbit'}).page.rows[2].action;
  assert.equal(unaffordable.disabled,true);
  assert.throws(()=>reopened.act(request(reopened,'care.buyNutrition',unaffordable.args)),/金币不足/);
  assert.equal(reopened.state.coins,99);
  assert.equal(reopened.state.rooms.rabbit.nutritionStock.premium,1);
});

test('培育中心混排已开房间的在售种源、营养餐和物品',()=>{
  const g=fixture().make();
  g.state.shopXp=36;
  g.state.coins=10_000;
  g.state.rooms.cat={...structuredClone(g.state.rooms.rabbit),shelf:null};
  const read=tab=>g.page('lab',{tab}).page.rows;
  assert.deepEqual(read('seed').map(r=>r.link.args.species),['rabbit','cat','rabbit','cat']);
  assert.deepEqual(read('nutrition').map(r=>r.action.args.species),['rabbit','cat','rabbit','cat','rabbit','cat']);
  assert.deepEqual(read('nutrition').map(r=>r.visual.price),[80,320,90,360,100,400]);
  assert.deepEqual(read('services').map(r=>r.action.args.species),Array.from({length:6},()=>['rabbit','cat']).flat());
  assert.deepEqual(read('services').filter(r=>r.action.args.species==='rabbit').map(r=>r.action.args.item),
    ['review','guide','single','double','reshape','antiAge']);
  const cat=read('seed').find(r=>r.link.args.species==='cat');
  assert.equal(cat.animal.stage,'幼年');
  assert.equal(cat.animal.status,'未繁育');
  assert.equal(cat.animal.number,cat.link.args.id.slice(0,5).toUpperCase());
  const buy=g.page('offer',cat.link.args).page.actions[0];
  assert.throws(()=>g.act(request(g,buy.type,{...buy.args,species:'dog'})),/请先开放/);
  g.act(request(g,buy.type,buy.args));
  assert.ok(!read('seed').some(r=>r.link.args.id===cat.link.args.id));
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
