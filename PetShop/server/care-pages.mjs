import {
  SPECIES, BREEDS, stageOf, stageEnd, breedName, petArt, fields, coatName, canBreed, stockStatus, dayAt, isBusy, itemName, litterCandidates, mixedOffspring,
  lifeDates, beijingTime, rosterStage, shelfBatchEndsAt, stageNames, mutationPreview, specimen, nextCheckinBreed,
  guideField, serviceItemPrice, serviceItemStock, serviceItemUnit, selectionItemNames, selectionFieldCount, validSelection,
  antiAgeUses, antiAgeLimit, reshapeUses, reshapeLimit,
} from './care.mjs';
import { rabbitWaitingForOpening } from './onboarding.mjs';
import { businessPage, offerOrderRows, purchasePrice, salePrice, youngPurchaseBase } from './business.mjs';
import { activeNutrition, nutritionPage } from './room-nutrition.mjs';
import { getPetTags } from './animal-traits.mjs';
import { defectDisplayLabel } from './defect.mjs';

const go = (label,page,args={}) => ({label,page,args});
const link = (title,text,page,args={},extra={}) => ({title,text,link:{page,args},...extra});
const act = (label,type,args,confirm,page,goArgs={}) => ({label,type,args,confirm,go:page,goArgs});
const number = p=>p.id.slice(0,5).toUpperCase();
const options = (s,page,current)=>Object.entries(SPECIES).map(([species,c])=>({...go(c.name+'房',page,{species}),active:species===current,
  locked:!s.rooms[species]||(species==='rabbit'&&rabbitWaitingForOpening(s))}));
const petRow = (s,p,now,page='pet',args={id:p.id})=>{
  const animal=specimen(s,p,now);
  return link(animal.name+' · '+animal.sex,[animal.breed,animal.coat,animal.stage,animal.status].join(' · '),
    page,args,{art:animal.art,stage:animal.stage,animal});
};
const describeRemaining = ms=>ms<60_000?Math.max(1,Math.ceil(ms/1000))+' 秒':ms<3_600_000?Math.ceil(ms/60_000)+' 分钟':ms<86_400_000?Math.ceil(ms/3_600_000)+' 小时':Math.ceil(ms/86_400_000)+' 天';
const empty = (title,text,page='rooms')=>({title,rows:[{title:text}],actions:[go('查看名册',page)]});
const speciesKey = a=>a.species&&Object.hasOwn(SPECIES,a.species)?a.species:'rabbit';
function closedRoom(s,species,page,now) {
  if(species==='rabbit'&&rabbitWaitingForOpening(s)){
    return {title:'动物小屋',art:SPECIES.rabbit.art,visual:{openingRoom:true},
      presentation:{kind:'locked',species:'兔',breed:BREEDS.domestic.name,youngArt:'pets/domestic-coat01_female'},
      tabs:options(s,page,species),rows:[],
      actions:page==='rooms'?[act('免费开放兔房','onboarding.openRoom',{},undefined,'rooms',{species})]:
        [go('查看兔房','rooms',{species})]};
  }
  const c=SPECIES[species],cost=purchasePrice(s,c.roomCost), firstBreed=BREEDS[c.breeds[0]];
  const {name:breed,maturityMinutes:maturity}=firstBreed;
  const estimate=beijingTime(now+maturity*60_000).slice(0,16);
  const balance=s.coins-cost;
  return {title:c.name+'房 · 待开放',art:'rooms/unfinished-room',subtitle:'新房套餐',
    presentation:{kind:'locked',species:c.name,youngArt:'pets/'+c.breeds[0]+'-coat01_female',maturity,estimate,breed,price:cost,coins:s.coins},
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
  if(!room||(species==='rabbit'&&rabbitWaitingForOpening(s))) return closedRoom(s,species,'rooms',now);
  const all=s.pets.filter(p=>p.species===species);
  const breedKey=p=>p.mixed?'mixed':p.breedKey;
  const breeds=new Map(all.map(p=>[breedKey(p),breedName(p)]));
  const breed=breeds.has(a.breed)?a.breed:undefined;
  const stage=rosterStage(a.stage,a.filter);
  const shown=[];
  let nextStageAt=null;
  for(const p of all){
    const end=stageEnd(p,now);
    if(end!==null&&(nextStageAt===null||end<nextStageAt))nextStageAt=end;
    if((breed&&breedKey(p)!==breed)||(stage!=='全部'&&stageOf(p,now)!==stage))continue;
    const row=petRow(s,p,now);
    row.animal.stageEndsAt=end;
    shown.push(row);
  }
  const residents=shown.slice(0,10).map(row=>row.animal);
  const nutrition=activeNutrition(room,now);
  return {title:'动物小屋',art:cfg.art,animals:residents.map(p=>p.art),animalStages:residents.map(p=>p.stage),
    presentation:{kind:'rooms',species:cfg.name,count:all.length,matchedCount:shown.length,residents,nextStageAt,
      ...(nutrition&&{nutrition})},
    subtitle:'名册 '+shown.length+' 只 · '+(breeds.get(breed)??'全部')+' · '+stage,
    rows:[link(room.job?'查看正在繁育的一窝':'进入繁育台',room.job?'预计 '+describeRemaining(room.job.endsAt-now)+' 后出生':'挑选亲本，查看幼体的缺陷率和完美无缺率','breed',{species}),
      ...(room.lastLitter?[link('最近出生的一窝',room.lastLitter.ids.length+' 只','litter',{species})]:[]),
      ...(room.openingReceipt?[link('查看入住回执','购房时的两只幼体、成年时刻与余款','roomReceipt',{species})]:[]),
      ...shown,...(!shown.length?[{title:'当前筛选下没有动物。'}]:[])],
    tabs:options(s,'rooms',species),filters:[
      [['','全部'],...breeds].map(([key,label])=>({...go(label,'rooms',{species,...(key&&{breed:key}),stage}),
        active:key===(breed??'')})),
      ['全部',...stageNames].map(v=>({...go(v,'rooms',{species,...(breed&&{breed}),stage:v}),active:v===stage}))]};
}
function checkin(s,now) {
  const signed=s.care.signedDay===dayAt(now);
  const breedKey=signed?s.care.claimAnimals?.[0]?.breedKey??'domestic':nextCheckinBreed(s);
  const {name:breed,coats,maturityMinutes:maturity}=BREEDS[breedKey];
  const rows=[{title:'今日后备种源',text:breed+'幼体一公一母，'+coats[0]+'花色，六维均为 B。每天北京时间零点更新。'}];
  if(signed) rows.push(...s.pets.filter(p=>s.care.claimIds.includes(p.id)).map(p=>petRow(s,p,now)));
  return {title:'每日签到',art:'shop-modules/checkin',subtitle:signed?'今日已领取':'今日可领取',rows,
    presentation:{kind:'checkin',date:dayAt(now),signed,breed,youngArt:'pets/'+breedKey+'-coat01_female',maturity},
    actions:[...(signed?[]:[act('领养两只幼兔','care.checkin',{},undefined,'profile')]),go('查看兔房名册','rooms',{species:'rabbit'})]};
}
function checkinReceipt(s) {
  const animals=s.care.claimAnimals??s.pets.filter(p=>s.care.claimIds?.includes(p.id));
  if(!animals.length)return {title:'签到记录',rows:[{title:'暂无可查看的领取记录。'}],actions:[{label:'关闭',type:'ui.back'}]};
  return {title:'签到成功',subtitle:'获得 '+animals.length+' 只幼兔',
    rows:animals.map(p=>({title:p.name+' · '+p.sex,text:breedName(p)+' · '+coatName(p)+' · 幼年',art:petArt(p),stage:'幼年'})),
    actions:[{label:'知道了',type:'ui.back'}]};
}
function ageDescription(ms) {
  const minutes=Math.max(0,Math.floor(ms/60000));
  if(!minutes)return '不足 1 分钟';
  const days=Math.floor(minutes/1440), hours=Math.floor(minutes/60)%24;
  return [days&&days+' 天',hours&&hours+' 小时',minutes%60&&minutes%60+' 分钟'].filter(Boolean).join(' ');
}
function priceRows(s,p,now) {
  const dead=stageOf(p,now)==='已故';
  const total=salePrice(s,p,now,dead?'recycle':'market');
  return [{title:dead?'当前回收估值':'当前市场估值',text:total+' 金币'+(p.retained?' · 已留种保护':isBusy(s,p)?' · 繁育中':'')}];
}
function detail(s,a,now) {
  const p=s.pets.find(p=>p.id===a.id);
  if(!p)return empty('动物档案','这只动物已离店。');
  const stage=stageOf(p,now),until=stageEnd(p,now), dates=lifeDates(p);
  const history=p.reviewHistory??[],unrecorded=p.reviews-history.length;
  const room=s.rooms[p.species],doses=antiAgeUses(p),reshaped=reshapeUses(p);
  const hasAntiAge=room&&serviceItemStock(room,'antiAge')>0;
  const hasReshape=room&&serviceItemStock(room,'reshape')>0;
  return {title:'个体档案',art:petArt(p),stage,subtitle:breedName(p)+' · '+coatName(p)+' · '+p.sex,
    presentation:{kind:'pet',species:SPECIES[p.species].name,speciesKey:p.species,animal:specimen(s,p,now),traits:p.traits.slice(0,5),nextStageAt:until},
    rows:[{title:'阶段',text:until?stage+' · 距'+({幼年:'成长',成长:'成年',成年:'老年',老年:'寿终'}[stage])+' '+describeRemaining(until-now):
      stage!=='已故'?'仍在房内。':p.retained?'取消留种后可前往动物回收。':'已故个体可在培育中心回收。'},
      {title:'来源',text:p.source+(p.motherId?' · 母 '+p.motherName+' / 父 '+p.fatherName:'')+(p.mixed?' · 外形 '+BREEDS[p.breedKey].name:'')},
      {title:'复评 '+p.reviews+' / 3 次',text:'已获最高荣誉系数 '+p.honor},
      {title:stage==='已故'?'寿终时年龄':'实际年龄',text:ageDescription(Math.min(now,dates.deathAt)-p.bornAt)},
      {title:'出生时刻',text:beijingTime(p.bornAt)+'（北京）'},
      {title:'成年时刻',text:beijingTime(dates.adultAt)+'（北京）'},
      ...(doses?[{title:'抗衰老药剂',text:'已用 '+doses+' / '+antiAgeLimit+' 份 · 老年期增加 '+doses+' 天'}]:[]),
      ...(reshaped?[{title:'缺陷重塑剂',text:'已用 '+reshaped+' / '+reshapeLimit+' 份'}]:[]),
      ...(stage==='已故'?[{title:'自然寿终',text:beijingTime(dates.deathAt)+'（北京）'}]:[]),
      ...priceRows(s,p,now),
      ...(unrecorded>0?[{title:'早期复评',text:'此前 '+unrecorded+' 次复评仅留有次数。'}]:[]),
      ...history.map(h=>({title:fields[h.field]+'复评',text:beijingTime(h.at)+'（北京） · '+h.before+'（'+h.beforeRarity+'） → '+h.after+'（'+h.afterRarity+'） · 评分 '+h.grade}))],
    actions:[...(p.retained||(!p.bred&&stage!=='已故')?[{label:p.retained?'取消留种':'留种',type:'care.retain',args:{id:p.id,retained:!p.retained}}]:[]),
      ...(canBreed(s,p,now)?[go('去繁育台配对','breed',{species:p.species,[p.sex==='公'?'father':'mother']:p.id})]:[]),
      ...(!isBusy(s,p)&&stage!=='已故'?[{...go(p.reviews>=3?'复评次数已用完':'特征复评','review',{species:p.species,id:p.id}),disabled:p.reviews>=3}]:[]),
      ...(hasAntiAge&&stage!=='已故'&&doses<antiAgeLimit?[act('使用抗衰老药剂','care.antiAge',{species:p.species,id:p.id},
        '用 1 份后，老年期会多 1 天。还可用 '+(antiAgeLimit-doses)+' 次。','pet',{id:p.id})]:[]),
      ...(hasReshape&&['幼年','成长'].includes(stage)&&reshaped<reshapeLimit?[act('使用缺陷重塑剂','care.reshape',{species:p.species,id:p.id},
        '55% 减轻一档，45% 加重一档。若结果超过最高或最低档，会保留原档，仍消耗 1 份。还可用 '+(reshapeLimit-reshaped)+' 次。','pet',{id:p.id})]:[]),
      ...(!isBusy(s,p)&&!p.retained?[stage==='已故'?go('前往动物回收','recycle',{species:p.species,preselectId:p.id}):go('前往自由市场','market',{preselectId:p.id})]:[])]};
}
function pairPage(s,a,now) {
  const species=speciesKey(a),room=s.rooms[species],cfg=SPECIES[species];
  const speciesFilter=options(s,'breed',species).map(choice=>({...choice,
    label:SPECIES[choice.args.species].name+(choice.locked?' · 未开放':''),args:{...choice.args,picking:true}}));
  if(!room||(species==='rabbit'&&rabbitWaitingForOpening(s)))
    return {...closedRoom(s,species,'breed',now),filters:[speciesFilter]};
  if(room.job) return {title:'繁育台',art:cfg.art,subtitle:'繁育进行中',
    presentation:{kind:'breeding',species:cfg.name,endsAt:room.job.endsAt,remaining:room.job.endsAt-now,
      parents:[room.job.mother,room.job.father].map(p=>specimen(s,p,now))},
    rows:[{title:room.job.mother.name+' × '+room.job.father.name,text:'预计 '+describeRemaining(room.job.endsAt-now)+' 后出生。离开店铺也会继续计时。'}],
    tabs:options(s,'breed',species),filters:[speciesFilter],actions:[go('前往动物房间','rooms',{species})]};
  const choices=s.pets.filter(p=>p.species===species&&canBreed(s,p,now))
    .sort((a,b)=>Number(b.retained===true)-Number(a.retained===true));
  const mother=choices.find(p=>p.id===a.mother&&p.sex==='母'),father=choices.find(p=>p.id===a.father&&p.sex==='公');
  const breed=cfg.breeds.includes(a.breed)||a.breed==='mixed'?a.breed:undefined;
  const args={species,...(breed&&{breed}),...(mother?{mother:mother.id}:{}),...(father?{father:father.id}:{})};
  const guide=mother&&father&&a.useGuide===true&&room.items.guide>0&&!a.picking?guideField(s,mother,father):-1;
  const selection=validSelection(room,a.selection)&&!a.picking?a.selection:null;
  const [rare=0,mutation=0]=s.research?.[species]??[];
  const preview=mother&&father?mutationPreview(mother,father,guide,mutation,!!room.mutationEnabled):undefined;
  if(!mother||!father||a.picking) {
    const shown=choices.filter(p=>!breed||(p.mixed?'mixed':p.breedKey)===breed);
    const sex=!mother?'母':'公',pool=shown.filter(p=>p.sex===sex);
    const breeds=[...cfg.breeds,...(choices.some(p=>p.mixed)||breed==='mixed'?['mixed']:[])];
    const breedFilter=[[undefined,'全部'],...breeds.map(key=>[key,key==='mixed'?'杂交':BREEDS[key].name])]
      .map(([key,label])=>({...go(label,'breed',{...args,breed:key??null,picking:true}),active:key===breed}));
    return {title:'繁育台',art:'shop-modules/breeding-guide',subtitle:'挑选一公一母 · 目前可配 '+choices.length+' 只',
      presentation:{kind:'pair',species:cfg.name,wait:cfg.wait,parents:[mother,father].map(p=>p?specimen(s,p,now):null),mutationPreview:preview,
        candidates:shown.map(p=>specimen(s,p,now)),confirm:mother&&father?go('核对亲本','breed',args):null},
      rows:[
        {title:mother?'母本：'+mother.name:father?'父本：'+father.name:'选择亲本',text:'点选一只可配的'+sex+'性作为'+(sex==='母'?'母本':'父本')+'。'},
        ...pool.map(p=>petRow(s,p,now,'breed',{...args,[sex==='母'?'mother':'father']:p.id})),
        ...(!pool.length?[{title:'暂无合适的'+sex+'性亲本',text:'成年、老年且未繁育的空闲动物可参与配对。'}]:[])],
      tabs:options(s,'breed',species),filters:[speciesFilter,breedFilter],actions:[...(room.lastLitter&&!room.lastLitter.viewed?[go(room.lastLitter.bornAt===s.onboarding?.firstLitterAt?'查看首窝':'查看最近一窝','litter',{species})]:[]),go('查看房间','rooms',{species})]};
  }
  const registration=mixedOffspring(mother,father)?'杂交':BREEDS[mother.breedKey].name;
  const summary=['确认让 '+mother.name+' 和 '+father.name+' 使用一生唯一的繁育机会？','后代品种 '+registration];
  const research=[];
  if(rare>0)research.push('稀有率+'+(rare*5)+'%');
  if(room.mutationEnabled&&mutation>0)research.push('属性提升+'+(mutation*3)+'%');
  if(research.length)summary.push('研究加成 '+research.join('，'));
  const selectedItems=[];
  if(guide>=0){
    const same=mother.traits[guide].grade===father.traits[guide].grade;
    summary.push('选育指导单抽中「'+fields[guide]+'」。'+(same?'父母同档，照常遗传。':'每只幼崽有 80% 的机会从较高档起算，之后自然升降。')+'整窝显示绿色「优选」。');
    selectedItems.push({title:'选育指导单 · '+fields[guide],text:(same?'双亲同档，照常遗传。':'双亲异档时，80% 从较高档起算，再自然升降。')+'整窝显示绿色「优选」。'});
  }
  if(selection){
    const selectedFields=selection.fields.map(i=>fields[i]).join('、');
    summary.push(selectionItemNames[selection.item]+'：随机一只幼崽的'+selectedFields+'保留双亲较高等级，并显示蓝色「优选」。');
    selectedItems.push({title:selectionItemNames[selection.item]+' · '+selectedFields,
      text:'随机一只幼崽保留所选项的双亲较高等级，显示蓝色「优选」。'});
  }
  const breedingArgs={...args,...(guide>=0&&{useGuide:true}),...(selection&&{selection})};
  if(mother.retained||father.retained)summary.push('幼体出生时，双亲自动取消留种。');
  return {title:'确认配对',subtitle:mother.name+' × '+father.name,art:cfg.art,animals:[petArt(mother),petArt(father)],animalStages:[stageOf(mother,now),stageOf(father,now)],
    presentation:{kind:'pairConfirm',species:cfg.name,wait:cfg.wait,parents:[mother,father].map(p=>specimen(s,p,now)),
      guide:{count:room.items.guide,index:guide},mutationPreview:preview,
      parentTraits:fields.map((name,i)=>({name,...Object.fromEntries([['mother',mother],['father',father]].map(([side,pet])=>
        [side,{...pet.traits[i],label:i===5?defectDisplayLabel(pet.traits[i].grade):(pet.traits[i].label||'—')}]))}))},
    rows:[{title:'一生仅一次繁育',text:'开始后不可取消或换亲本。等待 '+cfg.wait+' 分钟，预计 '+cfg.min+'–'+(cfg.min+cfg.litter.length-1)+' 只。'},...selectedItems],
    actions:[act('开始繁育','care.breed',breedingArgs,summary.join('\n'),'breed',{species}),
      go('取消繁育','breed',{...args,picking:true}),
      act(room.mutationEnabled?'关闭五维加成':'启用五维加成','care.toggle',{species,enabled:!room.mutationEnabled},undefined,'breed',breedingArgs),
      go(guide>=0||selection?'已添加道具':'添加道具','breedItems',breedingArgs)]};
}

function breedingItems(s,a,now) {
  const pairing=pairPage(s,{...a,picking:false},now);
  const title='添加道具',back={type:'ui.back',label:'取消'};
  const start=pairing.actions?.find(choice=>choice.type==='care.breed');
  if(!start)return {title,rows:[{title:'亲本已变动，请返回重新选择。'}],actions:[back]};
  const species=start.args.species,room=s.rooms[species];
  const useGuide=start.args.useGuide===true;
  const item=a.selection?.item,count=selectionFieldCount(item);
  const picked=count>0&&serviceItemStock(room,item)>0;
  const chosen=picked&&Array.isArray(a.selection.fields)
    ? [...new Set(a.selection.fields.filter(i=>Number.isInteger(i)&&i>=0&&i<5))].slice(0,count) : [];
  const selection=picked?{item,fields:chosen}:null;
  const initial={species,mother:start.args.mother,father:start.args.father,...(start.args.breed&&{breed:start.args.breed})};
  const current={...initial,useGuide,selection};
  const guideTitle=(useGuide?'✓ ':'')+'选育指导单 · 持有 '+room.items.guide+' 张';
  const rows=[{
    title:guideTitle,
    text:useGuide?'系统抽中「'+fields[pairing.presentation.guide.index]+'」。整窝幼崽显示绿色「优选」。':
      '系统随机选 1 项属性。父母等级不同时，80% 从较高档起算，后续照常升降。',
    ...(room.items.guide>0&&{link:go('切换指导单','breedItems',{...current,useGuide:!useGuide})}),
  }];
  for(const [key,label] of Object.entries(selectionItemNames)){
    const stock=serviceItemStock(room,key);
    rows.push({
      title:(item===key?'✓ ':'')+label+' · 持有 '+stock+' 张',
      text:'手动选择 '+selectionFieldCount(key)+' 项，随机一只幼崽保留较高等级。',
      ...(stock>0&&{link:go(label,'breedItems',{...current,selection:item===key?null:{item:key,fields:[]}})}),
    });
  }
  if(selection){
    for(const [i,name] of fields.slice(0,5).entries()){
      const active=chosen.includes(i),next=active?chosen.filter(index=>index!==i):[...chosen,i];
      const row={title:(active?'✓ ':'')+name};
      if(next.length<=count)row.link=go(name,'breedItems',{...current,selection:{item,fields:next}});
      rows.push(row);
    }
  }
  return {title,rows,actions:[{...go('完成','breed',{...initial,...(useGuide&&{useGuide:true}),...(selection&&{selection})}),
    disabled:!!selection&&!validSelection(room,selection)},back]};
}
function litter(s,a,now) {
  const species=speciesKey(a),room=s.rooms[species],first=species==='rabbit'&&s.onboarding?.firstLitter;
  const l=first&&a.bornAt===first.bornAt?first:room?.lastLitter;
  if(!l) return empty('出生记录','这间房还没有出生记录。');
  const residents=new Map(s.pets.map(p=>[p.id,p]));
  const birthRecords=new Map((l.children??[]).map(p=>[p.id,p]));
  const missing=new Set(l.ids.filter(id=>!residents.has(id)&&!birthRecords.has(id)));
  const historicalNames=new Map();
  if(missing.size){
    for(const {pet} of Object.values(s.show?.entries??{})){
      if(!missing.has(pet?.id))continue;
      if(pet.name)historicalNames.set(pet.id,pet.name);
      if(SPECIES[species].breeds.includes(pet.breedKey)&&BREEDS[pet.breedKey].coats[pet.coatIndex-1]&&['公','母'].includes(pet.sex))birthRecords.set(pet.id,pet);
    }
    for(const sale of s.sales??[])for(const line of sale.lines)if(missing.has(line.id)&&line.name)historicalNames.set(line.id,line.name);
  }
  const children=l.ids.map(id=>{
    const current=residents.get(id);
    if(current)return {...petRow(s,current,now),litterMember:true};
    const p=birthRecords.get(id),tag='#'+number({id});
    if(!p)return {litterMember:true,title:(historicalNames.get(id)||'同窝幼体')+' · '+tag,text:'已离店 · 早期记录未保存外观'};
    const animal={id,number:number(p),name:p.name,sex:p.sex,breed:breedName(p),coat:coatName(p),stage:'幼年',status:'已离店',art:petArt(p),departed:true,
      ...(Number.isFinite(p.score)&&{score:p.score})};
    return {litterMember:true,title:p.name+' · '+p.sex,text:[animal.breed,animal.coat,tag,'已离店 · 出生时外观'].join(' · '),animal,art:animal.art,stage:animal.stage};
  });
  const portraits=children.filter(row=>row.art);
  return {title:'这一窝出生了',subtitle:'父本·'+l.father+'  母本·'+l.mother+' | 共'+l.ids.length+'只宝宝',
    presentation:{kind:'litter',species:SPECIES[species].name,speciesKey:species,count:l.ids.length,bornAt:l.bornAt},
    art:SPECIES[species].art,animals:portraits.map(row=>row.art),animalStages:portraits.map(row=>row.stage),
    rows:[{title:'本窝出生',text:beijingTime(l.bornAt)+'（北京时间）'},...children],
    actions:[go('挑选留种','litterKeep',{species,bornAt:l.bornAt}),go('前往动物房间','rooms',{species})]};
}
function litterSelection(s,page,a,now) {
  const species=speciesKey(a),room=s.rooms[species],g=s.onboarding;
  const opening=species==='rabbit'&&g?.firstLitter&&a.bornAt===g.firstLitterAt&&!g.planAt&&!g.finishedAt;
  const latest=opening?g.firstLitter:room?.lastLitter;
  if(!latest||latest.bornAt!==a.bornAt){
    return {title:'出生记录已更新',rows:[{title:'请重新打开这间房的出生记录。'}],actions:[go('查看出生记录','litter',{species})]};
  }
  const members=litterCandidates(s,latest,now), eligible=members.filter(p=>!p.retained);
  const identity={species,bornAt:latest.bornAt};
  if(opening){
    const back=go('重新挑选','litterKeep',identity);
    if(page==='litterKeep'){
      const canPlan=eligible.length>0&&members.some(p=>p.sex==='公')&&members.some(p=>p.sex==='母')&&members.length>=3;
      return {title:'首窝留种与出售',subtitle:'已有种源会保留。选一公一母留种，再选一只出售。',selectionLabel:'留种',
        rows:members.map(p=>({...petRow(s,p,now),...(!p.retained&&{select:p.id})})),
        actions:canPlan?[{...go('挑选出售','openingLitterSale',identity),useSelection:true,allowEmptySelection:true}]:
          [go('查看兔房','rooms',{species})]};
    }
    const keepIds=page==='openingLitterSale'?a.ids:a.keepIds;
    const kept=eligible.filter(p=>Array.isArray(keepIds)&&keepIds.includes(p.id));
    const retained=[...members.filter(p=>p.retained),...kept];
    if(!Array.isArray(keepIds)||new Set(keepIds).size!==kept.length||retained.length!==2||
        retained[0].sex===retained[1].sex){
      return {title:'核对首窝留种',rows:[{title:'请选择一公一母留种。'}],actions:[back]};
    }
    const saleable=eligible.filter(p=>!keepIds.includes(p.id));
    if(page==='openingLitterSale'){
      return {title:'挑选出售',subtitle:'只出售一只，其余留在兔房。',selectionLabel:'出售',
        visual:{singleSelect:true},rows:saleable.map(p=>({...petRow(s,p,now),link:undefined,select:p.id})),
        actions:[{...go('核对售价','openingLitterQuote',{...identity,keepIds}),useSelection:true},back]};
    }
    if(page!=='openingLitterQuote'||a.ids?.length!==1||!saleable.some(p=>p.id===a.ids[0])){
      return {title:'核对出售',rows:[{title:'请选择一只可出售的首窝兔子。'}],actions:[back]};
    }
    const quote=businessPage(s,'saleQuote',{channel:'market',ids:a.ids},now);
    quote.subtitle='留种 2 只 · '+quote.subtitle;
    quote.rows.unshift({title:'留种 '+retained.map(p=>p.name).join('、'),
      text:'其余 '+(members.length-3)+' 只继续养在兔房。'});
    quote.actions=quote.actions.map(a=>a.type==='sale.commit'?{...a,label:'确认选择',go:'tasks',
      args:{...a.args,litterRetention:{...identity,keepIds,opening:true}}}:go('修改出售','openingLitterSale',{...identity,ids:keepIds}));
    return quote;
  }
  if(page==='openingLitterSale'||page==='openingLitterQuote'){
    return {title:'出生记录已更新',rows:[{title:'请重新查看出生记录。'}],actions:[go('查看出生记录','litter',{species})]};
  }
  return {title:'挑选留种',subtitle:'勾选要留作种源的动物。',selectionLabel:'留种',
    rows:members.map(p=>({...petRow(s,p,now),...(!p.retained&&{select:p.id})})),empty:'这一窝当前没有可挑选的未繁育动物。',
    actions:[{...act('留作种源','care.keepLitter',identity,undefined,'litter',identity),useSelection:true,disabled:!eligible.length}]};
}
function shelves(s,a,now) {
  const species=speciesKey(a),room=s.rooms[species],cfg=SPECIES[species];
  if(!room)return closedRoom(s,species,'shelf',now);
  return {title:cfg.name+'种源货架',art:'shop-modules/lab',subtitle:'本批剩余 '+describeRemaining(shelfBatchEndsAt(room)-now),
    rows:room.shelf.offers.map((p,i)=>p?shelfRow(s,p,species,now):{title:(i===0?'公':'母')+'幼体 · 本批已售',text:'本批不再补货。下一批的品种和标签随机。'}),
    tabs:options(s,'shelf',species)};
}
function shelfRow(s,p,species,now) {
  const animal=specimen(s,{...p,bornAt:now},now,{inShop:false}),price=purchasePrice(s,youngPurchaseBase(p));
  return link(p.name+' · '+p.sex,animal.breed+' · '+animal.coat+' · '+price+' 金币',
    'offer',{species,id:p.id},{animal,art:animal.art,stage:animal.stage,visual:{price}});
}
function labCatalog(s,args,now) {
  const species=Object.keys(SPECIES).filter(key=>s.rooms[key]);
  const page={title:'培育中心',art:'shop-modules/lab'};
  if(args.tab==='nutrition') {
    const menus=species.map(key=>nutritionPage(s,'nutritionShop',key,undefined,now).rows);
    return {...page,subtitle:'营养餐',rows:[0,1,2].flatMap(i=>menus.map(rows=>rows[i]))};
  }
  if(args.tab==='services') {
    const menus=species.map(key=>services(s,{species:key},now));
    return {...page,rows:Object.keys(itemName).flatMap((item,i)=>menus.map(menu=>{
      const {label,type,args,confirm}=menu.actions[i];
      return {...menu.rows[i],title:SPECIES[args.species].name+'用'+menu.rows[i].title,
        ...(serviceItemUnit(item)==='张'&&{art:'shop-modules/'+(item==='review'?'research-review':'breeding-guide')}),
        action:{label,type,args,confirm,disabled:s.coins<args.price}};
    }))};
  }
  const stock=species.filter(key=>s.rooms[key].shelf&&(key!=='rabbit'||!rabbitWaitingForOpening(s)))
    .map(key=>({key,room:s.rooms[key]}));
  const nextBatchAt=stock.length?Math.min(...stock.map(({room})=>shelfBatchEndsAt(room))):undefined;
  return {...page,...(nextBatchAt!==undefined&&{subtitle:'下一批 '+Math.max(0,Math.ceil((nextBatchAt-now)/60_000))+' 分钟',
    visual:{nextBatchAt}}),empty:'本批种源已售完，请等下一批上架。',
    rows:[0,1].flatMap(i=>stock.flatMap(({key,room})=>room.shelf.offers[i]?[shelfRow(s,room.shelf.offers[i],key,now)]:[])),
    actions:species.some(key=>key!=='rabbit')?[go('定向种源预约','seedReservation'),go('品种培育课题','breedingCourses')]:[]};
}
function offerPage(s,a,now) {
  const species=speciesKey(a),room=s.rooms[species],p=room?.shelf.offers.find(x=>x?.id===a.id);
  if(!p)return {title:'种源货位',rows:[{title:'该幼体已经售出或换批。'}],actions:[go('查看本批种源','lab')]};
  const base=youngPurchaseBase(p),price=purchasePrice(s,base);
  return {title:p.name+' · '+p.sex,subtitle:breedName(p)+' · '+coatName(p)+' · 幼年',art:petArt(p),stage:'幼年',
    rows:[{title:'采购报价',text:'基准 '+base+' · 实付 '+price+' 金币'},...offerOrderRows(s,p,now),
      {title:'估价有效条件',text:'按当前店铺评分、订单和幼体状态估算。成长、获奖或订单变化后，交付时会重新核价。'},
      ...p.traits.map((t,i)=>({title:t.type+' · '+t.grade,text:i===5?defectDisplayLabel(t.grade):t.label?t.label+' · '+t.rarity:'无特征标签'}))],
    actions:[act('购买幼体','care.buyPet',{species,id:p.id,batch:room.shelf.number,price},'支付 '+price+' 金币购买 '+p.name+'？','shelf',{species})]};
}
const serviceEffects = {
  review:'随机改变 1 条标签的稀有度，可能降档。系统等概率选取已有标签，标签名字和属性等级不变。每只动物最多用 3 张。',
  guide:'随机挑 1 项属性。父母等级不同时，每只幼崽有 80% 的机会从较高档起算，之后仍可能升档或降档。整窝显示绿色「优选」。',
  single:'繁育前选 1 项属性，同窝随机一只保留双亲较高的等级，显示蓝色「优选」。',
  double:'繁育前选 2 项不同属性，同窝随机一只的两项都保留双亲较高的等级，显示蓝色「优选」。',
  reshape:'成年前才能用。55% 减轻一档，45% 加重一档，超过边界保留原档。每只最多用 3 份。',
  antiAge:'每份只将老年期延长 1 天。活体可用，每只最多用 3 份。',
};
function services(s,a,now) {
  const species=speciesKey(a),room=s.rooms[species],cfg=SPECIES[species];
  if(!room)return closedRoom(s,species,'services',now);
  const list=Object.keys(itemName).map(item=>{
    const price=serviceItemPrice(s,species,item),unit=serviceItemUnit(item);
    const discounted=item==='review'&&price!==cfg.review;
    const quote=item==='review'?'购买一张'+cfg.name+'用'+itemName[item]+'？基准 '+cfg.review+' 金币，实付 '+price+' 金币。':
      '支付 '+price+' 金币，购买 1 '+unit+cfg.name+'用'+itemName[item]+'？';
    return {
      row:{title:itemName[item]+' · 持有 '+serviceItemStock(room,item)+' '+unit,
        text:serviceEffects[item]+'\n每'+unit+' '+price+' 金币'+(discounted?'（原价 '+cfg.review+' 金币）':''),
        visual:{unit}},
      action:act('购买'+itemName[item],'care.buyItem',{species,item,price},quote,'services',{species}),
    };
  });
  return {title:cfg.name+'用物品',art:'shop-modules/lab',rows:list.map(item=>item.row),
    tabs:options(s,'services',species),actions:[...list.map(item=>item.action),
      go('选择动物复评','review',{species}),go('前往繁育台','breed',{species})]};
}
function review(s,a,now) {
  const species=speciesKey(a),room=s.rooms[species];
  if(!room)return closedRoom(s,species,'review',now);
  const animals=s.pets.filter(p=>p.species===species&&stageOf(p,now)!=='已故'&&!isBusy(s,p)&&p.reviews<3);
  const p=animals.find(p=>p.id===a.id);
  if(!p) return {title:'选择复评动物',subtitle:SPECIES[species].name+'用复评单 '+room.items.review+' 张',
    rows:animals.map(p=>petRow(s,p,now,'review',{species,id:p.id})),empty:'没有符合条件的动物。',actions:[go('购买物品','lab',{tab:'services'})]};
  const tags=getPetTags(p);
  const warning='随机改变 1 条标签的稀有度，可能降档。';
  return {title:'特征复评',art:petArt(p),stage:stageOf(p,now),subtitle:'剩余次数 '+(3-p.reviews)+' · 持有 '+room.items.review+' 张',
    presentation:{kind:'review',animal:specimen(s,p,now),reviews:p.reviews,inventory:room.items.review},
    rows:[{title:'当前特征标签',text:'由系统等概率随机选取 1 条已有标签，标签名字和属性等级不变。'},
      {title:warning,text:'每次消耗 1 张特征复评单和 1 次额度，每只最多 3 次。'+(p.tagRulesVersion===2?'':'本只保留原有标签和已用次数，本次使用新复评规则。')}],
    actions:[{...act('使用 1 张复评单','care.review',{species,id:p.id},'为「'+p.name+'」使用 1 张复评单？'+warning+'标签名字和属性等级不变，消耗 1 次额度，无法选回。','pet',{id:p.id}),disabled:!room.items.review||!tags.length},
      go('购买物品','lab',{tab:'services'}),go('查看档案','pet',{id:p.id})]};
}
export function carePage(s,page,args={},now) {
  switch(page) {
    case 'lab': return labCatalog(s,args,now);
    case 'roomReceipt': return openingReceipt(s,speciesKey(args));
    case 'rooms': case 'roomRoster': return roster(s,args,now);
    case 'roomNutrition': case 'nutritionDetail': case 'nutritionShop':
      return nutritionPage(s,page,speciesKey(args),args.tier,now);
    case 'profile': return checkin(s,now);
    case 'checkinReceipt': return checkinReceipt(s);
    case 'pet': return detail(s,args,now);
    case 'breed': return pairPage(s,args,now);
    case 'breedItems': return breedingItems(s,args,now);
    case 'litter': return litter(s,args,now);
    case 'litterKeep': case 'litterSale': case 'openingLitterSale': case 'openingLitterQuote': return litterSelection(s,page,args,now);
    case 'shelf': return shelves(s,args,now);
    case 'offer': return offerPage(s,args,now);
    case 'services': return services(s,args,now);
    case 'review': return review(s,args,now);
    default:return null;
  }
}
