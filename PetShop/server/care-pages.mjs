import {
  SPECIES, BREEDS, stageOf, stageEnd, breedName, petArt, fields, coatName, canBreed, stockStatus, dayAt, isBusy, itemName, litterMembers, mixedOffspring,
  lifeDates, beijingTime,
} from './care.mjs';
import { businessPage, offerOrderRows, purchasePrice, salePrice, valuation, youngPurchaseBase } from './business.mjs';

const go = (label,page,args={}) => ({label,page,args});
const link = (title,text,page,args={},extra={}) => ({title,text,link:{page,args},...extra});
const act = (label,type,args,confirm,page,goArgs={}) => ({label,type,args,confirm,go:page,goArgs});
const number = p=>p.id.slice(0,5).toUpperCase();
const options = (s,page,current)=>Object.entries(SPECIES).map(([species,c])=>({...go(c.name+'房',page,{species}),active:species===current,locked:!s.rooms[species]}));
const specimen = (s,p,now)=>({
  id:p.id,number:number(p),name:p.name,sex:p.sex,breed:breedName(p),coat:coatName(p),stage:stageOf(p,now),
  status:stageOf(p,now)==='已故'?(p.retained?'种源保护':'待回收'):stockStatus(s,p),art:petArt(p),retained:p.retained===true,
});
const petRow = (s,p,now,page='pet',args={id:p.id})=>link(p.name+' · '+p.sex,
  breedName(p)+' · '+coatName(p)+' · '+stageOf(p,now)+' · '+stockStatus(s,p),page,args,{art:petArt(p),stage:stageOf(p,now),animal:specimen(s,p,now)});
const describeRemaining = ms=>ms<60_000?Math.max(1,Math.ceil(ms/1000))+' 秒':ms<3_600_000?Math.ceil(ms/60_000)+' 分钟':ms<86_400_000?Math.ceil(ms/3_600_000)+' 小时':Math.ceil(ms/86_400_000)+' 天';
const empty = (title,text,page='rooms')=>({title,rows:[{title:text}],actions:[go('查看名册',page)]});
const speciesKey = a=>a.species&&Object.hasOwn(SPECIES,a.species)?a.species:'rabbit';
const roomFilters = {
  在养:(s,p,now)=>stageOf(p,now)!=='已故',已故:(s,p,now)=>stageOf(p,now)==='已故',
  可配对:(s,p,now)=>canBreed(s,p,now),后备种源:(s,p,now)=>stageOf(p,now)!=='已故'&&!p.bred&&!isBusy(s,p),
};
function closedRoom(s,species,page,now) {
  const c=SPECIES[species],cost=purchasePrice(s,c.roomCost),breed=BREEDS[c.breeds[0]].name;
  const estimate=beijingTime(lifeDates({species,bornAt:now}).adultAt).slice(0,16);
  const balance=s.coins-cost;
  return {title:c.name+'房 · 待开放',art:'rooms/unfinished-room',subtitle:'新房套餐',
    presentation:{kind:'locked',species:c.name,youngArt:'pets/'+c.breeds[0]+'-coat01_female',maturity:c.young+c.growth,estimate,breed,price:cost,coins:s.coins},
    rows:[{title:breed+'幼体一对',text:'公母各一只，六维 B，入住房间后开始成长。'},
      {title:'房间及两只种源',text:'基准 '+c.roomCost+' 金币 · 实付 '+cost+' 金币 · 余额 '+s.coins}],
    tabs:options(s,page,species),actions:page==='rooms'
      ? [{...act('解锁'+c.name+'房','care.unlock',{species,price:cost},'支付 '+cost+' 金币开放'+c.name+'房，接收一公一母两只'+breed+'幼体？付款后余 '+Math.max(0,balance)+' 金币，若现在入住，预计北京时间 '+estimate+' 成年。','roomReceipt',{species}),disabled:balance<0}]
      : [go('查看'+c.name+'房','rooms',{species})]};
}
function openingReceipt(s,species) {
  const receipt=s.rooms[species]?.openingReceipt;
  if(!receipt)return empty('新房入住记录','这份经营档没有保存该次入住的明细。','rooms');
  return {title:SPECIES[species].name+'房入住回执',subtitle:'新房已开放 · 北京时间',
    rows:[...receipt.pair.map(p=>({title:p.sex+' · '+p.name+' #'+number(p),
      text:BREEDS[p.breedKey].name+' · '+coatName(p)+' · 入住时为幼体'})),
      {title:'出生及入住',text:beijingTime(receipt.bornAt)},
      {title:'成年时刻',text:beijingTime(receipt.adultAt)},
      {title:'本次实付',text:receipt.paid+' 金币 · 成交后余额 '+receipt.balance+' 金币'}],
    actions:[{label:'查看本房名册',type:'ui.back'}]};
}
function roster(s,a,now) {
  const species=speciesKey(a), cfg=SPECIES[species],room=s.rooms[species];
  if(!room) return closedRoom(s,species,'rooms',now);
  const all=s.pets.filter(p=>p.species===species);
  const filter=Object.hasOwn(roomFilters,a.filter)?a.filter:'在养';
  const sex=['公','母'].includes(a.sex)?a.sex:'全部';
  const shown=all.filter(p=>roomFilters[filter](s,p,now)&&(sex==='全部'||p.sex===sex));
  const residents=all.filter(p=>(stageOf(p,now)==='已故')===(filter==='已故')).slice(0,3);
  return {title:'动物房间',art:cfg.art,animals:residents.map(petArt),animalStages:residents.map(p=>stageOf(p,now)),
    presentation:{kind:'rooms',species:cfg.name,count:all.length,matchedCount:shown.length,residents:residents.map(p=>specimen(s,p,now))},
    subtitle:'名册 '+shown.length+' 只 · '+filter+' · '+sex,
    rows:[link(room.job?'查看正在繁育的一窝':'进入繁育台',room.job?'预计 '+describeRemaining(room.job.endsAt-now)+' 后出生':'挑选亲本并比较六维标签','breed',{species}),
      ...(room.lastLitter?[link('最近出生的一窝',room.lastLitter.ids.length+' 只','litter',{species})]:[]),
      ...(room.openingReceipt?[link('查看入住回执','购房时的两只幼体、成年时刻与余款','roomReceipt',{species})]:[]),
      ...shown.map(p=>petRow(s,p,now)),...(!shown.length?[{title:'当前筛选下没有动物。'}]:[])],
    tabs:options(s,'rooms',species),filters:[
      ['在养','后备种源','可配对','已故'].map(v=>({...go(v,'rooms',{species,filter:v,sex}),active:v===filter})),
      ['全部','公','母'].map(v=>({...go(v,'rooms',{species,filter,sex:v}),active:v===sex}))]};
}
function checkin(s,now) {
  const signed=s.care.signedDay===dayAt(now);
  const rows=[{title:'今日后备种源',text:'原色幼兔一公一母，栗野花色，六维均为 B。每天北京时间零点更新。'}];
  if(signed) rows.push(...s.pets.filter(p=>s.care.claimIds.includes(p.id)).map(p=>petRow(s,p,now)));
  return {title:'每日签到',art:'shop-modules/checkin',subtitle:signed?'今日已领取':'今日可领取',rows,
    presentation:{kind:'checkin',date:dayAt(now),signed},
    actions:[...(signed?[]:[act('领养两只幼兔','care.checkin',{},undefined,'profile')]),go('查看兔房名册','rooms',{species:'rabbit'})]};
}
function ageDescription(ms) {
  const minutes=Math.max(0,Math.floor(ms/60000));
  if(!minutes)return '不足 1 分钟';
  const days=Math.floor(minutes/1440), hours=Math.floor(minutes/60)%24;
  return [days&&days+' 天',hours&&hours+' 小时',minutes%60&&minutes%60+' 分钟'].filter(Boolean).join(' ');
}
function priceRows(s,p,now) {
  const v=valuation(s,p,now), dead=v.stage==='已故';
  const total=salePrice(s,p,now,dead?'recycle':'market');
  const terms=[{title:'品种和品质',text:'品种基价 '+v.base+' 金币 · 六维及标签折算品质系数约 '+Number((v.qualityUnits/600).toFixed(4))},
    {title:'荣誉加价',text:v.honor+' 金币 · 取该动物历来最高荣誉'},
    {title:'店铺加成',text:'成交额 +'+Number(((v.multiplier-10000)/100).toFixed(2))+'%'}];
  if(dead)terms.splice(1,0,{title:'已故回收',text:'保底 '+v.minimum+' 金币'+(v.honor?'，成年估值 '+v.adult+' 的 10% 加荣誉的 50%，取整后与保底取高。':'，本只按保底回收。')});
  else terms.splice(1,0,{title:'阶段与繁育',text:v.stage+'按 '+v.stagePercent+'% 估值 '+v.value+' 金币。'+(p.bred?'已繁育保留 '+v.bredRate+'%，计 '+v.retained+' 金币（保底 '+v.minimum+'）。':'未繁育，计 '+v.retained+' 金币。')});
  terms.push({title:dead?'当前回收估值':'当前市场估值',text:total+' 金币'+(p.retained?' · 已留种保护':isBusy(s,p)?' · 繁育中':'')});
  return terms;
}
function detail(s,a,now) {
  const p=s.pets.find(p=>p.id===a.id);
  if(!p)return empty('动物档案','这只动物已离店。');
  const stage=stageOf(p,now),until=stageEnd(p,now), dates=lifeDates(p);
  const history=p.reviewHistory??[],unrecorded=p.reviews-history.length;
  return {title:'个体档案',art:petArt(p),stage,subtitle:breedName(p)+' · '+coatName(p)+' · '+p.sex,
    presentation:{kind:'pet',species:SPECIES[p.species].name,speciesKey:p.species,animal:specimen(s,p,now),traits:p.traits},
    rows:[{title:stage+' · '+stockStatus(s,p),text:until?'距离下一阶段约 '+describeRemaining(until-now):p.retained?'取消留种后可交给研究所回收。':'已故个体可由研究所回收。'},
      {title:'身份 #'+number(p),text:p.source+(p.motherId?' · 母 '+p.motherName+' / 父 '+p.fatherName:'')+(p.mixed?' · 外形 '+BREEDS[p.breedKey].name:'')},
      ...p.traits.map(t=>({title:t.type+' · '+t.grade,text:t.label+' · '+t.rarity})),
      {title:'复评 '+p.reviews+' / 3 次',text:'已获最高荣誉系数 '+p.honor},
      {title:stage==='已故'?'寿终时年龄':'实际年龄',text:ageDescription(Math.min(now,dates.deathAt)-p.bornAt)},
      {title:'出生时刻',text:beijingTime(p.bornAt)+'（北京）'},
      {title:'成年时刻',text:beijingTime(dates.adultAt)+'（北京）'},
      ...(stage==='已故'?[{title:'自然寿终',text:beijingTime(dates.deathAt)+'（北京）'}]:[]),
      ...priceRows(s,p,now),
      ...(unrecorded>0?[{title:'早期复评',text:'此前 '+unrecorded+' 次复评仅留有次数。'}]:[]),
      ...history.map(h=>({title:fields[h.field]+'复评',text:beijingTime(h.at)+'（北京） · '+h.before+'（'+h.beforeRarity+'） → '+h.after+'（'+h.afterRarity+'） · 评分 '+h.grade}))],
    actions:[...(stage!=='已故'||p.retained?[{label:p.retained?'取消留种':'留种',type:'care.retain',args:{id:p.id,retained:!p.retained}}]:[]),
      ...(canBreed(s,p,now)?[go('去繁育台配对','breed',{species:p.species,[p.sex==='公'?'father':'mother']:p.id})]:[]),
      ...(!isBusy(s,p)&&stage!=='已故'?[go('特征复评','review',{species:p.species,id:p.id})]:[]),
      ...(!isBusy(s,p)&&!p.retained?[stage==='已故'?go('前往研究所回收','recycle',{species:p.species,preselectId:p.id}):go('前往自由市场','market',{preselectId:p.id})]:[])]};
}
function pairPage(s,a,now) {
  const species=speciesKey(a),room=s.rooms[species],cfg=SPECIES[species];
  if(!room) return closedRoom(s,species,'breed',now);
  if(room.job) return {title:'繁育台',art:cfg.art,subtitle:'繁育进行中',
    presentation:{kind:'breeding',species:cfg.name,endsAt:room.job.endsAt,remaining:room.job.endsAt-now,
      parents:[room.job.mother,room.job.father].map(p=>specimen(s,p,now))},
    rows:[{title:room.job.mother.name+' × '+room.job.father.name,text:'预计 '+describeRemaining(room.job.endsAt-now)+' 后出生。离开店铺也会继续计时。'}],
    tabs:options(s,'breed',species),actions:[go('前往动物房间','rooms',{species})]};
  const choices=s.pets.filter(p=>p.species===species&&canBreed(s,p,now));
  const mother=choices.find(p=>p.id===a.mother&&p.sex==='母'),father=choices.find(p=>p.id===a.father&&p.sex==='公');
  const args={species,...(mother?{mother:mother.id}:{}),...(father?{father:father.id}:{})};
  if(!mother||!father||a.picking) {
    const sex=!mother?'母':'公',pool=choices.filter(p=>p.sex===sex);
    return {title:'繁育台',art:'shop-modules/breeding-guide',subtitle:'挑选一公一母 · 目前可配 '+choices.length+' 只',
      presentation:{kind:'pair',species:cfg.name,wait:cfg.wait,parents:[mother,father].map(p=>p?specimen(s,p,now):null),
        candidates:choices.map(p=>specimen(s,p,now)),confirm:mother&&father?go('核对亲本','breed',args):null},
      rows:[{title:mother?'母本：'+mother.name:father?'父本：'+father.name:'选择亲本',text:'点选一只可配的'+sex+'性作为'+(sex==='母'?'母本':'父本')+'。'},
        ...pool.map(p=>petRow(s,p,now,'breed',{...args,[sex==='母'?'mother':'father']:p.id})),
        ...(!pool.length?[{title:'暂无合适的'+sex+'性亲本',text:'成年、老年且未繁育的空闲动物可参与配对。'}]:[])],
      tabs:options(s,'breed',species),actions:[...(room.lastLitter?[go('查看最近一窝','litter',{species})]:[]),go('查看房间','rooms',{species})]};
  }
  const allowed=fields.map((_,i)=>i).filter(i=>mother.traits[i].grade!==father.traits[i].grade);
  const guide=allowed.includes(a.guide)&&room.items.guide>0?a.guide:-1;
  const levels=s.research?.[species]??[0,0,0];
  const motherLook=BREEDS[mother.breedKey].name,fatherLook=BREEDS[father.breedKey].name;
  const registration=mixedOffspring(mother,father)?'杂交':motherLook;
  const appearance=mother.breedKey===father.breedKey?'幼体都是'+motherLook+'外形。':
    '每只幼体独立决定外形，'+motherLook+'和'+fatherLook+'各占 50%。';
  return {title:'确认配对',subtitle:mother.name+' × '+father.name,art:cfg.art,animals:[petArt(mother),petArt(father)],animalStages:[stageOf(mother,now),stageOf(father,now)],
    presentation:{kind:'pairConfirm',species:cfg.name,wait:cfg.wait,parents:[mother,father].map(p=>specimen(s,p,now))},
    rows:[{title:'后代登记品种 · '+registration,text:appearance},
      {title:'一生仅一次繁育',text:'开始后不可取消或换亲本。等待 '+cfg.wait+' 分钟，预计 '+cfg.min+'–'+(cfg.min+cfg.litter.length-1)+' 只。'},
      ...fields.map((f,i)=>({title:f,text:'母 '+mother.traits[i].grade+' '+mother.traits[i].label+'　父 '+father.traits[i].grade+' '+father.traits[i].label})),
      {title:'出生研究加成',text:'重抽稀有率 +'+(levels[0]*5)+'% · 正向变异率 +'+(room.mutationEnabled?levels[1]*3:0)+'%（相对基础）'},
      {title:'选育指导单 '+room.items.guide+' 张',text:guide>=0?
        '已选「'+fields[guide]+'」。每只幼体有 80% 的机会从较高分起算，20% 从较低分起算，之后仍可能升降。若比赛目标较低，指导可能让幼体离目标更远。':
        '配对前可选一项父母评分不同的特征，让这一窝幼体更容易随分数高的一方。'}],
    actions:[act('开始繁育','care.breed',{...args,guide},'确认让 '+mother.name+' 和 '+father.name+' 使用一生唯一的繁育机会？'+
      (mother.retained||father.retained?'幼体出生时，双亲自动取消留种。':'')+(guide>=0?'将使用一张选育指导单。若目标偏低，按高分选育可能更难匹配。':''),'breed',{species}),
      go('修改亲本','breed',{...args,picking:true}),act(room.mutationEnabled?'关闭六维加成':'启用六维加成','care.toggle',{species,enabled:!room.mutationEnabled},undefined,'breed',{...args,guide}),
      ...(guide>=0?[go('撤下指导单','breed',args)]:[]),...(room.items.guide?allowed.map(i=>go('指导'+fields[i],'breed',{...args,guide:i})):[])]};
}
function litterParents(s,litter,children,now) {
  // Older litters store names. A remaining child's parent IDs can still identify
  // the adults without guessing from names shared by unrelated animals.
  const child=children[0];
  const parents=litter.parents??[
    {id:child?.motherId,name:litter.mother,sex:'母'},
    {id:child?.fatherId,name:litter.father,sex:'公'},
  ];
  return parents.map(parent=>{
    const resident=parent.id&&s.pets.find(p=>p.id===parent.id);
    const record=resident||(Number.isFinite(parent.bornAt)?parent:null);
    const whenBorn=record?(stageOf(record,litter.bornAt)==='已故'?'本窝出生时已自然寿终。':'本窝出生时仍在世，已完成一生唯一的一窝。'):'旧记录未保存出生当刻的生命状态。';
    let current='';
    if(resident)current=stageOf(resident,now)==='已故'?'自然寿终于 '+beijingTime(lifeDates(resident).deathAt)+'（北京）。':'目前仍在房内，已繁育。';
    else if(parent.id){
      const sale=s.sales?.find(entry=>entry.lines.some(line=>line.id===parent.id));
      if(sale)current=beijingTime(sale.at)+(sale.channel==='recycle'?' 已由研究所回收。':' 已出售离店。');
    }
    return {title:(parent.sex==='母'?'母本':'父本')+' · '+parent.name,text:whenBorn+current};
  });
}
function litter(s,a,now) {
  const species=speciesKey(a),room=s.rooms[species],l=room?.lastLitter;
  if(!l) return empty('出生记录','这间房还没有出生记录。');
  const pets=l.ids.map(id=>s.pets.find(p=>p.id===id)).filter(Boolean);
  return {title:'这一窝出生了',subtitle:l.mother+' × '+l.father+' · 共 '+l.ids.length+' 只',
    presentation:{kind:'litter',species:SPECIES[species].name,count:l.ids.length,bornAt:l.bornAt},
    art:SPECIES[species].art,animals:pets.slice(0,3).map(petArt),animalStages:pets.slice(0,3).map(p=>stageOf(p,now)),
    rows:[{title:'本窝出生',text:beijingTime(l.bornAt)+'（北京时间） · 共 '+l.ids.length+' 只'},
      ...litterParents(s,l,pets,now),
      ...pets.map(p=>petRow(s,p,now)),...(l.ids.length>pets.length?[{title:'已离店 '+(l.ids.length-pets.length)+' 只'}]:[])],
    actions:[go('挑选留种','litterKeep',{species,bornAt:l.bornAt}),go('前往动物房间','rooms',{species})]};
}
function litterSelection(s,page,a,now) {
  const species=speciesKey(a), latest=s.rooms[species]?.lastLitter;
  if(!latest||latest.bornAt!==a.bornAt){
    return {title:'出生记录已更新',rows:[{title:'请重新打开这间房的出生记录。'}],actions:[go('查看出生记录','litter',{species})]};
  }
  const members=litterMembers(s,latest,now), eligible=members.filter(p=>!p.retained);
  const identity={species,bornAt:latest.bornAt};
  if(page==='litterKeep') {
    return {title:'挑选留种',subtitle:'已有种源自动保留。勾选本次留种的动物，其余进入出售核价。',selectionLabel:'留养',
      rows:members.map(p=>({...petRow(s,p,now),...(!p.retained&&{select:p.id})})),empty:'这一窝当前没有可出售的动物。',
      actions:eligible.length?[{...go('核对其余动物售价','litterSale',{...identity,offered:eligible.map(p=>p.id)}),
        useSelection:true,allowEmptySelection:true}]:[go('查看出生记录','litter',{species})]};
  }
  const candidates=new Set(eligible.map(p=>p.id));
  if(!Array.isArray(a.offered)||a.offered.length!==candidates.size||new Set(a.offered).size!==candidates.size||
      !a.offered.every(id=>candidates.has(id))||!Array.isArray(a.ids)||new Set(a.ids).size!==a.ids.length||
      !a.ids.every(id=>candidates.has(id))){
    return {title:'本窝名册已变化',rows:[{title:'请重新勾选要留养的动物。'}],actions:[go('重新挑选','litterKeep',identity)]};
  }
  const keep=new Set(a.ids);
  const sell=eligible.filter(p=>!keep.has(p.id)).map(p=>p.id);
  const decision={...identity,keepIds:a.ids}, keptCount=members.length-sell.length;
  if(!sell.length) return {title:'整窝留种',subtitle:'本次出售 0 只',rows:[{title:'留下 '+keptCount+' 只动物',text:'确认后显示「种源」标签。'}],
    actions:[...(keep.size?[{label:'确认留种',type:'care.keepLitter',args:decision}]:[]),{label:'修改选择',type:'ui.editSelection'}]};
  const quote=businessPage(s,'saleQuote',{channel:'market',ids:sell},now);
  quote.subtitle='留养 '+keptCount+' 只 · '+quote.subtitle;
  quote.actions=quote.actions.map(action=>action.type==='sale.commit'?{...action,args:{...action.args,litterRetention:decision}}:action);
  return quote;
}
function shelves(s,a,now) {
  const species=speciesKey(a),room=s.rooms[species],cfg=SPECIES[species];
  if(!room)return closedRoom(s,species,'shelf',now);
  return {title:cfg.name+'种源货架',art:'shop-modules/lab',subtitle:'本批剩余 '+describeRemaining(room.openedAt+(room.shelf.number+1)*1_800_000-now),
    rows:room.shelf.offers.map((p,i)=>p?link(p.name+' · '+p.sex,breedName(p)+' · '+coatName(p)+' · '+purchasePrice(s,youngPurchaseBase(p))+' 金币',
      'offer',{species,id:p.id},{art:petArt(p),stage:'幼年'}):{title:(i===0?'公':'母')+'幼体 · 本批已售',text:'本批不再补货。下一批的品种和标签随机。'}),
    tabs:options(s,'shelf',species)};
}
function offerPage(s,a,now) {
  const species=speciesKey(a),room=s.rooms[species],p=room?.shelf.offers.find(x=>x?.id===a.id);
  if(!p)return {title:'种源货位',rows:[{title:'该幼体已经售出或换批。'}],actions:[go('查看本批货架','shelf',{species})]};
  const base=youngPurchaseBase(p),price=purchasePrice(s,base);
  return {title:p.name+' · '+p.sex,subtitle:breedName(p)+' · '+coatName(p)+' · 幼年',art:petArt(p),
    rows:[{title:'采购报价',text:'基准 '+base+' · 实付 '+price+' 金币'},...offerOrderRows(s,p,now),
      {title:'估价有效条件',text:'按当前店铺评分、订单和幼体状态估算。成长、获奖或订单变化后，交付时会重新核价。'},
      ...p.traits.map(t=>({title:t.type+' · '+t.grade,text:t.label+' · '+t.rarity}))],
    actions:[act('购买幼体','care.buyPet',{species,id:p.id,batch:room.shelf.number,price},'支付 '+price+' 金币购买 '+p.name+'？','shelf',{species})]};
}
function services(s,a,now) {
  const species=speciesKey(a),room=s.rooms[species],cfg=SPECIES[species];
  if(!room)return closedRoom(s,species,'services',now);
  return {title:cfg.name+'用服务单',art:'shop-modules/lab',
    rows:Object.keys(itemName).map(item=>{
      const price=purchasePrice(s,cfg[item]);
      const effect=item==='review'?'选一项特征重新抽标签。可能抽回原词或降稀有度，仍消耗一次，评分不变。每只动物最多用 3 张。':
        '配对前选一项父母评分不同的特征。每只幼体有 80% 的机会按高分起算。若比赛目标较低，可能更难匹配。';
      return {title:itemName[item]+' · 持有 '+room.items[item]+' 张',
        text:effect+'\n每张 '+price+' 金币'+(price===cfg[item]?'':'（原价 '+cfg[item]+' 金币）')};
    }),
    tabs:options(s,'services',species),actions:[...Object.keys(itemName).map(item=>{const price=purchasePrice(s,cfg[item]);return act('购买'+itemName[item],'care.buyItem',{species,item,price},
      '购买一张'+cfg.name+'用'+itemName[item]+'？基准 '+cfg[item]+' 金币，实付 '+price+' 金币。','services',{species});}),
      go('选择动物复评','review',{species}),go('前往繁育台','breed',{species})]};
}
function review(s,a,now) {
  const species=speciesKey(a),room=s.rooms[species];
  if(!room)return closedRoom(s,species,'review',now);
  const animals=s.pets.filter(p=>p.species===species&&stageOf(p,now)!=='已故'&&!isBusy(s,p)&&p.reviews<3);
  const p=animals.find(p=>p.id===a.id);
  if(!p) return {title:'选择复评动物',subtitle:SPECIES[species].name+'用复评单 '+room.items.review+' 张',
    rows:animals.map(p=>petRow(s,p,now,'review',{species,id:p.id})),empty:'没有符合条件的动物。',actions:[go('购入服务单','services',{species})]};
  return {title:p.name+' · 特征复评',art:petArt(p),subtitle:'剩余次数 '+(3-p.reviews)+' · 持有 '+room.items.review+' 张',
    rows:[{title:'想换哪项特征？',text:'普通、少见、稀有的机会分别是 70%、20%、10%。新标签直接替换原标签，评分不变。即使同词或稀有度降低，也消耗一张单和一次额度，无法选回。'},
      ...p.traits.slice(0,5).map((t,i)=>({title:t.type+' · '+t.label,text:t.rarity+' · '+t.grade,
        ...(room.items.review?{action:{type:'care.review',args:{species,id:p.id,field:i},confirm:'给「'+p.name+'」重抽'+t.type+'标签「'+t.label+'」？同词或降档也消耗 1 张单和 1 次额度，无法选回。评分仍是 '+t.grade+'。',go:'pet',goArgs:{id:p.id}}}:{})}))],
    actions:[go('购入服务单','services',{species}),go('查看档案','pet',{id:p.id})]};
}
export function carePage(s,page,args={},now) {
  switch(page) {
    case 'roomReceipt': return openingReceipt(s,speciesKey(args));
    case 'rooms': case 'roomRoster': return roster(s,args,now);
    case 'profile': return checkin(s,now);
    case 'pet': return detail(s,args,now);
    case 'breed': return pairPage(s,args,now);
    case 'litter': return litter(s,args,now);
    case 'litterKeep': case 'litterSale': return litterSelection(s,page,args,now);
    case 'shelf': return shelves(s,args,now);
    case 'offer': return offerPage(s,args,now);
    case 'services': return services(s,args,now);
    case 'review': return review(s,args,now);
    default:return null;
  }
}
