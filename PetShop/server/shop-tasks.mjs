import { nutritionStock } from './room-nutrition.mjs';

const rabbitPairTask='rabbit-pair';
const reward={coins:40,tier:'premium',quantity:2};
export const openingReward=[
  {name:'金币',quantity:reward.coins},
  {name:'臻选兔兔营养餐',quantity:reward.quantity,art:'rooms/rabbit-nutrition-premium'},
];
const isPurchasedRabbit=p=>p?.species==='rabbit'&&p.source==='研究所采购';

export function initTasks(s) {
  if(s.tasks?.opening)return false;
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
  return true;
}

export function recordTaskAction(s,type,args) {
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

export function recordTaskVisit(s,page) {
  if(!['orders','market'].includes(page)||s.tasks.opening[page])return s;
  return {...s,tasks:{...s.tasks,opening:{...s.tasks.opening,[page]:true}}};
}

const complete=s=>!!s.tasks[rabbitPairTask]&&Object.values(s.tasks.opening).every(Boolean);

function taskRows(s,access) {
  const task=s.tasks[rabbitPairTask], p=s.tasks.opening;
  const entry=(title,text,done,page,args={})=>({title,text,done,link:{page,args}});
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
  const rows=taskRows(s,access), pending=rows.filter(r=>!r.done);
  const next=pending[0];
  const claimed=s.tasks[rabbitPairTask]?.claimedAt!==undefined;
  return {completed:rows.length-pending.length,total:rows.length,
    choice:next?{...next.link,label:next.title}:{page:'tasks',label:claimed?'任务已全部完成':'领取任务奖励'}};
}

export function tasksPage(s,access) {
  const rows=taskRows(s,access);
  const claimed=s.tasks[rabbitPairTask]?.claimedAt!==undefined;
  return {title:'任务',subtitle:rows.filter(r=>r.done).length+' / '+rows.length+' 已完成',rows,
    visual:{rewards:openingReward},
    actions:[{label:claimed?'已领取':'领取',type:'task.claim',args:{id:rabbitPairTask},disabled:claimed||!complete(s)}]};
}

export function taskAction(s,type,args,now) {
  if(type!=='task.claim')return undefined;
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
