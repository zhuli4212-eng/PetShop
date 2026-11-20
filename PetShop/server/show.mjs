import { createHash, createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';
import events from './show-events.json' with { type: 'json' };
import { stageOf, isBusy, breedName, petArt, specimen } from './care.mjs';
import { cardQualityScore } from './animal-traits.mjs';
import { shopRules } from './shop-features.mjs';
import { shopRaceAccess } from './shop-progression.mjs';

// Fixed calendar for the local edition: Monday 20:00, Beijing time.
export const GAME_EPOCH = Date.parse('2026-11-09T20:00:00+08:00');
const HOUR = 3600000, DAY = 24 * HOUR, WEEK = 7 * DAY;
const grades = ['E', 'D', 'C', 'B', 'A', 'S', 'S+'];
const dimensions = ['性格', '品相', '毛发', '体态', '体型', '缺陷'];
const animals = { rabbit: '兔', cat: '猫', dog: '狗' };
// 模拟选手只保存六维评分，使用与物种页签一致的示意头像。
const speciesPortrait = {rabbit:'pets/angora-coat01_female',cat:'pets/british-coat01_female',dog:'pets/shiba-coat01_male'};
const trophies = { bronze: '铜杯', silver: '银杯', gold: '金杯', memorial: '纪念杯', laurel: '桂冠杯' };
const tiers = { private: ['gold','silver','bronze'], public: ['laurel','gold','silver','bronze','memorial'] };
const points = { private: {bronze:20,silver:60,gold:100}, public: {memorial:50,bronze:100,silver:200,gold:400,laurel:600} };
const honors = { private: {bronze:0,silver:0.4,gold:0.8}, public: {memorial:0,bronze:0.2,silver:0.4,gold:0.6,laurel:0.8} };
const dateFormat = new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const time = value => dateFormat.format(value);
const lookup = (records,key) => Object.hasOwn(records,key) ? records[key] : null;
const gradeList = values => values.map(g => grades[g]).join(' / ');
const topicArt = 'shop-modules/stage';
const PNAME = {private:'私人赛', public:'本地模拟公开赛'};

export const themes = events.map(({id,name,targets,weights}) => ({
  id,name, mode:id[0]==='P'?'private':'public', targets:targets.map(x=>grades.indexOf(x)), weights,
}));
const groups = { private:themes.filter(t=>t.mode==='private'), public:themes.filter(t=>t.mode==='public') };
const byTheme = Object.fromEntries(themes.map(t=>[t.id,t]));
export const shopRating = s => (s.ratingBps || 0) / 10000;
export const petHonor = (s,pet) => pet.honor || 0;

export function initShow(s,now) {
  s.show ??= { epoch:s.gameEpoch ?? GAME_EPOCH, activePrivate:null, weeks:{}, entries:{}, cups:{} };
  ensureCalendar(s,now);
  s.ratingBps ??= 0;
}

// The anchored rules are enough to reproduce an unattended week. Old saves
// already carry the profile key and opening time; keep their stored draws intact.
function ensureCalendar(s,now) {
  if(s.show.calendar) return;
  const openedAt=Number.isFinite(s.createdAt)?s.createdAt:null;
  // A result that predates the shop must not be added as a missed public event.
  let first=openedAt===null?null:Math.max(0,Math.ceil((openedAt-s.show.epoch-5*DAY)/WEEK));
  if(openedAt===null) for(const w of Object.values(s.show.weeks)) {
    if(Number.isSafeInteger(w.index) && w.index>=0) first=first===null?w.index:Math.min(first,w.index);
  }
  first??=Math.max(0,Math.floor(((now??s.show.epoch)-s.show.epoch)/WEEK));
  s.show.calendar={version:1,firstWeek:first,themes:structuredClone(groups.public)};
}

function roundStart(s,mode,index) {
  return s.show.epoch + index * (mode === 'public' ? WEEK : DAY);
}
function period(s,mode,now) {
  const index = Math.floor((now-s.show.epoch)/(mode==='public'?WEEK:DAY));
  if(index<0) return null;
  const start = roundStart(s,mode,index);
  return {id:mode+'-'+index,index,start,close:start+(mode==='public'?94:22)*HOUR, result:start+(mode==='public'?5*DAY:DAY), payout:mode==='public'?start+6*DAY:null};
}
function digest(key,...fields) {
  return createHmac('sha256',key).update(JSON.stringify(fields),'utf8').digest();
}
function offset(key,profile,event,species,bot,dim) {
  for(let counter=0;;counter++) {
    const value=digest(key,1,'bot_score_v1',profile,event,species,bot,dim,counter).readUInt32BE();
    if(value>=4294967200) continue;
    const n=value%100;
    return n<5?-3:n<15?-2:n<35?-1:n<65?0:n<85?1:n<95?2:3;
  }
}
function publicTheme(s,index) {
  const cycle=s.show.calendar.themes;
  return cycle[index%cycle.length];
}
function makeWeek(s,round,kinds=Object.keys(animals)) {
  const theme=structuredClone(publicTheme(s,round.index)), key=Buffer.from(s.rootSeed,'hex');
  const bots={};
  for(const kind of kinds) {
    bots[kind]=Array.from({length:99}, (_,i)=>theme.targets.map((target,dim)=>
      Math.max(0,Math.min(6,target+offset(key,s.profileId,round.id,kind,i+1,dim)))));
  }
  const seed=digest(key,1,'tie_seed_v1',s.profileId,round.id,'','','',0);
  return {...round,theme,bots,version:1,seed:seed.toString('hex'),commit:createHash('sha256').update(seed).digest('hex')};
}
function syncRounds(s,now) {
  const daily=period(s,'private',now);
  if(daily && s.show.activePrivate?.id!==daily.id) {
    const choices=[0,9,18].map(shift=>structuredClone(groups.private[(daily.index+shift)%28]));
    s.show.activePrivate={...daily,choices};
  }
  const week=period(s,'public',now);
  if(week && !s.show.weeks[week.id]) s.show.weeks[week.id]=makeWeek(s,week);
}
export function matchScores(scores,theme) {
  const dims=theme.targets.map((target,i)=>[100,70,30,0][Math.min(3,Math.abs(scores[i]-target))]);
  const total=theme.weights.reduce((n,w,i)=>n+w*dims[i],0);
  const divisor=theme.weights.reduce((sum,w)=>sum+w,0);
  const order=[0,1,2,3,4,5].sort((a,b)=>theme.weights[b]-theme.weights[a]||a-b);
  const key=[total,Math.min(...dims),dims.filter(x=>x===100).length,...order.map(i=>dims[i])];
  return {dims,total,divisor,key};
}
const displayScore = m => String(Number((m.total/m.divisor).toFixed(2)));
const qualifies = m => m.total >= 68*m.divisor;
function compareKeys(a,b) {
  for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return b[i]-a[i];
  return 0;
}
export function publicTier(position,count) {
  if(position<1||position>count) return null;
  const cutoff=[5,20,50,80,100].findIndex(p=>position<=Math.floor(p*count/100));
  return tiers.public[cutoff];
}
export function rankCash(position,tied,nq) {
  if(nq<2) return 0;
  const top=Math.max(3,Math.ceil(nq/10)), next=Math.max(10,Math.ceil(3*nq/10));
  let sum=0;
  for(let p=position;p<position+tied;p++) sum+=p===1?540:p<=top?270:p<=next?120:0;
  return Math.floor(sum*Math.min(9,nq-1)/(9*tied));
}
function privateTier(match) {
  const {total:n,divisor:d}=match;
  return n>=95*d?'gold':n>=82*d?'silver':n>=68*d?'bronze':null;
}
function drawToken(seed,input) {
  return createHmac('sha256',Buffer.from(seed,'hex')).update(input,'utf8').digest('hex');
}
function board(s,week,species) {
  const entries=week.bots[species].map((scores,i)=>{
    const ordinal=String(i+1).padStart(2,'0');
    return {accountId:'bot-'+species+'-'+ordinal,name:'模拟'+animals[species]+ordinal,scores};
  });
  const reg=s.show.entries[week.id];
  if(reg && !reg.voided && reg.pet.species===species) {
    entries.push({accountId:s.profileId,name:reg.pet.name,scores:reg.pet.scores,player:true});
  }
  for(const e of entries) {
    e.match=matchScores(e.scores,week.theme);
    e.draw=drawToken(week.seed,week.id+'|'+e.accountId);
  }
  entries.sort((a,b)=>{
    const sort=compareKeys(a.match.key,b.match.key);
    if(sort) return sort;
    if(a.draw!==b.draw) return a.draw<b.draw?-1:1;
    return drawToken(week.seed,'tie-again|'+week.id+'|'+a.accountId).localeCompare(drawToken(week.seed,'tie-again|'+week.id+'|'+b.accountId));
  });
  const nq=entries.filter(e=>qualifies(e.match)).length;
  for(let i=0;i<entries.length;) {
    let end=i+1;
    while(end<entries.length && compareKeys(entries[i].match.key,entries[end].match.key)===0) end++;
    const qualified=qualifies(entries[i].match);
    const rankReward=qualified?rankCash(i+1,end-i,nq):0;
    for(let j=i;j<end;j++) Object.assign(entries[j],{position:j+1,tieRank:i+1,tieSize:end-i,tier:publicTier(j+1,entries.length),guarantee:qualified?20:0,rankReward});
    i=end;
  }
  return {entries,nq};
}
function recordCup(s,entry,outcome) {
  const tier=outcome.tier;
  if(!tier) return;
  const key=entry.theme.id+'-'+tier;
  const cups=s.show.cups;
  const previous=Object.values(cups).filter(c=>c.themeId===entry.theme.id)
    .reduce((max,c)=>Math.max(max,points[entry.mode][c.tier]),0);
  if(!cups[key]) cups[key]={themeId:entry.theme.id,tier,count:0,first:entry.id,firstAt:entry.result,source:entry.mode==='public'?'local_sim':'private'};
  cups[key].count++;
  s.ratingBps+=Math.max(0,points[entry.mode][tier]-previous);
  const pet=s.pets.find(p=>p.id===entry.pet.id);
  if(pet) pet.honor=Math.max(pet.honor||0,honors[entry.mode][tier]);
}
function settle(s,e) {
  const match=matchScores(e.pet.scores,e.theme);
  if(e.mode==='private') e.outcome={match,tier:privateTier(match),guarantee:0,rankReward:0};
  else {
    const ranked=board(s,s.show.weeks[e.id],e.pet.species), own=ranked.entries.find(r=>r.player);
    e.outcome={match,tier:own.tier,position:own.position,tieRank:own.tieRank,tieSize:own.tieSize,n:ranked.entries.length,nq:ranked.nq,guarantee:own.guarantee,rankReward:own.rankReward};
  }
  recordCup(s,e,e.outcome);
  s.coins+=e.outcome.guarantee;
}
export function tickShow(s,now) {
  ensureCalendar(s,now);
  syncRounds(s,now);
  const due=[];
  for(const e of Object.values(s.show.entries)) {
    if(e.voided) continue;
    if(!e.outcome && e.result<=now) due.push({at:e.result,e,step:'result'});
    if(e.payout && !e.cashClosed && e.payout<=now) due.push({at:e.payout,e,step:'cash'});
  }
  due.sort((a,b)=>a.at-b.at||a.e.id.localeCompare(b.e.id));
  for(const {e,step} of due) {
    if(step==='result') settle(s,e);
    else {
      const {guarantee,rankReward}=e.outcome;
      e.cashPaid=Math.max(0,rankReward-guarantee);
      s.coins+=e.cashPaid;
      e.cashClosed=true;
    }
  }
}

function current(s,mode,now) {
  const slot=period(s,mode,now);
  return slot && (mode==='private'?s.show.activePrivate:s.show.weeks[slot.id]);
}
function eligible(s,p,now) {
  return p && Object.hasOwn(animals,p.species) && ['成年','老年'].includes(stageOf(p,now)) && !isBusy(s,p);
}
function petSummary(p,now) {
  return {id:p.id,name:p.name,species:p.species,breed:breedName(p),breedKey:p.breedKey,mixed:Boolean(p.mixed),coatIndex:p.coatIndex,sex:p.sex,art:petArt(p),stage:stageOf(p,now),
    scores:p.traits.map(t=>grades.indexOf(t.grade)),traits:p.traits.map(t=>({type:t.type,label:t.label,rarity:t.rarity,grade:t.grade}))};
}
const privateFees={rabbit:20,cat:100,dog:120};
function feeFor(s,mode,species) {
  return mode==='private'?Math.ceil(privateFees[species]*(200000-s.ratingBps)/2000000)*10:0;
}
function nextRegistration(s,mode,access,now) {
  let opens=Math.max(now,s.show.epoch,access.opensAt);
  let slot=period(s,mode,opens);
  if(opens>=slot.close||s.show.entries[slot.id]||s.show.voids?.[slot.id]){
    opens=roundStart(s,mode,slot.index+1);
    slot=period(s,mode,opens);
  }
  return '下一次可报名 '+time(opens)+'，截止 '+time(slot.close)+'，公布结果 '+time(slot.result)+'（北京时间）。';
}
function registrationOpens(s,mode,access,now) {
  return (mode==='private'?'私人赛':'公开赛')+'需开店第 '+access.opensDay+' 天。'+nextRegistration(s,mode,access,now);
}
function review(s,a,now,rules) {
  const mode=a.mode;
  if(!Object.hasOwn(PNAME,mode)) throw Error('请选择私人赛或本地模拟公开赛。');
  const access=shopRaceAccess(rules,s.createdAt,now).raceAccess[mode];
  if(!access.unlocked)throw Error(registrationOpens(s,mode,access,now));
  const round=current(s,mode,now);
  if(!round || round.id!==a.event || now>=round.close) throw Error('该轮报名已截止。'+nextRegistration(s,mode,access,now));
  if(s.show.voids?.[round.id])throw Error('本期技术作废。'+nextRegistration(s,mode,access,now));
  if(s.show.entries[round.id]) throw Error('本轮已经提交过报名。'+nextRegistration(s,mode,access,now));
  const choices=mode==='private'?round.choices:[round.theme], theme=choices.find(t=>t.id===a.theme);
  if(!theme) throw Error('本轮没有这场主题赛。');
  const pet=s.pets.find(p=>p.id===a.pet);
  if(!eligible(s,pet,now)) throw Error('请选店内成年或老年、空闲的动物。');
  const snapshot=petSummary(pet,now), fee=feeFor(s,mode,pet.species);
  const token=createHash('sha256').update(JSON.stringify([round.id,theme,snapshot,fee])).digest('hex');
  return {round,theme,snapshot,fee,token,match:matchScores(snapshot.scores,theme)};
}
export function showAction(s,type,args,now,rules=shopRules) {
  if(type!=='show.enter') return undefined;
  const {round,theme,snapshot,fee,token}=review(s,args,now,rules);
  if(args.token!==token) throw Error('报名动物或报价已变化，请重新核对快照。');
  if(s.coins<fee) throw Error('金币不足，无法支付私人赛报名费。');
  s.coins-=fee;
  s.show.entries[round.id]={id:round.id,mode:args.mode,theme:structuredClone(theme),submitted:now,fee,pet:snapshot,
    close:round.close,result:round.result,payout:round.payout,source:args.mode==='public'?'local_sim':'private'};
  return snapshot.name+'已报名「'+theme.name+'」，'+time(round.result)+'出结果。';
}
// Internal service recovery. This is deliberately not a player command.
export function voidShowEntry(s,id,reason) {
  const e=lookup(s.show.entries,id);
  if(!e || e.outcome || e.voided || !reason?.trim()) return false;
  e.voided=reason.trim();
  s.coins+=e.fee;
  return true;
}
export function maintenanceRounds(s,now) {
  return ['private','public'].flatMap(mode=>{
    const slot=period(s,mode,now);
    return slot?[{id:slot.id,mode:PNAME[mode],result:time(slot.result),entered:!!s.show.entries[slot.id],
      status:s.show.voids?.[slot.id]?'已作废':now<slot.result?'可作废':'已公布'}]:[];
  });
}
export function voidShowRound(s,id,reason,now) {
  const mode=typeof id==='string'&&/^(private|public)-(0|[1-9]\d*)$/.exec(id)?.[1];
  if(!mode)throw Error('期号格式无效。');
  if(typeof reason!=='string'||!reason.trim()||reason.trim().length>200)throw Error('请填写 1 至 200 字的技术原因。');
  const old=s.show.voids?.[id];
  if(old)return old;
  const round=period(s,mode,now);
  if(!round||round.id!==id||now>=round.result)throw Error('只能作废已开放且尚未公布结果的本期赛事。');
  const entry=s.show.entries[id];
  if(entry?.outcome)throw Error('已经结算的赛事不能作废。');
  const record={id,reason:reason.trim(),at:now,refund:entry?.fee??0};
  if(entry&&!entry.voided)voidShowEntry(s,id,record.reason);
  s.show.voids??={};
  s.show.voids[id]=record;
  return record;
}
const link=(page,args={})=>({page,args});
const action=(label,page,args={})=>({label,page,args});
function themeLine(theme) {
  return '目标 '+gradeList(theme.targets);
}
function eventHome(s,now,rules) {
  const rows=[];
  const schedule={};
  const day=shopRaceAccess(rules,s.createdAt,now);
  for(const mode of ['private','public']) {
    const round=current(s,mode,now);
    const access=day.raceAccess[mode];
    if(!round){
      rows.push({title:PNAME[mode]+'尚未开赛',text:nextRegistration(s,mode,access,now),visual:{mode}});
      continue;
    }
    const start=rows.length;
    schedule[mode]={close:time(round.close),result:time(round.result),payout:round.payout?time(round.payout):'',entered:!!s.show.entries[round.id]};
    const entry=s.show.entries[round.id];
    const status=now>=round.close?'本轮已截止':access.unlocked?'报名至 '+time(round.close):'开店第 '+access.opensDay+' 天开放报名';
    const cancelled=s.show.voids?.[round.id];
    if(cancelled){
      rows.push({title:PNAME[mode]+' · 本期技术作废',text:cancelled.reason,
        ...(entry?{link:link('show.result',{event:entry.id})}:{})});
    } else if(mode==='private') {
      if(entry) rows.push({title:'私人赛 · '+entry.theme.name,text:'本轮已报名 '+entry.pet.name,link:link('show.result',{event:entry.id})});
      else for(const t of round.choices) rows.push({title:t.name,text:'私人三选一 · '+status,
        link:link('show.round',{mode,event:round.id,theme:t.id})});
    } else {
      rows.push({title:round.theme.name,text:'本地模拟公开赛 · '+(entry?'已报名 '+entry.pet.name:status),
        link:link(entry?'show.result':'show.round',{event:round.id,mode,theme:round.theme.id})});
      if(now>=round.result && round.index>=s.show.calendar.firstWeek) rows.push({title:'本周公开赛榜单',text:'兔、猫、狗分榜 · 查看实际获档名单',link:link('show.board',{event:round.id})});
    }
    if(now>=round.close||!access.unlocked||entry||cancelled){
      rows.push({title:'后续参赛时间',text:nextRegistration(s,mode,access,now)});
    }
    for(const row of rows.slice(start))row.visual={mode};
  }
  let model, bestScore=-1;
  for (const pet of s.pets) {
    if (stageOf(pet,now)==='已故') continue;
    const score=cardQualityScore(pet.traits);
    if (score!==undefined&&score>bestScore) {
      model=pet;
      bestScore=score;
    }
  }
  return {title:'比赛',art:topicArt,visual:{schedule,...day,pet:model?petArt(model):null,petStage:model?stageOf(model,now):null},subtitle:'北京时间 · 同一轮只可报名一只动物',rows,empty:'赛历 '+time(s.show.epoch)+' 开放',
    actions:[action('奖杯收藏','collection'),action('参赛记录','show.history'),action('公开赛历届榜单','show.archive')]};
}
function roundPage(s,a,now,rules) {
  const mode=a.mode, round=Object.hasOwn(PNAME,mode)?current(s,mode,now):null;
  if(!round || round.id!==a.event) return eventHome(s,now,rules);
  const theme=(mode==='private'?round.choices:[round.theme]).find(t=>t.id===a.theme);
  if(!theme) return eventHome(s,now,rules);
  const day=shopRaceAccess(rules,s.createdAt,now), access=day.raceAccess[mode];
  const rows=[
    {title:'六维目标',text:dimensions.map((d,i)=>d+' '+grades[theme.targets[i]]).join(' · ')},
    {title:'匹配规则',text:'距目标0/1/2/更多档，依次得100/70/30/0分。高于和低于目标同样扣分。'},
    {title:'报名截止 '+time(round.close),text:'结果 '+time(round.result)+(round.payout?' · 排名现金 '+time(round.payout):'')},
  ];
  if(mode==='public') {
    const order=[0,1,2,3,4,5].sort((x,y)=>theme.weights[y]-theme.weights[x]||x-y);
    rows.push({title:'六维权重',text:dimensions.map((d,i)=>d+' '+theme.weights[i]+'%').join(' · ')},
      {title:'同分比较',text:'先比最低单维和命中数，再比 '+order.map(i=>dimensions[i]).join('、')+'。仍并列时抽签定杯，现金按并列平分。'},
      {title:'本地模拟抽签承诺 · SHA-256',text:round.commit});
  } else rows.push({title:'奖杯门槛',text:'68 分铜杯，82 分银杯，95 分金杯。'});
  const reg=s.show.entries[round.id];
  if(s.show.voids?.[round.id])rows.push({title:'本期技术作废',text:s.show.voids[round.id].reason+' · '+nextRegistration(s,mode,access,now)});
  else if(reg) rows.push({title:'本轮已报名 · '+reg.pet.name,text:nextRegistration(s,mode,access,now),link:link('show.result',{event:reg.id})});
  else if(now<round.close&&!access.unlocked) rows.push({title:'报名尚未开放',text:registrationOpens(s,mode,access,now)});
  else if(now<round.close) {
    const pets=s.pets.filter(p=>eligible(s,p,now));
    if(!pets.length) rows.push({title:'暂无可报名动物',text:'需店内成年或老年、未在繁育中的动物。'});
    for(const p of pets) rows.push({title:p.name,text:'报名 '+feeFor(s,mode,p.species)+' 金币',
      animal:specimen(s,p,now),art:petArt(p),stage:stageOf(p,now),link:link('show.review',{mode,event:round.id,theme:theme.id,pet:p.id})});
  } else rows.push({title:'本期报名已截止',text:nextRegistration(s,mode,access,now)});
  const actions=mode==='public' && !s.show.voids?.[round.id] && now>=round.result && round.index>=s.show.calendar.firstWeek?[action('查看物种榜','show.board',{event:round.id})]:[];
  return {title:theme.name,subtitle:PNAME[mode],visual:day,rows,actions};
}
function reviewPage(s,a,now,rules) {
  let v;
  try{v=review(s,a,now,rules);}catch(error){return {title:'报名核对',rows:[{title:error.message}],actions:[action('回到赛事台','show')]};}
  const {snapshot:p,match,theme,fee,token}=v;
  return {title:'报名核对',subtitle:PNAME[a.mode]+' · '+theme.name,art:p.art,stage:p.stage,rows:[
    {title:p.name+' · '+p.breed,text:p.sex+' · '+p.stage+' · '+gradeList(p.scores)},
    {title:'六维匹配 '+displayScore(match)+' 分',text:themeLine(theme)+'\n逐维 '+match.dims.join(' / ')},
    {title:'本次实付 '+fee+' 金币',text:(a.mode==='private'?'基准 '+privateFees[p.species]+' 金币。':'公开赛免费。')+'提交后固定动物快照，占用本轮唯一机会。参赛后仍可出售或配对。'},
  ],actions:[{label:'提交报名',type:'show.enter',args:{mode:a.mode,event:a.event,theme:a.theme,pet:a.pet,token},
    confirm:'确定为「'+p.name+'」报名 '+theme.name+'？'+(a.mode==='private'?'基准 '+privateFees[p.species]+' 金币，':'')+'实付 '+fee+' 金币，提交后不能更换动物。',go:'show.result',goArgs:{event:a.event}},
    action('重选参赛动物','show.round',{mode:a.mode,event:a.event,theme:a.theme})]};
}
function resultPage(s,id) {
  const e=lookup(s.show.entries,id);
  if(!e) return {title:'参赛记录',rows:[],empty:'还没有这场报名。'};
  const o=e.outcome, p=e.pet;
  const rows=[{title:e.theme.name,text:PNAME[e.mode]+' · 报名 '+time(e.submitted)+' · 实付 '+e.fee+' 金币'},
    {title:'报名快照 · '+p.name,text:p.breed+' · '+p.sex+' · 报名时'+p.stage+'\n'+gradeList(p.scores),art:p.art,stage:p.stage},
    {title:'比赛目标',text:themeLine(e.theme)+'\n权重 '+e.theme.weights.join(' / ')}];
  if(e.voided) rows.push({title:'本期技术作废',text:e.voided+' · 已退 '+e.fee+' 金币'});
  else if(!o) rows.push({title:'已报名，等待结果',text:'公布 '+time(e.result)});
  else {
    rows.push({title:o.tier?'获得'+trophies[o.tier]:'本场未获杯',art:o.tier?'awards/'+o.tier:undefined,
      text:displayScore(o.match)+' 分 · '+time(e.result)+'\n逐维 '+o.match.dims.join(' / ')});
    if(e.mode==='public') rows.push({title:'第 '+o.position+' / '+o.n+' 位 · 达标 '+o.nq+' 位',text:'真正并列 '+o.tieSize+' 人，起始名次 '+o.tieRank},
      {title:'达标现金 +'+o.guarantee,text:e.cashClosed?'周日补差 +'+e.cashPaid+'，现金已结清。':'排名补差 '+time(e.payout)+' 结算。'});
    if(o.tier) rows.push({title:'本档权益',text:'本档覆盖较低收益资格；收藏仅计本次实际获得的'+trophies[o.tier]+'。'});
  }
  const actions=[action('奖杯收藏','collection')];
  if(e.mode==='public'&&o) actions.unshift(action('五档名单','show.board',{event:id,species:p.species}));
  return {title:'参赛记录',rows,actions};
}

function collectionPage(s,mode) {
  const selected=mode==='public'?'public':'private';
  const held=Object.values(s.show.cups).filter(c=>byTheme[c.themeId]?.mode===selected);
  return {title:'奖杯收藏',subtitle:PNAME[selected]+' · 已收集 '+held.length+' / '+(groups[selected].length*tiers[selected].length),
    rows:groups[selected].map(t=>{
      const earned=held.filter(c=>c.themeId===t.id);
      return {title:t.name,text:earned.length?earned.map(c=>trophies[c.tier]+' ×'+c.count).join(' · '):'尚未获杯',link:link('collection.theme',{theme:t.id})};
    }),actions:[action('私人杯册','collection',{mode:'private'}),action('模拟公开杯册','collection',{mode:'public'})]};
}
function collectionTheme(s,id) {
  const t=lookup(byTheme,id);
  if(!t) return collectionPage(s,'private');
  return {title:t.name,subtitle:PNAME[t.mode],rows:tiers[t.mode].map(tier=>{
    const c=s.show.cups[t.id+'-'+tier];
    if(!c) return {title:trophies[tier]+' · 未收集',text:'需在该赛事实际获得此档。',art:'awards/'+tier,visual:{uncollected:true}};
    const first=s.show.entries[c.first];
    return {title:trophies[tier]+' ×'+c.count,art:'awards/'+tier,
      text:'首获 '+time(c.firstAt)+' · '+first.pet.name+' · '+displayScore(first.outcome.match)+' 分',
      link:link('show.result',{event:first.id})};
  }),actions:[action('选择其他主题','collection',{mode:t.mode})]};
}
function lastPublished(s,now) {
  return Math.floor((now-s.show.epoch-5*DAY)/WEEK);
}
function archivePage(s,now,cursor=0) {
  const first=s.show.calendar.firstWeek, last=lastPublished(s,now), size=8;
  const totalPages=Math.max(1,Math.ceil((last-first+1)/size));
  const p=Number.isSafeInteger(cursor)?Math.min(Math.max(0,cursor),totalPages-1):0;
  const top=last-size*p, rows=[];
  for(let i=top;i>=Math.max(first,top-size+1);i--) {
    const id='public-'+i, saved=s.show.weeks[id];
    const theme=saved?.theme??publicTheme(s,i), at=saved?.result??(roundStart(s,'public',i)+5*DAY);
    const cancelled=s.show.voids?.[id];
    rows.push(cancelled?{title:theme.name+' · 技术作废',text:cancelled.reason}:
      {title:theme.name,text:'公布 '+time(at),link:link('show.board',{event:id})});
  }
  const actions=[action('当前赛事','show',{mode:'public'})];
  if(p>0) actions.push(action('较近的赛期','show.archive',{cursor:p-1}));
  if(p+1<totalPages) actions.push(action('更早的赛期','show.archive',{cursor:p+1}));
  return {title:'本地模拟公开赛',subtitle:'已公布的物种榜 · 第 '+(p+1)+' / '+totalPages+' 页',rows,actions,empty:'首期结果将在周六20:00公布。'};
}
function publishedWeek(s,id,species,now) {
  if(typeof id!=='string'||!/^public-(0|[1-9]\d*)$/.test(id)) return null;
  if(s.show.voids?.[id])return null;
  const index=Number(id.slice(7));
  if(!Number.isSafeInteger(index)||index<s.show.calendar.firstWeek||index>lastPublished(s,now)) return null;
  const saved=lookup(s.show.weeks,id);
  if(saved) return now>=saved.result?saved:null;
  // Read-only reconstruction of one completed species board. It does not open
  // an entry in the store, visit prior weeks in a loop, or enqueue any award.
  return makeWeek(s,period(s,'public',roundStart(s,'public',index)),[species]);
}
function boardPage(s,a,now,list) {
  const species=Object.hasOwn(animals,a.species)?a.species:'rabbit';
  const w=publishedWeek(s,a.event,species,now);
  if(!w) return {title:'本地模拟公开赛',rows:[],empty:'本期暂无可查看的结果。'};
  const {entries,nq}=board(s,w,species);
  const actions=Object.keys(animals).map(id=>action(animals[id]+'榜','show.board',{event:w.id,species:id}));
  if(list) {
    const tier=tiers.public.includes(a.tier)?a.tier:'laurel';
    const selected=entries.filter(e=>e.tier===tier);
    const snapshot=s.show.entries[w.id]?.pet;
    return {title:trophies[tier]+'名单',subtitle:'本地模拟公开赛 · '+animals[species]+'榜 · '+w.theme.name,
      visual:{tierOptions:tiers.public.map(t=>({title:trophies[t],art:'awards/'+t,text:entries.filter(e=>e.tier===t).length+' 位',
        link:{...link('show.tier',{event:w.id,species,tier:t}),active:t===tier,replace:true}}))},rows:selected.map(e=>({
      title:e.position+'. '+(e.player?'本店 · ':'')+e.name,
      art:e.player&&snapshot.art?snapshot.art:speciesPortrait[species],
      ...(e.player&&snapshot.art?{stage:snapshot.stage}:{}),
      text:(e.player?'本店参赛 · '+s.profileId.slice(-6)+(snapshot.art?'':' · 物种示意图'):'模拟选手 · '+e.accountId)+' · '+displayScore(e.match)+' 分\n逐维 '+e.match.dims.join(' / '),
      link:e.player?link('show.result',{event:w.id}):link('show.bot',{event:w.id,species,id:e.accountId})
    })),actions:Object.keys(animals).map(id=>action(animals[id]+'榜','show.tier',{event:w.id,species:id,tier})),empty:'本物种榜没有获得此档的动物。'};
  }
  const rows=tiers.public.map(tier=>({title:trophies[tier],art:'awards/'+tier,text:entries.filter(e=>e.tier===tier).length+' 位',
    link:link('show.tier',{event:w.id,species,tier})}));
  rows.push({title:'模拟抽签校验',text:'种子 '+w.seed+'\nSHA-256 承诺 '+w.commit});
  return {title:'本地模拟公开赛',subtitle:w.theme.name+' · '+animals[species]+'榜 '+entries.length+' 位，现金达标 '+nq+' 位',rows,actions};
}
function botPage(s,a,now) {
  const species=a.species;
  if(!Object.hasOwn(animals,species)) return archivePage(s,now);
  const w=publishedWeek(s,a.event,species,now);
  if(!w) return archivePage(s,now);
  const e=board(s,w,species).entries.find(entry=>!entry.player&&entry.accountId===a.id);
  if(!e) return archivePage(s,now);
  return {title:e.name,subtitle:'本地模拟公开赛 · '+w.theme.name,rows:[
    {title:'模拟选手 '+e.accountId,art:speciesPortrait[species],text:'第 '+e.position+' 名 · '+trophies[e.tier]+' · '+displayScore(e.match)+' 分\n头像为'+animals[species]+'榜物种示意。'},
    {title:'六维快照',text:gradeList(e.scores)+'\n目标 '+gradeList(w.theme.targets)},
    {title:'抽签摘要',text:e.draw},
  ]};
}
export function showPage(s,page,args={},now,rules=shopRules) {
  switch(page) {
    case 'show': return eventHome(s,now,rules);
    case 'show.round': return roundPage(s,args,now,rules);
    case 'show.review': return reviewPage(s,args,now,rules);
    case 'show.result': return resultPage(s,args.event);
    case 'show.archive': return archivePage(s,now,args.cursor);
    case 'show.board': return boardPage(s,args,now,false);
    case 'show.tier': return boardPage(s,args,now,true);
    case 'show.bot': return botPage(s,args,now);
    case 'show.history': return {title:'参赛记录',rows:Object.values(s.show.entries).sort((a,b)=>b.submitted-a.submitted).map(e=>({
      title:e.theme.name,text:time(e.submitted)+' · '+PNAME[e.mode]+' · '+e.pet.name+' · '+(e.voided?'已作废':e.outcome?'已公布':'等待公布'),
      link:link('show.result',{event:e.id})})),actions:[action('当前赛事','show')],empty:'尚无报名记录。'};
    case 'collection': return collectionPage(s,args.mode);
    case 'collection.theme': return collectionTheme(s,args.theme);
    default: return null;
  }
}
