import { setTextWeight } from './ShopTypography';
import { _decorator, Component, Mask, Node, ScrollView, tween, UIOpacity, UITransform, Vec2, Vec3 } from 'cc';
import { box, caption, frame, guidePointer, lines, paper, picture, press, setSolidRect, type PageCanvas } from './LedgerCanvas';
import { claimGuideTarget, releaseGuideTarget } from './ShopNavigation';

const still=():boolean=>typeof window!=='undefined'&&!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Area {left:number;right:number;bottom:number;top:number;}
const clamp=(n:number,lo:number,hi:number):number=>Math.min(Math.max(n,lo),hi);
const shade='#111D1AA8';
const gold='#FFE19B';

function bounds(node:Node,space:UITransform,pad=0):Area {
    const ui=node.getComponent(UITransform)!;
    const left=-ui.width*ui.anchorX,bottom=-ui.height*ui.anchorY;
    const lo=space.convertToNodeSpaceAR(ui.convertToWorldSpaceAR(new Vec3(left,bottom)));
    const hi=space.convertToNodeSpaceAR(ui.convertToWorldSpaceAR(new Vec3(left+ui.width,bottom+ui.height)));
    return {left:lo.x-pad,right:hi.x+pad,bottom:lo.y-pad,top:hi.y+pad};
}

export function revealGuideTarget(target:Node,scroll:ScrollView):void {
    if(!scroll.vertical||!scroll.content||!target.isChildOf(scroll.content))return;
    const viewport=scroll.node.getComponent(UITransform)!;
    const area=bounds(target,viewport,4);
    const bottom=-viewport.height*viewport.anchorY,top=bottom+viewport.height;
    const move=area.bottom<bottom?bottom-area.bottom:area.top>top?top-area.top:0;
    if(move){
        const y=clamp(scroll.getScrollOffset().y+move,0,scroll.getMaxScrollOffset().y);
        scroll.scrollToOffset(new Vec2(0,y),0);
    }
}

@_decorator.ccclass('GuideSpotlight')
class GuideSpotlight extends Component {
    target!:Node;
    copy='';
    private reading?:Node;
    private preferBelow=false;
    private shades!:Node[];
    private border!:Node[];
    private pointer!:Node;
    private prompt?:Node;
    private promptWidth=0;
    private promptHeight=0;
    private prior:Area|null=null;
    private priorWidth=0;
    private priorHeight=0;

    setup(target:Node,copy:string,preferBelow:boolean,reading?:Node):void {
        this.target=target;
        this.copy=copy;
        this.preferBelow=preferBelow;
        this.reading=reading;
        const sides=['Top','Bottom','Left','Right'];
        this.shades=sides.map(side=>box(this.node,'Shade'+side,0,0,0,0,shade));
        this.border=sides.map(side=>box(this.node,'Border'+side,0,0,0,0,gold));
        this.pointer=guidePointer(this.node,gold);
        claimGuideTarget(this.node,target);
        this.lateUpdate();
    }

    onDestroy():void {releaseGuideTarget(this.node);}

    lateUpdate():void {
        const parent=this.node.parent;
        if(!parent||!this.target?.isValid)return;
        const ui=parent.getComponent(UITransform)!;
        const {width,height}=ui;
        const emphasis=bounds(this.target,ui,4);
        const reading=this.reading?.activeInHierarchy?bounds(this.reading,ui,4):undefined;
        const area=reading?{
            left:Math.min(emphasis.left,reading.left),right:Math.max(emphasis.right,reading.right),
            bottom:Math.min(emphasis.bottom,reading.bottom),top:Math.max(emphasis.top,reading.top),
        }:emphasis;
        let left=Math.max(-width/2,area.left),right=Math.min(width/2,area.right);
        let bottom=Math.max(-height/2,area.bottom),top=Math.min(height/2,area.top);
        for(let p=this.target.parent;p&&p!==parent;p=p.parent){
            if(!p.getComponent(Mask))continue;
            const clip=bounds(p,ui);
            left=Math.max(left,clip.left);right=Math.min(right,clip.right);
            bottom=Math.max(bottom,clip.bottom);top=Math.min(top,clip.top);
        }
        if(!this.target.activeInHierarchy||right<=left||top<=bottom){
            left=0;right=0;bottom=0;top=0;
        }
        const prior=this.prior;
        if(prior&&width===this.priorWidth&&height===this.priorHeight&&
            Math.abs(left-prior.left)<.5&&Math.abs(right-prior.right)<.5&&
            Math.abs(bottom-prior.bottom)<.5&&Math.abs(top-prior.top)<.5)return;
        this.prior={left,right,bottom,top};
        this.priorWidth=width;this.priorHeight=height;
        const focus=right>left&&top>bottom,halfW=width/2,halfH=height/2;
        const [topShade,bottomShade,leftShade,rightShade]=this.shades;
        const [topEdge,bottomEdge,leftEdge,rightEdge]=this.border;
        if(focus){
            setSolidRect(topShade,-halfW,top,width,halfH-top);
            setSolidRect(bottomShade,-halfW,-halfH,width,bottom+halfH);
            setSolidRect(leftShade,-halfW,bottom,left+halfW,top-bottom);
            setSolidRect(rightShade,right,bottom,halfW-right,top-bottom);
            const x=Math.max(left,emphasis.left)-1.5,y=Math.max(bottom,emphasis.bottom)-1.5;
            const w=Math.min(right,emphasis.right)-x+1.5,h=Math.min(top,emphasis.top)-y+1.5;
            setSolidRect(topEdge,x,y+h-3,w,3);
            setSolidRect(bottomEdge,x,y,w,3);
            setSolidRect(leftEdge,x,y+3,3,h-6);
            setSolidRect(rightEdge,x+w-3,y+3,3,h-6);
        }else{
            setSolidRect(topShade,-halfW,-halfH,width,height);
            for(const node of [bottomShade,leftShade,rightShade,...this.border])node.active=false;
        }
        this.placePrompt(width,height);
    }

    private placePrompt(width:number,height:number):void {
        const {left,right,bottom,top}=this.prior!;
        const w=Math.min(314,width-24);
        if(w!==this.promptWidth||!this.prompt){
            this.prompt?.destroy();
            const h=Math.max(49,22*lines(this.copy,w-28,15)+20);
            this.prompt=frame(this.node,'GuideNote',0,0,w,h,paper.card,'#BD9253',true);
            box(this.prompt,'Accent',-w/2+4,0,4,h-6,paper.primary);
            const text=caption(this.prompt,'Text',this.copy,3,0,w-30,h-12,15,paper.ink);
            text.lineHeight=22;
            this.promptWidth=w;this.promptHeight=h;
        }
        const gap=14,h=this.promptHeight;
        const above=height/2-top,below=bottom+height/2;
        const putAbove=this.preferBelow?below<h+gap+10&&above>below:above>=below;
        const targetX=(left+right)/2;
        const x=clamp(targetX,-width/2+w/2+12,width/2-w/2-12);
        const y=clamp(putAbove?top+gap+h/2:bottom-gap-h/2,-height/2+10+h/2,height/2-10-h/2);
        this.prompt.setPosition(x,y);
        this.pointer.active=right>left&&top>bottom;
        if(this.pointer.active){
            const arrowX=clamp(targetX,x-w/2+14,x+w/2-14);
            const edge=y+(putAbove?-h/2:h/2);
            this.pointer.setPosition(arrowX,edge+(putAbove?-4.5:4.5));
            this.pointer.setScale(1,putAbove?1:-1,1);
        }
    }
}

// This layer paints the cue; the original highlighted control handles the touch.
export function showGuideSpotlight(parent:Node,target?:Node,copy='',preferBelow=false,reading?:Node):void {
    const old=parent.getChildByName('GuideSpotlight');
    const current=old?.getComponent(GuideSpotlight);
    if(current&&current.target===target&&current.copy===copy)return;
    if(old){releaseGuideTarget(old);old.removeFromParent();old.destroy();}
    if(target&&copy){
        const node=box(parent,'GuideSpotlight',0,0,0,0);
        node.addComponent(GuideSpotlight).setup(target,copy,preferBelow,reading);
    }
}

export function guideTarget(root:Node,name:string):Node|undefined {
    if(root.name===name&&root.active)return root;
    for(const child of root.children){
        if(!child.active)continue;
        const result=guideTarget(child,name);
        if(result)return result;
    }
}

export function guideNote(c:PageCanvas):void {
    const guide=c.p.guide;
    if(!guide||guide.target||c.body.getChildByName('GuideNote'))return;
    const h=Math.max(38,lines(guide.text,c.inner-25,13)*19+15);
    const n=frame(c.body,'GuideNote',0,c.slot(h,7),c.inner,h,'#F1DFB4','#BB9C68',false);
    box(n,'Rule',-c.inner/2+2,0,3,h-2,paper.primary);
    const copy=caption(n,'Text',guide.text,2,0,c.inner-23,h-8,13,paper.ink);
    copy.lineHeight=19;
}

export function growthSpark(parent:Node,x:number,y:number):void {
    const n=picture(parent,'GrowthSpark','onboarding/growth-spark',x,y,17,17);
    if(still())return;
    const opacity=n.addComponent(UIOpacity);
    opacity.opacity=0;
    tween(n).delay(.08).to(.18,{position:new Vec3(x,y+4,0)},{
        onUpdate:(_node,ratio=0)=>{opacity.opacity=Math.round(255*ratio);},
    }).to(.68,{position:new Vec3(x,y+15,0)},{
        onUpdate:(_node,ratio=0)=>{opacity.opacity=Math.round(255*(1-ratio));},
    }).call(()=>n.destroy()).start();
}

export function guideEntrance(node:Node):void {
    if(still())return;
    const end=node.position.clone(),opacity=node.addComponent(UIOpacity);
    opacity.opacity=0;
    node.setPosition(end.x,end.y-8,end.z);
    tween(node).to(.2,{position:end},{
        easing:'quadOut',
        onUpdate:(_node,ratio=0)=>{opacity.opacity=Math.round(255*ratio);},
    }).call(()=>{opacity.opacity=255;}).start();
}

export function guideDialog(c:PageCanvas):boolean {
    const number=c.p.visual?.guideDialog,meal=c.p.visual?.tutorialMeal;
    if(number===undefined&&!meal)return false;
    if(number===0){
        const badge=frame(c.body,'LoginConfirmed',0,c.slot(51),c.inner,51,'#FDF6E7','#A38252',false);
        caption(badge,'State','店主账号   已登录',0,0,c.inner-20,38,15,paper.green,true);
    }
    if(number===1){
        if(c.p.visual?.letterOpened){
            const copy=c.p.subtitle||'',h=Math.max(110,lines(copy,c.inner-34,15)*23+34);
            const sheet=frame(c.body,'OpenedLetter',0,c.slot(h),c.inner,h,'#FFF4D6','#BA9860',true);
            const text=caption(sheet,'LetterCopy',copy,0,0,c.inner-30,h-18,15,paper.ink);
            text.lineHeight=23;
        }else picture(c.body,'HandoverEnvelope','onboarding/handover-envelope',0,c.slot(113,4),124,85);
    }
    if(meal){
        const row=c.p.rows![0],h=58;
        const n=frame(c.body,'TutorialMeal',0,c.slot(h),c.inner,h,'#E0E8CE','#75916A',false);
        picture(n,'MealIcon',row.art!,-c.inner/2+26,0,29,39);
        setTextWeight(caption(n,'Title',row.title,23,12,c.inner-64,23,15,paper.green),true);
        caption(n,'Effect',row.text!,23,-12,c.inner-64,23,13,paper.muted);
    }
    if(c.p.subtitle&&!c.p.visual?.letterOpened&&c.p.subtitle!==c.p.guide?.text){
        const h=lines(c.p.subtitle,c.inner,14)*22+6;
        caption(c.body,'GuideCopy',c.p.subtitle,0,c.slot(h,6),c.inner,h,14,paper.ink).lineHeight=22;
    }
    if(number===17)(c.p.rows||[]).forEach(c.row);
    const actions=c.p.actions||[],w=(c.inner-(actions.length-1)*6)/Math.max(actions.length,1),y=c.slot(48,3);
    actions.forEach((a,i)=>{
        const primary=i===actions.length-1;
        press(c.body,'Action'+i,a.label||'',-c.inner/2+w/2+i*(w+6),y,w,()=>c.ui.choose(a),primary);
    });
    return true;
}
