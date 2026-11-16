// 独立的界面确认样例。订单、货单及标价均为这一轮看稿使用的数据。
const commerceCss = `
.pc {--pc-coat:#fbefd1;--pc-edge:#bd9f70;--pc-green:#32594d;display:grid;gap:11px;min-width:0;color:#423626}
.pc * {box-sizing:border-box}
.pc h3,.pc p,.pc dl,.pc dd {margin:0}
.pc .pc-head {display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:700}
.pc .pc-head small,.pc .pc-hint,.pc .pc-secondary {color:#695b46;font-size:12px;font-weight:400}
.pc .pc-label {display:inline-flex;align-items:center;min-height:20px;padding:1px 6px;background:#edcf97;color:#53462e;font-size:11px;white-space:nowrap}
.pc .pc-label.teal {background:#d5e1bf;color:#345342}
.pc .pc-label.purple {background:#eadbf1;color:#63496e}
.pc .pc-price {color:#895422;font-weight:750;font-variant-numeric:tabular-nums;white-space:nowrap}
.pc .pc-condition {display:flex;gap:4px;flex-wrap:wrap}
.pc .pc-ticket {position:relative;border:1px solid #b89460;padding:13px 12px 11px;background:#fff0ce;box-shadow:inset 4px 0 #c89354}
.pc .pc-ticket h3 {font-family:"SimSun","Songti SC",serif;font-weight:700;font-size:20px;line-height:1.35;color:#4b3a28;margin:4px 0 8px}
.pc .pc-reward {display:flex;justify-content:space-between;align-items:center;border-top:1px dashed #bc9f6b;margin-top:10px;padding-top:7px}
.pc .pc-list {display:grid;background:#f9ebca;border:1px solid var(--pc-edge);min-width:0}
.pc .pc-petrow {display:grid;grid-template-columns:45px minmax(0,1fr) auto;align-items:center;gap:8px;padding:6px 8px;min-height:57px}
.pc .pc-petrow + .pc-petrow {border-top:1px solid #d3b98e}
.pc .pc-petrow .pc-thumb {display:grid;place-items:center;width:44px;height:44px;background:#e7d9af;box-shadow:inset 0 -3px #d8c396}
.pc .pc-petrow img {width:39px;height:38px;object-fit:contain;image-rendering:pixelated}
.pc .pc-petrow strong {font-size:14px}
.pc .pc-petrow span.pc-secondary {display:block;line-height:1.4}
.pc .pc-side {display:grid;justify-items:end;align-content:center;gap:4px}
.pc .pc-listbtn {padding:4px 8px;min-height:32px;background:#f0dbb0;border:1px solid #ae9167;color:#58472e;white-space:nowrap;font-size:12px;font-weight:600;cursor:pointer}
.pc .pc-listbtn.on {background:#406b56;border-color:#355743;color:#fff2ce}
.pc .pc-picked {background:#e9e6c8}
.pc .pc-selectable {cursor:pointer}
.pc .pc-batch {position:sticky;bottom:0;z-index:1;display:grid;gap:6px;padding:8px;background:#f7e9cc;border:1px solid var(--pc-edge)}
.pc .pc-summary {display:flex;justify-content:space-between;align-items:center;font-size:13px}
.pc .pc-select-tools {display:flex;gap:5px}
.pc .pc-stock-warning {color:#81532d;font-size:12px}
.pc .pc-cta {width:100%;font-size:15px}
.pc .pc-disabled {opacity:.62;cursor:default}
.pc .pc-empty {padding:12px;background:#ebe0c2;border:1px dashed #b8a47f;font-size:13px;color:#685c45}
.pc .pc-pair {display:grid;grid-template-columns:minmax(70px,.55fr) minmax(0,1fr);align-items:center;gap:9px}
.pc .pc-guest-pic {display:grid;place-items:end center;align-self:stretch;background:linear-gradient(to bottom,#c9d6ae,#dce1c0 79%,#bba072 80%,#cdb186);border:2px solid #9aa481}
.pc .pc-guest-pic img {display:block;width:100%;max-height:118px;object-fit:contain;object-position:bottom;image-rendering:pixelated}
.pc .pc-guest-copy {font-size:13px;line-height:1.55;margin:4px 0 8px}
.pc .pc-guest-actions {display:grid;grid-template-columns:.7fr 1.4fr;gap:8px}
.pc .pc-tabs {display:flex;border:1px solid #a4855a;background:#ebd4a8}
.pc .pc-tab {flex:1;border:0;background:transparent;color:#5b4c36;padding:7px 2px;min-height:36px;font:inherit;font-size:13px;cursor:pointer}
.pc .pc-tab.active {font-weight:700;background:#345e51;color:#fff2ce}
.pc .pc-upgrade {display:grid;gap:9px;padding:13px;border:1px solid #b69c72;background:#f7e9cc}
.pc .pc-upgrade h3 {font-size:18px;color:#345848}
.pc .pc-meter {height:8px;border:1px solid #a0a384;background:#d6d6b3}
.pc .pc-meter i {display:block;height:100%;background:#618566}
.pc .pc-tagline {display:flex;gap:4px;flex-wrap:wrap;margin:4px 0}
.pc .pc-tagline span {font-size:11px;color:#5f553e}
.pc .pc-copy {font-size:13px;line-height:1.5}
.pc .pc-supply {padding:9px 10px;border:1px solid #bea477;background:#f9ecce;display:grid;gap:8px}
.pc .pc-supply .pc-petrow {padding:0;min-height:44px}
.pc .pc-supply .pc-tags {margin:0;display:grid;grid-template-columns:1fr 1fr;gap:1px 8px}
.pc .pc-supply .pc-tags div {display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:2px 0;border-bottom:1px solid #ddcaa5}
.pc .pc-supply .pc-tags dt {color:#7b6a51}
.pc .pc-supply .pc-tags dd {color:#4f4b36}
@media(pointer:coarse){.pc .pc-listbtn,.pc .pc-tab,.pc .pc-batch button{min-height:44px}.pc .pc-listbtn{min-width:44px}}
`;

const commerceExamples = {
  lantern: {name:'梧桐街邻居', title:'想接温顺的幼兔回家', tags:['安哥拉兔','幼年期','温顺'], reward:280},
  persian: {name:'花房店主', title:'为花房寻找成年波斯猫', tags:['波斯猫','成年期'],reward:360}
};
const commerceGoods = {
  pear:{name:'梨花',species:'兔',breed:'安哥拉兔',image:'angora',base:95,cost:240},
  mist:{name:'小雾',species:'猫',breed:'波斯猫',image:'kitten',base:125,cost:325}
};
const commerceGuestReward = 440;
const commerceRates = [.10,.18,.26];
function commerceText(v) {
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function commerceTrait(type,label,grade='B',rarity='普通') {return {type,label,grade,rarity};}
function commerceStock(key,level,generation) {
  const g=commerceGoods[key];
  const rare=generation===0 ? key==='mist' : Math.random()<commerceRates[level-1];
  const cat=key==='mist';
  const names=cat?[g.name,'米糕','团团','豆豆']:[g.name,'糖豆','小桃','米粒'];
  return {key,lotId:generation,name:names[generation%names.length],breed:g.breed,species:g.species,stage:'幼年期',image:g.image,base:g.base,cost:g.cost,
    traits:[commerceTrait('性格',cat?'好奇':'温顺',!cat&&generation===0?'A':'B'),commerceTrait('品相',cat?'圆眼':'立耳','B'),
      commerceTrait('毛发',rare?'银尖':cat?'灰白':'长绒',rare?'A':'B',rare?'稀有':'普通'),
      commerceTrait('体态','匀称','B'),commerceTrait('体型','小巧','C'),commerceTrait('缺陷','未见明显缺陷','—','—')]};
}
function commerceState(s) {
  if(s.commerce)return s.commerce;
  const level=s.labLevel||1;
  s.commerce={done:{},orderKey:'lantern',selected:{},guest:'waiting',sequence:0,goods:{},expanded:'pear'};
  for(const key of Object.keys(commerceGoods))s.commerce.goods[key]=commerceStock(key,level,0);
  return s.commerce;
}
function commerceAlive(p) {return p.stage!=='死亡'&&p.stage!=='死亡期';}
function commerceUnlocked(p,ctx) {return !ctx.locked(p.id);}
function commerceLive(p,ctx) {return commerceAlive(p)&&commerceUnlocked(p,ctx);}
function commerceGentle(p) {return p.traits.find(t=>t.label==='温顺'&&t.type==='性格');}
function commerceFits(p,key,ctx) {
  if(!commerceLive(p,ctx))return false;
  if(key==='persian')return p.breed==='波斯猫'&&p.stage==='成年期';
  const t=commerceGentle(p);
  if(p.breed!=='安哥拉兔'||p.stage!=='幼年期'||!t)return false;
  return key==='guest'?['A','S','S+'].includes(t.grade):true;
}
function commercePrice(p,recycle=false) {
  const base=Number(p.base)||1;
  return Math.max(1,Math.floor(recycle?base*(commerceAlive(p)?.36:.06):base));
}
function commerceEmpty(msg) {return '<p class="pc-empty">'+msg+'</p>';}
function commerceTag(v) {return '<span class="pc-label">'+commerceText(v)+'</span>';}
function commerceDisabled(label) {return '<button type="button" class="btn primary pc-cta pc-disabled" disabled>'+label+'</button>';}
function commerceTitle(name,extra='') {
  return '<div class="pc-head"><strong>'+name+'</strong><small>'+extra+'</small></div>';
}
function commercePetRow(p,ctx,side='',stage=p.stage,picked) {
  const classes=picked===undefined?'':picked?' pc-selectable pc-picked':' pc-selectable';
  return '<div class="pc-petrow'+classes+'"><div class="pc-thumb">'+ctx.petArt(p,'pc-pet-img')+'</div><div><strong>'+commerceText(p.name)+'</strong>'+
    '<span class="pc-secondary">'+commerceText(p.breed)+' · '+commerceText(stage)+'</span></div><div class="pc-side">'+side+'</div></div>';
}
const saleActions={market:'pc-market',recycle:'pc-recycle',guest:'pc-guest-sell',lantern:'pc-deliver',persian:'pc-deliver'};
function commerceSalePage(key,ctx) {
  if(Object.hasOwn(commerceExamples,key))return ctx.page==='orders'&&ctx.s.commerce.orderKey===key;
  if(key==='recycle')return ctx.page==='lab'&&ctx.s.labTab==='recycle';
  return key===ctx.page;
}
function commerceEligible(key,c,ctx) {
  const pets=ctx.s.animals;
  if(key==='market')return pets.filter(p=>commerceLive(p,ctx));
  if(key==='recycle')return pets.filter(p=>commerceUnlocked(p,ctx)).sort((a,b)=>Number(commerceAlive(a))-Number(commerceAlive(b)));
  if(key==='guest'?c.guest!=='waiting':!Object.hasOwn(commerceExamples,key)||c.done[key])return [];
  return pets.filter(p=>commerceFits(p,key,ctx));
}
function commerceUnit(key,p) {
  if(key==='market'||key==='recycle')return commercePrice(p,key==='recycle');
  return key==='guest'?commerceGuestReward:commerceExamples[key].reward;
}
function commerceStockWarning(pets,ids) {
  const remaining=new Set(),affected=new Set();
  for(const pet of pets){
    if(commerceAlive(pet))(ids.has(pet.id)?affected:remaining).add(pet.species);
  }
  const rooms=[...affected].filter(k=>!remaining.has(k)).map(k=>commerceText(k)+'房');
  return rooms.length?'<p class="pc-stock-warning">成交后，'+rooms.join('、')+'将没有在养动物。</p>':'';
}
function commerceBatch(key,c,ctx,heading,empty,label) {
  const list=commerceEligible(key,c,ctx);
  const chosen=new Set(c.selected[key]||[]);
  const selected=list.filter(p=>chosen.has(p.id));
  const ids=selected.map(p=>p.id);
  c.selected[key]=ids;
  const total=selected.reduce((sum,p)=>sum+commerceUnit(key,p),0);
  const all=list.length>0&&selected.length===list.length;
  const toolbar='<div class="pc-head"><strong>'+heading+' · '+list.length+' 只</strong><div class="pc-select-tools">'+
    (selected.length&&!all?ctx.act('pc-clear',key,'清空选择','pc-listbtn'):'')+
    (list.length?ctx.act('pc-choose-all',key,all?'清空选择':'全选','pc-listbtn'):'')+'</div></div>';
  const rows=list.map(p=>{
    const on=chosen.has(p.id);
    const toggle='<button type="button" class="pc-listbtn'+(on?' on':'')+'" data-a="pc-choose" data-v="'+commerceText(key+'|'+p.id)+
      '" aria-label="'+commerceText('选择'+p.name)+'" aria-pressed="'+on+'">'+(on?'✓ 已选':'选择')+'</button>';
    return commercePetRow(p,ctx,'<b class="pc-price">'+commerceUnit(key,p)+' 金币</b>'+toggle,p.stage,on);
  }).join('');
  const value=(Object.hasOwn(commerceExamples,key)?key+'|':'')+ids.join(',');
  const prices=selected.map(p=>commerceUnit(key,p)).join(',');
  const submit=ids.length?'<button type="button" class="btn primary pc-cta" data-a="'+saleActions[key]+'" data-v="'+commerceText(value)+
    '" data-quote="'+prices+'">'+label+' '+ids.length+' 只</button>':commerceDisabled(label);
  const buttons=key==='guest'?'<div class="pc-guest-actions">'+ctx.act('pc-guest-cancel','','取消','btn')+submit+'</div>':submit;
  return toolbar+(rows?'<div class="pc-list">'+rows+'</div>':commerceEmpty(empty))+
    '<div class="pc-batch"><div class="pc-summary" aria-live="polite"><span>已选 '+ids.length+' 只</span><b class="pc-price">合计 '+total+' 金币</b></div>'+
    commerceStockWarning(ctx.s.animals,new Set(ids))+buttons+'</div>';
}
function commerceOrder(s,c,ctx) {
  const key=c.orderKey, o=commerceExamples[key], done=c.done[key];
  const tabs='<div class="pc-tabs">'+Object.entries(commerceExamples).map(([id,d])=>ctx.act('pc-order',id,d.name+(c.done[id]?' ✓':''),'pc-tab'+(id===key?' active':''))).join('')+'</div>';
  let html=ctx.banner('orders','订单柜台')+tabs+
    '<div class="pc-ticket"><div class="pc-head"><span class="pc-label teal">'+(done?'已交付':'普通订单')+'</span><small>一直有效</small></div>'+
    '<h3>'+o.title+'</h3><div class="pc-condition">'+o.tags.map(commerceTag).join('')+'</div><div class="pc-reward"><span class="pc-secondary">每只报酬</span><b class="pc-price">'+o.reward+' 金币</b></div></div>';
  if(done)return html+commerceEmpty('已交付'+commerceText(done)+'，报酬已入账。');
  return html+commerceBatch(key,c,ctx,'可交付个体','当前没有符合条件的宠物，订单会继续保留。','交付');
}
function commerceMarket(s,c,ctx) {
  return ctx.banner('market','自由市场')+commerceBatch('market',c,ctx,'可出售活体','暂无可出售的活体。','出售');
}
function commerceGuest(s,c,ctx) {
  if(c.guest!=='waiting')return ctx.banner('shop','来客接待处')+commerceEmpty(c.guest==='cancelled'?'访客已离开。':'访客带走了'+commerceText(c.guestPet)+'，报酬已入账。');
  return '<div class="pc-pair"><div class="pc-guest-pic">'+ctx.art('guest','')+'</div><div><span class="pc-label teal">特殊来客</span>'+
    '<h3 style="font-size:19px;margin-top:4px">收藏家 · 林女士</h3><p class="pc-guest-copy">“我想带些性格特别温顺的小安哥拉兔回家。”</p></div></div>'+
    '<div class="pc-ticket"><div class="pc-head"><strong>来客需求</strong></div><div class="pc-condition" style="margin-top:6px">'+
    ['安哥拉兔','幼年期','温顺','性格评分 A 及以上'].map(commerceTag).join('')+'</div>'+
    '<div class="pc-reward"><span class="pc-secondary">每只出价</span><b class="pc-price">'+commerceGuestReward+' 金币</b></div></div>'+
    commerceBatch('guest',c,ctx,'可交付个体','当前没有同时符合全部条件的宠物。','出售');
}
function commerceGrades(traits) {
  return '<dl class="pc-tags">'+traits.map(t=>'<div><dt>'+commerceText(t.type)+'</dt><dd>'+commerceText(t.label)+' '+commerceText(t.grade)+'</dd></div>').join('')+'</dl>';
}
function commercePurchasePane(s,c,ctx) {
  const slots=Object.values(c.goods);
  if(!slots.length)return commerceEmpty('本批幼体已全部售出。');
  return commerceTitle('在售幼体','购买前可查标签')+slots.map(p=>{
    const expanded=c.expanded===p.key;
    const labels=p.traits.filter(t=>t.type==='性格'||t.type==='毛发').map(t=>'<span class="pc-label'+(t.rarity==='稀有'?' purple':'')+'">'+commerceText(t.rarity)+' · '+commerceText(t.label)+'</span>').join('');
    const cost='<b class="pc-price">'+p.cost+' 金币</b>';
    return '<div class="pc-supply">'+commercePetRow(p,ctx,cost)+
      '<div class="pc-head"><div class="pc-condition">'+labels+'</div>'+ctx.act('pc-stock-detail',p.key,expanded?'收起标签':'查看标签','pc-listbtn')+'</div>'+
      (expanded?commerceGrades(p.traits):'')+
      (s.cash>=p.cost?ctx.act('pc-buy',p.key+'|'+p.lotId,'购买'+commerceText(p.name),'btn primary'):commerceDisabled('金币不足'))+'</div>';
  }).join('');
}
function commerceRecycle(s,c,ctx) {
  return '<p class="pc-hint">研究所可回收活体和已故个体，已故个体按折价回收。</p>'+
    commerceBatch('recycle',c,ctx,'研究所回收','暂无可回收的个体。','回收');
}
function commerceLab(s,c,ctx) {
  const tabs={buy:'幼体购买',recycle:'回收',upgrade:'研究升级'}, tab=tabs[s.labTab]?s.labTab:'buy', level=s.labLevel||1;
  let html=ctx.banner('lab','研究所')+'<div class="pc-tabs">'+Object.entries(tabs).map(([id,title])=>ctx.act('pc-lab',id,title,'pc-tab'+(id===tab?' active':''))).join('')+'</div>';
  if(tab==='buy')return html+commercePurchasePane(s,c,ctx);
  if(tab==='recycle')return html+commerceRecycle(s,c,ctx);
  const next=level+1, cost=level*180, capped=level>=commerceRates.length;
  return html+'<div class="pc-upgrade"><span class="pc-secondary">研究能力</span><h3>研究等级 '+level+'</h3>'+
    '<p class="pc-copy">提高研究所新供应幼体出现稀有标签的概率。</p>'+
    '<div class="pc-head"><span>稀有标签出现率</span><b>'+Math.round(commerceRates[level-1]*100)+'%'+(capped?'':' → '+Math.round(commerceRates[next-1]*100)+'%')+'</b></div>'+
    '<div class="pc-meter"><i style="width:'+((level/commerceRates.length)*100)+'%"></i></div></div>'+
    (capped?commerceDisabled('已达演示等级上限'):s.cash<cost?commerceDisabled('金币不足'):ctx.act('pc-upgrade',String(level),'升级 · '+cost+' 金币','btn primary pc-cta'));
}
function renderCommerce(id,ctx) {
  const views={orders:commerceOrder,market:commerceMarket,lab:commerceLab,guest:commerceGuest};
  if(!Object.hasOwn(views,id))return '';
  return '<section class="pc">'+views[id](ctx.s,commerceState(ctx.s),ctx)+'</section>';
}
function commerceSettle(key,batch,c,ctx,quote) {
  if(!commerceSalePage(key,ctx))return;
  const eligible=commerceEligible(key,c,ctx);
  const selected=c.selected[key]||[];
  const pets=eligible.filter(p=>selected.includes(p.id));
  const ids=pets.map(p=>p.id);
  const prices=pets.map(p=>commerceUnit(key,p));
  if(!ids.length||ids.length!==selected.length||ids.join(',')!==batch||prices.join(',')!==quote){
    ctx.notice('动物状态或所选个体已变，请核对清单后再提交。');
    return;
  }
  const names=pets.map(p=>p.name).join('、');
  if(Object.hasOwn(commerceExamples,key))c.done[key]=names;
  if(key==='guest'){c.guest='sold';c.guestPet=names;}
  const sold=new Set(ids);
  const total=prices.reduce((sum,price)=>sum+price,0);
  ctx.s.animals=ctx.s.animals.filter(p=>!sold.has(p.id));
  ctx.s.cash+=total;
  for(const channel of Object.keys(c.selected))c.selected[channel]=c.selected[channel].filter(id=>!sold.has(id));
  ctx.notice((key==='recycle'?'已回收':key==='market'?'已出售':'已交付')+ids.length+' 只，收入 '+total+' 金币。');
}
function actCommerce(action,value,ctx,quote) {
  if(!action.startsWith('pc-'))return false;
  const s=ctx.s,c=commerceState(s);
  const txt=msg=>ctx.notice(msg);
  const [key,subject]=String(value||'').split('|');
  if(action==='pc-order'){
    if(Object.hasOwn(commerceExamples,key))c.orderKey=key;
  }else if(action==='pc-choose'||action==='pc-choose-all'||action==='pc-clear'){
    if(!Object.hasOwn(saleActions,key))return true;
    const list=commerceEligible(key,c,ctx);
    const selected=new Set(c.selected[key]||[]);
    if(action==='pc-clear'){
      c.selected[key]=[];
    }else if(action==='pc-choose-all'){
      c.selected[key]=list.every(p=>selected.has(p.id))?[]:list.map(p=>p.id);
    }else if(list.some(p=>p.id===subject)){
      if(selected.has(subject))selected.delete(subject);
      else selected.add(subject);
      c.selected[key]=[...selected];
    }
  }else if(action==='pc-lab'){
    if(['buy','recycle','upgrade'].includes(key))s.labTab=key;
  }else if(action==='pc-stock-detail'){
    if(c.goods[key])c.expanded=c.expanded===key?'':key;
  }else if(action==='pc-guest-cancel'){
    if(c.guest==='waiting'){c.guest='cancelled';txt('林女士离开了店铺。');}
  }else if(action==='pc-buy'){
    const lot=c.goods[key];
    if(!lot||String(lot.lotId)!==subject)return true;
    if(s.cash<lot.cost){txt('金币不足。');return true;}
    const {cost,key:slot,lotId,...pet}=lot;
    s.cash-=cost;s.animals.push({...pet,id:'lab-pet-'+(++c.sequence)});
    c.goods[slot]=commerceStock(slot,s.labLevel||1,lotId+1);txt(pet.name+'已入住'+pet.species+'房。');
  }else if(action==='pc-upgrade'){
    const level=s.labLevel||1, cost=level*180;
    if(String(level)!==value||level>=commerceRates.length||s.cash<cost)return true;
    s.labLevel=level+1;s.cash-=cost;
    txt('研究等级提升，下次补入的幼体按新概率出现稀有标签。');
  }else{
    if(action==='pc-deliver'&&Object.hasOwn(commerceExamples,key))commerceSettle(key,subject,c,ctx,quote);
    else {
      const channel={ 'pc-market':'market','pc-recycle':'recycle','pc-guest-sell':'guest' }[action];
      if(channel)commerceSettle(channel,key,c,ctx,quote);
    }
  }
  return true;
}
