import { Label, Node, UITransform } from 'cc';
import type { Args, ShopSnapshot } from './ShopConnection';
import { caption, frame, picture, tap } from './LedgerCanvas';

interface Entrance {
    key:string;
    target:Node;
    sign:Node;
    label?:Label;
}

/** Scene props open shop features. */
export class ShopHomeFeatures {
    private entries:Entrance[]=[];
    private props=new Map<string,{ui:UITransform;sign:Node;width:number;height:number}>();

    constructor(room:Node,open:(key:string,args?:Args)=>void) {
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
            let height=ui.height;
            if(key==='profile'){
                const gift=target.getChildByName('GiftArt')!;
                const artHeight=gift.getComponent(UITransform)!.height;
                const {x,y,z}=gift.position,scale=1.5;
                gift.setScale(scale,scale,1);
                gift.setPosition(x,y+artHeight*(scale-1)/2,z);
                height=Math.max(height,2*gift.position.y+artHeight*scale);
            }
            this.props.set(key,{ui,sign,width:ui.width,height});
            register(key,target,sign);
        }
    }

    update(shop:ShopSnapshot):void {
        for(const entry of this.entries) {
            const rule=shop.featureAccess?.[entry.key];
            entry.target.active=entry.key==='tasks'||!!rule||entry.key==='collection'||shop.entrances.includes(entry.key);
            if(entry.key==='profile'&&(shop.dayClaimed||shop.onboarding))entry.target.active=false;
            if(rule&&!rule.unlocked&&!entry.label) {
                const tag=frame(entry.sign,'LevelLock',0,-16,64,17,'#66513A','#BBA17A',false);
                picture(tag,'LockIcon','shop-modules/node-lock',-23,0,13,13);
                entry.label=caption(tag,'Requirement','',7,0,47,16,11,'#FFF0CF',true);
            }
            if(entry.label) {
                entry.label.node.parent!.active=!!rule&&!rule.unlocked;
                if(rule&&!rule.unlocked){
                    entry.label.string=rule.requiredLevel+' 级开放';
                }
            }
        }
    }

    signFor(key:string):Node|undefined {return this.props.get(key)?.sign;}

    resize(roomScale:number,minWidth:number,minHeight:number):void {
        this.props.forEach(({ui,sign,width,height})=>{
            sign.setScale(1/roomScale,1/roomScale,1);
            ui.setContentSize(Math.max(width,minWidth),Math.max(height,minHeight));
        });
        // The room door and key share a jamb. Expand the door to its left.
        const door=this.props.get('rooms')!.ui,key=this.props.get('login')!.ui;
        const overlap=(door.width+key.width)/2-(key.node.position.x-door.node.position.x);
        door.setAnchorPoint(.5+Math.max(0,overlap)/door.width,.5);
        // Keep the two stacked doors of the awards cabinet independently tappable.
        const upper=this.props.get('show')!.ui,lower=this.props.get('collection')!.ui;
        const stacked=(upper.height+lower.height)/2-(upper.node.position.y-lower.node.position.y);
        lower.setAnchorPoint(.5,.5+Math.max(0,stacked)/lower.height);
    }
}
