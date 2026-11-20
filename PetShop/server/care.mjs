import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { purchasePrice, youngPurchaseBase } from './business.mjs';
import { rareRedrawPercent, scoreRiseChance } from './research-effects.mjs';
import { GRADES, defectTrait, defectProbabilities, defectDisplayLabel } from './defect.mjs';
import { occupiedPetNames, takePetName } from './pet-names.mjs';
import { activeNutrition, nutritionDuration, nutritionPrice, nutritionStock, nutritionTier, nutritionWindow } from './room-nutrition.mjs';
import { fixedTagSubset, taggedTraits, inheritedTag, getPetTags, reviewedRarity, normalizeAnimalTags, cardQualityScore } from './animal-traits.mjs';

const MINUTE = 60_000, DAY = 24 * 60 * MINUTE, BATCH = 30 * MINUTE;
export const shelfBatchEndsAt=room=>room.openedAt+(room.shelf.number+1)*BATCH;
export const SPECIES = {
  rabbit: { name:'兔', breeds:['domestic','lop','angora','lionhead'], young:12, growth:18, adult:3, old:1, wait:2, min:3, litter:[25,50,25], roomCost:0, review:40, guide:250, art:'shop-modules/rabbit-room' },
  cat: { name:'猫', breeds:['british','american','persian','maine'], young:30, growth:60, adult:4, old:2, wait:7, min:2, litter:[20,55,25], roomCost:6000, review:300, guide:350, art:'rooms/cat-room' },
  dog: { name:'狗', breeds:['shiba','corgi','poodle','dachshund'], young:40, growth:80, adult:5, old:2, wait:10, min:2, litter:[15,35,35,15], roomCost:60000, review:330, guide:400, art:'rooms/dog-room' },
};
export const BREEDS = {};
const catalog = {
  domestic:['原色兔','栗野 灰野 黑白花斑 橘白花斑 纯黑 雪白'], lop:['垂耳兔','奶油 蓝灰 巧克力 纯白 黑白花斑 焦糖白花斑'],
  angora:['安哥拉兔','雪白 奶油 蓝灰 巧克力 橘黄 黑白花斑'], lionhead:['狮子兔','金黄 黑色 灰白 巧克力 奶油 黑白花斑'],
  british:['英国短毛猫','蓝灰 乳白 黑白双色 金渐层 银虎斑 巧克力'], american:['美国短毛猫','银虎斑 棕虎斑 橘虎斑 黑白双色 纯白 纯黑'],
  persian:['波斯猫','纯白 炭黑 奶油 蓝灰 橘虎斑 海豹重点'], maine:['缅因猫','棕虎斑 银虎斑 橘白 黑烟 纯白 蓝灰白'],
  shiba:['柴犬','赤色 黑褐 奶油白 赤胡麻 黑胡麻 白底赤斑'], corgi:['柯基犬','黄白 赤白 貂色 黑头三色 虎斑白 蓝陨石'],
  poodle:['贵宾犬','黑色 白色 杏色 巧克力 银灰 黑白花'], dachshund:['腊肠犬','赤棕 黑褐 巧克力褐 银灰陨石 虎斑 红白花'],
};
// Default minutes from birth to adulthood for newly created animals.
const breedMaturity = {
  domestic:5, lop:15, angora:30, lionhead:45,
  british:90, american:105, persian:120, maine:150,
  shiba:240, corgi:300, poodle:360, dachshund:480,
};
for (const [species, config] of Object.entries(SPECIES)) {
  config.breeds.forEach((key,index) => {
    BREEDS[key] = { species, name:catalog[key][0], coats:catalog[key][1].split(' '), tier:index+1,
      maturityMinutes:breedMaturity[key] };
  });
}
export const TRAITS = [
  [['温顺','好奇','亲人'],['沉稳','大胆'],['从容']],
  [['圆眼','清秀'],['秀眉','眼神明亮'],['眼神灵动']],
  [['柔软','顺毛'],['细密','绒感'],['丝光','绒光']],
  [['匀称','舒展'],['步态轻盈','站姿端正'],['仪态出众']],
  [['紧凑','修长'],['骨架匀整','轮廓流畅'],['比例匀美']],
];
const breedingFields = ['性格','品相','毛发','体态','体型'];
const fields = [...breedingFields,'缺陷'];
export { GRADES };
const rarities = ['普通','少见','稀有'];
const coatWeights = [25,25,18,14,10,8];
const dayAt = t => new Date(t+8*60*MINUTE).toISOString().slice(0,10);
const checkinBreeds=['angora','domestic','lop','lionhead'];
const checkinCount=s=>s.care.checkinCount??Number(s.care.signedDay!=null);
export const nextCheckinBreed=s=>checkinBreeds[checkinCount(s)%checkinBreeds.length];
export const selectionItemNames = Object.freeze({single:'单项选育单',double:'双项选育单'});
const itemName = {review:'特征复评单',guide:'选育指导单',...selectionItemNames,reshape:'缺陷重塑剂',antiAge:'抗衰老药剂'};
export const serviceItemUnit = item => item==='reshape'||item==='antiAge'?'份':'张';
export const serviceItemStock = (room,item) => {
  const count=room.items[item];
  return Number.isSafeInteger(count)&&count>=0?count:0;
};
export const highValueItemPrices = Object.freeze({
  rabbit:Object.freeze({guide:1800,single:3600,double:8000,reshape:2700,antiAge:1500}),
  cat:Object.freeze({guide:6000,single:12000,double:27000,reshape:9000,antiAge:5000}),
  dog:Object.freeze({guide:27000,single:54000,double:120000,reshape:40000,antiAge:22000}),
});
export const serviceItemPrice = (s,species,item) => item==='review'
  ? purchasePrice(s,SPECIES[species].review) : highValueItemPrices[species][item];
export const selectionFieldCount = key => key==='single'?1:key==='double'?2:0;
export const antiAgeLimit=3;
export const antiAgeUses = p => Number.isInteger(p.antiAgeUses)?Math.max(0,Math.min(antiAgeLimit,p.antiAgeUses)):0;
export const reshapeLimit=3;
export const reshapeUses = p => Number.isInteger(p.reshapeUses)?Math.max(0,Math.min(reshapeLimit,p.reshapeUses)):0;
const sample = (list,rnd=Math.random) => list[Math.floor(rnd()*list.length)];
function weighted(weights,rnd=Math.random) {
  let value = rnd()*weights.reduce((a,b)=>a+b,0);
  for (let i=0; i<weights.length; i++) if ((value-=weights[i])<0) return i;
  return weights.length-1;
}
function deterministic(key) {
  let sequence = 0;
  return () => createHash('sha256').update(key+':'+sequence++).digest().readUInt32LE()/0x1_0000_0000;
}
function requireValue(test, message) {
  if (!test) throw new Error(message);
}
function speciesOf(value) {
  const key = value ?? 'rabbit';
  requireValue(Object.hasOwn(SPECIES,key),'没有这个物种的房间。');
  return key;
}
function roomOf(s, species) {
  const room = s.rooms[speciesOf(species)];
  requireValue(room,'请先开放对应房间。');
  return room;
}
export const stageNames = ['幼年','成长','成年','老年','已故'];
export function lifeDates(p) {
  const cfg=SPECIES[p.species];
  const speciesMaturity=cfg.young+cfg.growth;
  const maturity=p.breedGrowth===true?BREEDS[p.breedKey]?.maturityMinutes??speciesMaturity:speciesMaturity;
  const naturalGrowth=p.bornAt+Math.round(maturity*cfg.young/speciesMaturity)*MINUTE;
  const naturalAdult=p.bornAt+maturity*MINUTE;
  const oldAt=naturalAdult+cfg.adult*DAY;
  const baseDeathAt=p.tutorialDeathAt??(p.tutorialLifeGuard?Infinity:oldAt+cfg.old*DAY);
  const deathAt=baseDeathAt+antiAgeUses(p)*DAY;
  return {growthAt:p.maturation?.growthAt??naturalGrowth,adultAt:p.maturation?.adultAt??naturalAdult,
    oldAt:Math.min(oldAt,baseDeathAt),deathAt};
}
function accelerateMaturation(p,effect,arrivedAt) {
  if(!effect)return;
  const start=Math.max(effect.startsAt,arrivedAt,p.bornAt);
  const duration=effect.endsAt-start;
  const {growthAt,adultAt}=lifeDates(p);
  if(duration<=0||adultAt<=start)return;
  const speed=Math.round(effect.rate*10);
  const earlier=deadline=>{
    if(deadline<=start)return deadline;
    const natural=deadline-start;
    return natural*10<=duration*speed ? start+Math.ceil(natural*10/speed)
      : deadline-Math.floor(duration*(speed-10)/10);
  };
  p.maturation={growthAt:earlier(growthAt),adultAt:earlier(adultAt)};
}
export const beijingTime = ms => new Date(ms+8*60*MINUTE).toISOString().slice(0,19).replace('T',' ');
function ageBand(p,now) {
  const {growthAt,adultAt,oldAt,deathAt}=lifeDates(p);
  const ends=[growthAt,adultAt,oldAt,deathAt];
  const i=ends.findIndex(end=>now<end);
  return i<0?['已故',null]:[stageNames[i],Number.isFinite(ends[i])?ends[i]:null];
}
export const stageOf = (p,now) => ageBand(p,now)[0];
export const stageEnd = (p,now) => ageBand(p,now)[1];
export function isBusy(s,p) {
  const job=s.rooms[p.species]?.job;
  return Boolean(job && (p.id===job.motherId || p.id===job.fatherId));
}
export const breedName = p => p.mixed?'杂交':BREEDS[p.breedKey].name;
export const mixedOffspring = (mother,father) => Boolean(mother.mixed||father.mixed||mother.breedKey!==father.breedKey);
export const petArt = p => 'pets/'+p.breedKey+'-coat'+String(p.coatIndex).padStart(2,'0')+'_'+(p.sex==='公'?'male':'female');
const coatName = p => BREEDS[p.breedKey].coats[p.coatIndex-1];
const canBreed = (s,p,now) => !p.bred && !isBusy(s,p) && ['成年','老年'].includes(stageOf(p,now));
const stockStatus = (s,p) => isBusy(s,p)?'繁育中':p.bred?'已繁育':'未繁育';
export function specimen(s,p,now,{inShop=true}={}) {
  const [stage,endsAt]=ageBand(p,now);
  return {id:p.id,number:p.id.slice(0,5).toUpperCase(),name:p.name,sex:p.sex,breed:breedName(p),
    coat:coatName(p),stage,status:stage==='已故'?(p.retained?'种源保护':'待回收'):stockStatus(s,p),
    art:petArt(p),retained:p.retained===true,...(inShop&&{stageEndsAt:endsAt}),
    ...(p.guided===true&&{guided:true}),...(p.selectedBreeding===true&&{selectedBreeding:true}),
    ...(p.traits&&{score:cardQualityScore(p.traits),traits:p.traits.slice(0,5).map(({type,grade})=>({type,grade})),tags:getPetTags(p),
      defect:{grade:p.traits[5].grade,label:defectDisplayLabel(p.traits[5].grade)}})};
}
export const rosterFilters = {
  全部:()=>true, 种源:(_s,p)=>p.retained===true,
  未繁育:(s,p,now)=>stageOf(p,now)!=='已故'&&stockStatus(s,p)==='未繁育',
};
const legacyFilters = {在养:'全部',后备种源:'种源',可配对:'未繁育'};
export function rosterFilter(value) {
  if(typeof value!=='string')return '全部';
  if(Object.hasOwn(legacyFilters,value))return legacyFilters[value];
  return Object.hasOwn(rosterFilters,value)?value:'全部';
}
export function rosterStage(value,filter) {
  if(stageNames.includes(value))return value;
  return filter==='已故'?'已故':'全部';
}
function fixedTraits(first='温顺') {
  return [first,'清秀','柔软','匀称','紧凑'].map((label,i)=>({type:fields[i],label,rarity:'普通',grade:'B'})).concat(defectTrait('B'));
}
export function makePet(usedNames,species,breedKey,sex,now,source,data={}) {
  const name=takePetName(usedNames,Math.random(),data.name);
  // Purchased offers and generated offspring already have frozen tags. Do not
  // reroll them when they enter the roster, including old five-tag offers.
  const generated=data.traits?{traits:structuredClone(data.traits)}:fixedTagSubset(fixedTraits());
  const pet={id:randomUUID(),species,breedKey,sex,bornAt:now,source,coatIndex:1,mixed:false,
    breedGrowth:true,bred:false,honor:0,reviews:0,motherId:null,fatherId:null,...data,...generated,name};
  normalizeAnimalTags(pet);
  return pet;
}
function newRoom(now) {
  return { openedAt:now,job:null,lastLitter:null,shelf:null,items:Object.fromEntries(Object.keys(itemName).map(item=>[item,0])),mutationEnabled:true };
}
function rolledTrait(i,rarity,grade,rnd) {
  return {type:fields[i],label:sample(TRAITS[i][rarity],rnd),rarity:rarities[rarity],grade};
}
function shelfBatch(s,species,number,usedNames,reservation) {
  const seed=s.care.seed+':stock-v1:'+species+':'+number;
  const breedKey=reservation?.breedKey??SPECIES[species].breeds[weighted([40,30,20,10],deterministic(seed+':breed'))];
  const offers=(reservation?[reservation.sex]:['公','母']).map((sex,slot)=>{
    const rnd=field=>deterministic(seed+':'+slot+':'+field);
    const rare=rnd('rare')()<0.10?Math.floor(rnd('rare-slot')()*5):-1;
    const gradedTraits=breedingFields.map((_,i)=>{
      const grade=GRADES[weighted([0,10,40,42,8,0,0],rnd('grade-'+i))];
      return rolledTrait(i,i===rare?2:weighted([80,20],rnd('rarity-'+i)),grade,rnd('tag-'+i));
    }).concat(defectTrait('B'));
    const id=createHash('sha256').update(seed+':'+slot+':id').digest('hex').slice(0,32);
    const tags=fixedTagSubset(gradedTraits,rnd('tag-capacity-v2'));
    return { id,name:takePetName(usedNames,rnd('name')()),species,sex,breedKey,mixed:false,coatIndex:1+weighted(coatWeights,rnd('coat')),...tags };
  });
  return {number,offers};
}

export function makeReservationOffer(s,species,day,breedKey,sex) {
  return shelfBatch(s,species,'reservation-'+day,occupiedPetNames(s),{breedKey,sex}).offers[0];
}

export function admitPurchasedPet(s,room,offer,now) {
  const pet=makePet(occupiedPetNames(s,[offer]),offer.species,offer.breedKey,offer.sex,now,'研究所采购',offer);
  accelerateMaturation(pet,activeNutrition(room,now),now);
  s.pets.push(pet);
  return pet;
}
export function initCare(s,now,{onboarding=false}={}) {
  if (s.care) return;
  s.care={seed:randomBytes(16).toString('hex'),signedDay:null,claimIds:[],defectGradesUpdated:true};
  s.rooms={rabbit:newRoom(now)};
  const usedNames=new Set();
  s.pets=onboarding?[]:[
    makePet(usedNames,'rabbit','angora','母',now-30*MINUTE,'开店种兔',{name:'小花'}),
    makePet(usedNames,'rabbit','angora','公',now-30*MINUTE,'开店种兔',{name:'小白',coatIndex:2,...fixedTagSubset(fixedTraits('好奇'))}),
  ];
  tickCare(s,now);
}

// Saves from older builds may still have a mark applied after the animal bred.
export function clearBredRetention(s) {
  let changed=false;
  for(const pet of s.pets){
    if(pet.bred&&pet.retained){
      pet.retained=false;
      changed=true;
    }
  }
  return changed;
}

function birthIdentity({id,name,sex,breedKey,coatIndex,mixed,traits}) {
  const score=cardQualityScore(traits);
  return {id,name,sex,breedKey,coatIndex,mixed:!!mixed,...(score!==undefined&&{score})};
}

export function tickCare(s,now) {
  let changed=false;
  if (!s.care.defectGradesUpdated) {
    // The store already froze these grades, including every unborn animal in an active job.
    const updateLabel = pet => {
      if (pet) pet.traits[5] = defectTrait(pet.traits[5].grade);
    };
    s.pets.forEach(updateLabel);
    for (const room of Object.values(s.rooms)) {
      room.shelf?.offers.forEach(updateLabel);
      if (room.job) {
        updateLabel(room.job.mother);
        updateLabel(room.job.father);
        room.job.offspring.forEach(updateLabel);
      }
    }
    s.care.defectGradesUpdated=true;
    changed=true;
  }
  const refreshes=[];
  for (const [species,room] of Object.entries(s.rooms)) {
    if(room.reservedSeed&&now>=room.reservedSeed.expiresAt){delete room.reservedSeed;changed=true;}
    const number=Math.max(0,Math.floor((now-room.openedAt)/BATCH));
    if (!room.shelf || number>room.shelf.number) refreshes.push({species,room,number});
    const job=room.job;
    if (job && now>=job.endsAt) {
      for (const p of s.pets) if (p.id===job.motherId||p.id===job.fatherId) {
        p.bred=true;
        p.retained=false;
      }
      // Settle at the birth timestamp even when the store resumes after expiry.
      const effect=nutritionWindow(room);
      for(const p of job.offspring)accelerateMaturation(p,effect,job.endsAt);
      s.pets.push(...job.offspring);
      room.lastLitter={ids:job.offspring.map(p=>p.id),children:job.offspring.map(birthIdentity),bornAt:job.endsAt,mother:job.mother.name,father:job.father.name,
        parents:[job.mother,job.father].map(({id,name,sex,bornAt,breedKey,breedGrowth,maturation})=>
          ({id,name,sex,bornAt,species,breedKey,...(breedGrowth&&{breedGrowth}),...(maturation&&{maturation})}))};
      room.job=null;changed=true;
    } else if(room.lastLitter && !room.lastLitter.children) {
      // Preserve the identities still available when opening an older save, before another sale.
      const ids=new Set(room.lastLitter.ids);
      room.lastLitter.children=s.pets.filter(p=>ids.has(p.id)).map(birthIdentity);
      changed=true;
    }
  }
  if (refreshes.length) {
    const retiring=refreshes.flatMap(({room})=>room.shelf?.offers ?? []);
    const usedNames=occupiedPetNames(s,retiring);
    for (const {species,room,number} of refreshes) room.shelf=shelfBatch(s,species,number,usedNames);
    changed=true;
  }
  return changed;
}
function gradeBaseline(grades,guided) {
  return guided&&grades[0]!==grades[1]?{first:grades[0]>grades[1]?0:1,chance:.8}:{first:0,chance:.5};
}

// The preview and submission draw the same field for the same pair. Reopening
// the item panel or retrying the request does not redraw it.
export function guideField(s,mother,father) {
  return weighted([20,20,20,20,20],deterministic(s.care.seed+':guide:'+mother.id+':'+father.id));
}

export function validSelection(room,selection) {
  if(!selection||typeof selection!=='object')return false;
  const {item,fields:chosen}=selection,count=selectionFieldCount(item);
  return count>0&&serviceItemStock(room,item)>0&&Array.isArray(chosen)&&chosen.length===count&&
    new Set(chosen).size===count&&chosen.every(i=>Number.isInteger(i)&&i>=0&&i<breedingFields.length);
}

export function mutationPreview(mother,father,guide,level,enabled) {
  const defect=defectProbabilities(mother.traits,father.traits);
  return {enabled,level,defect,fields:breedingFields.map((name,i)=>{
    const m=mother.traits[i].grade,f=father.traits[i].grade;
    const grades=[GRADES.indexOf(m),GRADES.indexOf(f)];
    const {first,chance}=gradeBaseline(grades,i===guide);
    const a=grades[first],b=grades[1-first];
    const rise=lv=>Number((100*(chance*scoreRiseChance(a,b,lv)+(1-chance)*scoreRiseChance(b,a,lv))).toFixed(3));
    return {name,mother:m,father:f,off:rise(0),on:rise(level)};
  })};
}

function inherit(mother,father,options,defect,guaranteed) {
  const traits=breedingFields.map((_,i)=>{
    const parents=[mother.traits[i],father.traits[i]];
    const grades=parents.map(t=>GRADES.indexOf(t.grade));
    if(guaranteed?.includes(i))return {type:fields[i],grade:GRADES[Math.max(...grades)]};
    const {first,chance}=gradeBaseline(grades,i===options.guide);
    const j=Math.random()<chance?first:1-first;
    const base=grades[j],ref=grades[1-j];
    const up=scoreRiseChance(base,ref,options.positive);
    const roll=Math.random(), next=base+(roll<up?1:roll<up+.1?-1:0);
    const grade=GRADES[Math.max(0,Math.min(6,Math.max(...grades)+1,next))];
    return {type:fields[i],grade};
  });
  traits.push(defectTrait(GRADES[weighted(defect.gradePercents)]));
  const rare=rareRedrawPercent(options.rare);
  return taggedTraits(traits,i=>inheritedTag(i,mother,father,
    dimension=>rolledTrait(dimension,weighted([80-rare,20,rare]),traits[dimension].grade,Math.random)));
}
export function startLitter(s,args,now,{waitMs,plannedSexes}={}) {
  const species=speciesOf(args.species), room=roomOf(s,species), cfg=SPECIES[species];
  requireValue(!room.job,'这间房已有一窝正在培育。');
  const mother=s.pets.find(p=>p.id===args.mother), father=s.pets.find(p=>p.id===args.father);
  requireValue(mother?.species===species && father?.species===species && mother.sex==='母' && father.sex==='公'
    && canBreed(s,mother,now) && canBreed(s,father,now),'请选择仍在店、可繁育的一公一母成年或老年动物。');
  requireValue(args.guide===undefined||args.guide===-1,'指导单已改为系统抽取，请重新打开繁育台。');
  requireValue(args.useGuide===undefined||typeof args.useGuide==='boolean','请选择是否添加选育指导单。');
  const useGuide=args.useGuide===true, selection=args.selection??null;
  requireValue(!useGuide||room.items.guide>0,'该物种的选育指导单不足。');
  requireValue(!selection||validSelection(room,selection),'选育单不足或所选属性无效，请重新添加道具。');
  requireValue(!plannedSexes||(!useGuide&&!selection),'教学繁育不使用选育道具。');
  const guide=useGuide?guideField(s,mother,father):-1;
  const [rare=0,mutation=0]=s.research?.[species]??[];
  const options={rare,positive:room.mutationEnabled?mutation:0,guide};
  const endsAt=now+(waitMs??cfg.wait*MINUTE), n=plannedSexes?.length??(cfg.min+weighted(cfg.litter));
  const beneficiary=selection?Math.floor(Math.random()*n):-1;
  const mixed=mixedOffspring(mother,father);
  const defect=defectProbabilities(mother.traits,father.traits);
  const usedNames=occupiedPetNames(s);
  const lineage={motherId:mother.id,fatherId:father.id,motherName:mother.name,fatherName:father.name,mixed};
  const offspring=Array.from({length:n},(_,i)=>{
    if(plannedSexes)return makePet(usedNames,species,mother.breedKey,plannedSexes[i],endsAt,'本店繁育',lineage);
    const look=Math.random()<.5?mother:father;
    const guaranteed=i===beneficiary?selection.fields:undefined;
    return makePet(usedNames,species,look.breedKey,Math.random()<.5?'公':'母',endsAt,'本店繁育',{
      ...lineage,
      ...(useGuide&&{guided:true}),...(guaranteed&&{selectedBreeding:true}),
      coatIndex:Math.random()<.85?look.coatIndex:weighted(coatWeights)+1,
      ...inherit(mother,father,options,defect,guaranteed),
    });
  });
  if(guide>=0)room.items.guide--;
  if(selection)room.items[selection.item]--;
  room.job={motherId:mother.id,fatherId:father.id,mother:structuredClone(mother),father:structuredClone(father),
    options:{...options,...(selection&&{selection,beneficiary:offspring[beneficiary].id})},endsAt,offspring};
  return waitMs?'已开始首窝繁育，预计 '+waitMs/1000+' 秒后出生。':'已开始繁育，预计 '+cfg.wait+' 分钟后出生。';
}
function charge(s,expected,base) {
  chargeQuoted(s,expected,purchasePrice(s,base));
}
export function chargeQuoted(s,expected,amount) {
  requireValue(expected===amount,'报价有变化，请返回重新核对。');
  requireValue(s.coins>=amount,'金币不足。需要 '+amount+' 金币。');
  s.coins-=amount;
}
export function litterCandidates(s,litter,now) {
  const ids=new Set(litter.ids);
  return s.pets.filter(p=>ids.has(p.id)&&!p.bred&&!isBusy(s,p)&&stageOf(p,now)!=='已故');
}
// The opening lesson still confirms its one sale and two retained animals together.
export function retainedLitterPets(s, decision, soldIds, now) {
  const g=s.onboarding;
  requireValue(decision.opening===true,'请从动物房间重新挑选留种。');
  requireValue(decision.species==='rabbit'&&g?.firstLitter&&!g.planAt&&!g.finishedAt,'首窝留种已处理。');
  const litter=g.firstLitter;
  requireValue(litter.bornAt===decision.bornAt,'出生记录已更新，请重新挑选。');
  const members=litterCandidates(s,litter,now),eligible=members.filter(p=>!p.retained);
  requireValue(Array.isArray(decision.keepIds)&&Array.isArray(soldIds),'本窝选单无效。');
  const all=[...decision.keepIds,...soldIds], chosen=new Set(all), keep=new Set(decision.keepIds);
  const retained=members.filter(p=>p.retained||keep.has(p.id));
  requireValue(soldIds.length===1&&chosen.size===all.length&&all.every(id=>eligible.some(p=>p.id===id))&&
    retained.length===2&&retained[0].sex!==retained[1].sex,'请选择一公一母留种和一只出售。');
  return eligible.filter(p=>keep.has(p.id));
}
export function careAction(s,type,args,now) {
  if(!type.startsWith('care.')) return undefined;
  if(type==='care.retain') {
    const p=s.pets.find(p=>p.id===args.id);
    requireValue(p,'这只动物已离店。');
    requireValue(typeof args.retained==='boolean','请选择留种或取消留种。');
    requireValue(!args.retained||!p.bred,'已繁育动物无法留种。');
    requireValue(!args.retained||stageOf(p,now)!=='已故','已故动物无法新留种。');
    p.retained=args.retained;
    return p.name+(p.retained?'已标记为种源。':'已取消留种。');
  }
  if(type==='care.keepLitter') {
    const litter=s.rooms[args.species]?.lastLitter;
    requireValue(litter&&litter.bornAt===args.bornAt,'出生记录已更新，请重新挑选。');
    const ids=args.ids??args.keepIds;
    requireValue(Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length,'请勾选要留作种源的动物。');
    const kept=litterCandidates(s,litter,now).filter(p=>!p.retained&&ids.includes(p.id));
    requireValue(kept.length===ids.length,'本窝名册已变化，请重新挑选。');
    for(const p of kept)p.retained=true;
    return '本窝 '+kept.length+' 只动物已标记为种源。';
  }
  if(type==='care.checkin') {
    const today=dayAt(now);
    requireValue(s.care.signedDay!==today,'今天的两只幼兔已领取。');
    const usedNames=occupiedPetNames(s);
    const firstNames=s.care.signedDay==null ? ['谷穗','小麦'] : [];
    const breedKey=nextCheckinBreed(s);
    const pair=['母','公'].map((sex,i)=>makePet(usedNames,'rabbit',breedKey,sex,now,'每日签到',{name:firstNames[i]}));
    const effect=activeNutrition(s.rooms.rabbit,now);
    for(const p of pair)accelerateMaturation(p,effect,now);
    s.pets.push(...pair);s.care.checkinCount=checkinCount(s)+1;s.care.signedDay=today;s.care.claimIds=pair.map(p=>p.id);
    s.care.claimAnimals=pair.map(birthIdentity);
    return '已领取两只'+BREEDS[breedKey].name+'幼体，一公一母。';
  }
  if(type==='care.breed') return startLitter(s,args,now);
  const species=speciesOf(args.species), cfg=SPECIES[species];
  if(type==='care.unlock') {
    requireValue(!s.rooms[species]&&cfg.roomCost>0,'这间房已经开放。');
    charge(s,args.price,cfg.roomCost);
    const usedNames=occupiedPetNames(s);
    s.rooms[species]=newRoom(now);s.rooms[species].shelf=shelfBatch(s,species,0,usedNames);
    const pair=['公','母'].map(sex=>makePet(usedNames,species,cfg.breeds[0],sex,now,'新房种源'));
    s.pets.push(...pair);
    s.rooms[species].openingReceipt={paid:args.price,balance:s.coins,bornAt:now,
      adultAt:lifeDates(pair[0]).adultAt,
      pair:pair.map(({id,name,sex,breedKey,coatIndex})=>({id,name,sex,breedKey,coatIndex}))};
    return cfg.name+'房已开放，两只幼体已入住。';
  }
  const room=roomOf(s,species);
  if(type==='care.buyNutrition') {
    const meal=nutritionTier(args.tier);
    requireValue(meal,'请选择有效的营养餐档次。');
    const count=nutritionStock(room,meal.key);
    requireValue(count<Number.MAX_SAFE_INTEGER,'本房所选营养餐库存已满。');
    chargeQuoted(s,args.price,nutritionPrice(species,meal));
    room.nutritionStock??={};
    room.nutritionStock[meal.key]=count+1;
    return '已购入 1 份'+meal.label+cfg.name.repeat(2)+'营养餐。';
  }
  if(type==='care.feed') {
    const meal=nutritionTier(args.tier);
    requireValue(meal,'请选择有效的营养餐档次。');
    requireValue(!activeNutrition(room,now),'本房的营养餐仍在生效，请等到期后再投喂。');
    requireValue(nutritionStock(room,meal.key)>0,'本房所选营养餐库存不足。');
    room.nutritionStock[meal.key]--;
    room.nutrition={tier:meal.key,startsAt:now,endsAt:now+nutritionDuration};
    const effect=activeNutrition(room,now);
    for(const p of s.pets)if(p.species===species)accelerateMaturation(p,effect,now);
    return cfg.name+'房成长速度 ×'+meal.rate+'，营养餐已生效。';
  }
  if(type==='care.buyPet') {
    const index=room.shelf.offers.findIndex(p=>p?.id===args.id);
    requireValue(index>=0 && room.shelf.number===args.batch,'货位已售空或批次已更新。');
    const offer=room.shelf.offers[index];
    charge(s,args.price,youngPurchaseBase(offer));
    const pet=admitPurchasedPet(s,room,offer,now);
    room.shelf.offers[index]=null;
    if (pet.name!==offer.name) return '原货架名“'+offer.name+'”已被占用，已取名“'+pet.name+'”入住'+cfg.name+'房。';
    return pet.name+'已入住'+cfg.name+'房。';
  }
  if(type==='care.buyItem') {
    requireValue(Object.hasOwn(itemName,args.item),'没有这种物品。');
    const count=serviceItemStock(room,args.item);
    requireValue(count<Number.MAX_SAFE_INTEGER,'本房道具库存已满。');
    chargeQuoted(s,args.price,serviceItemPrice(s,species,args.item));room.items[args.item]=count+1;
    return '已购入 1 '+serviceItemUnit(args.item)+cfg.name+'用'+itemName[args.item]+'。';
  }
  if(type==='care.antiAge') {
    const p=s.pets.find(p=>p.id===args.id);
    requireValue(p?.species===species&&stageOf(p,now)!=='已故','请选择仍在店的活体动物。');
    const used=antiAgeUses(p);
    requireValue(used<antiAgeLimit,'这只动物已用满 3 份抗衰老药剂。');
    requireValue(serviceItemStock(room,'antiAge')>0,'本房抗衰老药剂库存不足。');
    p.antiAgeUses=used+1;room.items.antiAge--;
    return p.name+'的老年期增加 1 天，还可用 '+(antiAgeLimit-p.antiAgeUses)+' 次。';
  }
  if(type==='care.reshape') {
    const p=s.pets.find(p=>p.id===args.id);
    requireValue(p?.species===species&&['幼年','成长'].includes(stageOf(p,now)),'只能给尚未成年的在店动物使用。');
    const used=reshapeUses(p),grade=p.traits[5].grade,index=GRADES.indexOf(grade);
    requireValue(used<reshapeLimit,'这只动物已用满 3 份缺陷重塑剂。');
    requireValue(index>=0,'当前缺陷档位无效，请重新打开动物档案。');
    requireValue(serviceItemStock(room,'reshape')>0,'本房缺陷重塑剂库存不足。');
    const step=Math.random()<.55?1:-1;
    const result=GRADES[index+step]??grade;
    p.traits[5]=defectTrait(result);
    p.reshapeUses=used+1;room.items.reshape--;
    return '缺陷重塑：'+grade+' → '+result+(result===grade?'（达到边界，保持原档）':'')+
      '。已使用 1 份，还可用 '+(reshapeLimit-p.reshapeUses)+' 次。';
  }
  if(type==='care.toggle') {
    requireValue(typeof args.enabled==='boolean','请选择开启或关闭。');
    room.mutationEnabled=args.enabled;
    return '下次开始繁育时'+(args.enabled?'采用':'关闭')+'五维选育加成。';
  }
  if(type==='care.review') {
    const p=s.pets.find(p=>p.id===args.id);
    requireValue(p?.species===species && stageOf(p,now)!=='已故' && !isBusy(s,p),'请选择在店空闲的活体。');
    requireValue(args.field===undefined,'复评规则已更新，请重新打开复评页面。现在由系统随机选择已有标签。');
    requireValue(p.reviews<3 && room.items.review>0,'复评次数或复评单不足。');
    const tags=getPetTags(p);
    requireValue(tags.length>0,'这只动物没有可复评的特征标签。');
    const tag=sample(tags),i=tag.dimension,old=p.traits[i];
    const rarity=reviewedRarity(old.rarity);
    p.traits[i]={...old,tagId:tag.tagId,rarity};
    (p.reviewHistory??=[]).push({at:now,field:i,before:old.label,after:p.traits[i].label,
      beforeRarity:old.rarity,afterRarity:p.traits[i].rarity,grade:old.grade,tagId:tag.tagId,ruleVersion:2});
    p.reviews++;room.items.review--;
    return '标签「'+old.label+'」复评：'+old.rarity+' → '+rarity+'，标签名称和属性等级不变。';
  }
  return undefined;
}
export { fields, coatName, canBreed, stockStatus, dayAt, itemName };
export { carePage } from './care-pages.mjs';
