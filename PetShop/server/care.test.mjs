import test from 'node:test';
import assert from 'node:assert/strict';
import { initCare, tickCare, careAction, carePage, stageOf, stageEnd, isBusy, petArt, GRADES, SPECIES, lifeDates, beijingTime } from './care.mjs';
import { businessAction, businessPage, initBusiness, purchasePrice, youngPurchaseBase, salePrice } from './business.mjs';

const T=Date.UTC(2026,10,16,15,55), M=60000, D=86400000;
function fresh() {const s={coins:680,ratingBps:0,research:{rabbit:[0,0,0],cat:[0,0,0],dog:[0,0,0]}};initCare(s,T);return s;}

test('新房核价与入住记录按成交时刻保存，之后的消费与动物离店不改回执',()=>{
  const s=fresh(); s.ratingBps=10000; s.coins=2850;
  const offer=carePage(s,'rooms',{species:'cat'},T);
  assert.equal(offer.presentation.estimate,beijingTime(T+90*M).slice(0,16));
  const open=offer.actions[0];
  assert.equal(open.disabled,false);assert.match(open.confirm,/余 0 金币/);
  careAction(s,open.type,open.args,T+M);
  const cats=s.pets.filter(p=>p.species==='cat');
  const receiptArgs={species:'cat'};
  const receipt=carePage(s,'roomReceipt',receiptArgs,T+M);
  for(const pet of cats)assert.ok(receipt.rows.some(row=>row.title.includes(pet.id.slice(0,5).toUpperCase())&&row.title.includes(pet.sex)));
  assert.ok(receipt.rows.some(r=>r.text===beijingTime(T+91*M)));
  assert.match(receipt.rows.at(-1).text,/2850 金币.*余额 0/);
  assert.ok(carePage(s,'rooms',receiptArgs,T+M).rows.some(r=>r.link?.page==='roomReceipt'));
  s.pets=s.pets.filter(p=>p.species!=='cat');s.coins=865;
  assert.deepEqual(carePage(structuredClone(s),'roomReceipt',receiptArgs,T+D),receipt);
  assert.throws(()=>careAction(s,open.type,open.args,T+D),/已经开放/);
});

test('个体档案使用实际出生/成年时刻、结算估值及复评明细，兼容仅保存次数的旧档',()=>{
  const s=fresh(), p=s.pets[0], args={id:p.id};
  s.research.rabbit[2]=4;s.ratingBps=310;p.bred=true;p.honor=.4;
  const read=at=>carePage(s,'pet',args,at).rows;
  const value=(rows,title)=>rows.find(row=>row.title===title)?.text;
  assert.equal(value(read(T),'实际年龄'),'30 分钟');
  assert.equal(value(read(T),'成年时刻'),beijingTime(T)+'（北京）');
  assert.match(value(read(T),'阶段与繁育'),/22%/);
  assert.equal(value(read(T),'当前市场估值'),salePrice(s,p,T,'market')+' 金币');
  p.reviews=1;s.rooms.rabbit.items.review=1;
  const old=p.traits[0].label;
  careAction(s,'care.review',{species:'rabbit',id:p.id,field:0},T+M);
  const history=carePage(structuredClone(s),'pet',args,T+M).rows;
  assert.match(value(history,'早期复评'),/1 次/);
  assert.ok(value(history,'性格复评').includes(old+'（普通） → '+p.traits[0].label));
  const died=lifeDates(p).deathAt;
  assert.equal(value(read(died+D),'自然寿终'),beijingTime(died)+'（北京）');
  assert.equal(value(read(died+D),'寿终时年龄'),value(read(died),'寿终时年龄'));
  assert.equal(value(read(died),'当前回收估值'),salePrice(s,p,died,'recycle')+' 金币');
});

test('出生结果区分双亲的出生时状态、后续离店及旧存档的不完整记录',()=>{
  const s=fresh(); const [mother,father]=s.pets;
  mother.bornAt=T-(30*M+4*D)+M;
  careAction(s,'care.breed',{species:'rabbit',mother:mother.id,father:father.id},T);
  tickCare(s,T+2*M);
  const args={species:'rabbit'}, read=()=>carePage(s,'litter',args,T+3*M).rows;
  const motherRow=rows=>rows.find(row=>row.title.startsWith('母本'));
  const fatherRow=rows=>rows.find(row=>row.title.startsWith('父本'));
  assert.match(motherRow(read()).text,/出生时.*已自然寿终/);
  assert.match(fatherRow(read()).text,/出生时仍在世.*目前仍在房内/);
  s.sales=[{at:T+3*M,channel:'market',lines:[{id:father.id}]}];
  s.pets=s.pets.filter(p=>p.id!==father.id);
  assert.match(fatherRow(read()).text,/已出售离店/);
  delete s.rooms.rabbit.lastLitter.parents;
  assert.match(motherRow(read()).text,/出生时.*已自然寿终/);
  assert.match(fatherRow(read()).text,/旧记录.*已出售离店/);
  s.pets=[];assert.match(motherRow(read()).text,/旧记录/);
});

test('房间共用名册和筛选，选择两只亲本后才显示核对入口',()=>{
  const s=fresh(),[mother,father]=s.pets;
  const rooms=carePage(s,'rooms',{},T), args={species:'rabbit',sex:'母'};
  const book=carePage(s,'rooms',args,T);
  assert.deepEqual(carePage(s,'roomRoster',args,T),book);
  assert.deepEqual(rooms.tabs.map(t=>[t.args.species,t.locked]),[['rabbit',false],['cat',true],['dog',true]]);
  assert.ok(!(rooms.actions||[]).some(a=>a.type==='care.unlock'));
  const gate=carePage(s,'rooms',{species:'cat'},T);
  for(const species of ['cat','dog'])for(const page of ['rooms','roomRoster','breed','shelf','services','review']){
    assert.equal(carePage(s,page,{species},T).art,'rooms/unfinished-room');
  }
  const buy=gate.actions.find(a=>a.type==='care.unlock');
  assert.ok(buy.disabled);assert.equal(buy.args.species,'cat');
  const shelfGate=carePage(s,'shelf',{species:'cat'},T);
  assert.deepEqual(shelfGate.actions.map(a=>[a.page,a.args.species]),[['rooms','cat']]);
  s.coins=4000;careAction(s,buy.type,buy.args,T);
  assert.equal(carePage(s,'rooms',{species:'cat'},T).art,SPECIES.cat.art);
  assert.deepEqual(carePage(s,'rooms',{species:'cat'},T).tabs.map(t=>t.locked),[false,false,true]);
  assert.ok(!(carePage(s,'roomRoster',{species:'cat'},T).actions||[]).some(a=>a.type==='care.unlock'));
  assert.equal(book.rows.filter(row=>row.animal).length,1);
  assert.equal(book.rows.find(row=>row.animal).animal.id,mother.id);
  assert.equal(book.presentation.count,2);
  assert.equal(book.presentation.matchedCount,1);
  assert.deepEqual(book.presentation.residents.map(p=>p.id),[mother.id]);
  assert.ok(book.tabs.every(t=>t.page==='rooms'));
  assert.ok(book.filters.flat().every(option=>option.page==='rooms'));
  const dead=book.filters[0].find(option=>option.label==='已故');
  assert.deepEqual(dead.args,{species:'rabbit',filter:'已故',sex:'母'});
  const empty=carePage(s,dead.page,dead.args,T);
  assert.equal(empty.presentation.matchedCount,0);
  assert.deepEqual(empty.presentation.residents,[]);
  assert.equal(empty.filters[1].find(option=>option.label==='公').args.filter,'已故');
  const info=carePage(s,'pet',{id:mother.id},T).presentation;
  assert.equal(info.animal.art,petArt(mother));
  assert.deepEqual(info.traits,mother.traits);
  const one=carePage(s,'breed',{picking:true,father:father.id},T).presentation;
  assert.deepEqual(one.parents.map(p=>p?.id??null),[null,father.id]);
  assert.ok(!one.confirm);
  const both=carePage(s,'breed',{picking:true,mother:mother.id,father:father.id},T).presentation;
  const review=carePage(s,both.confirm.page,both.confirm.args,T);
  assert.equal(review.presentation.kind,'pairConfirm');
  const edit=review.actions.find(a=>a.label==='修改亲本');
  assert.deepEqual(carePage(s,edit.page,edit.args,T).presentation.parents.map(p=>p.id),[mother.id,father.id]);
  const petActions=carePage(s,'pet',{id:mother.id},T).actions;
  assert.equal(petActions.find(a=>a.page==='market').args.preselectId,mother.id);
  assert.ok(!petActions.some(a=>a.page==='recycle'));
  const deceasedActions=carePage(s,'pet',{id:mother.id},T+5*D).actions;
  assert.deepEqual(deceasedActions.find(a=>a.page==='recycle').args,{species:'rabbit',preselectId:mother.id});
  assert.equal(s.rooms.rabbit.job,null);
});

test('房景按登记顺序取筛选后名册前十只，死者、种源与未繁育按实际标签匹配',()=>{
  const s=fresh(),[mother,father]=s.pets;
  careAction(s,'care.retain',{id:mother.id,retained:true},T);
  careAction(s,'care.breed',{species:'rabbit',mother:mother.id,father:father.id},T);
  s.coins=3000;
  careAction(s,'care.unlock',{species:'cat',price:3000},T);
  const make=(id,sex,extra={})=>({...structuredClone(father),id,name:id,sex,retained:false,...extra});
  const dead=make('held-dead','母',{bornAt:T-5*D,retained:true});
  const unmarkedDead=make('unmarked-dead','公',{bornAt:T-5*D});
  const spent=make('spent','母',{retained:true,bred:true});
  const free=Array.from({length:13},(_,i)=>make('animal-'+(21-i),i%2?'公':'母',{
    bornAt:i===0?T:T-30*M,retained:true,
  }));
  const remainder=[dead,...free.slice(0,7),spent,unmarkedDead,...free.slice(7)];
  s.pets.push(...remainder);
  s.sales=[{lines:[{id:'departed'}]}];
  const all=[mother,father,...remainder];

  function check(args,expected) {
    const page=carePage(s,'roomRoster',args,T);
    const animals=page.rows.filter(row=>row.animal).map(row=>row.animal);
    assert.deepEqual(animals.map(p=>p.id),expected.map(p=>p.id));
    assert.equal(page.presentation.count,all.length);
    assert.equal(page.presentation.matchedCount,expected.length);
    assert.deepEqual(page.presentation.residents,animals.slice(0,10));
    assert.deepEqual(page.animals,page.presentation.residents.map(p=>p.art));
    assert.deepEqual(page.animalStages,page.presentation.residents.map(p=>p.stage));
    assert.deepEqual(page.filters[0].map(o=>o.label),['全部','种源','未繁育','已故']);
    return page;
  }
  const initial=check({},all);
  assert.equal(initial.filters[0].find(o=>o.active).label,'全部');
  check({filter:'种源'},[mother,...remainder.filter(p=>p.retained)]);
  check({filter:'未繁育'},free);
  check({filter:'已故'},[dead,unmarkedDead]);
  check({filter:'未繁育',sex:'母'},free.filter(p=>p.sex==='母'));
  const held=check({filter:'种源',sex:'母'},[mother,...remainder.filter(p=>p.retained&&p.sex==='母')]);
  assert.match(held.rows.find(r=>r.animal?.id===dead.id).text,/已故 · 种源保护/);
  assert.ok(held.filters[0].every(o=>o.args.sex==='母'));
  assert.ok(held.filters[1].every(o=>o.args.filter==='种源'));

  for(const [oldLabel,newLabel] of [['后备种源','种源'],['可配对','未繁育'],['在养','全部']]) {
    assert.deepEqual(carePage(s,'rooms',{filter:oldLabel,sex:'母'},T),carePage(s,'rooms',{filter:newLabel,sex:'母'},T));
  }
  check({filter:'未知',sex:'未知'},all);
  s.pets=s.pets.filter(p=>p!==unmarkedDead);
  all.splice(all.indexOf(unmarkedDead),1);
  check({filter:'已故',sex:'公'},[]);
});

test('开店种兔、每日单独领取、北京零点和成长精确边界',()=>{
  const s=fresh();
  assert.deepEqual(s.pets.map(p=>[p.name,p.sex,p.coatIndex,stageOf(p,T)]),[['小花','母',1,'成年'],['小白','公',2,'成年']]);
  const original=structuredClone(s.pets);
  initCare(s,T+1000);assert.deepEqual(s.pets,original);
  careAction(s,'care.checkin',{},T);
  assert.throws(()=>careAction(s,'care.checkin',{},T+4*M),/已领取/);
  const p=s.pets[2];
  for(const [offset,stage] of [[0,'幼年'],[12*M-1,'幼年'],[12*M,'成长'],[30*M,'成年'],[30*M+3*D,'老年'],[30*M+4*D,'已故']]){
    assert.equal(stageOf(p,T+offset),stage);
  }
  assert.equal(stageEnd(p,T),T+12*M);
  assert.equal(stageEnd(p,T+30*M+4*D),null);
  careAction(s,'care.checkin',{},T+5*M);assert.equal(s.pets.length,6);
  assert.equal(petArt(p),'pets/domestic-coat01_female');
});

test('一生一窝、等待跨寿终和重启离线补生，幼体从计划出生时点计龄',()=>{
  const s=fresh(),[mother,father]=s.pets;
  mother.bornAt=T-(30*M+4*D)+M;
  for(const p of [mother,father])careAction(s,'care.retain',{id:p.id,retained:true},T);
  const pairing={species:'rabbit',mother:mother.id,father:father.id};
  careAction(s,'care.breed',pairing,T);
  assert.ok(isBusy(s,mother));assert.throws(()=>careAction(s,'care.breed',pairing,T+1),/正在培育/);
  const progress=carePage(s,'breed',{},T);
  assert.ok(progress.rows[0].text.includes('2 分钟'));
  assert.deepEqual(progress.actions.map(a=>[a.label,a.page,a.args.species]),[['前往动物房间','rooms','rabbit']]);
  const restored=JSON.parse(JSON.stringify(s));
  tickCare(restored,T+M);
  assert.ok(restored.pets.every(p=>p.retained));
  assert.equal(restored.pets.length,2);
  assert.equal(stageOf(restored.pets[0],T+M),'已故');
  careAction(restored,'care.checkin',{},T+M);
  const untouched=restored.care.claimIds[0];
  careAction(restored,'care.retain',{id:untouched,retained:true},T+M);
  tickCare(restored,T+40*M);
  assert.equal(restored.rooms.rabbit.job,null);
  assert.ok(restored.pets.slice(0,2).every(p=>p.bred&&!p.retained));
  assert.equal(restored.pets.find(p=>p.id===untouched).retained,true);
  const kids=restored.pets.filter(p=>p.source==='本店繁育');
  assert.ok([3,4,5].includes(kids.length));
  assert.ok(kids.every(k=>k.bornAt===T+2*M&&stageOf(k,T+40*M)==='成年'&&k.motherId===mother.id&&k.breedKey==='angora'&&!k.mixed));
  assert.equal(new Set(restored.pets.map(p=>p.id)).size,restored.pets.length);
  const stable=JSON.stringify(restored);tickCare(restored,T+40*M);
  assert.equal(JSON.stringify(restored),stable);
  assert.ok(restored.pets[1].bred&&!isBusy(restored,restored.pets[1]));
  assert.throws(()=>careAction(restored,'care.breed',pairing,T+40*M),/可繁育/);
  assert.equal(carePage(restored,'litter',{species:'rabbit'},T+40*M).animals.length,3);
});

test('三物种独立房间、幼体成熟时间、双亲快照与指导',()=>{
  const s=fresh();s.coins=40000;
  for(const species of ['cat','dog']){
    const cfg=SPECIES[species],args={species,price:purchasePrice(s,cfg.roomCost)};
    const before=s.coins;
    careAction(s,'care.unlock',args,T);
    const pair=s.pets.filter(p=>p.species===species);
    assert.deepEqual(pair.map(p=>p.sex),['公','母']);assert.ok(pair.every(p=>p.breedKey===cfg.breeds[0]&&stageOf(p,T)==='幼年'&&p.traits.every(t=>t.grade==='B')));
    assert.throws(()=>careAction(s,'care.unlock',args,T),/已经开放/);assert.equal(s.coins,before-args.price);
    const [father,mother]=pair;const mating={species,mother:mother.id,father:father.id,guide:1};
    const start=T+(cfg.young+cfg.growth)*M;
    assert.throws(()=>careAction(s,'care.breed',mating,start-1),/可繁育/);
    careAction(s,'care.buyItem',{species,item:'guide',price:purchasePrice(s,cfg.guide)},start);
    assert.throws(()=>careAction(s,'care.breed',mating,start),/评分相同/);
    assert.equal(s.rooms[species].items.guide,1);
    mother.traits[1].grade='A';mother.mixed=true;
    careAction(s,'care.breed',mating,start);
    assert.equal(s.rooms[species].items.guide,0);
    assert.equal(s.rooms[species].job.options.guide,1);
    assert.equal(s.rooms[species].job.mother.traits[1].grade,'A');
    mother.traits[1].grade='E';
    assert.equal(s.rooms[species].job.mother.traits[1].grade,'A');
    const kids=s.rooms[species].job.offspring;
    assert.ok(kids.every(k=>k.mixed&&k.bornAt===start+cfg.wait*M&&k.traits.every(t=>GRADES.includes(t.grade))));
  }
  assert.ok(s.rooms.dog.job&&s.rooms.cat.job);
});

test('核对亲本所示登记品种与整窝出生一致，杂交外形不能交纯种订单',()=>{
  const cases=[
    {fatherBreed:'lop',motherMixed:false,registration:'杂交',appearance:'每只幼体独立决定外形，安哥拉兔和垂耳兔各占 50%。'},
    {fatherBreed:'angora',motherMixed:true,registration:'杂交',appearance:'幼体都是安哥拉兔外形。'},
    {fatherBreed:'angora',motherMixed:false,registration:'安哥拉兔',appearance:'幼体都是安哥拉兔外形。'},
  ];
  for(const {fatherBreed,motherMixed,registration,appearance} of cases){
    const s=fresh(),[mother,father]=s.pets;
    initBusiness(s,T);
    father.breedKey=fatherBreed;mother.mixed=motherMixed;
    assert.notEqual(mother.coatIndex,father.coatIndex);
    const args={species:'rabbit',mother:mother.id,father:father.id},now=T+2*M;
    const confirm=carePage(s,'breed',args,T);
    assert.deepEqual(confirm.rows[0],{title:'后代登记品种 · '+registration,text:appearance});
    const begin=confirm.actions.find(a=>a.type==='care.breed');
    careAction(s,begin.type,begin.args,T);tickCare(s,now);
    const children=s.pets.filter(p=>p.source==='本店繁育'),mixed=registration==='杂交';
    assert.ok(children.length>=3);
    for(const p of children){
      assert.equal(p.mixed,mixed);
      assert.ok([mother.breedKey,father.breedKey].includes(p.breedKey));
      assert.equal(carePage(s,'pet',{id:p.id},now).presentation.animal.breed,registration);
    }
    const order=s.orders[0].order;
    order.breed=children[0].breedKey;
    const checkout={channel:'order',targetId:order.id,ids:[children[0].id]};
    const qualified=businessPage(s,'sale',checkout,now).rows.map(r=>r.select);
    assert.equal(qualified.includes(children[0].id),!mixed);
    if(mixed)assert.throws(()=>businessPage(s,'saleQuote',checkout,now),/不再符合/);
    else assert.equal(businessPage(s,'saleQuote',checkout,now).actions[0].type,'sale.commit');
  }
});

test('货架限本批二格，普通研究不能改变货品，刷新仅保留当前批',()=>{
  const s=fresh(),room=s.rooms.rabbit;
  const original=structuredClone(room.shelf);
  const [p,mate]=original.offers;
  assert.equal(p.breedKey,mate.breedKey);
  assert.notEqual(p.sex,mate.sex);
  assert.ok(original.offers.every(o=>o.traits.every(t=>GRADES.indexOf(t.grade)<=4)&&o.traits.filter(t=>t.rarity==='稀有').length<=1));
  s.research.rabbit=[10,10,10];
  tickCare(s,T+29*M);assert.deepEqual(room.shelf,original);
  const price=purchasePrice(s,youngPurchaseBase(p));
  assert.throws(()=>careAction(s,'care.buyPet',{species:'rabbit',id:p.id,batch:0,price:0},T),/报价/);
  careAction(s,'care.buyPet',{species:'rabbit',id:p.id,batch:0,price},T+29*M);
  assert.equal(s.coins,680-price);assert.equal(s.pets.at(-1).bornAt,T+29*M);
  assert.throws(()=>careAction(s,'care.buyPet',{species:'rabbit',id:p.id,batch:0,price},T),/货位/);
  tickCare(s,T+30*M);assert.equal(room.shelf.number,1);
  assert.notEqual(room.shelf.offers[0].id,p.id);
  const backup=structuredClone(s);
  tickCare(s,T+180*M);tickCare(backup,T+180*M);
  assert.deepEqual(backup.rooms.rabbit.shelf,room.shelf);assert.equal(room.shelf.number,6);
});

test('复评同一个体终生最多三次，禁止改评分、越栏或在配对中使用',()=>{
  const s=fresh(),p=s.pets[0];s.rooms.rabbit.items.review=5;
  const args={species:'rabbit',id:p.id,field:0};
  assert.throws(()=>careAction(s,'care.review',{...args,field:5},T),/前五栏/);
  for(let i=0;i<3;i++) careAction(s,'care.review',{...args,field:i},T);
  assert.equal(s.rooms.rabbit.items.review,2);assert.equal(p.reviews,3);
  assert.ok(p.traits.every(t=>t.grade==='B'));
  assert.throws(()=>careAction(s,'care.review',args,T),/不足/);
  careAction(s,'care.breed',{species:'rabbit',mother:p.id,father:s.pets[1].id},T);
  assert.throws(()=>careAction(s,'care.review',{...args,id:s.pets[1].id},T),/空闲/);
});

test('一窝可全卖、全留或部分留种；仅出售该窝其余动物并按市场逐只结算',()=>{
  const s=fresh(),now=T+2*M,[mother,father]=s.pets;
  s.sales=[];
  careAction(s,'care.breed',{species:'rabbit',mother:mother.id,father:father.id},T);
  tickCare(s,now);
  const entry=carePage(s,'litter',{species:'rabbit'},now).actions.find(a=>a.page==='litterKeep');
  const choose=carePage(s,entry.page,entry.args,now);
  const {ids}=s.rooms.rabbit.lastLitter;
  assert.deepEqual(choose.rows.map(r=>r.select),ids);
  assert.ok(choose.rows.every(r=>r.link.page==='pet'));
  assert.equal(choose.selectionLabel,'留养');
  const next=choose.actions.find(a=>a.useSelection);
  assert.equal(next.allowEmptySelection,true);
  const quote=keep=>carePage(s,next.page,{...next.args,ids:keep},now);
  const allSold=quote([]);
  assert.deepEqual(allSold.actions[0].args.ids,ids);
  assert.ok(allSold.rows.find(r=>r.title==='繁育提醒'));
  assert.equal(allSold.actions[0].args.amounts.length,ids.length);
  const allKept=quote(ids);
  assert.equal(allKept.title,'整窝留种');
  const allCopy=structuredClone(s), confirmAll=allKept.actions[0];
  careAction(allCopy,confirmAll.type,confirmAll.args,now);
  assert.ok(allCopy.pets.slice(2).every(p=>p.retained));assert.deepEqual(allCopy.sales,[]);
  assert.ok(s.pets.every(p=>!p.retained));
  assert.deepEqual(s.sales,[]);
  careAction(s,'care.checkin',{},now);
  const coincidentNewborns=s.care.claimIds;
  assert.ok(coincidentNewborns.every(id=>!ids.includes(id)));
  const partial=quote([ids[0]]);
  const action=partial.actions[0];
  assert.equal(action.type,'sale.commit');assert.equal(action.go,undefined);
  assert.ok([partial,allKept].every(page=>page.actions.some(a=>a.type==='ui.editSelection')));
  assert.deepEqual(action.args.ids,ids.slice(1));
  assert.equal(partial.rows.filter(r=>r.title!=='繁育提醒').length,ids.length-1);
  const before=s.coins;
  businessAction(s,action.type,action.args,now);
  assert.equal(s.coins-before,action.args.amounts.reduce((sum,n)=>sum+n,0));
  assert.deepEqual(s.pets.map(p=>p.id),[mother.id,father.id,ids[0],...coincidentNewborns]);
  assert.deepEqual(s.pets.filter(p=>p.retained).map(p=>p.id),[ids[0]]);
  const locked=carePage(s,entry.page,entry.args,now);
  assert.deepEqual(locked.rows.map(r=>[r.animal.id,r.animal.retained,r.select]),[[ids[0],true,undefined]]);
  assert.ok(locked.actions.every(a=>a.page!=='litterSale'));
  assert.throws(()=>businessAction(s,action.type,action.args,now),/已离店/);
  assert.equal(s.sales.length,1);
});

test('留种核价拒绝过期窝次、外来编号与已变化名册；一只失效整批保留',()=>{
  const s=fresh(),now=T+2*M,[mother,father]=s.pets;
  s.sales=[];
  careAction(s,'care.breed',{species:'rabbit',mother:mother.id,father:father.id},T);
  tickCare(s,now);
  const {bornAt,ids}=s.rooms.rabbit.lastLitter, key={species:'rabbit',bornAt};
  const offered=[...ids], args={...key,offered,ids:[]};
  const results=[
    {...args,bornAt:bornAt-1},{...args,ids:[mother.id]},
    {...args,ids:[ids[0],ids[0]]},{...args,offered:[...offered.slice(1),father.id]},
    {...args,offered:offered.slice(1)},
  ];
  for(const invalid of results){
    assert.ok(carePage(s,'litterSale',invalid,now).actions.every(a=>!a.type));
  }
  const action=carePage(s,'litterSale',args,now).actions[0];
  careAction(s,'care.retain',{id:ids[0],retained:true},now);
  const marked=structuredClone(s);
  assert.throws(()=>businessAction(s,action.type,action.args,now),/种源/);
  assert.deepEqual(s,marked);
  assert.equal(carePage(s,'litterSale',args,now).title,'本窝名册已变化');
  const next=carePage(s,'litterKeep',key,now).actions[0];
  const mixed=carePage(s,next.page,{...next.args,ids:[]},now);
  assert.deepEqual(mixed.actions[0].args.ids,ids.slice(1));
  assert.match(mixed.subtitle,/留养 1 只/);
  const copy=structuredClone(s);
  businessAction(copy,mixed.actions[0].type,mixed.actions[0].args,now);
  assert.ok(copy.pets.some(p=>p.id===ids[0]&&p.retained));
  careAction(s,'care.retain',{id:ids[0],retained:false},now);
  s.pets=s.pets.filter(p=>p.id!==ids[1]);
  assert.equal(carePage(s,'litterSale',args,now).title,'本窝名册已变化');
  const before=structuredClone(s);
  assert.throws(()=>businessAction(s,action.type,action.args,now),/已离店/);
  assert.deepEqual(s,before);
});
