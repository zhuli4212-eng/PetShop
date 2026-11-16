/* Dot's order, room and contest sheets share the inventory of the pixel UI preview. */
const DotFlows = (() => {
  const orderInfo = {
    neighbors:['街坊的委托','收购兔子，年龄不限。','简单','1.35'],
    bookstore:['书店的伙伴','收购性格温顺的兔子。','中等','1.55'],
    lookout:['园丁的委托','收购狮子兔，年龄不限。','难','1.80']
  };
  const packs = {
    cat:{room:'猫房',breed:'英国短毛猫',art:'british',cost:3000,minutes:90,species:'猫',value:960,salvage:72,coat:'蓝灰'},
    dog:{room:'狗房',breed:'柴犬',art:'shiba',cost:20000,minutes:120,species:'狗',value:1040,salvage:78,coat:'赤色'}
  };
  const tiers = [['laurel','桂冠'],['gold','金奖'],['silver','银奖'],['bronze','铜奖'],['memorial','纪念']];
  const namesByTier = [['松风','小山'],['青石','雨巷'],['苔庭','林间邮局'],['晴窗','橡果'],['南街','白桦']];
  const state = {
    free:3,paid:0,bought:0,day:'',until:{},cancelled:new Set(),packReceipts:{},
    tab:'public',tier:'gold',list:'list',book:'public',receipt:null,seq:0
  };
  if(exampleSave.flows)Object.assign(state,exampleSave.flows,{cancelled:new Set(exampleSave.flows.cancelled||[])});
  function saveState(){
    const {free,paid,bought,day,until,packReceipts,cancelled}=state;
    return {free,paid,bought,day,until,packReceipts,cancelled:[...cancelled]};
  }
  const button=(text,action,key='',primary=false,disabled=false)=>
    '<button type="button" class="btn'+(primary?' primary':'')+'" data-dot="'+action+'" data-key="'+key+'"'+(disabled?' disabled':'')+'>'+text+'</button>';
  const line=(label,value)=>'<div class="df-line"><span>'+label+'</span><b>'+value+'</b></div>';
  const actions=(...bits)=>'<div class="df-actions">'+bits.join('')+'</div>';
  const icon=(key,cls='df-icon')=>img(key,cls);
  const demo=(summary,body)=>'<details class="df-demo"><summary>'+summary+'</summary>'+body+'</details>';
  const pad=n=>String(n).padStart(2,'0');
  const clock=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return pad(Math.floor(s/60))+':'+pad(s%60);};
  function resetQuotaDay(){
    const day=new Date(Date.now()+28800000).toISOString().slice(0,10);
    if(state.day!==day){state.day=day;state.free=3;state.bought=0;}
  }
  function refreshSlots(){
    for(const key of Object.keys(orderInfo)){
      if(!saleState.closed.has(key))continue;
      if(!state.until[key])state.until[key]=Date.now()+1800000;
      if(Date.now()>=state.until[key]){
        delete state.until[key];delete saleState.receipts[key];
        saleState.closed.delete(key);state.cancelled.delete(key);
      }
    }
  }
  function orders(){
    resetQuotaDay();refreshSlots();
    const slots=Object.entries(orderInfo).map(([key,[name,copy,tier,rate]],i)=>{
      if(saleState.closed.has(key)){
        return card(name,(state.cancelled.has(key)?'<small>已取消委托</small>':saleStatus(key))+
          '<div class="df-wait">'+icon('ui-order-clock-72-v2')+'<div><b>等待新委托</b><small>剩余 <time data-df-clock="'+state.until[key]+'">'+clock(state.until[key]-Date.now())+'</time></small></div></div>',
          '<small>第 '+(i+1)+' 槽</small>');
      }
      const available=[...saleState.stock.values()].some(p=>saleEligible(p,key));
      const open=saleState.channel===key;
      return card(name,'<p>'+copy+'</p><div class="df-chips"><span class="pill">'+tier+' · ×'+rate+'</span><small>'+(
        available?'有合适的动物':'暂无符合条件的动物，委托保留')+'</small></div>'+
        actions(available?saleButton(open?'收起选择':'选择交付','open',open?'':key,true):b('去动物房间','rooms'),button('取消订单','cancel',key))+
        (open&&available?salePanel(key):''),'<small>第 '+(i+1)+' 槽</small>');
    }).join('');
    return banner('orders','订单柜台')+title('普通订单','免费取消 '+state.free+' / 3')+slots+
      actions(b('额外取消次数','cancelshop'),button('交易记录','ledger'));
  }
  function cancelShop(){
    resetQuotaDay();
    return banner('orders','订单柜台')+card('额外取消次数 ×1',
      line('单价 · 当前店铺折扣 0%','300 金币')+line('持有次数',state.paid+' / 99')+
      line('今日还可购买',3-state.bought+' 次')+line('当前余额',saleState.coins+' 金币')+
      button('购买 1 次','buy-review','',true,state.paid>=99||state.bought>=3||saleState.coins<300)+
      '<small>优先使用每天 3 次免费额度。已购次数可以跨天保留。</small>')+b('返回普通订单','orders');
  }
  function dialog(){
    let d=document.querySelector('#dot-flow-dialog');
    if(!d){
      d=document.createElement('dialog');d.id='dot-flow-dialog';d.setAttribute('aria-labelledby','df-title');
      document.querySelector('.phone').append(d);
    }
    return d;
  }
  function sheet(titleText,body,footer){
    const d=dialog();
    d.innerHTML='<div class="df-caption"><h3 id="df-title">'+titleText+'</h3>'+button('关闭','close')+'</div>'+
      '<div class="df-body">'+body+'</div>'+(footer?'<div class="df-foot">'+footer+'</div>':'');
    featureDoors.decorate(d);
    if(!d.open)d.showModal();
    d.scrollTop=0;
  }
  function close(){const d=dialog();if(d.open)d.close();}
  function redraw(){show(location.hash.slice(1),true);}
  function reviewCancel(key){
    resetQuotaDay();
    if(!orderInfo[key]||saleState.closed.has(key))return;
    const source=state.free>0?'free':state.paid>0?'paid':'';
    const cost=source==='free'?'免费次数':source==='paid'?'已购次数':'可用次数';
    const n=source==='free'?state.free:state.paid;
    sheet('取消「'+orderInfo[key][0]+'」',line(cost,n+' 次')+
      (source?line('本次消耗','1 次'+cost):'<p>今天的免费次数和已购次数均已用完。</p>')+
      '<p class="df-message">只有当前槽位进入 30 分钟等待。动物会留在房间。</p>',
      actions(button('保留订单','close'),source?button('确认消耗 1 次'+cost,'cancel-confirm',key+'|'+source,true):
        button('查看购买次数','goto','cancelshop',true)));
  }
  function cancel(keySource){
    resetQuotaDay();const [key,source]=keySource.split('|');
    if(!orderInfo[key]||saleState.closed.has(key))return;
    if(source!==(state.free>0?'free':state.paid>0?'paid':''))return reviewCancel(key);
    if(source==='free')state.free--;else if(source==='paid')state.paid--;else return;
    saleState.closed.add(key);state.cancelled.add(key);state.until[key]=Date.now()+1800000;
    if(saleState.channel===key)startSelection('');
    close();redraw();
  }
  function buyReview(){
    resetQuotaDay();const allowed=state.bought<3&&state.paid<99&&saleState.coins>=300;
    sheet('购买额外取消次数',line('本次实付','300 金币')+line('购买后余额',Math.max(0,saleState.coins-300)+' 金币')+
      line('次数库存',state.paid+' → '+(state.paid+1))+'<p>购买后仍需回到具体委托，才能确认取消。</p>',
      actions(button('返回','close'),button('支付 300 金币','buy','',true,!allowed)));
  }
  function buy(){
    resetQuotaDay();if(state.paid>=99||state.bought>=3||saleState.coins<300)return buyReview();
    saleState.coins-=300;state.paid++;state.bought++;previewNav.completed();
    RabbitUI.notice('已购买 1 次额外取消次数。原委托仍在。');
  }
  function profile(base){
    const p=saleState.stock.get(saleState.profileId);
    if(!p||!p.bred)return base();
    const normal=Math.round(p.value/0.2);
    return base()+card('已繁育动物估值',line('未繁育基础估值',normal+' 金币')+
      line('本物种售价保留','20% · 价值研究 0 级')+line('市场收入',salePrice(p,'market')+' 金币')+
      '<small>还能参赛。离店后保留报名快照与首获奖杯记录。</small>'+
      '');
  }
  const packKey=species=>Object.keys(packs).find(key=>packs[key].species===species);
  const roomOpen=species=>species==='兔'||Boolean(state.packReceipts[packKey(species)]);
  function lockedRoom(species){
    const key=packKey(species),p=packs[key];if(!p||roomOpen(species))return '';
    return title(p.room+'未开放','开放后获得一对种源')+card('开放'+p.room,
      '<div class="df-pack">'+icon(p.art)+'<div><b>'+p.breed+' · 幼体</b><small>基础'+p.coat+'，一公一母</small></div></div>'+
      button('查看解锁确认','pack',key,true),'<span class="pill">'+p.cost+' 金币</span>');
  }
  function reviewPack(key){
    const p=packs[key];if(!p||displayedPage!=='rooms'||p.species!==species)return;
    if(state.packReceipts[key])return packReceipt(key);
    const enough=saleState.coins>=p.cost;
    sheet('开放'+p.room,img(key+'-room','df-room')+line('套餐',p.breed+'幼体 · 公母各一')+
      line('成熟时间','入住后 '+p.minutes+' 分钟')+line('本次实付',p.cost+' 金币')+line('当前余额',saleState.coins+' 金币')+
      line(enough?'付款后余额':'还差',(enough?saleState.coins-p.cost:p.cost-saleState.coins)+' 金币')+
      (enough&&saleState.coins-p.cost<300?'<p class="df-message">付款后将不足 300 金币，仍可确认开放。</p>':'')+
      '<small>房间与种源同时到账，幼体无需另购。</small>',
      actions(button('返回','close'),enough?button('确认开放','pack-commit',key,true):button('去自由市场','goto','market',true)));
  }
  function commitPack(key){
    const p=packs[key];if(!p||displayedPage!=='rooms'||p.species!==species||state.packReceipts[key]||saleState.coins<p.cost)return reviewPack(key);
    const ids=['母','公'].map((sex,i)=>{
      const id='pack-'+key+'-'+i;
      saleState.stock.set(id,{id,name:(key==='cat'?['小满','阿蓝']:['小麦','阿赤'])[i],art:p.art,sex,stage:'幼年',breed:p.breed,species:p.species,value:p.value,salvage:p.salvage});
      return id;
    });
    saleState.coins-=p.cost;state.packReceipts[key]={ids,at:Date.now()};previewNav.completed();
    RabbitUI.notice(p.room+'已开放，两只种源已入住。');
  }
  function packReceipt(key){
    const p=packs[key],receipt=state.packReceipts[key];if(!receipt)return;
    const time=new Date(receipt.at+p.minutes*60000).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
    sheet(p.room+'已开放',icon(p.art,'df-bigicon')+line('到账种源',p.breed+'幼体 ×2')+
      line('性别','一公一母')+line('预计成熟',time)+line('当前余额',saleState.coins+' 金币'),
      button('进入'+p.room,'enter-room',p.species,true));
  }
  const eventInfo={
    public:{name:'四季相伴公开赛',id:'O01',cost:'免费',span:'周一 20:00 至周五 18:00',result:'周六 20:00',settle:'周日 20:00',tiers:tiers},
    private:{name:'暖阳陪伴赛',id:'P01',cost:'兔 20 金币',span:'每日 20:00 至次日 18:00',result:'次日 20:00',tiers:tiers.slice(1,4)}
  };
  // The historical entry is deliberately independent of the live inventory.
  const entry={name:'小花',art:'angora',breed:'安哥拉兔',stage:'成年 · 已繁育',sex:'母',
    traits:[['性格','温顺','B'],['品相','圆脸','B'],['毛发','长绒','A'],['体态','匀称','B'],['体型','中型','B'],['健全度','未见明显缺陷','B']]};
  let raceTabChosen=false,raceRefreshAt=Infinity,raceDraft=null;
  function trackControls(kind){
    return '<nav class="df-tabs" aria-label="赛事类型">'+button('公开赛',kind+'-tab','public',state[kind]==='public')+
      button('私人赛',kind+'-tab','private',state[kind]==='private')+'</nav>';
  }
  function contest(){
    if(!raceTabChosen)state.tab=previewRace.status('public').gate.unlocked?'public':'private';
    const race=previewRace.status(state.tab);raceRefreshAt=race.next;
    const e=eventInfo[state.tab];
    return '<div class="stage">'+img('stage','')+img('angora','onstage')+'</div>'+trackControls('tab')+
      card(e.name,line('报名时段',e.span)+line('报名费用',e.cost)+line('结果公布',e.result)+
        (e.settle?line('排名奖金补差',e.settle):'')+
        '<small>北京时间 · '+(e.settle?'兔、猫、狗分别排名，每周只报一只。':'本轮三场主题可选一场。')+'</small>',
        '<span class="pill">'+(e.settle?'本地模拟公开赛':'私人赛')+'</span>')+
      card('本轮报名',race.entry?line('参赛动物',race.entry.pet.name)+button('查看本轮快照','race-record'):
        '<p>'+(race.reason||'店内成年或老年的空闲动物可报名。')+'</p>'+button('选择报名动物','race-list','',true,!!race.reason),
        '<small>开店第 '+race.day+' 天</small>')+
      card('往期报名记录','<div class="df-pack">'+icon(entry.art)+'<div><b>'+entry.name+' · '+entry.breed+'</b><small>往期报名样例 · 状态已保存</small></div></div>'+
        actions(button('查看报名快照','entry'),b('查看比赛结果','result',true)))+
      actions(b('奖杯收集册','collection'));
  }
  function raceList(){
    const s=previewRace.shop(),race=previewRace.status(state.tab,s);
    if(race.reason)return raceFailure(race.reason);
    const pets=s.animals.filter(previewRace.eligible);
    sheet('选择报名动物',pets.map(p=>button(p.name+' · '+p.breed+' · '+p.stage,'race-pick',p.id)).join('')||'<p>暂无成年或老年的空闲动物。</p>',button('关闭','close'));
  }
  function raceFailure(text){raceDraft=null;close();redraw();RabbitUI.notice(text);}
  function raceReview(id){
    const q=previewRace.quote(state.tab,id);
    if(q.error)return raceFailure(q.error);
    raceDraft=q;
    sheet('核对报名',line('赛事',eventInfo[q.mode].name)+line('参赛动物',q.pet.name+' · '+q.pet.breed)+line('本次报名费',q.fee+' 金币'),
      actions(button('修改选择','race-list'),button('确认报名','race-submit','',true)));
  }
  function raceSubmit(){
    if(!raceDraft)return;
    const r=previewRace.submit(raceDraft);raceDraft=null;
    if(r.error)return raceFailure(r.error);
    close();redraw();RabbitUI.notice(r.record.pet.name+'已报名，报名时的动物状态已保存。');
  }
  function raceRecord(){
    const record=previewRace.status(state.tab).entry;if(!record)return;
    const p=record.pet;
    sheet('本轮报名快照',line('参赛动物',p.name)+line('报名状态',p.breed+' · '+p.sex+' · '+p.stage)+line('报名费',record.fee+' 金币'),button('关闭','close'));
  }
  function entrySheet(){
    const e=eventInfo[state.tab];
    sheet('报名时快照','<div class="df-pack">'+icon(entry.art)+'<div><b>'+entry.name+' · '+entry.sex+'</b><small>'+entry.breed+' · '+entry.stage+'</small></div></div>'+
      line('参赛项目',e.name)+line('受理时间（示例）',state.tab==='public'?'周一 20:06':'20:06')+
      '<div class="df-traits">'+entry.traits.map(([kind,word,grade])=>'<div><small>'+kind+'</small><b>'+word+'</b><strong>'+grade+'</strong></div>').join('')+'</div>'+
      '<p>报名后仍可出售或繁育。该次比赛一直使用这份记录。</p>',button('返回','close', '',true));
  }
  const listModes={list:'已公布',pending:'待公布',empty:'本档无人',notjoined:'未报名',outside:'未获本档'};
  function ranking(){
    const ti=tiers.findIndex(t=>t[0]===state.tier),tierName=tiers[ti][1];
    if(state.list==='pending')return '<div class="df-message"><b>等待公布</b><p>'+eventInfo[state.tab].result+' 发布结果，报名快照已保留。</p></div>'+button('查看报名快照','entry');
    if(state.list==='empty')return '<div class="df-message"><b>'+tierName+'暂无获奖者</b><p>此档没有符合条件的参赛记录。</p></div>';
    const rows=namesByTier[ti].map((name,i)=>({name:name+'宠物店',flag:'机器人',art:i?'cat':'british'}));
    if(state.list==='list'&&state.tier==='gold')rows.unshift({name:'小花 · 我的小店',flag:'我的记录',art:entry.art});
    return (state.list==='notjoined'?'<p class="df-message">你未报名本期，仍可浏览已公布的名单。</p>':
      state.list==='outside'?'<p class="df-message">你的动物未获此档，已有奖杯与历史记录保留。</p>':'')+
      rows.map(r=>'<div class="df-rank">'+icon(r.art)+'<b>'+r.name+'</b><small>'+r.flag+'</small></div>').join('');
  }
  function tierTabs(kind,tierList,selected){
    return '<div class="df-tiers" style="--tiers:'+tierList.length+'" role="group" aria-label="奖杯档位">'+tierList.map(([key,label])=>
      '<button class="df-tier" data-dot="'+kind+'" data-key="'+key+'" aria-pressed="'+(key===selected)+'">'+icon('trophy-'+key+'-192-v2')+
      '<span>'+label+'</span></button>').join('')+'</div>';
  }
  function results(){
    const e=eventInfo[state.tab];if(!e.tiers.some(k=>k[0]===state.tier))state.tier='gold';
    const label=tiers.find(t=>t[0]===state.tier)[1];
    return '<div class="df-headpiece">'+icon('stage','df-stage')+'<div><small>'+e.id+' · '+(state.tab==='public'?'本地模拟公开赛':'私人赛')+'</small><h3>'+e.name+'</h3></div></div>'+
      line('公布时间',e.result)+(e.settle?line('排名奖金补差',e.settle):'')+
      tierTabs('tier',e.tiers,state.tier)+card(label+'名单',ranking(),'<small>样例名单</small>')+
      demo('切换名单状态（预览）','<div class="df-tabs">'+Object.entries(listModes).map(([key,v])=>button(v,'list',key,state.list===key)).join('')+'</div>')+
      actions(b('奖杯收集册','collection',true),b('返回比赛','show'));
  }
  let bookTier='gold';
  function collection(){
    const e=eventInfo[state.book];if(!e.tiers.some(k=>k[0]===bookTier))bookTier='gold';
    const isGold=bookTier==='gold',label=tiers.find(t=>t[0]===bookTier)[1];
    return '<div class="df-book">'+icon('collection-book-192-v2','df-bigicon')+'<div><h3>奖杯收集册</h3><small>私人 28 个主题 · 公开 12 个主题</small></div></div>'+
      trackControls('book')+title(e.name,'往期收藏样例')+tierTabs('book-tier',e.tiers,bookTier)+
      (isGold?card('金奖 · 已收藏','<div class="df-pack">'+icon(entry.art)+'<div><b>首获动物 · '+entry.name+'</b><small>'+entry.breed+' · 首获记录永久保留</small></div></div>'+
        line('累计获得','2 次')+line('本主题贡献',state.book==='public'?'+4%':'+1%')+
        button('查看首获记录','history','',true)):
        card(label+' · 尚未收藏','<p>实际获得这个档位后，会在这里留下第一只获奖动物。</p>'))+
      '<p class="df-message">同主题只采用最高档的店铺收益。再次获得同杯只累计次数，低档杯须实际获得。</p>';
  }
  function history(){
    const e=eventInfo[state.book],owner=saleState.stock.has('hua')?'仍在店内':'已离店';
    sheet('金奖首获记录','<div class="df-pack">'+icon('trophy-gold-192-v2','df-bigicon')+'<div><b>'+e.name+'</b><small>第 1 期 · '+e.result+'</small></div></div>'+
      line('首获动物',entry.name+' · '+entry.breed)+line('当前去向',owner)+line('累计获得','2 次')+
      '<p>再次获得金奖时，仍保留这次的首获记录。</p>',button('返回收集册','close','',true));
  }
  function ledger(){
    const list=Object.values(saleState.receipts);
    sheet('交易记录',list.length?list.map(r=>line(saleChannels[r.channel].title+' · '+r.lines.length+' 只','+'+r.total+' 金币')).join(''):
      '<p>本次预览还没有已完成的出售交易。</p>',
      actions(button('关闭记录','close'),button('查看回执待确认示例','unknown')));
  }
  function unknown(){
    if(!state.receipt)state.receipt={id:'示例-'+(++state.seq),checked:false};
    const r=state.receipt;
    sheet(r.checked?'已查到原请求':'交易结果待确认',line('请求记录',r.id)+
      (r.checked?'<p class="df-message">原请求未成交，库存与金币保留，可以返回重新选货。</p>':
        '<p class="df-message">回执尚未收到。保留请求记录，先查询原结果。</p>')+
      '<small>断线反馈样例，本次不会执行交易。</small>',
      r.checked?button('返回柜台','close','',true):button('查询原请求','query','',true));
  }
  function install(pages,names){
    const originalProfile=pages.profile;
    Object.assign(pages,{orders,cancelshop:cancelShop,profile:()=>profile(originalProfile),
      show:contest,result:results,collection});
    saleChannels.lookout={title:orderInfo.lookout[0],action:'交付',rate:180,order:true,accepts:pet=>pet.species==='兔'&&pet.breed==='狮子兔'};
    // Only active cooldowns need a timer; redraw at expiry so a completed slot can reopen.
    if(!document.querySelector('[data-df-timer]')){
      const timerTag=document.createElement('meta');timerTag.setAttribute('data-df-timer','');document.head.append(timerTag);
      window.setInterval(()=>{
        if(document.hidden)return;
        if(displayedPage==='show'&&Date.now()>=raceRefreshAt&&!document.querySelector('dialog[open]')){redraw();return;}
        if(location.hash!=='#orders')return;
        const times=document.querySelectorAll('time[data-df-clock]');
        for(const el of times){
          const remaining=Number(el.dataset.dfClock)-Date.now();
          if(remaining<=0){redraw();return;}
          el.textContent=clock(remaining);
        }
      },1000);
    }
  }
  function handle(el){
    const key=el.dataset.key;
    switch(el.dataset.dot){
      case 'close':return goBack();
      case 'goto':close();return show(key);
      case 'service':return sheet(key==='guide'?'选育指导单 · 使用确认':'特征复评单 · 使用确认',
        '<p>'+serviceNotes[key]+'</p>',button('返回','close','',true));
      case 'cancel':return reviewCancel(key);
      case 'cancel-confirm':return cancel(key);
      case 'buy-review':return buyReview();
      case 'buy':return buy();
      case 'pack':return reviewPack(key);
      case 'pack-commit':return commitPack(key);
      case 'pack-receipt':return packReceipt(key);
      case 'enter-room':RoomBook.switchTo(key);close();return show('rooms');
      case 'profile-sale':{
        const pet=saleState.stock.get(key),channel=pet?.stage==='已故'?'recycle':'market';
        if(saleEligible(pet,channel))return show(channel==='recycle'?'lab':'market',false,'forward',{channel,selected:key});
        return;
      }
      case 'guest-dismiss':return sheet('婉拒林女士','<p>确认后客人会离开，本次委托结束。</p>',actions(button('保留委托','close'),button('确认婉拒','guest-dismiss-confirm','',true)));
      case 'guest-dismiss-confirm':saleState.closed.add('guest');return previewNav.completed();
      case 'tab-tab':raceTabChosen=true;state.tab=key;return redraw();
      case 'race-list':return raceList();
      case 'race-pick':return raceReview(key);
      case 'race-submit':return raceSubmit();
      case 'race-record':return raceRecord();
      case 'book-tab':state.book=key;return redraw();
      case 'tier':state.tier=key;return redraw();
      case 'book-tier':bookTier=key;return redraw();
      case 'list':state.list=key;redraw();document.querySelector('.df-demo')?.setAttribute('open','');return;
      case 'entry':return entrySheet();
      case 'history':return history();
      case 'ledger':return ledger();
      case 'unknown':return unknown();
      case 'query':if(state.receipt)state.receipt.checked=true;return unknown();
    }
  }
  function pairReview(parents){
    const pred=RabbitDemo.pairing(...parents);
    sheet('核对配对',line('亲本',parents.map(p=>p.name).join(' × '))+line('后代预计登记品种',pred.breed)+(pred.different?'<p>每只幼体独立随机继承父方或母方的品种外形，花色另行判定。</p>':'')+'<p>本窝出生后，两只亲本会自动取消留种。</p>',
      actions(button('修改亲本','close'),'<button class="btn primary" data-pair="commit">确认配对</button>'));
  }
  return {install,handle,roomOpen,lockedRoom,pairReview,saveState};
})();
