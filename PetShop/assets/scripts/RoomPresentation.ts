import { BlockInputEvents, Color, Label, Node, UITransform } from 'cc';
import type { Animal, AnimalTag, Choice, LedgerRow, MutationPreview, NutritionEffect } from './ShopConnection';
import { animalCardWidth, animalDetails, animalFilters, animalSummary, animalSummaryHeight, box, caption, frame, frameContents, heading, paper, picture, press, setSolidRect, stockBadge, tap, type PageCanvas } from './LedgerCanvas';
import { RoomAnimalWalk } from './RoomAnimalWalk';
import { litterPositions } from './RoomFloor';
import { guideNote, growthSpark } from './TutorialPresentation';
import { setTextStyle, setTextWeight } from './ShopTypography';

interface ParentTrait { grade:string; label:string; }
interface RoomPage {
    kind:string; species?:string; count?:number; matchedCount?:number; residents?:Animal[]; wait?:number; waitText?:string; remaining?:number;
    maturity?:number; estimate?:string; youngArt?:string; price?:number; breed?:string; coins?:number; signed?:boolean; date?:string;
    parents?:(Animal|null)[]; candidates?:Animal[]; confirm?:Choice; animal?:Animal; bornAt?:number; endsAt?:number;
    nutrition?:NutritionEffect;
    reviews?:number;inventory?:number;
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
    setTextWeight(caption(panel,'Rate','成长加速 ×'+effect.rate,0,12,panelWidth-8,15,size,paper.green,true),true);
    const line=panelWidth-8,labelWidth=line*.57,clockWidth=line-labelWidth;
    caption(panel,'Duration','有效时间',-clockWidth/2,-4,labelWidth,14,size,paper.muted,true);
    const countdown=caption(panel,'Countdown','',labelWidth/2,-4,clockWidth,14,size,paper.green,true);
    setTextWeight(countdown,true);
    const width=panelWidth-10,bar=4;
    const track=box(panel,'Track',0,-16,width,bar,'#CCB07A');
    const fill=box(track,'Fill',0,0,width,bar,paper.primary);
    const duration=(effect.endsAt-effect.startsAt)/1000;
    c.ui.bindStageCountdown(countdown,effect.endsAt,seconds=>{
        setSolidRect(fill,-width/2,-bar/2,width*Math.min(1,seconds/duration),bar);
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
        if(c.ui.playGrowth&&c.p.visual?.grownIds?.includes(a.id))growthSpark(scene,x+w*.31,y+sh*.36);
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
function petLine(c:PageCanvas,a:Animal,i:number,choose?:()=>void,tail='',last=false,selected=false,details?:Choice):void {
    const h=animalSummaryHeight,w=animalCardWidth(c);
    const card=frame(c.body,'Animal'+i,0,c.slot(h,last?10:4),w,h,selected?'#E8E8C9':paper.card,'#C7AD7A');
    animalSummary(c,card,a,w,h/2);
    if(tail)setTextStyle(caption(card,'Tail',tail,w/2-35,details?h/2-69:0,58,18,11,green,true),'compact');
    if(choose)tap(card,choose);
    if(details)animalDetails(c,card,'ViewDetails',details,w,h/2);
}
const tagColors:Record<string,[string,string]>={普通:['#EEE6D8','#483D31'],少见:['#D9E9F3','#214A6B'],稀有:['#EEE0F3','#57346D']};
function traitChip(parent:Node,name:string,text:string,rarity:string,x:number,y:number,w:number,defect=false,compact=false):void {
    const [fill,color]=defect?['#F0E8D3','#4A412D']:(tagColors[rarity]||tagColors.普通);
    const chip=box(parent,name,x,y,w,compact?20:22,fill);
    const label=setTextStyle(caption(chip,'Caption',text,0,0,w-6,compact?18:20,12,color,true),defect?'defect':'tag');
    label.color=new Color().fromHEX(color);label.enableWrapText=false;
    label.fontSize=compact?11:12;label.lineHeight=compact?16:18;
}
function traitTags(parent:Node,tags:AnimalTag[],left:number,top:number,width:number,right=false,compact=false):void {
    const lines:{tag:AnimalTag;width:number}[][]=[[]];let used=0;
    for(const tag of tags){
        const size=Math.min(width,tag.label.length*(compact?11:12)+10);
        if(used&&used+4+size>width){lines.push([]);used=0;}
        lines[lines.length-1].push({tag,width:size});used+=size+(used?4:0);
    }
    lines.forEach((line,row)=>{
        const total=line.reduce((sum,t)=>sum+t.width,0)+Math.max(0,line.length-1)*4;
        let x=left+(right?width-total:0);
        line.forEach(({tag,width:w},i)=>{traitChip(parent,'Tag'+row+'_'+i,tag.label,tag.rarity,x+w/2,top-row*24,w,false,compact);x+=w+4;});
    });
}
function rosterLine(c:PageCanvas,a:Animal,i:number):void {
    const expanded=c.ui.expandedAnimal===a.id;
    const h=animalSummaryHeight+30+(expanded?132:0);
    c.visibleRow('Animal'+i,animalCardWidth(c),h,8,card=>drawRosterCard(c,card,a,expanded,h/2));
}
function drawRosterCard(c:PageCanvas,card:Node,a:Animal,expanded:boolean,top:number):void {
    const width=animalCardWidth(c),left=-width/2;
    frameContents(card,paper.card,'#C7AD7A');
    tap(card,()=>c.ui.toggleAnimal(a.id));
    animalSummary(c,card,a,width,top);
    animalDetails(c,card,'ViewDetails',{page:'pet',args:{id:a.id}},width,top);
    const rowWidth=width-20;
    rule(card,rowWidth,top-animalSummaryHeight);
    const toggle=box(card,'ExpandTraits',0,top-animalSummaryHeight-13,rowWidth,26);
    setTextStyle(caption(toggle,'Caption',expanded?'收起':'展开',-11,0,rowWidth-22,20,13,'#365848'),'expand');
    const arrow=box(toggle,'Chevron',rowWidth/2-8,0,12,12);
    const direction=expanded?-1:1;
    const strokeLength=Math.hypot(4,4);
    box(arrow,'LeftStroke',-2,0,strokeLength,1.8,'#365848').setRotationFromEuler(0,0,-45*direction);
    box(arrow,'RightStroke',2,0,strokeLength,1.8,'#365848').setRotationFromEuler(0,0,45*direction);
    if(!expanded)return;
    const columns=(a.traits||[]).slice(0,5),cw=rowWidth/5;
    columns.forEach((t,index)=>{
        const x=left+10+cw*(index+.5);
        setTextStyle(caption(card,'TraitType'+index,t.type,x,top-129,cw,22,14,ink,true),'body');
        setTextStyle(caption(card,'TraitGrade'+index,t.grade,x,top-151,cw,21,14,green,true),'grade');
    });
    traitTags(card,a.tags||[],left+10,top-179,rowWidth);
    if(a.defect)traitChip(card,'Defect',a.defect.label+' · '+a.defect.grade,'',left+81,top-226,142,true);
}
function book(c:PageCanvas,name:string,h:number):Node {
    const outer=frame(c.body,name,0,c.slot(h,10),c.inner,h,'#F0DEB4','#AB8C58',true);
    return box(outer,'Paper',0,0,c.inner-7,h-7,'#FCF0CE');
}
function rule(parent:Node,w:number,y:number):void {box(parent,'Rule',0,y,w,1,'#CDB78F');}
const openPet=(c:PageCanvas,p:Animal)=>()=>c.ui.choose({page:'pet',args:{id:p.id}});
function roomSwitch(c:PageCanvas,scene:Node):void {
    const h=c.width*9/16,w=63;
    (c.p.tabs||[]).forEach((choice,i)=>{
        const label=(choice.label||'').replace(/ ·.*$/,'');
        const node=press(scene,'RoomSwitch'+i,label,-c.width/2+12+w/2,h/2-19-i*34,w,
            ()=>{if(!choice.active)c.ui.choose({...choice,replace:true});},!!choice.active,false,29);
        if(choice.locked){
            node.getChildByName('Caption')!.setPosition(7,0);
            picture(node,'Lock','shop-modules/node-lock',-w/2+10,0,13,14);
        }
    });
    box(scene,'FloorEdge',0,-h/2+2,c.width,4,'#795632');
}
function inRoom(c:PageCanvas,m:RoomPage,rows:AnimalRow[]):void {
    const all=rows.filter(r=>r.animal).map(r=>r.animal!);
    const room=c.args.species||'rabbit',name=m.species!;
    const extras=rows.filter(r=>r.link&&!r.animal);
    // Older servers returned three unfiltered residents alongside a complete filtered roster.
    const scene=roomScene(c,c.p.art!,c.p.rows?all:m.residents||[],name,false,true);
    roomSwitch(c,scene);
    if(c.p.visual?.grownIds){
        const status=frame(scene,'TutorialMatured',c.width*.21,c.width*.21,109,26,paper.card,paper.brass,false);
        setTextWeight(caption(status,'Text','首对幼兔已成年',0,0,105,24,12,paper.green,true),true);
    }else feedingStation(c,scene,c.width*9/16,m.nutrition);
    c.startList();
    const count=m.count??all.length,matched=m.matchedCount??all.length;
    const countText=count===matched?count+'只':matched+'/'+count+'只',countW=Math.max(54,countText.length*8+12);
    const plaque=frame(scene,'RoomCount',c.width/2-countW/2-10,-c.width*9/32+16,countW,25,'#294C40','#BB965E',true);
    heading(plaque,'Caption',countText,0,0,countW-6,23,13,'#FFF0C4',true);
    guideNote(c);
    if(!c.p.guide)animalFilters(c,'品种','成长状态');
    c.startList();
    all.forEach((a,i)=>rosterLine(c,a,i));
    if(!all.length)note(c,c.p.empty||'当前筛选下没有动物。');
    c.startFooter();
    c.actions(extras.filter(r=>r.link?.page==='litter'||r.link?.page==='roomReceipt').map(r=>({...r.link!,label:r.title})));
}
function locked(c:PageCanvas,m:RoomPage):void {
    const scene=roomScene(c,c.p.art!,[],m.species!,false,true);
    roomSwitch(c,scene);
    c.startList();
    if(c.p.visual?.openingRoom){
        box(scene,'Unopened',0,0,c.width,c.width*9/16,'#433E3180');
        section(c,'兔房待开放','免费');
        guideNote(c);
        section(c,'开房可获得','原色幼兔 × 2');
        const pair=book(c,'OpeningPair',89);
        for(const [i,side] of ['母','公'].entries()){
            const x=c.inner*(i?.24:-.24);
            picture(pair,'Young'+i,'pets/domestic-coat01_'+(i?'male':'female'),x,9,65,60,'幼年');
            caption(pair,'Sex'+i,'原色兔 · '+side,x,-27,c.inner*.4,23,13,ink,true);
        }
        c.startFooter();
        buttons(c,c.p.actions||[]);
        return;
    }
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
    const breed=m.breed||'原色兔',youngArt=m.youngArt||'pets/domestic-coat01_female';
    caption(card,'Note',(m.signed?'今日已领取一对':'今日可领取一对')+breed+'幼体。',0,51,w,25,15,ink);
    ['male','female'].forEach((sex,i)=>{
        const x=(i-.5)*104;
        animalArt(card,{art:youngArt.replace(/_female$/,'_'+sex),stage:'幼年'},x,-8,79,80);
        heading(card,'Sex'+i,breed+' · '+(i?'母':'公'),x,-53,100,23,14,ink,true);
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
        rows.filter(r=>r.animal).forEach((r,i)=>petLine(c,r.animal!,i,openPet(c,r.animal!),'',false,false,r.link));
    } else note(c,'领养后入住兔房，自然成长约 '+(m.maturity??30)+' 分钟成年。');
    const room=c.p.actions?.find(a=>a.page==='rooms');
    c.startFooter();
    if(room)press(c.body,'RoomRoster',room.label||'',0,c.slot(48),c.inner,()=>c.ui.choose(room));
}
function detail(c:PageCanvas,m:RoomPage,rows:AnimalRow[]):void {
    const a=m.animal!,card=book(c,'AnimalFile',278),w=c.inner-24,left=-w/2;
    setTextStyle(caption(card,'BookName',m.species+'房 · 个体档案',-w/4,115,w/2,22,12,muted),'secondary');
    setTextStyle(caption(card,'Id','#'+a.number,w/4,115,w/2,22,14,green),'identifier');
    card.getChildByName('Id')!.getComponent(Label)!.horizontalAlign=2;
    rule(card,w,98);
    const identityW=Math.floor(w*.54),identityX=left+identityW/2;
    const portrait=box(card,'Illustration',identityX,22,identityW,132,'#EEE1BA');
    animalArt(portrait,a,0,-13,identityW-10,100);
    traitTags(portrait,a.tags||[],-identityW/2+4,53,identityW-8,true,true);
    const badgeLeft=-identityW/2+4;
    const picks:[string,string,string][]=[];
    if(a.guided)picks.push(['GuidePick','#DCE7BD','#395741']);
    if(a.selectedBreeding)picks.push(['GuaranteedPick','#D9E9F3','#214A6B']);
    if(a.retained)stockBadge(portrait,badgeLeft+18,picks.length?-34:-53);
    picks.forEach(([key,fill,color],index)=>{
        const badge=frame(portrait,key,badgeLeft+18+index*40,-53,36,18,fill,color,false);
        setTextWeight(caption(badge,'Caption','优选',0,0,34,16,10,color,true),true);
    });
    setTextStyle(heading(card,'Name',a.name,identityX,-65,identityW,28,21,green),'animalName');
    setTextStyle(caption(card,'Breed',a.breed+' · '+a.coat,identityX,-89,identityW,22,12,muted),'secondary');
    setTextStyle(caption(card,'Status',a.sex+' · '+a.stage+' · '+a.status,identityX,-111,identityW,25,12,muted),'secondary');
    box(card,'Divider',left+identityW+6,-16,1,209,'#D8C39B');
    const start=left+identityW+14,traitW=w/2-start;
    setTextStyle(heading(card,'TraitsTitle','个体特征',start+traitW/2,80,traitW,24,17,green),'section');
    setTextStyle(caption(card,'TypeHeader','属性',start+traitW*.30,55,traitW*.60,20,12,muted),'column');
    setTextStyle(caption(card,'GradeHeader','等级',start+traitW*.80,55,traitW*.40,20,12,muted,true),'column');
    (a.traits||m.traits||[]).slice(0,5).forEach((t,i)=>{
        const line=box(card,'Trait'+i,start+traitW/2,31-i*24,traitW,24);
        box(line,'Rule',0,-12,traitW,1,'#E2CCA4');
        setTextStyle(caption(line,'Type',t.type,-traitW*.20,0,traitW*.60,22,14,ink),'body');
        setTextStyle(caption(line,'Grade',t.grade,traitW*.30,0,traitW*.40,22,14,green,true),'grade');
    });
    setTextStyle(caption(card,'DefectTitle','缺陷',start+traitW/2,-92,traitW,18,11,muted),'compact');
    if(a.defect)traitChip(card,'Defect',a.defect.label+' · '+a.defect.grade,'',start+traitW/2,-113,traitW,true,true);
    c.startList();
    for(const row of rows){
        const {title,text:value}=row;
        if(!title||!value)continue;
        const labelW=90,h=Math.max(32,Math.ceil(value.length/Math.max(1,Math.floor((c.inner-labelW-18)/13)))*19+10);
        const line=frame(c.body,'DetailLine',0,c.slot(h,2),c.inner,h,'#F9EDCF','#D3BD92',false);
        setTextStyle(caption(line,'Key',title,(-c.inner+labelW)/2+8,0,labelW,24,13,muted),'field');
        const label=setTextStyle(caption(line,'Value',value,(labelW+2)/2,0,c.inner-labelW-18,h-4,13,ink),'value');
        if(title==='阶段'&&nextStage[a.stage]&&Number.isFinite(a.stageEndsAt))
            c.ui.bindStageCountdown(setTextStyle(label,'countdown'),a.stageEndsAt!,undefined,a.stage+' · 距'+nextStage[a.stage]+' ');
    }
    if(a.retained)note(c,a.stage==='已故'?'取消留种后可前往动物回收。':'种源不可出售，可在这里取消留种。');
    c.startFooter();
    const actions=c.p.actions||[];
    const retain=actions.find(choice=>choice.type==='care.retain');
    const review=actions.find(choice=>choice.page==='review');
    const breed=actions.find(choice=>choice.page==='breed');
    const market=actions.find(choice=>choice.page==='market');
    const core=[retain,review,breed,market];
    actions.filter(choice=>!core.includes(choice)).forEach((choice,i)=>{
        press(c.body,'ItemAction'+i,choice.label||'查看',0,c.slot(48,6),c.inner,()=>c.ui.choose(choice),false,!!choice.disabled);
    });
    const labels=[a.retained?'取消留种':'留种','特征复评','去繁育','去市场'],gap=6,wButton=(c.inner-gap)/2;
    for(let row=0;row<2;row++){
        const y=c.slot(48,6);
        for(let col=0;col<2;col++){
            const index=row*2+col,choice=core[index];
            press(c.body,'Action'+index,labels[index],(col?1:-1)*(wButton+gap)/2,y,wButton,
                ()=>{if(choice)c.ui.choose(choice);},index===0,!choice||!!choice.disabled);
        }
    }
}
function review(c:PageCanvas,m:RoomPage,rows:AnimalRow[]):void {
    const a=m.animal!,card=book(c,'ReviewAnimal',93);
    animalArt(card,a,-c.inner/2+46,0,65,70);
    setTextStyle(heading(card,'Name',a.name,35,17,c.inner-110,28,21,green),'animalName');
    setTextStyle(caption(card,'Identity',a.breed+' · '+a.sex+' · '+a.stage,35,-10,c.inner-110,24,12,muted),'secondary');
    section(c,'当前特征标签',(a.tags?.length||0)+' 条');
    c.startList();
    (a.tags||[]).forEach((tag,i)=>{
        const line=frame(c.body,'ReviewTag'+i,0,c.slot(47,5),c.inner,47,paper.card,paper.brass,false);
        setTextStyle(caption(line,'Type',tag.type,-c.inner/2+31,0,48,23,13,muted),'field');
        const chipLeft=-c.inner/2+62;
        const chipWidth=Math.min(c.inner-124,Math.max(48,tag.label.length*12+10));
        traitChip(line,'Tag',tag.label,tag.rarity,chipLeft+chipWidth/2,0,chipWidth);
        setTextStyle(caption(line,'Rarity',tag.rarity,c.inner/2-32,0,47,23,12,muted,true),'secondary');
    });
    rows.forEach((row,i)=>c.row(row,i));
    note(c,'剩余 '+(3-(m.reviews||0))+' 次 · 持有 '+(m.inventory||0)+' 张');
    c.startFooter();
    const actions=c.p.actions||[];
    if(actions[0])c.actions([actions[0]],1);
    const secondary=actions.slice(1),buttonW=(c.inner-6)/2,y=secondary.length?c.slot(48,8):0;
    secondary.forEach((action,i)=>press(c.body,'Action'+(i+1),action.label||'查看',
        (i?1:-1)*(buttonW+6)/2,y,buttonW,()=>c.ui.choose(action),false,!!action.disabled,48));
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
function pairingScene(c:PageCanvas,parents:(Animal|null)[]):void {
    c.slot(-(c.width-c.inner)/2,0);
    const h=c.width*9/16;
    const scene=box(c.body,'ParentPair',0,c.slot(h,10),c.width,h);
    picture(scene,'Room','rooms/breeding-room',0,0,c.width,h);
    if(c.p.tabs?.length)roomSwitch(c,scene);
    ['选择母本','选择父本'].forEach((label,i)=>{
        const x=c.width*(i ? .73 : .27)-c.width/2,animal=parents[i],size=c.width*.23;
        const holder=box(scene,'Slot'+i,x,h*(.5-.745),size,size);
        if(animal)floorArt(holder,animal,size,0);
        const plate=frame(scene,'NamePlate'+i,x,h*(.5-.91),c.width*.38,25,'#F8E9C9','#AB8654',true);
        heading(plate,'Name'+i,animal?animal.breed+'·'+animal.name:label,0,0,c.width*.38-8,22,13,ink,true);
    });
}
function pairing(c:PageCanvas,m:RoomPage,rows:AnimalRow[]):void {
    const hasConfirm=m.kind==='pairConfirm',parents=m.parents!;
    pairingScene(c,parents);
    if(hasConfirm) {
        section(c,'核对亲本','五项评分与缺陷等级');
        c.startList();
        if(m.parentTraits?.length)compareParents(c,m.parentTraits);
        rows.forEach((r,i)=>c.row(r,i));
        c.startFooter();
        const actions=c.p.actions||[],start=actions.find(a=>a.type==='care.breed');
        const toggle=actions.find(a=>a.type==='care.toggle');
        const tools=actions.find(a=>a.page==='breedItems');
        const y=c.slot(48,6),w=toggle?(c.inner-6)*.55:c.inner;
        if(tools)press(c.body,'AddItems',tools.label!,(w-c.inner)/2,y,w,()=>c.ui.choose(tools));
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
    guideNote(c);
    c.startList();
    animalFilters({...c,p:{...c.p,filters:c.p.filters?.slice(1)}},'品种','成长状态');
    const candidates=m.candidates!;
    candidates.forEach((p,i)=>{
        const key=p.sex==='母'?'mother':'father',active=parents.some(v=>v?.id===p.id);
        petLine(c,p,i,()=>{
            const args={...c.args,picking:true,[key]:active?null:p.id};
            c.ui.choose({page:'breed',args,replace:true});
        },active?'已选':'选择',i===candidates.length-1,active,{page:'pet',args:{id:p.id}});
    });
    if(!candidates.length)note(c,'当前筛选下没有可配对的亲本。');
    c.startFooter();
    const dock=frame(c.body,'PairDock',0,c.slot(76,8),c.inner,76,'#F7E7C5','#AA9169');
    caption(dock,'Rule',m.species+'一生仅能繁育一窝，预计 '+(m.waitText||m.wait+' 分钟')+'后出生。',0,24,c.inner-20,20,13,muted);
    press(dock,'Review','核对亲本',0,-11,c.inner-20,()=>{if(m.confirm)c.ui.choose(m.confirm);},true,!m.confirm);
    if(!c.p.guide?.next)c.actions((c.p.actions||[]).filter(a=>a.page==='litter'));
}
function breeding(c:PageCanvas,m:RoomPage):void {
    const scene=roomScene(c,c.p.art!,m.parents!.filter((a):a is Animal=>!!a),m.species!,false,true);
    roomSwitch(c,scene);
    c.startList();
    section(c,'这窝正在培育','繁育台已占用');
    const card=book(c,'Job',110),w=c.inner-29;
    caption(card,'When','预计出生',0,31,w,22,14,muted);
    const remaining=heading(card,'Remaining','',0,2,w,34,21,green);
    c.ui.bindCountdown(remaining,m.endsAt!,s=>Math.floor(s/60)+' 分 '+String(s%60).padStart(2,'0')+' 秒');
    caption(card,'Parents',m.parents!.filter(a=>a).map(a=>a!.breed+'·'+a!.name).join(' × '),0,-32,w,24,13,muted);
    guideNote(c);
    c.startFooter();
    buttons(c,c.p.actions||[]);
}

export function drawBreedingBonus(parent:Node,preview:MutationPreview|undefined,enabled:boolean,
                                 pending:boolean,setEnabled:(value:boolean)=>void,close:()=>void):void {
    const bounds=parent.getComponent(UITransform)!;
    const overlay=box(parent,'BonusDialog',0,0,bounds.width,bounds.height,'#1A2B23A4');
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
    const hint=fields.length?'上浮以幼崽继承的亲本等级为起点。选育单锁定的属性按道具效果结算。':'当前经营服务未提供逐项概率。';
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
    section(c,'这一窝');
    guideNote(c);
    if(c.p.subtitle)note(c,c.p.subtitle);
    c.startList();
    members.forEach((r,i)=>{
        if(r.animal)petLine(c,r.animal,i,r.link?()=>c.ui.choose(r.link!):undefined,'',i===members.length-1,false,r.link);
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
            petLine(c,r.animal!,i,id?()=>c.ui.toggle(id):undefined,id?(selected?'✓ 留种':'留种'):'已留种',i===animals.length-1,selected,r.link);
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
        case 'review':review(c,m,rows);return true;
        case 'checkin':checkIn(c,m,rows);return true;
        case 'pair':case 'pairConfirm':pairing(c,m,rows);return true;
        case 'breeding':breeding(c,m);return true;
        case 'litter':litter(c,m,rows);return true;
        default:return false;
    }
}
