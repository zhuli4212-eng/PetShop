import { nutritionStock } from './room-nutrition.mjs';

const rabbitPairTask='rabbit-pair';
const reward={coins:40,tier:'premium',quantity:2};
const isPurchasedRabbit=p=>p?.species==='rabbit'&&p.source==='研究所采购';

export function initTasks(s) {
  if(s.tasks)return false;
  s.tasks={};
  const {job}=s.rooms.rabbit;
  const knownParents=job?[...s.pets,job.mother,job.father]:s.pets;
  const purchasedIds=new Set(knownParents.filter(isPurchasedRabbit).map(p=>p.id));
  if(purchasedIds.size<2)return true;

  // A legacy mating can count when its receipt and both purchase records are still available.
  let firstRabbitPair=Infinity, qualifyingPair;
  for(const receipt of Object.values(s.receipts)){
    const version=receipt?.result?.version;
    if(!Number.isSafeInteger(version)||typeof receipt.key!=='string'||!receipt.key.startsWith('["care.breed",'))continue;
    let args;
    try { [,args]=JSON.parse(receipt.key); } catch { continue; }
    if(!args||(args.species??'rabbit')!=='rabbit')continue;
    firstRabbitPair=Math.min(firstRabbitPair,version);
    if(purchasedIds.has(args.mother)&&purchasedIds.has(args.father)&&version>(qualifyingPair?.version??0)){
      qualifyingPair={motherId:args.mother,fatherId:args.father,version};
    }
  }
  if(qualifyingPair&&qualifyingPair.version>firstRabbitPair)s.tasks[rabbitPairTask]=qualifyingPair;
  return true;
}

export function recordTaskAction(s,type,args) {
  if(type!=='care.breed'||(args.species??'rabbit')!=='rabbit'||s.tasks[rabbitPairTask])return;
  const {job,lastLitter}=s.rooms.rabbit;
  if(lastLitter&&isPurchasedRabbit(job?.mother)&&isPurchasedRabbit(job?.father)){
    s.tasks[rabbitPairTask]={motherId:job.motherId,fatherId:job.fatherId,version:s.version+1};
  }
}

export function tasksPage(s,access) {
  const task=s.tasks[rabbitPairTask], room=s.rooms.rabbit, firstBorn=!!room.lastLitter||!!task;
  const claimed=task?.claimedAt!==undefined;
  const title='用购入的种兔继续繁育';
  const rewardText=reward.coins+' 金币 · 臻选兔兔营养餐 '+reward.quantity+' 份';
  const actions=[];
  if(task&&!claimed)actions.push({label:'领取奖励',type:'task.claim',args:{id:rabbitPairTask}});
  if(!task) {
    actions.push({label:'前往繁育',page:'breed',args:{species:'rabbit'}});
    if(firstBorn&&access.lab.unlocked)actions.push({label:'前往种源货架',page:'shelf',args:{species:'rabbit'}});
  }
  return {title:'任务',subtitle:claimed?'已领取':task?'可领取':'进行中',rows:[
    {title,text:'用一公一母两只从培育中心买来的种兔开始配对。'},
    {title:'完成首窝兔子繁育',text:firstBorn?'已完成':room.job?'繁育中，等待首窝出生':'尚未开始',done:firstBorn},
    {title:'确认购入种兔的配对',text:task?'已完成':'等待配对成功',done:!!task},
    {title:'任务奖励',text:rewardText},
    ...(!task&&firstBorn&&!access.lab.unlocked?
      [{title:'培育中心',text:'店铺达到 '+access.lab.requiredLevel+' 级后开放种源货架。'}]:[]),
    {title:'新手引导',text:'查看开店四步与当前进度。',link:{page:'tutorial'}},
  ],actions};
}

export function taskAction(s,type,args,now) {
  if(type!=='task.claim')return undefined;
  if(args.id!==rabbitPairTask)throw new Error('没有这项任务。');
  const task=s.tasks[rabbitPairTask];
  if(!task)throw new Error('请先完成任务。');
  if(task.claimedAt!==undefined)throw new Error('这项任务的奖励已领取。');
  const room=s.rooms.rabbit;
  const stock=nutritionStock(room,reward.tier)+reward.quantity;
  if(!Number.isSafeInteger(stock))throw new Error('兔房对应营养餐库存已满。');
  s.coins+=reward.coins;
  room.nutritionStock??={};
  room.nutritionStock[reward.tier]=stock;
  task.claimedAt=now;
  return '已领取 '+reward.coins+' 金币和 '+reward.quantity+' 份臻选兔兔营养餐。';
}
