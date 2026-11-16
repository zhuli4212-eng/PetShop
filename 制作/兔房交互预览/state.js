// State for the rabbit-room UI preview. Each browser keeps its own trial shop.
const RabbitDemo = (() => {
  const minute = 60000;
  const day = 24 * 60 * minute;
  const maturity = 30 * minute;
  const oldAge = maturity + 3 * day;
  const lifespan = oldAge + day;
  const breeds = {
    domestic: {name:'原色兔', base:100, coats:['栗野','灰野','黑白花斑','橘白花斑','纯黑','雪白']},
    lop: {name:'垂耳兔', base:110, coats:['奶油','蓝灰','巧克力','纯白','黑白花斑','焦糖白花斑']},
    angora: {name:'安哥拉兔', base:120, coats:['雪白','奶油','蓝灰','巧克力','橘黄','黑白花斑']},
    lionhead: {name:'狮子兔', base:135, coats:['金黄','黑色','灰白','巧克力','奶油','黑白花斑']}
  };
  const gradeNames = ['E','D','C','B','A','S','S+'];
  const traitNames = ['性格','品相','毛发','体态','体型','健全度'];
  const words = [
    [['温顺','好奇','亲人'],['沉稳','大胆'],['从容']],
    [['圆眼','清秀'],['秀眉','眼神明亮'],['眼神灵动']],
    [['柔软','顺毛'],['细密','绒感'],['丝光','绒光']],
    [['匀称','舒展'],['步态轻盈','站姿端正'],['仪态出众']],
    [['紧凑','修长'],['骨架匀整','轮廓流畅'],['比例匀美']]
  ];
  const rarityNames = ['普通','少见','稀有'];
  const names = ['小朵','糯米','芝麻','点点','松子','桃酥','栗子','杏仁','阿团','花生','奶糖','小满'];
  const prefix = 'petshop.rabbitroom.v1.';
  const memory = {};
  let storageAvailable = true;
  let mode = 'shop';
  const fail = error => ({ok:false,error});
  const randomItem = list => list[Math.floor(Math.random()*list.length)];
  const beijingDay = now => new Date(now+8*60*minute).toISOString().slice(0,10);

  function pick(weights) {
    let value = Math.random()*weights.reduce((a,b)=>a+b,0);
    for (let i=0; i<weights.length; i++) {
      value -= weights[i];
      if (value < 0) return i;
    }
    return weights.length-1;
  }
  function standardTraits(personality='温顺') {
    return [personality,'清秀','柔软','匀称','紧凑','未见明显缺陷'].map((label,i)=>({
      type:traitNames[i], label, rarity:'普通', grade:'B'
    }));
  }
  function makePet(store, data) {
    const number = ++store.serial;
    return {
      id:'r'+number, number, name:randomItem(names), breedKey:'domestic', coatIndex:1,
      bred:false, mixed:false, traits:standardTraits(), ...data
    };
  }
  function makeOrder(number, first=false) {
    const difficulty = first ? 0 : pick([70,25,5]);
    const order = {id:'order-'+number, title:'街坊的兔子订单', difficulty:['易','中','难'][difficulty],
      condition:'任意品种的兔子', rate:[1.35,1.55,1.80][difficulty], readyAt:0, number};
    if (difficulty>0) {
      if (Math.random()<.5) {
        order.tag = randomItem(randomItem(words)[difficulty===2 ? 1 : 0]);
        order.condition = '带「'+order.tag+'」标签的兔子';
      } else {
        order.breedKey = difficulty===2?'lionhead':['domestic','lop','angora'][pick([4,3,2])];
        order.condition = '登记品种为'+breeds[order.breedKey].name;
      }
    }
    return order;
  }
  function fresh(storeMode, now) {
    const s = {version:1, shopId:Math.random().toString(36).slice(2), createdAt:now,raceEntries:{},coins:680, shopXp:0, serial:0, offset:0,
      animals:[], job:null, litter:null, lastClaimDay:'', lastClaimIds:[], order:makeOrder(1,true), guestOpen:true};
    if (storeMode==='shop') {
      s.animals.push(makePet(s,{name:'小花',sex:'母',breedKey:'angora',coatIndex:1,bornAt:now-maturity,source:'开店种兔'}),
        makePet(s,{name:'小白',sex:'公',breedKey:'angora',coatIndex:2,bornAt:now-maturity,source:'开店种兔',traits:standardTraits('好奇')}));
      return s;
    }
    // Repeated names and coats make the permanent number useful when choosing from a long list.
    const coats = [6,6,6,2,1,5,3,4,6,1,2,3,4,6,5,2,3,1,4,6];
    const ages = [2*minute,19*minute,2*day,oldAge+minute,2*day,maturity,5*minute,
      day,day,2*day,3*minute,oldAge+minute,maturity,day,7*minute,maturity,day,2*day,lifespan+minute,lifespan+day];
    for (let i=0; i<20; i++) {
      const breedKey = i<5||coats[i]===6?'angora':['domestic','lop','angora','lionhead'][i%4];
      const t = standardTraits();
      if (i===0||i===14) t[0].grade='A';
      s.animals.push(makePet(s,{name:i<3?'点点':names[(i+2)%names.length],sex:i%3===0?'公':'母',
        breedKey,coatIndex:coats[i],bornAt:now-ages[i],source:'示例名册',bred:[3,9,12,19].includes(i),traits:t}));
    }
    return s;
  }
  function load() {
    let raw;
    try { if(storageAvailable)raw=localStorage.getItem(prefix+mode); } catch { storageAvailable=false; }
    if (raw && raw!==memory[mode]?.raw) {
      try {
        const s=JSON.parse(raw);
        if (s.version===1 && Array.isArray(s.animals) && s.order){
          memory[mode]={raw,s};
          if(!Number.isFinite(s.createdAt)){
            const starts=s.animals.filter(p=>p.source==='开店种兔').map(p=>p.bornAt+maturity);
            if(!starts.length&&s.litter)starts.push(s.litter.bornAt-2*minute-(s.offset||0));
            if(!starts.length&&s.lastClaimDay)starts.push(Date.parse(s.lastClaimDay+'T00:00:00+08:00'));
            s.createdAt=Math.min(Date.now(),...starts.filter(Number.isFinite));save(s);
          }
        }
      } catch {}
    }
    if (!memory[mode]) save(fresh(mode,Date.now()));
    return memory[mode].s;
  }
  function save(s) {
    const raw=JSON.stringify(s);
    memory[mode]={raw,s};
    try { if(storageAvailable)localStorage.setItem(prefix+mode,raw); } catch { storageAvailable=false; }
  }
  function stageOf(bornAt, now) {
    const age=now-bornAt;
    if (age<12*minute) return ['幼年',bornAt+12*minute];
    if (age<maturity) return ['成长',bornAt+maturity];
    if (age<oldAge) return ['成年',bornAt+oldAge];
    if (age<lifespan) return ['老年',bornAt+lifespan];
    return ['已故',null];
  }
  function describe(p, s, now) {
    const [stage,stageEndsAt]=stageOf(p.bornAt,now);
    const busy=s.job && (s.job.motherId===p.id || s.job.fatherId===p.id);
    const breedStatus=busy?'繁育中':p.bred?'已繁育':'未繁育';
    const seed=stage!=='已故' && breedStatus==='未繁育';
    return {...p, species:'兔', breed:p.mixed?'杂交':breeds[p.breedKey].name, coat:breeds[p.breedKey].coats[p.coatIndex-1],
      stage,stageEndsAt,ageMs:now-p.bornAt,breedStatus,seed,canBreed:seed && (stage==='成年'||stage==='老年'),
      grades:p.traits.map(t=>t.grade),traits:p.traits.map(t=>({...t}))};
  }
  function inheritedTraits(a,b) {
    return traitNames.map((type,i)=>{
      const av=a.traits[i], bv=b.traits[i];
      const grades=[gradeNames.indexOf(av.grade), gradeNames.indexOf(bv.grade)];
      const j=Math.random()<.5?0:1, base=grades[j], ref=grades[1-j];
      const typicalUp=[.18,.18,.18,.18,.10,.06,0][base];
      const up=ref<base-1 ? Math.min(.03,typicalUp) : typicalUp;
      const roll=Math.random();
      const value=Math.max(0,Math.min(6,Math.max(...grades)+1,base+(roll<up?1:roll<up+.10?-1:0)));
      const grade=gradeNames[value];
      if(i===5) return {type,grade,rarity:'普通',label:value<=1?'明显偏差':value===2?'轻微偏差':'未见明显缺陷'};
      const source=Math.random();
      if(source<.8) return {...(source<.4?av:bv),grade};
      const rarity=pick([70,20,10]);
      return {type,grade,rarity:rarityNames[rarity],label:randomItem(words[i][rarity])};
    });
  }
  function lookKey(p){return p.breedKey||Object.keys(careCatalog.breeds).find(key=>careCatalog.breeds[key].name===p.breed);}
  function lookCoat(p){return p.coatIndex||careCatalog.breeds[lookKey(p)].coats.indexOf(p.coat)+1||(p.art==='spot'?6:1);}
  function pairing(a,b){
    const ma=lookKey(a),mb=lookKey(b),mixed=mixedOffspring({...a,breedKey:ma},{...b,breedKey:mb});
    return {mixed,breed:mixed?'杂交':careCatalog.breeds[ma].name,different:ma!==mb||lookCoat(a)!==lookCoat(b)};
  }
  function babyLook(a,b){
    const from=Math.random()<.5?a:b;
    return {breedKey:lookKey(from),sex:Math.random()<.5?'母':'公',mixed:pairing(a,b).mixed,
      coatIndex:Math.random()<.85?lookCoat(from):1+pick([25,25,18,14,10,8])};
  }
  function exampleBabies(parents,endsAt){
    const [a,b]=parents,cfg=Object.values(careCatalog.species).find(c=>c.name===a.species);
    const count=cfg.min+pick(cfg.litter),parentsWithTraits=parents.map(p=>({...p,traits:p.traits||standardTraits()}));
    return Array.from({length:count},(_,i)=>{
      const look=babyLook(a,b),appearance=careCatalog.breeds[look.breedKey],traits=inheritedTraits(...parentsWithTraits);
      const base=look.mixed?careCatalog.breeds[cfg.breeds[0]].base:appearance.base;
      return {...look,id:'baby-'+a.id+'-'+b.id+'-'+i,name:randomItem(names),species:a.species,stage:'幼年',bornAt:endsAt,
        source:'本店繁育',breed:look.mixed?'杂交':appearance.name,appearance:appearance.name,coat:appearance.coats[look.coatIndex-1],
        art:'rb-'+look.breedKey+'-'+String(look.coatIndex).padStart(2,'0')+'-'+(look.sex==='母'?'female':'male'),
        traits,gentle:traits[0].label==='温顺'?traits[0].grade:undefined,
        value:priceFor('market',{stage:'幼年',traits,grades:traits.map(t=>t.grade)},{},base),salvage:Math.max(1,Math.floor(base*.06))};
    });
  }
  function progress() {
    const s=load(), now=Date.now()+s.offset;
    let changed=false;
    if (s.job && now>=s.job.endsAt) {
      const {motherId,fatherId,endsAt,offspring}=s.job;
      for(const p of s.animals) if(p.id===motherId||p.id===fatherId){p.bred=true;p.seedMarked=false;}
      s.animals.push(...offspring);
      s.litter={ids:offspring.map(p=>p.id),motherId,fatherId,bornAt:endsAt};
      s.job=null;
      changed=true;
    }
    if(s.order.readyAt && now>=s.order.readyAt) {
      s.order=makeOrder(s.order.number+1);
      changed=true;
    }
    if(changed)save(s);
    return {s,now};
  }
  function read() {
    const {s,now}=progress();
    const job=s.job ? {motherId:s.job.motherId,fatherId:s.job.fatherId,endsAt:s.job.endsAt} : null;
    return {mode,now,coins:s.coins,shopXp:s.shopXp??0,createdAt:s.createdAt,raceEntries:s.raceEntries||{},animals:s.animals.map(p=>describe(p,s,now)),job,
      canClaim:s.lastClaimDay!==beijingDay(now),lastClaimIds:[...s.lastClaimIds],
      litter:s.litter && {...s.litter,ids:[...s.litter.ids]},order:{...s.order},orderReadyAt:s.order.readyAt,guestOpen:s.guestOpen};
  }
  function claim() {
    const {s,now}=progress(), today=beijingDay(now);
    if(s.lastClaimDay===today)return fail('今日的两只后备兔已经领取。');
    const pair=['母','公'].map((sex,i)=>makePet(s,{name:['谷穗','小麦'][i],sex,bornAt:now,source:'每日签到'}));
    s.animals.push(...pair);
    s.lastClaimDay=today;
    s.lastClaimIds=pair.map(p=>p.id);
    save(s);
    return {ok:true,ids:[...s.lastClaimIds]};
  }
  function setSeedMark(id,marked) {
    const {s,now}=progress(), animal=s.animals.find(p=>p.id===id);
    if(!animal)return fail('这只动物已离开名册。');
    if(marked && stageOf(animal.bornAt,now)[0]==='已故')return fail('已故动物不能新设留种。');
    animal.seedMarked=marked;
    save(s);
    return {ok:true};
  }
  function heldLitter(s,held,now) {
    return Array.from(new Set(held)).map(id=>s.litter?.ids.includes(id) && s.animals.find(p=>p.id===id && stageOf(p.bornAt,now)[0]!=='已故'));
  }
  function keepLitter(ids) {
    const {s,now}=progress(), pets=heldLitter(s,ids,now);
    if(!pets.length || pets.some(p=>!p))return fail('窝内名册已变化，请重新挑选。');
    pets.forEach(p=>p.seedMarked=true);save(s);
    return {ok:true};
  }
  function startBreed(id1,id2) {
    const {s,now}=progress();
    if(s.job)return fail('兔房已有一窝正在繁育。');
    const parents=s.animals.filter(p=>p.id===id1||p.id===id2);
    if(parents.length!==2 || parents[0].sex===parents[1].sex || parents.some(p=>!describe(p,s,now).canBreed))
      return fail('请选择可繁育的一公一母成年或老年兔。');
    const mother=parents.find(p=>p.sex==='母'),father=parents.find(p=>p.sex==='公');
    const endsAt=now+2*minute, offspring=[];
    const count=3+pick([25,50,25]);
    for(let i=0;i<count;i++) {
      offspring.push(makePet(s,{...babyLook(mother,father),bornAt:endsAt,source:'本店繁育',motherId:mother.id,fatherId:father.id,
        traits:inheritedTraits(mother,father)}));
    }
    s.job={motherId:mother.id,fatherId:father.id,endsAt,offspring};
    save(s);
    return {ok:true,endsAt};
  }
  function previewBirth() {
    const {s,now}=progress();
    if(!s.job)return fail('目前没有等待出生的一窝。');
    s.offset+=Math.max(0,s.job.endsAt-now);
    save(s);
    const view=read();
    return {ok:true,ids:view.litter.ids};
  }
  function eligibleFor(channel,p,s,now) {
    if(!p || p.seedMarked || p.breedStatus==='繁育中')return false;
    if(channel==='recycle')return p.stage==='已故';
    if(p.stage==='已故')return false;
    if(channel==='market')return true;
    if(channel==='guest')return s.guestOpen && p.breed==='安哥拉兔' && p.stage==='幼年' &&
      p.traits[0].label==='温顺' && gradeNames.indexOf(p.grades[0])>=4;
    if(channel!=='order' || s.order.readyAt>now)return false;
    if(s.order.breedKey && (p.mixed||s.order.breedKey!==p.breedKey))return false;
    return !s.order.tag || p.traits.slice(0,5).some(t=>t.label===s.order.tag);
  }
  function eligible(channel,animal) {
    const {s,now}=progress();
    return eligibleFor(channel,animal,s,now);
  }
  function priceFor(channel,p,s,base=p.mixed?100:breeds[p.breedKey].base) {
    const residual=Math.max(1,Math.floor(base*6/100));
    if(p.stage==='已故')return channel==='recycle'?residual:0;
    const sum=p.grades.reduce((n,grade)=>n+gradeNames.indexOf(grade),0);
    const traits=p.traits.slice(0,5);
    // Q × 600 is integral. Avoid rounding intermediate decimal products.
    const quality=600+5*(sum-18)+18*traits.filter(t=>t.rarity==='少见').length+48*traits.filter(t=>t.rarity==='稀有').length;
    const stageWeight={幼年:80,成长:92,成年:100,老年:65}[p.stage];
    const value=Math.floor((base*quality*stageWeight+30000)/60000);
    const retained=p.bred?Math.max(residual,Math.floor((value*20+50)/100)):value;
    if(channel==='recycle')return 0;
    const rate=channel==='order'?Math.round(s.order.rate*100):channel==='guest'?215:100;
    return Math.floor((retained*rate+50)/100);
  }
  function price(channel,animal) { return priceFor(channel,animal,progress().s); }
  function quote(channel,ids) {
    const {s,now}=progress();
    const selection=Array.from(ids||[]);
    const animals=s.animals.map(p=>describe(p,s,now)), chosen=new Set(selection);
    if(!chosen.size)return fail('先选择要交付的兔子。');
    if(chosen.size!==selection.length)return fail('名单中有重复的兔子，请重新选择。');
    const lines=[];
    for(const id of selection) {
      const p=animals.find(a=>a.id===id);
      if(p?.seedMarked)return fail(p.name+'已标记为种源，请先取消留种。');
      if(!eligibleFor(channel,p,s,now))return fail('名单中有已离店或不符合条件的兔子，请重新核对。');
      lines.push({id,name:p.name,number:p.number,price:priceFor(channel,p,s),sex:p.sex,stage:p.stage});
    }
    const warnings=[];
    for(const sex of ['母','公']) {
      const seeds=animals.filter(p=>p.sex===sex && p.seed);
      if(seeds.length && seeds.every(p=>chosen.has(p.id)))warnings.push('这次会卖出兔房最后的'+sex+'种源。');
    }
    return {ok:true,mode,shopId:s.shopId,channel,orderId:channel==='order'?s.order.id:null,lines,warnings,
      total:lines.reduce((sum,row)=>sum+row.price,0)};
  }
  function sell(offer,held=[]) {
    if(!offer?.ok || !Array.isArray(offer.lines))return fail('请重新核对名单。');
    const ids=offer.lines.map(line=>line.id);
    const live=quote(offer.channel,ids);
    if(!live.ok)return live;
    if(offer.mode!==mode || offer.shopId!==live.shopId || offer.orderId!==live.orderId ||
      offer.total!==live.total || live.lines.some((line,i)=>line.price!==offer.lines[i].price) ||
      JSON.stringify(offer.warnings)!==JSON.stringify(live.warnings))
      return fail('当前报价或种源情况已变化，请重新核对。');
    const s=load(), chosen=new Set(ids);
    const levelBefore=shopProgress(shopRules,s.shopXp??0).level;
    const feature=offer.channel==='recycle'?'lab':offer.channel==='order'?'orders':offer.channel;
    if(levelBefore<shopRules.featureLevels[feature])return fail('店铺 '+shopRules.featureLevels[feature]+' 级开放。');
    const keeps=heldLitter(s,held,Date.now()+s.offset);
    if(keeps.some(p=>!p || chosen.has(p.id)))return fail('留种名单已变化，请重新挑选。');
    keeps.forEach(p=>p.seedMarked=true);
    s.animals=s.animals.filter(p=>!chosen.has(p.id));
    s.coins+=live.total;
    const xp=saleExperience(shopRules,offer.channel,live.lines.map(line=>({amount:line.price})));
    s.shopXp=(s.shopXp??0)+xp;
    if(offer.channel==='order')s.order.readyAt=Date.now()+s.offset+30*minute;
    if(offer.channel==='guest')s.guestOpen=false;
    save(s);
    return {ok:true,count:ids.length,total:live.total,lines:live.lines,xp,levelBefore,level:shopProgress(shopRules,s.shopXp).level};
  }
  function useSample(on) {
    mode=on?'sample':'shop';
    return {ok:true,mode};
  }
  function recordRace(record){
    const s=load();s.raceEntries??={};
    if(s.raceEntries[record.round]||s.coins<record.fee)return false;
    s.raceEntries[record.round]=record;s.coins-=record.fee;save(s);return true;
  }
  function reset() {
    save(fresh(mode,Date.now()));
    return {ok:true};
  }
  return {read,claim,setSeedMark,keepLitter,startBreed,previewBirth,eligible,price,quote,sell,useSample,reset,recordRace,pairing,exampleBabies};
})();
