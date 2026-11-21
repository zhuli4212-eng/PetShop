import { setTextWeight } from './ShopTypography';
import { type Node, UITransform } from 'cc';
import type { Choice, LedgerPage, LedgerRow } from './ShopConnection';
import { animalCardWidth, animalDetails, animalFilters, animalSummary, animalSummaryHeight, box, caption, frame, frameContents, heading, paper, picture, press, tap, type PageCanvas } from './LedgerCanvas';
import { banner, blocks, brown, buttons, card, cream, dock, edge, green, info, ink, note, section, text, thumbTabs } from './BusinessCards';
import { guideNote } from './TutorialPresentation';

interface ResearchBenefit {
    metric:string; bonusLabel:string; valueLabel:string; description:string; currentBonus:string; nextBonus:string|null;
    currentValue:string; nextValue:string|null; overview:string; delta:string; example:string; switchNote:string;
}
interface RowVisual {
    condition?:string; difficulty?:string; available?:boolean; rate?:number; choices?:Choice[];
    name?:string; number?:string; price?:number; summary?:string; blockedReason?:string; mode?:string; benefit?:ResearchBenefit; status?:string; uncollected?:boolean; bought?:boolean;
    unit?:'张'|'份';
}
interface PageVisual {
    scoringVersion?:number;
    remaining?:number; protectedCount?:number; saleExperience?:number; levels?:number[]; open?:boolean; handbook?:string; description?:string; status?:string;
    nextBatchAt?:number;
    schedule?:Record<string,{close:string;result:string;payout:string}>; pet?:string; petStage?:string; tierOptions?:LedgerRow[];
    shopDay?:number; raceAccess?:Record<string,{opensDay:number;unlocked:boolean;opensAt:number}>; benefit?:ResearchBenefit;
}
type DisplayRow=LedgerRow & {visual?:RowVisual};
const pageVisual=(c:PageCanvas):PageVisual=>(c.p as LedgerPage&{visual?:PageVisual}).visual||{};
const rows=(c:PageCanvas):DisplayRow[]=>c.p.rows||[];
const act=(label:string,page:string,args:Record<string,any>={}):Choice=>({label,page,args});
const back={label:'返回',type:'ui.back'};

function orders(c:PageCanvas):void {
    banner(c,'orders','订单柜台');
    c.strip(c.p.tabs||[],'OrderTab');
    c.startList();
    if(c.p.visual?.preview){
        section(c,'普通订单','新手预览');
        note(c,c.p.subtitle||'店铺达到 2 级后可交付或取消订单。');
    }else section(c,'普通订单',c.p.guide?c.p.subtitle:'免费取消 '+(pageVisual(c).remaining??'—')+' / 3');
    guideNote(c);
    c.startList();
    rows(c).forEach((r,i)=>{
        const v=r.visual;
        if(!v?.choices){info(c,{...r,...(!c.p.guide&&{art:'shop-modules/order-clock'})},i);return;}
        const h=155,n=card(c,'Order'+i,h),w=c.inner-20;
        picture(n,'OrderIcon',r.art||'shop-modules/order-neighbor-a',-w/2+28,45,60,60);
        const textLeft=-w/2+66,titleWidth=w-154;
        text(n,'Name',v.name||'收养委托',textLeft+titleWidth/2,h/2-22,titleWidth,25,16,ink,'left',true);
        text(n,'Slot','第 '+(i+1)+' 槽',w/2-40,h/2-22,80,24,12,brown,'right');
        text(n,'Condition',v.condition||r.text||'',textLeft+(w-66)/2,31,w-66,28,14);
        const pill=box(n,'Difficulty',-w/2+43,3,86,23,'#EED8AB');
        text(pill,'Label',(v.difficulty||'')+' · ×'+v.rate,0,0,84,22,12,brown,'center');
        text(n,'Inventory',v.available?'有合适的动物':'暂无符合条件的动物，委托保留',47,3,w-94,24,12,brown);
        const bw=(w-7)/2,delivery=v.available?v.choices[0]:r.link!;
        press(n,'Deliver',v.available?'选择交付':'查看备货',-(bw+7)/2,-43,bw,()=>c.ui.choose(delivery),true,false,48);
        const cancel=v.choices[1];
        if(cancel){
            const label=cancel.page?'取消次数':'取消订单';
            const button=press(n,'Cancel',label,(bw+7)/2,-43,bw,()=>c.ui.choose(cancel),false,false,48);
            const copy=button.getChildByName('Caption')!,tw=Math.min(bw-30,label.length*14+4);
            copy.setPosition(11,0);copy.getComponent(UITransform)!.setContentSize(tw,44);
            picture(button,'CancelIcon','shop-modules/order-cancel',-tw/2-2,0,20,20);
        }
        if(r.link)tap(n,()=>c.ui.choose(r.link!));
    });
    dock(c,c.p.actions||[],-1);
}
function tradeAnimal(c:PageCanvas,r:DisplayRow,i:number,market:boolean):void {
    const w=animalCardWidth(c),reason=r.visual!.blockedReason||'';
    const reasonH=reason?blocks(reason,w-22,13)*19+9:0;
    const h=animalSummaryHeight+reasonH;
    const draw=(node:Node)=>drawTradeCard(c,node,r,w,h/2,reason,reasonH);
    if(market)c.visibleRow('Row'+i,w,h,6,draw);
    else draw(box(c.body,'Row'+i,0,c.slot(h,6),w,h));
}
function drawTradeCard(c:PageCanvas,n:Node,r:DisplayRow,w:number,top:number,reason:string,reasonH:number):void {
    const animal=r.animal!,v=r.visual!,muted='#625F56';
    const selected=!!r.select&&c.ui.selected.has(r.select),blocked=!r.select;
    frameContents(n,blocked?'#E8E5DB':selected?'#E3EBCD':cream,blocked?'#B6B2A6':selected?'#618063':edge);
    const check=frame(n,'Check',-w/2+15,top-34,17,17,blocked?'#D5D2C8':selected?'#365F4A':'#FFF8E6',
        blocked?'#A29E93':selected?'#365F4A':'#9A8970',false);
    if(selected||blocked)text(check,'Mark',blocked?'–':'✓',0,0,16,18,14,blocked?muted:'#FFF7E3','center',true);
    animalSummary(c,n,animal,w,top,22,blocked);
    if(typeof v.price==='number')text(n,'Price',v.price+' 金币',w/2-38,top-69,60,18,12,'#77552B','right',true);
    if(reason){
        box(n,'ReasonRule',0,top-animalSummaryHeight,w-16,1,'#C5C1B6');
        text(n,'BlockedReason',reason,0,top-animalSummaryHeight-reasonH/2,w-22,reasonH-3,13,muted,'left',true);
    }
    if(r.select)tap(n,()=>c.ui.toggle(r.select!));
    animalDetails(c,n,'Details',r.link||{page:'pet',args:{id:animal.id}},w,top);
}

function sale(c:PageCanvas):void {
    const channel=c.key==='sale'?String(c.args.channel):c.key,mode=channel==='order'?'交付':channel==='recycle'?'回收':'出售';
    const list=rows(c),ids=list.filter(r=>r.select).map(r=>r.select!);
    if(channel==='recycle'){
        if(!c.modal)banner(c,'lab','培育中心');
        if(!c.p.visual?.singleSelect)c.strip([['','全部'],['rabbit','兔'],['cat','猫'],['dog','狗']].map(([species,label])=>({
            ...act(label,'recycle',species?{species}:{}),active:(c.args.species||'')===species,
        })),'RecycleSpecies');
    }
    else if(channel==='order')banner(c,'orders','订单柜台');
    else if(channel==='market')banner(c,'market','自由市场');
    if(channel!=='guest')c.startList();
    if(channel==='order'||channel==='guest')note(c,c.p.subtitle||'');
    const protectedCount=pageVisual(c).protectedCount||0;
    const protection=protectedCount&&(channel==='recycle'||channel==='market')?' · 种源保护 '+protectedCount+' 只':'';
    const count=channel==='market'&&c.p.filters?.length ? '可售 '+ids.length+' / 共 '+list.length+' 只' : ids.length+' 只可选'+protection;
    section(c,channel==='recycle'?'回收已故动物':'选择'+mode+'的动物',count);
    if(channel==='market'&&!c.p.visual?.singleSelect)animalFilters(c,'物种','品种');
    guideNote(c);
    c.startList();
    for(const [i,r] of list.entries()){
        if(r.animal&&r.visual)tradeAnimal(c,r,i,channel==='market');
        else c.row(r,i);
    }
    if(!list.length)c.empty();
    c.startFooter();
    const selected=ids.filter(id=>c.ui.selected.has(id)),all=ids.length>0&&selected.length===ids.length;
    const total=list.reduce((sum,r)=>sum+(r.select&&c.ui.selected.has(r.select)?r.visual?.price||0:0),0);
    const w=c.inner,n=box(c.body,'SaleBar',0,c.slot(58,5),w,58,'#F2E4C5');
    box(n,'TopRule',0,28,w,1,'#B49B70');
    text(n,'SelectionCount','已选 '+selected.length+' 只 · '+total+' 金币',-59,0,w-127,38,14,green,'left',true);
    const a=(c.p.actions||[])[0];
    const review=()=>{
        if(a)c.ui.choose(channel==='market'?{...a,useSelection:false,args:{...a.args,ids:selected}}:a);
    };
    const reviewDisabled=!a||!selected.length;
    const selectAll={label:all?'清空选择':'全选本页',type:'ui.selectAll',disabled:!ids.length,args:{ids,clear:all}};
    if((channel==='market'||channel==='recycle')&&!c.p.visual?.singleSelect){
        press(n,'SelectAll',selectAll.label,w/2-55,0,105,()=>c.ui.choose(selectAll),false,selectAll.disabled,48);
        press(c.body,'Action0','核对'+mode,0,c.slot(48,9),w,review,true,reviewDisabled,48);
        return;
    }
    press(n,'Action0','核对'+mode,w/2-55,0,105,review,true,reviewDisabled,48);
    if(!c.p.visual?.singleSelect)buttons(c,[selectAll],-1);
}
function quote(c:PageCanvas):void {
    const a=c.p.actions?.find(choice=>choice.type==='sale.commit');
    if(!a){
        section(c,c.p.title);
        c.startList();
        rows(c).forEach(r=>note(c,[r.title,r.text].filter(Boolean).join(' · '),true));
        c.startFooter();
        buttons(c,c.p.actions||[]);
        return;
    }
    const amounts:number[]=a.args?.amounts||[];
    section(c,'本次交付',amounts.length+' 只');
    c.startList();
    const details=rows(c);
    details.slice(amounts.length).forEach(r=>note(c,[r.title,r.text].filter(Boolean).join(' · '),true));
    details.slice(0,amounts.length).forEach((r,i)=>{
        const n=box(c.body,'Row'+i,0,c.slot(37,0),c.inner,37,'#FFF1D2'),w=c.inner;
        box(n,'Rule',0,-18,w,1,'#D6C298');
        text(n,'Name',r.title,-50,0,w-112,30,15);
        text(n,'Price',amounts[i]+' 金币',w/2-52,0,96,30,15,brown,'right',true);
    });
    if(typeof c.p.visual?.guideQuote==='string')note(c,c.p.visual.guideQuote);
    c.startFooter();
    const y=c.slot(45,8);
    const xp=pageVisual(c).saleExperience;
    if(xp)text(c.body,'SaleExperience','店铺经验 +'+xp,-c.inner/4,y,c.inner/2,40,14,green);
    text(c.body,'Total','合计 '+amounts.reduce((n,v)=>n+v,0)+' 金币',xp?c.inner/4:0,y,xp?c.inner/2:c.inner,40,18,green,'right',true);
    const edit=c.p.actions?.find(choice=>choice.type==='ui.editSelection');
    buttons(c,[...(edit?[edit]:[]),a],edit?1:0);
}
interface NutritionStoreRow extends LedgerRow {
    visual: { rate:number; price:number; stock:number; };
    action: Choice;
}
export function nutritionStore(c:PageCanvas):void {
    const w=c.inner;
    if(c.key==='nutritionShop')c.strip(c.p.tabs||[],'NutritionRoom');
    caption(c.body,'NutritionSubtitle',c.p.subtitle||'营养餐',0,c.slot(28,4),w,28,14,paper.muted);
    c.startList();
    ((c.p.rows||[]) as NutritionStoreRow[]).forEach((r,i)=>{
        const h=84, left=-w/2+57, textWidth=w-165, right=w/2-55;
        const card=frame(c.body,'NutritionOffer'+i,0,c.slot(h,7),w,h,
            r.current?'#E0E8CE':paper.card,r.current?'#75916A':paper.brass,false);
        if(r.art)picture(card,'MealArt',r.art,-w/2+29,0,43,58);
        const {rate,price,stock}=r.visual, textX=left+textWidth/2;
        heading(card,'MealName',r.title,textX,21,textWidth,22,15,paper.green);
        caption(card,'Growth','成长速度 '+rate+' 倍',textX,0,textWidth,20,13,paper.ink);
        caption(card,'Stock','库存 '+stock+' 份',textX,-21,textWidth,20,13,paper.muted);
        setTextWeight(caption(card,'Price',price+' 金币',right,23,96,20,14,paper.ink,true),true);
        press(card,'NutritionPurchase'+i,r.action.label!,right,-12,94,()=>c.ui.choose(r.action),true,!!r.action.disabled,42);
    });
}
function labMenu(c:PageCanvas,active:string):void {
    const scene=banner(c,'lab','培育中心');
    const y=-scene.getComponent(UITransform)!.height/2+28,right=c.width/2-8;
    const researchWidth=70,recycleWidth=96,gap=6;
    press(scene,'LabResearch','研究',right-recycleWidth-gap-researchWidth/2,y,researchWidth,
        ()=>c.ui.choose(act('研究','research')),false,false,44);
    press(scene,'LabRecycle','动物回收',right-recycleWidth/2,y,recycleWidth,
        ()=>c.ui.choose(act('动物回收','recycle')),false,false,44);
    c.strip([['seed','种源'],['nutrition','营养餐'],['services','物品']].map(([tab,label])=>({
        ...act(label,'lab',tab==='seed'?{}:{tab}),active:active===tab,
    })),'LabTab');
}
function lab(c:PageCanvas):void {
    const tab=c.args.tab||'seed';
    labMenu(c,tab);
    if(tab==='nutrition'){nutritionStore(c);return;}
    if(tab==='seed'){
        const label=section(c,c.p.guide?.target?.startsWith('Row')||c.p.guide?.next?'开店种源':'本批种源',c.p.subtitle);
        const nextBatchAt=pageVisual(c).nextBatchAt;
        if(label&&nextBatchAt!==undefined)c.ui.bindCountdown(label,nextBatchAt,s=>'下一批 '+Math.ceil(s/60)+' 分钟');
    }
    guideNote(c);
    c.startList();
    if(tab==='services')rows(c).forEach((r,i)=>catalogService(c,r,i));
    else rows(c).forEach((r,i)=>seedRow(c,r,i));
    if(!rows(c).length)c.empty();
    if(tab==='seed'&&c.p.actions?.length){c.startFooter();c.actions(c.p.actions);}
}
function seedRow(c:PageCanvas,r:DisplayRow,i:number):void {
    if(!r.animal||typeof r.visual?.price!=='number'){info(c,r,i);return;}
    const bought=!!r.visual.bought,w=animalCardWidth(c),h=animalSummaryHeight;
    const n=frame(c.body,'Row'+i,0,c.slot(h,6),w,h,bought?'#E8E5DB':cream,edge);
    animalSummary(c,n,r.animal,w,h/2,0,bought);
    text(n,'Price',bought?'已购入':r.visual.price+' 金币',w/2-38,h/2-69,60,18,12,brown,'right',true);
    if(r.link){
        tap(n,()=>c.ui.choose(r.link!));
        animalDetails(c,n,'Details',r.link,w,h/2);
    }
}
function catalogService(c:PageCanvas,r:DisplayRow,i:number):void {
    const a=r.action!, w=c.inner;
    const detail=(r.text||'').split('\n');
    const price=detail.pop()||'', copy=detail.join('\n');
    const dh=blocks(copy,w-20,13)*18,h=96+dh,n=card(c,'ServiceOffer'+i,h);
    if(r.art)picture(n,'Icon',r.art,-w/2+26,h/2-24,31,31);
    text(n,'Title',r.title,r.art?18:0,h/2-24,w-(r.art?61:20),31,15,ink,'left',true);
    text(n,'Effect',copy,0,h/2-45-dh/2,w-20,dh,13,brown);
    text(n,'Price',price,-55,-h/2+24,w-130,32,13,brown);
    press(n,'ServicePurchase'+i,a.disabled?'金币不足':'购买 1 '+(r.visual?.unit||'张'),w/2-61,-h/2+26,102,()=>c.ui.choose(a),true,!!a.disabled,40);
}
const branchArt=['research-review','breeding-guide','research-market'];
function research(c:PageCanvas):void {
    const v=pageVisual(c);
    if(!c.modal)banner(c,'lab','培育中心');
    thumbTabs(c,c.p.tabs||[]);
    const w=c.inner,lev=v.levels||[0,0,0],h=59;
    const head=frame(c.body,'BookHeading',0,c.slot(h,0),w,h,'#FFF1CF','#B99C6C');
    heading(head,'Title',v.handbook||c.p.title,-43,9,w-107,26,19,green);
    text(head,'Sum',lev.reduce((a,b)=>a+b,0)+' / 30 级',w/2-57,9,88,23,13,brown,'right',true);
    text(head,'Scope',v.open===false?'房间开放后即可研究，可先查看分支效果。':'永久研究 · 仅对本物种生效',0,-13,w-22,20,12,brown);
    c.startList();
    rows(c).forEach((r,i)=>{
        const n=frame(c.body,'Branch'+i,0,c.slot(72,0),w,72,i%2?'#F8E7C0':'#FFEFCA','#C4A772');
        const ico=frame(n,'Medallion',-w/2+25,0,33,37,'#E5D0A5','#C1A471');
        picture(ico,'Icon','shop-modules/'+branchArt[i],0,0,28,30);
        const parts=(r.text||'').split(' · '),left=-w/2+51,contentW=w-61,titleW=contentW-62;
        text(n,'Title',r.title.split(' · ')[0],left+titleW/2,21,titleW,23,15,green,'left',true);
        text(n,'Level',lev[i]+' / 10',w/2-37,21,53,23,14,'#745427','right',true);
        text(n,'Effect',r.visual?.benefit?.overview||parts[0],left+contentW/2,0,contentW,22,13,ink);
        const bar=Math.min(contentW-79,136),bw=(bar-18)/10;
        for(let j=0;j<10;j++)box(n,'Level'+j,left+j*(bw+2)+bw/2,-22,bw,5,j<lev[i]?'#60805D':'#DBCAA6');
        const status=r.visual?.status||parts[1]||'';
        const statusArt=status==='已满级'?'node-complete':['房间未开放','前置不足'].includes(status)?'node-lock':'';
        if(statusArt)picture(n,'StatusIcon','shop-modules/'+statusArt,-w/2+39,-14,18,18);
        text(n,'Status',status+' ›',w/2-50,-21,80,22,12,green,'right');
        if(r.link)tap(n,()=>c.ui.choose(r.link!));
    });
}
function researchDetail(c:PageCanvas):void {
    const list=rows(c),actions=c.p.actions||[],v=pageVisual(c),w=c.inner;
    const benefit=v.benefit,desc=benefit?.description||v.description||c.p.subtitle||'';
    const descriptionH=blocks(desc,w,13)*18+2;
    text(c.body,'Help',desc,0,c.slot(descriptionH,5),w,descriptionH,13);
    if(c.key==='researchTable'){
        const first=w*.25,second=w*.33,third=w-first-second;
        const coords=[-w/2+first/2,-w/2+first+second/2,w/2-third/2],widths=[first-4,second-4,third-4];
        const headings=['等级',benefit?.bonusLabel||'研究值',benefit?.valueLabel||benefit?.metric||'实际效果'],y=c.slot(23,2);
        headings.forEach((s,i)=>text(c.body,'Column'+i,s,coords[i],y,widths[i],22,12,brown,'center',true));
        c.startList();
        list.forEach((r,i)=>{
            const selected=r.title.includes('当前'),n=box(c.body,'Level'+i,0,c.slot(25,0),w,25,selected?'#E2E6C4':cream);
            const cells=[r.title,r.visual?.benefit?.currentBonus||r.text||'',r.visual?.benefit?.currentValue||''];
            cells.forEach((s,j)=>text(n,['Label','Effect','Value'][j],s,coords[j],0,widths[j],24,13,j===2?green:ink,'center',selected));
            box(n,'Rule',0,-12,w,1,'#DDC99E');
        });dock(c,[act('查看本分支','researchNode',c.args),act('返回手册','research',{species:c.args.species})],-1);return;
    }
    const current=list[0],next=list[1];
    if(!current)return;
    const pair=next?.title.startsWith('下级')?[current,next]:[current],y=c.slot(47,5),bw=(w-(pair.length===2?20:0))/pair.length;
    pair.forEach((r,i)=>{
        const panel=frame(c.body,'Effect'+i,pair.length===1?0:(i?1:-1)*(bw+20)/2,y,bw,47,i?'#E2E6C5':'#EBDAB6',i?'#A6B18A':'#C5AD80');
        const grade=r.title.replace(' · ',' ')+(benefit?' · '+benefit.bonusLabel:'');
        const complete=i===0&&v.status==='已满级';
        if(complete)picture(panel,'Complete','shop-modules/node-complete',-bw/2+13,10,16,16);
        text(panel,'Grade',grade,complete?10:0,10,bw-(complete?30:10),18,11,brown);
        text(panel,'Percent',(i?benefit?.nextBonus:benefit?.currentBonus)||r.text||'',0,-9,bw-10,23,18,green,'left',true);
    });
    if(pair.length===2)text(c.body,'Arrow','→',0,y,23,24,15,ink,'center');
    if(benefit){
        const details=[benefit.delta,benefit.example,benefit.switchNote];
        for(const [i,copy] of details.entries()){
            if(!copy)continue;
            const h=blocks(copy,w-4,13)*18+2;
            text(c.body,['Delta','Example','Switch'][i],copy,0,c.slot(h,3),w-4,h,13,i===0?green:brown,'left',i===0);
        }
    }
    const table=actions.find(a=>a.page==='researchTable');
    const prereqs=list.filter(r=>r.title.includes('前置'));
    const fee=list.find(r=>r.title==='基准 / 实付');
    if(prereqs.length||fee)c.startList();
    if(prereqs.length){
        section(c,'升级条件',prereqs.find(r=>!r.link)?.text);
        const linked=prereqs.filter(r=>r.link);
        if(linked.length){
            const gap=5,size=(w-gap*(linked.length-1))/linked.length,top=c.slot(45,5);
            linked.forEach((r,i)=>{
                const panel=frame(c.body,'Prerequisite'+i,-w/2+size/2+i*(size+gap),top,size,45,'#F6E5BC','#C5AA79');
                text(panel,'RequiredBranch',r.title.replace(/\s*·\s*前置$/,'')+' ›',0,9,size-8,20,13,green,'center',true);
                const met=(r.text||'').endsWith('已满足');
                picture(panel,'StatusIcon','shop-modules/'+(met?'node-complete':'node-lock'),-size/2+12,-10,15,15);
                text(panel,'Condition',r.text||'',9,-10,size-25,18,12,brown,'center');
                tap(panel,()=>c.ui.choose(r.link!));
            });
        }
    }
    if(fee){const n=frame(c.body,'Fee',0,c.slot(30,6),w,30,'#F1DFBA','#CFB584');
        text(n,'Title','基准 / 实付',-w/4,0,w/2-12,27,13,brown);text(n,'Amount',fee.text||'',w/4,0,w/2-12,27,13,'#765127','right',true);}
    const upgrade=actions.find(a=>a.type==='research.upgrade');
    const original=actions.find(a=>a.page==='researchNode');
    const controls:Choice[]=[];
    if(original)controls.push(original);
    if(table)controls.push({...table,label:'各级效果'});
    controls.push({...back,label:'返回手册'},upgrade?{...upgrade,label:'核对升级'}:{label:v.status||'已满级',disabled:true});
    dock(c,controls,controls.length-1,controls.length===3?3:2);
}
function decor(c:PageCanvas):void {
    banner(c,'decor-room','');
    c.startList();
    rows(c).forEach((r,i)=>{
        const w=c.inner,n=card(c,'Decor'+i,60,cream,6),tw=w-151,tx=-w/2+53+tw/2;
        if(r.art)picture(n,'Icon',r.art,-w/2+26,0,40,40);
        text(n,'Title',r.title,tx,12,tw,22,15,ink,'left',true);
        text(n,'Offer',r.text||'',tx,-11,tw,24,12,brown);
        const a=r.action;if(!a)return;
        const label=a.type==='decor.buy'?'购买装饰':a.args?.placed?'摆出':'收起';
        press(n,'SetDecoration',label,w/2-48,0,82,()=>c.ui.choose(a),false,!!a.disabled,46);
    });
}
function visitor(c:PageCanvas):void {
    c.strip(c.p.tabs||[],'OrderTab');
    const w=c.inner,hero=card(c,'GuestPortrait',86);
    picture(hero,'Portrait',c.p.art||'shop-modules/guest',-w/2+44,0,60,76);
    text(hero,'Type','特殊来客',38,22,w-94,20,12,brown);
    heading(hero,'Name',c.p.actions?.length?c.p.title:'特殊来客',38,0,w-94,25,18,green);
    text(hero,'Status',c.p.actions?.length?'到店委托':'等候客人上门',38,-21,w-94,20,13,brown);
    c.startList();
    if(c.p.subtitle){section(c,'来客需求');note(c,c.p.subtitle);}
    rows(c).forEach((r,i)=>info(c,r,i));dock(c,c.p.actions||[]);
}
const modeName:Record<string,string>={public:'公开赛',private:'私人赛'};
function shows(c:PageCanvas):void {
    const v=pageVisual(c);
    const mode=c.args.mode==='private'||c.args.mode==='public'?c.args.mode:
        v.raceAccess?.public.unlocked===false?'private':'public';
    banner(c,'stage','','stage',v.pet,v.petStage);
    c.startList();
    c.strip(['public','private'].map(id=>({...act(modeName[id],'show',{mode:id}),active:id===mode})),'ContestTab');
    const gate=v.raceAccess?.[mode];
    if(gate&&!gate.unlocked)note(c,'开店第 '+v.shopDay+' 天 · '+modeName[mode]+'在开店第 '+gate.opensDay+' 天开放报名，可先查看主题。');
    const topics=rows(c).filter(r=>r.visual?.mode===mode),times=v.schedule?.[mode];
    if(v.scoringVersion===2&&mode==='public')note(c,'本地测试 · 报名费用与奖励暂沿用测试参数。');
    if(times){
        const h=times.payout?112:91,w=c.inner,n=card(c,'Schedule',h,cream,6);
        heading(n,'Theme',mode==='public'?(topics[0]?.title||'本周主题'):'本轮主题 · 三选一',-45,h/2-15,w-110,23,15,green);
        const stamp=box(n,'Kind',w/2-57,h/2-15,93,20,'#EED8AB');text(stamp,'Caption',mode==='public'?'本地模拟公开赛':'私人赛',0,0,91,20,12,brown,'center');
        const lines=[['报名截止',times.close],['结果公布',times.result],...(times.payout?[['排名奖金补差',times.payout]]:[])];
        lines.forEach(([k,value],i)=>{
            const y=h/2-35-21*i;
            text(n,'Key'+i,k,-w/4,y,w/2-20,20,12,brown);
            text(n,'Value'+i,value,w/4,y,w/2-20,20,13,ink,'right',true);
            box(n,'Rule'+i,0,y-10,w-22,1,'#DDC7A0');
        });
        text(n,'Zone','北京时间 · 同一轮只可报名一只动物',0,-h/2+10,w-20,18,12,brown);
    }
    c.startList();
    topics.forEach((r,i)=>info(c,r,i));if(!topics.length&&c.p.empty)note(c,c.p.empty);
    const actions=(c.p.actions||[]).map(a=>a.page==='show.archive'?{...a,label:'公开赛榜单'}:a);
    dock(c,actions,-1,3);
}
function awards(c:PageCanvas):void {
    if(c.key==='show.board'||c.key==='show.tier'){
        banner(c,'stage',c.key==='show.board'?'公开赛 · 奖励名单':c.p.title,'rank');
        c.startList();
        if(c.p.subtitle)note(c,c.p.subtitle);
        c.strip((c.p.actions||[]).map(a=>({...a,active:a.args?.species===(c.args.species||'rabbit')})),'Species');
        c.startList();
        const ranked=pageVisual(c).tierOptions||rows(c).filter(r=>r.art?.startsWith('awards/'));
        if(ranked.length){
            const gap=4,w=(c.inner-(ranked.length-1)*gap)/ranked.length,y=c.slot(71,10);
            ranked.forEach((r,i)=>{
                const n=frame(c.body,'Tier'+i,-c.inner/2+w/2+i*(w+gap),y,w,71,r.link?.active?'#E1E7CA':'#F4DFB1',r.link?.active?'#40634E':'#B89463');
                picture(n,'Medal',r.art!,0,14,33,33);
                text(n,'Tier',r.title,0,-8,w-3,20,12,brown,'center',true);
                text(n,'Count',r.text||'',0,-24,w-3,17,11,brown,'center');
                if(r.link)tap(n,()=>c.ui.choose(r.link!));
            });
        }
        c.startList();
        rows(c).filter(r=>!ranked.includes(r)).forEach((r,i)=>info(c,r,i));if(!rows(c).length)c.empty();
        dock(c,[act('选择其他赛期','show.archive'),act('当前赛事','show',{mode:'public'})],-1);
        return;
    }
    const w=c.inner,n=frame(c.body,'Book',0,c.slot(85,10),w,85,'#EADDBB','#A8824D');
    picture(n,'Cover','shop-modules/cup-book',-w/2+41,0,64,64);
    heading(n,'Title',c.key==='collection'?'小店的荣誉':c.p.title,38,13,w-92,31,19,green);
    text(n,'Count',c.p.subtitle||'奖杯收藏',38,-15,w-92,27,13,brown);
    if(c.key==='collection'){
        c.strip((c.p.actions||[]).map(a=>({...a,active:a.args?.mode===(c.args.mode||'private')})),'BookTab');
    }
    c.startList();
    rows(c).forEach((r,i)=>info(c,r,i,r.visual?.uncollected));if(!rows(c).length)c.empty();
    if(c.key==='collection.theme')dock(c,c.p.actions||[],-1);
}
function secondary(c:PageCanvas):void {
    const key=c.key,art=c.p.art;
    if(key==='credits'||key==='orderDesk'){banner(c,'orders','订单柜台');c.startList();}
    else if(key==='shelf'||key==='services'){
        // Closed species use the shared room-unlock layout and pricing.
        if(art==='shop-modules/lab'){
            banner(c,'lab','培育中心',key==='services'?'services':'normal');
            c.startList();thumbTabs(c,c.p.tabs||[]);
        }
    }
    if(c.p.subtitle)note(c,c.p.subtitle);
    c.startList();
    if(key==='services'){
        rows(c).forEach((r,i)=>{
            const w=c.inner,lines=(r.text||'').split('\n');
            const price=lines.length>1&&lines[lines.length-1].startsWith('每张 ')?lines.pop()!:'';
            const detail=lines.join('\n'),dh=blocks(detail,w-18,12)*17;
            const h=30+dh+4,n=card(c,'Row'+i,h,cream,5);
            picture(n,'Icon','shop-modules/'+branchArt[i],-w/2+20,h/2-15,23,23);
            const priceWidth=price?Math.min(111,w*.36):0,tw=w-45-priceWidth;
            text(n,'Title',r.title,-w/2+36+tw/2,h/2-15,tw,23,13,ink,'left',true);
            if(price)text(n,'Price',price.replace(/（原价 (\d+) 金币）/,'（原$1）'),w/2-9-priceWidth/2,h/2-15,priceWidth,22,12,brown,'right');
            text(n,'Detail',detail,0,-13,w-18,dh+2,12,brown);
        });
    }else if(key==='shelf')rows(c).forEach((r,i)=>seedRow(c,r,i));
    else rows(c).forEach((r,i)=>info(c,key==='credits'&&r.title==='已购余额'?{...r,art:'shop-modules/order-cancel'}:r,i));
    if(!rows(c).length)c.empty();
    dock(c,c.p.actions||[]);
}
export function drawBusiness(c:PageCanvas):boolean {
    switch(c.key){
        case 'orders':orders(c);break;
        case 'sale':case 'market':case 'recycle':sale(c);break;
        case 'saleQuote':quote(c);break;
        case 'litterSale':if(!c.p.actions?.some(a=>a.type==='sale.commit'))return false;
            quote(c);break;
        case 'lab':lab(c);break;
        case 'research':research(c);break;
        case 'researchNode':case 'researchTable':researchDetail(c);break;
        case 'decor':decor(c);break;
        case 'guest':visitor(c);break;
        case 'show':shows(c);break;
        case 'show.board':case 'show.tier':case 'collection':case 'collection.theme':awards(c);break;
        case 'shelf':case 'services':if(c.p.art!=='shop-modules/lab')return false;
            secondary(c);break;
        case 'credits':case 'orderDesk':secondary(c);break;
        default:return false;
    }
    return true;
}
