import { Label, Node, ScrollView, sys, UITransform } from 'cc';
import { api, connectShop, requestId, ServerError, type Args, type Choice, type Command, type LedgerPage, type ShopSnapshot, type ShopLetter } from './ShopConnection';
import { drawLedger, confirmBox, ledgerModal } from './ShopEntranceView';
import { filterMenu, prepareIllustration, type FilterField } from './LedgerCanvas';
import { accessFeature, featureFor, GameBrowserBack } from './ShopNavigation';
import { RoomFloor } from './RoomFloor';
import { drawBreedingBonus } from './RoomPresentation';
import type { AudioSetting, ShopAudio } from './ShopAudio';

interface Visit { key:string; args:Args; selected:Set<string>; offset:number; roomFloor?:RoomFloor; data?:LedgerPage; version?:number; serverClockOffset?:number; detailPage?:number; quoteNotice?:string; returnPanel?:Visit; litterBirth?:number; }
interface PageResponse { shop:ShopSnapshot; page:LedgerPage; }
interface ResponseReceipt { message:string; requestId:string; }
interface StageClock {label:Label;endsAt:number;shown:number;progress?:(seconds:number)=>void;}
interface Host {
    layer:Node; origin:string; height:()=>number; wallet:()=>ShopSnapshot;
    audio:ShopAudio;
    update:(shop:ShopSnapshot)=>void; activate:(open:boolean,keepHome?:boolean)=>void; notice:(message:string)=>void;
    readNotes:(profile:string,ids:string[])=>void;
}
const storagePrefix='petshop.command.';
const clockMs=()=>globalThis.performance?.now?.()??Date.now();
const visitNow=(visit:Visit)=>clockMs()+visit.serverClockOffset!;
function stageTime(seconds:number):string {
    const pad=(n:number)=>String(n).padStart(2,'0');
    const days=Math.floor(seconds/86400),hours=Math.floor(seconds/3600)%24,minutes=Math.floor(seconds/60)%60;
    if(days)return days+'天 '+pad(hours)+':'+pad(minutes)+':'+pad(seconds%60);
    return (hours?hours+':'+pad(minutes):String(minutes))+':'+pad(seconds%60);
}
function renderState(page?:LedgerPage):LedgerPage|undefined {
    if(page?.presentation?.kind!=='breeding')return page;
    // The breeding card draws from the deadline and parents. The API's snapshot
    // duration and summary row count down even when nothing on the card changed.
    return {...page,rows:undefined,presentation:{...page.presentation,remaining:undefined}};
}
function updateSaleNotice(visit:Visit, next:LedgerPage):void {
    if(visit.key!=='saleQuote'&&visit.key!=='litterSale')return;
    const before=visit.data?.actions?.find(choice=>choice.type==='sale.commit')?.args;
    const after=next.actions?.find(choice=>choice.type==='sale.commit')?.args;
    if(!after)return;
    if(before&&before.hash!==after.hash){
        const changed:string[]=[];
        const previousPrices=new Map<string,number>();
        before.ids.forEach((id:string,i:number)=>previousPrices.set(id,before.amounts[i]));
        for(let i=0;i<after.ids.length;i++){
            const previous=previousPrices.get(after.ids[i]);
            if(previous===undefined||previous===after.amounts[i])continue;
            const name=next.rows?.[i]?.title||'动物';
            changed.push(name+' #'+String(after.ids[i]).slice(0,6).toUpperCase()+' 从 '+previous+' 改为 '+after.amounts[i]+' 金币');
        }
        visit.quoteNotice=changed.length?changed.join('。')+'。请核对新报价。':'本房的可留种余量发生了变化，请核对当前报价。';
    }
    if(visit.quoteNotice)next.rows?.push({title:'请重新核对报价',text:visit.quoteNotice});
}
function clearLayer(n:Node):void {for(const child of [...n.children]) {child.removeFromParent();child.destroy();}}
function payment(stage:string):LedgerPage {
    const desc:Record<string,string>={start:'本地演示商品 · 店铺礼券样张',review:'展示商品确认流程，未发起付款。',processing:'模拟处理中',success:'演示成功，未发放任何游戏资产。',failed:'演示失败，未扣费。',cancel:'已取消演示。'};
    const options=stage==='start'?[['查看示意商品','review']]:stage==='review'?[['模拟提交','processing'],['取消','cancel']]:
        stage==='processing'?[['演示成功','success'],['演示失败','failed'],['取消','cancel']]:[['重新演示','start']];
    return {title:'模拟支付',subtitle:'流程演示 · 不扣费、不到账',rows:[{title:desc[stage]||desc.start}],
        actions:options.map(([label,next])=>({label,type:'ui.payment',args:{stage:next}}))};
}
export class ShopSession {
    private feature?:Visit;
    private taskReturn?:Visit;
    private panel?:Visit;
    private editDraft?:Visit;
    private navigation=0;
    private browser:GameBrowserBack;
    private scroll:ScrollView|null=null;
    private renderedVisit?:Visit;
    private confirm?:{text:string;submit:()=>void;guide:boolean};
    private bonusVisit?:Visit;
    private bonusPending?:boolean;
    private dropdown:Node|null=null;
    private serial=0;
    private busy=false;
    private receiptRoute?:{id:string;apply:()=>void|Promise<void>};
    private reading=false;
    private online=true;
    private paymentStage='start';
    private closed=false;
    private lastRead=0;
    private dismissLetter?:()=>void;
    private enteredGuideDialog='';
    private grownProfile='';
    constructor(private host:Host){
        this.browser=new GameBrowserBack(()=>this.active,()=>this.back());
    }
    get active():boolean{return !!this.feature;}
    claimDailyGift():void {
        const shop=this.host.wallet();
        if(this.active||this.closed||shop.dayClaimed)return;
        void this.commit({type:'care.checkin'},{},shop.version);
    }
    showLetter(letter:ShopLetter,dismiss:()=>void):void {
        if(this.active||this.closed)return;
        const key=letter.page.visual?.openingBooklet?'openingGuide':'visitBook';
        this.feature={key,args:{},selected:new Set(),offset:0,data:letter.page,version:this.host.wallet().version};
        if(key==='openingGuide')void prepareIllustration(key,{},letter.page);
        this.dismissLetter=dismiss;
        this.host.activate(true,key==='openingGuide');this.browser.sync();this.render(false);
    }
    private get current():Visit|undefined{return this.panel||this.feature;}
    private get stack():Visit[]{return this.feature?(this.panel?[this.feature,this.panel]:[this.feature]):[];}
    private get confirmOverModal():boolean {
        return this.panel?.key==='nutritionShop'||(this.feature?.key==='lab'&&this.panel?.key==='researchNode');
    }
    private remember():void{if(this.renderedVisit&&this.scroll?.isValid)this.renderedVisit.offset=Math.max(0,this.scroll.getScrollOffset().y);}
    private closeFilter():void {
        if(!this.dropdown)return;
        this.dropdown.removeFromParent();
        this.dropdown.destroy();
        this.dropdown=null;
    }
    private showFilter(fields:FilterField[],index:number):void {
        if(this.busy||this.confirm)return;
        this.closeFilter();
        this.scroll?.stopAutoScroll();
        this.dropdown=filterMenu(this.host.layer,fields,index,()=>this.closeFilter(),
            next=>this.showFilter(fields,next),option=>this.choose(option));
    }
    dispose():void{this.browser.dispose();this.closeFilter();this.closed=true;this.serial++;}
    async open(key:string,args:Args={}):Promise<void>{
        if(this.closed||this.confirm)return;
        const rule=this.host.wallet().featureAccess?.[accessFeature(key,args)];
        if(rule&&!rule.unlocked&&args.fromTasks!==true){this.host.notice(rule.name+'需要店铺达到 '+rule.requiredLevel+' 级。');return;}
        if(this.current?.key==='visitBook'){
            const dismiss=this.dismissLetter;this.dismissLetter=undefined;dismiss?.();
        }
        this.navigate(key,args);
        await this.read();
    }
    private navigate(key:string,args:Args):void{
        if(key==='home'){this.toHome();return;}
        this.remember();this.closeFilter();this.navigation++;
        this.bonusVisit=undefined;
        if(key==='roomRoster')key='rooms';
        if(!this.feature&&(key==='litter'||key==='pet')){
            this.navigate(key==='litter'?'breed':'rooms',{species:'rabbit'});
        }
        if(key==='sale'&&args.preselectId&&['market','recycle'].includes(args.channel))key=args.channel;
        const labPopup=this.feature?.key==='lab'&&(key==='research'||key==='recycle');
        const dest=key==='openingGuide'&&!this.feature?key:
            labPopup||(key==='checkinReceipt'&&this.feature)?undefined:featureFor(key,args);
        const visit:Visit={key,args,selected:new Set(),offset:0};
        if(key==='tasks')this.taskReturn=undefined;
        else if(dest&&this.feature?.key==='tasks')this.taskReturn=this.feature;
        if(dest){
            // A button that points back at the same section restores its selection
            // and scroll. Changed filters, columns and rooms start a fresh list.
            const existing=this.feature;
            const same=existing&&existing.key===key&&JSON.stringify(existing.args)===JSON.stringify(args);
            this.feature=same?existing:visit;
            if((key==='market'||key==='recycle')&&typeof args.preselectId==='string'){
                // An explicit dossier action selects just that individual, including on a repeat visit.
                this.feature.selected.clear();
                this.feature.selected.add(args.preselectId);
            }
            if(key==='rooms' && !this.feature.roomFloor){
                const species=args.species||'rabbit';
                this.feature.roomFloor=existing?.key==='rooms' && (existing.args.species||'rabbit')===species
                    ? existing.roomFloor : new RoomFloor(species==='rabbit');
            }
            this.panel=undefined;this.editDraft=undefined;
        }else{
            if(!this.feature)throw new Error('请先进入相应的店铺功能。');
            const prior=this.panel;
            if(key==='nutritionDetail'||key==='nutritionShop'){
                visit.returnPanel=prior?.key===key?prior.returnPanel:prior;
            }
            if(this.feature.key==='lab'){
                if(key==='researchNode')visit.returnPanel=prior?.key==='researchTable'?prior.returnPanel?.returnPanel:
                    prior?.key===key?prior.returnPanel:prior;
                if(key==='researchTable'||(key==='saleQuote'&&prior?.key==='recycle'))
                    visit.returnPanel=prior?.key===key?prior.returnPanel:prior;
            }
            if(key==='litter'){
                const source=prior?.key==='litterKeep'?prior.returnPanel:prior;
                visit.returnPanel=source?.key==='litter'?source.returnPanel:source;
            }
            if((key==='pet'||key==='litterKeep')&&prior?.key==='litter'){
                visit.returnPanel=prior;
                prior.litterBirth=prior.data?.presentation?.bornAt;
            }
            if(key==='breed'&&prior?.data?.presentation?.kind==='pairConfirm'
                &&args.mother===prior.args.mother&&args.father===prior.args.father){
                visit.detailPage=prior.detailPage;visit.offset=prior.offset;
            }
            if(prior&&['openingLitterSale','openingLitterQuote'].includes(key))visit.returnPanel=prior;
            if(key==='saleQuote'||key==='litterSale') {
                const previous=this.current;
                if(previous&&['sale','market','recycle','litterKeep'].includes(previous.key))this.editDraft=previous;
            }else{this.editDraft=undefined;}
            this.panel=visit;
        }
        if(key==='payment')this.paymentStage='start';
        this.host.activate(true,this.feature?.key==='checkinReceipt'||this.feature?.key==='openingGuide');this.browser.sync();
    }
    private toHome():void {
        this.closeFilter();
        this.navigation++;this.serial++;this.reading=false;
        this.closePanel();
        this.feature=undefined;this.taskReturn=undefined;this.bonusVisit=undefined;
        this.renderedVisit=undefined;this.scroll=null;
        this.browser.sync();clearLayer(this.host.layer);this.host.activate(false);
    }
    private closePanel():void {
        this.panel=undefined;this.confirm=undefined;this.editDraft=undefined;
    }
    back():void{
        if(this.dropdown){this.closeFilter();return;}
        if(this.bonusVisit){this.bonusVisit=undefined;this.render();return;}
        if(this.confirm&&(this.panel?.data?.presentation?.kind==='pairConfirm'||this.confirmOverModal)){
            this.confirm=undefined;this.render(false);return;
        }
        if(!this.feature)return;
        this.remember();this.navigation++;this.serial++;this.reading=false;
        if(!this.confirm&&this.panel?.returnPanel){
            this.panel=this.panel.returnPanel;this.editDraft=undefined;
        }else if(this.confirm||this.panel)this.closePanel();
        else if(this.taskReturn){this.feature=this.taskReturn;this.taskReturn=undefined;}
        else{
            const dismiss=this.dismissLetter;
            this.feature=undefined;this.dismissLetter=undefined;
            dismiss?.();
        }
        this.browser.sync();
        if(!this.current){this.scroll=null;this.renderedVisit=undefined;clearLayer(this.host.layer);this.host.activate(false);return;}
        void this.read();
    }
    private editSelection():void {
        const draft=this.editDraft;
        if(!draft||draft===this.feature){this.back();return;}
        this.remember();this.navigation++;this.panel=draft;this.editDraft=undefined;
        void this.read();
    }
    async refresh(force=false):Promise<void>{
        if(this.current&&!['visitBook','audioSettings'].includes(this.current.key)&&!this.busy&&!this.reading&&!this.confirm&&!this.dropdown&&(force||Date.now()-this.lastRead>=4500))await this.read(true);
    }
    private canRefreshDeadline(visit:Visit):boolean {
        return this.current===visit&&this.online&&!this.closed&&!this.reading&&!this.busy&&!this.confirm&&!this.dropdown;
    }
    private bindBirthCountdown(visit:Visit,label:Label,endsAt:number):void {
        let shown=-1,refreshRequested=false;
        const tick=()=>{
            const seconds=Math.max(0,Math.ceil((endsAt-visitNow(visit))/1000));
            if(seconds!==shown){
                label.string=Math.floor(seconds/60)+' 分 '+String(seconds%60).padStart(2,'0')+' 秒';
                shown=seconds;
            }
            if(seconds>0){refreshRequested=false;return;}
            if(!refreshRequested&&this.canRefreshDeadline(visit)){
                refreshRequested=true;
                void this.read(true);
            }
        };
        tick();
        label.schedule(tick,.1);
    }
    private bindRoomClocks(visit:Visit,scroll:ScrollView,clocks:StageClock[]):void {
        const roomEnd=visit.data?.presentation?.nextStageAt;
        let next=Number.isFinite(roomEnd)?roomEnd!:Infinity;
        for(const clock of clocks)next=Math.min(next,clock.endsAt);
        if(!Number.isFinite(next)||visit.serverClockOffset===undefined)return;
        let requested=false;
        const tick=()=>{
            const now=visitNow(visit);
            for(const clock of clocks){
                const seconds=Math.max(0,Math.ceil((clock.endsAt-now)/1000));
                if(seconds!==clock.shown){
                    clock.label.string=stageTime(seconds);
                    clock.shown=seconds;
                    clock.progress?.(seconds);
                }
            }
            if(now>=next&&!requested&&this.scroll===scroll&&this.canRefreshDeadline(visit)){
                requested=true;
                void this.read(true);
            }
        };
        tick();
        scroll.schedule(tick,.25);
    }
    private async read(quiet=false):Promise<void>{
        const visit=this.current;if(!visit||this.closed)return;
        const serial=++this.serial;this.reading=true;
        if(!quiet) {if(!visit.data)visit.data={title:'店铺',rows:[{title:'正在翻开账簿…'}]};this.render();}
        try {
            if(visit.key==='payment') {visit.data=payment(this.paymentStage);this.render();return;}
            if(visit.key==='audioSettings'){this.showAudioSettings(visit);return;}
            const result=await api<PageResponse>(this.host.origin,'page',{page:visit.key,args:visit.args});
            if(this.closed||serial!==this.serial)return;
            // The server holds only the latest litter. A dossier opened from an older
            // one returns to that litter's cached birth record until the player leaves.
            if(visit.litterBirth!==undefined&&visit.data?.presentation?.bornAt===visit.litterBirth
                &&result.page.presentation?.bornAt!==visit.litterBirth){
                result.page={...visit.data,subtitle:'本房已有新出生的一窝，当前显示此前查看的出生记录。',
                    actions:[{page:'litter',args:{...visit.args},label:'查看最新一窝'},
                        ...(visit.data.actions||[]).filter(a=>a.page==='rooms')]};
            }
            // A delayed response gives an older lower bound for the server clock.
            const offset=result.shop.now-clockMs();
            visit.serverClockOffset=Math.max(visit.serverClockOffset??offset,offset);
            if(!quiet)await prepareIllustration(visit.key,visit.args,result.page);
            if(this.closed||serial!==this.serial||(quiet&&this.dropdown))return;
            updateSaleNotice(visit,result.page);
            const redraw=!quiet||!this.online||JSON.stringify(renderState(visit.data))!==JSON.stringify(renderState(result.page))||result.shop.coins!==this.host.wallet().coins;
            this.online=true;this.host.update(result.shop);
            const previous=visit.data?.presentation;
            if(visit.key==='breed'&&previous?.kind==='breeding'&&previous.endsAt!==undefined&&
                result.page.presentation?.kind!=='breeding'&&result.shop.now>=previous.endsAt){
                this.host.audio.play('hatch');
            }
            const ids=new Set((result.page.rows||[]).map(r=>r.select).filter(Boolean));
            if(visit.version===undefined)for(const id of result.page.initialSelection||[]){if(ids.has(id))visit.selected.add(id);}
            visit.selected.forEach(id=>{if(!ids.has(id))visit.selected.delete(id);});
            this.remember();this.keepRoomPosition(visit,result.page);
            visit.data=result.page;visit.version=result.shop.version;
            if(redraw)this.render(false);
            if(!quiet&&result.page.readNoteIds?.length)this.host.readNotes(result.shop.profileId,result.page.readNoteIds);
        } catch(err){
            if(this.closed||serial!==this.serial||(quiet&&this.dropdown))return;
            if(err instanceof ServerError&&err.status>=400&&err.status<500){
                this.online=true;
                visit.version=undefined;
                visit.data={title:'重新核对',rows:[{title:err.message}],actions:[this.editDraft?
                    {label:'修改选择',type:'ui.editSelection'}:{label:'返回',type:'ui.back'}]};
                if(visit.quoteNotice&&visit.quoteNotice!==err.message)
                    visit.data.rows!.push({title:'此前的报价变化',text:visit.quoteNotice});
                this.render();
            } else {
                const wasOnline=this.online;this.online=false;
                if(wasOnline||!quiet){this.render();this.host.notice((err as Error).message);}
            }
        } finally {if(serial===this.serial){this.reading=false;this.lastRead=Date.now();}}
    }
    private keepRoomPosition(v:Visit,next:LedgerPage):void {
        if(v.key!=='rooms'||this.renderedVisit!==v||!this.scroll?.content||!v.offset)return;
        const petIds=(data?:LedgerPage)=>(data?.rows||[]).filter(r=>r.link?.page==='pet').map(r=>String(r.link!.args!.id));
        const before=petIds(v.data),after=petIds(next);
        if(before.length===after.length&&before.every((id,i)=>id===after[i]))return;
        const content=this.scroll.content;
        const first=content.getChildByName('Animal0');
        if(!first)return;
        const height=first.getComponent(UITransform)!.height;
        const top=-first.position.y-height/2;
        if(v.offset<top)return;
        const index=Math.min(before.length-1,Math.floor((v.offset-top)/height));
        // Anchor the first visible animal. If it left the store, keep the nearest
        // surviving row in its visual position.
        for(let distance=0;distance<before.length;distance++){
            for(const i of distance?[index+distance,index-distance]:[index]){
                if(i<0||i>=before.length)continue;
                const j=after.indexOf(before[i]);
                if(j>=0){v.offset=Math.max(0,v.offset+(j-index)*height);return;}
            }
        }
    }
    render(remember=true):void {
        const v=this.current;if(!v||!v.data)return;
        this.closeFilter();
        if(remember)this.remember();
        this.renderedVisit=undefined;this.scroll=null;
        clearLayer(this.host.layer);
        const modal=(!!this.panel||v.key==='checkinReceipt'||v.key==='openingGuide')&&ledgerModal(v.key);
        const hidePanel=!!this.confirm&&!this.confirmOverModal;
        const views=hidePanel?[v.data.presentation?.kind==='pairConfirm'?v:this.feature!]:modal?this.stack:[v];
        for(const view of views){
            if(!view.data)continue;
            const backdrop=hidePanel||view!==v;
            const profile=this.host.wallet().profileId;
            const playGrowth=!backdrop&&!!view.data.visual?.grownIds?.length&&this.grownProfile!==profile;
            if(playGrowth)this.grownProfile=profile;
            const guideDialog=view.data.visual?.guideDialog;
            const entrance=guideDialog===undefined?'':profile+':'+guideDialog+':'+!!view.data.visual?.letterOpened;
            const playEntrance=!backdrop&&!!entrance&&this.enteredGuideDialog!==entrance;
            if(playEntrance)this.enteredGuideDialog=entrance;
            const stageClocks:StageClock[]=[];
            const scroll=drawLedger(this.host.layer,view.data,this.host.height(),this.host.wallet().coins,{
                back:()=>this.back(),choose:a=>this.choose(a),openFilter:(fields,index)=>this.showFilter(fields,index),
                openBreedingBonus:()=>{
                    if(view!==this.current||this.confirm||this.busy)return;
                    this.bonusVisit=view;this.render();
                },
                bindBirthCountdown:(label,endsAt)=>this.bindBirthCountdown(view,label,endsAt),
                bindStageCountdown:(label,endsAt,progress)=>stageClocks.push({label,endsAt,shown:-1,progress}),
                selected:view.selected,offset:view.offset,roomFloor:view.roomFloor,playGrowth,
                detailPage:view.detailPage||0,turnPage:index=>{
                    if(view!==this.current||this.confirm)return;
                    view.detailPage=index;this.render(false);
                },
                toggle:id=>{
                    if(this.busy||this.confirm)return;
                    if(v.selected.has(id))v.selected.delete(id);
                    else {
                        if(v.data?.visual?.singleSelect)v.selected.clear();
                        v.selected.add(id);
                    }
                    this.render();
                }
            },view.key,view.args,{
                backdrop,modal:!backdrop&&modal,playEntrance,
                suppressGuide:!!this.confirm||this.bonusVisit===v,
                backToTasks:!backdrop&&!this.panel&&!!this.taskReturn,
                ready:view.version!==undefined||view.key==='payment',
                pending:!backdrop&&this.pending().length>0,offline:!backdrop&&!this.online&&view.key!=='payment'
            });
            if(view.key==='rooms')this.bindRoomClocks(view,scroll,stageClocks);
            if(!backdrop){this.scroll=scroll;this.renderedVisit=view;}
        }
        const confirm=this.confirm;
        if(confirm)confirmBox(this.host.layer,confirm.text,()=>{
            if(this.confirm!==confirm||this.busy)return;
            this.confirm=undefined;this.render(false);confirm.submit();
        },()=>this.back(),confirm.guide);
        if(this.bonusVisit===v){
            const toggle=v.data.actions?.find(a=>a.type==='care.toggle');
            if(v.data.presentation?.kind!=='pairConfirm'||!toggle){this.bonusVisit=undefined;return;}
            const preview=v.data.presentation.mutationPreview;
            const enabled=this.bonusPending??preview?.enabled??!toggle.args?.enabled;
            drawBreedingBonus(this.host.layer,preview,enabled,this.bonusPending!==undefined,value=>{
                if(this.busy||v.version===undefined||this.bonusVisit!==v)return;
                if(!this.online){this.host.notice('服务器未连接。请重新连接后操作。');return;}
                this.bonusPending=value;
                const version=v.version;
                this.render(false);
                // The settings window stays over this visit while the regular action and receipt are processed.
                void this.commit({...toggle,go:undefined},{...toggle.args,enabled:value},version).finally(()=>{
                    this.bonusPending=undefined;
                    if(!this.closed&&this.bonusVisit===v)this.render(false);
                });
            },()=>this.back());
        }
    }
    private showAudioSettings(visit:Visit):void{
        visit.version=this.host.wallet().version;
        const settings:{name:string;key:AudioSetting}[]=[
            {name:'背景音乐',key:'music'},{name:'游戏音效',key:'effects'},
        ];
        visit.data={title:'声音设置',actions:settings.map(({name,key})=>({
            label:name+' · '+(this.host.audio.enabled(key)?'已开启':'已关闭'),
            type:'ui.audio',args:{key},
        }))};
        this.render(false);
    }
    private choose(a:Choice):void {
        const v=this.current;if(!v||this.confirm)return;
        if(a.type==='ui.retry'){void this.read();return;}
        if(a.type==='ui.back'){this.back();return;}
        if(a.type==='ui.home'){this.toHome();return;}
        if(a.type==='ui.editSelection'){this.editSelection();return;}
        const args={...(a.args||{})};if(a.useSelection)args.ids=Array.from(v.selected);
        if(a.page){void this.open(a.page,args);return;}
        if(this.busy)return;
        if(a.type==='ui.audio'&&v.key==='audioSettings'){
            const key=a.args?.key;
            if(key==='music'||key==='effects'){
                this.host.audio.toggle(key);
                this.showAudioSettings(v);
            }
            return;
        }
        if(a.type==='ui.receipt'){void this.checkReceipt();return;}
        if(a.type==='ui.payment'){this.paymentStage=a.args!.stage;v.data=payment(this.paymentStage);this.render();return;}
        if(a.type==='ui.selectAll'){
            this.remember();v.selected.clear();if(!a.args!.clear)for(const id of a.args!.ids)v.selected.add(id);this.render();return;
        }
        if(!this.online){this.host.notice('服务器未连接。请重新连接后操作。');return;}
        if(!a.type||v.version===undefined)return;
        const agreedVersion=v.version;
        const proceed=()=>{void this.commit(a,args,agreedVersion);};
        if(a.confirm){
            this.remember();this.confirm={text:a.confirm,submit:proceed,guide:!!v.data?.guide?.target};this.render(false);
        } else proceed();
    }
    private async send(command:Command):Promise<ResponseReceipt>{
        const key=storagePrefix+command.requestId;
        sys.localStorage.setItem(key,JSON.stringify(command));
        try{
            const receipt=await api<ResponseReceipt>(this.host.origin,'action',command);
            sys.localStorage.removeItem(key);return receipt;
        }catch(e){
            if(e instanceof ServerError && e.status>0 && e.status<500)sys.localStorage.removeItem(key);
            throw e;
        }
    }
    private pending():string[] {
        const storage=sys.localStorage,keys:string[]=[];
        for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith(storagePrefix))keys.push(k);}
        return keys;
    }
    private async checkReceipt():Promise<void>{
        this.busy=true;let msg='';
        try{msg=await this.recover();}catch(err){msg=(err as Error).message;}
        finally{this.busy=false;}
        if(!this.closed){await this.read();this.host.notice(msg||'已核对经营账簿。');}
    }
    async recover():Promise<string>{
        const storage=sys.localStorage,keys=this.pending();
        let message='';
        for(const k of keys){
            const raw=storage.getItem(k);if(!raw)continue;
            let cmd:Command;try{cmd=JSON.parse(raw);}catch{continue;}
            if(cmd.profileId!==this.host.wallet().profileId)continue;
            let receipt:ResponseReceipt;
            try {receipt=await api<ResponseReceipt>(this.host.origin,'receipts/'+encodeURIComponent(cmd.requestId));}
            catch(err){if(!(err instanceof ServerError)||err.status!==404)throw err;
                try{receipt=await this.send(cmd);}
                catch(replay){
                    if(!(replay instanceof ServerError)||replay.status===0||replay.status>=500)throw replay;
                    message=replay.message;await this.finishReceipt(cmd.requestId,false);
                    continue;
                }
            }
            message=receipt.message;storage.removeItem(k);await this.finishReceipt(cmd.requestId,true);
        }
        return message;
    }
    private async finishReceipt(id:string,success:boolean):Promise<void> {
        const route=this.receiptRoute;if(route?.id!==id)return;
        this.receiptRoute=undefined;
        if(success&&!this.closed)await route.apply();
    }
    private async commit(a:Choice,args:Args,version:number):Promise<void>{
        if(this.busy)return;
        const origin=this.navigation;
        this.busy=true;this.serial++;this.reading=false;
        const command={requestId:requestId(),profileId:this.host.wallet().profileId,version,type:a.type!,args};
        let feedback='';
        try {
            const existing=await this.recover();
            if(existing){feedback=existing+' 请重新核对当前操作。';}
            else {
                // The same landing applies to an immediate response and a receipt
                // recovered after a timeout, provided the player is still here.
                this.receiptRoute={id:command.requestId,apply:async()=>{
                    if(origin!==this.navigation)return;
                    this.host.audio.transaction(command.type);
                    if(a.go==='home'){
                        const shop=await connectShop(this.host.origin);
                        if(this.closed||origin!==this.navigation)return;
                        this.host.update(shop);
                        this.toHome();
                        return;
                    }
                    if(a.type==='sale.commit'||a.type==='care.keepLitter'){
                        const parent=this.panel?.returnPanel;
                        const recycle=parent?.key==='recycle'?parent:undefined;
                        for(const id of args.ids||[])(recycle||this.feature)?.selected.delete(id);
                        this.closePanel();
                        this.panel=recycle;
                        if(a.go)this.navigate(a.go,a.goArgs||{});
                    }else if(a.type==='care.unlock'){
                        this.navigate('rooms',{species:args.species});
                        this.navigate('roomReceipt',{species:args.species});
                    }else if(a.type==='care.checkin'){
                        this.navigate('checkinReceipt',{});
                    }else if(a.type==='care.buyPet'||a.type==='care.feed'||a.type==='order.cancel'){
                        this.closePanel();
                    }else if(a.go)this.navigate(a.go,a.goArgs||{});
                }};
                feedback=(await this.send(command)).message;
                await this.finishReceipt(command.requestId,true);
            }
        } catch(e){
            feedback=(e as Error).message;
            if(e instanceof ServerError&&e.status>0&&e.status<500){
                await this.finishReceipt(command.requestId,false);
                if(a.type==='sale.commit'&&origin===this.navigation&&this.current)this.current.quoteNotice=feedback;
            }
        }
        finally{this.busy=false;}
        if(this.closed)return;
        if(this.current)await this.read();
        else{
            try{const shop=await connectShop(this.host.origin);if(!this.closed)this.host.update(shop);}
            catch{/* The normal store poll will retry the snapshot. */}
        }
        if(!this.closed&&this.current?.key!=='checkinReceipt')this.host.notice(feedback);
    }
}
