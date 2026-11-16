const DotResearch = (() => {
  const branches = [
    {name:'稀有标签研究', short:'稀有标签', art:'item-trait-review-128-v2'},
    {name:'六维选育研究', short:'六维选育', art:'item-breeding-guidance-128-v2'},
    {name:'繁育后价值研究', short:'繁育后价值', art:'ui-market'}
  ];
  const examples = {
    normal:{label:'可研究', levels:[3,3,3]}, prereq:{label:'前置不足', levels:[3,0,0]},
    funds:{label:'金币不足', levels:[3,3,3]}, locked:{label:'房间未开放', levels:[0,0,0]},
    max:{label:'全部满级', levels:[10,10,10]}
  };
  const speciesArt = {兔:'angora', 猫:'british', 狗:'shiba'};
  const unitCost = {兔:100, 猫:250, 狗:400};
  const records = {};
  let kind='兔', branch=0, originBranch=0, controlsOpen=false;
  function exampleRecord(key) {
    return {key, levels:[...examples[key].levels], feedback:{}};
  }
  for (const animal of Object.keys(speciesArt)) records[animal]=exampleRecord(animal==='兔'?'normal':'locked');
  const record=()=>records[kind];
  const benefit=(index,level)=>previewResearchBenefit(index,level,kind);
  function prerequisites(index, target) {
    const indices=target<=3?[]:target<=6?[(index+1)%3]:[0,1,2].filter(i=>i!==index);
    return indices.map(i=>({index:i, needed:target-3, actual:record().levels[i]}));
  }
  function availability(index) {
    const {levels,key,feedback}=record(), current=levels[index];
    if(key==='locked') return '房间未开放';
    if(current>=10) return '已满级';
    if(feedback[index]?.type==='unknown') return '结果待确认';
    if(prerequisites(index,current+1).some(r=>r.actual<r.needed)) return '前置不足';
    if(key==='funds') return '金币不足';
    return '可研究';
  }
  function button(action,key,label,css='btn',attrs='') {
    return '<button type="button" class="'+css+'" data-research="'+action+'" data-key="'+key+'" '+attrs+'>'+label+'</button>';
  }
  function rankBar(level) {
    return '<span class="dr-ranks" aria-hidden="true">'+Array.from({length:10},(_,i)=>'<i'+(i<level?' class="on"':'')+'></i>').join('')+'</span>';
  }
  function branchRow(info,i) {
    const level=record().levels[i], status=availability(i),infoAtLevel=benefit(i,level);
    const text='<span class="dr-icon">'+img(info.art,'')+'</span><span class="dr-node-copy"><strong>'+
      info.name+'</strong><small>'+infoAtLevel.overview+'</small>'+rankBar(level)+'</span>'+
      '<span class="dr-node-end"><b>'+level+'<small> / 10</small></b><small class="'+(status==='可研究'?'ready':'')+'">'+status+' ›</small></span>';
    return button('node',i,text,'dr-node','aria-label="查看'+kind+'的'+info.name+'，'+status+'"');
  }
  function render() {
    const {levels,key}=record(), sum=levels.reduce((a,b)=>a+b,0);
    const tabs=Object.keys(speciesArt).map(s=>button('species',s,img(speciesArt[s],'')+'<span>'+s+'房</span>',
      'dr-tab','aria-pressed="'+(s===kind)+'"')).join('');
    const cases=Object.entries(examples).map(([v,e])=>button('case',v,e.label,'dr-case','aria-pressed="'+(v===key)+'"')).join('');
    return '<section class="dr-lab"><div class="dr-scene">'+img('lab','')+'<span>研究台</span></div>'+labTabs('research')+
      '<nav class="dr-tabs" aria-label="研究物种">'+tabs+'</nav>'+
      '<div class="dr-ledger"><div class="dr-ledger-head"><h3>'+kind+'房研究手册</h3><b>'+sum+' / 30 级</b></div>'+
      '<div class="dr-status">'+(key==='locked'?'房间开放后即可研究，可先查看分支效果。':'永久研究 · 仅对本物种生效')+'</div>'+
      '<div class="dr-branches">'+branches.map(branchRow).join('')+'</div></div>'+
      '<details class="dr-examples"'+(controlsOpen?' open':'')+'><summary>预览研究状态 <small>'+examples[key].label+'</small></summary>'+
      '<div class="dr-cases">'+cases+'</div><p>切换本物种的示例进度。研究演示不扣金币。</p></details>'+
      '<dialog class="dr-dialog" aria-labelledby="dr-title"></dialog></section>';
  }
  function table() {
    const labels=benefit(branch,0);
    const rows=Array.from({length:11},(_,i)=>{
      const effect=benefit(branch,i);
      return '<tr'+(i===record().levels[branch]?' class="current"':'')+'><th scope="row">'+i+
        (i===record().levels[branch]?' · 当前':'')+'</th><td>'+effect.currentBonus+'</td><td>'+effect.currentValue+'</td></tr>';
    }).join('');
    return '<details class="dr-table"><summary>查看 0–10 级效果</summary><table><thead><tr><th scope="col">等级</th><th scope="col">'+
      labels.bonusLabel+'</th><th scope="col">'+labels.valueLabel+'</th></tr></thead><tbody>'+rows+'</tbody></table></details>';
  }
  function conditions(target) {
    const reqs=prerequisites(branch,target);
    let html='<h4>升级条件</h4><p class="dr-condition">本分支 '+record().levels[branch]+' / '+(target-1)+' 级 · 已满足</p>';
    if(record().key==='locked') html+='<p class="dr-alert">先开放'+kind+'房，这个物种的研究才可升级。</p>';
    for(const req of reqs) {
      html+='<div class="dr-cross"><span><b>'+branches[req.index].short+'</b><small>'+req.actual+' / '+req.needed+
        ' 级 · '+(req.actual>=req.needed?'已满足':'还差 '+(req.needed-req.actual)+' 级')+'</small></span>'+
        button('prereq',req.index,'查看前置','btn')+'</div>';
    }
    if(!reqs.length) html+='<p class="dr-muted">此级无跨分支前置。</p>';
    return html;
  }
  function fee(level) {
    return '<div class="dr-fee"><span>'+img('ui-coin','')+'基准费用试算</span><strong>'+
      (unitCost[kind]*level*level).toLocaleString('zh-CN')+' 金币</strong></div><p class="dr-muted">费用待平衡，演示不扣金币。</p>';
  }
  function compare(effect,from,to) {
    return '<div class="dr-bonus-label">'+effect.bonusLabel+'</div><div class="dr-compare"><div><small>当前 · '+from+' 级</small><b>'+effect.currentBonus+
      '</b></div><span aria-hidden="true">→</span><div><small>下级 · '+to+' 级</small><b>'+effect.nextBonus+'</b></div></div>'+
      '<div class="dr-benefit"><b>'+effect.delta+'</b><p>'+effect.example+'</p>'+(effect.switchNote?'<small>'+effect.switchNote+'</small>':'')+'</div>';
  }
  function feedbackView(fb) {
    const action=fb.type;
    if(action==='unknown') return '<div class="dr-alert" role="status"><b>研究结果待确认</b><p>保留本次研究，请查询结果。</p></div>'+
      button('query',branch,'查询本次结果','btn primary');
    if(action==='fail') return '<div class="dr-alert" role="status"><b>研究未完成</b><p>等级仍为 '+fb.from+'，本次未扣金币。</p></div>'+
      button('review',branch,'重新核对','btn');
    const gained=benefit(branch,fb.from);
    return '<div class="dr-success" role="status"><b>研究加成已生效 · 演示</b><p>'+branches[branch].short+' '+fb.from+' → '+(fb.from+1)+
      ' 级。'+gained.example+'</p></div>'+
      button('continue',branch,'查看当前等级','btn primary');
  }
  function head() {
    return '<header class="dr-detail-head"><div><small>'+kind+'房研究手册</small><h3 id="dr-title">'+branches[branch].name+'</h3></div>'+
      button('close','','关闭','dr-close','aria-label="关闭研究详情"')+'</header>';
  }
  function content(view) {
    const current=record().levels[branch], status=availability(branch), target=current+1,effect=benefit(branch,current);
    let inner=head()+'<div class="dr-detail-body">';
    if(view==='receipt') return inner+feedbackView(record().feedback[branch])+'</div>';
    if(view==='review') return inner+compare(effect,current,target)+fee(target)+
      '<fieldset class="dr-choice"><legend>选择预览结果</legend><label><input type="radio" name="dr-outcome" value="success" checked>成功</label>'+
      '<label><input type="radio" name="dr-outcome" value="fail">失败</label><label><input type="radio" name="dr-outcome" value="unknown">待确认</label></fieldset>'+
      '<div class="dr-actions">'+button('detail',branch,'返回详情')+button('submit',branch,'模拟提交','btn primary')+'</div></div>';
    inner+='<p>'+effect.description+'</p>'+ (current<10?compare(effect,current,target):'<div class="dr-max"><b>已满级</b><strong>'+
      effect.currentBonus+'</strong></div><p>'+effect.overview+'</p>');
    if(current<10) inner+=conditions(target)+fee(target);
    inner+=table();
    let primary='';
    if(status==='可研究') primary=button('review',branch,'核对升级','btn primary');
    else if(status==='结果待确认') primary=button('receipt',branch,'查询研究进度','btn primary');
    else if(current<10) primary='<button type="button" class="btn" disabled>'+status+'</button>';
    return inner+'<div class="dr-actions">'+button('back','','返回'+(branch!==originBranch?'原分支':'手册'))+primary+'</div></div>';
  }
  let activeView='detail';
  function drawDialog(view) {
    const dlg=document.querySelector('.dr-dialog');
    if(!dlg) return;
    activeView=view; dlg.innerHTML=content(view);
    const actions=dlg.querySelector('.dr-actions')||dlg.querySelector('.dr-detail-body > button:last-child');
    if(actions){actions.classList.add('dr-fixed-actions');dlg.append(actions);}
    if(!dlg.open) {
      dlg.onclose=()=>{
        const section=document.querySelector('.dr-lab');
        if(section) section.querySelector('.dr-branches').innerHTML=branches.map(branchRow).join('');
        if(section) section.querySelector('.dr-ledger-head b').textContent=record().levels.reduce((a,b)=>a+b,0)+' / 30 级';
        section?.querySelector('[data-research="node"][data-key="'+branch+'"]')?.focus({preventScroll:true});
      };
      dlg.showModal();
    }
    dlg.scrollTop=0;
    dlg.querySelector('h3')?.setAttribute('tabindex','-1');
    dlg.querySelector('h3')?.focus({preventScroll:true});
  }
  function handle(btn) {
    const {research:action,key}=btn.dataset, q=document.querySelector('.dr-dialog');
    if(action==='species'||action==='case') {
      controlsOpen=Boolean(document.querySelector('.dr-examples')?.open);
      if(action==='species' && Object.hasOwn(speciesArt,key)) kind=key;
      if(action==='case' && Object.hasOwn(examples,key)) records[kind]=exampleRecord(key);
      show('research',true);
      document.querySelector('[data-research="'+action+'"][data-key="'+key+'"]')?.focus({preventScroll:true});
      return;
    }
    if(action==='node') {originBranch=branch=Number(key);drawDialog(record().feedback[branch]?'receipt':'detail');return;}
    if(!q?.open) return;
    if(action==='close') {goBack();return;}
    if(action==='back') {if(branch===originBranch){goBack();return;} branch=originBranch; drawDialog('detail'); return;}
    if(action==='prereq') {branch=Number(key);drawDialog('detail');return;}
    if(action==='detail') {drawDialog('detail');return;}
    if(action==='review' && availability(branch)==='可研究') {drawDialog('review');return;}
    if(action==='receipt' && record().feedback[branch]) {drawDialog('receipt');return;}
    if(action==='continue') {delete record().feedback[branch];drawDialog('detail');return;}
    if(action==='query' && record().feedback[branch]?.type==='unknown') {
      record().feedback[branch].type='success';record().levels[branch]++;drawDialog('receipt');return;
    }
    if(action==='submit' && activeView==='review' && availability(branch)==='可研究') {
      const type=q.querySelector('input[name="dr-outcome"]:checked').value;
      const from=record().levels[branch];
      record().feedback[branch]={type,from};
      if(type==='success') record().levels[branch]++;
      drawDialog('receipt');
    }
  }
  return {render,handle};
})();
