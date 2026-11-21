import { setTextStyle, setTextWeight } from './ShopTypography';
import { BlockInputEvents, Color, Mask, Node, ScrollView, Sprite, UITransform, Vec2 } from 'cc';
import type { Args, Choice, GuideCue, LedgerPage, LedgerRow } from './ShopConnection';
import { animalCardWidth, animalDetails, animalSummary, animalSummaryHeight, box, caption, flatSpriteFrame, frame, heading, lines, paper, paperGrain, picture, press, solidDisc, solidRect, tap, type LedgerUI, type PageCanvas } from './LedgerCanvas';
import { drawRoom } from './RoomPresentation';
import { drawBusiness, nutritionStore } from './BusinessPresentation';
import { guideDialog, guideEntrance, guideNote, guideTarget, revealGuideTarget, showGuideSpotlight } from './TutorialPresentation';

export { box, caption, picture } from './LedgerCanvas';
export const ledgerModal = (key: string): boolean =>
    ['saleQuote','research','researchNode','researchTable','recycle','roomNutrition','nutritionDetail','nutritionShop','checkinReceipt','openingGuide','openingLitterQuote','audioSettings','seedReservation','breedingCourses','breedItems'].includes(key);

function drawHeader(parent: Node, width: number, height: number, title: string, coins: number, back: () => void, modal: boolean, toTasks=false, fixed=false): void {
    const h = modal ? 54 : 64;
    const n = box(parent,'Header',0,(height-h)/2,width,h,modal ? '#34594C' : paper.green);
    if (!modal) {
        solidRect(n,-width/2,h/2-2,width,2,'#6F8E6C');
        solidRect(n,-width/2,-h/2+3,width,2,'#88A075');
    }
    solidRect(n,-width/2,-h/2,width,modal ? 2 : 3,'#6D4C32');
    if (modal) {
        const inset = 14;
        setTextStyle(heading(n,'Title',title,fixed?0:-width/2+inset+(width-90)/2,1,fixed?width-30:width-90,h-8,20,paper.cream),'contentTitle').color=new Color().fromHEX('#FFE3A1');
        if(fixed)return;
        const close=frame(n,'Back',width/2-34,1,48,36,'#365F4A','#8BA27A',false);
        setTextWeight(caption(close,'Caption','关闭',0,0,46,34,14,paper.cream,true),true);
        const hit=box(close,'Touch',0,0,50,48);tap(hit,back);
    } else {
        const backNode=box(n,'Back',-width/2+35,3,60,48);
        for (let i=0;i<5;i++) {
            solidRect(backNode,-20+i*1.4,-1+i*1.4,3,2.5,'#FFF0BD');
            solidRect(backNode,-20+i*1.4,-1-i*1.4,3,2.5,'#FFF0BD');
        }
        setTextWeight(caption(backNode,'Caption',toTasks?'回任务':'返回',toTasks?9:5,0,toTasks?43:34,40,toTasks?13:14,'#FFF0BD',true),true);
        tap(backNode,back);
        const balanceWidth=Math.max(66,String(coins).length*9+47);
        const wallet=frame(n,'Wallet',width/2-10-balanceWidth/2,3,balanceWidth,27,'#193D34','#75916A',false);
        setTextWeight(caption(wallet,'Value','金币 '+coins,0,0,balanceWidth-6,25,14,'#FFE4A4',true),true);
        setTextStyle(heading(n,'Title',title,0,3,Math.max(92,width-2*(balanceWidth+13)),50,22,paper.cream,true),'pageTitle');
    }
}

function canvas(content: Node, width: number, key: string, args: Args, p: LedgerPage, ui: LedgerUI, modal: boolean) {
    const pad=width<=350?9:12;
    const inner=width-2*pad;
    const gap=width<=350?8:10;
    // These pages open with an edge-to-edge illustration immediately below the header.
    const startsWithScene=['orders','market','recycle','research','lab','credits','orderDesk'].includes(key)
        || (key==='sale' && ['order','market','recycle'].includes(args.channel))
        || (key==='shelf' && p.art==='shop-modules/lab');
    let cursor=startsWithScene&&!modal?0:pad;
    const slot=(h:number,after=gap)=>{const y=-cursor-h/2;cursor+=h+after;return y;};
    const boundaries:{height:number;count:number}[]=[];
    const visibleRows:{node:Node;height:number;draw:(node:Node)=>void;mounted:boolean}[]=[];
    let footer:{height:number;count:number}|undefined;
    function startList():void {
        if(content.children.length)boundaries.push({height:cursor,count:content.children.length});
    }
    function startFooter():void {footer={height:cursor,count:content.children.length};}
    function visibleRow(name:string,w:number,h:number,after:number,draw:(node:Node)=>void):void {
        const node=box(content,name,0,slot(h,after),w,h);
        // The guide resolves live node targets before it scrolls them into view.
        if(p.guide)draw(node);
        else visibleRows.push({node,height:h,draw,mounted:false});
    }
    const choice=(a:Choice)=>ui.choose(a);
    function strip(items:Choice[],name:string):void {
        if (!items.length)return;
        const spacing=7, w=(inner-(items.length-1)*spacing)/items.length, y=slot(48);
        items.forEach((a,i)=>press(content,name+i,a.label||'',-inner/2+w/2+i*(w+spacing),y,w,()=>choice({...a,replace:true}),!!a.active,!!a.disabled));
    }
    function selection():void {
        const ids=(p.rows||[]).filter(r=>r.select).map(r=>r.select!);
        if(!ids.length||p.visual?.singleSelect)return;
        const y=slot(48), all=ids.every(id=>ui.selected.has(id));
        setTextWeight(caption(content,'SelectionCount',(p.selectionLabel||'已选')+' '+ui.selected.size+' 只',-54,y,inner-108,42,14,paper.green),true);
        press(content,'SelectAll',all?'清空选择':'全选本页',inner/2-50,y,100,
            ()=>choice({type:'ui.selectAll',args:{ids,clear:all}}));
    }
    function action(a:Choice,i:number):void {
        const disabled=!!a.disabled || !!(a.useSelection&&!a.allowEmptySelection&&!ui.selected.size);
        press(content,'Action'+i,a.label||'查看',0,slot(48),inner,()=>choice(a),i===0,disabled);
    }
    function actions(items:Choice[],columns=2):void {
        for(let first=0;first<items.length;first+=columns){
            const group=items.slice(first,first+columns),spacing=6,w=(inner-spacing*(group.length-1))/group.length;
            const y=slot(48,6);
            group.forEach((a,j)=>press(content,'Action'+(first+j),a.label||'查看',-inner/2+w/2+j*(w+spacing),y,w,
                ()=>choice(a),first+j===0,!!a.disabled||!!(a.useSelection&&!a.allowEmptySelection&&!ui.selected.size)));
        }
    }
    function row(r:LedgerRow,i:number):void {
        const selected=!!r.select&&ui.selected.has(r.select);
        if(r.animal){
            const enroll=r.link?.page==='show.review';
            const w=animalCardWidth(ctx),h=animalSummaryHeight+(enroll?18:0),top=h/2;
            const card=frame(content,'Row'+i,0,slot(h,6),w,h,selected?'#E0E8CE':paper.card,selected?'#75916A':paper.brass,false);
            animalSummary(ctx,card,r.animal,w,top,r.select?22:0);
            if(r.select){
                const cb=frame(card,'Check',-w/2+15,top-34,17,17,selected?paper.primary:'#FFFAE7',selected?'#254536':'#9F927C',false);
                if(selected)caption(cb,'Mark','✓',0,0,15,16,12,'#FFF6D8',true);
                tap(card,()=>ui.toggle(r.select!));
            }else if(r.link)tap(card,()=>choice(r.link!));
            const details=r.select||enroll?{page:'pet',args:{id:r.animal.id}}:r.link;
            if(details)animalDetails(ctx,card,'Details',details,w,top);
            if(enroll){
                const target=box(card,'Registration',w/2-35,top-69,54,22);
                setTextStyle(caption(target,'Caption','报名',0,0,54,20,12,paper.green,true),'smallAction');
                tap(target,()=>choice(r.link!));
                caption(card,'Fee',r.text||'',30,top-86,w-78,18,11,paper.muted);
            }
            return;
        }
        const hasLink=!!(r.action||r.link);
        const left=-inner/2+10;
        const icon=r.art?49:0, check=r.select?26:0, side=r.select&&r.link?64:hasLink?20:0;
        const available=inner-20-icon-check-side;
        const th=Math.max(21,lines(r.title,available,15)*22);
        const dh=r.text?lines(r.text,available,13)*19:0;
        const h=Math.max(52,th+dh+18);
        const card=frame(content,'Row'+i,0,slot(h,7),inner,h,selected?'#E0E8CE':paper.card,selected?'#75916A':paper.brass,false);
        if(r.select){
            const cb=frame(card,'Check',left+9,0,16,16,selected?paper.primary:'#FFFAE7',selected?'#254536':'#9F927C',false);
            if(selected)caption(cb,'Mark','✓',0,0,15,16,12,'#FFF6D8',true);
        }
        if(r.art)picture(card,'Icon',r.art,left+check+20,0,41,h-10,r.stage);
        const x=left+check+icon+available/2;
        setTextWeight(caption(card,'Title',r.title,x,dh?h/2-8-th/2:0,available,th,15,paper.ink),true);
        if(r.text)caption(card,'Detail',r.text,x,h/2-8-th-dh/2,available,dh,13,paper.muted);
        if(r.select) {
            tap(card,()=>ui.toggle(r.select!));
            if(r.link)press(card,'Details','详情',inner/2-36,0,58,()=>choice(r.link!));
        } else if(hasLink) {
            tap(card,()=>choice((r.link||r.action)!));
            caption(card,'Arrow','›',inner/2-15,0,18,h-8,20,paper.muted,true);
        }
    }
    function empty():void {
        if(!p.empty)return;
        const h=Math.max(52,lines(p.empty,inner-24,15)*22+18);
        caption(content,'Empty',p.empty,0,slot(h),inner-24,h,15,paper.muted,true);
    }
    const ctx:PageCanvas={key,args,p,body:content,width,inner,ui,modal,slot,visibleRow,startList,startFooter,strip,row,action,actions,selection,empty};
    return {ctx,boundaries,visibleRows,get footer(){return footer;},extent:()=>cursor+pad};
}

function account(ctx: PageCanvas): boolean {
    const {key,p,body,width,inner,slot,ui}=ctx;
    if(key==='audioSettings'){
        ctx.actions(p.actions||[],1);
        return true;
    }
    if(key==='login') {
        if(p.art){
            slot(-(width-inner)/2,0);
            const bannerHeight=width*9/16;
            const scene=box(body,'AccountScene',0,slot(bannerHeight,10),width,bannerHeight,paper.page);
            const mask=scene.addComponent(Mask);
            mask.type=Mask.Type.SPRITE_STENCIL;
            mask.spriteFrame=flatSpriteFrame();
            picture(scene,'Shopfront',p.art,0,width/12,width,width*1.5);
        }
        heading(body,'AccountHeading','小店账号',0,slot(26,6),inner,26,18,paper.ink);
        ctx.startList();
        const rows=p.rows||[], id=rows.find(r=>r.title==='店主编号'), assets=rows.find(r=>r.title==='店铺资产');
        const card=frame(body,'LocalShop',0,slot(112),inner,112,paper.card);
        setTextWeight(caption(card,'Title',p.subtitle||'本机经营档',0,34,inner-22,25,15,paper.ink),true);
        caption(card,'Balance',assets?.text||'',0,7,inner-22,25,14,paper.ink);
        caption(card,'Identity','店主编号 '+(id?.text||''),0,-26,inner-22,40,12,paper.muted);
        ctx.row({title:'声音设置',text:'背景音乐与游戏音效',link:{page:'audioSettings'}},-2);
        rows.filter(r=>r!==id&&r!==assets).forEach(ctx.row);
        ctx.startFooter();ctx.actions(p.actions||[]);
        return true;
    }
    if(key==='payment') {
        heading(body,'Title','模拟支付',0,slot(26,6),inner,26,19,paper.ink);
        const note=box(body,'Notice',0,slot(46),inner,46,'#E9DAB9');
        caption(note,'Text',p.subtitle||'',0,0,inner-18,40,14,paper.muted);
        ctx.startList();(p.rows||[]).forEach(ctx.row);ctx.startFooter();ctx.actions(p.actions||[]);return true;
    }
    return false;
}

function taskList(c:PageCanvas):boolean {
    if(c.key!=='tasks'||!Array.isArray(c.p.visual?.rewards))return false;
    const w=c.inner;
    heading(c.body,'TaskProgress',c.p.subtitle||'',0,c.slot(25,5),w,25,16,paper.green);
    guideNote(c);
    c.startList();
    (c.p.rows||[]).forEach((row,i)=>{
        const textW=w-113, linesH=Math.max(20,lines(row.text||'',textW,13)*18),h=linesH+38;
        const card=frame(c.body,'TaskRow'+i,0,c.slot(h,6),w,h,row.done?'#E0E8CE':paper.card,row.done?'#75916A':paper.brass,false);
        heading(card,'Title',row.title,-44,h/2-17,textW,23,15,paper.ink);
        caption(card,'Detail',row.text||'',-44,h/2-30-linesH/2,textW,linesH,13,paper.muted);
        setTextWeight(caption(card,'State',row.done?'已完成':'待完成',w/2-56,0,64,25,13,row.done?paper.green:paper.muted,true),!!row.done);
        caption(card,'Arrow','›',w/2-13,0,16,27,19,paper.green,true);
        if(row.link)tap(card,()=>c.ui.choose(row.link!));
    });
    c.startFooter();
    const items=c.p.visual.rewards as {name:string;quantity:number;art?:string}[];
    const rewards=frame(c.body,'TaskRewards',0,c.slot(57,6),w,57,paper.card,paper.brass,false);
    const width=w/items.length;
    items.forEach((item,i)=>{
        const left=-w/2+i*width, x=left+23;
        if(item.art)picture(rewards,'RewardArt'+i,item.art,x,0,27,35);
        else {
            const coin=box(rewards,'RewardCoin',x,0,23,23);
            solidRect(coin,-12,-8,24,16,'#865528');solidRect(coin,-8,-12,16,24,'#865528');
            solidRect(coin,-10,-7,20,14,'#D5A447');solidRect(coin,-7,-10,14,20,'#D5A447');
            setTextWeight(caption(coin,'Glyph','金',0,0,19,18,12,'#57351C',true),true);
        }
        const contentW=width-49;
        caption(rewards,'RewardName'+i,item.name,left+43+contentW/2,10,contentW,21,12,paper.ink);
        setTextWeight(caption(rewards,'RewardCount'+i,'× '+item.quantity,left+43+contentW/2,-11,contentW,19,14,paper.green),true);
    });
    const claim=c.p.actions?.[0];
    if(claim)press(c.body,'ClaimTasks',claim.label||'领取',0,c.slot(48,2),w,()=>c.ui.choose(claim),true,!!claim.disabled);
    return true;
}

interface NutritionRow extends LedgerRow {
    visual: { rate:number; stock?:number; selected:boolean; pick:Choice; detail:Choice; };
}
function nutrition(c:PageCanvas):boolean {
    if(c.key==='nutritionShop'&&c.p.rows?.some(r=>r.action?.type==='care.buyNutrition')){
        nutritionStore(c);return true;
    }
    if(c.key!=='roomNutrition'&&c.key!=='nutritionDetail')return false;
    const rows=(c.p.rows||[]) as NutritionRow[];
    if(!rows[0]?.visual)return false;
    const w=c.inner;
    const rise=(rate:number)=>'成长速度 '+rate+' 倍';
    if(c.key==='roomNutrition'){
        rows.forEach((r,i)=>{
            const v=r.visual,h=60;
            const entry=frame(c.body,'NutritionRow'+i,0,c.slot(h,7),w,h,
                v.selected?'#E0E8CE':paper.card,v.selected?'#75916A':paper.brass,false);
            tap(entry,()=>c.ui.choose(v.pick));
            const radio=box(entry,'Radio',-w/2+15,0,15,15);
            solidDisc(radio,13.4,v.selected?'#234D3C':'#AA9470');
            solidDisc(radio,10.6,v.selected?'#436952':'#FFF9E9');
            if(v.selected)solidDisc(radio,4.2,'#F8EBC8');
            if(r.art)picture(entry,'MealArt',r.art,-w/2+43,0,29,39);
            const left=-w/2+65, labelWidth=w-138;
            heading(entry,'MealName',r.title,left+labelWidth/2,11,labelWidth,21,15,paper.green);
            const stock=v.stock===undefined?'':' · 已拥有 '+v.stock+' 份';
            caption(entry,'Growth',rise(v.rate)+stock,left+labelWidth/2,-12,labelWidth,22,12,paper.ink);
            const details=box(entry,'NutritionDetail'+i,w/2-39,0,68,44);
            setTextWeight(caption(details,'Caption','查看详情',0,0,65,36,12,paper.green,true),true);
            tap(details,()=>c.ui.choose(v.detail));
        });
        const status=c.p.visual?.hint;
        if(status){
            const hint=frame(c.body,'NutritionHint',0,c.slot(38,7),w,38,'#F0DEB7',paper.brass,false);
            caption(hint,'Caption',status,0,0,w-20,32,13,paper.muted);
        }
        const action=c.p.actions?.[0];
        if(action){
            c.startFooter();
            press(c.body,'FeedMeal',action.label||'投喂',0,c.slot(48),w,()=>c.ui.choose(action),true,!!action.disabled);
        }
        return true;
    }
    const preview=rows[0],v=preview.visual;
    const hero=frame(c.body,'MealCard',0,c.slot(88,7),w,88,paper.card,paper.brass,false);
    if(preview.art)picture(hero,'MealArt',preview.art,-w/2+44,0,56,70);
    const labelWidth=w-93,left=-w/2+83;
    heading(hero,'MealName',preview.title,left+labelWidth/2,17,labelWidth,29,21,paper.green);
    caption(hero,'Growth',rise(v.rate),left+58,-15,116,22,14,paper.ink);
    const fields=rows.slice(1);
    const facts=frame(c.body,'MealFacts',0,c.slot(108,8),w,108,paper.card,paper.brass,false);
    fields.forEach((r,i)=>{
        const y=36-i*24;
        setTextWeight(caption(facts,'Fact'+i,r.title,-w/2+43,y,64,24,14,paper.ink),true);
        caption(facts,'Value'+i,r.text||'',29,y,w-95,24,13,paper.muted);
    });
    const rules=String(c.p.visual?.rules||'');
    const textHeight=lines(rules,w-22,13)*19+10;
    const paperRules=frame(c.body,'MealRules',0,c.slot(textHeight,10),w,textHeight,'#F7E7C4',paper.brass,false);
    const copy=caption(paperRules,'Rules',rules,0,0,w-20,textHeight-8,13,paper.ink);
    copy.lineHeight=19;
    const [back,buy]=c.p.actions||[];
    if(back&&buy){
        c.startFooter();
        const side=(w-8)/2,y=c.slot(48);
        press(c.body,'NutritionReturn',back.label!, -(side+8)/2,y,side,()=>c.ui.choose(back));
        press(c.body,'NutritionBuy',buy.label!, (side+8)/2,y,side,()=>c.ui.choose(buy),true);
    }
    return true;
}

function generic(ctx:PageCanvas):void {
    const {p,body,inner,slot}=ctx;
    ctx.strip(p.tabs||[],'Tab');
    if(p.art)picture(body,'Artwork',p.art,0,slot(110),inner,110,p.stage);
    if(p.art||p.tabs?.length)ctx.startList();
    if(p.subtitle){
        const h=Math.max(28,lines(p.subtitle,inner,14)*21);
        caption(body,'Subtitle',p.subtitle,0,slot(h),inner,h,14,paper.muted);
    }
    (p.filters||[]).forEach((group,i)=>ctx.strip(group,'Filter'+i+'-'));
    ctx.startList();
    (p.rows||[]).forEach(ctx.row);
    if(!p.rows?.length)ctx.empty();
    if(p.actions?.length||p.rows?.some(r=>r.select)){
        ctx.startFooter();ctx.selection();ctx.actions(p.actions||[]);
    }
}

interface LedgerOptions {modal?:boolean;ready?:boolean;pending?:boolean;offline?:boolean;slowRead?:boolean;backdrop?:boolean;backToTasks?:boolean;playEntrance?:boolean;suppressGuide?:boolean;guideMode?:boolean;}

// Keep explanatory cards whole when they do not fit, while animal and transaction lists can scroll.
function paginateDetails(content:Node,sheet:Node,ui:LedgerUI,width:number,top:number,height:number):boolean {
    const pagerHeight=48,pageHeight=height-pagerHeight;
    const groups:{top:number;rows:Node[]}[]=[];
    for(const row of content.children){
        const h=row.getComponent(UITransform)!.height;
        if(!/^Row\d+$/.test(row.name)||h>pageHeight-2)return false;
        const rowTop=-row.position.y-h/2;
        let group=groups[groups.length-1];
        if(!group||rowTop+h-group.top>pageHeight-2){
            group={top:rowTop,rows:[]};groups.push(group);
        }
        group.rows.push(row);
    }
    if(groups.length<2)return false;
    const index=Math.min(ui.detailPage,groups.length-1);
    groups.forEach((group,i)=>group.rows.forEach(row=>{
        row.active=i===index;
        if(row.active)row.setPosition(row.position.x,row.position.y+group.top-1,row.position.z);
    }));
    const bar=box(sheet,'DetailPages',0,top-height+pagerHeight/2,width,pagerHeight);
    const side=Math.min(92,width*.29),x=(width-side)/2-12;
    press(bar,'Previous','上一页',-x,0,side,()=>ui.turnPage(index-1),false,index===0,44);
    caption(bar,'Page',(index+1)+' / '+groups.length,0,0,70,32,14,paper.green,true);
    press(bar,'Next','下一页',x,0,side,()=>ui.turnPage(index+1),false,index===groups.length-1,44);
    return true;
}
function openingBooklet(c:PageCanvas,bodyHeight:number):boolean {
    const pages=c.p.visual?.openingBooklet as {art:string;caption:string}[]|undefined;
    if(!pages?.length)return false;
    const {body:content,inner,slot,ui}=c;
    const index=Math.max(0,Math.min(ui.detailPage,pages.length-1));
    const page=pages[index];
    const textHeight=page.caption?lines(page.caption,inner-8,14)*21+6:0;
    const imageHeight=Math.min(inner*880/720,Math.max(160,bodyHeight-textHeight-90));
    picture(content,'GuidePageImage',page.art,0,slot(imageHeight),inner,imageHeight);
    if(page.caption)caption(content,'GuidePageCaption',page.caption,0,slot(textHeight),inner-8,textHeight,14,paper.ink);
    c.startFooter();
    const width=Math.min(96,inner*.31),x=(inner-width)/2,y=slot(44,0);
    press(content,'Previous','上一页',-x,y,width,()=>ui.turnPage(index-1),false,index===0,44);
    caption(content,'Page',(index+1)+' / '+pages.length,0,y,64,44,14,paper.green,true);
    const last=index===pages.length-1;
    press(content,'Next',last?'合上信':'下一页',x,y,width,()=>last?ui.back():ui.turnPage(index+1),true,false,44);
    return true;
}
export function drawLedger(parent:Node,p:LedgerPage,height:number,coins:number,ui:LedgerUI,key:string,args:Args,
                           opts:LedgerOptions={}):ScrollView {
    const bounds=parent.getComponent(UITransform)!;
    height=bounds.height||height;
    const modal=!!opts.modal, width=modal?Math.min(378,bounds.width-18):bounds.width;
    const headerHeight=modal?54:64;
    const maxHeight=modal?Math.min(height-28,Math.floor(height*.93)):height;
    const veil=modal?box(parent,'Shade',0,0,bounds.width,height):undefined;
    veil?.addComponent(BlockInputEvents);
    const sheet=box(parent,opts.backdrop?'UnderlyingPage':'DeskPage',0,0,width,maxHeight);
    const viewport=box(sheet,'Viewport',0,0,width,1);
    const mask=viewport.addComponent(Mask);
    mask.type=Mask.Type.SPRITE_STENCIL;
    viewport.getComponent(Sprite)!.sizeMode=Sprite.SizeMode.CUSTOM;
    mask.spriteFrame=flatSpriteFrame();
    const scroll=viewport.addComponent(ScrollView);
    scroll.horizontal=false;scroll.vertical=true;scroll.elastic=false;
    const content=box(viewport,'Content',0,0,width,1);
    const area=content.getComponent(UITransform)!;
    area.setAnchorPoint(.5,1);scroll.content=content;
    const layout=canvas(content,width,key,args,p,ui,modal);
    const ctx=layout.ctx;
    if(opts.offline||opts.slowRead)press(content,'Retry',opts.offline?'离线 · 重新连接':'连接较慢 · 重新连接',
        0,ctx.slot(48),ctx.inner,()=>ui.choose({type:'ui.retry'}));
    if(opts.pending)ctx.row({title:'有一笔操作等待确认',text:'查询原请求回执',action:{type:'ui.receipt'}},-1);
    if(opts.ready===false || !(openingBooklet(ctx,maxHeight-headerHeight)||guideDialog(ctx)||taskList(ctx)||nutrition(ctx)||drawRoom(ctx)||drawBusiness(ctx)||account(ctx)))generic(ctx);
    if(p.guide?.next){
        if(!layout.footer)ctx.startFooter();
        const next=p.guide.next;
        press(content,'GuideNext',next.label||'',0,ctx.slot(48),ctx.inner,()=>ui.choose(next),true);
    }
    const extent=layout.extent();
    const actualHeight=modal?Math.min(maxHeight,headerHeight+extent+4):height;
    const bodyHeight=actualHeight-headerHeight-(modal?4:0);
    const top=actualHeight/2-headerHeight;
    const footer=layout.footer;
    const footerHeight=footer?Math.min(extent-footer.height,bodyHeight*.45):0;
    if(footer){
        const dock=box(sheet,'FixedFooter',0,top-bodyHeight+footerHeight,width,extent-footer.height);
        dock.getComponent(UITransform)!.setAnchorPoint(.5,1);
        const scale=footerHeight/(extent-footer.height);
        dock.setScale(scale,scale,1);
        for(const child of content.children.slice(footer.count)){
            child.setParent(dock);
            child.setPosition(child.position.x,child.position.y+footer.height,child.position.z);
        }
    }
    const available=bodyHeight-footerHeight;
    const minListHeight=Math.min(152,available*.32);
    const candidates=layout.boundaries.filter(b=>b.count<content.children.length);
    // Transaction filters and actions stay outside the mask, even on short phones.
    const split=footer?layout.boundaries[layout.boundaries.length-1]:modal?undefined:
        candidates.slice().reverse().find(b=>b.height<=available-minListHeight)||candidates[0];
    let fixedHeight=0;
    if(split) {
        fixedHeight=Math.min(split.height,available-minListHeight);
        const fixed=box(sheet,'Fixed',0,top,width,split.height);
        fixed.getComponent(UITransform)!.setAnchorPoint(.5,1);
        const children=content.children.slice();
        const filters=children.slice(0,split.count).filter(n=>['SpeciesFilter','BreedFilter','GrowthStageFilter'].includes(n.name));
        const filterTop=filters.length?Math.min(...filters.map(n=>-n.position.y-n.getComponent(UITransform)!.height/2)):split.height;
        const filterHeight=split.height-filterTop;
        const scale=(fixedHeight-filterHeight)/filterTop;
        fixed.setScale(scale,scale,1);
        for(const child of children.slice(0,split.count))child.setParent(fixed);
        if(filters.length){
            // Keep dropdowns at their shared size when short screens compress the illustration above them.
            const row=box(sheet,'FixedFilters',0,top-fixedHeight+filterHeight,width,filterHeight);
            row.getComponent(UITransform)!.setAnchorPoint(.5,1);
            for(const child of filters){
                child.setParent(row);
                child.setPosition(child.position.x,child.position.y+filterTop,child.position.z);
            }
        }
        for(const child of children.slice(split.count))child.setPosition(child.position.x,child.position.y+split.height,child.position.z);
    }
    let vh=available-fixedHeight,listHeight=(footer?.height??extent)-(split?.height||0);
    const details=['offer','show.review','show.result','show.bot'].includes(key);
    if(details&&listHeight>vh&&paginateDetails(content,sheet,ui,width,top-fixedHeight,vh)){
        vh-=48;listHeight=vh;
    }
    sheet.getComponent(UITransform)!.setContentSize(width,actualHeight);
    const background=box(sheet,'Paper',0,0,width,actualHeight,paper.page);
    paperGrain(box(background,'Grain',0,0,width,actualHeight));
    background.setSiblingIndex(0);
    viewport.getComponent(UITransform)!.setContentSize(width,vh);
    viewport.setPosition(0,top-fixedHeight-vh/2);
    content.setPosition(0,vh/2);
    area.setContentSize(width,Math.max(vh,listHeight));
    scroll.vertical=listHeight>vh;
    const titles:Record<string,string>={rooms:'动物小屋',research:'研究',login:'账号',profile:'每日签到',pet:'个体档案',
        collection:'荣誉',show:'赛事',lab:'培育中心',orders:'订单',guest:'订单'};
    const title=(opts.ready!==false&&titles[key])||(key==='breed'&&p.title==='繁育台'?'繁育':p.title);
    drawHeader(sheet,width,actualHeight,title,coins,ui.back,modal,opts.backToTasks,p.visual?.guideDialog!==undefined);
    if(modal) {
        const edge='#745437',halfW=width/2,halfH=actualHeight/2;
        solidRect(sheet,-halfW,-halfH,width,3,edge);
        solidRect(sheet,-halfW,halfH-3,width,3,edge);
        solidRect(sheet,-halfW,-halfH+3,3,actualHeight-6,edge);
        solidRect(sheet,halfW-3,-halfH+3,3,actualHeight-6,edge);
    }
    scroll.scrollToOffset(new Vec2(0,Math.max(0,Math.min(ui.offset,listHeight-vh))),0);
    if(layout.visibleRows.length){
        const margin=Math.min(112,vh*.25);
        const updateRows=()=>{
            // Content is top-anchored at vh/2. Its local position also updates on instant scrolls.
            const offset=content.position.y-vh/2;
            for(const row of layout.visibleRows){
                const top=-row.node.position.y-row.height/2;
                const visible=row.node.parent!==content||top+row.height>offset-margin&&top<offset+vh+margin;
                if(visible===row.mounted)continue;
                row.mounted=visible;
                if(visible)row.draw(row.node);
                else {
                    row.node.off(Node.EventType.TOUCH_END);
                    for(const child of [...row.node.children]){
                        child.removeFromParent();
                        child.destroy();
                    }
                }
            }
        };
        content.on(Node.EventType.TRANSFORM_CHANGED,updateRows);
        updateRows();
    }
    const canGuide=!opts.backdrop&&!opts.suppressGuide;
    const recovery=opts.guideMode&&(opts.offline?{target:'Retry',text:'重新连接后，继续当前引导。'}:
        opts.pending?{target:'Row-1',text:'查询操作结果，继续当前引导。'}:
        p.title==='重新核对'?{target:'Action0',text:'返回后重新打开当前引导。'}:undefined);
    const guide:GuideCue|undefined=canGuide?(recovery||(opts.ready!==false?p.guide:undefined)):undefined;
    const selected=!!(p.visual?.singleSelect&&ui.selected.size&&guide?.selectedText);
    const target=guide?.target?guideTarget(sheet,selected?'Action0':guide.target):undefined;
    if(target&&guide){
        revealGuideTarget(target,scroll);
        showGuideSpotlight(parent,target,selected?guide.selectedText:guide.text,modal,guideTarget(sheet,'OpenedLetter'));
    }else if(veil){
        box(veil,'Dim',0,0,bounds.width,height,'#1A2B23A4');
    }
    if(opts.playEntrance)guideEntrance(sheet);
    return scroll;
}

export function drawConnection(parent:Node,height:number,failed:boolean,retry:()=>void,guide=false):void {
    const bounds=parent.getComponent(UITransform)!;
    const w=bounds.width,h=bounds.height||height;
    const sheet=box(parent,'Connection',0,0,w,h,paper.green);
    const width=Math.min(340,w-26);
    const sign=frame(sheet,'Sign',0,10,width,failed?192:105,paper.page);
    heading(sign,'Title','宠物店',0,failed?53:17,width-24,39,23,paper.green,true);
    caption(sign,'Status',failed?'店铺连接中断，网络恢复后会自动重连。':'正在打开经营账簿…',0,failed?8:-20,width-24,40,15,paper.ink,true);
    if(failed){
        const button=press(sign,'Retry','重新连接',0,-52,150,retry,true);
        if(guide)showGuideSpotlight(parent,button,'重新连接后，继续当前引导。');
    }
}

export function confirmBox(parent:Node,title:string,onYes:()=>void,onNo:()=>void,guide=false):Node {
    const bounds=parent.getComponent(UITransform)!;
    const overlay=box(parent,'Confirm',0,0,bounds.width,bounds.height);
    overlay.addComponent(BlockInputEvents);
    if(!guide)box(overlay,'Dim',0,0,bounds.width,bounds.height,'#1A2B23A4');
    const w=Math.min(356,bounds.width-24), inner=w-28;
    const h=Math.max(152,Math.min(bounds.height-24,lines(title,inner,15)*22+105));
    const panel=frame(overlay,'ConfirmPanel',0,0,w,h,paper.card,'#866846',true);
    if(!guide)caption(panel,'Question',title,0,28,inner,h-76,15,paper.ink);
    const bw=(inner-8)/2;
    press(panel,'Cancel','返回',-(bw+8)/2,-h/2+38,bw,onNo);
    const accept=press(panel,'Accept','确认',(bw+8)/2,-h/2+38,bw,onYes,true);
    if(guide)showGuideSpotlight(parent,accept,title);
    return overlay;
}

export function guestArrival(parent:Node,open:()=>void,later:()=>void):Node {
    const {width,height}=parent.getComponent(UITransform)!;
    const overlay=box(parent,'GuestArrival',0,0,width,height,'#1A2B23A4');
    overlay.addComponent(BlockInputEvents);
    const w=Math.min(356,width-24);
    const panel=frame(overlay,'GuestPanel',0,0,w,162,paper.card,'#866846',true);
    heading(panel,'Title','特殊来客',0,48,w-28,34,21,paper.green);
    caption(panel,'Message','有位新来客到店了。',0,10,w-28,34,15,paper.ink);
    const bw=(w-36)/2;
    press(panel,'Orders','查看订单',-(bw+8)/2,-40,bw,open,true);
    press(panel,'Later','稍后',(bw+8)/2,-40,bw,later);
    return overlay;
}
