import { _decorator, Component, game, Game, EventKeyboard, input, Input, isValid, KeyCode,
    Graphics, Label, Node, screen, sys, UITransform, view } from 'cc';
import { api, connectShop, requestId, sendDeparture, type ShopSnapshot, type ShopLetter } from './ShopConnection';
import { box, caption, picture, drawConnection } from './ShopEntranceView';
import { ShopHomeFeatures } from './ShopHomeFeatures';
import { ShopSession } from './ShopSession';
import { ShopkeeperWalk } from './ShopkeeperWalk';
import { rect } from './LedgerCanvas';

const { ccclass, property } = _decorator;
const ROOM_WIDTH = 390;
const ROOM_HEIGHT = 682.5;
interface WeChatMenu {
    getMenuButtonBoundingClientRect?: () => { bottom: number };
    getWindowInfo?: () => { windowHeight: number };
}

@ccclass('ShopMain')
export class ShopMain extends Component {
    @property({
        displayName: '店铺服务器地址',
        tooltip: '留空时编辑器预览连接本机，Web 构建使用游戏同源服务。局域网或微信小游戏可填写完整的服务地址。',
    })
    serverOrigin = '';

    private home!: Node;
    private room!: Node;
    private header!: Node;
    private footer!: Node;
    private roomLink!: Node;
    private collectionLink!: Node;
    private layer!: Node;
    private state: 'connecting' | 'offline' | 'open' = 'connecting';
    private session!:ShopSession;
    private shop!:ShopSnapshot;
    private clientId=requestId();
    private foreground=true;
    private toast:Node|null=null;
    private hintBubble:Node|null=null;
    private letter:ShopLetter|null=null;
    private readerSeq=0;
    private decorKey='';
    private lastHintAt=0;
    private pulseBusy=false;
    private pageHeight = 844;
    private features!:ShopHomeFeatures;
    private levelProgress!:Label;

    onLoad(): void {
        this.home = this.node.getChildByName('ShopHome')!;
        this.room = this.home.getChildByName('RoomPlane')!;
        this.header = this.home.getChildByName('Header')!;
        this.footer = this.home.getChildByName('Footer')!;
        this.layer = this.node.getChildByName('ModuleLayer')!;
        this.session=new ShopSession({layer:this.layer,origin:this.serverOrigin,height:()=>this.pageHeight,
            wallet:()=>this.shop,update:shop=>this.applyShop(shop),activate:open=>{
                this.home.active=!open;this.layer.active=open;
                if(!open&&this.state==='open')this.scheduleOnce(()=>{this.showLetter();void this.pulse();},0);
            },notice:text=>this.notify(text),readNotes:(profile,ids)=>this.markNotesRead(profile,ids)});
        this.home.active = false;
        this.room.getChildByName('Keeper')!.addComponent(ShopkeeperWalk);
        this.features=new ShopHomeFeatures(this.room,this.footer,(key,args)=>{
            if(this.state==='open'&&!this.session.active)void this.session.open(key,args);
        });
        this.levelProgress=caption(this.header,'LevelProgress','',0,-12,178,20,12,'#E8D9B2');
        this.roomLink=this.footer.getChildByName('RoomLink')!;
        this.collectionLink=this.footer.getChildByName('TrophyBook')!;
        this.layout();
        this.schedule(this.poll,5);
        this.schedule(this.pulse,20);
        void this.openStore();
    }

    onEnable(): void {
        this.node.on(Node.EventType.SIZE_CHANGED, this.layout, this);
        view.on('canvas-resize', this.layout, this);
        game.on(Game.EVENT_HIDE,this.hideGame,this);
        game.on(Game.EVENT_SHOW,this.showGame,this);
        if(typeof window!=='undefined')window.addEventListener('pagehide',this.pageExit);
        input.on(Input.EventType.KEY_DOWN, this.onKey, this);
    }

    onDisable(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this.layout, this);
        view.off('canvas-resize', this.layout, this);
        game.off(Game.EVENT_HIDE,this.hideGame,this);
        game.off(Game.EVENT_SHOW,this.showGame,this);
        if(typeof window!=='undefined')window.removeEventListener('pagehide',this.pageExit);
        input.off(Input.EventType.KEY_DOWN, this.onKey, this);
    }

    private async openStore(): Promise<void> {
        this.state = 'connecting';
        this.showPage();
        let shop: ShopSnapshot;
        try {
            shop = await connectShop(this.serverOrigin);
        } catch {
            if (!isValid(this, true)) return;
            this.state = 'offline';
            this.showPage();
            return;
        }
        if (!isValid(this, true)) return;
        this.applyShop(shop);
        this.state = 'open';this.showPage();
        try {const msg=await this.session.recover();if(msg){this.applyShop(await connectShop(this.serverOrigin));this.notify(msg);}}
        catch {this.notify('上次请求尚待确认，重连后会核对原回执。');}
        void this.pulse();
    }

    onDestroy():void {this.session?.dispose();}
    private notify(message:string):void {
        if(!message||!this.node.isValid)return;
        if(this.toast){this.toast.removeFromParent();this.toast.destroy();}
        const toast=box(this.node,'Feedback',0,0,0,57);
        toast.addComponent(Graphics);
        caption(toast,'Message',message,0,0,1,51,15,'#FFF0C8',true);
        this.toast=toast;
        this.layoutToast();
        this.scheduleOnce(()=>{if(toast.isValid)toast.destroy();if(this.toast===toast)this.toast=null;},3);
    }
    private layoutToast():void {
        const toast=this.toast;
        if(!toast?.isValid)return;
        const ui=toast.getComponent(UITransform)!;
        const width=Math.min(350,this.layer.getComponent(UITransform)!.width-24);
        if(ui.width!==width){
            ui.setContentSize(width,ui.height);
            const g=toast.getComponent(Graphics)!;
            g.clear();
            rect(g,-width/2,-ui.height/2,width,ui.height,'#2B4D42');
            toast.getChildByName('Message')!.getComponent(UITransform)!.setContentSize(width-20,51);
        }
        const headerHeight=this.header.getComponent(UITransform)!.height;
        const scale=this.layer.scale.x;
        toast.setScale(scale,scale,1);
        toast.setPosition(this.layer.position.x,this.layer.position.y+(this.pageHeight/2-headerHeight-8-ui.height/2)*scale);
    }
    private applyShop(shop:ShopSnapshot):void {
        if(this.shop&&this.shop.profileId===shop.profileId&&shop.version<this.shop.version)return;
        if(this.shop&&this.shop.profileId!==shop.profileId)this.letter=null;
        this.shop=shop;
        this.header.getChildByPath('Wallet/Value')!.getComponent(Label)!.string='金币 '+shop.coins;
        this.fitWallet(this.header.getComponent(UITransform)!.width);
        this.header.getChildByName('Title')!.getComponent(Label)!.string=shop.name;
        this.features.update(shop);
        const xp=shop.shopExperience;
        this.levelProgress.string=xp?'店铺 '+shop.shopLevel+' 级 · '+(xp.toNext?'经验 '+xp.intoLevel+'/'+xp.toNext:'已满级'):'';
        const status=this.footer.getChildByName('Status')?.getComponent(Label);
        if(status)status.string=shop.dayClaimed?'今日已签到':'今日签到待领取';
        const decor=(shop.decor||[]).join(',');
        if(this.decorKey!==decor){
            this.decorKey=decor;
            let items=this.room.getChildByName('Furnishings');
            if(!items){items=box(this.room,'Furnishings',0,0,390,682.5);items.setSiblingIndex(1);}
            for(const child of [...items.children]){child.removeFromParent();child.destroy();}
            const positions:Record<string,number[]>={fence:[-65,-278,86,60],lamp:[68,-273,51,81],plant:[-150,-208,66,75],rug:[3,-205,125,62]};
            for(const key of shop.decor){const v=positions[key];if(v)picture(items,key,'decor/'+key,v[0],v[1],v[2],v[3]);}
        }
        if(!this.letter&&!this.session.active && this.foreground && Date.now()-this.lastHintAt>=60000 && shop.hints?.length){
            const k='petshop.hints.'+shop.profileId;
            const seen=String(sys.localStorage.getItem(k)||'').split('|').filter(Boolean);
            const next=shop.hints.find(h=>!seen.includes(h.id));
            if(next){
                this.lastHintAt=Date.now();sys.localStorage.setItem(k,[...seen.slice(-95),next.id].join('|'));
                const bubble=box(this.room,'KeeperNote',0,0,187,49,'#695332');
                this.hintBubble=bubble;
                const face=box(bubble,'Paper',0,0,183,45,'#FFF0CE');
                const text=caption(face,'Message',next.text,0,0,171,39,11,'#493A27',true);
                text.lineHeight=16;
                this.fitBubble();
                this.scheduleOnce(()=>{
                    if(this.hintBubble===bubble)this.hintBubble=null;
                    if(bubble.isValid)bubble.destroy();
                },8);
            }
        }
    }
    private poll=async ():Promise<void>=>{
        if(this.state!=='open'||!this.foreground)return;
        if(this.session.active){await this.session.refresh();return;}
        try {const shop=await connectShop(this.serverOrigin);if(this.isValid)this.applyShop(shop);}
        catch{if(this.isValid&&!this.session.active){this.state='offline';this.showPage();}}
    };
    private pulse=async ():Promise<void>=>{
        if(this.state!=='open'||this.pulseBusy||!this.foreground)return;
        this.pulseBusy=true;
        try {await this.readerHeartbeat(true);}
        catch {/* 普通页面刷新负责显示断线状态。 */}finally{this.pulseBusy=false;}
    };
    private readIds(profile:string):string[] {
        const stored=sys.localStorage.getItem('petshop.readNotes.'+profile);
        if(!stored)return [];
        try {const ids:unknown=JSON.parse(stored);return Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[];}
        catch{return [];}
    }
    private showLetter():void {
        const letter=this.letter;
        if(!letter||this.state!=='open'||!this.foreground||this.session.active)return;
        const profile=this.shop.profileId;
        this.session.showLetter(letter,()=>this.markNotesRead(profile,letter.ids));
    }
    private markNotesRead(profile:string,ids:string[]):void {
        const read=new Set([...this.readIds(profile),...ids]);
        sys.localStorage.setItem('petshop.readNotes.'+profile,JSON.stringify(Array.from(read)));
        if(this.shop.profileId===profile&&this.letter?.ids.some(id=>read.has(id)))this.letter=null;
        void this.pulse();
    }
    private async readerHeartbeat(foreground:boolean):Promise<void> {
        const profileId=this.shop.profileId,seq=++this.readerSeq,read=this.readIds(profileId);
        const shop=await api<ShopSnapshot>(this.serverOrigin,'heartbeat',{
            clientId:this.clientId,foreground,reader:{profileId,seq,read}
        });
        if(!this.isValid||profileId!==this.shop.profileId||seq!==this.readerSeq)return;
        const outstanding=this.readIds(profileId).filter(id=>!read.includes(id));
        sys.localStorage.setItem('petshop.readNotes.'+profileId,JSON.stringify(outstanding));
        if(!foreground||!this.foreground)return;
        this.applyShop(shop);
        if(shop.letter!==undefined){
            this.letter=shop.letter?.ids.some(id=>outstanding.includes(id))?null:shop.letter;
            this.showLetter();
        }
    }
    private hideGame():void {
        this.foreground=false;if(this.state==='open')void this.readerHeartbeat(false).catch(()=>{});
    }
    private pageExit=():void=>{
        if(this.state!=='open')return;
        this.foreground=false;
        const profileId=this.shop.profileId;
        sendDeparture(this.serverOrigin,{clientId:this.clientId,foreground:false,
            reader:{profileId,seq:++this.readerSeq,read:this.readIds(profileId)}});
    };
    private showGame():void {
        this.foreground=true;void this.pulse();
        if(this.session?.active&&this.state==='open')void this.session.refresh(true);
        else void this.poll();
    }

    private layout(): void {
        const visible = view.getVisibleSize();
        const safe = sys.getSafeAreaRect(false);
        if (visible.width <= 0 || visible.height <= 0 || safe.width <= 0 || safe.height <= 0) return;
        // The WeChat capsule sits inside the OS safe area and can cover the right-hand wallet.
        const wx = (globalThis as typeof globalThis & { wx?: WeChatMenu }).wx;
        const capsuleBottom = wx?.getMenuButtonBoundingClientRect?.().bottom || 0;
        const windowHeight = wx?.getWindowInfo?.().windowHeight || 0;
        const safeTop = windowHeight && capsuleBottom > 0
            ? Math.min(safe.y + safe.height, visible.height * (1 - (capsuleBottom + 4) / windowHeight))
            : safe.y + safe.height;
        const usableHeight = safeTop - safe.y;
        if (usableHeight <= 0) return;
        // Creator uses a fixed-width design canvas. Recover logical display pixels before
        // laying out text and controls, then fit only the illustrated room to its space.
        const scale = screen.devicePixelRatio / view.getScaleX();
        if (!Number.isFinite(scale) || scale <= 0) return;
        const safeWidth = safe.width / scale;
        const desktop = safeWidth >= 641;
        const width = Math.min(safeWidth, desktop ? 390 : 430);
        const h = Math.min(usableHeight / scale, desktop ? 844 : Infinity);
        const x = safe.x + safe.width / 2 - visible.width / 2;
        const y = safe.y + usableHeight / 2 - visible.height / 2;
        const paneChanged = Math.abs(this.pageHeight-h)>.5 || Math.abs(this.layer.getComponent(UITransform)!.width-width)>.5;
        this.pageHeight = h;
        for (const n of [this.home, this.layer]) {
            n.setScale(scale, scale, 1);
            n.setPosition(x, y);
            n.getComponent(UITransform)!.setContentSize(width, h);
        }
        const roomScale=Math.min(width/ROOM_WIDTH,Math.max(1,h-64-58)/ROOM_HEIGHT);
        this.header.setPosition(0,h/2-32);
        this.header.getComponent(UITransform)!.setContentSize(width,64);
        this.layoutToast();
        for(const name of ['TopRule','BottomRule']){
            const line=this.header.getChildByName(name)!.getComponent(UITransform)!;
            line.setContentSize(width,line.height);
        }
        this.header.getChildByName('Title')!.setPosition(-width/2+87,9);
        this.levelProgress.node.setPosition(-width/2+138,-13);
        this.fitWallet(width);
        this.footer.setPosition(0,-h/2+29);
        this.footer.getComponent(UITransform)!.setContentSize(width,58);
        this.footer.getChildByName('Status')!.setPosition(-width/2+97,13);
        this.roomLink.setPosition(width/2-46,0);
        this.collectionLink.setPosition(width/2-129,0);
        this.room.setPosition(0,-3);
        this.room.setScale(roomScale, roomScale, 1);
        this.fitBubble();
        const sceneScale=scale*roomScale;
        this.features.resize(roomScale,48*screen.devicePixelRatio/(view.getScaleX()*sceneScale),
            48*screen.devicePixelRatio/(view.getScaleY()*sceneScale));
        if (paneChanged && this.layer.active) this.showPage();
    }

    private fitWallet(width:number):void {
        const wallet=this.header.getChildByName('Wallet')!;
        const value=wallet.getChildByName('Value')!;
        const digits=String(this.shop?.coins??680).length;
        const w=74+Math.max(0,digits-3)*9;
        wallet.setPosition(width/2-12-w/2,0);
        wallet.getComponent(UITransform)!.setContentSize(w,28);
        wallet.getChildByName('Face')!.getComponent(UITransform)!.setContentSize(w-2,26);
        value.getComponent(UITransform)!.setContentSize(w-6,24);
    }

    private fitBubble():void {
        const bubble=this.hintBubble;
        if(!bubble?.isValid)return;
        const scale=this.room.scale.x;
        const roomWidth=ROOM_WIDTH*scale;
        const compact=roomWidth<340;
        bubble.setParent(compact?this.room:this.room.getChildByName('Keeper')!);
        if(compact)bubble.setSiblingIndex(this.room.getChildByName('Entrances')!.getSiblingIndex());
        bubble.setScale(1/scale,1/scale,1);
        // The lab and market signs narrow the aisle on a short screen. Size the note to
        // that gap and keep it below the keeper without covering the signs or the face.
        const atMat=roomWidth<245;
        const w=compact&&!atMat?Math.min(187,Math.floor(roomWidth*.652-58)):187;
        const face=bubble.getChildByName('Paper')!;
        for(const [part,width,height] of [[bubble,w,49],[face,w-4,45]] as const){
            part.getComponent(UITransform)!.setContentSize(width,height);
            const g=part.getComponent(Graphics)!;
            g.clear();g.rect(-width/2,-height/2,width,height);g.fill();
        }
        face.getChildByName('Message')!.getComponent(UITransform)!.setContentSize(w-8,39);
        const y=atMat?-.4*ROOM_HEIGHT:.06*ROOM_HEIGHT-24.5/scale;
        bubble.setPosition(0,compact?y:-24.5/scale);
    }


    private onKey(event:EventKeyboard):void {
        if(this.session.active&&(event.keyCode===KeyCode.ESCAPE||event.keyCode===KeyCode.MOBILE_BACK))this.session.back();
    }
    private showPage():void {
        if(this.state==='open'&&this.session.active){this.session.render();return;}
        const ready=this.state==='open';this.home.active=ready;this.layer.active=!ready;
        for(const child of [...this.layer.children]){child.removeFromParent();child.destroy();}
        if(!ready)drawConnection(this.layer,this.pageHeight,this.state==='offline',()=>{if(this.state==='offline')void this.openStore();});
    }
}
