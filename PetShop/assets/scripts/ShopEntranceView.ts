import { BlockInputEvents, Color, Graphics, Mask, Node, ScrollView, UITransform, Vec2 } from 'cc';
import type { Args, Choice, LedgerPage, LedgerRow } from './ShopConnection';
import { box, caption, frame, heading, lines, paper, picture, press, rect, tap, type LedgerUI, type PageCanvas } from './LedgerCanvas';
import { drawRoom } from './RoomPresentation';
import { drawBusiness } from './BusinessPresentation';

export { box, caption, picture } from './LedgerCanvas';
export const ledgerModal = (key: string): boolean => ['saleQuote','researchNode','researchTable'].includes(key);

function drawHeader(parent: Node, width: number, height: number, title: string, coins: number, back: () => void, modal: boolean, toGuide=false): void {
    const h = modal ? 54 : 64;
    const n = box(parent,'Header',0,(height-h)/2,width,h,modal ? '#34594C' : paper.green);
    const g = n.getComponent(Graphics)!;
    if (!modal) {
        rect(g,-width/2,h/2-2,width,2,'#6F8E6C');
        rect(g,-width/2,-h/2+3,width,2,'#88A075');
    }
    rect(g,-width/2,-h/2,width,modal ? 2 : 3,'#6D4C32');
    if (modal) {
        const inset = 14;
        heading(n,'Title',title,-width/2+inset+(width-90)/2,1,width-90,h-8,20,paper.cream);
        const close=frame(n,'Back',width/2-34,1,48,36,'#365F4A','#8BA27A',false);
        caption(close,'Caption','关闭',0,0,46,34,14,paper.cream,true).isBold=true;
        const hit=box(close,'Touch',0,0,50,48);tap(hit,back);
    } else {
        const backNode=box(n,'Back',-width/2+35,3,60,48);
        const arrow=backNode.addComponent(Graphics);
        for (let i=0;i<5;i++) {
            rect(arrow,-20+i*1.4,-1+i*1.4,3,2.5,'#FFF0BD');
            rect(arrow,-20+i*1.4,-1-i*1.4,3,2.5,'#FFF0BD');
        }
        caption(backNode,'Caption',toGuide?'回引导':'返回',toGuide?9:5,0,toGuide?43:34,40,toGuide?13:14,'#FFF0BD',true).isBold=true;
        tap(backNode,back);
        const balanceWidth=Math.max(66,String(coins).length*9+47);
        const wallet=frame(n,'Wallet',width/2-10-balanceWidth/2,3,balanceWidth,27,'#193D34','#75916A',false);
        caption(wallet,'Value','金币 '+coins,0,0,balanceWidth-6,25,14,'#FFE4A4',true).isBold=true;
        heading(n,'Title',title,0,3,Math.max(92,width-2*(balanceWidth+13)),50,21,paper.cream,true);
    }
}

function paperGrain(parent: Node, width: number, height: number): void {
    const n=box(parent,'Paper',0,0,width,height,paper.page);
    const g=n.getComponent(Graphics)!;
    g.fillColor=new Color(117,75,34,5);
    for(let y=-height/2; y<height/2; y+=4)g.rect(-width/2,y,width,1);
    g.fill();
}

function canvas(content: Node, width: number, key: string, args: Args, p: LedgerPage, ui: LedgerUI) {
    const pad=width<=350?9:12;
    const inner=width-2*pad;
    const gap=width<=350?8:10;
    // These pages open with an edge-to-edge illustration immediately below the header.
    const startsWithScene=['orders','market','recycle','research','lab','credits','orderDesk'].includes(key)
        || (key==='sale' && ['order','market','recycle'].includes(args.channel))
        || (key==='shelf' && p.art==='shop-modules/lab');
    let cursor=startsWithScene?0:pad;
    const slot=(h:number,after=gap)=>{const y=-cursor-h/2;cursor+=h+after;return y;};
    const boundaries:{height:number;count:number}[]=[];
    let footer:{height:number;count:number}|undefined;
    function startList():void {
        if(content.children.length)boundaries.push({height:cursor,count:content.children.length});
    }
    function startFooter():void {footer={height:cursor,count:content.children.length};}
    const choice=(a:Choice)=>ui.choose(a);
    function strip(items:Choice[],name:string):void {
        if (!items.length)return;
        const spacing=7, w=(inner-(items.length-1)*spacing)/items.length, y=slot(48);
        items.forEach((a,i)=>press(content,name+i,a.label||'',-inner/2+w/2+i*(w+spacing),y,w,()=>choice({...a,replace:true}),!!a.active,!!a.disabled));
    }
    function selection():void {
        const ids=(p.rows||[]).filter(r=>r.select).map(r=>r.select!);
        if(!ids.length)return;
        const y=slot(48), all=ids.every(id=>ui.selected.has(id));
        caption(content,'SelectionCount',(p.selectionLabel||'已选')+' '+ui.selected.size+' 只',-54,y,inner-108,42,14,paper.green).isBold=true;
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
        caption(card,'Title',r.title,x,dh?h/2-8-th/2:0,available,th,15,paper.ink).isBold=true;
        if(r.text)caption(card,'Detail',r.text,x,h/2-8-th-dh/2,available,dh,13,paper.muted);
        if(r.select) {
            tap(card,()=>ui.toggle(r.select!));
            if(r.link)press(card,'Details','档案',inner/2-36,0,58,()=>choice(r.link!));
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
    const ctx:PageCanvas={key,args,p,body:content,width,inner,ui,slot,startList,startFooter,strip,row,action,actions,selection,empty};
    return {ctx,boundaries,get footer(){return footer;},extent:()=>cursor+pad};
}

function account(ctx: PageCanvas): boolean {
    const {key,p,body,inner,slot,ui}=ctx;
    if(key==='login') {
        const bannerHeight=Math.round(inner*.76);
        const banner=box(body,'Shopfront',0,slot(bannerHeight),inner,bannerHeight);
        banner.addComponent(Mask);
        if(p.art)picture(banner,'Opening',p.art,0,0,inner,inner*1.5);
        heading(body,'AccountHeading','小店账号',0,slot(26,6),inner,26,18,paper.ink);
        ctx.startList();
        const rows=p.rows||[], id=rows.find(r=>r.title==='店主编号'), assets=rows.find(r=>r.title==='店铺资产');
        const card=frame(body,'LocalShop',0,slot(112),inner,112,paper.card);
        caption(card,'Title',p.subtitle||'本机经营档',0,34,inner-22,25,15,paper.ink).isBold=true;
        caption(card,'Balance',assets?.text||'',0,7,inner-22,25,14,paper.ink);
        caption(card,'Identity','店主编号 '+(id?.text||''),0,-26,inner-22,40,12,paper.muted);
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

function tutorial(c:PageCanvas):boolean {
    const m=c.p.presentation;
    if(m?.kind!=='tutorial')return false;
    const focus=frame(c.body,'TutorFocus',0,c.slot(74),c.inner,74,paper.green,'#617C5E',false);
    const progress=m.archived?'开店手册':m.completed?'四步已完成':'当前第 '+m.step+' 步 / 共 '+m.total+' 步';
    caption(focus,'Progress',progress,0,17,c.inner-26,23,13,'#E5D9AF');
    heading(focus,'Title',m.archived?'开店四件事':m.completed?'你已经学会照料小店':m.title||c.p.title,
        0,-12,c.inner-26,31,19,paper.cream);
    c.startList();
    (c.p.rows||[]).forEach((row,i)=>{
        const textW=c.inner-58,th=Math.max(23,lines(row.title,textW,15)*21);
        const dh=row.text?Math.max(21,lines(row.text,textW,13)*19):0;
        const h=th+dh+19;
        const card=frame(c.body,'TutorStep'+i,0,c.slot(h,6),c.inner,h,row.current?'#E8EDD3':paper.card,row.current?'#78936C':paper.brass,false);
        const badge=frame(card,'Index',-c.inner/2+23,h/2-23,25,25,row.done?'#45694F':'#F3E3BF',row.current?'#78936C':paper.brass,false);
        heading(badge,'Value',row.done?'✓':String(i+1),0,0,23,23,14,row.done?'#FFF0CA':paper.green,true);
        heading(card,'Title',row.title.replace(/^\d+\.\s*/,''),19,h/2-9-th/2,textW,th,15,paper.ink);
        if(row.text)caption(card,'Detail',row.text,19,h/2-9-th-dh/2,textW,dh,13,paper.muted);
    });
    const actions=c.p.actions||[];
    c.startFooter();
    for(let i=0;i<actions.length;i+=2) {
        const group=actions.slice(i,i+2),y=c.slot(48,6),w=(c.inner-6*(group.length-1))/group.length;
        group.forEach((a,j)=>press(c.body,'TutorAction'+(i+j),a.label||'继续',-c.inner/2+w/2+j*(w+6),y,w,
            ()=>c.ui.choose(a),!i&&!j,!!a.disabled));
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

interface LedgerOptions {modal?:boolean;ready?:boolean;pending?:boolean;offline?:boolean;backdrop?:boolean;backToGuide?:boolean;}

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
export function drawLedger(parent:Node,p:LedgerPage,height:number,coins:number,ui:LedgerUI,key:string,args:Args,
                           opts:LedgerOptions={}):ScrollView {
    const bounds=parent.getComponent(UITransform)!;
    height=bounds.height||height;
    const modal=!!opts.modal, width=modal?Math.min(378,bounds.width-18):bounds.width;
    const headerHeight=modal?54:64;
    const maxHeight=modal?Math.min(height-28,Math.floor(height*.93)):height;
    if(modal) {
        const veil=box(parent,'Shade',0,0,bounds.width,height);
        const g=veil.addComponent(Graphics);g.fillColor=new Color(26,43,35,164);g.rect(-bounds.width/2,-height/2,bounds.width,height);g.fill();
        veil.addComponent(BlockInputEvents);
    }
    const sheet=box(parent,opts.backdrop?'UnderlyingPage':'DeskPage',0,0,width,maxHeight);
    const viewport=box(sheet,'Viewport',0,0,width,1);
    viewport.addComponent(Mask);
    const scroll=viewport.addComponent(ScrollView);
    scroll.horizontal=false;scroll.vertical=true;scroll.elastic=false;
    const content=box(viewport,'Content',0,0,width,1);
    const area=content.getComponent(UITransform)!;
    area.setAnchorPoint(.5,1);scroll.content=content;
    const layout=canvas(content,width,key,args,p,ui);
    const ctx=layout.ctx;
    if(opts.offline)press(content,'Retry','离线 · 重新连接',0,ctx.slot(48),ctx.inner,()=>ui.choose({type:'ui.retry'}));
    if(opts.pending)ctx.row({title:'有一笔操作等待确认',text:'查询原请求回执',action:{type:'ui.receipt'}},-1);
    if(opts.ready===false || !(tutorial(ctx)||drawRoom(ctx)||drawBusiness(ctx)||account(ctx)))generic(ctx);
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
        const scale=fixedHeight/split.height;
        fixed.setScale(scale,scale,1);
        const children=content.children.slice();
        for(const child of children.slice(0,split.count))child.setParent(fixed);
        for(const child of children.slice(split.count))child.setPosition(child.position.x,child.position.y+split.height,child.position.z);
    }
    let vh=available-fixedHeight,listHeight=(footer?.height??extent)-(split?.height||0);
    const details=['offer','show.review','show.result','show.bot'].includes(key)||p.presentation?.kind==='pairConfirm';
    if(details&&listHeight>vh&&paginateDetails(content,sheet,ui,width,top-fixedHeight,vh)){
        vh-=48;listHeight=vh;
    }
    sheet.getComponent(UITransform)!.setContentSize(width,actualHeight);
    paperGrain(sheet,width,actualHeight);
    sheet.getChildByName('Paper')!.setSiblingIndex(0);
    viewport.getComponent(UITransform)!.setContentSize(width,vh);
    viewport.setPosition(0,top-fixedHeight-vh/2);
    content.setPosition(0,vh/2);
    area.setContentSize(width,Math.max(vh,listHeight));
    scroll.vertical=listHeight>vh;
    const titles:Record<string,string>={rooms:'动物房间',research:'研究技能树',login:'账号',profile:'每日签到',pet:'个体档案',
        collection:'荣誉',show:'赛事',lab:'培育中心',orders:'订单',guest:'订单'};
    const title=(opts.ready!==false&&titles[key])||(key==='breed'&&p.title==='繁育台'?'繁育':p.title);
    drawHeader(sheet,width,actualHeight,title,coins,ui.back,modal,opts.backToGuide);
    if(modal) {
        const g=sheet.addComponent(Graphics);g.lineWidth=3;g.strokeColor=new Color().fromHEX('#745437');
        g.rect(-width/2+1.5,-actualHeight/2+1.5,width-3,actualHeight-3);g.stroke();
    }
    scroll.scrollToOffset(new Vec2(0,Math.max(0,Math.min(ui.offset,listHeight-vh))),0);
    return scroll;
}

export function drawConnection(parent:Node,height:number,failed:boolean,retry:()=>void):void {
    const bounds=parent.getComponent(UITransform)!;
    const w=bounds.width,h=bounds.height||height;
    const sheet=box(parent,'Connection',0,0,w,h,paper.green);
    const width=Math.min(340,w-26);
    const sign=frame(sheet,'Sign',0,10,width,failed?192:105,paper.page);
    heading(sign,'Title','宠物店',0,failed?53:17,width-24,39,23,paper.green,true);
    caption(sign,'Status',failed?'店铺服务器未连接，请检查服务后重试。':'正在打开经营账簿…',0,failed?8:-20,width-24,40,15,paper.ink,true);
    if(failed)press(sign,'Retry','重新连接',0,-52,150,retry,true);
}

export function confirmBox(parent:Node,title:string,onYes:()=>void,onNo:()=>void):Node {
    const bounds=parent.getComponent(UITransform)!;
    const overlay=box(parent,'Confirm',0,0,bounds.width,bounds.height);
    overlay.addComponent(BlockInputEvents);
    const g=overlay.addComponent(Graphics);g.fillColor=new Color(26,43,35,164);
    g.rect(-bounds.width/2,-bounds.height/2,bounds.width,bounds.height);g.fill();
    const w=Math.min(356,bounds.width-24), inner=w-28;
    const h=Math.max(152,Math.min(bounds.height-24,lines(title,inner,15)*22+105));
    const panel=frame(overlay,'ConfirmPanel',0,0,w,h,paper.card,'#866846',true);
    caption(panel,'Question',title,0,28,inner,h-76,15,paper.ink);
    const bw=(inner-8)/2;
    press(panel,'Cancel','返回',-(bw+8)/2,-h/2+38,bw,onNo);
    press(panel,'Accept','确认',(bw+8)/2,-h/2+38,bw,onYes,true);
    return overlay;
}

export function guestArrival(parent:Node,open:()=>void,later:()=>void):Node {
    const {width,height}=parent.getComponent(UITransform)!;
    const overlay=box(parent,'GuestArrival',0,0,width,height);
    overlay.addComponent(BlockInputEvents);
    const g=overlay.addComponent(Graphics);g.fillColor=new Color(26,43,35,164);
    g.rect(-width/2,-height/2,width,height);g.fill();
    const w=Math.min(356,width-24);
    const panel=frame(overlay,'GuestPanel',0,0,w,162,paper.card,'#866846',true);
    heading(panel,'Title','特殊来客',0,48,w-28,34,21,paper.green);
    caption(panel,'Message','有位新来客到店了。',0,10,w-28,34,15,paper.ink);
    const bw=(w-36)/2;
    press(panel,'Orders','查看订单',-(bw+8)/2,-40,bw,open,true);
    press(panel,'Later','稍后',(bw+8)/2,-40,bw,later);
    return overlay;
}
