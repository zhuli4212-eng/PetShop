import { randomUUID } from 'node:crypto';
import { SPECIES, beijingTime, lifeDates, isBusy, canBreed, stageOf, dayAt } from './care.mjs';
import { purchasePrice, youngPurchaseBase } from './business.mjs';

const cupNames = {bronze:'铜杯', silver:'银杯', gold:'金杯', memorial:'纪念杯', laurel:'桂冠杯'};
const sessionTimeout = 45_000;
const close = {label:'合上账簿',type:'ui.back'};

export function initVisitBook(s, existing) {
  if (s.visitBook) return false;
  s.visitBook = {lastSeenAt:existing?s.clock:null, opening:!existing, away:[], stories:[]};
  if(!existing)s.visitBook.tutorial={bred:false,bought:false,claimed:false,ordersViewed:false,marketViewed:false};
  // Early saves counted research recycling as a first live sale. Keep the transaction history authoritative.
  const firstSale=s.sales?.find(sale=>['market','guest','order'].includes(sale.channel));
  const firstNote=s.journal.find(note=>note.key==='trade');
  if (existing && firstNote) {
    if (firstSale) firstNote.at=firstSale.at;
    else if (Array.isArray(s.sales)) s.journal=s.journal.filter(note=>note!==firstNote);
  }
  if(existing&&finishStory(s,s.clock))s.visitBook.stories.push({id:randomUUID(),text:ending});
  return true;
}

const ending='开门、等候、挑选、记账。小店有了自己的日常，账簿仍会继续往后写。';
function finishStory(s,now) {
  if(s.journal.some(n=>n.key==='closing')||!['trade','room','guest'].every(key=>s.journal.some(n=>n.key===key)))return false;
  s.journal.push({key:'closing',text:ending,at:now});
  return true;
}

const tutorialSteps=[
  ['开始兔子繁育','在繁育台挑选一公一母，核对后确认配对。一生只能繁育一窝。'],
  ['购入一只种兔','到研究所的兔种源货架查看两只幼兔，挑一只按当前报价购买。'],
  ['签到领养幼兔','在每日签到簿领取一公一母两只基础幼兔。'],
  ['查看订单和自由市场','分别看看普通订单的委托条件和自由市场的动物报价。'],
];
const linkTo=(label,page,args={})=>({label,page,args});
const completedSteps=t=>[t.bred,t.bought,t.claimed,t.ordersViewed&&t.marketViewed];

export function tutorialStatus(s) {
  const t=s.visitBook.tutorial;
  if(!t)return undefined;
  const index=completedSteps(t).indexOf(false);
  return {step:index===-1?4:index+1,total:4,title:index===-1?'开店引导已完成':tutorialSteps[index][0],
    completed:index===-1,ordersViewed:t.ordersViewed,marketViewed:t.marketViewed};
}

export function tutorialAccess(s,key,args={}) {
  const t=s.visitBook.tutorial;
  if(!t)return false;
  if(key==='orders')return t.bred&&t.bought&&t.claimed;
  return t.bred&&(args.species??'rabbit')==='rabbit'&&(['shelf','offer'].includes(key)||key==='care.buyPet'&&!t.bought);
}

export function visitTutorialDestination(s,page) {
  const field=page==='market'?'marketViewed':page==='orders'?'ordersViewed':null;
  const t=s.visitBook.tutorial;
  if(!t||!field||t[field])return s;
  return {...s,visitBook:{...s.visitBook,tutorial:{...t,[field]:true}}};
}

function tutorialPage(s,now,access) {
  const summary=tutorialStatus(s), done=summary?completedSteps(s.visitBook.tutorial):[];
  const rows=tutorialSteps.map(([title,text],i)=>({title:(i+1)+'. '+title,text,done:!!done[i],current:!!summary&&!summary.completed&&summary.step===i+1}));
  const actions=[];
  if(summary&&!summary.completed){
    const rabbit={species:'rabbit'};
    if(summary.step===1){
      const candidates=s.pets.filter(p=>p.species==='rabbit'&&canBreed(s,p,now));
      if(['公','母'].every(sex=>candidates.some(p=>p.sex===sex)))actions.push(linkTo('前往兔繁育台','breed',rabbit));
      else {
        const potential=s.pets.filter(p=>p.species==='rabbit'&&!p.bred&&!isBusy(s,p)).map(p=>({sex:p.sex,...lifeDates(p)}))
          .filter(p=>p.deathAt>now).sort((a,b)=>a.adultAt-b.adultAt);
        const aliveUntil={'公':0,'母':0};
        const next=potential.find(p=>{
          aliveUntil[p.sex]=p.deathAt;
          return aliveUntil[p.sex==='公'?'母':'公']>Math.max(now,p.adultAt);
        });
        rows[0].text=next?'现有后备兔最早于北京时间 '+beijingTime(next.adultAt)+' 配对，可到兔房查看成长。':
          (s.care.signedDay===dayAt(now)?'今天已经签到，明天可再领一对幼兔。':'当前缺少可配对的公母兔，可先签到领养一对幼兔。')+'幼兔成年后再回来配对。';
        actions.push(linkTo('查看兔房','rooms',rabbit),linkTo('查看签到簿','profile'));
        if(access.lab.unlocked)actions.push(linkTo('查看兔种源货架','shelf',rabbit));
      }
    } else if(summary.step===2)actions.push(linkTo('前往兔种源货架','shelf',rabbit));
    else if(summary.step===3)actions.push(linkTo('前往签到簿','profile'));
    else {
      rows[3].text='普通订单'+(summary.ordersViewed?'已查看':'待查看')+' · 自由市场'+(summary.marketViewed?'已查看':'待查看');
      if(!summary.ordersViewed)actions.push(linkTo('查看普通订单','orders'));
      if(!summary.marketViewed)actions.push(linkTo('查看自由市场','market'));
    }
  }
  if(!actions.length)actions.push(close);
  return {title:'开店四步',subtitle:summary?(summary.completed?'四步已完成':'第 '+summary.step+' / 4 步'):'开店步骤说明',
    presentation:{kind:'tutorial',...(summary??{archived:true})},rows,actions};
}

export function recordMilestone(s,type,args,now) {
  const t=s.visitBook.tutorial;
  if(t){
    if(type==='care.breed'&&(args.species??'rabbit')==='rabbit')t.bred=true;
    if(type==='care.buyPet'&&(args.species??'rabbit')==='rabbit')t.bought=true;
    if(type==='care.checkin')t.claimed=true;
  }
  const lines=[];
  const add=(key,text)=>{
    if(s.journal.some(n=>n.key===key))return;
    s.journal.push({key,text,at:now});
    lines.push(text);
  };
  if(type==='care.unlock')add('room','研究所联络员送来'+SPECIES[args.species].name+'房资料：“这对幼崽有自己的成长周期，看看它们什么时候成年吧。”');
  if(type==='sale.commit' && ['market','order','guest'].includes(args.channel)){
    add('trade','第一笔生意完成了。你在账簿上记下收入，也重新看了看店里留下的动物。');
    if(args.channel==='guest')add('guest','书店来客收下了心仪的动物。你之前选出的特征，正好合了这次委托。');
  }
  if(!lines.length)return;
  if(finishStory(s,now))lines.push(ending);
  s.visitBook.stories.push({id:randomUUID(),text:lines.join('\n')});
}

function awayEvents(s,from,to) {
  const events=[];
  function add(at,title,text) {
    if(at>from&&at<=to)events.push({at,title,text});
  }
  for(const [key,room] of Object.entries(s.rooms)){
    const litter=room.lastLitter;
    if(litter)add(litter.bornAt,SPECIES[key].name+'房出生 '+litter.ids.length+' 只',litter.mother+' × '+litter.father);
  }
  for(const p of s.pets){
    const {adultAt,deathAt}=lifeDates(p);
    add(adultAt,p.name+' 已成年',SPECIES[p.species].name+' · '+p.sex+' · #'+p.id.slice(0,5).toUpperCase());
    add(deathAt,p.name+' 自然死亡',SPECIES[p.species].name+' · '+p.sex+' · #'+p.id.slice(0,5).toUpperCase());
  }
  s.orders.forEach((slot,i)=>{if(slot.order?.refilledAt)add(slot.order.refilledAt,'第 '+(i+1)+' 槽普通订单已补单','新委托已放入订单夹。');});
  for(const e of Object.values(s.show.entries)){
    if(!e.outcome||e.voided)continue;
    const name=e.pet.name+' · '+e.theme.name;
    add(e.result,name,e.outcome.tier?'获得'+cupNames[e.outcome.tier]+'。':'本次未获杯。');
    if(e.cashClosed)add(e.payout,name+' · 排名结算','追加到账 '+e.cashPaid+' 金币。');
  }
  return events.sort((a,b)=>a.at-b.at);
}

export function seedRecoveryRows(s,now,access) {
  // Young opposite-sex animals count as reserves. An ongoing litter can still produce a new generation.
  const paired=Object.keys(s.rooms).some(species=>{
    if(s.rooms[species].job)return true;
    const candidates=s.pets.filter(p=>p.species===species&&stageOf(p,now)!=='已故'&&!p.bred&&!isBusy(s,p));
    return candidates.some(p=>p.sex==='母')&&candidates.some(p=>p.sex==='公');
  });
  if(paired)return [];
  const signed=s.care.signedDay===dayAt(now);
  const rows=[{title:'当前后备种源不足',text:signed?'今天已签到，次日可再领一对基础幼兔。':'今日签到可领一公一母两只基础幼兔。',
    link:{page:'profile'}}];
  if(!access.lab.unlocked){
    rows.push({title:'研究所尚未开放',text:'店铺 '+access.lab.requiredLevel+' 级开放种源货架。'});
    return rows;
  }
  for(const [species,room] of Object.entries(s.rooms)){
    const stock=room.shelf.offers.filter(Boolean);
    rows.push({title:SPECIES[species].name+'房当前货架',text:stock.length?
      stock.map(p=>p.name+'（'+p.sex+'）'+purchasePrice(s,youngPurchaseBase(p))+' 金币').join('、'):'本批已售空。',
      link:{page:'shelf',args:{species}}});
  }
  return rows;
}

function summaryPage(s,events,now,access) {
  const rows=events.map(e=>({title:e.title,text:beijingTime(e.at)+'　'+e.text}));
  return {title:'离店期间',subtitle:'北京时间 · 以下事项均已结算',rows:[...rows,...seedRecoveryRows(s,now,access)],actions:[close]};
}
function openingPage(revisit,activeTutorial) {
  return {title:'旧店交接',subtitle:'账簿的第一页',rows:[
    {title:'街角的小店',text:'柜台上压着钥匙和一本旧账簿。原店主写道：“先别急着把店做大，看看进门的人需要什么。”'},
    {title:'兔房里的一对种兔',text:'小花和小白在开店时已经成年。到繁育台选好亲本，核对后就能开始第一窝。'},
    {title:'第一窝以后',text:'去研究所货架挑一只种兔，再去签到簿领养后备幼兔。最后看看普通订单与自由市场，为店里的兔子选择去处。'}
  ],actions:[{label:revisit||!activeTutorial?'查看开店四步':'开始新手引导',page:'tutorial'},revisit?close:{label:'跳过，进店',type:'ui.back'}]};
}
export function visitHistoryPage(s,key,now,access) {
  if(key==='tutorial')return {...tutorialPage(s,now,access),readNoteIds:s.visitBook.opening?['opening']:[]};
  if(key==='openingGuide')return {...openingPage(true,!!s.visitBook.tutorial),readNoteIds:s.visitBook.opening?['opening']:[]};
  if(key==='lastVisit'&&s.visitBook.lastReport)return summaryPage(s,s.visitBook.lastReport,now,access);
  return null;
}
export function unreadLetter(s,now,access) {
  const book=s.visitBook;
  if(book.away.length)return {ids:book.away.map(b=>b.id),page:summaryPage(s,book.away.flatMap(b=>b.events),now,access)};
  if(book.opening)return {ids:['opening'],page:openingPage(false,!!book.tutorial)};
  if(book.stories.length)return {ids:book.stories.map(n=>n.id),page:{title:'账簿新页',
    rows:book.stories.map(n=>({title:'经营手记',text:n.text})),actions:[close]}};
  return null;
}

export function updateVisit(s,sessions,clientId,foreground,reader,now) {
  for(const [key,session] of sessions)if(now-session.at>sessionTimeout*2)sessions.delete(key);
  if((sessions.get(clientId)?.seq??-1)>=reader.seq)return;
  const active=Array.from(sessions.values()).some(session=>session.foreground&&now-session.at<=sessionTimeout);
  const previous=sessions.get(clientId);
  const book=s.visitBook;
  if(foreground&&!active&&book.lastSeenAt!==null) {
    const events=awayEvents(s,book.lastSeenAt,now);
    if(events.length)book.away.push({id:randomUUID(),events});
  }
  if(foreground||previous?.foreground&&now-previous.at<=sessionTimeout)book.lastSeenAt=now;
  sessions.set(clientId,{at:now,foreground,seq:reader.seq});
  const read=new Set(reader.read||[]);
  if(read.has('opening'))book.opening=false;
  if(read.size){
    const archived=book.away.filter(b=>read.has(b.id));
    if(archived.length)book.lastReport=archived.flatMap(b=>b.events);
    book.away=book.away.filter(b=>!read.has(b.id));
    book.stories=book.stories.filter(b=>!read.has(b.id));
  }
}
