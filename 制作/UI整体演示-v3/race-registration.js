const previewRace = (() => {
  const hour=3600000, day=24*hour, week=7*day;
  const epoch=Date.parse('2026-11-09T20:00:00+08:00');
  const clock=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function shop(){
    if(previewNav.trialShop)return RabbitDemo.read();
    return {...saleState,animals:[...saleState.stock.values()]};
  }
  function status(mode,s=shop(),now=Date.now()){
    const span=mode==='private'?day:week;
    const start=epoch+Math.floor((now-epoch)/span)*span,end=start+(mode==='private'?22:94)*hour;
    const round=mode+'-'+start,entry=s.raceEntries[round];
    const days=shopRaceAccess(shopRules,s.createdAt,now),gate=days.raceAccess[mode];
    const needs=shopRules.featureLevels.show;
    let reason='';
    if(shopProgress(shopRules,s.shopXp).level<needs)reason='店铺 '+needs+' 级开放赛展报名。';
    else if(!gate.unlocked)reason='开店第 '+gate.opensDay+' 天开放报名，'+clock.format(gate.opensAt)+' 起可参加。';
    else if(now<epoch||now>=end)reason='当前不在报名时段，下次报名 '+clock.format(now<epoch?epoch:start+span)+' 开放。';
    else if(entry)reason='本轮已报名。';
    const next=Math.min(...[gate.opensAt,epoch,end,start+span].filter(t=>t>now));
    return {mode,round,entry,gate,day:days.shopDay,reason,next};
  }
  const eligible=p=>p&&['成年','老年'].includes(p.stage)&&!p.breeding&&p.breedStatus!=='繁育中';
  function quote(mode,id){
    const s=shop(),race=status(mode,s),p=s.animals.find(p=>p.id===id);
    if(race.reason)return {error:race.reason};
    if(!eligible(p))return {error:'请选择店内成年或老年、空闲的动物。'};
    const fee=mode==='private'?{兔:20,猫:100,狗:120}[p.species]:0;
    if(s.coins<fee)return {error:'金币不足，无法支付报名费。'};
    return {mode,round:race.round,fee,pet:{id:p.id,name:p.name,species:p.species,breed:p.breed,sex:p.sex,stage:p.stage,traits:p.traits||[]}};
  }
  function submit(draft){
    const fresh=quote(draft.mode,draft.pet.id);
    if(fresh.error)return fresh;
    if(JSON.stringify(draft)!==JSON.stringify(fresh))return {error:'场次或动物状态有变化，请重新核对。'};
    const record={...fresh,at:Date.now()};
    if(previewNav.trialShop){
      if(!RabbitDemo.recordRace(record))return {error:'本轮报名或余额已变化，请重新核对。'};
    }else{
      saleState.coins-=record.fee;saleState.raceEntries[record.round]=record;saveExample();
    }
    return {record};
  }
  return {shop,status,eligible,quote,submit};
})();
