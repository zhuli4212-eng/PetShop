import { BlockInputEvents, Color, EventTouch, Graphics, isValid, Label, Node, resources, Sprite, SpriteFrame, UITransform, Vec3 } from 'cc';
import type { Args, Choice, LedgerPage, LedgerRow } from './ShopConnection';

export const paper = {
    ink: '#443A29', muted: '#6C5E46', page: '#F6E9CB', card: '#FFF1D2',
    green: '#285449', primary: '#365F4A', cream: '#F9E6B4', brass: '#C6A571',
};

export interface LedgerUI {
    back: () => void;
    choose: (choice: Choice) => void;
    bindBirthCountdown: (label: Label, endsAt: number) => void;
    openFilter: (fields: FilterField[], index: number) => void;
    toggle: (id: string) => void;
    selected: Set<string>;
    offset: number;
    detailPage: number;
    turnPage: (index:number) => void;
}

export interface FilterField { anchor: Node; options: Choice[]; }

export interface PageCanvas {
    key: string; args: Args; p: LedgerPage; body: Node; width: number; inner: number; ui: LedgerUI;
    slot(height: number, gap?: number): number;
    /** Everything drawn so far may stay above the scrolling list. Short screens use an earlier boundary. */
    startList(): void;
    /** Keep all subsequent controls below the list viewport. */
    startFooter(): void;
    strip(items: Choice[], name: string): void;
    row(row: LedgerRow, index: number): void;
    action(choice: Choice, index: number): void;
    actions(choices: Choice[], columns?: number): void;
    selection(): void;
    empty(): void;
}

export function box(parent: Node, name: string, x: number, y: number, w: number, h: number, fill?: string): Node {
    const n = new Node(name);
    n.layer = parent.layer;
    parent.addChild(n);
    n.setPosition(x, y);
    n.addComponent(UITransform).setContentSize(w, h);
    if (fill) {
        const g = n.addComponent(Graphics);
        rect(g, -w/2, -h/2, w, h, fill);
    }
    return n;
}

export function rect(g: Graphics, x: number, y: number, w: number, h: number, fill: string): void {
    g.fillColor = new Color().fromHEX(fill);
    g.rect(x, y, w, h);
    g.fill();
}

export function frame(parent: Node, name: string, x: number, y: number, w: number, h: number, fill: string,
                      edge = paper.brass, shadow = true): Node {
    const n = box(parent, name, x, y, w, h);
    const g = n.addComponent(Graphics);
    if (shadow) rect(g, -w/2, -h/2-2, w, h, '#C5A872');
    rect(g, -w/2, -h/2, w, h, edge);
    rect(g, -w/2+1, -h/2+1, w-2, h-2, fill);
    return n;
}

export function caption(parent: Node, name: string, value: string, x: number, y: number, w: number, h: number,
                        size: number, color: string, center = false): Label {
    const n = box(parent, name, x, y, w, h);
    const l = n.addComponent(Label);
    l.useSystemFont = true;
    l.fontFamily = 'Microsoft YaHei, PingFang SC, sans-serif';
    l.string = String(value);
    l.fontSize = size;
    l.lineHeight = Math.round(size * 1.45);
    l.color = new Color().fromHEX(color);
    l.horizontalAlign = center ? Label.HorizontalAlign.CENTER : Label.HorizontalAlign.LEFT;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    l.overflow = Label.Overflow.SHRINK;
    l.enableWrapText = true;
    return l;
}

export function heading(parent: Node, name: string, value: string, x: number, y: number, w: number, h: number,
                        size: number, color: string, center = false): Label {
    const l = caption(parent, name, value, x, y, w, h, size, color, center);
    l.fontFamily = 'SimSun, Songti SC, serif';
    l.isBold = true;
    l.lineHeight = Math.ceil(size * 1.3);
    return l;
}

export function tap(n: Node, fn: () => void): void {
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
        const a = e.getUIStartLocation(), b = e.getUILocation();
        if (Math.hypot(a.x-b.x, a.y-b.y) > 14) return;
        e.propagationStopped = true;
        fn();
    });
}

export function press(parent: Node, name: string, title: string, x: number, y: number, w: number, fn: () => void,
                      primary = false, disabled = false, h = 48): Node {
    const edge = disabled ? '#ABA58F' : primary ? '#254536' : '#A38252';
    const fill = disabled ? '#D7CFB7' : primary ? paper.primary : '#F0D6A3';
    const n = frame(parent, name, x, y, w, h, fill, edge, false);
    const g = n.getComponent(Graphics)!;
    if (!disabled) {
        rect(g, -w/2+1, h/2-2, w-2, 1, primary ? '#77936C' : '#FFF0D0');
        rect(g, -w/2, -h/2-1, w, 1, edge);
    }
    const l = caption(n, 'Caption', title, 0, 0, w-8, h-4, 14, disabled ? '#706E5F' : primary ? '#FFF0C8' : paper.ink, true);
    l.isBold = true;
    if (!disabled) tap(n, fn);
    return n;
}

/** Attach to the screen so its paper and touch targets stay outside the list's scrolling mask. */
export function filterMenu(parent:Node,fields:FilterField[],index:number,close:()=>void,
                           switchField:(index:number)=>void,choose:(option:Choice)=>void):Node {
    const bounds=parent.getComponent(UITransform)!;
    const overlay=box(parent,'FilterMenu',0,0,bounds.width,bounds.height);
    tap(overlay,close);
    overlay.addComponent(BlockInputEvents);
    const anchors=fields.map(({anchor},i)=>{
        const transform=anchor.getComponent(UITransform)!;
        const corner=(sign:number)=>bounds.convertToNodeSpaceAR(transform.convertToWorldSpaceAR(
            new Vec3(sign*transform.width/2,sign*transform.height/2,0)));
        const lo=corner(-1),hi=corner(1);
        const x=(hi.x+lo.x)/2;
        const trigger=box(overlay,'FilterToggle'+i,x,(lo.y+hi.y)/2,hi.x-lo.x,hi.y-lo.y);
        tap(trigger,()=>i===index?close():switchField(i));
        return {x,width:hi.x-lo.x,top:hi.y,bottom:lo.y};
    });
    const anchor=anchors[index],options=fields[index].options;
    const margin=4,top=bounds.height/2-margin,bottom=-top;
    const rowHeight=Math.min(44,(top-bottom-4)/options.length);
    const height=rowHeight*options.length+4;
    const below=anchor.bottom-margin,above=anchor.top+margin;
    const opensDown=below-bottom>=height||below-bottom>=top-above;
    const y=Math.min(top-height/2,Math.max(bottom+height/2,opensDown?below-height/2:above+height/2));
    const panel=frame(overlay,'Options',anchor.x,y,anchor.width,height,'#FFF1D2','#8F704C');
    options.forEach((option,i)=>{
        const width=anchor.width-4;
        const entry=box(panel,'Option'+i,0,height/2-2-rowHeight*(i+.5),width,rowHeight,option.active?'#DFE8CC':'#FFF1D2');
        if(i>0)box(entry,'Rule',0,rowHeight/2-.5,width,1,'#D8C29A');
        caption(entry,'Caption',option.label||'',-7,0,width-32,rowHeight-3,14,option.active?paper.green:paper.ink).isBold=!!option.active;
        if(option.active)caption(entry,'Mark','✓',width/2-15,0,20,rowHeight-3,14,paper.green,true);
        tap(entry,()=>{close();if(!option.active)choose({...option,replace:true});});
    });
    return overlay;
}

export function picture(parent: Node, name: string, art: string, x: number, y: number, w: number, h: number,
                        stage = ''): Node {
    const n = box(parent, name, x, y, 1, 1);
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    const apply = (image: SpriteFrame) => {
        if (!isValid(n, true)) return;
        sp.spriteFrame = image;
        const {width, height} = image.originalSize;
        const scale = Math.min(w/width, h/height);
        n.getComponent(UITransform)!.setContentSize(width*scale, height*scale);
        if (stage === '已故') { sp.grayscale = true; sp.color = new Color(190,184,175,220); }
    };
    const path=art+'/spriteFrame';
    const cached=resources.get(path,SpriteFrame);
    if(cached) apply(cached);
    else resources.load(path,SpriteFrame,(err,image)=>{if(!err&&image)apply(image);});
    return n;
}

// Bring the illustrated counter into view together with its controls on the first visit.
// A prefetched sprite frame can also be assigned synchronously when revisiting the page.
export async function prepareIllustration(key:string, args:Args, page:LedgerPage):Promise<void> {
    const counters:Record<string,string>={
        lab:'lab',research:'lab',market:'market',orders:'orders',credits:'orders',orderDesk:'orders',
        recycle:'lab',show:'stage','show.board':'stage','show.tier':'stage'
    };
    const counter=counters[key==='sale'?String(args.channel):key] || (key==='sale'&&args.channel==='order'?'orders':'');
    const paths=new Set<string>();
    if(page.art)paths.add(page.art);
    if(counter)paths.add('shop-modules/'+counter);
    await Promise.all(Array.from(paths,art=>{
        const path=art+'/spriteFrame';
        if(resources.get(path,SpriteFrame))return;
        return new Promise<void>(resolve=>resources.load(path,SpriteFrame,()=>resolve()));
    }));
}

export function lines(value: string, width: number, size: number): number {
    return String(value).split('\n').reduce((total, line) => {
        const em = Array.from(line).reduce((sum, c) => sum + (c.charCodeAt(0)<128 ? 0.58 : 1), 0);
        return total + Math.max(1, Math.ceil(em*size/Math.max(1, width-2)));
    }, 0);
}
