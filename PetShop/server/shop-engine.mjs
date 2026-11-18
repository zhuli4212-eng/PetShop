import { randomBytes, randomUUID } from 'node:crypto';
import { initCare, tickCare, carePage, careAction, dayAt, repairLegacyParentRetention } from './care.mjs';
import { initBusiness, tickBusiness, businessPage, businessAction, businessHeartbeat, readyOrderId, validateSaleQuote } from './business.mjs';
import { initShow, tickShow, showPage, showAction } from './show.mjs';
import { shopProgress, saleExperience, shopRaceAccess } from './shop-progression.mjs';
import { featureNames, featureAccess, operationFeature, shopRules } from './shop-features.mjs';
import { initVisitBook, recordMilestone, seedRecoveryRows, unreadLetter, updateVisit, visitHistoryPage } from './visit-book.mjs';
import { initTasks, recordTaskAction, recordTaskVisit, taskAction, taskShortcut, tasksPage } from './shop-tasks.mjs';
import { initOnboarding, onboardingSnapshot, guideAccess, rabbitWaitingForOpening, settleOnboarding,
  onboardingPage, decorateGuidePage, guideAction, recordGuideAction } from './onboarding.mjs';

export { shopRules };
const legacyEntrances = Object.keys(featureNames).filter(key=>key!=='collection');
const pageHandlers = [carePage, businessPage, showPage];
const actionHandlers = [careAction, businessAction, showAction, taskAction];
const minute = 60_000;
export class GameError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}

function newState(now,onboarding) {
  const id = randomUUID();
  const state = { schema: 1, mode:'local_sim', profileId:id, profile_id:id, rootSeed:randomBytes(32).toString('hex'),
    createdAt:now, clock:now, version:1, coins:680, shopXp:0, receipts:{}, journal:[] };
  initCare(state,now,{onboarding});
  initShow(state,now);
  initBusiness(state,now);
  initVisitBook(state,false);
  if(onboarding)initOnboarding(state);
  return state;
}

// JSON 对象字段排列不影响同一命令的身份，数组顺序保留。
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
function shopAccess(s,rules,level) {
  const access=featureAccess(rules,level);
  for(const key of ['lab','orders'])if(guideAccess(s,key))access[key].unlocked=true;
  return access;
}
function publicShop(s,now,rules) {
  const {level,...shopExperience}=shopProgress(rules,s.shopXp);
  const access=shopAccess(s,rules,level),onboarding=onboardingSnapshot(s);
  const hints=[];
  const dayClaimed=s.care.signedDay===dayAt(now);
  const guest=access.guest.unlocked&&s.visitors.active;
  for(const room of Object.values(s.rooms)){
    const litter=room.lastLitter;
    if(access.breed.unlocked&&litter&&now-litter.bornAt<86400000) hints.push({id:'litter-'+litter.ids[0],text:'新的一窝出生了，去繁育台看看小家伙吧。'});
  }
  const order=access.orders.unlocked&&readyOrderId(s,now);
  if(order)hints.push({id:'order-'+order,text:'有只动物符合委托，订单夹里可以查看。'});
  return { protocol:1, profileId:s.profileId, version:s.version, mode:s.mode, name:'宠物店', coins:s.coins,
    shopLevel:level, shopExperience, ...shopRaceAccess(rules,s.createdAt,now),
    featureAccess:access, entrances:legacyEntrances.filter(key=>access[key].unlocked),
    ...(guest&&!onboarding&&{guest:{id:guest.id,endsAt:guest.endsAt}}),
    now, hints:onboarding?[]:hints, dayClaimed, onboarding,
    taskShortcut:s.onboarding?{completed:4,total:4,choice:{page:'tasks',label:'查看开店任务'}}:taskShortcut(s,access),
    decor:Object.keys(s.decor || {}).filter(k=>s.decor[k]?.placed),
    rooms:Object.keys(s.rooms || {}).filter(k=>s.rooms[k]&&!(k==='rabbit'&&rabbitWaitingForOpening(s))),
    notice:s.journal.at(-1) ?? null };
}
function accountPage(s,now,access) {
  return {title:'店主登记簿',subtitle:'本机经营档',art:'shop-modules/opening',
    readNoteIds:s.visitBook.stories.map(story=>story.id),rows:[
    {title:'店铺资产',text:s.coins+' 金币 · '+s.pets.length+' 只在册动物'},
    {title:'店主编号',text:s.profileId},
    {title:'开店交接',text:'重读旧店主留下的第一页。',link:{page:'openingGuide'}},
    ...(s.visitBook.lastReport?[{title:'上次回店摘要',text:'查看离开期间已结算的事项。',link:{page:'lastVisit'}}]:[]),
    ...seedRecoveryRows(s,now,access),
    {title:'设备时间',text:'请保持设备时间准确。向前调时会立即推进成长和比赛，可能让动物自然寿终。调回时钟无法撤销已经结算的事件。'},
    ...(s.clockEvent?[{title:'校时记录',text:s.clockEvent.text}]:[]),
    ...(s.recoveredFrom?[{title:'存档恢复',text:'最近一次从备份 '+s.recoveredFrom+' 恢复。'}]:[]),
    ...s.journal.slice(-5).reverse().map(j=>({title:j.text,text:new Date(j.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}))
  ],actions:[{label:'奖杯收藏册',page:'collection'},{label:'模拟支付演示',page:'payment'}]};
}
export function validateState(s) {
  const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  if (!obj(s) || s.schema!==1 || s.mode!=='local_sim' || !s.profileId || !Number.isFinite(s.clock) ||
      typeof s.rootSeed!=='string' || !/^[0-9a-f]{64}$/i.test(s.rootSeed) ||
      !Number.isSafeInteger(s.version) || !Array.isArray(s.pets) || !obj(s.receipts) || !obj(s.rooms?.rabbit) ||
      !Array.isArray(s.journal) || !obj(s.care) || !obj(s.research) || !obj(s.decor) ||
      !Array.isArray(s.orders) || s.orders.length!==3 || !obj(s.businessDay) ||
      !obj(s.visitors?.sessions) || !Array.isArray(s.visitors?.intervals) ||
      !obj(s.show?.weeks) || !obj(s.show?.entries) || !obj(s.show?.cups) ||
      s.pets.some(p=>!p?.id||!obj(s.rooms[p.species])||!Array.isArray(p.traits)||p.traits.length!==6) ||
      !Number.isSafeInteger(s.coins) || (s.shopXp!==undefined&&(!Number.isSafeInteger(s.shopXp)||s.shopXp<0))) throw new GameError('经营存档结构不完整。',503);
  return s;
}
export class ShopEngine {
  constructor({wall=Date.now, monotonic=()=>performance.now(), rules=shopRules, onboarding=false}={}) {
    this.wall=wall; this.monotonic=monotonic; this.rules=rules;
    this.onboarding=onboarding;
    this.readers=new Map();
  }
  ensure() {
    if(!this.state)this.initialize(null);
  }
  initialize(restored,{fromBackup=false,resetConnections=false}={}) {
    const s=restored ?? newState(this.wall(),this.onboarding);
    const checkParents=s.care.parentRetentionChecked!==true;
    if(checkParents){
      if(repairLegacyParentRetention(s))s.version++;
      s.care.parentRetentionChecked=true;
    }
    const needsVisitBook=initVisitBook(s,!!restored);
    const needsTasks=initTasks(s);
    const needsOpening=!Number.isFinite(s.createdAt);
    if(needsOpening)s.createdAt=Number.isFinite(s.rooms.rabbit.openedAt)?s.rooms.rabbit.openedAt:s.clock;
    const needsXp=s.shopXp===undefined;
    if(needsXp) s.shopXp=(s.sales??[]).reduce((sum,sale)=>
      sum+(sale.saleExperience??saleExperience(this.rules,sale.channel,sale.lines)),0);
    if(restored && resetConnections && s.visitors) {s.visitors.sessions={};s.visitors.intervals=[];}
    if(restored && this.wall()<s.clock) s.clockEvent={at:s.clock,text:'检测到设备时钟回拨，经营时间从上次存档继续。'};
    this.anchor=Math.max(s.clock,this.wall()); this.mark=this.monotonic();
    this.savedAt=s.clock;
    if(!restored || checkParents || needsXp || needsOpening || needsVisitBook || needsTasks || fromBackup || s.clockEvent&&s.clockEvent.at===s.clock) this.save(s);
    this.state=s;
  }
  now() {
    const mono=this.monotonic();
    const estimated=this.anchor+Math.max(0,mono-this.mark),wall=this.wall();
    if(wall-estimated>2000)this.clockChange={at:wall,text:'设备时间向前调整，已按新的时刻结算经营事件。'};
    else if(wall<estimated-2000&&!this.lagging)this.clockChange={at:Math.floor(estimated),text:'检测到设备时钟回拨，经营时间按原进度继续。'};
    this.lagging=wall<estimated-2000;
    this.anchor=Math.max(wall,estimated);
    this.mark=mono;
    return Math.floor(this.anchor);
  }
  save(s) {
    this.state=s; this.savedAt=s.clock;
  }
  advance(forceCheckpoint=false) {
    this.ensure();
    const now=this.now();
    // 规则模块只有在到期事件发生时才改变数据；只检查经营字段，回执和时间锚不参与版本比较。
    const s=structuredClone(this.state);
    const world=({receipts,clock,...fields})=>JSON.stringify(fields);
    const before=world(s);
    tickCare(s,now);settleOnboarding(s,now);tickShow(s,now);tickBusiness(s,now);
    if(this.clockChange)s.clockEvent=this.clockChange;
    const changed=before!==world(s);
    if(changed || now-this.savedAt>=minute || (forceCheckpoint&&now!==this.savedAt)) {s.clock=now;if(changed)s.version++;this.save(s);}
    this.clockChange=null;
    return now;
  }
  shop() {const now=this.advance();return publicShop(this.state,now,this.rules);}
  requireFeature(level,key,s=this.state) {
    if(key&&level<this.rules.featureLevels[key]&&!guideAccess(s,key)) {
      throw new GameError(featureNames[key]+'需要店铺达到 '+this.rules.featureLevels[key]+' 级。',403);
    }
  }
  page(page,args={}) {
    const now=this.advance(), s=this.state;
    const level=shopProgress(this.rules,s.shopXp).level;
    const access=shopAccess(s,this.rules,level);
    if(args.fromTasks===true&&['lab','orders'].includes(page)&&!access[page].unlocked){
      const {name,requiredLevel}=access[page];
      return {shop:publicShop(s,now,this.rules),page:{title:name,presentation:{kind:'featureLocked'},
        rows:[{title:name+'尚未开放',text:'店铺达到 '+requiredLevel+' 级后开放。出售活体动物可以获得店铺经验。'}]}};
    }
    this.requireFeature(level,operationFeature(page,args));
    // Rendering cannot mutate the authoritative store.
    const data=structuredClone(s);
    let view=onboardingPage(data,page,args,now)??(page==='login'?accountPage(data,now,access):visitHistoryPage(data,page,now,access));
    if(page==='tasks'&&!view)view=tasksPage(data,access);
    for(const get of pageHandlers) {if(view) break;view=get(data,page,args,now,this.rules);}
    if(!view) throw new GameError('这个页面暂不可用，请返回店铺。',404);
    decorateGuidePage(data,page,args,view,now);
    if(page==='orders'||page==='guest'){
      view.tabs=[
        {label:'普通订单',page:'orders',active:page==='orders'},
        {label:access.guest.unlocked?'特殊来客':`特殊来客 · ${access.guest.requiredLevel} 级`,
          page:'guest',active:page==='guest',disabled:!access.guest.unlocked},
      ];
    }
    const sale=view.actions?.find(a=>a.type==='sale.commit');
    if(sale) {
      this.requireFeature(level,operationFeature(sale.type,sale.args));
      const xp=saleExperience(this.rules,sale.args.channel,sale.args.amounts.map(amount=>({amount})));
      sale.args.saleExperience=xp;
      view.visual={...view.visual,saleExperience:xp};
      if(xp)view.subtitle+=' · 店铺经验 +'+xp;
    }
    const viewed=s.onboarding?s:recordTaskVisit(s,page);
    if(viewed!==s){viewed.clock=now;this.save(viewed);}
    return {shop:publicShop(viewed,now,this.rules),page:view};
  }
  receipt(id) {
    this.ensure();
    if(!Object.hasOwn(this.state.receipts,id)) throw new GameError('尚未找到该请求回执。',404);
    return this.state.receipts[id].result;
  }
  act({requestId,profileId,version,type,args}) {
    const now=this.advance(),current=this.state;
    if(typeof requestId!=='string'||!/^[\w-]{12,100}$/.test(requestId)||typeof type!=='string'||!args||Array.isArray(args)||typeof args!=='object') throw new GameError('请求格式不正确。',400);
    if(profileId!==current.profileId) throw new GameError('存档已切换，请重新打开店铺。');
    const key=JSON.stringify(canonical([type,args]));
    const old=Object.hasOwn(current.receipts,requestId) && current.receipts[requestId];
    if(old) {if(old.key!==key) throw new GameError('请求编号与原操作不符。');return old.result;}
    if(version!==current.version) {
      if(type==='sale.commit') {
        try { validateSaleQuote(current,args,now); }
        catch(error) { throw new GameError(error.message); }
      }
      throw new GameError('店内情况已变化，请查看最新资料后重新确认。');
    }
    const level=shopProgress(this.rules,current.shopXp).level;
    this.requireFeature(level,operationFeature(type,args));
    if(type==='sale.commit'&&args.litterRetention)this.requireFeature(level,'breed');
    const s=structuredClone(current);
    let message=guideAction(s,type,args,now);
    if(message===undefined)for(const run of actionHandlers) {message=run(s,type,args,now,this.rules);if(message!==undefined) break;}
    if(message===undefined) throw new GameError('未识别的经营操作。',400);
    if(typeof message!=='string' || !Number.isSafeInteger(s.coins)||s.coins<0) throw Error('经营数据校验失败。');
    let awarded,levelUp;
    if(type==='sale.commit'){
      const sale=s.sales.at(-1);
      awarded=saleExperience(this.rules,sale.channel,sale.lines);
      if(args.saleExperience!==undefined&&args.saleExperience!==awarded)throw new GameError('店铺经验报价已变化，请重新核价。');
      sale.saleExperience=awarded;
      s.shopXp+=awarded;
      if(!Number.isSafeInteger(s.shopXp))throw Error('店铺经验超出可保存范围。');
      if(awarded)message=message.replace(/。$/,'')+'，店铺经验 +'+awarded+'。';
      const next=shopProgress(this.rules,s.shopXp).level;
      if(next>level){
        const unlocked=Object.keys(featureNames).filter(key=>this.rules.featureLevels[key]>level&&this.rules.featureLevels[key]<=next);
        levelUp={from:level,to:next,unlocked};
        message+='店铺升至 '+next+' 级'+(unlocked.length?'，解锁'+unlocked.map(key=>featureNames[key]).join('、'):'')+'。';
      }
    }
    recordMilestone(s,type,args,now);
    if(s.onboarding)recordGuideAction(s,type,args,now);
    else recordTaskAction(s,type,args);
    s.clock=now;s.version++;
    const result={requestId,message,version:s.version,...(awarded!==undefined&&{saleExperience:awarded}),...(levelUp&&{levelUp})};
    s.receipts[requestId]={key,result};
    this.save(s);return result;
  }
  heartbeat(clientId,foreground,reader) {
    if(typeof clientId!=='string'||!/^[\w-]{8,100}$/.test(clientId)||typeof foreground!=='boolean') throw new GameError('心跳格式无效。',400);
    const now=this.advance(),s=structuredClone(this.state);
    if(reader&&(reader.profileId!==s.profileId||!Number.isSafeInteger(reader.seq)||reader.seq<0||
        (reader.read!==undefined&&(!Array.isArray(reader.read)||reader.read.some(id=>typeof id!=='string'))))) {
      throw new GameError('店铺已切换或账簿参数无效，请重新打开店铺。',409);
    }
    const readers=new Map(this.readers);
    if(reader&&reader.seq<=(readers.get(clientId)?.seq??-1))return publicShop(s,now,this.rules);
    if(reader)updateVisit(s,readers,clientId,foreground,reader,now);
    const guestUnlocked=shopProgress(this.rules,s.shopXp).level>=this.rules.featureLevels.guest;
    if(!guestUnlocked&&!reader)return publicShop(s,now,this.rules);
    const guest=s.visitors?.active?.id;
    if(guestUnlocked)businessHeartbeat(s,{clientId,foreground},now);
    if(guest!==s.visitors?.active?.id)s.version++;
    s.clock=now;this.save(s);
    this.readers=readers;
    const shop=publicShop(s,now,this.rules);
    if(reader&&foreground)shop.letter=shop.onboarding?null:unreadLetter(s,now,shop.featureAccess);
    return shop;
  }
  checkpoint(force=false) {if(this.state)this.advance(force);}
}
