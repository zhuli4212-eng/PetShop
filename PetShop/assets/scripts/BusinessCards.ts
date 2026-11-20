import { setTextWeight } from './ShopTypography';
import { Label, Node, Sprite } from 'cc';
import type { Choice, LedgerRow } from './ShopConnection';
import { box, caption, frame, heading, picture, press, tap, type PageCanvas } from './LedgerCanvas';

export const ink='#493B28', green='#36533C', brown='#705B3D', edge='#C6A571', cream='#FFF1D2';
export function text(parent:Node,name:string,copy:string,x:number,y:number,w:number,h:number,size=14,color=ink,align:'left'|'right'|'center'='left',bold=false):Label {
    const label=caption(parent,name,copy,x,y,w,h,size,color,align==='center');
    if(align==='right')label.horizontalAlign=Label.HorizontalAlign.RIGHT;
    setTextWeight(label,bold);
    label.lineHeight=Math.round(size*1.35);
    return label;
}
export function blocks(copy:string,w:number,size=14):number {
    const chars=Math.max(1,Math.floor(w/size));
    return copy.split('\n').reduce((total,line)=>total+Math.max(1,Math.ceil(Array.from(line).reduce((a,c)=>a+(c.charCodeAt(0)<128?.58:1),0)/chars)),0);
}
export function card(c:PageCanvas,name:string,h:number,fill=cream,gap=10):Node {
    return frame(c.body,name,0,c.slot(h,gap),c.inner,h,fill,edge,true);
}
export function section(c:PageCanvas,title:string,detail=''):Label|undefined {
    const y=c.slot(25,7),right=detail?Math.min(c.inner*.54,detail.length*13+10):0;
    heading(c.body,'Section',title,-right/2,y,c.inner-right,25,17,green);
    if(detail)return text(c.body,'SectionDetail',detail,(c.inner-right)/2,y,right,25,12,brown,'right');
}
export function note(c:PageCanvas,copy:string,warning=false):void {
    if(!copy)return;
    const h=blocks(copy,c.inner-20,13)*18+14;
    const n=box(c.body,'Notice',0,c.slot(h,9),c.inner,h,warning?'#F5DDAD':'#ECE0C2');
    box(n,'Rule',-c.inner/2+1.5,0,3,h,warning?'#A87739':'#AC8B55');
    text(n,'Copy',copy,1,0,c.inner-18,h-5,13,brown);
}
export function buttons(c:PageCanvas,options:Choice[],primary=0,firstIndex=0):void {
    if(!options.length)return;
    const gap=7,w=(c.inner-(options.length-1)*gap)/options.length,y=c.slot(48,9);
    options.forEach((a,i)=>press(c.body,'Action'+(firstIndex+i),a.label||'查看',-c.inner/2+w/2+(w+gap)*i,y,w,()=>c.ui.choose(a),
        i===primary,!!a.disabled||!!(a.useSelection&&!a.allowEmptySelection&&!c.ui.selected.size),48));
}
export function dock(c:PageCanvas,options:Choice[],primary=0,columns=2):void {
    if(!options.length)return;
    c.startFooter();
    for(let i=0;i<options.length;i+=columns)buttons(c,options.slice(i,i+columns),primary-i,i);
}
export function thumbTabs(c:PageCanvas,items:Choice[]):void {
    if(!items.length)return;
    const w=(c.inner-(items.length-1)*6)/items.length,y=c.slot(48,10);
    const icon:Record<string,string>={rabbit:'angora-coat01_female',cat:'british-coat01_female',dog:'shiba-coat01_male'};
    items.forEach((a,i)=>{
        const n=frame(c.body,'Tab'+i,-c.inner/2+w/2+i*(w+6),y,w,48,a.active?'#395E4C':'#EFD7A5',a.active?'#335644':'#A08351',true);
        const id=icon[a.args?.species];if(id)picture(n,'Species','pets/'+id,-19,0,32,32);
        text(n,'Caption',a.label||'',id?18:0,0,id?w-38:w,44,15,a.active?'#FFF1C5':ink,'center',true);
        if(!a.disabled)tap(n,()=>c.ui.choose({...a,replace:true}));
    });
}
const ratios:Record<string,number>={orders:512/220,lab:512/288,market:512/288,stage:384/256};
export function banner(c:PageCanvas,art:string,title:string,variant:'normal'|'research'|'services'|'stage'|'rank'='normal',animal?:string,animalStage?:string):Node {
    const full=variant==='normal'||variant==='research'||variant==='services',w=full?c.width:c.inner;
    const h=w/(ratios[art]||1);
    const n=box(c.body,'Artwork',0,c.slot(h+3,10),w,h+3,'#856235');
    const scene=box(n,'Scene',0,1.5,w,h);
    picture(scene,'Picture','shop-modules/'+art,0,0,w,h);
    if(animal) {
        const deck=-h*.255;
        picture(scene,'Contestant',animal,0,deck+h*.22,h*.68,h*.54,animalStage);
    }
    if(title&&variant==='rank'){
        const stripe=box(scene,'CaptionStrip',0,-h/2+19,w,38,'#294F41');
        heading(stripe,'Title',title,0,0,w-18,32,17,'#FFF0CE');
    }else if(title){
        const pw=title.length*16+18;
        const sign=frame(scene,'Sign',-w/2+12+pw/2,-h/2+22,pw,27,'#28483D','#CBA771');
        heading(sign,'Caption',title,0,0,pw-4,25,15,'#FFE8AE',true);
    }
    return scene;
}
export function info(c:PageCanvas,r:LedgerRow,i:number,mutedArt=false):void {
    const hasPic=!!r.art,pad=10,left=hasPic?62:pad,right=r.link||r.action?23:pad;
    const avail=c.inner-left-right,h=Math.max(hasPic?64:48,blocks(r.title,avail,15)*20+(r.text?blocks(r.text,avail,13)*18+4:0)+18);
    const n=card(c,'Row'+i,h),x=-c.inner/2+left+avail/2;
    if(hasPic){
        const icon=picture(n,'Icon',r.art!,-c.inner/2+31,0,46,46,r.stage);
        if(mutedArt)icon.getComponent(Sprite)!.grayscale=true;
    }
    const th=blocks(r.title,avail,15)*20;
    text(n,'Title',r.title,x,r.text?h/2-9-th/2:0,avail,th,15,ink,'left',true);
    if(r.text){const dh=h-th-15;text(n,'Detail',r.text,x,h/2-9-th-dh/2,avail,dh,13,brown);}
    if(r.link||r.action){text(n,'Arrow','›',c.inner/2-11,0,14,40,20,green,'center');tap(n,()=>c.ui.choose((r.link||r.action)!));}
}
