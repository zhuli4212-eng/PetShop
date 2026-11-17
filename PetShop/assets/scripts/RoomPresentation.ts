import { Node } from 'cc';
import type { Choice, LedgerRow } from './ShopConnection';
import { animalFilters, box, caption, frame, heading, picture, press, tap, type PageCanvas } from './LedgerCanvas';
import { RoomAnimalWalk } from './RoomAnimalWalk';

interface Animal {
    id:string; number:string; name:string; breed:string; coat:string; sex:string; stage:string; status:string; art:string;
    retained?:boolean;
}
interface RoomPage {
    kind:string; species?:string; count?:number; matchedCount?:number; residents?:Animal[]; wait?:number; remaining?:number;
    maturity?:number; estimate?:string; youngArt?:string; price?:number; breed?:string; coins?:number; signed?:boolean; date?:string;
    parents?:(Animal|null)[]; candidates?:Animal[]; confirm?:Choice; animal?:Animal; bornAt?:number; endsAt?:number;
    traits?:{type:string;label:string;rarity:string;grade:string}[];
}
type AnimalRow=LedgerRow & {animal?:Animal};
const ink='#493A27', green='#29483E', muted='#725C42';
function animalArt(parent:Node,a:Pick<Animal,'art'|'stage'>,x:number,y:number,w:number,h:number):Node {
    return picture(parent,'Portrait',a.art,x,y,w,h,a.stage);
}
function floorArt(parent:Node,a:Animal,size:number,feet:number):Node {
    // All live canvases are 96×96; the resting canvases are 96×64.
    const centerToFeet=a.stage==='已故'?(58-32)/96:(90-48)/96;
    return animalArt(parent,a,0,feet+size*centerToFeet,size,size);
}
function stockBadge(parent:Node,x:number,y:number):void {
    const badge=frame(parent,'StockBadge',x,y,36,20,'#DCE6C7','#95A77E',false);
    caption(badge,'Caption','种源',0,0,34,18,11,'#36573D',true).isBold=true;
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
function roomScene(c:PageCanvas,path:string,animals:Animal[],name:string,plaque:boolean,edgeTop=false):void {
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
    const visible=animals.slice(0,inRoster?10:3);
    const spots=inRoster ? c.ui.roomFloor!.positions(visible.map(a=>a.id),c.width,h) : [];
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
        tap(resident,()=>c.ui.choose({page:'pet',args:{id:a.id}}));
    });
}
function petLine(c:PageCanvas,a:Animal,i:number,choose:(()=>void)|undefined,tail='›',last=false,selected=false):void {
    const h=76;
    const card=frame(c.body,'Animal'+i,0,c.slot(h,last?10:0),c.inner,h,selected?'#E8E8C9':'#FBEFCF','#C7AD7A');
    const left=-c.inner/2,picWidth=52;
    const thumb=box(card,'Thumb',left+10+picWidth/2,0,picWidth,50,'#ECDEB8');
    box(thumb,'Ledge',0,-24,picWidth,2,'#D1B783');
    animalArt(thumb,a,0,0,picWidth,50);
    const textLeft=left+picWidth+19,bodyW=c.inner-picWidth-72;
    const tx=textLeft+bodyW/2;
    const nameWidth=Math.min(bodyW-55-(a.retained?41:0),Math.max(34,a.name.length*17));
    heading(card,'Name',a.name,textLeft+nameWidth/2,22,nameWidth,23,16,ink);
    if(a.retained)stockBadge(card,textLeft+nameWidth+22,22);
    caption(card,'Number','#'+a.number,textLeft+nameWidth+30+(a.retained?41:0),21,54,16,10,'#856E4D');
    caption(card,'Identity',a.breed+' · '+a.coat,tx,0,bodyW,19,12,muted);
    caption(card,'Stage',a.sex+' · '+a.stage+' · '+a.status,tx,-19,bodyW,19,12,muted);
    caption(card,'Tail',tail,c.inner/2-22,0,39,h-4,13,'#47604A',true).isBold=true;
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
    roomScene(c,c.p.art!,c.p.rows?all:m.residents||[],name,true);
    c.startList();
    const count=m.count??all.length,matched=m.matchedCount??all.length;
    const countText=count===matched?count+' 只登记':'符合 '+matched+' / 共 '+count+' 只';
    section(c,name+'房名册',countText);
    const status=c.p.filters?.[0]?.find(option=>option.active)?.args?.filter||c.args.filter||'全部';
    buttons(c,[{...breed,label:'进繁育台'},{page:'sale',args:{channel:'market',species:room,filter:status},label:'挑选出售'}]);
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
    heading(card,'TraitsTitle','个体标签',start+traitW/2,60,traitW,22,15,green);
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
    if(a.retained)note(c,a.stage==='已故'?'取消留种后可送往研究所回收。':'种源不可出售，可在这里取消留种。');
    c.startFooter();
    c.actions(c.p.actions||[]);
}
function pairing(c:PageCanvas,m:RoomPage,rows:AnimalRow[]):void {
    const hasConfirm=m.kind==='pairConfirm',card=book(c,'ParentPair',112),parents=m.parents!;
    const x=c.inner*.26;
    ['母','公'].forEach((sex,i)=>{
        const px=i?x:-x,animal=parents[i];
        const holder=frame(card,'Slot'+i,px,11,62,58,animal?'#ECDEB8':'#FCF0CE','#C5AA7E');
        if(animal)animalArt(holder,animal,0,0,58,54);
        else caption(holder,'Sex',i?'♂':'♀',0,0,55,51,24,'#AC9470',true);
        heading(card,'Name'+i,animal?animal.name:'选择'+sex+m.species,px,-33,c.inner*.42,22,14,ink,true);
    });
    caption(card,'Cross','×',0,0,34,46,24,'#987951',true);
    c.startList();
    if(hasConfirm) {
        section(c,'核对亲本','六维标签');
        c.startList();
        rows.forEach((r,i)=>c.row(r,i));
        c.startFooter();
        const actions=c.p.actions||[],guideChoices=actions.filter(a=>a.page==='breed'&&a.args?.guide!==undefined);
        if(guideChoices.length){
            const selected=guideChoices.find(a=>a.args?.guide===c.args.guide);
            let anchor:Node;
            anchor=press(c.body,'ChooseGuide',selected?.label||'选择想培养的特征 ▾',0,c.slot(48,6),c.inner,
                ()=>c.ui.openFilter([{anchor,options:guideChoices}],0));
        }
        c.actions(actions.filter(a=>!guideChoices.includes(a)));return;
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
    const dock=frame(c.body,'PairDock',0,c.slot(89,10),c.inner,89,'#F7E7C5','#AA9169');
    caption(dock,'Rule',m.species+'一生仅能繁育一窝，预计 '+m.wait+' 分钟后出生。',0,26,c.inner-20,22,13,muted);
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
function litter(c:PageCanvas,m:RoomPage,rows:AnimalRow[]):void {
    const pets=rows.filter(r=>r.animal).map(r=>r.animal!);
    roomScene(c,c.p.art!,pets,m.species!,true,true);
    c.startList();
    section(c,'这一窝',m.count+' 只出生');
    if(c.p.subtitle)note(c,c.p.subtitle);
    c.startList();
    pets.forEach((p,i)=>petLine(c,p,i,openPet(c,p),'›',i===pets.length-1));
    rows.filter(r=>!r.animal).forEach((r,i)=>c.row(r,i));
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
