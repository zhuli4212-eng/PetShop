import {createHash,randomBytes} from 'node:crypto';
import {GameError} from '../../PetShop/server/request-store.mjs';
import {GAME_EPOCH,showPage,recordCup,rankCash} from '../../PetShop/server/show.mjs';
import {v2Theme,v2Board} from '../../PetShop/server/show-live-v2.mjs';
import {stageOf,isBusy,petArt,breedName,specimen} from '../../PetShop/server/care.mjs';
import {shopRaceAccess} from '../../PetShop/server/shop-progression.mjs';

const DAY=86400000,WEEK=7*DAY,HOUR=3600000;
const grades=['E','D','C','B','A','S','S+'];
const names={rabbit:'兔',cat:'猫',dog:'狗'};
const tiers=['laurel','gold','silver','bronze','memorial'];
const cups={laurel:'桂冠杯',gold:'金杯',silver:'银杯',bronze:'铜杯',memorial:'纪念杯'};
const formatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const time=at=>formatter.format(at);
const link=(page,args={})=>({page,args});
const button=(label,page,args={})=>({label,page,args});
const indexOf=id=>typeof id==='string'&&/^online-public-(0|[1-9]\d*)$/.test(id)&&Number.isSafeInteger(Number(id.slice(14)))?Number(id.slice(14)):null;
const requireValue=(ok,message)=>{if(!ok)throw new GameError(message);};
const cashNote='公开赛报名暂为 0 金币；过线获奖保底 20 金币，排名现金按当前五档奖励规则结算。';

// Applied only to cloud accounts. Legacy/offline snapshots cannot import a
// shared entry or award; the shared entry table is the registration authority.
export function stripImportedOnlineShows(snapshot) {
  const show=snapshot?.state?.show;
  if(!show)return;
  if(show.onlinePublic||Object.values(show.entries??{}).some(e=>e.online))throw new GameError('正式店铺请登录原账号续玩，不能作为本机旧档另行导入。',422);
  delete show.onlinePublic;
  for(const [id,entry] of Object.entries(show.entries??{}))if(entry.online)delete show.entries[id];
}

function cleanPage(value,legacy=false) {
  if(typeof value==='string')return value.replaceAll('本地模拟公开赛',legacy?'历史公开赛':'公开赛').replaceAll('模拟公开杯册','公开杯册');
  if(Array.isArray(value))return value.filter(row=>!row?.title||!/抽签|种子|承诺/.test(row.title)).map(row=>cleanPage(row,legacy));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,cleanPage(v,legacy)]));
  return value;
}

export async function openOnlineShows(db,account,snapshot,requestData,now=Date.now()) {
  const week=Math.max(0,Math.floor((now-GAME_EPOCH)/WEEK));
  const firstWeek=now<GAME_EPOCH+week*WEEK+94*HOUR?week:week+1;
  const candidate={epoch:GAME_EPOCH,firstWeek,seed:randomBytes(32).toString('hex'),activatedAt:now};
  await db.prepare('INSERT INTO petshop_public_config(id,snapshot) VALUES (?,?) ON CONFLICT(id) DO NOTHING')
    .bind('main',JSON.stringify(candidate)).run();
  const config=JSON.parse((await db.prepare('SELECT snapshot FROM petshop_public_config WHERE id=?').bind('main').first()).snapshot);
  const currentIndex=Math.max(config.firstWeek,Math.floor((now-config.epoch)/WEEK));
  const lastPublished=Math.floor((now-config.epoch-5*DAY)/WEEK);
  const cursor=Number.isSafeInteger(requestData?.args?.cursor)?Math.max(0,Math.min(requestData.args.cursor,Math.max(0,Math.floor((lastPublished-config.firstWeek)/8)))):0;
  const indices=new Set([currentIndex]);
  const requested=indexOf(requestData?.args?.event);
  if(requested!==null&&requested>=config.firstWeek&&requested<=currentIndex)indices.add(requested);
  if(requestData?.page==='show.archive')for(let i=lastPublished-cursor*8;i>=Math.max(config.firstWeek,lastPublished-cursor*8-7);i--)indices.add(i);
  for(const e of Object.values(snapshot.state.show.entries))if(e.online&&!e.cashClosed&&indexOf(e.id)!==null)indices.add(indexOf(e.id));
  const rounds=new Map();
  for(const i of indices) {
    const id='online-public-'+i;
    let row=await db.prepare('SELECT snapshot FROM petshop_public_rounds WHERE id=?').bind(id).first();
    if(!row){
      const start=config.epoch+i*WEEK;
      const opened=(await db.prepare(`SELECT DISTINCT room.key AS species FROM trial_accounts a,
        json_each(json_extract(a.snapshot,'$.state.rooms')) room
        WHERE room.key IN ('rabbit','cat','dog') AND json_extract(room.value,'$.openedAt')<=?`).bind(start).all()).results;
      const available=new Set(opened.map(r=>r.species));
      const sequence=i-config.firstWeek;
      const theme=v2Theme({profileId:'public-server',rootSeed:config.seed,rooms:Object.fromEntries([...available].map(k=>[k,{openedAt:0}]))},
        'public',sequence,sequence%2?5:4,start);
      const round={id,index:i,start,close:start+94*HOUR,result:start+5*DAY,payout:start+6*DAY,theme,online:true};
      await db.prepare('INSERT INTO petshop_public_rounds(id,round_index,close_at,result_at,snapshot) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
        .bind(id,i,round.close,round.result,JSON.stringify(round)).run();
      row=await db.prepare('SELECT snapshot FROM petshop_public_rounds WHERE id=?').bind(id).first();
    }
    rounds.set(id,JSON.parse(row.snapshot));
  }
  const entries=new Map(),rankings=new Map();
  for(const id of rounds.keys()) {
    const round=rounds.get(id),own=snapshot.state.show.entries[id];
    const needsRanking=now>=round.result&&((requested!==null&&id===requestData?.args?.event&&['show.board','show.tier','show.player'].includes(requestData?.page))||own&&!own.outcome&&!own.voided);
    if(needsRanking) {
      let saved=await db.prepare('SELECT ranking FROM petshop_public_rounds WHERE id=?').bind(id).first();
      if(!saved.ranking) {
        const participants=(await db.prepare('SELECT account_id,username,entry FROM petshop_public_entries WHERE round_id=? ORDER BY account_id').bind(id).all()).results;
        const board=v2Board(participants.map(row=>{const entry=JSON.parse(row.entry);return {accountId:row.account_id,username:row.username,
          name:entry.pet.name,pet:entry.pet,scores:entry.pet.scores};}),round.theme,rankCash);
        await db.prepare('UPDATE petshop_public_rounds SET ranking=? WHERE id=? AND ranking IS NULL AND result_at<=?').bind(JSON.stringify(board),id,now).run();
        saved=await db.prepare('SELECT ranking FROM petshop_public_rounds WHERE id=?').bind(id).first();
      }
      const board=JSON.parse(saved.ranking);
      board.entries=board.entries.map(e=>({...e,player:e.accountId===account.id}));
      rankings.set(id,board);
    }
    // Regular heartbeats and registration read only this player's entry; they
    // must not deserialize everybody's animals on each request.
    const rows=(await db.prepare('SELECT account_id,username,entry FROM petshop_public_entries WHERE round_id=? AND account_id=?').bind(id,account.id).all()).results;
    entries.set(id,rows.map(row=>({accountId:row.account_id,username:row.username,entry:JSON.parse(row.entry)})));
  }
  return new OnlineShows({now,config,rounds,entries,rankings,account,currentIndex,cursor,lastPublished});
}

class OnlineShows {
  constructor(context){Object.assign(this,context);this.pending=null;}
  initialize(s,now) {
    if(s.show.onlinePublic)return false;
    s.show.onlinePublic=true;s.show.scoringVersion=2;
    // A previously submitted private theme remains frozen. A fresh choice can
    // use v2 immediately without consuming or granting a registration.
    if(s.show.activePrivate&&!s.show.entries[s.show.activePrivate.id])s.show.activePrivate=null;
    return true;
  }
  ranking(round) {
    if(!this.rankings.has(round.id)) {
      const participants=this.entries.get(round.id)??[];
      this.rankings.set(round.id,v2Board(participants.map(row=>({accountId:row.accountId,name:row.entry.pet.name,
        username:row.username,pet:row.entry.pet,scores:row.entry.pet.scores,player:row.accountId===this.account.id})),round.theme,rankCash));
    }
    return this.rankings.get(round.id);
  }
  settle(s) {
    for(const e of Object.values(s.show.entries)) {
      if(!e.online||e.voided)continue;
      const round=this.rounds.get(e.id);
      if(!round)continue;
      if(!e.outcome&&this.now>=round.result) {
        const board=this.ranking(round),own=board.entries.find(row=>row.accountId===this.account.id);
        requireValue(own,'公开赛报名记录暂不可用，请稍后重试。');
        e.outcome={match:own.match,tier:own.tier,position:own.position,tieRank:own.tieRank,tieSize:own.tieSize,
          n:board.entries.length,nq:board.nq,guarantee:own.guarantee,rankReward:own.rankReward};
        recordCup(s,e,e.outcome);s.coins+=e.outcome.guarantee;
      }
      if(e.outcome&&!e.cashClosed&&this.now>=round.payout) {
        e.cashPaid=Math.max(0,e.outcome.rankReward-e.outcome.guarantee);
        s.coins+=e.cashPaid;e.cashClosed=true;
      }
    }
  }
  current(){return this.rounds.get('online-public-'+this.currentIndex);}
  registration(s,a,gameNow,rules) {
    const round=this.current();
    requireValue(a.event===round.id&&a.theme===round.theme.id,'公开赛已更新，请重新选择本期比赛。');
    requireValue(this.now>=round.start,'本期报名将于 '+time(round.start)+' 开放。');
    requireValue(this.now<round.close,'本期公开赛报名已截止。');
    requireValue(shopRaceAccess(rules,s.createdAt,this.now).raceAccess.public.unlocked,'尚未到公开赛开放日。');
    requireValue(!s.show.entries[round.id]&&!(this.entries.get(round.id)??[]).some(row=>row.accountId===this.account.id),'本轮已经提交过报名。');
    const p=s.pets.find(p=>p.id===a.pet);
    requireValue(p&&p.species===round.theme.species,'本期仅限'+names[round.theme.species]+'组报名。');
    requireValue(['成年','老年'].includes(stageOf(p,gameNow))&&!isBusy(s,p),'请选店内成年或老年、空闲的动物。');
    const pet={id:p.id,name:p.name,species:p.species,breed:breedName(p),breedKey:p.breedKey,mixed:Boolean(p.mixed),
      coatIndex:p.coatIndex,sex:p.sex,art:petArt(p),stage:stageOf(p,gameNow),scores:p.traits.map(t=>grades.indexOf(t.grade)),
      traits:p.traits.map(({type,label,rarity,grade})=>({type,label,rarity,grade}))};
    const fee=0;
    const token=createHash('sha256').update(JSON.stringify([round.id,round.theme,pet,fee])).digest('hex');
    return {round,pet,fee,token};
  }
  action(s,type,args,gameNow,rules) {
    if(type!=='show.enter'||args.mode!=='public')return;
    const {round,pet,fee,token}=this.registration(s,args,gameNow,rules);
    requireValue(args.token===token,'报名动物或报价已变化，请重新核对快照。');
    requireValue(s.coins>=fee,'金币不足。');
    s.coins-=fee;
    const entry={id:round.id,mode:'public',online:true,theme:structuredClone(round.theme),submitted:this.now,fee,pet,
      close:round.close,result:round.result,payout:round.payout,source:'shared_public'};
    s.show.entries[entry.id]=entry;this.pending=entry;
    return pet.name+'已报名「'+round.theme.name+'」，'+time(round.result)+'出结果。';
  }
  roundPage(s,args,gameNow,rules) {
    const round=this.current(),registered=s.show.entries[round.id];
    const rows=[{title:'公开赛规则',text:'所有玩家参加同一期比赛，按最终整数总分排名；过线后同分并列同奖，低于资格线无奖。'},
      {title:'报名开放 '+time(round.start),text:'截止 '+time(round.close)+' · 结果公布 '+time(round.result)},
      {title:'报名与奖励',text:cashNote+'排名现金于 '+time(round.payout)+' 补差，不重复领取低档奖杯。'}];
    if(registered)rows.push({title:'已报名 · '+registered.pet.name,link:link('show.result',{event:round.id})});
    else if(this.now<round.start)rows.push({title:'本期尚未开放报名',text:time(round.start)+' 开放。'});
    else if(this.now>=round.close)rows.push({title:'本期报名已截止',text:'请等待下一期公开赛。'});
    else if(!shopRaceAccess(rules,s.createdAt,this.now).raceAccess.public.unlocked)rows.push({title:'尚未到公开赛开放日'});
    else {
      const pets=s.pets.filter(p=>p.species===round.theme.species&&['成年','老年'].includes(stageOf(p,gameNow))&&!isBusy(s,p));
      for(const p of pets)rows.push({title:p.name,text:'报名 0 金币',animal:specimen(s,p,gameNow),art:petArt(p),stage:stageOf(p,gameNow),
        link:link('show.review',{mode:'public',event:round.id,theme:round.theme.id,pet:p.id})});
      if(!pets.length)rows.push({title:'暂无符合条件的动物',text:'本期为'+names[round.theme.species]+'组，需成年或老年且空闲。'});
    }
    return {title:round.theme.name,subtitle:'公开赛',rows,actions:[button('返回赛事','show',{mode:'public'})]};
  }
  reviewPage(s,args,gameNow,rules) {
    try {
      const {round,pet,fee,token}=this.registration(s,args,gameNow,rules);
      return {title:'报名核对',subtitle:'公开赛 · '+round.theme.name,art:pet.art,stage:pet.stage,rows:[
        {title:pet.name+' · '+pet.breed,text:pet.sex+' · '+pet.stage+' · '+pet.scores.map(i=>grades[i]).join(' / ')},
        {title:'评分规则',text:'按本场最终整数总分排名，同分并列同奖。'},
        {title:'本次实付 '+fee+' 金币',text:'提交后固定动物快照，每位玩家每期只能报名一只动物。'+cashNote}],
        actions:[{label:'提交报名',type:'show.enter',args:{mode:'public',event:round.id,theme:round.theme.id,pet:pet.id,token},
          confirm:'确定为「'+pet.name+'」报名 '+round.theme.name+'？实付 '+fee+' 金币，提交后不能更换动物。',go:'show.result',goArgs:{event:round.id}},
          button('重选参赛动物','show.round',{mode:'public',event:round.id,theme:round.theme.id})]};
    }catch(error){return {title:'报名核对',rows:[{title:error.message}],actions:[button('返回赛事','show',{mode:'public'})]};}
  }
  boardPage(args,list) {
    const round=this.rounds.get(args.event);
    if(!round||this.now<round.result)return {title:'公开赛',rows:[],empty:'本期结果尚未公布。'};
    const {entries,nq}=this.ranking(round);
    const options=tiers.map(t=>({title:cups[t],art:'awards/'+t,text:entries.filter(e=>e.tier===t).length+' 位',
      link:{...link('show.tier',{event:round.id,tier:t}),active:args.tier===t,replace:true}}));
    const actions=[button('完整榜单','show.tier',{event:round.id,tier:'all'}),button('返回赛事','show',{mode:'public'})];
    if(!list)return {title:'公开赛',subtitle:round.theme.name+' · 参赛 '+entries.length+' 位 · 过线 '+nq+' 位',rows:[
      ...options.map(o=>({...o,text:o.text,link:o.link})),{title:'过线与并列',text:'按实际不同分数档排名，同分并列同奖；未过线不补位。'}],actions};
    const selected=args.tier==='all'?entries:entries.filter(e=>e.tier===(tiers.includes(args.tier)?args.tier:'laurel'));
    const cursor=Number.isSafeInteger(args.cursor)?Math.min(Math.max(0,args.cursor),Math.max(0,Math.ceil(selected.length/20)-1)):0;
    if(cursor>0)actions.unshift(button('上一页','show.tier',{event:round.id,tier:args.tier,cursor:cursor-1}));
    if((cursor+1)*20<selected.length)actions.unshift(button('下一页','show.tier',{event:round.id,tier:args.tier,cursor:cursor+1}));
    return {title:args.tier==='all'?'完整榜单':cups[args.tier]+'名单',subtitle:round.theme.name+' · 第 '+(cursor+1)+' / '+Math.max(1,Math.ceil(selected.length/20))+' 页',visual:{tierOptions:options},rows:selected.slice(cursor*20,cursor*20+20).map(e=>({
      title:(e.tieRank?'第 '+e.tieRank+' 分数档':'未过资格线')+' · '+e.username+' · '+e.name,art:e.pet.art,stage:e.pet.stage,
      text:e.match.total+' 分 · '+(cups[e.tier]??'未获杯')+(e.player?' · 本店参赛':''),
      link:link(e.player?'show.result':'show.player',{event:round.id,id:e.accountId})})),actions,empty:'本期没有获得此档的动物。'};
  }
  page(s,key,args,gameNow,rules) {
    if(key==='show') {
      const page=showPage(s,key,args,gameNow,rules),round=this.current(),own=s.show.entries[round.id];
      page.rows=page.rows.filter(row=>row.visual?.mode!=='public');
      page.rows.push({title:round.theme.name,text:own?'已报名 '+own.pet.name:this.now<round.start?'报名开放 '+time(round.start):this.now<round.close?'报名至 '+time(round.close):'本期报名已截止',
        visual:{mode:'public'},link:link(own?'show.result':'show.round',{mode:'public',event:round.id,theme:round.theme.id})});
      if(this.now>=round.result)page.rows.push({title:'本期公开赛榜单',text:'查看正式参赛者的共同榜单',visual:{mode:'public'},link:link('show.board',{event:round.id})});
      page.visual={...page.visual,onlinePublic:true,scoringVersion:2,schedule:{...page.visual.schedule,
        public:{close:time(round.close),result:time(round.result),payout:time(round.payout),entered:!!own}}};
      return cleanPage(page);
    }
    if((key==='show.round'||key==='show.review')&&args.mode==='public')return key==='show.round'?this.roundPage(s,args,gameNow,rules):this.reviewPage(s,args,gameNow,rules);
    if(key==='show.archive') {
      const top=this.lastPublished-this.cursor*8,rows=[];
      for(let i=top;i>=Math.max(this.config.firstWeek,top-7);i--){const round=this.rounds.get('online-public-'+i);if(round)rows.push({title:round.theme.name,text:'公布 '+time(round.result),link:link('show.board',{event:round.id})});}
      const actions=[button('当前赛事','show',{mode:'public'})];
      if(this.cursor>0)actions.push(button('较近的赛期','show.archive',{cursor:this.cursor-1}));
      if(top-8>=this.config.firstWeek)actions.push(button('更早的赛期','show.archive',{cursor:this.cursor+1}));
      return {title:'公开赛',subtitle:'历届榜单 · 第 '+(this.cursor+1)+' 页',rows,actions,empty:'首期报名于 '+time(this.current().start)+' 开放。'};
    }
    if((key==='show.board'||key==='show.tier')&&indexOf(args.event)!==null)return this.boardPage(args,key==='show.tier');
    if(['show.board','show.tier','show.bot'].includes(key)) {
      const own=s.show.entries[args.event];
      return {title:'历史参赛记录',rows:own?[{title:own.theme.name+' · '+own.pet.name,text:'查看本店已归档的参赛结果。',
        link:link('show.result',{event:own.id})}]:[],empty:'本店未参加此赛期。',actions:[button('返回赛事','show',{mode:'public'})]};
    }
    if(key==='show.player') {
      const round=this.rounds.get(args.event),entry=round&&this.now>=round.result?this.ranking(round).entries.find(e=>e.accountId===args.id):null;
      return {title:entry?.name??'参赛动物',subtitle:'公开赛',rows:entry?[{title:entry.username+' · '+entry.name,art:entry.pet.art,stage:entry.pet.stage,text:entry.match.total+' 分 · '+(cups[entry.tier]??'未获杯')},
        {title:'报名快照',text:entry.pet.breed+' · '+entry.pet.sex+' · '+entry.scores.map(i=>grades[i]).join(' / ')}]:[],actions:[button('返回榜单','show.board',{event:args.event})]};
    }
    if(key.startsWith('show.')||key==='collection'||key==='collection.theme') {
      const page=showPage(s,key,args,gameNow,rules);
      if(page)return cleanPage(page,!!args.event&&indexOf(args.event)===null);
    }
  }
}
