import { BlockInputEvents, Color, Graphics, Label, Node, UITransform } from 'cc';
import type { Animal, Choice, LedgerRow, MutationPreview, NutritionEffect } from './ShopConnection';
import { animalFilters, animalSummary, box, caption, frame, heading, paper, picture, press, rect, stockBadge, tap, type PageCanvas } from './LedgerCanvas';
import { RoomAnimalWalk } from './RoomAnimalWalk';
import { litterPositions } from './RoomFloor';

interface ParentTrait { grade:string; label:string; }
interface RoomPage {
    kind:string; species?:string; count?:number; matchedCount?:number; residents?:Animal[]; wait?:number; remaining?:number;
    maturity?:number; estimate?:string; youngArt?:string; price?:number; breed?:string; coins?:number; signed?:boolean; date?:string;
    parents?:(Animal|null)[]; candidates?:Animal[]; confirm?:Choice; animal?:Animal; bornAt?:number; endsAt?:number;
    guide?:{count:number;index:number};
    nutrition?:NutritionEffect;
    traits?:{type:string;label:string;rarity:string;grade:string}[];
    parentTraits?:{name:string;mother:ParentTrait;father:ParentTrait}[];
}
type AnimalRow=LedgerRow & {animal?:Animal;litterMember?:boolean};
const ink='#493A27', green='#29483E', muted='#725C42';
const nextStage:Record<string,string>={幼年:'成长',成长:'成年',成年:'老年',老年:'寿终'};
function animalArt(parent:Node,a:Pick<Animal,'art'|'stage'>,x:number,y:number,w:number,h:number):Node {
    return picture(parent,'Portrait',a.art,x,y,w,h,a.stage);
}
function floorArt(parent:Node,a:Animal,size:number,feet:number):Node {
    // All live canvases are 96×96; the resting canvases are 96×64.
    const centerToFeet=a.stage==='已故'?(58-32)/96:(90-48)/96;
    return animalArt(parent,a,0,feet+size*centerToFeet,size,size);
}
function section(c:PageCanvas,title:string,side=''):void {
    const h=30,y=c.slot(h,8);
    heading(c.body,'Section',title,-c.inner*.20,y,c.inner*.60,h,20,green);
    if(side)caption(c.body,'SectionNote',side,c.inner*.25,y,c.inner*.50,h,12,muted).horizontalAlign=2;
}
function note(c:PageCanvas,value:string):void {
    const lines=Math.ceil(value.length/(c.inner/13));
    const h=Math.max(24,lines*20+4);
    caption(c.body,'Note',value,0,c.slot(h,8),c.inner,h,13,muted);
}
function buttons(c:PageCanvas,items:Choice[]):void {
    if(!items.length)return;
    const y=c.slot(48,10),w=(c.inner-(items.length-1)*8)/items.length;
    items.forEach((a,i)=>press(c.body,'Action'+i,a.label||'查看',-c.inner/2+w/2+i*(w+8),y,w,
        ()=>c.ui.choose(a),i===0,Boolean(a.disabled),48));
}
function tabs(c:PageCanvas,flush=false):void {
    const items=c.p.tabs||[];
    if(!items.length)return;
    const w=(c.inner-(items.length-1)*3)/items.length,y=c.slot(48,flush?-2:10);
    items.forEach((a,i)=>{
        const tab=press(c.body,'Tab'+i,a.label||'',-c.inner/2+w/2+i*(w+3),y,w,()=>c.ui.choose({...a,replace:true}),!!a.active);
        if(!a.locked)return;
        tab.getChildByName('Caption')!.setPosition(0,9);
        const color=a.active?'#F3DFAD':'#745A35';
        picture(tab,'Lock','shop-modules/node-lock',-20,-11,15,15);
        caption(tab,'LockState','未开放',6,-11,40,19,11,color,true);
    });
}
// Native coordinates of the bowls painted into the approved 512 × 288 rooms.
const feedingPositions:Record<string,[number,number]>={
    rabbit:[347.5,94.5],cat:[333.5,113.5],dog:[349.5,107.5],
};
function feedingStation(c:PageCanvas,scene:Node,h:number,effect?:NutritionEffect):void {
    const species=c.args.species||'rabbit';
    const [px,py]=feedingPositions[species]??feedingPositions.rabbit;
    const x=(px/512-.5)*c.width,y=(.5-py/288)*h;
    const spriteScale=c.width/512;
    const station=box(scene,'FeedingStation',x,y,44,44);
    station.getComponent(UITransform)!.setAnchorPoint(.5,.25);
    const open=()=>c.ui.choose({page:'roomNutrition',args:{species}});
    tap(station,open);
    if(effect)picture(station,'MealFill','rooms/nutrition-meal-fill',0,9*spriteScale,25*spriteScale,17*spriteScale);
    if(!effect){
        const buttonWidth=114*spriteScale*.8,buttonHeight=50*spriteScale*.8;
        // This stretch of wall stays clear above the bowl in all three rooms.
        const hit=box(station,'FeedTarget',(372-px)*spriteScale,42*spriteScale,buttonWidth,Math.max(buttonHeight,44));
        tap(hit,open);
        const button=press(hit,'Feed','投喂',0,0,buttonWidth,open,false,false,buttonHeight);
        const title=button.getChildByName('Caption')!.getComponent(Label)!;
        title.fontSize=c.width<350?13:14;
        title.lineHeight=18;
        return;
    }
    // Keep the text above the bowl and clear of the right-side furnishings.
    const panelWidth=c.width*.24,size=c.width<350?10:12;
    const panel=frame(station,'NutritionProgress',(376-px)*spriteScale,36,panelWidth,44,paper.card,paper.brass,false);
    tap(panel,open);
    caption(panel,'Rate','成长加速 ×'+effect.rate,0,12,panelWidth-8,15,size,paper.green,true).isBold=true;
    const line=panelWidth-8,labelWidth=line*.57,clockWidth=line-labelWidth;
    caption(panel,'Duration','有效时间',-clockWidth/2,-4,labelWidth,14,size,paper.muted,true);
    const countdown=caption(panel,'Countdown','',labelWidth/2,-4,clockWidth,14,size,paper.green,true);
    countdown.isBold=true;
    const width=panelWidth-10,bar=4;
    const track=box(panel,'Track',0,-16,width,bar,'#CCB07A');
    const fill=box(track,'Fill',0,0,width,bar).addComponent(Graphics);
    const duration=(effect.endsAt-effect.startsAt)/1000;
    c.ui.bindStageCountdown(countdown,effect.endsAt,seconds=>{
        fill.clear();
        rect(fill,-width/2,-bar/2,width*Math.min(1,seconds/duration),bar,paper.primary);
    });
}
function roomScene(c:PageCanvas,path:string,animals:Animal[],name:string,plaque:boolean,edgeTop=false,
                   links?:Map<string,Choice>):Node {
    if(edgeTop)c.slot(-(c.width-c.inner)/2,0);
    const h=c.width*9/16;
    const scene=box(c.body,'Artwork',0,c.slot(h,10),c.width,h,'#B3834F');
    picture(scene,'Room',path,0,0,c.width,h);
    if(plaque) {
        const sign=frame(scene,'RoomPlaque',-c.width/2+42,h/2-22,60,27,'#294C40','#BB965E',true);
        heading(sign,'Caption',name+' 房',0,0,58,22,15,'#FFF0C4',true);
        box(scene,'FloorEdge',0,-h/2+2,c.width,4,'#795632');
    }
    const inRoster=c.key==='rooms'||c.key==='roomRoster';
    const visible=inRoster?animals.slice(0,10):animals;
    const spots=inRoster?c.ui.roomFloor!.positions(visible.map(a=>a.id),c.width,h):
        c.key==='litter'?litterPositions(visible.length,c.width,h):[];
    visible.forEach((a,i)=>{
        const spot=spots[i];
        const w=spot?.hit??c.width*.22,sh=spot?.hit??h*.36;
        const x=spot?.x??c.width*([.26,.67,.47][i]-.5);
        const y=spot?.y??h*(.5-[.79,.84,.94][i])+sh/2;
        const resident=box(scene,'Resident'+i,x,y,w,sh);
        const figure=spot?floorArt(resident,a,spot.size,spot.feet):animalArt(resident,a,0,0,w,sh);
        if(a.stage==='已故') {
            const badgeY=spot?spot.feet+spot.size*.52+4:-sh*.37;
            const badge=box(resident,'AtRest',0,badgeY,33,15,'#544E44');
            caption(badge,'Caption','已故',0,0,32,14,10,'#FFF2D3',true);
        } else if(a.status!=='繁育中') {
            resident.addComponent(RoomAnimalWalk).setup(figure,a.art,a.stage,name,i,c.width,h,spot?.patrol);
        }
        const target=links?links.get(a.id):{page:'pet',args:{id:a.id}};
        if(target)tap(resident,()=>c.ui.choose(target));
    });
    return scene;
}
function petLine(c:PageCanvas,a:Animal,i:number,choose:(()=>void)|undefined,tail='›',last=false,selected=false):void {
    const h=76;
    const card=frame(c.body,'Animal'+i,0,c.slot(h,last?10:0),c.inner,h,selected?'#E8E8C9':'#FBEFCF','#C7AD7A');
    const left=-c.inner/2,picWidth=52;
    const thumb=box(card,'Thumb',left+10+picWidth/2,0,picWidth,50,'#ECDEB8');
    box(thumb,'Ledge',0,-24,picWidth,2,'#D1B783');
    animalArt(thumb,a,0,0,picWidth,50);
    const textLeft=left+picWidth+19,bodyW=c.inner-picWidth-72;
    const target=(c.key==='rooms'||c.key==='roomRoster')&&Number.isFinite(a.stageEndsAt)?nextStage[a.stage]:'';
    const timerW=Math.min(92,Math.max(77,c.inner*.24)),right=c.inner/2-9;
    const detailW=target?Math.min(bodyW,right-timerW-7-textLeft):bodyW;
    animalSummary(card,a,textLeft,detailW,0);
    caption(card,'Tail',tail,c.inner/2-22,target?22:0,39,target?21:h-4,13,'#47604A',true).isBold=true;
    if(target){
        const x=right-timerW/2;
        caption(card,'StageTarget','距'+target,x,0,timerW,19,12,muted).horizontalAlign=2;
        const clock=caption(card,'StageCountdown','',x,-19,timerW,20,13,green);
        clock.horizontalAlign=2;clock.isBold=true;
        c.ui.bindStageCountdown(clock,a.stageEndsAt!);
    }
    if(choose)tap(card,choose);
}
function book(c:PageCanvas,name:string,h:number):Node {
    const outer=frame(c.body,name,0,c.slot(h,10),c.inner,h,'#F0DEB4','#AB8C58',true);
    return box(outer,'Paper',0,0,c.inner-7,h-7,'#FCF0CE');
}
function rule(parent:Node,w:number,y:number):void {box(parent,'Rule',0,y,w,1,'#CDB78F');}
const openPet=(c:PageCanvas,p:Animal)=>()=>c.ui.choose({page:'pet',args:{id:p.id}});
function inRoom(c:PageCanvas,m:RoomPage,rows:AnimalRow[]):void {
    const all=rows.filter(r=>r.animal).map(r=>r.animal!);
    const room=c.args.species||'rabbit',name=m.species!;
    const extras=rows.filter(r=>r.link&&!r.animal);
    const breed=extras.find(r=>r.link?.page==='breed')?.link||{page:'breed',args:{species:room}};
    tabs(c,true);
    // Older servers returned three unfiltered residents alongside a complete filtered roster.
    const scene=roomScene(c,c.p.art!,c.p.rows?all:m.residents||[],name,true);
    feedingStation(c,scene,c.width*9/16,m.nutrition);
    c.startList();
    const count=m.count??all.length,matched=m.matchedCount??all.length;
    const countText=count===matched?count+' 只登记':'符合 '+matched+' / 共 '+count+' 只';
    section(c,name+'房名册',countText);
    const status=c.p.filters?.[0]?.find(option=>option.active)?.args?.filter||c.args.filter||'全部';
    const stage=c.p.filters?.[1]?.find(option=>option.active)?.args?.stage||'全部';
    buttons(c,[{...breed,label:'进繁育台'},{page:'sale',args:{channel:'market',species:room,filter:status,stage},label:'挑选出售'}]);
    animalFilters(c);
    c.startList();
    all.forEach((a,i)=>petLine(c,a,i,openPet(c,a),'›',i===all.length-1));
    if(!all.length)note(c,c.p.empty||'当前筛选下没有动物。');
    c.startFooter();
    c.actions(extras.filter(r=>r.link?.page==='litter'||r.link?.page==='roomReceipt').map(r=>({...r.link!,label:r.title})));
}
function locked(c:PageCanvas,m:RoomPage):void {
    tabs(c,true);
    roomScene(c,c.p.art!,[],m.species!,false);
    c.startList();
    section(c,'开放'+m.species+'房','房间与种源一并获得');
    const card=book(c,'RoomOffer',104);
    picture(card,'Young',m.youngArt!,-c.inner/2+47,0,72,70,'幼年');
    const x=39,w=c.inner-100;
    heading(card,'Breed',m.breed+' · 幼体',x,25,w,28,17,green);
    caption(card,'Pair','一公一母 · 六维 B',x,0,w,23,14,ink);
    caption(card,'Maturity','入住后 '+m.maturity+' 分钟成年',x,-24,w,22,13,muted);
    const fee=frame(c.body,'Cost',0,c.slot(45,10),c.inner,45,'#F2DFB8','#C6A571');
    caption(fee,'Label','房间套餐',-c.inner/4,0,c.inner/2-24,35,14,muted);
    heading(fee,'Price',m.price!.toLocaleString()+' 金币',c.inner/4,0,c.inner/2-24,35,17,'#845229').horizontalAlign=2;
    const remainder=m.coins!-m.price!;
    note(c,'当前余额 '+m.coins!.toLocaleString()+' 金币'+(remainder<0?'，还差 '+(-remainder).toLocaleString()+' 金币。':'，付款后余 '+remainder.toLocaleString()+' 金币。'));
    if(m.estimate)note(c,'若现在入住，预计北京时间 '+m.estimate+' 成年。');
    if(remainder>=0&&remainder<300)note(c,'建议留 300 金币周转，也可以现在开房。');
    c.startFooter();
    const actions=c.p.actions||[];
    const roomUnlock=actions.find(a=>a.type==='care.unlock');
    if(!roomUnlock){buttons(c,actions);return;}
    const short=m.coins!<m.price!;
    buttons(c,[{...roomUnlock,label:'解锁'+m.species+'房',disabled:short||roomUnlock.disabled},
        ...(short?[{label:'去自由市场',page:'market'}]:[])]);
}
function checkIn(c:PageCanvas,m:RoomPage,rows:AnimalRow[]):void {
    const card=book(c,'AdoptionBook',303),w=c.inner-30;
    caption(card,'BookName','兔房收养记录',-w/4,124,w/2,24,13,'#826645');
    const date=m.date!.split('-');heading(card,'Date',Number(date[1])+'月'+Number(date[2])+'日',w/4,124,w/2,24,14,'#3F5B49').horizontalAlign=2;
    rule(card,w,108);heading(card,'Title','每日签到簿',0,82,w,29,20,green);
    caption(card,'Note','今日可领一对基础原色幼兔。',0,51,w,25,15,ink);
    ['male','female'].forEach((sex,i)=>{
        const x=(i-.5)*104;
        animalArt(card,{art:'pets/domestic-coat01_'+sex,stage:'幼年'},x,-8,79,80);
        heading(card,'Sex'+i,'原色幼兔 · '+(i?'母':'公'),x,-53,100,23,14,ink,true);
    });
    const claim=c.p.actions?.find(a=>a.type==='care.checkin');
    if(claim)press(card,'Claim',claim.label||'',0,-109,w,()=>c.ui.choose(claim),true);
    else {
        const seal=frame(card,'Stamp',0,-110,w,36,'#FCF0CE','#748266');
        heading(seal,'Caption','今日已领取',0,0,w-15,30,16,'#476646',true);
    }
    c.startList();
    if(m.signed) {
        section(c,'今日领养','已登记');
        rows.filter(r=>r.animal).forEach((r,i)=>petLine(c,r.animal!,i,openPet(c,r.animal!)));
    } else note(c,'幼兔约 30 分钟后成年。领养后入住兔房。');
    const room=c.p.actions?.find(a=>a.page==='rooms');
    c.startFooter();
    if(room)press(c.body,'RoomRoster',room.label||'',0,c.slot(48),c.inner,()=>c.ui.choose(room));
}
function detail(c:PageCanvas,m:RoomPage,rows:AnimalRow[]):void {
    const a=m.animal!,card=book(c,'AnimalFile',230),w=c.inner-24,left=-w/2;
    caption(card,'BookName',m.species+'房 · 个体档案',-w/4,95,w/2,22,13,'#826645');
    heading(card,'Id','#'+a.number,w/4,95,w/2,22,14,green).horizontalAlign=2;
    rule(card,w,78);
    const identityW=Math.floor(w*.34),identityX=left+identityW/2;
    if(a.retained)stockBadge(card,left+19,61);
    animalArt(card,a,identityX,17,identityW-8,72);
    heading(card,'Name',a.name,identityX,-34,identityW,25,18,green);
    caption(card,'Breed',a.breed+' · '+a.coat,identityX,-58,identityW,24,12,ink);
    caption(card,'Status',a.sex+' · '+a.stage+' · '+a.status,identityX,-84,identityW,28,12,muted);
    box(card,'Divider',left+identityW+4,-13,1,167,'#D8C39B');
    const start=left+identityW+12,traitW=w/2-start;
    heading(card,'TraitsTitle','个体特征',start+traitW/2,60,traitW,22,15,green);
    (m.traits||[]).forEach((t,i)=>{
        const y=35-i*25;
        const line=box(card,'Trait'+i,start+traitW/2,y,traitW,25);
        box(line,'Rule',0,-12,traitW,1,'#E2CCA4');
        const x=-traitW/2,gradeW=22,rarity=t.rarity!=='普通',rarityW=rarity?27:0;
        const typeW=t.type.length>2?41:32,tagW=traitW-typeW-gradeW-rarityW;
        caption(line,'Type',t.type,x+typeW/2,0,typeW,22,12,muted);
        caption(line,'Tag',t.label,x+typeW+tagW/2,0,tagW,23,13,ink);
        if(rarity)caption(line,'Rarity',t.rarity,traitW/2-gradeW-rarityW/2,0,rarityW,22,11,'#86592F',true);
        heading(line,'Grade',t.grade,traitW/2-gradeW/2,0,gradeW,23,14,green,true);
    });
    c.startList();
    const summary=[['阶段',rows[0]?.text],['来源',rows[1]?.text],...rows.slice(8).map(row=>[row.title,row.text])];
    for(const [title,value] of summary){
        if(!title||!value)continue;
        const labelW=90,h=Math.max(32,Math.ceil(value.length/Math.max(1,Math.floor((c.inner-labelW-18)/13)))*19+10);
        const line=frame(c.body,'DetailLine',0,c.slot(h,2),c.inner,h,'#F9EDCF','#D3BD92',false);
        caption(line,'Key',title,(-c.inner+labelW)/2+8,0,labelW,24,13,muted);
        caption(line,'Value',value,(labelW+2)/2,0,c.inner-labelW-18,h-4,13,ink);
    }
    if(a.retained)note(c,a.stage==='已故'?'取消留种后可前往动物回收。':'种源不可出售，可在这里取消留种。');
    c.startFooter();
    c.actions(c.p.actions||[]);
}
function compareParents(c:PageCanvas,traits:NonNullable<RoomPage['parentTraits']>):void {
    const gap=7,w=(c.inner-gap)/2,rowH=31,h=35+traits.length*rowH,y=c.slot(h,8);
    (['mother','father'] as const).forEach((side,index)=>{
        const column=frame(c.body,index?'FatherTraits':'MotherTraits',(index?1:-1)*(w+gap)/2,y,w,h,paper.card,paper.brass,false);
        heading(column,'ColumnTitle',index?'父本':'母本',0,h/2-16,w-14,23,15,green,true);
        traits.forEach((trait,i)=>{
            const item=trait[side],py=h/2-33-rowH*(i+.5);
            const row=box(column,'Trait'+i,0,py,w,rowH);
            box(row,'Rule',0,rowH/2,w-12,1,'#E2CCA4');
            const typeW=30,gradeW=27,labelW=w-typeW-gradeW-14;
            caption(row,'Type',trait.name,-w/2+7+typeW/2,0,typeW,rowH-4,12,muted);
            caption(row,'Tag',item.label,-w/2+7+typeW+labelW/2,0,labelW,rowH-4,13,ink);
            heading(row,'Grade',item.grade,w/2-7-gradeW/2,0,gradeW,rowH-4,15,
                trait.mother.grade===trait.father.grade?green:'#A53928',true);
        });
    });
}
function pairing(c:PageCanvas,m:RoomPage,rows:AnimalRow[]):void {
    const hasConfirm=m.kind==='pairConfirm',card=book(c,'ParentPair',100),parents=m.parents!;
    const x=c.inner*.26;
    ['选择母本','选择父本'].forEach((label,i)=>{
        const px=i?x:-x,animal=parents[i];
        const holder=frame(card,'Slot'+i,px,11,62,58,animal?'#ECDEB8':'#FCF0CE','#C5AA7E');
        if(animal)animalArt(holder,animal,0,0,58,54);
        else caption(holder,'Sex',i?'♂':'♀',0,0,55,51,24,'#AC9470',true);
        heading(card,'Name'+i,animal?animal.name:label,px,-30,c.inner*.42,22,14,ink,true);
    });
    caption(card,'Cross','×',0,0,34,46,24,'#987951',true);
    if(hasConfirm) {
        section(c,'核对亲本','五项评分与缺陷等级');
        c.startList();
        if(m.parentTraits?.length)compareParents(c,m.parentTraits);
        rows.forEach((r,i)=>c.row(r,i));
        c.startFooter();
        const actions=c.p.actions||[],start=actions.find(a=>a.type==='care.breed');
        const toggle=actions.find(a=>a.type==='care.toggle');
        const selected=m.guide?.index??start?.args?.guide??-1;
        const options=actions.filter(a=>a.page==='breed'&&a.replace&&Number.isInteger(a.args?.guide));
        const choice=options.find(a=>a.args?.guide===selected)||options[0];
        const y=c.slot(48,6),w=toggle?(c.inner-6)*.55:c.inner;
        const anchor=press(c.body,'ChooseGuide',choice.label+' ▾',(w-c.inner)/2,y,w,
            ()=>c.ui.openFilter([{anchor,options}],0));
        if(toggle)press(c.body,'BonusSettings','五维加成设置',(w+6)/2,y,c.inner-w-6,c.ui.openBreedingBonus);
        const cancel=actions.find(a=>a.label==='取消繁育');
        if(start&&cancel){
            const buttonW=(c.inner-6)/2,buttonX=(buttonW+6)/2,buttonY=c.slot(48,6);
            press(c.body,'Action0',start.label!, -buttonX,buttonY,buttonW,()=>c.ui.choose(start),true);
            press(c.body,'CancelPair',cancel.label!,buttonX,buttonY,buttonW,()=>c.ui.choose(cancel),false,false,48,'#E6CCA2');
        }
        return;
    }
    section(c,'选择亲本','成年或老年 · 一公一母');
    c.startList();
    const candidates=m.candidates!;
    candidates.forEach((p,i)=>{
        const key=p.sex==='母'?'mother':'father',active=parents.some(v=>v?.id===p.id);
        petLine(c,p,i,()=>{
            const args={...c.args,picking:true,[key]:active?null:p.id};
            c.ui.choose({page:'breed',args,replace:true});
        },active?'已选':'选择',i===candidates.length-1,active);
    });
    if(!candidates.length)note(c,'当前没有可配对的亲本。');
    c.startFooter();
    const dock=frame(c.body,'PairDock',0,c.slot(76,8),c.inner,76,'#F7E7C5','#AA9169');
    caption(dock,'Rule',m.species+'一生仅能繁育一窝，预计 '+m.wait+' 分钟后出生。',0,24,c.inner-20,20,13,muted);
    press(dock,'Review','核对亲本',0,-11,c.inner-20,()=>{if(m.confirm)c.ui.choose(m.confirm);},true,!m.confirm);
    c.actions((c.p.actions||[]).filter(a=>a.page==='litter'));
    tabs(c);
}
function breeding(c:PageCanvas,m:RoomPage):void {
    roomScene(c,c.p.art!,m.parents!.filter((a):a is Animal=>!!a),m.species!,true,true);
    c.startList();
    section(c,'这窝正在培育','繁育台已占用');
    const card=book(c,'Job',110),w=c.inner-29;
    caption(card,'When','预计出生',0,31,w,22,14,muted);
    const remaining=heading(card,'Remaining','',0,2,w,34,21,green);
    c.ui.bindBirthCountdown(remaining,m.endsAt!);
    caption(card,'Parents',m.parents!.filter(a=>a).map(a=>a!.name).join(' × '),0,-32,w,24,13,muted);
    c.startFooter();
    tabs(c);
    buttons(c,c.p.actions||[]);
}

export function drawBreedingBonus(parent:Node,preview:MutationPreview|undefined,enabled:boolean,
                                 pending:boolean,setEnabled:(value:boolean)=>void,close:()=>void):void {
    const bounds=parent.getComponent(UITransform)!;
    const overlay=box(parent,'BonusDialog',0,0,bounds.width,bounds.height);
    const shade=overlay.addComponent(Graphics);
    shade.fillColor=new Color(26,43,35,164);
    shade.rect(-bounds.width/2,-bounds.height/2,bounds.width,bounds.height);shade.fill();
    tap(overlay,close);overlay.addComponent(BlockInputEvents);
    const w=Math.min(360,bounds.width-20),inner=w-28;
    const fields=preview?.fields||[],h=fields.length?258+fields.length*29:258;
    const panel=frame(overlay,'Settings',0,0,w,h,'#FCF0D2','#866846');
    panel.addComponent(BlockInputEvents);
    const scale=Math.min(1,(bounds.height-16)/h);
    panel.setScale(scale,scale,1);
    const top=h/2;
    heading(panel,'Title','五维选育加成',0,top-26,inner,32,21,green);
    const description=preview?'本房研究 Lv.'+preview.level+' · 设置用于下次繁育':'设置用于本房下次繁育';
    caption(panel,'Level',description,0,top-54,inner,23,13,muted);
    const bw=(inner-8)/2;
    for(const value of [true,false]){
        const name=value?'开启':'关闭',active=value===enabled;
        press(panel,value?'BonusOn':'BonusOff',(active?'✓ ':'')+name,(value?-1:1)*(bw+8)/2,top-94,bw,
            ()=>{if(!pending&&!active)setEnabled(value);},active,false,44);
    }
    const offset=top-134;
    const colName=inner*.33,colParents=inner*.30,colChance=inner-colName-colParents;
    const nameX=(colName-inner)/2,parentsX=-inner/2+colName+colParents/2,chanceX=(inner-colChance)/2;
    if(fields.length){
        caption(panel,'Field','特征',nameX,offset,colName,21,13,muted);
        caption(panel,'Parents','母 / 父',parentsX,offset,colParents,21,13,muted,true);
        caption(panel,'Effect','上浮一档概率',chanceX,offset,colChance,21,13,muted,true);
        fields.forEach((field,i)=>{
            const row=box(panel,'Trait'+i,0,offset-25-i*29,inner,29);
            box(row,'Rule',0,14,inner,1,'#D9C49B');
            caption(row,'Name',field.name,nameX,0,colName,25,14,ink);
            caption(row,'Parents',field.mother+' / '+field.father,parentsX,0,colParents,25,13,muted,true);
            heading(row,'Chance',(enabled?field.on:field.off)+'%',chanceX,0,colChance,25,15,green,true);
        });
    }
    const hint=fields.length?'上浮以幼体选中的亲本评分为基准，已计入本窝指导单的选择。':'当前经营服务未提供逐项概率。';
    caption(panel,'Explanation',hint,0,-h/2+80,inner,38,13,muted);
    press(panel,'Back','返回配对',0,-h/2+34,inner,close,false,false,44);
}

function litter(c:PageCanvas,m:RoomPage,rows:AnimalRow[]):void {
    const members=rows.filter(r=>r.litterMember||r.animal);
    const animals:Animal[]=[];
    const links=new Map<string,Choice>();
    for(const row of members){
        if(!row.animal)continue;
        animals.push(row.animal);
        if(row.link)links.set(row.animal.id,row.link);
    }
    roomScene(c,c.p.art!,animals,m.species!,true,true,links);
    c.startList();
    section(c,'这一窝',m.count+' 只出生');
    if(c.p.subtitle)note(c,c.p.subtitle);
    c.startList();
    members.forEach((r,i)=>{
        if(r.animal)petLine(c,r.animal,i,r.link?()=>c.ui.choose(r.link!):undefined,r.link?'›':'',i===members.length-1);
        else c.row(r,i);
    });
    rows.filter(r=>!r.litterMember&&!r.animal).forEach((r,i)=>c.row(r,members.length+i));
    c.startFooter();
    buttons(c,c.p.actions||[]);
}
export function drawRoom(c:PageCanvas):boolean {
    const m=(c.p as typeof c.p & {presentation?:RoomPage}).presentation;
    const rows=(c.p.rows||[]) as AnimalRow[];
    if(c.key==='litterKeep'&&rows.some(r=>r.animal)) {
        const animals=rows.filter(r=>r.animal);
        section(c,'挑选留种');
        if(c.p.subtitle)note(c,c.p.subtitle);
        c.startList();
        animals.forEach((r,i)=>{
            const id=r.select,selected=!!id&&c.ui.selected.has(id);
            petLine(c,r.animal!,i,id?()=>c.ui.toggle(id):undefined,id?(selected?'✓ 留养':'留养'):'已留种',i===animals.length-1,selected);
        });
        c.startFooter();
        c.selection();
        (c.p.actions||[]).forEach((a,i)=>c.action(a,i));return true;
    }
    if(!m)return false;
    switch(m.kind) {
        case 'rooms':case 'roster':inRoom(c,m,rows);return true;
        case 'locked':locked(c,m);return true;
        case 'pet':detail(c,m,rows);return true;
        case 'checkin':checkIn(c,m,rows);return true;
        case 'pair':case 'pairConfirm':pairing(c,m,rows);return true;
        case 'breeding':breeding(c,m);return true;
        case 'litter':litter(c,m,rows);return true;
        default:return false;
    }
}
