import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { purchasePrice, youngPurchaseBase } from './business.mjs';
import { rareRedrawPercent, scoreRiseChance } from './research-effects.mjs';
import { occupiedPetNames, takePetName } from './pet-names.mjs';

const MINUTE = 60_000, DAY = 24 * 60 * MINUTE, BATCH = 30 * MINUTE;
export const SPECIES = {
  rabbit: { name:'兔', breeds:['domestic','lop','angora','lionhead'], young:12, growth:18, adult:3, old:1, wait:2, min:3, litter:[25,50,25], roomCost:0, review:40, guide:250, art:'shop-modules/rabbit-room' },
  cat: { name:'猫', breeds:['british','american','persian','maine'], young:30, growth:60, adult:4, old:2, wait:7, min:2, litter:[20,55,25], roomCost:3000, review:300, guide:350, art:'rooms/cat-room' },
  dog: { name:'狗', breeds:['shiba','corgi','poodle','dachshund'], young:40, growth:80, adult:5, old:2, wait:10, min:2, litter:[15,35,35,15], roomCost:20000, review:330, guide:400, art:'rooms/dog-room' },
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
for (const [species, config] of Object.entries(SPECIES)) {
  config.breeds.forEach((key,index) => {
    BREEDS[key] = { species, name:catalog[key][0], coats:catalog[key][1].split(' '), tier:index+1 };
  });
}
export const TRAITS = [
  [['温顺','好奇','亲人'],['沉稳','大胆'],['从容']],
  [['圆眼','清秀'],['秀眉','眼神明亮'],['眼神灵动']],
  [['柔软','顺毛'],['细密','绒感'],['丝光','绒光']],
  [['匀称','舒展'],['步态轻盈','站姿端正'],['仪态出众']],
  [['紧凑','修长'],['骨架匀整','轮廓流畅'],['比例匀美']],
];
const fields = ['性格','品相','毛发','体态','体型','健全度'];
export const GRADES = ['E','D','C','B','A','S','S+'];
const rarities = ['普通','少见','稀有'];
const coatWeights = [25,25,18,14,10,8];
const dayAt = t => new Date(t+8*60*MINUTE).toISOString().slice(0,10);
const itemName = { review:'特征复评单', guide:'选育指导单' };
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
const stageNames = ['幼年','成长','成年','老年','已故'];
export function lifeDates(p) {
  const cfg=SPECIES[p.species];
  const growthAt=p.bornAt+cfg.young*MINUTE, adultAt=growthAt+cfg.growth*MINUTE;
  const oldAt=adultAt+cfg.adult*DAY;
  return {growthAt,adultAt,oldAt,deathAt:oldAt+cfg.old*DAY};
}
export const beijingTime = ms => new Date(ms+8*60*MINUTE).toISOString().slice(0,19).replace('T',' ');
function ageBand(p,now) {
  const {growthAt,adultAt,oldAt,deathAt}=lifeDates(p);
  const ends=[growthAt,adultAt,oldAt,deathAt];
  const i=ends.findIndex(end=>now<end);
  return i<0?['已故',null]:[stageNames[i],ends[i]];
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
export const rosterFilters = {
  全部:()=>true, 种源:(_s,p)=>p.retained===true,
  未繁育:(s,p,now)=>stageOf(p,now)!=='已故'&&stockStatus(s,p)==='未繁育',
  已故:(_s,p,now)=>stageOf(p,now)==='已故',
};
const legacyFilters = {在养:'全部',后备种源:'种源',可配对:'未繁育'};
export function rosterFilter(value) {
  if(typeof value!=='string')return '全部';
  if(Object.hasOwn(legacyFilters,value))return legacyFilters[value];
  return Object.hasOwn(rosterFilters,value)?value:'全部';
}
function conditionGrade(grade) {
  const score=GRADES.indexOf(grade);
  return {type:fields[5],label:score<2?'明显偏差':score===2?'轻微偏差':'未见明显缺陷',rarity:'普通',grade};
}
function fixedTraits(first='温顺') {
  return [first,'清秀','柔软','匀称','紧凑'].map((label,i)=>({type:fields[i],label,rarity:'普通',grade:'B'})).concat(conditionGrade('B'));
}
function makePet(usedNames,species,breedKey,sex,now,source,data={}) {
  const name=takePetName(usedNames,Math.random(),data.name);
  return {id:randomUUID(),species,breedKey,sex,bornAt:now,source,coatIndex:1,mixed:false,
    bred:false,traits:fixedTraits(),honor:0,reviews:0,motherId:null,fatherId:null,...data,name};
}
function newRoom(now) {
  return { openedAt:now,job:null,lastLitter:null,shelf:null,items:{review:0,guide:0},mutationEnabled:true };
}
function rolledTrait(i,rarity,grade,rnd) {
  return {type:fields[i],label:sample(TRAITS[i][rarity],rnd),rarity:rarities[rarity],grade};
}
function shelfBatch(s,species,number,usedNames) {
  const seed=s.care.seed+':stock-v1:'+species+':'+number;
  const breedKey=SPECIES[species].breeds[weighted([40,30,20,10],deterministic(seed+':breed'))];
  const offers=['公','母'].map((sex,slot)=>{
    const rnd=field=>deterministic(seed+':'+slot+':'+field);
    const rare=rnd('rare')()<0.10?Math.floor(rnd('rare-slot')()*5):-1;
    const traits=fields.map((_,i)=>{
      const grade=GRADES[weighted([0,10,40,42,8,0,0],rnd('grade-'+i))];
      return i===5?conditionGrade(grade):rolledTrait(i,i===rare?2:weighted([80,20],rnd('rarity-'+i)),grade,rnd('tag-'+i));
    });
    const id=createHash('sha256').update(seed+':'+slot+':id').digest('hex').slice(0,32);
    return { id,name:takePetName(usedNames,rnd('name')()),species,sex,breedKey,mixed:false,coatIndex:1+weighted(coatWeights,rnd('coat')),traits };
  });
  return {number,offers};
}
export function initCare(s,now) {
  if (s.care) return;
  s.care={seed:randomBytes(16).toString('hex'),signedDay:null,claimIds:[]};
  s.rooms={rabbit:newRoom(now)};
  const usedNames=new Set();
  s.pets=[
    makePet(usedNames,'rabbit','angora','母',now-30*MINUTE,'开店种兔',{name:'小花'}),
    makePet(usedNames,'rabbit','angora','公',now-30*MINUTE,'开店种兔',{name:'小白',coatIndex:2,traits:fixedTraits('好奇')}),
  ];
  tickCare(s,now);
}
export function tickCare(s,now) {
  let changed=false;
  const refreshes=[];
  for (const [species,room] of Object.entries(s.rooms)) {
    const number=Math.max(0,Math.floor((now-room.openedAt)/BATCH));
    if (!room.shelf || number>room.shelf.number) refreshes.push({species,room,number});
    const job=room.job;
    if (job && now>=job.endsAt) {
      for (const p of s.pets) if (p.id===job.motherId||p.id===job.fatherId) {
        p.bred=true;
        p.retained=false;
      }
      s.pets.push(...job.offspring);
      room.lastLitter={ids:job.offspring.map(p=>p.id),bornAt:job.endsAt,mother:job.mother.name,father:job.father.name,
        parents:[job.mother,job.father].map(({id,name,sex,bornAt})=>({id,name,sex,bornAt,species}))};
      room.job=null;changed=true;
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
function inherit(mother,father,options) {
  return fields.map((_,i)=>{
    const parents=[mother.traits[i],father.traits[i]];
    const grades=parents.map(t=>GRADES.indexOf(t.grade));
    const high=grades[0]>grades[1]?0:1;
    const j=i===options.guide ? (Math.random()<.8?high:1-high) : (Math.random()<.5?0:1);
    const base=grades[j],ref=grades[1-j];
    const up=scoreRiseChance(base,ref,options.positive);
    const roll=Math.random(), next=base+(roll<up?1:roll<up+.1?-1:0);
    const grade=GRADES[Math.max(0,Math.min(6,Math.max(...grades)+1,next))];
    if(i===5) return conditionGrade(grade);
    const from=Math.random();
    if(from<.8) return {...parents[from<.4?1:0],grade};
    const rare=rareRedrawPercent(options.rare);
    return rolledTrait(i,weighted([80-rare,20,rare]),grade,Math.random);
  });
}
function startLitter(s,args,now) {
  const species=speciesOf(args.species), room=roomOf(s,species), cfg=SPECIES[species];
  requireValue(!room.job,'这间房已有一窝正在培育。');
  const mother=s.pets.find(p=>p.id===args.mother), father=s.pets.find(p=>p.id===args.father);
  requireValue(mother?.species===species && father?.species===species && mother.sex==='母' && father.sex==='公'
    && canBreed(s,mother,now) && canBreed(s,father,now),'请选择仍在店、可繁育的一公一母成年或老年动物。');
  const guide=args.guide??-1;
  requireValue(Number.isInteger(guide)&&guide>=-1&&guide<6,'请选择有效的指导维度。');
  if(guide>=0) {
    requireValue(room.items.guide>0,'该物种的选育指导单不足。');
    requireValue(mother.traits[guide].grade!==father.traits[guide].grade,'两只亲本此维评分相同，不能使用指导。');
  }
  const [rare=0,mutation=0]=s.research?.[species]??[];
  const options={rare,positive:room.mutationEnabled?mutation:0,guide};
  const endsAt=now+cfg.wait*MINUTE, n=cfg.min+weighted(cfg.litter);
  const mixed=mixedOffspring(mother,father);
  const usedNames=occupiedPetNames(s);
  const offspring=Array.from({length:n},()=>{
    const look=Math.random()<.5?mother:father;
    return makePet(usedNames,species,look.breedKey,Math.random()<.5?'公':'母',endsAt,'本店繁育',{
      motherId:mother.id,fatherId:father.id,motherName:mother.name,fatherName:father.name,
      mixed,
      coatIndex:Math.random()<.85?look.coatIndex:weighted(coatWeights)+1,
      traits:inherit(mother,father,options),
    });
  });
  if(guide>=0)room.items.guide--;
  room.job={motherId:mother.id,fatherId:father.id,mother:structuredClone(mother),father:structuredClone(father),options,endsAt,offspring};
  return '已开始繁育，预计 '+cfg.wait+' 分钟后出生。';
}
function charge(s,expected,base) {
  const amount=purchasePrice(s,base);
  requireValue(expected===amount,'报价有变化，请返回重新核对。');
  requireValue(s.coins>=amount,'金币不足。需要 '+amount+' 金币。');
  s.coins-=amount;
}
export function litterMembers(s,litter,now) {
  const ids=new Set(litter.ids);
  return s.pets.filter(p=>ids.has(p.id)&&!isBusy(s,p)&&stageOf(p,now)!=='已故');
}
// A litter decision applies to the same unprotected animals the player reviewed.
export function retainedLitterPets(s, decision, soldIds, now) {
  const litter=s.rooms[decision.species]?.lastLitter;
  requireValue(litter && litter.bornAt===decision.bornAt,'出生记录已更新，请重新挑选。');
  const eligible=litterMembers(s,litter,now).filter(p=>!p.retained);
  requireValue(Array.isArray(decision.keepIds)&&Array.isArray(soldIds),'本窝选单无效。');
  const all=[...decision.keepIds,...soldIds], chosen=new Set(all), keep=new Set(decision.keepIds);
  requireValue(chosen.size===all.length&&all.length===eligible.length&&eligible.every(p=>chosen.has(p.id)),
    '本窝名册已变化，请重新挑选。');
  return eligible.filter(p=>keep.has(p.id));
}
export function careAction(s,type,args,now) {
  if(!type.startsWith('care.')) return undefined;
  if(type==='care.retain') {
    const p=s.pets.find(p=>p.id===args.id);
    requireValue(p,'这只动物已离店。');
    requireValue(typeof args.retained==='boolean','请选择留种或取消留种。');
    requireValue(!args.retained||stageOf(p,now)!=='已故','已故动物无法新留种。');
    p.retained=args.retained;
    return p.name+(p.retained?'已标记为种源。':'已取消留种。');
  }
  if(type==='care.keepLitter') {
    const kept=retainedLitterPets(s,args,[],now);
    requireValue(kept.length>0,'本窝没有可留种的动物。');
    for(const p of kept)p.retained=true;
    return '本窝 '+kept.length+' 只动物已标记为种源。';
  }
  if(type==='care.checkin') {
    const today=dayAt(now);
    requireValue(s.care.signedDay!==today,'今天的两只幼兔已领取。');
    const usedNames=occupiedPetNames(s);
    const firstNames=s.care.signedDay==null ? ['谷穗','小麦'] : [];
    const pair=['母','公'].map((sex,i)=>makePet(usedNames,'rabbit','domestic',sex,now,'每日签到',{name:firstNames[i]}));
    s.pets.push(...pair);s.care.signedDay=today;s.care.claimIds=pair.map(p=>p.id);
    return '已领取两只基础原色幼兔，一公一母。';
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
  if(type==='care.buyPet') {
    const index=room.shelf.offers.findIndex(p=>p?.id===args.id);
    requireValue(index>=0 && room.shelf.number===args.batch,'货位已售空或批次已更新。');
    const offer=room.shelf.offers[index];
    charge(s,args.price,youngPurchaseBase(offer));
    const pet=makePet(occupiedPetNames(s,[offer]),species,offer.breedKey,offer.sex,now,'研究所采购',offer);
    s.pets.push(pet);
    room.shelf.offers[index]=null;
    if (pet.name!==offer.name) return '原货架名“'+offer.name+'”已被占用，已取名“'+pet.name+'”入住'+cfg.name+'房。';
    return pet.name+'已入住'+cfg.name+'房。';
  }
  if(type==='care.buyItem') {
    requireValue(Object.hasOwn(itemName,args.item),'没有这张服务单。');
    charge(s,args.price,cfg[args.item]);room.items[args.item]++;
    return '已购入'+cfg.name+'用'+itemName[args.item]+'一张。';
  }
  if(type==='care.toggle') {
    requireValue(typeof args.enabled==='boolean','请选择开启或关闭。');
    room.mutationEnabled=args.enabled;
    return '下次开始繁育时'+(args.enabled?'采用':'关闭')+'六维选育加成。';
  }
  if(type==='care.review') {
    const p=s.pets.find(p=>p.id===args.id);
    const i=args.field;
    requireValue(p?.species===species && stageOf(p,now)!=='已故' && !isBusy(s,p),'请选择在店空闲的活体。');
    requireValue(Number.isInteger(i)&&i>=0&&i<5,'只能复评前五栏中的一栏。');
    requireValue(p.reviews<3 && room.items.review>0,'复评次数或服务单不足。');
    const old=p.traits[i];
    p.traits[i]=rolledTrait(i,weighted([70,20,10]),old.grade,Math.random);
    (p.reviewHistory??=[]).push({at:now,field:i,before:old.label,after:p.traits[i].label,
      beforeRarity:old.rarity,afterRarity:p.traits[i].rarity,grade:old.grade});
    p.reviews++;room.items.review--;
    return fields[i]+'复评结果：'+old.label+' → '+p.traits[i].label+'，评分仍为 '+old.grade+'。';
  }
  return undefined;
}
export { fields, coatName, canBreed, stockStatus, dayAt, itemName };
export { carePage } from './care-pages.mjs';
