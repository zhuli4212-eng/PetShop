import { Node, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { box, caption, frame, lines, paper, picture, press, type PageCanvas } from './LedgerCanvas';

const still=():boolean=>typeof window!=='undefined'&&!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function guideFocus(target:Node):void {
    if(target.getChildByName('GuideFocus'))return;
    const ui=target.getComponent(UITransform);
    if(!ui?.width||!ui.height)return;
    const x=(.5-ui.anchorX)*ui.width,y=(.5-ui.anchorY)*ui.height;
    const w=ui.width+4,h=ui.height+4;
    const ring=box(target,'GuideFocus',x,y,w,h);
    box(ring,'Top',0,h/2,w,1,'#FFE4A3');
    box(ring,'Bottom',0,-h/2,w,1,'#FFE4A3');
    box(ring,'Left',-w/2,0,1,h,'#FFE4A3');
    box(ring,'Right',w/2,0,1,h,'#FFE4A3');
    picture(ring,'Corner', 'onboarding/focus-corner',-w/2+4,h/2-4,12,12);
    picture(ring,'CornerOpposite','onboarding/focus-corner',w/2-4,-h/2+4,12,12).setRotationFromEuler(0,0,180);
    if(!still()){
        const opacity=ring.addComponent(UIOpacity);
        tween(ring).repeatForever(tween<Node>().to(.62,{}, {
            onUpdate:(_node,ratio=0)=>{opacity.opacity=Math.round(255-75*ratio);},
        }).to(.62,{}, {
            onUpdate:(_node,ratio=0)=>{opacity.opacity=Math.round(180+75*ratio);},
        })).start();
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
    if(!guide||c.body.getChildByName('GuideNote'))return;
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
    if(number===1)picture(c.body,'HandoverEnvelope','onboarding/handover-envelope',0,c.slot(113,4),124,85);
    if(meal){
        const row=c.p.rows![0],h=58;
        const n=frame(c.body,'TutorialMeal',0,c.slot(h),c.inner,h,'#E0E8CE','#75916A',false);
        picture(n,'MealIcon',row.art!,-c.inner/2+26,0,29,39);
        caption(n,'Title',row.title,23,12,c.inner-64,23,15,paper.green).isBold=true;
        caption(n,'Effect',row.text!,23,-12,c.inner-64,23,13,paper.muted);
    }
    if(c.p.subtitle){
        const h=lines(c.p.subtitle,c.inner,14)*22+6;
        caption(c.body,'GuideCopy',c.p.subtitle,0,c.slot(h,6),c.inner,h,14,paper.ink).lineHeight=22;
    }
    if(number===17)(c.p.rows||[]).forEach(c.row);
    const actions=c.p.actions||[],w=(c.inner-(actions.length-1)*6)/Math.max(actions.length,1),y=c.slot(48,3);
    actions.forEach((a,i)=>{
        const primary=i===actions.length-1;
        const button=press(c.body,'Action'+i,a.label||'',-c.inner/2+w/2+i*(w+6),y,w,()=>c.ui.choose(a),primary);
        if(primary)guideFocus(button);
    });
    return true;
}
