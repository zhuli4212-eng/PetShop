import { randomUUID } from 'node:crypto';
import { isBusy, lifeDates, makePet, petArt, specimen, SPECIES, stageOf, startLitter } from './care.mjs';
import { occupiedPetNames } from './pet-names.mjs';
import { grantOpeningReward, openingReward } from './shop-tasks.mjs';
import { nutritionStock } from './room-nutrition.mjs';

const rabbit={species:'rabbit'};
const seedPrice=200;
export const firstLitterWait=5_000;
const mealTier='premium';
const mealName='臻选兔兔营养餐';
const firstLitterSexes=['母','公','母','公'];
const parentSexes=['母','公'];
const recoverySource='引导续接';
const adultOffer=(offer,now)=>({...offer,bornAt:now-(lifeDates(offer).adultAt-offer.bornAt)});
const pair=(s,breed,now,source)=>{
  const names=occupiedPetNames(s);
  return parentSexes.map(sex=>makePet(names,'rabbit',breed,sex,now,source));
};
const idsOf=animals=>animals.map(p=>p.id);
const findPet=(s,id)=>s.pets.find(p=>p.id===id);
const choice=(label,page,args={})=>({label,page,args});
const action=(label,type,args={},go,goArgs)=>({label,type,args,go,goArgs});
function expect(condition,message) {
  if(!condition)throw Object.assign(new Error(message),{status:409});
}
const saleFor=(s,channel,id)=>id&&s.sales.findLast(record=>record.channel===channel&&record.lines.some(line=>line.id===id));
const saleForOrder=(s,id)=>id&&s.sales.findLast(record=>record.channel==='order'&&record.targetId===id);
const firstOrder=id=>({id,species:'rabbit',breed:'domestic',diff:0,rate:135});
const guidePrice=s=>Math.max(0,Math.min(seedPrice,s.coins));

export function initOnboarding(s) {
  const first=s.orders[0].order;
  s.onboarding={booklet:true,orderId:first.id};
  Object.assign(first,firstOrder(first.id));
}
export const rabbitWaitingForOpening=s=>!!s.onboarding&&!s.onboarding.starters&&!s.onboarding.finishedAt;
export const openingPair=(s,args)=>!!s.onboarding?.starters&&!s.onboarding.firstLitterAt&&
  (args.species??'rabbit')==='rabbit'&&args.mother===s.onboarding.starters[0]&&args.father===s.onboarding.starters[1];
export const guideAccess=(s,key)=>{
  const g=s.onboarding;
  return key==='lab'&&!!g?.remainingId||key==='orders'&&g?.step>=16;
};

export function settleOnboarding(s,now) {
  const g=s.onboarding;
  if(!g)return;
  const room=s.rooms.rabbit, litter=room.lastLitter;
  if(!g.booklet){
    if(!g.finishedAt){
      if(g.step===5&&!room.job&&litter?.bornAt!==g.firstLitterAt)g.step=4;
      repairGuideTargets(s,g,now);
      if(g.step>=15)g.legacyRewardReady=true;
      if(g.claimedAt!==undefined)g.finishedAt=g.claimedAt;
      if(!g.finishedAt)s.visitBook.opening=true;
    }
    g.booklet=true;
  }
  if(litter&&litter.bornAt===g.firstLitterAt){
    g.litterIds??=[...litter.ids];
    g.firstLitter??=structuredClone(litter);
  }
  if(g.starters&&!g.teachingMealGranted)grantTeachingMeal(room,g);
  protectOpeningAnimals(s,g.finishedAt?undefined:g,now);
}

function grantTeachingMeal(room,g) {
  if(g.teachingMealGranted)return;
  (room.nutritionStock??={})[mealTier]=nutritionStock(room,mealTier)+1;
  g.teachingMealGranted=true;
}
const teachingPair=(s,now)=>{
  const g=s.onboarding;
  if(!g?.starters||g.teachingMealUsed||g.firstLitterAt||!nutritionStock(s.rooms.rabbit,mealTier))return;
  const pets=g.starters.map(id=>findPet(s,id));
  if(pets.every(p=>p&&stageOf(p,now)!=='已故')&&pets.some(p=>lifeDates(p).adultAt>now))return pets;
};

function recoveredRabbit(s,g,now,role,missingId,{sex='母',breed='domestic',bornAt=now,...data}={}) {
  const pet=makePet(occupiedPetNames(s), 'rabbit',breed,sex,bornAt,recoverySource,data);
  s.pets.push(pet);
  (g.recoveredTargets??=[]).push({step:g.step,at:now,role,missingId:missingId??null,id:pet.id});
  return pet;
}

function repairGuideTargets(s,g,now) {
  if([8,9].includes(g.step)){
    const sold=g.starters?.find(id=>saleFor(s,'market',id));
    if(sold){
      g.remainingId=g.starters.find(id=>id!==sold);
      g.step=10;
    }
  }
  if([3,4,8,9].includes(g.step)){
    const previous=g.starters??[], bred=g.step>=8;
    g.starters=parentSexes.map((sex,index)=>{
      const id=previous[index],pet=findPet(s,id);
      if(pet&&pet.sex===sex&&pet.species==='rabbit'&&pet.breedKey==='domestic'&&pet.bred===bred&&
          pet.tutorialDeathAt===undefined&&(g.step<8||!pet.retained)&&!isBusy(s,pet))return id;
      const substitute=recoveredRabbit(s,g,now,'starter',id,{sex,bred});
      if(g.step!==3)substitute.maturation={growthAt:now,adultAt:now};
      return substitute.id;
    });
  }
  if(g.step>=10&&g.step<=12){
    const soldId=g.starters?.find(id=>saleFor(s,'market',id));
    if(soldId)g.remainingId??=g.starters.find(id=>id!==soldId);
    if(saleFor(s,'recycle',g.remainingId)){
      openGuideOffers(s,g,now);
    }else{
      const remaining=findPet(s,g.remainingId);
      if(!remaining?.bred||remaining.retained||remaining.species!=='rabbit'||isBusy(s,remaining)){
        const index=g.starters?.indexOf(g.remainingId);
        const deathAt=saleFor(s,'market',soldId)?.at??now;
        const bornAt=deathAt-(SPECIES.rabbit.young+SPECIES.rabbit.growth)*60_000;
        g.remainingId=recoveredRabbit(s,g,now,'recycle',g.remainingId,
           {sex:parentSexes[index]??'母',bornAt,bred:true,tutorialDeathAt:deathAt}).id;
      }else settleUnsoldParent(s,g,now);
    }
  }
  if(g.step===13||g.step===14)repairPurchasedSeeds(s,g,now);
  if(g.step===16&&saleForOrder(s,g.orderId)){g.step=17;return;}
  if([6,7,16].includes(g.step)){
    const litter=s.rooms.rabbit.lastLitter;
    if(!g.litterIds?.length&&litter&&litter.bornAt===g.firstLitterAt)g.litterIds=[...litter.ids];
    if(!guideLitterPet(s,g)){
      const pet=recoveredRabbit(s,g,now,'litter',g.litterIds?.[0]);
      (g.litterIds??=[]).push(pet.id);
    }
  }
  if(g.step===16&&(!g.orderId||s.orders[0].order?.id!==g.orderId)){
    g.orderId??=randomUUID();
    const index=s.orders.findIndex(slot=>slot.order?.id===g.orderId);
    if(index>0)[s.orders[0],s.orders[index]]=[s.orders[index],s.orders[0]];
    else s.orders[0]={order:firstOrder(g.orderId),readyAt:null};
  }
}

function openGuideOffers(s,g,now) {
  g.offers=pair(s,'lop',now,'开店种源');
  g.offerIds=idsOf(g.offers);g.purchased=[];
}

function repairPurchasedSeeds(s,g,now) {
  for(const [index,offer] of g.offers.entries()){
    const id=offer.id;
    if(!g.purchased.includes(id))continue;
    const pet=findPet(s,id);
    if(pet?.species==='rabbit'&&pet.sex===offer.sex&&pet.breedKey==='lop'&&!pet.bred&&
        pet.tutorialDeathAt===undefined&&!isBusy(s,pet))continue;
    const restored=recoveredRabbit(s,g,now,'seed',id,{sex:offer.sex,breed:'lop',bornAt:adultOffer(offer,now).bornAt,
      traits:offer.traits,tagRulesVersion:offer.tagRulesVersion,tagCount:offer.tagCount});
    g.offers[index]={...offer,id:restored.id,name:restored.name};
    g.offerIds[index]=restored.id;
    g.purchased[g.purchased.indexOf(id)]=restored.id;
  }
}

function settleUnsoldParent(s,g,now) {
  const remaining=findPet(s,g.remainingId);
  if(!remaining?.bred||remaining.tutorialDeathAt!==undefined)return;
  const soldId=g.starters?.find(id=>id!==remaining.id&&saleFor(s,'market',id));
  const deathAt=saleFor(s,'market',soldId)?.at??now;
  if(stageOf(remaining,deathAt)!=='已故'){
    remaining.tutorialDeathAt=deathAt;
    delete remaining.tutorialLifeGuard;
  }
}

function guideLitterPet(s,g) {
  for(const id of g.litterIds??[]){
    const pet=findPet(s,id);
    if(pet?.species==='rabbit'&&pet.breedKey==='domestic'&&!pet.mixed&&!pet.retained&&
      pet.tutorialDeathAt===undefined&&!isBusy(s,pet))return pet;
  }
}

// While a shop is in the guide, preserve the actual individuals needed by its remaining actions.
// Their age and room timers continue to use store time.
function protectOpeningAnimals(s,g,now) {
  const needed=new Set(g?.purchased??[]);
  if(g&&!g.remainingId)for(const id of g.starters??[])needed.add(id);
  if(g){
    const delivery=guideLitterPet(s,g);
    if(delivery)needed.add(delivery.id);
  }
  for(const pet of s.pets){
    if(needed.has(pet.id)){
      pet.tutorialLifeGuard=true;
    }else if(pet.tutorialLifeGuard){
      delete pet.tutorialLifeGuard;
      if(lifeDates(pet).deathAt<now)pet.tutorialDeathAt=now;
    }
  }
}

const openingSale=(s,g)=>s.sales.find(sale=>sale.channel!=='recycle'&&sale.lines.some(line=>g.litterIds?.includes(line.id)));
function openingRewardReady(s,g,now) {
  if(g.planAt||g.legacyRewardReady)return true;
  if(!g.litterIds?.length)return false;
  const children=g.litterIds.map(id=>findPet(s,id)).filter(p=>p&&stageOf(p,now)!=='已故'&&!p.bred);
  const retained=children.filter(p=>p.retained);
  if(parentSexes.every(sex=>retained.some(p=>p.sex===sex))&&(openingSale(s,g)||children.length===2))return true;
  // A shop that already dispersed the litter can continue with the next generation.
  return !parentSexes.every(sex=>children.some(p=>p.sex===sex));
}
export function openingTaskPage(s,now) {
  const g=s.onboarding;
  if(!g||g.finishedAt)return;
  const born=!!g.litterIds?.length,done=openingRewardReady(s,g,now);
  const rows=[
    {title:'开放兔房',done:!!g.starters,link:choice(undefined,'rooms',rabbit)},
    {title:'繁育第一窝',done:born,link:choice(undefined,'breed',rabbit)},
    {title:'留种与出售',done,link:g.firstLitter?choice(undefined,'litter',{...rabbit,bornAt:g.firstLitterAt}):choice(undefined,'breed',rabbit)},
  ];
  if(done){
    const sale=g.planSaleTotal??openingSale(s,g)?.total;
    const seeds=s.pets.filter(p=>g.litterIds?.includes(p.id)&&p.retained&&!p.bred);
    const adultAt=Math.max(0,...seeds.map(p=>lifeDates(p).adultAt));
    rows[2].text=[
      sale!==undefined?'出售所得 '+sale+' 金币':'',
      seeds.length?(adultAt>now?'种源成年还需约 '+Math.ceil((adultAt-now)/60_000)+' 分钟':'种源已成年'):'',
    ].filter(Boolean).join(' · ');
  }
  if(g.legacyRewardReady)rows.forEach(row=>{row.done=true;});
  return {title:'任务',subtitle:'领取开店奖励',rows,visual:{rewards:openingReward},actions:[
    {...action('领取','onboarding.claim',{},'tasks'),disabled:!done},
  ]};
}
export function openingShortcut(s,now) {
  const page=openingTaskPage(s,now);
  if(!page)return;
  const completed=page.rows.filter(row=>row.done).length, next=page.rows.find(row=>!row.done);
  return {completed,total:page.rows.length,
    choice:next?{...next.link,label:next.title}:choice('领取开店奖励','tasks')};
}
export function openingPage(s,key,args,now) {
  if(key==='tasks')return openingTaskPage(s,now);
  if(key!=='offer')return;
  const g=s.onboarding,offer=g?.offers?.find(p=>p.id===args.id);
  if(!offer)return;
  const bought=g.purchased.includes(offer.id);
  const cash=guidePrice(s),aid=seedPrice-cash;
  const price=aid?'开店补贴抵扣 '+aid+' 金币 · 实付 '+cash+' 金币':'采购价格 '+seedPrice+' 金币';
  return {title:offer.name+' · '+offer.sex,art:petArt(offer),stage:'成年',
    subtitle:'垂耳兔 · 奶油 · 成年 · 未繁育',rows:[{title:'成年种源',text:bought?'已购入':price}],
    actions:bought?[choice('返回种源','lab')]:[
      {...action('核对购买','onboarding.buy',{id:offer.id,price:seedPrice,cash},'lab'),
        confirm:'购入 '+offer.name+'（'+offer.sex+'）？'+price+'。'},
    ]};
}
export function decorateOpeningPage(s,key,args,view,now) {
  const g=s.onboarding;
  if(!g)return;
  if(key==='rooms'&&g.teachingMealUsed&&!g.firstLitterAt&&(args.species??'rabbit')==='rabbit'){
    view.visual={...view.visual,grownIds:g.starters};
  }
  if(key==='roomNutrition'&&(args.species??'rabbit')==='rabbit'&&teachingPair(s,now)){
    const feed=view.actions?.find(a=>a.type==='care.feed');
    if(feed?.args.tier===mealTier)view.visual={...view.visual,hint:'使用开店赠餐，两只小兔就会长大。'};
  }
  if(key==='breed'&&view.presentation?.kind==='pairConfirm'&&openingPair(s,args)){
    view.presentation.waitText='5 秒';
    view.rows[0].text='开始后不能取消或更换亲本。5 秒后出生 4 只原色幼兔。';
  }
  if(key==='lab'&&g.offers&&!['nutrition','services'].includes(args.tab)){
    const offers=g.offers.filter(p=>!g.purchased.includes(p.id)).map(offer=>{
      const animal=specimen(s,adultOffer(offer,now),now,{inShop:false});
      return {title:animal.name,text:'开店种源 · '+seedPrice+' 金币',animal,art:animal.art,stage:'成年',
        link:choice(undefined,'offer',{...rabbit,id:offer.id}),visual:{price:seedPrice}};
    });
    view.rows=[...offers,...view.rows];
  }
}

export function openingAction(s,type,args,now) {
  const g=s.onboarding;
  if(!g)return;
  if(type==='onboarding.openRoom'){
    expect(rabbitWaitingForOpening(s),'兔房已开放。');
    const starters=pair(s,'domestic',now,'开店种源');
    s.rooms.rabbit.openedAt=now;
    s.rooms.rabbit.shelf=null;
    s.pets.push(...starters);g.starters=idsOf(starters);
    grantTeachingMeal(s.rooms.rabbit,g);
    protectOpeningAnimals(s,g,now);
    return '兔房已开放，两只原色幼兔已入住。获得 '+mealName+' ×1。';
  }
  if(type==='onboarding.feed'||type==='care.feed'&&(args.species??'rabbit')==='rabbit'&&args.tier===mealTier){
    const starters=teachingPair(s,now);
    if(starters){
      s.rooms.rabbit.nutritionStock[mealTier]--;
      for(const pet of starters){
        const {growthAt,adultAt}=lifeDates(pet);
        if(now<adultAt)pet.maturation={growthAt:Math.min(growthAt,now),adultAt:now};
      }
      g.teachingMealUsed=true;
      return '首对原色兔已成年。';
    }
    if(type==='onboarding.feed')expect(false,'请从兔房重新选择营养餐。');
  }
  if(type==='care.breed'&&openingPair(s,args)){
    const result=startLitter(s,args,now,{waitMs:firstLitterWait,plannedSexes:firstLitterSexes});
    g.firstLitterAt=s.rooms.rabbit.job.endsAt;
    return result;
  }
  if(type==='onboarding.buy'){
    const offer=g.offers?.find(p=>p.id===args.id);
    expect(offer&&!g.purchased.includes(offer.id),'这个货位已购入或未开放。');
    const cash=guidePrice(s),aid=seedPrice-cash;
    expect(args.price===seedPrice&&(args.cash===undefined||args.cash===cash),'报价已变化，请重新核对购买。');
    const acquired=makePet(occupiedPetNames(s),'rabbit','lop',offer.sex,now,'研究所采购',
      {...adultOffer(offer,now),source:'研究所采购'});
    s.coins-=cash;s.pets.push(acquired);
    if(aid)g.seedAid=(g.seedAid??0)+aid;
    g.purchased.push(acquired.id);
    return acquired.name+'已入住兔房。'+(aid?'开店补贴已抵扣 '+aid+' 金币。':'');
  }
  if(type==='task.claim'&&!g.finishedAt)expect(false,'请先领取开店奖励。');
  if(type==='onboarding.claim'){
    expect(!g.claimedAt&&openingRewardReady(s,g,now),'开店奖励已领取，或留种与出售尚未完成。');
    const message=grantOpeningReward(s);
    g.claimedAt=g.finishedAt=now;
    protectOpeningAnimals(s,undefined,now);
    return message+' 已开启「安置兔房」。';
  }
}

export function recordOpeningAction(s,type,args,now) {
  const g=s.onboarding;
  if(!g)return;
  if(type==='care.breed'&&g.starters&&!g.firstLitterAt&&(args.species??'rabbit')==='rabbit'){
    g.firstLitterAt=s.rooms.rabbit.job.endsAt;
  }
  if(type!=='sale.commit')return;
  if(args.litterRetention?.opening){
    g.planAt=now;
    g.planSaleTotal=s.sales.at(-1).total;
  }
  if(args.channel==='market'&&g.firstLitterAt&&!g.remainingId&&g.starters?.some(id=>args.ids.includes(id))){
    g.remainingId=g.starters.find(id=>findPet(s,id)?.bred);
    if(g.remainingId)settleUnsoldParent(s,g,now);
  }
  if(args.channel==='recycle'&&g.remainingId&&args.ids.includes(g.remainingId)&&!g.offers)openGuideOffers(s,g,now);
}
