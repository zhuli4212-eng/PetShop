const RoomBook = (() => {
  const groups=['在养','后备种源','可配对','已故'], sexes=['全部','公','母'];
  const state={origin:'demo',group:'在养',sex:'全部'};
  const reset=()=>{state.group='在养';state.sex='全部';};
  const restore=s=>{if(s){Object.assign(state,{origin:s.origin,group:s.group,sex:s.sex});species=s.species;}};
  const remember=()=>({...state,species});
  const isTrial=()=>species==='兔'&&state.origin==='trial';
  function switchTo(s,origin=state.origin){species=s;state.origin=origin;reset();}
  function match(p){return (state.sex==='全部'||p.sex===state.sex)&&(state.group==='已故'?p.stage==='已故':state.group==='后备种源'?p.seed:state.group==='可配对'?p.canBreed:p.stage!=='已故');}
  function dropdown(name,key,options,model=state,scope='room'){
    return '<label><span>'+name+'</span><select data-'+scope+'-filter="'+key+'" aria-label="'+name+'筛选">'+options.map(v=>'<option'+(model[key]===v?' selected':'')+'>'+v+'</option>').join('')+'</select></label>';
  }
  function demoScene(pets){
    const src=DotFlows.roomOpen(species)?{'兔':'rabbit-room','猫':'cat-room','狗':'dog-room'}[species]:'unfinished-room';
    const residents=pets.slice(0,3).map((p,i)=>{
      const key=salePetArt(p),age=['幼年','成长','成年','老年','已故'].indexOf(p.stage);
      const pose=roomWalkArt(key,p,img(key,'rb-pet-art rb-age-'+age));
      return '<button type="button" class="rb-resident r'+i+'" data-sale="profile" data-key="'+p.id+'" aria-label="查看'+p.name+'">'+pose+(p.stage==='已故'?'<small>已故</small>':'')+'</button>';
    });
    return '<div class="rb-room-scene"><img class="rb-ground" src="'+A[src]+'" alt="'+species+'房"><span class="rb-plaque">'+species+' 房</span>'+
      residents.join('')+'</div>';
  }
  function stock(){
    return [...saleState.stock.values()].filter(p=>p.species===species).map(p=>{
      const seed=p.stage!=='已故'&&!p.bred&&!p.breeding;
      return {...p,seed,canBreed:seed&&['成年','老年'].includes(p.stage)};
    });
  }
  function saleRow(p){
    const label=p.stage==='已故'?'待回收':p.breeding?'繁育中':p.bred?'已繁育':'未繁育';
    return '<button type="button" class="rb-row" data-sale="profile" data-key="'+p.id+'"><span class="rb-thumb">'+salePetThumb(p)+'</span><span class="rb-id"><strong>'+p.name+' <small>#'+p.id+'</small></strong><span>'+p.breed+(p.coat?' · '+p.coat:'')+'</span><span>'+p.sex+' · '+p.stage+' · '+label+'</span></span><b class="rb-row-end">›</b></button>';
  }
  function tabs(){
    return '<div class="tabs room-doors">'+['兔','猫','狗'].map(s=>'<button type="button" class="btn'+(species===s?' primary':'')+'" data-species="'+s+'" aria-pressed="'+(s===species)+'" aria-label="'+s+'房'+(DotFlows.roomOpen(s)?'':'，未开放')+'">'+(DotFlows.roomOpen(s)?'':img('ui-node-lock-24-v2','room-lock'))+s+'房</button>').join('')+'</div>';
  }
  function render(){
    if(!DotFlows.roomOpen(species))return tabs()+demoScene([])+DotFlows.lockedRoom(species);
    const part=isTrial()?RabbitUI.roomParts(RabbitDemo.read()):{animals:stock(),scene:demoScene,row:saleRow,actions:'<div class="rb-actions">'+b('进繁育台','roombreed',true)+b('挑选出售','roomsell')+'</div>',tools:''};
    const pets=part.animals.filter(match);
    // Filtering by sex/eligibility only changes the book; the room itself stays occupied.
    const residents=part.animals.filter(p=>state.group==='已故'?p.stage==='已故':p.stage!=='已故');
    return tabs()+part.scene(residents)+'<div class="rb-heading"><h3>'+species+'房名册</h3><small>'+part.animals.length+' 只登记</small></div>'+part.actions+
      '<div class="room-filters">'+dropdown('状态','group',groups)+dropdown('性别','sex',sexes)+'</div><div class="rb-list">'+(pets.map(part.row).join('')||'<p class="rb-empty">当前筛选下没有动物。</p>')+'</div>'+part.tools;
  }
  function sell(){
    const channel=state.group==='已故'?'recycle':'market';
    startSelection(channel);
    return title(species+'房 · '+saleChannels[channel].title)+salePanel(channel,species);
  }
  const pair=new Set(), breedingExamples=new Map(exampleSave.jobs||[]);
  function settleExamples(now){
    const completed=[];
    for(const job of breedingExamples.values()){
      if(job.done||now<job.endsAt)continue;
      job.done=true;
      for(const p of job.offspring||[])saleState.stock.set(p.id,p);
      for(const id of job.ids){
        const p=saleState.stock.get(id);
        if(p){p.breeding=false;p.bred=true;p.seedMarked=false;completed.push(p);}
      }
    }
    return completed;
  }
  function tick(){
    const now=Date.now(),completed=settleExamples(now);
    if(completed.some(p=>(displayedPage==='profile'&&p.id===saleState.profileId)||(displayedPage==='rooms'&&!isTrial()&&p.species===species))){
      show(displayedPage,true);return;
    }
    const timer=document.querySelector('[data-example-breed-timer]');
    if(!timer)return;
    const job=breedingExamples.get(species);
    if(!job)return;
    const value=breedingCountdown(job.endsAt-now);
    if(timer.textContent!==value)timer.textContent=value;
    if(job.done&&!document.querySelector('dialog[open],#modal:not([hidden])'))show('roombreed',true);
  }
  function breed(){
    const pets=stock().filter(p=>p.canBreed);
    const job=breedingExamples.get(species);
    if(job){
      if(job.done)return title(species+'房 · 繁育完成')+card('这窝已完成培育','<p>'+job.names+'</p>'+(job.offspring?.length?'登记品种：'+job.offspring[0].breed:''))+
        (job.offspring||[]).map(p=>saleState.stock.has(p.id)?saleRow({...p,coat:p.appearance+' · '+p.coat}):'<p>'+p.name+' · '+p.breed+' · 外形 '+p.appearance+' · 已离店</p>').join('')+
        '<button class="btn primary" data-pair="again">继续选择亲本</button>'+b('查看动物房间','rooms');
      return title('这窝正在培育','繁育台已占用')+'<div class="rb-book"><p>预计出生</p><h3 data-example-breed-timer>'+breedingCountdown(job.endsAt-Date.now())+'</h3><small>'+job.names+'</small></div>'+b('查看动物房间','rooms');
    }
    const selected=pets.filter(p=>pair.has(p.id));
    const slots=['母','公'].map(sex=>{const p=selected.find(a=>a.sex===sex);return '<div class="rb-slot">'+(p?salePetThumb(p):'<span class="rb-vacant">'+sex+'</span>')+'<b>'+(p?p.name:'选择'+sex+'本')+'</b></div>';}).join('<b>×</b>');
    return title(species+'房 · 繁育台','成年或老年 · 一公一母')+'<div class="rb-breed-pair">'+slots+'</div><div class="rb-list">'+
      (pets.map(p=>'<button type="button" class="rb-row" data-pair="pick" data-key="'+p.id+'" aria-pressed="'+pair.has(p.id)+'">'+salePetThumb(p)+'<b>'+p.name+' · '+p.sex+'</b><span>'+(pair.has(p.id)?'已选':'选择')+'</span></button>').join('')||'<p class="rb-empty">当前没有可配对的亲本。</p>')+
      '</div><button class="btn primary" data-pair="review"'+(selected.length===2?'':' disabled')+'>核对亲本</button>';
  }
  function handlePair(el){
    if(el.dataset.pair==='again'&&breedingExamples.get(species)?.done){
      breedingExamples.delete(species);return show('roombreed',true);
    }
    const pets=stock().filter(p=>p.canBreed),p=pets.find(a=>a.id===el.dataset.key);
    if(el.dataset.pair==='pick'&&p){
      if(pair.has(p.id))pair.delete(p.id);else{for(const a of pets)if(a.sex===p.sex)pair.delete(a.id);pair.add(p.id);}
      return show(displayedPage,true);
    }
    const parents=pets.filter(a=>pair.has(a.id));
    if(parents.length!==2)return;
    if(el.dataset.pair==='review')return DotFlows.pairReview(parents);
    if(el.dataset.pair==='commit'){
      const endsAt=Date.now()+Object.values(careCatalog.species).find(c=>c.name===species).wait*60000;
      breedingExamples.set(species,{ids:parents.map(a=>a.id),names:parents.map(a=>a.name).join(' × '),endsAt,offspring:RabbitDemo.exampleBabies(parents,endsAt),done:false});
      for(const a of parents)saleState.stock.get(a.id).breeding=true;
      pair.clear();previewNav.completed();
    }
  }
  document.addEventListener('change',e=>{
    const key=e.target.dataset.roomFilter;if(!key)return;
    state[key]=e.target.value;show('rooms');
  });
  return {render,sell,breed,tick,settleExamples,handlePair,saveJobs:()=>[...breedingExamples],resetPair:()=>pair.clear(),switchTo,remember,restore,reset,isTrial,dropdown,get group(){return state.group;}};
})();
