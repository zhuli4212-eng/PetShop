const pages={home:'店铺主界面',rooms:'动物房间',breed:'繁育台',profile:'动物档案',orders:'普通订单',market:'自由市场',lab:'研究所',guest:'特殊来客',decor:'店内装饰',show:'赛级展示',login:'账号和登录'};
const types=['性格','品相','毛发','体态','体型','缺陷'];
// Each floor anchor is measured in percent of the complete 512 × 288 background.
const roomTypes={
 '兔':{background:'rabbit-room',spots:[[27,74],[70,83],[46,92]]},
 '猫':{background:'cat-room',spots:[[29,78],[67,88],[48,68]]},
 '狗':{background:'dog-room',spots:[[31,75],[73,80],[53,94]]}
};
function makeTraits(overrides={}){
  const base=['亲人','圆脸','短绒','匀称','中型','未见缺陷'];
  return types.map((type,i)=>{
    const v=overrides[type], grade=['B','B','C','B','C','—'][i];
    if(v&&typeof v==='object')return {type,label:v.label||base[i],grade:v.grade||grade,rarity:v.rarity||'常见'};
    return {type,label:v||base[i],grade,rarity:i===5?'—':'常见'};
  });
}
function initial(){return {cash:680,animals:[
  {id:'tu1',name:'小花',species:'兔',breed:'安哥拉兔',stage:'成年期',image:'angora',base:150,traits:makeTraits({性格:'温顺',毛发:{label:'长绒',grade:'A',rarity:'稀有'}})},
  {id:'tu2',name:'栗子',species:'兔',breed:'原色兔',stage:'老年期',image:'brown',base:100,traits:makeTraits({性格:'好奇',毛发:'栗色短绒'})},
  {id:'tu3',name:'墨点',species:'兔',breed:'安哥拉兔',stage:'幼年期',image:'spot',base:130,traits:makeTraits({性格:{label:'温顺',grade:'A'},毛发:{label:'黑白花斑',grade:'B',rarity:'少见'},体型:'小型'})},
  {id:'cat1',name:'云团',species:'猫',breed:'波斯猫',stage:'成年期',image:'cat',base:180,traits:makeTraits({毛发:{label:'长绒',grade:'A',rarity:'稀有'}})},
  {id:'cat2',name:'蓝莓',species:'猫',breed:'英国短毛猫',stage:'成年期',image:'british_coat01_female',base:140,traits:makeTraits({性格:'沉稳',毛发:'蓝灰短绒'})},
  {id:'dog1',name:'阿柴',species:'狗',breed:'柴犬',stage:'成年期',image:'shiba_coat01_male',base:130,traits:makeTraits({性格:'好奇',毛发:'赤色短毛'})},
  {id:'dog2',name:'布丁',species:'狗',breed:'柯基犬',stage:'成年期',image:'corgi_coat02_female',base:143,traits:makeTraits({性格:'亲人',毛发:'赤白双色'})},
  {id:'dog3',name:'豆卷',species:'狗',breed:'腊肠犬',stage:'成年期',image:'dachshund_coat02_female',base:176,traits:makeTraits({性格:'温顺',毛发:'黑褐短毛'})},
  {id:'old1',name:'灰灰',species:'兔',breed:'原色兔',stage:'死亡',image:'brown',base:90,traits:makeTraits({性格:'安静'})}],
  labLevel:1,labTab:'buy',species:'兔',selected:'tu1',pair:[],jobs:{},litters:{},serial:0,ownedDecor:[],placed:[],stagePet:'tu1',roomFilter:'在养'};}
let s=initial(),page='home',noticeTimer=0,timer=0;
const trail=[];
const sceneMotion=createSceneMotion();
const $=q=>document.querySelector(q),screen=$('#screen');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const art=(key,cls='')=>'<img src="'+(ASSETS[key]||'')+'" alt="" draggable="false" class="'+esc(cls)+'">';
const act=(a,value,label,css='btn')=>'<button class="'+esc(css)+'" data-a="'+esc(a)+'" data-v="'+esc(value)+'">'+esc(label)+'</button>';
const go=(pg,label,css='btn')=>act('go',pg,label,css);
const disabled=label=>'<button class="btn" disabled>'+esc(label)+'</button>';
const animal=id=>s.animals.find(p=>p.id===id);
const alive=commerceAlive;const adult=p=>['成年期','老年期'].includes(p.stage);
function petArt(p,css='',alt=''){
 const dead=!alive(p), key=dead?p.image+'-dead':p.image;
 return '<img draggable="false" src="'+ASSETS[key]+'" class="'+esc(css)+(dead?' deceased-sprite':'')+'" alt="'+esc(alt)+'">';
}
const locked=id=>Object.values(s.jobs).some(job=>job.pair.includes(id));
function banner(key,caption=''){return '<div class="banner">'+art(key)+(caption?'<span>'+esc(caption)+'</span>':'')+'</div>';}
function notice(text){clearTimeout(noticeTimer);$('#notice').textContent=text;noticeTimer=setTimeout(()=>$('#notice').textContent='',2400);}
function title(label,detail=''){return '<div class="sectionhead">'+esc(label)+(detail?'<small>'+esc(detail)+'</small>':'')+'</div>';}
function item(p,a='profile',tail='›',css=''){
  return '<button class="item '+esc(css)+'" data-a="'+a+'" data-v="'+esc(p.id)+'">'+petArt(p,'thumb')+'<span class="itemtxt"><strong>'+esc(p.name)+'</strong><small>'+esc(p.breed)+' · '+esc(alive(p)?p.stage:'已故')+(locked(p.id)?' · 培育中':'')+'</small></span><span class="chev">'+esc(tail)+'</span></button>';
}
// Percentages are in the background image's coordinate system, shared by the
// full room, decoration preview and touch targets.
const furnishings=[
 ['rooms','侧门','动物房间',13.7,15.7,18,21],
 ['login','钥匙挂板','账号',30,11.3,14.6,8.2],
 ['orders','订单夹','普通订单',50.2,18.2,17,10],
 ['show','奖杯与绶带','赛展台',82,7.8,26,11],
 ['lab','显微镜与试剂瓶','研究所',17.8,41.4,29,14],
 ['market','铜天平','自由市场',83,39.8,25,15],
 ['profile','绿皮档案册','动物档案',17,77.4,23,10],
 ['breed','育种篮','繁育台',87.5,58.8,20,10.5],
 ['decor','布料箱','装饰',15.2,63.5,25,18],
 ['guest','来客簿与铜铃','特殊来客',81,74,30,14]
];
const placedPositions={fence:[34,92,17],lamp:[67,93,10]};
function walkCycle(key){
 return '<i class="walk-cycle" aria-hidden="true" style="background-image:url('+ASSETS[key+'-walk']+')"></i>';
}
function shopScene(mini=false){
 const hotspots=mini?'':furnishings.map(([id,object,label,x,y,w,h])=>
   '<button class="scene-target" style="left:'+x+'%;top:'+y+'%;width:'+w+'%;height:'+h+'%" data-a="go" data-v="'+id+'" aria-label="'+object+'，'+pages[id]+'"><span>'+label+'</span></button>').join('');
 const decorations=s.placed.map(key=>{
   const [x,y,w]=placedPositions[key];
   return '<img alt="'+esc(decorItems.find(d=>d.key===key).name)+'" class="scene-object" data-decoration="'+key+'" src="'+ASSETS[key]+'" style="left:'+x+'%;top:'+y+'%;width:'+w+'%">';
 }).join('');
 return '<div class="shop-scene'+(mini?' mini':'')+'" aria-label="麦穗宠物店室内"><div class="scene-plane">'+
   '<img class="scene-backdrop" src="'+ASSETS['shop-interior']+'" alt="暖木色店铺内景">'+
   decorations+'<div class="keeper" data-shopkeeper '+(mini?'':'data-walker="keeper" data-x="50" data-y="44"')+' style="--cycle-width:310%" role="img" aria-label="穿绿围裙的店长">'+art('shopkeeper','rest-sprite')+(mini?'':walkCycle('shopkeeper'))+'<span aria-hidden="true">店长</span></div>'+hotspots+'</div></div>';
}
function renderHome(){return shopScene();}
function visibleRoom(){return s.animals.filter(p=>p.species===s.species&&(s.roomFilter==='在养'?alive(p):!alive(p)));}
// The original cropped sprites and the newer 96px catalog frames have different padding.
const croppedSpriteWidths={angora:69,brown:54,spot:48,cat:73,kitten:59};
function renderRooms(){
 const v=visibleRoom(),room=roomTypes[s.species];
 const signs=Object.keys(roomTypes).map(k=>'<button type="button" class="room-sign" data-a="species" data-v="'+k+'" aria-pressed="'+(s.species===k)+'">'+k+'房</button>').join('');
 const residents=v.slice(0,room.spots.length).map((p,i)=>{
   const [x,y]=room.spots[i];
   if(!alive(p)){
     return '<div class="room-actor room-deceased" data-deceased="true" style="left:'+x+'%;top:'+y+'%;width:20%">'+
       petArt(p,'pet-mini',p.name)+'<span class="deceased-sign">已故</span></div>';
   }
   const width=p.image.includes('_coat')?(p.stage==='幼年期'?14:20):(p.stage==='幼年期'?10:14);
   const cropped=croppedSpriteWidths[p.image];
   const animation=ASSETS[p.image+'-walk']&&!locked(p.id);
   const walker=animation?' data-walker="'+esc(p.id)+'" data-x="'+x+'" data-y="'+y+'" data-slot="'+i+'" data-zone="'+s.species+i+'"':'';
   return '<div class="room-actor"'+walker+' style="left:'+x+'%;top:'+y+'%;width:'+width+'%;--cycle-width:'+(cropped?9600/cropped:100)+'%;--feet-offset:'+(cropped?6.25:0)+'%">'+
     '<img class="pet-mini rest-sprite" draggable="false" src="'+ASSETS[p.image]+'" alt="'+esc(p.name)+'">'+(animation?walkCycle(p.image):'')+'</div>';
 }).join('');
 const filters=['在养','已故'].map(k=>{
   const count=k==='已故'?s.animals.filter(p=>p.species===s.species&&!alive(p)).length:0;
   return act('roomfilter',k,k+(count?' · '+count:''),'btn small '+(s.roomFilter===k?'primary':''));
 }).join('');
 return '<div class="room-panel"><nav class="room-signs" aria-label="切换动物房间">'+signs+'</nav>'+
   '<div class="roomview"><img class="room-bg" src="'+ASSETS[room.background]+'" alt="'+s.species+'房场景">'+residents+'</div></div>'+
   '<div class="spread">'+title(s.species+'房名册',v.length+' 只')+go('breed','进繁育台','btn primary small')+'</div>'+
   '<div class="row">'+filters+'</div><div class="stack">'+(v.map(p=>item(p)).join('')||'<div class="empty">'+(s.roomFilter==='已故'?'此房暂无待回收的已故动物':'此处暂无在养动物')+'</div>')+'</div>';
}
function slot(p,i){return '<div class="slot">'+(p?art(p.image)+'<b>'+esc(p.name)+'</b><small>'+esc(p.stage)+'</small>':'<b>选择亲本</b><small>第 '+(i+1)+' 只</small>')+'</div>';}
function renderBreed(){
 const j=s.jobs[s.species], litter=s.litters[s.species];
 if(j){
   const left=Math.max(0,Math.ceil((j.ends-Date.now())/1000));
   return banner(roomTypes[s.species].background,'培育中')+title(s.species+'房 · 等待幼体')+
   '<div class="slots">'+slot(animal(j.pair[0]),0)+'<b class="plus">×</b>'+slot(animal(j.pair[1]),1)+'</div><div class="card stack"><b>预计完成</b><strong id="remaining">'+left+' 秒</strong><small>演示等待时长</small></div>';
 }
 if(litter){
   const parents=litter.parentIds.map(animal).filter(Boolean);
   return banner(roomTypes[s.species].background,'培育完成')+title('这一窝幼体',litter.babies.length+' 只')+
     '<div class="stack">'+litter.babies.map(id=>animal(id)).filter(Boolean).map(p=>item(p)).join('')+'</div>'+
     title('已故亲本',parents.length?'待回收 '+parents.length+' 只':'已回收')+
     (parents.length?'<div class="stack">'+parents.map(p=>item(p)).join('')+'</div>':'')+
     '<div class="row">'+act('again','','培育下一窝','btn primary')+(parents.length?act('recycle-page',parents[0].id,'去研究所回收'):'')+'</div>';
 }
 const eligible=s.animals.filter(p=>p.species===s.species&&adult(p)&&!locked(p.id));
 s.pair=s.pair.filter(id=>eligible.some(p=>p.id===id));
 const picks=s.pair.map(animal);
 return title(s.species+'房 · 选择亲本','已选 '+picks.length+' / 2')+
 '<div class="slots">'+slot(picks[0],0)+'<b class="plus">×</b>'+slot(picks[1],1)+'</div>'+
 '<div class="warn">培育完成时，两只亲本都会死亡。每窝幼体数量按物种随机。</div>'+title('可选亲本','成年期 / 老年期')+
 '<div class="stack">'+(eligible.map(p=>item(p,'parent',s.pair.includes(p.id)?'✓':'＋',s.pair.includes(p.id)?'focused':'')).join('')||'<div class="empty">此房暂无可配对的亲本</div>')+'</div>'+
 (picks.length===2?act('start-breed','','确认培育','btn primary'):disabled('选择两只后可培育'));
}
function finishLitter(species,job){
 const [a,b]=job.pair.map(animal);
 a.stage=b.stage='死亡';
 // Temporary sample distributions exist only to show variable-size result screens.
 const n=(species==='兔'?[1,2,3]:[1,2])[Math.floor(Math.random()*(species==='兔'?3:2))];
 const babies=[];
 for(let i=0;i<n;i++){
   const image=species==='猫'?'kitten':species==='兔'?'spot':a.image;
   const p={...a,id:'litter-'+(++s.serial),name:['小芽','团团','豆豆'][i],stage:'幼年期',breed:a.breed===b.breed?a.breed:'杂交',image,traits:makeTraits({性格:'温顺'})};
   s.animals.push(p);babies.push(p.id);
 }
 s.litters[species]={babies,parentIds:job.pair};
 delete s.jobs[species];
}
function finishJobs(){
 const now=Date.now();
 const completed=Object.entries(s.jobs).filter(([,job])=>job.ends<=now);
 for(const [species,job] of completed)finishLitter(species,job);
 return completed.length>0;
}
function renderProfile(){
 const p=animal(s.selected);
 if(!p)return '<div class="empty">'+(s.animals.length?'这只动物已离店。':'尚无动物档案。')+'</div>';
 const traits=types.map(type=>p.traits.find(t=>t.type===type)||{type,label:'未记录',rarity:'—',grade:'—'});
 return '<div class="pethead'+(alive(p)?'':' is-deceased')+'">'+petArt(p)+'<div><small>个体档案</small><h3>'+esc(p.name)+'</h3><p>'+esc(p.species)+' · '+esc(p.breed)+'</p><span class="pill">'+esc(alive(p)?p.stage:'已故')+'</span></div></div>'+
 title('个体标签')+'<div class="table"><div class="tr label"><b>类别</b><b>标签</b><b>稀有度</b><b>评分</b></div>'+traits.map(t=>'<div class="tr"><span>'+esc(t.type)+'</span><b>'+esc(t.label)+'</b><span>'+esc(t.rarity)+'</span><b class="grade">'+esc(t.grade)+'</b></div>').join('')+'</div>'+
 (alive(p)?'<div class="spread card"><span>市场基础价</span><b class="price">'+p.base+' 金币</b></div>':'<div class="warn">已死亡，可交给研究所回收。</div>')+
 '<div class="row">'+go('rooms','查看同房动物','btn primary')+(alive(p)?go('market','去自由市场'):act('recycle-page',p.id,'去研究所回收'))+'</div>';
}
const decorItems=[{key:'fence',name:'蕨叶矮篱',price:80},{key:'lamp',name:'琥珀小台灯',price:55}];
function renderDecor(){
 return shopScene(true)+title('装饰铺')+
 decorItems.map(d=>'<div class="card spread"><div class="row">'+art(d.key,'thumb')+'<div><b>'+d.name+'</b><div class="muted">'+(s.ownedDecor.includes(d.key)?'已拥有':d.price+' 金币')+'</div></div></div>'+act('decor',d.key,s.placed.includes(d.key)?'收起':s.ownedDecor.includes(d.key)?'摆放':'购买并摆放','btn small')+'</div>').join('');
}
function renderShow(){
 const pets=s.animals.filter(alive),p=pets.find(a=>a.id===s.stagePet)||pets[0];
 return '<div class="stage">'+art('stage')+(p?art(p.image,'onstage'):'')+'</div>'+
 (p?title(p.name,p.breed+' · '+p.stage):title('展台暂空'))+
 '<div class="row">'+pets.map(a=>act('model',a.id,a.name,'btn small '+(a.id===p.id?'primary':''))).join('')+'</div>'+
 (p?'<div class="card stack">'+title('展示标签')+'<div class="row">'+p.traits.filter(t=>['品相','毛发','体态'].includes(t.type)).map(t=>'<span class="pill">'+esc(t.type)+' · '+esc(t.label)+' '+esc(t.grade)+'</span>').join('')+'</div></div>':'')+
 '<p class="note">赛级评选标准与奖励待定。</p>';
}
function renderLogin(){
 return '<div style="position:relative">'+art('opening','opening')+'<span class="scenename">麦穗宠物店</span></div><div class="card stack">'+title('账号和登录')+'<p class="note">登录方式待定，当前仅预留入口位置。</p></div>';
}
const routes={home:renderHome,rooms:renderRooms,breed:renderBreed,profile:renderProfile,decor:renderDecor,show:renderShow,login:renderLogin};
function context(){return {s,page,art,petArt,act,go,banner,notice,makeTraits,locked};}
function display(resetScroll=false){
 finishJobs();
 const prev=$('.scroll').scrollTop;
 $('.phone').classList.toggle('in-shop',page==='home');
 $('.back').hidden=page==='home';
 $('#pagetitle').textContent=page==='home'?'麦穗宠物店':pages[page];
 $('#cash').textContent=s.cash;$('#page-icon').src=ASSETS['ui-'+page];$('#coin-icon').src=ASSETS['ui-coin'];
 screen.innerHTML=routes[page]?routes[page]():renderCommerce(page,context());
 sceneMotion.mount(screen,page==='home'?'店长':s.species,s.animals);
 $('#jump').value=page;
 document.querySelectorAll('#index [data-v]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.v===page)));
 $('.scroll').scrollTop=resetScroll?0:prev;
}
// History holds view context only. Inventory, money and running jobs stay live.
function currentView(){
 const options={};
 if(page==='rooms'){options.species=s.species;options.roomFilter=s.roomFilter;}
 if(page==='breed')options.species=s.species;
 if(page==='profile')options.selected=s.selected;
 return {page,options,scroll:$('.scroll').scrollTop};
}
function openView(key,options={},scroll=0){
 Object.assign(s,options);
 page=key;
 history.replaceState(null,'','#'+key);
 $('#notice').textContent='';
 display(true);
 $('.scroll').scrollTop=scroll;
}
function navigate(key,options){
 if(!Object.hasOwn(pages,key))return;
 trail.push(currentView());
 openView(key,options);
}
function back(){
 if(page==='home')return;
 const prior=trail.pop();
 if(prior)openView(prior.page,prior.options,prior.scroll);
 else openView('home');
}
function previewPage(key){
 if(!Object.hasOwn(pages,key))return;
 trail.length=0;
 openView(key);
}
function click(a,v,quote){
 // A timer may have elapsed between the displayed quote and the tap.
 finishJobs();
 if(a==='back'){back();return;}
 if(a==='go'&&v==='profile'&&page==='home'){
   const first=animal(s.selected)||s.animals.find(alive)||s.animals[0];
   navigate('profile',{selected:first?.id});return;
 }
 if(a==='go'&&v==='rooms'&&page==='profile'){
   const pet=animal(s.selected);
   if(pet){navigate('rooms',{species:pet.species,roomFilter:alive(pet)?'在养':'已故'});return;}
 }
 if(a==='go'&&v==='market'&&page==='profile'){
   const p=animal(s.selected);
   commerceState(s).selected.market=p&&commerceLive(p,context())?[p.id]:[];
 }
 if(a==='go'){navigate(v);return;}
 if(a==='reset'){s=initial();sceneMotion.reset();previewPage('home');notice('预览已还原');return;}
 if(a==='profile'){const p=animal(v);if(p)navigate('profile',{selected:p.id,species:p.species});return;}
 if(a==='recycle-page'){
   commerceState(s).selected.recycle=animal(v)&&!locked(v)?[v]:[];
   navigate('lab',{labTab:'recycle'});return;
 }
 if(a==='species'&&Object.hasOwn(roomTypes,v)){
   if(v!==s.species){s.species=v;s.pair=[];s.roomFilter='在养';}
   display(true);
   $('.room-sign[aria-pressed="true"]').focus({preventScroll:true});
   return;
 }
 else if(a==='roomfilter')s.roomFilter=v;
 else if(a==='parent'){
   if(s.pair.includes(v))s.pair=s.pair.filter(id=>id!==v);
   else if(s.pair.length<2)s.pair.push(v);else notice('先取消一只亲本再替换');
 }else if(a==='start-breed'){
   const [a,b]=s.pair.map(animal);if(!a||!b||a===b||a.species!==s.species||b.species!==s.species||!adult(a)||!adult(b)||s.jobs[s.species])return;
   s.jobs[s.species]={pair:[a.id,b.id],ends:Date.now()+6500};
   delete s.litters[s.species];
   s.pair=[];
 }else if(a==='again')delete s.litters[s.species];
 else if(a==='model')s.stagePet=v;
 else if(a==='decor'){
   const d=decorItems.find(k=>k.key===v);if(!d)return;
   if(!s.ownedDecor.includes(v)){if(s.cash<d.price){notice('金币不足');return;}s.cash-=d.price;s.ownedDecor.push(v);}
   if(s.placed.includes(v))s.placed=s.placed.filter(k=>k!==v);else s.placed.push(v);
 }else if(!actCommerce(a,v,context(),quote))return;
 display();
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-a]')||e.target.closest('.pc-selectable')?.querySelector('[data-a="pc-choose"]');if(!b||b.disabled)return;
 if(b.closest('#index'))previewPage(b.dataset.v);
 else {
   const {a,v,quote}=b.dataset;
   click(a,v||'',quote);
   if(a==='pc-choose'||a==='pc-choose-all'||a==='pc-clear'){
     const focusAction=a==='pc-clear'?'pc-choose-all':a;
     screen.querySelector('[data-a="'+focusAction+'"][data-v="'+CSS.escape(v)+'"]')?.focus({preventScroll:true});
   }
 }
});
$('#jump').addEventListener('change',e=>previewPage(e.target.value));
$('#index').innerHTML=Object.entries(pages).map(([k,v])=>'<button data-a="go" data-v="'+k+'">'+art('ui-'+k)+v+'</button>').join('');
$('#jump').innerHTML=Object.entries(pages).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('');
function pageFromUrl(){
 const key=location.hash.slice(1);
 previewPage(Object.hasOwn(pages,key)?key:'home');
}
pageFromUrl();
window.addEventListener('hashchange',pageFromUrl);
timer=setInterval(()=>{
 if(finishJobs()){display();return;}
 const job=s.jobs[s.species], remaining=$('#remaining');
 if(job&&remaining)remaining.textContent=Math.max(0,Math.ceil((job.ends-Date.now())/1000))+' 秒';
},220);
