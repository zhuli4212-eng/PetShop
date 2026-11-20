import { BREEDS, SPECIES, admitPurchasedPet, beijingTime, chargeQuoted, dayAt, makeReservationOffer, specimen, stageOf } from './care.mjs';
import { purchasePrice, youngPurchaseBase } from './business.mjs';

const speciesOptions=['cat','dog'];
const reserveFees={cat:200,dog:500};
const courseFees={cat:[3000,6000,12000],dog:[8000,16000,32000]};
const halfHour=30*60_000, day=48*halfHour;
const courseTitles=['初级','进阶','专精'];
const courseGoals=['持有 1 只本店繁育的同品种纯种幼体或成体。',
  '持有 2 只本店繁育的同品种纯种成体，每只至少有一项五维达到 A 或以上。',
  '持有 3 只本店繁育的同品种纯种成体，每只至少有两项五维达到 A 或以上。'];
const go=(label,page,args)=>({label,page,args,replace:true});
const button=(label,type,args,confirm,disabled=false)=>({label,type,args,confirm,disabled});
const row=(title,text,link)=>({title,text,...(link&&{link})});
const time=value=>beijingTime(value).slice(0,16);

function requireRoom(s,species) {
  if(!speciesOptions.includes(species)||!s.rooms[species])throw Error('请先开放对应的猫房或狗房。');
  return s.rooms[species];
}

function qualifyingPets(s,{breedKey,tier},now) {
  return s.pets.filter(p=>p.breedKey===breedKey&&!p.mixed&&p.source==='本店繁育'&&stageOf(p,now)!=='已故'&&
    (tier===0||(['成年','老年'].includes(stageOf(p,now))&&p.traits.slice(0,5).filter(t=>['A','S','S+'].includes(t.grade)).length>=tier)));
}

function reservationPage(s,species,args,base,now) {
  const room=s.rooms[species], held=room.reservedSeed;
  const context={species}, page='seedReservation';
  if(held){
    const {offer,readyAt,expiresAt,fee}=held;
    const identity={...context,id:offer.id};
    const title=BREEDS[offer.breedKey].name+' · '+offer.sex;
    if(now<readyAt)return {...base,subtitle:'预约已登记',rows:[row(title,time(readyAt)+' 到货 · 北京时间')],
      actions:[button('取消预约','seed.cancel',identity,'取消本次预约，退回 '+fee+' 金币？')]};
    const animal=specimen(s,{...offer,bornAt:now},now,{inShop:false}),price=purchasePrice(s,youngPurchaseBase(offer));
    return {...base,subtitle:'预约已到货',rows:[{...row(animal.name+' · '+title,'购买 '+price+' 金币 · '+time(expiresAt)+' 前领取'),art:animal.art,stage:animal.stage}],
      actions:[button('购买预约种源','seed.claim',{...identity,price},'支付 '+price+' 金币，让这只幼体入住？',s.coins<price),
        button('放弃种源','seed.cancel',identity,'放弃已到货种源？预约费已结算。')]};
  }
  const fee=purchasePrice(s,reserveFees[species]);
  const details=row('定向预约','选择品种和性别，下批到货后保留 24 小时。每房每天最多一次，购宠另行付款。');
  if(room.reservedOn===dayAt(now))return {...base,rows:[details,row('今日已预约','北京时间次日零点后可以再次预约。')]};
  const breedKey=args.breedKey;
  if(!SPECIES[species].breeds.includes(breedKey))return {...base,rows:[details,...SPECIES[species].breeds.map(key=>
    row(BREEDS[key].name,'预约费用 '+fee+' 金币',go('选性别',page,{...context,breedKey:key})))]};
  return {...base,subtitle:BREEDS[breedKey].name,rows:[details],actions:['母','公'].map(sex=>
    button('预约'+sex+'性','seed.reserve',{species,breedKey,sex,fee},'支付 '+fee+' 金币预约'+BREEDS[breedKey].name+'（'+sex+'）？',s.coins<fee))};
}

function coursesPage(s,species,args,base,now) {
  const state=s.rooms[species].breedingCourses,active=state?.active;
  if(active){
    const {breedKey,tier}=active, name=BREEDS[breedKey].name;
    const animals=qualifyingPets(s,active,now), count=tier+1;
    return {...base,subtitle:name+' · '+courseTitles[tier],
      rows:[row('当前课题',courseGoals[tier]),row('进度',animals.length+' / '+count+' 只 · 完成后登记证书，动物继续留在店内。')],
      actions:[button('提交成果','course.complete',{species,breedKey,tier},undefined,animals.length<count),
        button('撤回课题','course.cancel',{species,breedKey,tier},'撤回后可重新选择课题。已支付的报名费不退，确认撤回？')]};
  }
  const breedKey=args.breedKey, list=SPECIES[species].breeds;
  if(!list.includes(breedKey))return {...base,rows:list.map(key=>row(BREEDS[key].name,'查看三档培育课题',
    go('查看', 'breedingCourses',{species,breedKey:key})))};
  const recorded=state?.records??{};
  return {...base,subtitle:BREEDS[breedKey].name,rows:courseTitles.map((label,tier)=>{
    const fee=purchasePrice(s,courseFees[species][tier]), achieved=recorded[breedKey+'-'+tier];
    const locked=tier>0&&!recorded[breedKey+'-'+(tier-1)];
    const status=achieved?'已登记证书':locked?'先完成上一档':fee+' 金币报名';
    return {...row(label+' · '+status,courseGoals[tier]),...(!achieved&&!locked&&{action:button('报名','course.start',
      {species,breedKey,tier,fee},'支付 '+fee+' 金币报名'+BREEDS[breedKey].name+' · '+label+'？课题没有期限，撤回不退费。',s.coins<fee)})};
  })};
}

export function breedingProgramPage(s,page,args,now) {
  if(page!=='seedReservation'&&page!=='breedingCourses')return undefined;
  const reservation=page==='seedReservation', title=reservation?'定向种源预约':'品种培育课题';
  const open=speciesOptions.filter(key=>s.rooms[key]);
  if(!open.length)return {title,rows:[row('开放后可用','先开放猫房或狗房。')]};
  const species=open.includes(args.species)?args.species:open[0];
  const base={title,tabs:open.map(key=>({...go(SPECIES[key].name+'房',page,{species:key}),active:species===key}))};
  return reservation?reservationPage(s,species,args,base,now):coursesPage(s,species,args,base,now);
}

export function breedingProgramAction(s,type,args,now) {
  if(!type.startsWith('seed.')&&!type.startsWith('course.'))return undefined;
  const {species,breedKey,tier}=args, room=requireRoom(s,species);
  if(type==='seed.reserve'){
    const today=dayAt(now);
    if(room.reservedSeed||room.reservedOn===today)throw Error('该房今日已预约或仍有待领取的种源。');
    if(!SPECIES[species].breeds.includes(breedKey)||!['母','公'].includes(args.sex))throw Error('请选择该物种的品种和性别。');
    const fee=purchasePrice(s,reserveFees[species]);
    chargeQuoted(s,args.fee,fee);
    const readyAt=room.openedAt+(Math.floor((now-room.openedAt)/halfHour)+1)*halfHour;
    room.reservedOn=today;
    room.reservedSeed={offer:makeReservationOffer(s,species,today,breedKey,args.sex),fee,readyAt,expiresAt:readyAt+day};
    return '预约已登记，预计 '+time(readyAt)+' 到货（北京时间）。';
  }
  if(type==='seed.cancel'||type==='seed.claim'){
    const held=room.reservedSeed;
    if(!held||held.offer.id!==args.id||now>=held.expiresAt)throw Error('预约不存在或已过期。');
    if(type==='seed.cancel'){
      const refund=now<held.readyAt?held.fee:0;
      s.coins+=refund;
      delete room.reservedSeed;
      return refund?'已取消预约并退回 '+refund+' 金币。':'已放弃该种源。';
    }
    if(now<held.readyAt)throw Error('预约种源尚未到货。');
    chargeQuoted(s,args.price,purchasePrice(s,youngPurchaseBase(held.offer)));
    const pet=admitPurchasedPet(s,room,held.offer,now);
    delete room.reservedSeed;
    return pet.name+'已入住'+SPECIES[species].name+'房。';
  }
  if(!SPECIES[species].breeds.includes(breedKey)||!Number.isInteger(tier)||!courseTitles[tier])throw Error('没有这项培育课题。');
  const state=room.breedingCourses??={records:{}};
  const key=breedKey+'-'+tier;
  if(type==='course.start'){
    if(state.active||state.records[key]||tier>0&&!state.records[breedKey+'-'+(tier-1)])throw Error('请先处理当前课题或完成前一档。');
    chargeQuoted(s,args.fee,purchasePrice(s,courseFees[species][tier]));
    state.active={breedKey,tier};
    return '已登记'+BREEDS[breedKey].name+' · '+courseTitles[tier]+'课题。';
  }
  if(state.active?.breedKey!==breedKey||state.active.tier!==tier)throw Error('这项课题当前未报名。');
  if(type==='course.cancel'){delete state.active;return '已撤回课题。';}
  if(type==='course.complete'){
    if(qualifyingPets(s,state.active,now).length<tier+1)throw Error('店内动物还未满足课题条件。');
    state.records[key]={breedKey,tier,completedAt:now};
    delete state.active;
    return '已将'+BREEDS[breedKey].name+' · '+courseTitles[tier]+'培育证书收入店主登记簿。';
  }
  return undefined;
}

export function certificateRows(s) {
  return speciesOptions.flatMap(species=>Object.values(s.rooms[species]?.breedingCourses?.records??{}).map(({breedKey,tier,completedAt})=>
    row(BREEDS[breedKey].name+' · '+courseTitles[tier]+'培育证书',time(completedAt)+' 登记 · 北京时间')));
}
