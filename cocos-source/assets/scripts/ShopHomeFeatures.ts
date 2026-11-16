import { Label, Node, UITransform } from 'cc';
import type { Args, ShopSnapshot } from './ShopConnection';
import { caption, frame, tap } from './LedgerCanvas';

interface Entrance {
    key:string;
    target:Node;
    sign:Node;
    label?:Label;
}

/** A scene prop and a shortcut can both open the same shop feature. */
export class ShopHomeFeatures {
    private entries:Entrance[]=[];
    private props=new Map<string,{ui:UITransform;sign:Node;width:number;height:number}>();

    constructor(room:Node,footer:Node,open:(key:string,args?:Args)=>void) {
        const register=(key:string,target:Node,sign:Node,args?:Args)=>{
            this.entries.push({key,target,sign});
            const choose=()=>open(key,args);
            tap(target,choose);
            if(sign!==target)tap(sign,choose);
        };
        for(const target of room.getChildByName('Entrances')!.children) {
            if(!target.name.startsWith('Hotspot_'))continue;
            const key=target.name.slice('Hotspot_'.length);
            const sign=target.getChildByName('Sign')!;
            const ui=target.getComponent(UITransform)!;
            this.props.set(key,{ui,sign,width:ui.width,height:ui.height});
            register(key,target,sign);
        }
        const roomLink=footer.getChildByName('RoomLink')!,book=footer.getChildByName('TrophyBook')!;
        register('rooms',roomLink,roomLink,{species:'rabbit'});
        register('collection',book,book);
    }

    update(shop:ShopSnapshot):void {
        for(const entry of this.entries) {
            const rule=shop.featureAccess?.[entry.key];
            entry.target.active=!!rule||entry.key==='collection'||shop.entrances.includes(entry.key);
            if(rule&&!rule.unlocked&&!entry.label) {
                const tag=frame(entry.sign,'LevelLock',0,-16,49,16,'#66513A','#BBA17A',false);
                entry.label=caption(tag,'Requirement','',0,0,47,16,11,'#FFF0CF',true);
            }
            if(entry.label) {
                entry.label.node.parent!.active=!!rule&&!rule.unlocked;
                if(rule&&!rule.unlocked)entry.label.string=rule.requiredLevel+' 级开放';
            }
        }
    }

    resize(roomScale:number,minWidth:number,minHeight:number):void {
        this.props.forEach(({ui,sign,width,height})=>{
            sign.setScale(1/roomScale,1/roomScale,1);
            ui.setContentSize(Math.max(width,minWidth),Math.max(height,minHeight));
        });
        // The room door and key share a jamb. Expand the door to its left.
        const door=this.props.get('rooms')!.ui,key=this.props.get('login')!.ui;
        const overlap=(door.width+key.width)/2-(key.node.position.x-door.node.position.x);
        door.setAnchorPoint(.5+Math.max(0,overlap)/door.width,.5);
    }
}
