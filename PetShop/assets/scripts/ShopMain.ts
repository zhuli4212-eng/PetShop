import { _decorator, Component, game, Game, EventKeyboard, input, Input, isValid, KeyCode,
    Graphics, Label, Node, screen, sys, UITransform, view } from 'cc';
import { api, connectShop, requestId, sendDeparture, type ShopSnapshot, type ShopLetter } from './ShopConnection';
import { box, caption, picture, drawConnection, guestArrival } from './ShopEntranceView';
import { ShopHomeFeatures } from './ShopHomeFeatures';
import { ShopSession } from './ShopSession';
import { ShopkeeperWalk } from './ShopkeeperWalk';
import { frame, rect, tap } from './LedgerCanvas';
import { ShopAudio } from './ShopAudio';

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
    private taskShortcut!:Node;
    private taskProgress!:Label;
    private nextTask!:Label;
    private layer!: Node;
    private state: 'connecting' | 'offline' | 'open' = 'connecting';
    private session!:ShopSession;
    private audio!:ShopAudio;
    private shop!:ShopSnapshot;
    private clientId=requestId();
    private foreground=true;
    private toast:Node|null=null;
    private hintBubble:Node|null=null;
    private keeperWalk!:ShopkeeperWalk;
    private letter:ShopLetter|null=null;
    private notesReady=false;
    private guestPopup:{id:string;node:Node;later:()=>void}|null=null;
    private readerSeq=0;
    private decorKey='';
    private lastHintAt=0;
    private pulseBusy=false;
    private pageHeight = 844;
    private features!:ShopHomeFeatures;
    private levelProgress!:Label;
    private letterShortcut!:Node;

    onLoad(): void {
        this.home = this.node.getChildByName('ShopHome')!;
        this.room = this.home.getChildByName('RoomPlane')!;
        this.header = this.home.getChildByName('Header')!;
        this.footer = this.home.getChildByName('Footer')!;
        this.layer = this.node.getChildByName('ModuleLayer')!;
        this.audio=new ShopAudio(this.node);
        this.session=new ShopSession({layer:this.layer,audio:this.audio,origin:this.serverOrigin,height:()=>this.pageHeight,
            wallet:()=>this.shop,update:shop=>this.applyShop(shop),activate:(open,keepHome)=>{
                this.home.active=!open||!!keepHome;this.layer.active=open;
                if(open){this.closeGuestPopup();this.closeKeeperNote();}
                else if(this.state==='open')this.scheduleOnce(()=>{this.showHomeNotes();void this.pulse();},0);
            },notice:text=>this.notify(text),readNotes:(profile,ids)=>this.markNotesRead(profile,ids)});
        this.home.active = false;
        this.keeperWalk=this.room.getChildByName('Keeper')!.addComponent(ShopkeeperWalk);
        this.features=new ShopHomeFeatures(this.room,(key,args)=>{
            if(this.state!=='open'||this.session.active)return;
            if(key==='profile')this.session.claimDailyGift();
            else void this.session.open(key,args);
        });
        this.levelProgress=caption(this.header,'LevelProgress','',0,-12,178,20,12,'#E8D9B2');
        for(const name of ['RoomLink','TrophyBook','Status'])this.footer.getChildByName(name)?.destroy();
        this.taskShortcut=frame(this.footer,'TaskShortcut',0,0,184,46,'#F0DCAC','#987446',false);
        this.taskProgress=caption(this.taskShortcut,'Progress','',-2,10,168,18,12,'#685035');
        this.nextTask=caption(this.taskShortcut,'NextTask','',-8,-9,156,22,14,'#29483E');
        this.nextTask.isBold=true;
        caption(this.taskShortcut,'Arrow','›',79,-5,17,29,20,'#496944',true);
        tap(this.taskShortcut,()=>{
            const next=this.shop?.taskShortcut?.choice;
            if(this.state==='open'&&!this.session.active&&next?.page)void this.session.open(next.page,next.args);
        });
        this.letterShortcut=frame(this.footer,'LetterShortcut',0,0,90,42,'#F0DCAC','#987446',false);
        caption(this.letterShortcut,'Caption','交接信',0,0,84,40,14,'#29483E',true).isBold=true;
        tap(this.letterShortcut,()=>{
            if(this.state==='open'&&!this.session.active)void this.session.open('openingGuide');
        });
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
        this.showHomeNotes();
        void this.pulse();
    }

    onDestroy():void {this.session?.dispose();this.audio?.dispose();}
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
        const y=this.pageHeight/2-headerHeight-8-ui.height/2;
        if(toast.parent!==this.node){toast.setPosition(0,y);return;}
        const scale=this.layer.scale.x;
        toast.setScale(scale,scale,1);
        toast.setPosition(this.layer.position.x,this.layer.position.y+y*scale);
    }
    private applyShop(shop:ShopSnapshot):void {
        if(this.shop&&this.shop.profileId===shop.profileId&&shop.version<this.shop.version)return;
        if(this.shop&&this.shop.profileId!==shop.profileId){
            this.letter=null;this.notesReady=false;this.closeGuestPopup();this.closeKeeperNote();
        }
        this.shop=shop;
        this.header.getChildByPath('Wallet/Value')!.getComponent(Label)!.string='金币 '+shop.coins;
        this.fitWallet(this.header.getComponent(UITransform)!.width);
        this.header.getChildByName('Title')!.getComponent(Label)!.string=shop.name==='宠物店'?'麦穗宠物店':shop.name;
        this.features.update(shop);
        const xp=shop.shopExperience;
        this.levelProgress.string=xp?'店铺 '+shop.shopLevel+' 级 · '+(xp.toNext?'经验 '+xp.intoLevel+'/'+xp.toNext:'已满级'):'';
        const tasks=shop.taskShortcut;
        this.taskShortcut.active=!!tasks;
        if(tasks){
            this.taskProgress.string='任务完成 '+tasks.completed+'/'+tasks.total;
            this.nextTask.string=tasks.choice.label||'查看任务';
        }
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
                this.closeKeeperNote();
                const bubble=box(this.keeperWalk.node,'KeeperNote',0,0,187,49,'#695332');
                this.hintBubble=bubble;
                this.keeperWalk.setSpeaking(true);
                const face=box(bubble,'Paper',0,0,183,45,'#FFF0CE');
                const text=caption(face,'Message',next.text,0,0,171,39,11,'#493A27',true);
                text.lineHeight=16;
                this.fitBubble();
                this.scheduleOnce(()=>{
                    if(this.hintBubble===bubble)this.closeKeeperNote();
                },8);
            }
        }
    }

    private poll=async ():Promise<void>=>{
        if(this.state!=='open'||!this.foreground)return;
        if(this.session.active){await this.session.refresh();return;}
        try {
            const shop=await connectShop(this.serverOrigin);
            if(this.isValid){this.applyShop(shop);this.showHomeNotes();}
        }
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
    private closeGuestPopup():void {
        this.guestPopup?.node.destroy();
        this.guestPopup=null;
    }
    private showHomeNotes():void {
        if(this.state!=='open'||!this.foreground||this.session.active)return;
        const profile=this.shop.profileId;
        const letter=this.letter;
        if(letter){
            this.session.showLetter(letter,()=>this.markNotesRead(profile,letter.ids));
            return;
        }
        const guest=this.shop.guest;
        const seenKey='petshop.seenGuest.'+profile;
        if(!this.notesReady||!guest||sys.localStorage.getItem(seenKey)===guest.id){
            this.closeGuestPopup();return;
        }
        if(this.guestPopup?.id===guest.id)return;
        this.closeGuestPopup();
        const later=()=>{
            sys.localStorage.setItem(seenKey,guest.id);
            this.closeGuestPopup();
        };
        const node=guestArrival(this.home,()=>{
            later();
            void this.session.open('guest');
        },later);
        this.guestPopup={id:guest.id,node,later};
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
            this.notesReady=true;
        }
        this.showHomeNotes();
    }
    private hideGame():void {
        this.audio?.setForeground(false);
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
        this.audio?.setForeground(true);
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
        this.header.getChildByName('Title')!.setPosition(-width/2+123,9);
        this.levelProgress.node.setPosition(-width/2+138,-13);
        this.fitWallet(width);
        this.footer.setPosition(0,-h/2+29);
        this.footer.getComponent(UITransform)!.setContentSize(width,58);
        this.taskShortcut.setPosition(-width/2+100,0);
        this.letterShortcut?.setPosition(width/2-53,0);
        this.room.setPosition(0,-3);
        this.room.setScale(roomScale, roomScale, 1);
        const sceneScale=scale*roomScale;
        this.features.resize(roomScale,48*screen.devicePixelRatio/(view.getScaleX()*sceneScale),
            48*screen.devicePixelRatio/(view.getScaleY()*sceneScale));
        this.fitBubble();
        if(paneChanged&&this.guestPopup){this.closeGuestPopup();this.showHomeNotes();}
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

    private closeKeeperNote():void {
        if(!this.hintBubble)return;
        this.hintBubble.destroy();
        this.hintBubble=null;
        this.keeperWalk.setSpeaking(false);
    }

    private fitBubble():void {
        const bubble=this.hintBubble;
        if(!bubble?.isValid)return;
        const keeper=this.keeperWalk.node,scale=this.room.scale.x;
        const roomWidth=ROOM_WIDTH*scale;
        bubble.setScale(1/scale,1/scale,1);
        const w=Math.min(187,roomWidth-16);
        const face=bubble.getChildByName('Paper')!;
        for(const [part,width,height] of [[bubble,w,49],[face,w-4,45]] as const){
            part.getComponent(UITransform)!.setContentSize(width,height);
            const g=part.getComponent(Graphics)!;
            g.clear();g.rect(-width/2,-height/2,width,height);g.fill();
        }
        face.getChildByName('Message')!.getComponent(UITransform)!.setContentSize(w-8,39);
        const edge=(roomWidth-w-16)/(2*scale);
        const x=Math.max(-edge,Math.min(edge,keeper.position.x))-keeper.position.x;
        const gap=(24.5+6)/scale;
        const art=keeper.getChildByName('Art')!,nameplate=keeper.getChildByName('Nameplate')!;
        const below=nameplate.position.y-nameplate.getComponent(UITransform)!.height/2-gap;
        const above=art.position.y+art.getComponent(UITransform)!.height/2+gap;
        const signs=this.room.getChildByName('Entrances')!.children.flatMap(entrance=>{
            const sign=entrance.getChildByName('Sign');
            return sign?.activeInHierarchy?[sign.getComponent(UITransform)!.getBoundingBoxToWorld()]:[];
        });
        const transform=bubble.getComponent(UITransform)!,worldScale=keeper.worldScale.y;
        const candidates=[below,above];
        for(const y of [below,above]){
            bubble.setPosition(x,y);
            const bounds=transform.getBoundingBoxToWorld(),direction=y===below?-1:1;
            for(const sign of signs){
                if(sign.xMax<=bounds.xMin||bounds.xMax<=sign.xMin)continue;
                const space=direction<0?bounds.yMax-sign.yMin:sign.yMax-bounds.yMin;
                if(space>0)candidates.push(y+direction*(space/worldScale+2/scale));
            }
        }
        const distance=(y:number)=>Math.min(Math.abs(y-below),Math.abs(y-above));
        const room=this.room.getComponent(UITransform)!.getBoundingBoxToWorld();
        for(const y of candidates.sort((a,b)=>distance(a)-distance(b))){
            bubble.setPosition(x,y);
            const bounds=transform.getBoundingBoxToWorld();
            if(bounds.yMin>=room.yMin&&bounds.yMax<=room.yMax&&!signs.some(sign=>bounds.intersects(sign)))return;
        }
        bubble.setPosition(x,below);
    }


    private onKey(event:EventKeyboard):void {
        if(event.keyCode!==KeyCode.ESCAPE&&event.keyCode!==KeyCode.MOBILE_BACK)return;
        if(this.session.active)this.session.back();
        else this.guestPopup?.later();
    }
    private showPage():void {
        if(this.state==='open'&&this.session.active){this.session.render();return;}
        const ready=this.state==='open';this.home.active=ready;this.layer.active=!ready;
        if(!ready){this.closeGuestPopup();this.closeKeeperNote();}
        else this.fitBubble();
        for(const child of [...this.layer.children]){child.removeFromParent();child.destroy();}
        if(!ready)drawConnection(this.layer,this.pageHeight,this.state==='offline',()=>{if(this.state==='offline')void this.openStore();});
    }
}
