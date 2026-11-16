function breedingCountdown(milliseconds){
  const seconds=Math.max(0,Math.ceil(milliseconds/1000));
  return Math.floor(seconds/60)+' 分 '+String(seconds%60).padStart(2,'0')+' 秒';
}
const RabbitUI = (() => {
  const routes = {firstday:'首日店铺', rabbitcheckin:'每日签到', rabbitbreed:'繁育台', rabbitbirth:'这一窝幼兔', rabbittrade:'出售动物', rabbitpet:'个体档案', rabbitstages:'花色与成长',rabbitorders:'试养订单夹',rabbitguest:'试养来客簿'};
  const stages = ['幼年','成长','成年','老年','已故'];
  const channels = {order:'普通订单',market:'自由市场',recycle:'研究回收',guest:'特殊来客'};
  const ui = {sex:'全部', group:'在养', channel:'order', petId:'', picked:new Set(), parents:new Set(), keeps:new Set(), litterBatch:false, pending:null, receipt:'', stage:0};
  const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clock = ms => new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(ms);
  const number = p => '兔 '+String(p.number).padStart(3,'0');
  const action = (text,k,v='',classes='btn',disabled=false,pressed) => '<button type="button" class="'+classes+'" data-rabbit="'+k+'" data-val="'+esc(v)+'"'+(disabled?' disabled':'')+(pressed===undefined?'':' aria-pressed="'+pressed+'"')+'>'+text+'</button>';
  const foot = (...buttons) => '<div class="rb-actions">'+buttons.join('')+'</div>';
  const section = (name,sub='') => '<div class="rb-heading"><h3>'+name+'</h3><small>'+sub+'</small></div>';
  const pagesHere = route => Object.hasOwn(routes,route);
  function sprite(p,pose=p.stage,floor=false) {
    const base='rb-'+p.breedKey+'-'+String(p.coatIndex).padStart(2,'0')+'-'+(p.sex==='母'?'female':'male');
    let art=base;
    if(pose==='已故') {
      if(p.breedKey==='angora' && p.coatIndex===6) art='spot-dead';
      if(p.breedKey==='angora' && p.coatIndex===1) art='angora-dead';
      if(p.breedKey==='domestic' && p.coatIndex===1) art='brown-dead';
    } else if(p.breedKey==='angora'&&p.coatIndex===6&&pose==='幼年') art='spot';
    const cls=['rb-pet-art','rb-age-'+stages.indexOf(pose),pose==='已故'&&art===base?'rb-rest-pose':''].join(' ');
    const still='<img class="'+cls+'" src="'+(A[art]||A[base]||A.angora)+'" alt="'+esc(p.coat+' · '+pose)+'" draggable="false">';
    return floor?roomWalkArt(art,p,still):still;
  }
  const recent = (s,id) => s.animals.find(p=>p.id===id);
  function stageLine(p){return esc(p.sex+' · '+p.stage+' · '+(p.stage==='已故'?'待回收':p.breedStatus));}
  const seedBadge=p=>p.seedMarked?'<span class="seed-mark">种源</span>':'';
  function specimen(p){return '<span class="rb-thumb seed-photo">'+sprite(p)+seedBadge(p)+'</span>';}
  function row(p,act='pet',selected=false,tail='›'){
    return '<button type="button" class="rb-row'+(selected?' is-picked':'')+'" data-rabbit="'+act+'" data-val="'+esc(p.id)+'"'+(act==='pet'?'':' aria-pressed="'+selected+'"')+'>'+specimen(p)+
      '<span class="rb-id"><strong>'+esc(p.name)+' <small>'+number(p)+'</small></strong><span>'+esc(p.breed+' · '+p.coat)+'</span><span>'+stageLine(p)+'</span></span><b class="rb-row-end">'+tail+'</b></button>';
  }
  function roomScene(pets) {
    return '<div class="rb-room-scene"><img class="rb-ground" src="'+A['rabbit-room']+'" alt="铺有木地板的兔房"><span class="rb-plaque">兔 房</span>'+
      pets.slice(0,3).map((p,i)=>'<button type="button" class="rb-resident r'+i+'" data-rabbit="pet" data-val="'+esc(p.id)+'" aria-label="查看'+esc(p.name)+'">'+sprite(p,p.stage,true)+(p.stage==='已故'?'<small>已故</small>':'')+'</button>').join('')+'</div>';
  }
  function filters(groups) {
    return '<div class="room-filters rb-filters">'+(groups.length>1?RoomBook.dropdown('状态','group',groups,ui,'trade'):'')+
      RoomBook.dropdown('性别','sex',['全部','公','母'],ui,'trade')+'</div>';
  }
  document.addEventListener('change',e=>{
    const key=e.target.dataset.tradeFilter;if(!key)return;
    ui[key]=e.target.value;ui.picked.clear();ui.pending=null;show('rabbittrade',true);
  });
  function filtered(pets) {
    return pets.filter(p=>(ui.sex==='全部'||ui.sex===p.sex) && (ui.group==='已故'?p.stage==='已故':ui.group==='后备种源'?p.seed:ui.group==='可配对'?p.canBreed:ui.group==='在养'?p.stage!=='已故':true));
  }
  function resetFilters(group='在养'){ui.group=group;ui.sex='全部';ui.picked.clear();ui.pending=null;}
  let greetedDay='', bubbleUntil=0;
  function firstDay(s){
    const dest={rooms:['rabbitroom','兔房'],profile:['rabbitcheckin','签到簿'],breed:['rabbitbreed','繁育台'],orders:['rabbittrade','订单夹'],market:['rabbittrade','自由市场'],guest:['rabbittrade','特殊来客']};
    const template=document.createElement('template');template.innerHTML=scene();
    for(const button of template.content.querySelectorAll('[data-go]')){
      const key=button.dataset.go, link=dest[key]; if(!link)continue;
      if(['market','orders','guest'].includes(key)){delete button.dataset.go;button.dataset.rabbit='channel';button.dataset.val={market:'market',orders:'order',guest:'guest'}[key];}else button.dataset.go=link[0];
      button.querySelector('span').textContent=link[1];
    }
    const day=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai'}).format(s.now);
    if(s.canClaim&&greetedDay!==day){greetedDay=day;bubbleUntil=Date.now()+8000;}
    const bubble=template.content.querySelector('.bubble');
    if(bubble&&s.canClaim&&Date.now()<bubbleUntil){bubble.textContent='今天的两只幼兔，可以从签到簿领取。';bubble.dataset.rabbitGreeting='';}
    else bubble?.remove();
    return template.innerHTML;
  }
  let visibleBirthAt=0;
  function trackVisibleParents(s,pet){
    const job=s.job;
    visibleBirthAt=job&&(!pet||pet.id===job.motherId||pet.id===job.fatherId)?Date.now()+job.endsAt-s.now:0;
  }
  function roomParts(s) {
    trackVisibleParents(s);
    const preview=s.mode==='sample';
    return {animals:s.animals, scene:roomScene, row:p=>row(p),
      actions:foot(action('进繁育台','breed','','btn primary'),action('挑选出售','channel',RoomBook.group==='已故'?'recycle':'market')),
      tools:'<div class="rb-tools">'+action(preview?'返回我的试养':'查看 20 只名册样例','mode',preview?'shop':'sample','rb-text')+action('查看成长样板','stages','','rb-text')+'</div>'};
  }
  function checkin(s) {
    const claimed=s.lastClaimIds?.map(id=>recent(s,id)).filter(Boolean)||[];
    const sample=sex=>({breedKey:'domestic',breed:'原色兔',coat:'栗野',coatIndex:1,sex,stage:'幼年'});
    const date=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric'}).format(s.now);
    return '<div class="rb-book"><div class="rb-book-head"><span>兔房收养记录</span><b>'+date+'</b></div><h3>每日签到簿</h3><p>今日可领一对基础原色幼兔。</p>'+
      '<div class="rb-pair">'+['公','母'].map(sex=>'<div>'+sprite(sample(sex))+'<strong>原色幼兔 · '+sex+'</strong></div>').join('')+'</div>'+
      (s.canClaim?action('领养两只幼兔','claim','','btn primary rb-wide'):'<div class="rb-stamp">今日已领取</div>')+'</div>'+
      (s.canClaim?'<p class="rb-note">幼兔约 30 分钟后成年。领养后入住兔房。</p>':section('今日领养',claimed.length?'已登记':'')+
      (claimed.map(p=>row(p)).join('')||'<p class="rb-note">今日领取记录已保留。</p>'))+
      action('查看兔房名册','room','','btn rb-wide');
  }
  function breed(s) {
    if(s.job){
      const pair=[s.job.motherId,s.job.fatherId].map(id=>recent(s,id)).filter(Boolean);
      return roomScene(pair)+section('这窝正在培育','繁育台已占用')+'<div class="rb-book"><p>预计出生</p><h3 data-rabbit-timer>'+breedingCountdown(s.job.endsAt-s.now)+'</h3><small>计划时刻 '+clock(s.job.endsAt)+'</small></div>'+
        foot(action('先回兔房','room'),action('预览出生结果','advance','','btn primary'))+'<p class="rb-note">预览出生会将本次试养时间推进到这窝出生。</p>';
    }
    const options=s.animals.filter(p=>p.canBreed);
    for(const id of [...ui.parents])if(!options.some(p=>p.id===id))ui.parents.delete(id);
    const pair=[...ui.parents].map(id=>recent(s,id));
    const slots=['母','公'].map(sex=>{const p=pair.find(p=>p.sex===sex);return '<div class="rb-slot">'+(p?specimen(p):'<span class="rb-vacant">'+(sex==='母'?'♀':'♂')+'</span>')+'<b>'+esc(p?p.name:'选择'+sex+'兔')+'</b></div>';}).join('<b class="rb-cross">×</b>');
    return '<div class="rb-breed-pair">'+slots+'</div>'+section('选择亲本','成年或老年 · 一公一母')+
      '<div class="rb-list">'+(options.map(p=>row(p,'parent',ui.parents.has(p.id),ui.parents.has(p.id)?'已选':'选择')).join('')||'<p class="rb-empty">当前没有可配对的亲本。</p>')+'</div>'+
      '<div class="rb-dock"><small>兔一生仅能繁育一窝，预计 2 分钟后出生。</small>'+action('核对亲本','review-breed','','btn primary',pair.length!==2)+'</div>'+
      (s.litter?action('查看上一窝','birth','','rb-text'):'');
  }
  function birth(s) {
    const young=(s.litter?.ids||[]).map(id=>recent(s,id)).filter(Boolean);
    if(!s.litter)return section('窝产记录')+'<p class="rb-empty">这家店暂时没有出生记录。</p>'+action('进繁育台','breed','','btn primary rb-wide');
    const candidates=young.filter(p=>!ui.keeps.has(p.id)&&RabbitDemo.eligible('order',p));
    const parents=[s.litter.motherId,s.litter.fatherId].map(id=>recent(s,id)).filter(Boolean);
    return roomScene(young)+section('这一窝',s.litter.ids.length+' 只 · '+clock(s.litter.bornAt)+' 出生')+
      '<p class="rb-note">点选要留下的幼兔，再核对其余可交单个体。</p>'+
      '<div class="rb-list">'+(young.map(p=>row(p,'keep',ui.keeps.has(p.id),ui.keeps.has(p.id)?'✓ 留养':'留养')).join('')||'<p class="rb-empty">这一窝的幼兔均已离店。</p>')+'</div>'+
      section('亲本近况')+parents.map(p=>row(p)).join('')+
      '<div class="rb-dock">'+(ui.keeps.size&&!candidates.length?action('确认留种 · '+ui.keeps.size+' 只','litter-keep','','btn primary'):
        action('挑选交付'+(candidates.length?' · '+candidates.length+' 只':''),'litter-sale','','btn primary',!candidates.length))+'</div>';
  }
  function trade(s) {
    const channel=ui.channel;
    const all=s.animals.filter(p=>RabbitDemo.eligible(channel,p)&&(!ui.litterBatch||s.litter?.ids.includes(p.id)&&!ui.keeps.has(p.id)));
    const pets=filtered(all);
    const rows=pets.map(p=>row(p,'pick',ui.picked.has(p.id),'<span>'+RabbitDemo.price(channel,p)+' 币</span><i>'+(ui.picked.has(p.id)?'✓ 已选':'选择')+'</i>')).join('');
    const chosen=all.filter(p=>ui.picked.has(p.id));
    const total=chosen.reduce((n,p)=>n+RabbitDemo.price(channel,p),0);
    const detail=channel==='order'?(s.order?.title||'街坊的兔子订单')+' · '+(s.orderReadyAt>s.now?'等待补单':s.order?.condition||'要求兔子'):channel==='guest'?'来客需求按品种、阶段和性格核对':channel==='recycle'?'研究所仅回收已故动物。':'收购空闲活体';
    return (previewNav.local?'':'<div class="rb-channels">'+Object.entries(channels).map(([k,v])=>'<button data-rabbit="channel" data-val="'+k+'" aria-pressed="'+(k===channel)+'">'+v+'</button>').join('')+'</div>')+
      section(channels[channel],all.length+' 只合格')+'<p class="rb-note">'+esc(detail)+'</p>'+
      filters(channel==='recycle'?['已故']:['在养','后备种源','可配对'])+
      '<div class="rb-list">'+(rows||'<p class="rb-empty">当前没有符合条件的兔子。</p>')+'</div>'+
      '<div class="rb-dock"><div><span>已选 '+chosen.length+' 只 · 合计 '+total+' 金币</span>'+action('清空选择','clear','','rb-text',!ui.picked.size)+'</div><div class="sale-buttons">'+action('全选本页','all','','btn',!pets.length)+action('核对'+(channel==='recycle'?'回收':'交付'),'review-sale','','btn primary',!chosen.length)+'</div></div>';
  }
  function profile(s) {
    const p=ui.petId?recent(s,ui.petId):s.animals[0];
    if(!p)return '<p class="rb-empty">这只动物已离开名册。</p>';
    trackVisibleParents(s,p);
    return animalCard('兔房',number(p),p,'<span class="seed-photo">'+sprite(p)+seedBadge(p)+'</span>',p.breed+' · '+p.coat,stageLine(p),p.traits)+
      (p.mixed?'<p class="rb-note">外形：'+careCatalog.breeds[p.breedKey].name+' · '+p.coat+'</p>':'')+
      '<p class="rb-note">来源：'+esc(p.source)+'</p>'+
      (p.seedMarked?'<p class="rb-note">'+(p.stage==='已故'?'已留种，取消留种后可交给研究所回收。':'已留种，出售前请先取消留种。')+'</p>':'')+
      '<div class="profile-actions">'+(p.stage!=='已故'||p.seedMarked?action(p.seedMarked?'取消留种':'留种','seed',p.id,'btn',false,!!p.seedMarked):'')+
      action('成长样板','stages')+(RabbitDemo.eligible('market',p)?action('前往自由市场','market-pet',p.id):RabbitDemo.eligible('recycle',p)?action('前往研究所回收','recycle-pet',p.id):'')+'</div>';
  }
  function stagePage() {
    const p={breedKey:'angora',coatIndex:6,sex:'母',coat:'黑白花斑'};
    const descriptions=['出生至 12 分钟','12 分钟起 · 距成年 18 分钟','30 分钟起 · 可选择未繁育亲本','成年满 3 天后 · 未繁育仍可配对','寿命耗尽 · 仅可交给研究所'];
    return '<div class="rb-book"><div class="rb-book-head"><span>动物图鉴</span><b>安哥拉兔</b></div><div class="rb-plate">'+sprite(p,stages[ui.stage])+'</div><h3>黑白花斑 · '+stages[ui.stage]+'</h3><p>'+descriptions[ui.stage]+'</p></div>'+
      '<div class="rb-age-tabs">'+stages.map((name,i)=>'<button data-rabbit="stage" data-val="'+i+'" aria-pressed="'+(i===ui.stage)+'">'+name+'</button>').join('')+'</div>'+action('回到名册','room','','btn rb-wide');
  }
  function dialog(heading,body,yes,act){
    let d=document.querySelector('#rb-dialog');
    if(!d){d=document.createElement('dialog');d.id='rb-dialog';d.setAttribute('aria-labelledby','rb-dialog-title');document.querySelector('.phone').append(d);}
    d.innerHTML='<div class="spread"><h3 id="rb-dialog-title">'+heading+'</h3><button type="button" class="rb-text" data-nav-close>关闭</button></div><div class="rb-dialog-body">'+body+'</div>'+foot(action(act==='commit-breed'?'修改亲本':'修改选择','close'),action(yes,act,'','btn primary'));
    if(!d.open)d.showModal();
  }
  const close = ()=>document.querySelector('#rb-dialog')?.close();
  function notice(msg){const el=document.querySelector('#rb-notice');el.textContent=msg;clearTimeout(notice.timer);notice.timer=setTimeout(()=>{el.textContent='';},3200);}
  function openChannel(channel,local=false,selected=''){
    ui.channel=channel;ui.litterBatch=false;ui.receipt='';resetFilters(channel==='recycle'?'已故':'在养');
    if(selected)ui.picked.add(selected);
    const route=!local&&channel==='order'?'rabbitorders':!local&&channel==='guest'?'rabbitguest':'rabbittrade';
    show(route,false,'forward',{channel,local,switchFunction:!local});
  }
  function handle(btn){
    const k=btn.dataset.rabbit,v=btn.dataset.val,s=RabbitDemo.read();
    const refresh=()=>show(displayedPage,true);
    if(k==='close'){close();return;}
    if(k==='room'){resetFilters();show('rabbitroom');return;}
    if(k==='mode'){RabbitDemo.useSample(v==='sample');resetFilters();RoomBook.reset();ui.keeps.clear();ui.parents.clear();ui.litterBatch=false;ui.petId='';ui.receipt='';show(displayedPage);return;}
    if(k==='channel'||k==='market-pet'||k==='recycle-pet'||k==='fulfill'){
      const fromPet=k==='market-pet'||k==='recycle-pet',channel=fromPet?k.split('-')[0]:v,local=k==='fulfill'||displayedPage==='rooms'&&k==='channel';
      if(fromPet&&!RabbitDemo.eligible(channel,recent(s,v)))return;
      return openChannel(channel,local,fromPet?v:'');
    }
    if(k==='pet'){ui.petId=v;show('rabbitpet');return;}
    if(k==='seed'){const marked=btn.getAttribute('aria-pressed')!=='true',r=RabbitDemo.setSeedMark(v,marked);if(r.ok&&marked)ui.picked.delete(v);refresh();notice(r.ok?(marked?'已标记留种。':'已取消留种。'):r.error);return;}
    if(k==='breed'){ui.parents.clear();show('rabbitbreed');return;}
    if(k==='birth'){show('rabbitbirth');return;}
    if(k==='stages'){show('rabbitstages');return;}
    if(k==='stage'){ui.stage=Number(v);refresh();return;}
    if(k==='claim'){const result=RabbitDemo.claim();refresh();notice(result.ok?'两只后备幼兔已入住兔房。':result.error);return;}
    if(k==='parent'){
      if(ui.parents.has(v))ui.parents.delete(v);
      else{const p=recent(s,v);if(!p?.canBreed)return;for(const id of ui.parents)if(recent(s,id)?.sex===p.sex)ui.parents.delete(id);ui.parents.add(v);}
      refresh();return;
    }
    if(k==='review-breed'){const pair=[...ui.parents].map(id=>recent(s,id));if(pair.length===2&&pair.every(Boolean)){const pred=RabbitDemo.pairing(...pair);dialog('确认这对亲本', '<p>'+pair.map(p=>esc(p.name)+' · '+p.sex).join('　×　')+'</p><strong>后代预计登记品种：'+pred.breed+'</strong>'+(pred.different?'<p>每只幼兔独立随机继承父方或母方的品种外形，花色另行判定。</p>':'')+'<p>开始后无法撤回。幼兔出生后，亲本留在房间并自动取消留种，终生繁育机会已使用。</p>','开始繁育','commit-breed');}return;}
    if(k==='commit-breed'){const r=RabbitDemo.startBreed(...ui.parents);close();refresh();if(!r.ok)notice(r.error);else ui.keeps.clear();return;}
    if(k==='advance'){const r=RabbitDemo.previewBirth();if(!r.ok&&!RabbitDemo.read().litter){refresh();notice(r.error);return;}show('rabbitbirth');return;}
    if(k==='keep'||k==='pick'){const set=k==='keep'?ui.keeps:ui.picked;set.has(v)?set.delete(v):set.add(v);refresh();return;}
    if(k==='litter-keep'){const r=RabbitDemo.keepLitter(ui.keeps);refresh();notice(r.ok?'已标记留种。':r.error);return;}
    if(k==='litter-sale'){ui.channel='order';ui.litterBatch=true;resetFilters();ui.receipt='';(s.litter?.ids||[]).forEach(id=>{const p=recent(s,id);if(p&&!ui.keeps.has(id)&&RabbitDemo.eligible('order',p))ui.picked.add(id);});show('rabbittrade',false,'forward',{local:true});return;}
    if(k==='all'){filtered(s.animals.filter(p=>RabbitDemo.eligible(ui.channel,p)&&(!ui.litterBatch||s.litter?.ids.includes(p.id)&&!ui.keeps.has(p.id)))).forEach(p=>ui.picked.add(p.id));refresh();return;}
    if(k==='clear'){ui.picked.clear();refresh();return;}
    if(k==='review-sale'){const q=RabbitDemo.quote(ui.channel,[...ui.picked]);if(!q.ok){refresh();notice(q.error);return;}ui.pending=q;
      dialog('核对'+channels[ui.channel],'<div class="rb-quote">'+q.lines.map(l=>'<div><span>'+esc(l.name)+' · '+number(recent(s,l.id))+'</span><b>'+l.price+' 金币</b></div>').join('')+'</div><p class="rb-total">合计 '+q.total+' 金币</p>'+q.warnings.map(w=>'<p class="rb-warning">'+esc(w)+'</p>').join(''),'确认'+(ui.channel==='recycle'?'回收':'交付')+' '+q.lines.length+' 只','commit-sale');return;
    }
    if(k==='commit-sale'){const q=ui.pending;if(!q)return;ui.pending=null;const r=RabbitDemo.sell(q,ui.litterBatch?ui.keeps:[]);close();ui.picked.clear();if(r.ok)ui.litterBatch=false;ui.receipt=r.ok?'已交付 '+q.lines.length+' 只，收入 '+q.total+' 金币'+(r.xp?'，店铺经验 +'+r.xp:'')+'。'+(r.level>r.levelBefore?'店铺升至 '+r.level+' 级。':''):r.error;if(r.ok)previewNav.completed();else refresh();notice(ui.receipt);}
  }
  function install(pages,names){
    const views={firstday:firstDay,rabbitcheckin:checkin,rabbitbreed:breed,rabbitbirth:birth,rabbittrade:trade,rabbitpet:profile,rabbitstages:stagePage};
    views.rabbitorders=s=>section('试养订单夹')+card(s.order?.title||'街坊的兔子订单','<p>'+esc(s.order?.condition||'本槽等待补单。')+'</p>')+action('选择交付动物','fulfill','order','btn primary',s.orderReadyAt>s.now);
    views.rabbitguest=()=>section('试养来客簿')+note('按来客的品种、阶段和性格要求选择动物。')+action('选择交付动物','fulfill','guest','btn primary');
    Object.assign(names,routes);
    for(const [k,view] of Object.entries(views))pages[k]=()=>view(RabbitDemo.read());
  }
  function tick(){
    if(Date.now()>=bubbleUntil)document.querySelector('[data-rabbit-greeting]')?.remove();
    if(visibleBirthAt&&Date.now()>=visibleBirthAt&&(displayedPage==='rabbitpet'||(displayedPage==='rooms'&&RoomBook.isTrial()))){
      visibleBirthAt=0;show(displayedPage,true);return;
    }
    const timer=document.querySelector('[data-rabbit-timer]');
    if(!timer)return;
    const s=RabbitDemo.read();
    const value=breedingCountdown(s.job?s.job.endsAt-s.now:0);
    if(timer.textContent!==value)timer.textContent=value;
    if(!s.job&&s.litter&&!document.querySelector('dialog[open],#modal:not([hidden])'))show('rabbitbirth');
  }
  function remember(){return {mode:RabbitDemo.read().mode,sex:ui.sex,group:ui.group,channel:ui.channel,petId:ui.petId,picked:[...ui.picked],parents:[...ui.parents],keeps:[...ui.keeps],litterBatch:ui.litterBatch,stage:ui.stage};}
  function restore(view){
    if(!view||view.mode!==RabbitDemo.read().mode)return;
    ui.sex=view.sex;ui.group=view.group;ui.channel=view.channel;ui.petId=view.petId;ui.stage=view.stage;
    const pets=RabbitDemo.read().animals;
    ui.parents=new Set((view.parents||[]).filter(id=>pets.some(p=>p.id===id&&p.canBreed)));
    ui.keeps=new Set((view.keeps||[]).filter(id=>pets.some(p=>p.id===id)));ui.litterBatch=!!view.litterBatch;
    ui.picked=new Set(view.picked.filter(id=>pets.some(p=>p.id===id&&RabbitDemo.eligible(ui.channel,p))));
  }
  return {install,handle,tick,pagesHere,notice,resetFilters,remember,restore,roomParts,openChannel,get channel(){return ui.channel;},discardQuote:()=>{ui.pending=null;}};
})();
