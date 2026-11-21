import {createHmac} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {createShowRuleSnapshot,scoreShowGrades,privateAwardTier,rankPublicScores,publicShowRuleView} from './show-rules-v2.mjs';

export const privateShowTypes=[1,3,5].map(count=>({id:'V2P'+count,name:count+'项考核',mode:'private'}));
export const publicShowTypes=Array.from({length:12},(_,i)=>({id:'V2O'+String(i+1).padStart(2,'0'),name:'公开赛 · 第'+(i+1)+'主题',mode:'public'}));
const speciesNames={rabbit:'兔',cat:'猫',dog:'狗'};
export const trialEconomyNote='本地测试：报名费用、五档奖励及现金沿用临时参数，非正式定价。';

function draw(s,mode,index,label,size) {
  const limit=4294967296-4294967296%size;
  for(let attempt=0;;attempt++){
    const n=createHmac('sha256',Buffer.from(s.rootSeed,'hex'))
      .update(JSON.stringify(['show-v2',s.profileId,mode,index,label,attempt])).digest().readUInt32BE();
    if(n<limit)return n%size;
  }
}
export function v2Theme(s,mode,index,count,start) {
  const order=[0,1,2,3,4];
  for(let i=4;i>0;i--){const j=draw(s,mode,index,'attribute-'+count+'-'+i,i+1);[order[i],order[j]]=[order[j],order[i]];}
  const attributes=order.slice(0,count).sort((a,b)=>a-b);
  const coreAttribute=count===1?null:attributes[draw(s,mode,index,'core-'+count,count)];
  const rules=structuredClone(createShowRuleSnapshot({mode,attributes,coreAttribute}));
  if(mode==='private')return {...privateShowTypes.find(t=>t.id==='V2P'+count),rules};
  const available=['dog','cat','rabbit'].filter(key=>s.rooms?.[key]&&
    (!Number.isFinite(s.rooms[key].openedAt)||s.rooms[key].openedAt<=start));
  const species=available[index%available.length]??'rabbit';
  return {...publicShowTypes[index%12],name:speciesNames[species]+'组公开赛 · 第'+(index+1)+'期',rules,species};
}
export function v2Match(scores,theme) {
  const total=scoreShowGrades(scores,theme.rules);
  return {total,divisor:1,key:[total]};
}
export const v2PrivateTier=(match,theme)=>privateAwardTier(match.total,theme.rules);
export function v2Board(entries,theme,rankCash) {
  const ranked=rankPublicScores(entries.map(e=>({id:e.accountId,score:scoreShowGrades(e.scores,theme.rules)})),theme.rules,
    {rewardKeys:['laurel','gold','silver','bronze','memorial']});
  const original=new Map(entries.map(e=>[e.accountId,e]));
  const sizes=new Map();
  for(const e of ranked.entries)if(e.rank)sizes.set(e.rank,(sizes.get(e.rank)??0)+1);
  const rows=ranked.entries.map((row,i)=>({...original.get(row.id),match:{total:row.score,divisor:1,key:[row.score]},
    position:i+1,tieRank:row.rank,tieSize:sizes.get(row.rank)??0,tier:row.rewardKey,qualified:row.qualified,
    guarantee:row.rewardKey?20:0,rankReward:row.rewardKey?rankCash(row.rank,1,ranked.qualifiedCount):0}));
  return {entries:rows,nq:ranked.qualifiedCount,scoreBands:ranked.qualifiedScoreBands};
}
export function v2RuleRows(theme) {
  if(theme.rules.mode==='public')return [
    {title:'公开赛规则',text:'按最终整数总分评定，过线后按不同分数档排名；同分并列同奖，低于资格线无奖。'},
    {title:'本地测试参数',text:trialEconomyNote},
  ];
  const view=publicShowRuleView(theme.rules),names=['性格','品相','毛发','体态','体型'];
  const {bronze,silver,gold}=view.cupThresholds;
  return [
    {title:'考核属性',text:view.attributes.map(i=>names[i]).join('、')+'；缺陷按系数计入总分。'},
    {title:'奖杯门槛',text:'铜杯 '+bronze+' · 银杯 '+silver+' · 金杯 '+gold+' 分；只获实际达到的最高奖。'},
  ];
}
