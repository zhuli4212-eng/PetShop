import { activeNutrition, nutritionStock } from './room-nutrition.mjs';

const rabbitPairTask='rabbit-pair';
const reward={coins:40,tier:'premium',quantity:2};
export const openingReward=[
  {name:'金币',quantity:reward.coins},
  {name:'臻选兔兔营养餐',quantity:reward.quantity,art:'rooms/rabbit-nutrition-premium'},
];
const isPurchasedRabbit=p=>p?.species==='rabbit'&&p.source==='研究所采购';
const rabbit={species:'rabbit'};
const entry=(title,text,done,page,args={})=>({title,text,done,link:{page,args}});
// New groups use differences between the previous cumulative milestones.
const groupGoal=(p,total,prior)=>p.legacy?total:total-prior;
const breedTask=(p,total,prior=0)=>{
  const count=groupGoal(p,total,prior);
  return entry('安排 '+count+' 窝兔子','在兔房开始繁育。',p.breeds>=count,'breed',rabbit);
};
const litterTask=(p,total,prior=0)=>{
  const count=groupGoal(p,total,prior);
  return entry('查看 '+count+' 窝出生记录','每一窝出生后打开一次「最近出生的一窝」。',p.litters>=count,'litter',rabbit);
};
const keepTask=(p,total,prior=0)=>{
  const count=groupGoal(p,total,prior);
  return entry('给 '+count+' 只兔子留种','在兔房查看档案并标记种源。同一只只计一次。',p.retained>=count,'rooms',rabbit);
};
const buyTask=(p,total,prior=0)=>{
  const count=groupGoal(p,total,prior);
  return entry('购入 '+count+' 只兔子','在培育中心种源货架选购。',p.bought>=count,'lab',{tab:'seed',fromTasks:true});
};
const marketTask=(p,total,prior=0)=>{
  const count=groupGoal(p,total,prior);
  return entry('在市场完成 '+count+' 笔出售','在自由市场确认出售动物。',p.marketSales>=count,'market');
};
const saleTask=(p,total,prior=0)=>{
  const count=groupGoal(p,total,prior);
  return entry('累计售出 '+count+' 只动物','市场或普通订单都可。批量出售按只数累计。',p.sold>=count,'market');
};
const incomeTask=(p,total,prior=0)=>{
  const amount=groupGoal(p,total,prior);
  return entry('累计交易收入 '+amount+' 金币','统计自由市场和普通订单的成交金额。',p.income>=amount,'market');
};
const researchTask=(s,p,total,prior=0)=>{
  const count=groupGoal(p,total,prior);
  return !p.legacy&&(p.research??0)<count&&s.research.rabbit.every(level=>level>=10)
    ?entry('查看已满级的兔房研究','兔房研究已满级，打开手册查看已解锁的效果。',!!p.researchRead,'research',rabbit)
    :entry('提升兔房研究 '+count+' 级','在培育中心选择任意兔房研究分支升级。',p.research>=count,'research',rabbit);
};
const orderTask=(p,total,prior=0)=>{
  const count=groupGoal(p,total,prior);
  return entry('处理 '+count+' 份普通委托','完成交付或取消不适合的委托，等待该槽补单。',p.orders>=count,'orders',{fromTasks:true});
};
const feedTask=p=>entry('给兔房喂一份营养餐','在兔房使用一份营养餐。',p.feeds>=1,'roomNutrition',rabbit);

const earlyGroups=[
  {id:'settle-rabbits',title:'安置兔房',coins:40,rows:(s,p)=>p.legacy?[
    entry('签到领养幼兔','点击门口礼盒，领取今日的两只幼兔。',s.care.signedDay!=null,'profile'),
    feedTask(p),
    entry('给一只兔子留种','在兔房选一只兔子，打开档案并标记为种源。',
      p.retained>=1,'rooms',rabbit),
    entry('查看下一窝幼兔','新种源的繁育按正常时间进行。出生后查看名册。',p.litters>=1,'litter',rabbit),
  ]:[
    entry('看看一只种源','在兔房打开一只已留种兔子的档案。',!!p.seedArchive,'rooms',rabbit),
    feedTask(p),
    entry('逛逛店里能买的种兔','打开培育中心的种源货架。',!!p.shelf,'lab',{tab:'seed',fromTasks:true}),
  ]},
  {id:'manage-first-litters',title:'经营第一批兔子',coins:40,rows:(_s,p)=>[
    entry('在自由市场售出动物','选一只不打算留种的动物，完成出售。',p.marketSales>0,'market'),
    entry('查看培育中心种源','看看当前可买的种源，记录下一次补种的选择。',!!p.shelf,'lab',{tab:'seed',fromTasks:true}),
    entry('安排下一窝兔子','从已有的成年兔里挑选母本和父本，再开始一窝。',p.breeds>=1,'breed',rabbit),
  ]},
  {id:'continue-shop',title:'接续店铺经营',coins:60,rows:(_s,p)=>[
    entry('完成下一次交易','交付普通订单，或再去自由市场完成一笔交易。',p.sales>=groupGoal(p,2,1),'orders',{fromTasks:true}),
    entry('查看普通订单','对照当前委托和兔房名册，挑选要交付的动物。',!!p.orderRead,'orders',{fromTasks:true}),
  ]},
  {id:'learn-services',title:'认识培育服务',coins:60,rows:(_s,p)=>[
    entry('查看一只兔子的档案','从兔房挑一只兔子，查看成长时间和属性。',!!p.archive,'rooms',rabbit),
    entry('查看服务单','了解复评单和选育指导单的用途。',!!p.services,'lab',{tab:'services',fromTasks:true}),
    keepTask(p,2),
  ]},
  {id:'add-seeds',title:'添补新种源',coins:80,rows:(_s,p)=>[buyTask(p,2),breedTask(p,2,1),litterTask(p,2,1)]},
  {id:'rabbit-research',title:'开始兔房研究',coins:80,rows:(s,p)=>[
    entry('打开兔房研究手册','查看三条研究分支的成长方向。',!!p.researchRead,'research',rabbit),
    researchTask(s,p,1),marketTask(p,3,1),
  ]},
  {id:'follow-growth',title:'照看新生幼兔',coins:80,rows:(_s,p)=>[
    entry('查看兔房营养餐状态','投喂过营养餐后，再打开列表核对剩余库存。',!!p.mealRead,'roomNutrition',rabbit),
    breedTask(p,3,2),litterTask(p,3,2),
  ]},
  {id:'work-orders',title:'处理普通委托',coins:80,rows:(_s,p)=>[orderTask(p,1),saleTask(p,6)]},
  {id:'select-breeders',title:'建立后备种群',coins:100,rows:(_s,p)=>[keepTask(p,4,2),litterTask(p,4,3)]},
  {id:'regular-sales',title:'稳定市场出货',coins:100,rows:(_s,p)=>[marketTask(p,5,3),incomeTask(p,1000)]},
  {id:'improve-research',title:'提高兔房培育水平',coins:120,rows:(s,p)=>[researchTask(s,p,2,1),buyTask(p,3,2),breedTask(p,5,3)]},
  {id:'grow-output',title:'扩大兔房供给',coins:120,rows:(_s,p)=>[
    litterTask(p,5,4),saleTask(p,12,6),breedTask(p,6,5),
    entry('两次投喂兔房','首份普通营养餐到期后，可以再使用一份。',p.feeds>=2,'roomNutrition',rabbit),
  ]},
  {id:'upgrade-stock',title:'周转种源和订单',coins:140,rows:(_s,p)=>[
    orderTask(p,2,1),buyTask(p,4,3),keepTask(p,5,4),
    entry('查看补位订单','委托处理后约 30 分钟补位。打开普通订单查看新委托。',!!p.refill,'orders',{fromTasks:true}),
  ]},
  {id:'prepare-cat-room',title:'筹备猫房经费',coins:160,rows:(s,p)=>[incomeTask(p,2500,1000),researchTask(s,p,3,2),marketTask(p,7,5)]},
  {id:'rabbit-shop-ready',title:'兔房独立经营',coins:200,rows:(_s,p)=>[breedTask(p,8,6),litterTask(p,8,5),saleTask(p,20,12)]},
];
const earlyStart=s=>s.onboarding?s.onboarding.finishedAt:s.tasks[rabbitPairTask]?.claimedAt;
const earlyDone=s=>s.tasks.early?.claimed?.[earlyGroups.at(-1).id]!==undefined;
const currentEarlyGroup=s=>earlyGroups.find(group=>s.tasks.early?.claimed?.[group.id]===undefined);

function earlyTaskGroup(s) {
  const early=s.tasks.early;
  const group=currentEarlyGroup(s)??earlyGroups.at(-1);
  const progress=early?.progress??{};
  const rows=group.rows(s,{...progress,legacy:early?.legacy,retained:progress.retainedIds?.length??0});
  const claimed=early?.claimed?.[group.id]!==undefined;
  return {group,rows:claimed?rows.map(row=>({...row,done:true})):rows,claimed};
}

function openEarlyGroup(s,now) {
  s.tasks.early={startedAt:now,claimed:s.tasks.early?.claimed??{},progress:{}};
}

function recordEarlySale(p,sale) {
  if(sale.channel!=='market'&&sale.channel!=='order')return;
  p.sales=(p.sales??0)+1;
  p.sold=(p.sold??0)+sale.lines.length;
  p.income=(p.income??0)+sale.total;
  const metric=sale.channel==='market'?'marketSales':'orders';
  p[metric]=(p[metric]??0)+1;
}

function migrateEarlyGroup(s,now) {
  const started=earlyStart(s);
  if(started===undefined||earlyDone(s)||s.tasks.early?.startedAt!==undefined)return false;
  const old=s.tasks.early?.progress??{};
  const p={...old,feeds:Math.max(old.feeds??0,Number(s.rooms.rabbit.nutrition?.startsAt>=started)),
    retainedIds:[...new Set([...(old.retainedIds??[]),...s.pets.filter(animal=>animal.species==='rabbit'&&animal.retained).map(pet=>pet.id)])].slice(0,5),
    research:s.research.rabbit.reduce((sum,level)=>sum+level,0),orders:old.cancelled??0};
  const guide=s.onboarding;
  for(const sale of s.sales) {
    if(sale.at<started||(sale.channel==='order'&&sale.targetId===guide?.orderId)||
      (sale.channel==='market'&&sale.lines.some(line=>guide?.starters?.includes(line.id))))continue;
    recordEarlySale(p,sale);
  }
  openEarlyGroup(s,now);
  s.tasks.early.legacy=true;
  s.tasks.early.progress=p;
  return true;
}

function visitEarly(s,page,args,now) {
  const early=s.tasks.early;
  if(!early)return s;
  const p=early.progress, updates={};
  const litter=s.rooms.rabbit.lastLitter;
  if(page==='litter'&&(args.species??'rabbit')==='rabbit'&&litter&&
      litter.bornAt>(early.legacy?s.onboarding?.firstLitterAt??0:early.startedAt)&&litter.ids[0]!==p.lastLitterId){
    updates.lastLitterId=litter.ids[0];updates.litters=(p.litters??0)+1;
  }
  if(page==='lab'&&(!args.tab||args.tab==='seed')&&!p.shelf)updates.shelf=true;
  if((page==='lab'&&args.tab==='services'||page==='services')&&!p.services)updates.services=true;
  if(page==='pet'&&(!p.archive||!p.seedArchive)){
    const pet=s.pets.find(animal=>animal.id===args.id&&animal.species==='rabbit');
    if(pet&&!p.archive)updates.archive=true;
    if(pet?.retained&&!p.seedArchive)updates.seedArchive=true;
  }
  if(page==='research'&&(args.species??'rabbit')==='rabbit'&&!p.researchRead)updates.researchRead=true;
  if(page==='roomNutrition'&&(args.species??'rabbit')==='rabbit'&&!p.mealRead&&
      (p.feeds||activeNutrition(s.rooms.rabbit,now)))updates.mealRead=true;
  if(page==='orders'){
    if(!p.orderRead)updates.orderRead=true;
    if(!p.refill){
      const firstOrder=early.legacy&&s.sales.find(sale=>sale.targetId===s.onboarding?.orderId&&sale.channel==='order');
      if(s.orders.some(slot=>early.legacy
        ?slot.order?.refilledAt>=(firstOrder?.at??earlyStart(s))
        :slot.order?.refilledAt>early.startedAt))updates.refill=true;
    }
  }
  if(!Object.keys(updates).length)return s;
  const updated={...s,tasks:{...s.tasks,early:{...s.tasks.early,progress:{...p,...updates}}}};
  return updated;
}

function recordEarlyAction(s,type,args) {
  const p=s.tasks.early.progress;
  const counters={'care.breed':'breeds','care.feed':'feeds','care.buyPet':'bought','order.cancel':'orders','research.upgrade':'research'};
  const counter=Object.hasOwn(counters,type)?counters[type]:null;
  if(counter&&(args.species??'rabbit')==='rabbit'){
    p[counter]=(p[counter]??0)+1;
  }
  if(type==='sale.commit')recordEarlySale(p,s.sales.at(-1));
  const kept=type==='care.retain'&&args.retained?[args.id]:type==='care.keepLitter'?args.keepIds:
    type==='sale.commit'?args.litterRetention?.keepIds:undefined;
  const rabbits=kept?.filter(id=>s.pets.some(p=>p.id===id&&p.species==='rabbit'));
  if(!rabbits?.length)return;
  p.retainedIds=[...new Set([...(p.retainedIds??[]),...rabbits])].slice(0,5);
}

export function initTasks(s,now) {
  if(s.tasks?.opening)return migrateEarlyGroup(s,now);
  s.tasks??={};
  const {job,lastLitter}=s.rooms.rabbit;
  const old=s.visitBook.tutorial;
  const progress=s.tasks.opening={
    breed:!!(old?.bred||job||lastLitter), buy:!!old?.bought, checkin:!!(old?.claimed||s.care.signedDay!=null),
    orders:!!old?.ordersViewed, market:!!old?.marketViewed,
  };
  delete s.visitBook.tutorial;
  const knownParents=job?[...s.pets,job.mother,job.father]:s.pets;
  const purchasedIds=new Set(knownParents.filter(isPurchasedRabbit).map(p=>p.id));
  if(purchasedIds.size)progress.buy=true;

  // A legacy mating can count when its receipt and both purchase records are still available.
  let firstRabbitPair=Infinity, qualifyingPair;
  for(const receipt of Object.values(s.receipts)){
    const version=receipt?.result?.version;
    if(!Number.isSafeInteger(version)||typeof receipt.key!=='string'||!/^\["care\.(breed|buyPet)",/.test(receipt.key))continue;
    let type,args;
    try { [type,args]=JSON.parse(receipt.key); } catch { continue; }
    if(!args||(args.species??'rabbit')!=='rabbit')continue;
    if(type==='care.buyPet'){progress.buy=true;continue;}
    progress.breed=true;
    firstRabbitPair=Math.min(firstRabbitPair,version);
    if(purchasedIds.has(args.mother)&&purchasedIds.has(args.father)&&version>(qualifyingPair?.version??0)){
      qualifyingPair={motherId:args.mother,fatherId:args.father,version};
    }
  }
  if(!s.tasks[rabbitPairTask]&&qualifyingPair&&qualifyingPair.version>firstRabbitPair)s.tasks[rabbitPairTask]=qualifyingPair;
  migrateEarlyGroup(s,now);
  return true;
}

export function recordTaskAction(s,type,args,now) {
  if(earlyStart(s)!==undefined){
    if(earlyDone(s))return;
    if(s.tasks.early?.startedAt===undefined)openEarlyGroup(s,now);
    recordEarlyAction(s,type,args);
    return;
  }
  if(s.onboarding)return;
  const progress=s.tasks.opening;
  if(type==='care.checkin')progress.checkin=true;
  if((args.species??'rabbit')!=='rabbit')return;
  if(type==='care.buyPet')progress.buy=true;
  if(type!=='care.breed')return;
  progress.breed=true;
  if(s.tasks[rabbitPairTask])return;
  const {job,lastLitter}=s.rooms.rabbit;
  if(lastLitter&&isPurchasedRabbit(job?.mother)&&isPurchasedRabbit(job?.father)){
    s.tasks[rabbitPairTask]={motherId:job.motherId,fatherId:job.fatherId,version:s.version+1};
  }
}

export function recordTaskVisit(s,page,args,now) {
  if(earlyStart(s)!==undefined)return earlyDone(s)?s:visitEarly(s,page,args,now);
  if(s.onboarding)return s;
  if(!['orders','market'].includes(page)||s.tasks.opening[page])return s;
  return {...s,tasks:{...s.tasks,opening:{...s.tasks.opening,[page]:true}}};
}

const complete=s=>!!s.tasks[rabbitPairTask]&&Object.values(s.tasks.opening).every(Boolean);

function taskRows(s,access) {
  const task=s.tasks[rabbitPairTask], p=s.tasks.opening;
  const requirement=key=>access[key].unlocked?'':' · '+access[key].requiredLevel+' 级开放';
  return [
    entry('开始兔子繁育','确认一公一母的配对。',p.breed,'breed',{species:'rabbit'}),
    entry('购入一只种兔','培育中心 · 种源'+requirement('lab'),p.buy,'lab',{fromTasks:true}),
    entry('签到领养幼兔','领取今日的两只幼兔。',p.checkin,'profile'),
    entry('查看普通订单','订单'+requirement('orders'),p.orders,'orders',{fromTasks:true}),
    entry('查看自由市场','查看当前的动物报价。',p.market,'market'),
    entry('用购入的种兔继续繁育','首窝出生后，用购入的一公一母开始配对。',!!task,'breed',{species:'rabbit'}),
  ];
}

export function taskShortcut(s,access) {
  if(earlyStart(s)!==undefined){
    const {rows,claimed}=earlyTaskGroup(s);
    const next=rows.find(row=>!row.done);
    return {completed:rows.filter(row=>row.done).length,total:rows.length,
      choice:next?{...next.link,label:next.title}:{page:'tasks',label:claimed?'首轮经营任务已完成':'领取任务奖励'}};
  }
  if(s.onboarding)return {completed:4,total:4,choice:{page:'tasks',label:'查看开店任务'}};
  const rows=taskRows(s,access), pending=rows.filter(r=>!r.done);
  const next=pending[0];
  const claimed=s.tasks[rabbitPairTask]?.claimedAt!==undefined;
  return {completed:rows.length-pending.length,total:rows.length,
    choice:next?{...next.link,label:next.title}:{page:'tasks',label:claimed?'任务已全部完成':'领取任务奖励'}};
}

export function tasksPage(s,access) {
  if(earlyStart(s)!==undefined){
    const {group,rows,claimed}=earlyTaskGroup(s);
    return {title:'任务',subtitle:group.title+' · '+rows.filter(r=>r.done).length+' / '+rows.length+' 已完成',rows,
      visual:{rewards:[{name:'金币',quantity:group.coins}]},
      actions:[{label:claimed?'已领取':'领取',type:'task.claim',args:{id:group.id},disabled:claimed||rows.some(row=>!row.done)}]};
  }
  const rows=taskRows(s,access);
  const claimed=s.tasks[rabbitPairTask]?.claimedAt!==undefined;
  return {title:'任务',subtitle:rows.filter(r=>r.done).length+' / '+rows.length+' 已完成',rows,
    visual:{rewards:openingReward},
    actions:[{label:claimed?'已领取':'领取',type:'task.claim',args:{id:rabbitPairTask},disabled:claimed||!complete(s)}]};
}

export function taskAction(s,type,args,now) {
  if(type!=='task.claim')return undefined;
  if(earlyStart(s)!==undefined){
    const early=s.tasks.early;
    if(args.id===rabbitPairTask&&s.tasks[rabbitPairTask]?.claimedAt!==undefined)throw new Error('这项任务的奖励已领取。');
    if(early?.claimed?.[args.id]!==undefined)throw new Error('这组任务的奖励已领取。');
    const {group,rows}=earlyTaskGroup(s);
    if(args.id!==group.id)throw new Error('请先完成当前一组任务。');
    if(rows.some(row=>!row.done))throw new Error('请先完成这组里的全部任务。');
    const earlyState=s.tasks.early??={};
    (earlyState.claimed??={})[group.id]=now;
    s.coins+=group.coins;
    openEarlyGroup(s,now);
    const next=currentEarlyGroup(s);
    return '已领取「'+group.title+'」奖励 '+group.coins+' 金币。'+(next?'已开启「'+next.title+'」。':'首轮经营任务已完成。');
  }
  if(args.id!==rabbitPairTask)throw new Error('没有这项任务。');
  const task=s.tasks[rabbitPairTask];
  if(task?.claimedAt!==undefined)throw new Error('这项任务的奖励已领取。');
  if(!complete(s))throw new Error('请先完成全部任务。');
  const message=grantOpeningReward(s);
  task.claimedAt=now;
  return message;
}

export function grantOpeningReward(s) {
  const room=s.rooms.rabbit;
  const stock=nutritionStock(room,reward.tier)+reward.quantity;
  if(!Number.isSafeInteger(stock))throw new Error('兔房对应营养餐库存已满。');
  s.coins+=reward.coins;
  room.nutritionStock??={};
  room.nutritionStock[reward.tier]=stock;
  return '已领取 '+reward.coins+' 金币和 '+reward.quantity+' 份臻选兔兔营养餐。';
}
