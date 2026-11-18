import { lifeDates, makePet, petArt, specimen, stageOf, startLitter } from './care.mjs';
import { salePrice } from './business.mjs';
import { occupiedPetNames } from './pet-names.mjs';
import { grantOpeningReward, openingReward } from './shop-tasks.mjs';

const rabbit={species:'rabbit'};
const seedPrice=200;
export const firstLitterWait=5_000;
const mealArt='rooms/rabbit-nutrition-premium';
const openingLetter='街角的麦穗宠物店交给你了。过去，街坊常把小动物托付到这里，也来为它们找一个新家。兔房已经收拾好，先接一对小兔住下，把这间小店重新开起来吧。';
const firstLitterSexes=['母','公','母','公'];
const adultOffer=(offer,now)=>({...offer,bornAt:now-(lifeDates(offer).adultAt-offer.bornAt)});
const pair=(s,breed,now,source)=> {
  const names=occupiedPetNames(s);
  return ['母','公'].map(sex=>makePet(names,'rabbit',breed,sex,now,source));
};
const active=s=>s.onboarding&&!s.onboarding.finishedAt?s.onboarding:undefined;
const idsOf=animals=>animals.map(p=>p.id);
const findPet=(s,id)=>s.pets.find(p=>p.id===id);
const choice=(label,page,args={})=>({label,page,args});
const action=(label,type,args={},go,goArgs)=>({label,type,args,go,goArgs});
const home=label=>({label,type:'ui.home'});
const guideError=message=>Object.assign(new Error(message),{status:409});
function expect(condition,message='请先完成当前引导。') {if(!condition)throw guideError(message);}
function guidePair(g) {return g.step===4?g.starters:g.offerIds;}
function matchesPair(ids,args) {
  return args.mother===ids?.[0]&&args.father===ids?.[1]&&(args.species??'rabbit')==='rabbit';
}

export function initOnboarding(s) {
  s.onboarding={step:0};
  s.visitBook.opening=false;
  const first=s.orders[0].order;
  first.breed='domestic';
  s.onboarding.orderId=first.id;
}

export function onboardingSnapshot(s) {
  const g=active(s);
  if(!g)return;
  const destinations=[
    ['进入店铺','onboarding'],['阅读交接信','onboarding'],
    ['免费开放兔房','rooms',rabbit,'rooms','点击「动物小屋」，免费开放兔房。'],
    ['首次投喂','rooms',rabbit,'rooms','进动物小屋，给第一对幼兔投喂。'],
    ['挑选首窝亲本','breed',rabbit,'breed','点击「繁育」，挑选首窝的亲本。'],
    ['查看首窝进度','breed',rabbit,'breed','点击「繁育」，查看首窝进度。'],
    ['查看首窝出生','litter',rabbit,'breed','点击「繁育」，查看首窝出生记录。'],
    ['查看第一只幼兔','litter',rabbit,'breed','回到首窝出生记录，查看第一只幼兔。'],
    ['前往自由市场','market',{},'market','点击「自由市场」，挑选一只已繁育的亲本。'],
    ['出售一只亲本','market',{},'market','到自由市场出售一只已繁育的亲本。'],
    ['查看个体档案','pet',{id:g.remainingId},'rooms','点击「动物小屋」，查看另一只亲本的档案。'],
    ['前往培育中心','lab',{},'lab','点击「培育中心」，找到动物回收。'],
    ['回收已故亲本','recycle',{},'lab','进入动物回收，处理已故的亲本。'],
    ['购买成年种源','lab',{},'lab','到培育中心，购入一公一母成年垂耳兔。'],
    ['用新种源繁育','rooms',rabbit,'rooms','回到兔房，用新购的垂耳兔繁育。'],
    ['领取开店任务奖励','tasks',{},'tasks','点击「任务」，领取开店奖励。'],
    ['完成第一张订单','orders',{},'orders','点击「普通订单」，完成第一单。'],
    ['回到店铺','onboarding'],
  ];
  const [label,page,args,entrance,hint]=destinations[g.step];
  return {step:g.step,choice:choice(label,page,args),entrance,hint};
}

export function guideAccess(s,key) {
  const g=active(s);
  return !!g&&((key==='lab'&&g.step>=11)||(key==='orders'&&g.step>=16));
}
export const rabbitWaitingForOpening=s=>Boolean(active(s)?.step<3);

export function settleOnboarding(s,now) {
  const g=active(s), litter=s.rooms.rabbit.lastLitter;
  if(!g)return;
  if(g?.step===5&&litter?.bornAt===g.firstLitterAt){
    g.litterIds=[...litter.ids];
    g.step=6;
  }
  if(g?.step===10)settleUnsoldParent(s,g);
  protectGuideAnimals(s,g,now);
}

function settleUnsoldParent(s,g) {
  const remaining=findPet(s,g.remainingId);
  if(!remaining?.bred||remaining.tutorialDeathAt!==undefined)return;
  const soldId=g.starters.find(id=>id!==remaining.id);
  const sale=s.sales.findLast(record=>record.channel==='market'&&record.lines.some(line=>line.id===soldId));
  if(sale&&stageOf(remaining,sale.at)!=='已故'){
    remaining.tutorialDeathAt=sale.at;
    delete remaining.tutorialLifeGuard;
  }
}

// While a shop is in the guide, preserve the actual individuals needed by its remaining actions.
// Their age and room timers continue to use store time.
function protectGuideAnimals(s,g,now) {
  const needed=new Set(g?.purchased??[]);
  if(g&&g.step<10)for(const id of g.starters??[])needed.add(id);
  if(g&&g.step<=16){
    const delivery=g.litterIds?.find(id=>s.pets.some(p=>p.id===id&&!p.retained&&p.tutorialDeathAt===undefined));
    if(delivery)needed.add(delivery);
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

function tutorialTaskRows(g) {
  return [
    ['开放兔房','让第一对幼兔入住。','rooms',!!g.starters],
    ['完成首窝繁育','在出生记录查看第一窝。','litter',g.step>=7],
    ['购入一公一母种源','在培育中心购买两只成年垂耳兔。','lab',g.purchased?.length===2],
    ['用新种源继续繁育','从兔房用新购种源开始繁育。','breed',g.step>=15],
  ].map(([title,text,page,done])=>({title,text,done,link:{page,args:rabbit}}));
}

function tutorialTaskPage(s) {
  const g=s.onboarding,rows=tutorialTaskRows(g);
  const earned=g.claimedAt!==undefined;
  return {title:'任务',subtitle:rows.filter(row=>row.done).length+' / '+rows.length+' 已完成',
    rows,visual:{rewards:openingReward},
    actions:[{...action(earned?'已领取':'领取','onboarding.claim',{},'home'),disabled:earned||rows.some(row=>!row.done)}]};
}

export function onboardingPage(s,key,args,now) {
  const g=active(s);
  if(key==='tasks'&&s.onboarding)return tutorialTaskPage(s);
  if(key==='openingGuide'&&s.onboarding){
    return {title:'交接信',subtitle:openingLetter,visual:{guideDialog:1,letterOpened:true},
      actions:[{label:'返回',type:'ui.back'}]};
  }
  if(key==='onboarding'&&s.onboarding){
    if(g?.step===0)return {title:'欢迎来到你的小店',visual:{guideDialog:0},
      actions:[action('进入店铺','onboarding.enter',{},'onboarding')]};
    if(g?.step===1){
      const opened=g.letterOpened===true;
      return {title:'交接信',...(opened?{subtitle:openingLetter}:{art:'onboarding/handover-envelope'}),
        visual:{guideDialog:1,letterOpened:opened},
        actions:[opened?action('继续','onboarding.proceed',{},'home'):
          action('拆开交接信','onboarding.openLetter',{},'onboarding')]};
    }
    if(g?.step===17){
      const room=s.rooms.rabbit;
      return {title:'引导完成',subtitle:'小店交给你了，接下来由你决定留种、出售和培育方向。',
        rows:room.job?[{title:'正在培育',text:room.job.mother.name+' × '+room.job.father.name}]:
          room.lastLitter?[{title:'最近出生的一窝',text:room.lastLitter.ids.length+' 只'}]:[],
        visual:{guideDialog:17},actions:[action('继续经营','onboarding.finish',{},'home')]};
    }
    return {title:'店铺',visual:{returnHome:true},actions:[{label:'返回店铺',type:'ui.back'}]};
  }
  if(!g)return;
  if(g.step===3&&key==='roomNutrition'&&(args.species??'rabbit')==='rabbit'){
    return {title:'选择兔兔营养餐',art:mealArt,visual:{tutorialMeal:true},
      subtitle:'本次免费，仅限这一次。日常营养餐按档位加速整间兔房的未成年动物成长。',
      rows:[{title:'首次教学投喂',text:'兔房 · 首对幼兔立即成年',art:mealArt}],
      actions:[{label:'返回',type:'ui.back'},action('投喂','onboarding.feed',{},'rooms',rabbit)]};
  }
  if(g.step===13&&key==='offer'){
    const offer=g.offers.find(p=>p.id===args.id);
    if(!offer)return;
    const bought=g.purchased.includes(offer.id);
    return {title:offer.name+' · '+offer.sex,art:petArt(offer),stage:'成年',
      subtitle:'垂耳兔 · 奶油 · 成年 · 未繁育',rows:[
        {title:'成年种源',text:'采购价格 '+seedPrice+' 金币 · '+(bought?'已购入':'本次专属货位')},
      ],
      actions:bought?[choice('返回种源','lab')]:[
        {...action('核对购买','onboarding.buy',{id:offer.id,price:seedPrice},'lab'),
          confirm:'用 '+seedPrice+' 金币购入 '+offer.name+'（'+offer.sex+'）？',disabled:s.coins<seedPrice},
      ]};
  }
}

function candidates(s,g,channel,now) {
  if(channel==='market'&&[8,9].includes(g.step))return g.starters;
  if(channel==='recycle'&&[11,12].includes(g.step))return [g.remainingId];
  if(channel==='order'&&g.step===16){
    const id=g.litterIds.find(id=>{
      const pet=findPet(s,id);
      return pet&&stageOf(pet,now)!=='已故'&&!pet.retained;
    });
    return id?[id]:[];
  }
}
function checkSale(s,g,args,now) {
  const ids=candidates(s,g,args.channel,now);
  expect(ids&&Array.isArray(args.ids)&&args.ids.length===1&&ids.includes(args.ids[0])&&
    (args.channel!=='order'||args.targetId===g.orderId),'请选择当前引导指定的一只动物。');
}

export function decorateGuidePage(s,key,args,view,now) {
  const g=active(s);
  if(!g)return;
  const teach=(text,target,next)=>{view.guide={text,target,next};};
  if(key==='onboarding'){
    if(g.step===0)teach('点击「进入店铺」，开始开店引导。','Action0');
    if(g.step===1)teach(g.letterOpened?'读完信后，点击「继续」。':'点击「拆开交接信」，看看旧店主的留言。','Action0');
    if(g.step===17)teach(view.subtitle,'Action0');
  }
  if(key==='roomNutrition'&&view.visual?.tutorialMeal)teach(view.subtitle,'Action1');
  if(key==='offer'&&g.step===13&&view.actions?.some(a=>a.type==='onboarding.buy')){
    teach('核对这只成年种源的信息，再点击「核对购买」。','Action0');
  }
  if(key==='rooms'&&(args.species??'rabbit')==='rabbit'){
    view.title='动物小屋';
    if(g.step===2)teach('先打开兔房，让第一对小兔住进来。','Action0');
    if(g.step===3)teach('点击食碗旁的投喂按钮，让最初两只小兔立即成年。','Feed');
    if(g.step===4) {
      view.visual={...view.visual,grownIds:g.starters};
      teach('最初两只小兔已成年，可以开始配对。','GuideNext',home('前往繁育'));
    }
    if(g.step===14) {
      teach('动物会经历幼年、成长、成年、老年，最终自然离世。成年或老年且未繁育时可以配对。','GuideNext',
        choice('进繁育台','breed',rabbit));
    }
  }
  if(key==='breed'&&[4,5,6,14].includes(g.step)&&(args.species??'rabbit')==='rabbit'){
    const p=view.presentation;
    const pairIds=guidePair(g);
    if([4,14].includes(g.step)&&p?.candidates){
      p.candidates=pairIds.map(id=>p.candidates.find(a=>a.id===id)).filter(Boolean);
    }
    if(g.step===4){
      if(p?.kind==='pair'||p?.kind==='pairConfirm'){
        p.waitText='5 秒';
        if(p.kind==='pairConfirm')view.rows[0].text='开始后不能取消或更换亲本。5 秒后出生 4 只原色幼兔。';
      }
      teach('挑选首对原色兔作为母本和父本。',parentTarget(p));
    }
    if(g.step===5&&p?.kind==='breeding')teach('第一窝使用新店繁育体验，5 秒后见面。','Job');
    if(g.step===6)teach('小兔出生了，查看这一窝的出生记录。','GuideNext',choice('查看出生结果','litter',rabbit));
    if(g.step===14){
      teach('挑选刚买回的两只成年垂耳兔。',parentTarget(p));
    }
  }
  if(key==='breed'&&g.step===15){
    teach('第二窝按正常时间培育，现在可以去领取开店奖励。','GuideNext',home('返回店铺'));
  }
  if(key==='litter'&&[6,7].includes(g.step))teach('小兔出生了，点开第一只看看它的特点。','Animal0');
  if(key==='pet'&&[7,8].includes(g.step)&&args.id===g.litterIds[0]){
    teach('这六项记录了它的特点，选种和经营都会用到。','GuideNext',home('返回店铺'));
  }
  if(key==='pet'&&[10,11].includes(g.step)&&args.id===g.remainingId&&view.stage==='已故'){
    view.actions=view.actions.map(a=>a.page==='recycle'?choice('前往培育中心','lab'):a);
    teach('接下来，点击「前往培育中心」。','Action0');
  }
  if(key==='market'&&[8,9].includes(g.step))teach('选一只已繁育的亲本。确认后，这只动物会离开店铺。','Row0');
  if(key==='lab'&&g.step===11)teach('去培育中心的动物回收处理这只已故的兔子。','LabRecycle');
  if(key==='recycle'&&[11,12].includes(g.step))teach('已故动物只能在培育中心回收。','Row0');
  if(key==='lab'&&[13,14].includes(g.step)&&!['nutrition','services'].includes(args.tab)){
    view.subtitle='已购买 '+g.purchased.length+' / 2';
    view.rows=g.offers.map(offer=>{
      const pet=findPet(s,offer.id)??adultOffer(offer,now);
      const animal=specimen(s,pet,now),bought=g.purchased.includes(offer.id);
      return {title:animal.name,text:bought?'已购入':'200 金币',animal,art:animal.art,stage:'成年',
        ...(bought?{}:{link:choice(undefined,'offer',{...rabbit,id:offer.id})}),
        visual:{price:seedPrice,bought}};
    });
    if(g.step===13)teach('购入一公一母成年种源，可以继续繁育。','Row'+g.offers.findIndex(p=>!g.purchased.includes(p.id)));
    else teach('两只种源已入住房间。','GuideNext',choice('返回兔房','rooms',rabbit));
  }
  if(key==='tasks'&&g.step===15)teach('刚才完成的经营目标已经记下，来领取奖励。','ClaimTasks');
  if(key==='orders'&&g.step===16){
    view.subtitle='共 3 单';
    view.rows=view.rows.map((row,i)=>i===0?
      {...row,visual:{...row.visual,choices:row.visual.choices.slice(0,1)}}:
      {title:row.title,text:row.text});
    view.actions=[];
    teach('点击第一单的「选择交付」，挑一只首窝原色兔。','Deliver');
  }
  if(key==='orderDesk'&&g.step===16&&args.id===g.orderId){
    view.actions=view.actions.slice(0,1);
    teach('点击「选择交付动物」，挑一只首窝原色兔。','Action0');
  }
  const channel=key==='market'||key==='recycle'?key:key==='sale'?args.channel:null;
  const available=channel&&candidates(s,g,channel,now);
  if(available){
    view.rows=view.rows.filter(row=>available.includes(row.select));
    if(channel==='market')view.rows.forEach(row=>delete row.link);
    view.visual={...view.visual,eligibleCount:view.rows.length,singleSelect:true};
    view.filters=undefined;
    if(!view.rows.length){view.actions=[];if(view.guide)view.guide.target=undefined;}
    if(channel==='order')teach('选择首窝的第一只原色兔，核对市场与订单估价。','Row0');
    if(view.guide&&view.rows.length){
      view.guide.selectedText='选好了，点击「核对'+{market:'出售',recycle:'回收',order:'交付'}[channel]+'」。';
    }
  }
  if(key==='saleQuote'){
    checkSale(s,g,args,now);
    const commit=view.actions[0];
    view.title={market:'核对出售',recycle:'核对回收',order:'首单核对'}[args.channel];
    commit.label={market:'确认出售',recycle:'确认回收',order:'确认交付'}[args.channel]+' · '+commit.args.amounts[0]+' 金币';
    teach({market:'核对售价后，点击「确认出售」。',recycle:'核对报价后，点击「确认回收」。',
      order:'比对市场与订单报价后，点击「确认交付」。'}[args.channel],
      view.actions.some(a=>a.type==='ui.editSelection')?'Action1':'Action0');
    if(args.channel==='market'){
      commit.go='pet';commit.goArgs={id:g.starters.find(id=>id!==args.ids[0])};
    }
    if(args.channel==='recycle')commit.go='lab';
    if(args.channel==='order'){
      const pet=findPet(s,args.ids[0]),market=salePrice(s,pet,pet.bornAt,'market');
      view.visual={...view.visual,guideQuote:'出生时市场估价 '+market+' 金币 · 本订单 '+commit.args.amounts[0]+' 金币（×1.35）'};
      view.guide.text='出生估价 '+market+' 金币，本单报价 '+commit.args.amounts[0]+' 金币。点击「确认交付」。';
      commit.go='home';
    }
  }
}

function parentTarget(p) {
  if(p?.kind==='pairConfirm')return 'Action0';
  if(p?.confirm)return 'Review';
  const sex=p?.parents?.[0]?'公':'母';
  const row=p?.candidates?.findIndex(a=>a.sex===sex)??-1;
  return row>=0?'Animal'+row:undefined;
}

export function recordGuideVisit(s,key,args,now) {
  const g=active(s);
  if(!g)return s;
  let next;
  if(g.step===6&&key==='litter'&&(args.species??'rabbit')==='rabbit')next=7;
  if(g.step===7&&key==='pet'&&args.id===g.litterIds[0])next=8;
  if(g.step===8&&key==='market')next=9;
  if(g.step===10&&key==='pet'&&args.id===g.remainingId){
    const pet=findPet(s,g.remainingId);
    if(pet&&stageOf(pet,now)==='已故')next=11;
  }
  if(g.step===11&&key==='recycle')next=12;
  if(next===undefined)return s;
  return {...s,version:s.version+1,onboarding:{...g,step:next}};
}

export function guideAction(s,type,args,now) {
  const g=active(s);
  if(!g)return;
  if(type==='onboarding.enter'){
    expect(g.step===0);g.step=1;return '欢迎来到你的小店。';
  }
  if(type==='onboarding.openLetter'){
    expect(g.step===1&&!g.letterOpened);g.letterOpened=true;return '已拆开交接信。';
  }
  if(type==='onboarding.proceed'){
    expect(g.step===1&&g.letterOpened);g.step=2;return '现在可以打开兔房。';
  }
  if(type==='onboarding.openRoom'){
    expect(g.step===2);
    const starters=pair(s,'domestic',now,'开店种源');
    s.rooms.rabbit.openedAt=now;
    s.rooms.rabbit.shelf=null;
    s.pets.push(...starters);g.starters=idsOf(starters);g.step=3;
    return '兔房已开放，两只原色幼兔已入住。';
  }
  if(type==='onboarding.feed'){
    expect(g.step===3);
    const starters=g.starters.map(id=>findPet(s,id));
    expect(starters.every(p=>p&&stageOf(p,now)!=='已故'),'首对原色兔已无法投喂。');
    for(const pet of starters){
      const {growthAt,adultAt}=lifeDates(pet);
      if(now<adultAt)pet.maturation={growthAt:Math.min(growthAt,now),adultAt:now};
    }
    g.step=4;
    return '首对原色兔已成年。';
  }
  if(type==='care.breed'){
    expect([4,14].includes(g.step)&&matchesPair(guidePair(g),args),'请选择当前引导指定的一公一母。');
    if(g.step===4){
      const result=startLitter(s,args,now,{waitMs:firstLitterWait,plannedSexes:firstLitterSexes});
      g.firstLitterAt=s.rooms.rabbit.job.endsAt;g.step=5;
      return result;
    }
    return;
  }
  if(type==='sale.commit'){
    expect({market:9,recycle:12,order:16}[args.channel]===g.step);
    checkSale(s,g,args,now);
    return;
  }
  if(type==='onboarding.buy'){
    expect(g.step===13);
    const offer=g.offers.find(p=>p.id===args.id);
    expect(offer&&!g.purchased.includes(offer.id),'这个货位已购入。');
    expect(args.price===seedPrice&&s.coins>=seedPrice,'报价已变化或金币不足。');
    const acquired=makePet(occupiedPetNames(s), 'rabbit','lop',offer.sex,now,'研究所采购',
      {...adultOffer(offer,now),source:'研究所采购'});
    s.coins-=seedPrice;s.pets.push(acquired);
    g.purchased.push(acquired.id);
    if(g.purchased.length===2)g.step=14;
    return acquired.name+'已入住兔房。';
  }
  if(type==='onboarding.claim'){
    expect(g.step===15&&tutorialTaskRows(g).every(row=>row.done));
    const message=grantOpeningReward(s);g.claimedAt=now;g.step=16;
    return message;
  }
  if(type==='onboarding.finish'){
    expect(g.step===17);g.finishedAt=now;
    protectGuideAnimals(s,undefined,now);
    return '引导完成，可以继续经营。';
  }
  if(type==='care.toggle'&&[4,14].includes(g.step)&&(args.species??'rabbit')==='rabbit')return;
  throw guideError('这项操作在完成开店引导后开放。');
}

export function recordGuideAction(s,type,args,now) {
  const g=active(s);
  if(!g)return;
  if(type==='care.breed'&&g.step===14){g.step=15;return;}
  if(type!=='sale.commit')return;
  if(g.step===9){
    g.remainingId=g.starters.find(id=>id!==args.ids[0]);g.step=10;
    settleUnsoldParent(s,g);
  }else if(g.step===12){
    g.offers=pair(s,'lop',now,'开店种源');
    g.offerIds=idsOf(g.offers);g.purchased=[];g.step=13;
  }else if(g.step===16){
    g.step=17;
  }
}
