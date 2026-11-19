import { randomUUID } from 'node:crypto';
import { SPECIES, beijingTime, lifeDates, isBusy, stageOf, dayAt } from './care.mjs';
import { purchasePrice, youngPurchaseBase } from './business.mjs';

const cupNames = {bronze:'铜杯', silver:'银杯', gold:'金杯', memorial:'纪念杯', laurel:'桂冠杯'};
const sessionTimeout = 45_000;
const close = {label:'合上账簿',type:'ui.back'};

export function initVisitBook(s, existing) {
  if (s.visitBook) return false;
  s.visitBook = {lastSeenAt:existing?s.clock:null, opening:!existing, away:[], stories:[]};
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

export function recordMilestone(s,type,args,now) {
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
    const stock=(room.shelf?.offers??[]).filter(Boolean);
    rows.push({title:SPECIES[species].name+'房当前货架',text:stock.length?
      stock.map(p=>p.name+'（'+p.sex+'）'+purchasePrice(s,youngPurchaseBase(p))+' 金币').join('、'):'本批已售空。',
      link:{page:'lab'}});
  }
  return rows;
}

function summaryPage(s,events,now,access) {
  const rows=events.map(e=>({title:e.title,text:beijingTime(e.at)+'　'+e.text}));
  return {title:'离店期间',subtitle:'北京时间 · 以下事项均已结算',rows:[...rows,...seedRecoveryRows(s,now,access)],actions:[close]};
}
const bookletCaptions = [
  "",
  "先去「动物小屋」，免费开放兔房。我留下的那对小兔，会直接住进去。",
  "进兔房点「投喂」，把这份营养餐喂给它们，两只小兔就会长大。",
  "点「开始繁育」，只要等 5 秒，再点「查看首窝」，看看新出生的小兔。之后兔房每窝要等 2 分钟。",
  "这一窝有四只，性别、特点和价钱各不相同。先想想，留哪两只继续繁育？",
  "留下一公一母作种源，卖掉一只换金币，剩下一只先养在兔房。确认无误再点「确认选择」。",
  "看看卖了多少钱，留种兔还要多久长大，然后领走我给你的开店奖励。",
  "领完开店奖励，「安置兔房」会自动开启，从这时开始记进度。回店里打开「任务」就能看到。",
  "做完这三件事就可以领奖。下一组会自动开启，从零开始。"
];
function openingBooklet() {
  return {title:'交接信',visual:{openingBooklet:bookletCaptions.map((caption,index)=>({
    art:'onboarding/letter-'+index, caption,
  }))}};
}

function openingPage(revisit) {
  return {title:'旧店交接',subtitle:'账簿的第一页',rows:[
    {title:'街角的小店',text:'柜台上压着钥匙和一本旧账簿。原店主写道：“先别急着把店做大，看看进门的人需要什么。”'},
    {title:'兔房里的一对种兔',text:'小花和小白在开店时已经成年。到繁育台选好亲本，核对后就能开始第一窝。'}
  ],actions:[{label:'查看任务',page:'tasks'},revisit?close:{label:'进入店铺',type:'ui.back'}]};
}
export function visitHistoryPage(s,key,now,access,args={}) {
  if(key==='openingGuide'||key==='onboarding'){
    const page=s.onboarding?openingBooklet():openingPage(true);
    return {...page,readNoteIds:s.visitBook.opening?['opening']:[]};
  }
  if(key==='lastVisit'&&s.visitBook.lastReport)return summaryPage(s,s.visitBook.lastReport,now,access);
  return null;
}
export function unreadLetter(s,now,access) {
  const book=s.visitBook;
  if(book.away.length)return {ids:book.away.map(b=>b.id),page:summaryPage(s,book.away.flatMap(b=>b.events),now,access)};
  if(book.opening)return {ids:['opening'],page:s.onboarding?openingBooklet():openingPage(false)};
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
