// The ordinary preview and the first-day trial keep separate local inventories.
const exampleSaveKey='petshop.example.v1';
let exampleSave={};
try{exampleSave=JSON.parse(localStorage.getItem(exampleSaveKey)||'{}')||{};}catch{}
const sampleAnimals = [
  {id:'hua', sex:'母', name:'小花', species:'兔', breed:'安哥拉兔', art:'angora', stage:'成年', gentle:'B', bred:true, value:28, salvage:8},
  {id:'li', sex:'公', name:'栗子', species:'兔', breed:'原色兔', art:'brown', stage:'成年', bred:true, value:20, salvage:6},
  {id:'mo', sex:'母', name:'墨点', species:'兔', breed:'安哥拉兔', art:'spot', stage:'幼年', gentle:'A', value:112, salvage:8},
  {id:'yun', sex:'母', name:'云团', species:'猫', breed:'波斯猫', art:'cat', stage:'成年', value:1500, salvage:90},
  {id:'tuan', sex:'公', name:'团团', species:'兔', breed:'安哥拉兔', art:'angora', stage:'幼年', gentle:'S', value:115, salvage:8},
  {id:'lan', sex:'公', name:'蓝莓', species:'猫', breed:'英国短毛猫', art:'british', stage:'幼年', value:960, salvage:72},
  {id:'dou', sex:'公', name:'豆豆', species:'狗', breed:'柴犬', art:'shiba', stage:'成年', value:1300, salvage:78},
  {id:'spring', name:'阿柴', sex:'母', species:'狗', breed:'柴犬', art:'shiba', stage:'成年', breeding:true, value:1300, salvage:78},
  {id:'hui', sex:'公', name:'灰灰', species:'兔', breed:'原色兔', art:'brown-dead', stage:'已故', salvage:6},
  {id:'su', sex:'母', name:'小酥', species:'猫', breed:'波斯猫', art:'cat-dead', stage:'已故', salvage:90}
];
const saleChannels = {
  market: {title:'自由市场', action:'出售', rate:100},
  recycle: {title:'研究所回收', action:'回收'},
  neighbors: {title:'街坊的委托', action:'交付', rate:135, order:true},
  bookstore: {title:'书店的伙伴', action:'交付', rate:155, order:true},
  guest: {title:'林女士的委托', action:'出售', rate:215}
};
const saleState = {
  stock:new Map((exampleSave.stock||sampleAnimals).map(pet=>[pet.id,pet])), coins:exampleSave.coins??680, shopXp:exampleSave.shopXp??0,
  createdAt:exampleSave.createdAt??Date.now(),raceEntries:exampleSave.raceEntries||{},
  closed:new Set(exampleSave.closed||[]), selected:new Set(), receipts:exampleSave.receipts||{},
  channel:'', species:'全部', profileId:'hua', offerSex:'母', pending:null
};
let lastExampleSave='';
function saveExample(){
  const s=saleState;
  const raw=JSON.stringify({createdAt:s.createdAt,coins:s.coins,shopXp:s.shopXp,raceEntries:s.raceEntries,
    stock:[...s.stock.values()],closed:[...s.closed],receipts:s.receipts,flows:DotFlows.saveState(),jobs:RoomBook.saveJobs()});
  if(raw===lastExampleSave)return;
  try{localStorage.setItem(exampleSaveKey,raw);lastExampleSave=raw;}catch{}
}
function saleEligible(pet, channel) {
  if (!pet || pet.seedMarked || pet.breeding || saleState.closed.has(channel)) return false;
  if (channel==='recycle') return pet.stage==='已故';
  if (pet.stage==='已故') return false;
  if (saleChannels[channel]?.accepts) return saleChannels[channel].accepts(pet);
  if (channel==='market') return true;
  if (pet.species!=='兔') return false;
  if (channel==='neighbors') return true;
  if (channel==='bookstore') return Boolean(pet.gentle);
  return channel==='guest' && pet.breed==='安哥拉兔' && pet.stage==='幼年' && ['A','S','S+'].includes(pet.gentle);
}
function salePrice(pet, channel) {
  // Example Vb and residual values above include the animal's stage and breeding status.
  // This session has no store or individual award bonus. Round each unit before summing.
  if (channel==='recycle') return pet.stage==='已故'?pet.salvage:0;
  return Math.floor((pet.value*saleChannels[channel].rate+50)/100);
}
function startSelection(channel) {
  if (saleState.channel!==channel){saleState.selected.clear();saleState.species='全部';}
  saleState.channel=channel;
}
function selectionQuote(channel, ids=saleState.selected) {
  const lines=[];
  for (const id of ids) {
    const pet=saleState.stock.get(id);
    if (!saleEligible(pet,channel)) return null;
    lines.push({id,name:pet.name,price:salePrice(pet,channel)});
  }
  return {channel,lines,total:lines.reduce((sum,row)=>sum+row.price,0)};
}
function seedWarning(lines) {
  const selected=new Set(lines.map(line=>line.id));
  const seedGroups=new Map();
  for (const pet of saleState.stock.values()) {
    if (pet.stage==='已故' || pet.bred || pet.breeding) continue;
    const group=pet.species+'房的'+pet.sex+'种源';
    seedGroups.set(group,(seedGroups.get(group)||false) || !selected.has(pet.id));
  }
  const lost=[...seedGroups].filter(([,remaining])=>!remaining).map(([group])=>group);
  return lost.length ? '本批成交后将失去最后的'+lost.join('、')+'。' : '';
}
function saleButton(text, action, key='', primary=false, pressed) {
  return `<button type="button" class="btn${primary?' primary':''}" data-sale="${action}" data-key="${key}"${pressed===undefined?'':' aria-pressed="'+pressed+'"'}>${text}</button>`;
}
function saleStatus(channel) {
  const receipt=saleState.receipts[channel];
  return receipt ? `<p class="sale-receipt">已${saleChannels[channel].action} ${receipt.lines.length} 只，收入 ${receipt.total} 金币。</p>` : '';
}
function salePetArt(p) {
  if(p.art==='british'&&p.sex==='公')return 'british-male';
  if(p.art==='shiba'&&p.sex==='母')return 'shiba-female';
  return p.art;
}
function salePetThumb(p,cls='thumb') {
  const image=img(salePetArt(p),cls);
  return p.seedMarked?'<span class="sample-thumb seed-photo">'+image+'<span class="seed-mark">种源</span></span>':image;
}
function salePanel(channel,roomSpecies='') {
  if(!saleChannels[channel])return note('请从柜台选择一张有效委托。');
  const mode=saleChannels[channel], filterSpecies=roomSpecies||saleState.species;
  const list=[...saleState.stock.values()].filter(pet=>saleEligible(pet,channel)&&(filterSpecies==='全部'||pet.species===filterSpecies));
  const speciesFilter=!roomSpecies&&['market','recycle'].includes(channel)?'<div class="room-filters"><label>物种<select data-sale-species aria-label="物种筛选">'+['全部','兔','猫','狗'].map(s=>'<option'+(s===filterSpecies?' selected':'')+'>'+s+'</option>').join('')+'</select></label></div>':'';
  const rows=list.map(pet=>`<label class="sale-pet">
    <input type="checkbox" data-sale-pet="${pet.id}" aria-label="选择${pet.name}" ${saleState.selected.has(pet.id)?'checked':''}>
    ${salePetThumb(pet)}<span class="itemtxt"><strong>${pet.name}</strong><small>${pet.breed} · ${pet.sex} · ${pet.stage}${pet.bred?' · 已繁育':''}</small></span>
    <b class="price">${salePrice(pet,channel)} 金币</b></label>`).join('');
  return `<section class="sale-panel" data-channel="${channel}">
    ${speciesFilter}${title('选择'+mode.action+'的动物',list.length+' 只可选')}
    <div class="sale-animals">${rows || '<p class="sale-empty">当前没有符合条件的动物。</p>'}</div>
    <div class="sale-bar"><span data-sale-count aria-live="polite"></span>
      <div class="sale-buttons"><button type="button" class="btn" data-sale="all"${list.length?'':' disabled'}>全选本页</button>
      <button type="button" class="btn primary" data-sale="review">核对${mode.action}</button></div></div>
    </section>`;
}
function refreshSaleCount() {
  const panel=document.querySelector('[data-channel].sale-panel');
  if (!panel) return;
  const quote=selectionQuote(panel.dataset.channel);
  const n=quote?.lines.length||0;
  panel.querySelector('[data-sale-count]').textContent='已选 '+n+' 只 · '+(quote?.total||0)+' 金币';
  panel.querySelector('[data-sale=review]').disabled=!n;
}
function showSaleReview() {
  const quote=selectionQuote(saleState.channel);
  if (!quote?.lines.length) return;
  saleState.pending=quote;
  const modal=document.querySelector('#sale-review'), mode=saleChannels[quote.channel];
  modal.querySelector('h3').textContent='确认'+mode.action+' '+quote.lines.length+' 只';
  modal.querySelector('.sale-lines').innerHTML=quote.lines.map(line=>`<div class="spread"><span>${line.name}</span><b>${line.price} 金币</b></div>`).join('');
  const warning=modal.querySelector('.sale-warning');
  warning.textContent=seedWarning(quote.lines);
  warning.hidden=!warning.textContent;
  modal.querySelector('.sale-total').textContent='合计 '+quote.total+' 金币';
  modal.querySelector('[data-sale=commit]').textContent='确认'+mode.action;
  modal.showModal();
}
function commitSale() {
  const quote=saleState.pending;
  if (!quote) return;
  const channel=saleChannels[quote.channel]?.order?'order':quote.channel;
  if(!featureDoors.enter(channel==='recycle'?'lab':channel==='order'?'orders':channel,false))return;
  const fresh=selectionQuote(quote.channel, quote.lines.map(line=>line.id));
  document.querySelector('#sale-review').close();
  saleState.pending=null;
  if (!fresh || fresh.lines.some((line,i)=>line.price!==quote.lines[i].price)) {
    saleState.selected.clear();
    show(location.hash.slice(1));
    RabbitUI.notice('动物状态已变化，请重新选择。');
    return;
  }
  for (const line of quote.lines) saleState.stock.delete(line.id);
  const beforeLevel=shopProgress(shopRules,saleState.shopXp).level;
  const xp=saleExperience(shopRules,channel,quote.lines.map(line=>({amount:line.price})));
  saleState.shopXp+=xp;
  saleState.coins+=quote.total;
  saleState.selected.clear();
  saleState.receipts[quote.channel]=quote;
  if (saleChannels[quote.channel].order || quote.channel==='guest') saleState.closed.add(quote.channel);
  previewNav.completed();
  const level=shopProgress(shopRules,saleState.shopXp).level;
  RabbitUI.notice('已'+saleChannels[quote.channel].action+' '+quote.lines.length+' 只，收入 '+quote.total+' 金币'+(xp?'，店铺经验 +'+xp:'')+'。'+(level>beforeLevel?'店铺升至 '+level+' 级。':''));
}
function saleMarket() {
  startSelection('market');
  return banner('market','自由市场')+salePanel('market');
}
function saleOrders() {
  const details={neighbors:['简单 · 只要求物种','收购兔子，年龄不限。','1.35'],bookstore:['中等 · 单个标签','收购性格温顺的兔子。','1.55']};
  const slots=Object.keys(details).map(key=>{
    const [tier,text,rate]=details[key], mode=saleChannels[key];
    if (saleState.closed.has(key)) return card(mode.title,saleStatus(key)+'<small>等待新委托 · 冷却 30 分钟</small>');
    const open=saleState.channel===key;
    return card(mode.title,`<span class="badge">${tier}</span><p>${text}</p><div class="grid2">
      ${saleButton(open?'收起选择':'选择交付','open',open?'':key,true)}${b('取消订单')}</div>
      ${open?salePanel(key):''}`,'<span class="pill">报酬 ×'+rate+'</span>');
  }).join('');
  return banner('orders','订单柜台')+title('普通订单','免费取消 3 / 3')+
    '<div class="smallnote">完成或取消后，该槽位独立等待 30 分钟。</div>'+slots+
    card('正在寻找新委托','<div class="row">'+img('ui-order-clock-72-v2')+'<span>24:18 · 新订单尚未到达</span></div>')+
    b('额外取消次数 · 查看','cancelshop');
}
function labTabs(active){
  return '<nav class="tabs" aria-label="研究所栏目">'+saleButton('种源货架','open','',active==='shelf')+
    saleButton('研究回收','open','recycle',active==='recycle')+b('研究手册','research',active==='research')+
    b('服务单','items',active==='items')+'</nav>';
}
function saleLab() {
  const recycle=saleState.channel==='recycle';
  const tabs=labTabs(recycle?'recycle':'shelf');
  if (recycle) return banner('lab','研究所')+tabs+note('研究所仅回收已故动物。')+salePanel('recycle');
  return banner('lab','研究所')+tabs+title('本批种源','刷新剩余 19:42 · 示例')+
    ['母','公'].map(sex=>'<button class="item" data-sale="offer" data-key="'+sex+'">'+img('angora')+'<span class="itemtxt"><strong>安哥拉兔 · '+sex+'</strong><small>幼年 · 本批种源</small></span><span class="chev">›</span></button>').join('')+
    note('每 30 分钟刷新一批。同批内容固定，已售槽位留空。')+b('查看购买确认')+
    card('研究服务','<div class="grid2">'+b('复评与指导','items')+b('研究技能树','research')+'</div>')+
    saleButton('已故动物回收','open','recycle');
}
function saleGuest() {
  const hero='<div class="pethead">'+img('guest','portrait')+'<div><span class="badge">特殊来客</span><h3>林女士</h3><p>收藏爱好者</p></div></div>';
  if (saleState.closed.has('guest')) return hero+saleStatus('guest')+note('林女士已经离店。');
  startSelection('guest');
  return hero+card('“我想收养性格温顺的小安哥拉兔。”','<div class="spread"><span>本次停留</span><b>18:36</b></div><small>固定停留 30 分钟 · 静态倒计时</small>')+
    card('来客需求','<div class="row"><span class="pill">安哥拉兔</span><span class="pill">幼年</span><span class="pill">温顺 · 性格 A 及以上</span></div>')+
    '<div class="grid2">'+saleButton('选择交付动物','open','guest',true)+'<button class="btn" data-dot="guest-dismiss">婉拒来客</button></div>';
}
function animalCard(room,id,p,portrait,breed,status,traits){
  return '<section class="rb-book pethead animal-card"><div class="rb-book-head"><span>'+room+' · 个体档案</span><b>'+id+'</b></div>'+
    '<div class="animal-identity"><div class="rb-portrait">'+portrait+'</div><h3>'+p.name+'</h3><p>'+breed+'</p><p>'+status+'</p></div>'+
    '<div class="animal-traits"><h4>个体标签</h4>'+traits.map(t=>'<div><small>'+t.type+'</small><span>'+t.label+'</span><b>'+t.grade+'</b></div>').join('')+'</div></section>';
}
function saleProfile() {
  const p=saleState.stock.get(saleState.profileId);
  if (!p) return note('这只动物已离店。');
  const traits=p.traits||['性格','品相','毛发','体态','体型','健全度'].map((type,i)=>({
    type,label:i===0&&p.gentle?'温顺':p.id==='hua'?['温顺','圆脸','长绒','匀称','中型','未见明显缺陷'][i]:'未登记',
    grade:i===0&&p.gentle?p.gentle:p.id==='hua'?['B','B','A','B','B','—'][i]:'—'}));
  return animalCard(p.species+'房','#'+p.id,p,salePetThumb(p,''),p.breed+(p.coat?' · '+p.coat:''),
    p.sex+' · '+p.stage+(p.bred?' · 已繁育':''),traits)+
    (p.mixed?note('外形：'+p.appearance+' · '+p.coat):'')+
    (p.seedMarked?note(p.stage==='已故'?'已留种，取消留种后可交给研究所回收。':'已留种，出售前请先取消留种。'):'')+
    '<div class="profile-actions">'+(p.stage!=='已故'||p.seedMarked?saleButton(p.seedMarked?'取消留种':'留种','seed',p.id,false,!!p.seedMarked):'')+
    (saleEligible(p,'market')||saleEligible(p,'recycle')?'<button type="button" class="btn" data-dot="profile-sale" data-key="'+p.id+'">'+(p.stage==='已故'?'前往研究所回收':'前往自由市场')+'</button>':'')+
    (p.id==='hua'?b('查看比赛','show')+b('使用道具','items'):'')+'</div>';
}
function handleSaleButton(button) {
  const {sale,key}=button.dataset;
  if (sale==='seed') {
    const p=saleState.stock.get(key);
    if(p&&(p.seedMarked||p.stage!=='已故')){
      p.seedMarked=button.getAttribute('aria-pressed')!=='true';
      if(p.seedMarked)saleState.selected.delete(p.id);
    }
    show('profile',true);
    if(p)RabbitUI.notice(p.seedMarked?'已标记留种。':'已取消留种。');
    return;
  }
  if (sale==='review') return showSaleReview();
  if (sale==='all') {
    for(const input of document.querySelectorAll('[data-sale-pet]'))if(saleEligible(saleState.stock.get(input.dataset.salePet),saleState.channel)){
      saleState.selected.add(input.dataset.salePet);input.checked=true;
    }
    refreshSaleCount();return;
  }
  if (sale==='commit') return commitSale();
  if (sale==='edit') return document.querySelector('#sale-review').close();
  if (sale==='profile') {
    saleState.profileId=key;
    return show('profile');
  }
  if(sale==='offer')return show('laboffer',false,'forward',{sex:key});
  if(sale==='open'&&key==='recycle'&&previewNav.trialShop)return RabbitUI.openChannel('recycle');
  if(sale==='open' && (saleChannels[key]?.order||key==='guest')){
    return show(key==='guest'?'guestfulfill':'orderfulfill',false,'forward',{channel:key});
  }
  if(sale==='open' && displayedPage!=='lab')return show('lab',false,'forward',{channel:key});
  if (sale==='open') startSelection(key);
  show(location.hash.slice(1),true);
}
document.addEventListener('change',event=>{
  if(event.target.hasAttribute('data-sale-species')){
    saleState.species=event.target.value;saleState.selected.clear();show(displayedPage,true);return;
  }
  const input=event.target.closest('[data-sale-pet]');
  if (!input) return;
  const id=input.dataset.salePet;
  if (input.checked && saleEligible(saleState.stock.get(id),saleState.channel)) saleState.selected.add(id);
  else saleState.selected.delete(id);
  refreshSaleCount();
});
