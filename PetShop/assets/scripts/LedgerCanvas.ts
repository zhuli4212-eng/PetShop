import { BlockInputEvents, builtinResMgr, Color, EventTouch, isValid, Label, Node, resources, Sprite, SpriteFrame, Texture2D, UITransform, Vec3 } from 'cc';
import type { Animal, Args, Choice, LedgerPage, LedgerRow } from './ShopConnection';
import type { RoomFloor } from './RoomFloor';
import { playTap } from './ShopAudio';
import { allowsGuideTap } from './ShopNavigation';
import { setTextFont, setTextStyle, setTextWeight } from './ShopTypography';

export const paper = {
    ink: '#443A29', muted: '#6C5E46', page: '#F6E9CB', card: '#FFF1D2',
    green: '#285449', primary: '#365F4A', cream: '#F9E6B4', brass: '#C6A571',
};

export interface LedgerUI {
    roomFloor?: RoomFloor;
    playGrowth?: boolean;
    back: () => void;
    choose: (choice: Choice) => void;
    bindCountdown: (label: Label, endsAt: number, format: (seconds: number) => string) => void;
    bindStageCountdown: (label: Label, endsAt: number, progress?:(seconds:number)=>void, prefix?:string) => void;
    openFilter: (fields: FilterField[], index: number) => void;
    openBreedingBonus: () => void;
    toggle: (id: string) => void;
    selected: Set<string>;
    expandedAnimal?:string;
    toggleAnimal:(id:string)=>void;
    offset: number;
    detailPage: number;
    turnPage: (index:number) => void;
}

export interface FilterField { anchor: Node; options: Choice[]; }

export interface PageCanvas {
    key: string; args: Args; p: LedgerPage; body: Node; width: number; inner: number; ui: LedgerUI; modal: boolean;
    slot(height: number, gap?: number): number;
    visibleRow(name: string, width: number, height: number, gap: number, draw: (row:Node)=>void): void;
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

let solidFrame: SpriteFrame | undefined;

export function flatSpriteFrame(): SpriteFrame {
    if (!solidFrame) {
        solidFrame = new SpriteFrame();
        solidFrame.texture = builtinResMgr.get<Texture2D>('white-texture');
        solidFrame.packable = false;
    }
    return solidFrame;
}

function paintSprite(node: Node, spriteFrame: SpriteFrame, color: string): Sprite {
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = spriteFrame;
    sprite.color = new Color().fromHEX(color);
    return sprite;
}

export function box(parent: Node, name: string, x: number, y: number, w: number, h: number, fill?: string): Node {
    const n = new Node(name);
    n.layer = parent.layer;
    parent.addChild(n);
    n.setPosition(x, y);
    n.addComponent(UITransform).setContentSize(w, h);
    if (fill) paintSprite(n, flatSpriteFrame(), fill);
    return n;
}

export function solidRect(parent: Node, x: number, y: number, w: number, h: number, fill: string): void {
    if (w > 0 && h > 0) box(parent, 'Solid', x+w/2, y+h/2, w, h, fill);
}

export function setSolidRect(node: Node, x: number, y: number, w: number, h: number): void {
    node.active = w > 0 && h > 0;
    if (!node.active) return;
    node.setPosition(x+w/2, y+h/2);
    node.getComponent(UITransform)!.setContentSize(w, h);
}

function alphaSpriteFrame(width: number, height: number, coverage: (x:number,y:number)=>number, smooth: boolean): SpriteFrame {
    const pixels = new Uint8Array(width * height * 4);
    pixels.fill(255);
    for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
        pixels[(y*width+x)*4+3] = Math.round(255 * coverage(x+.5,y+.5));
    }
    const texture = new Texture2D();
    texture.reset({width,height,format:Texture2D.PixelFormat.RGBA8888,mipmapLevel:1});
    const filter = smooth ? Texture2D.Filter.LINEAR : Texture2D.Filter.NEAREST;
    texture.setFilters(filter,filter);
    texture.uploadData(pixels);
    const frame = new SpriteFrame();
    frame.texture=texture;
    frame.packable=false;
    return frame;
}

let paperLines: SpriteFrame | undefined;
let circleFrame: SpriteFrame | undefined;
let triangleFrame: SpriteFrame | undefined;

export function paperGrain(node: Node): void {
    paperLines ??= alphaSpriteFrame(512,4,(_,y)=>y>=3?5/255:0,false);
    paintSprite(node,paperLines,'#754B22').type=Sprite.Type.TILED;
}

export function solidDisc(parent: Node, diameter: number, color: string): void {
    circleFrame ??= alphaSpriteFrame(64,64,(x,y)=>Math.max(0,Math.min(1,32.5-Math.hypot(x-32,y-32))),true);
    paintSprite(box(parent,'Disc',0,0,diameter,diameter),circleFrame,color);
}

export function guidePointer(parent: Node, color: string): Node {
    triangleFrame ??= alphaSpriteFrame(56,36,(x,y)=>Math.max(0,Math.min(1,28.5-Math.abs(x-28)-y*28/36)),true);
    const arrow=box(parent,'Pointer',0,0,14,9);
    paintSprite(arrow,triangleFrame,color);
    return arrow;
}

export function frame(parent: Node, name: string, x: number, y: number, w: number, h: number, fill: string,
                      edge = paper.brass, shadow = true): Node {
    const n = box(parent, name, x, y, w, h);
    frameContents(n,fill,edge,shadow);
    return n;
}

export function frameContents(n:Node,fill:string,edge=paper.brass,shadow=true):void {
    const {width:w,height:h}=n.getComponent(UITransform)!;
    if (shadow) solidRect(n, -w/2, -h/2-2, w, h, '#C5A872');
    solidRect(n, -w/2, -h/2, w, h, edge);
    solidRect(n, -w/2+1, -h/2+1, w-2, h-2, fill);
}

export function caption(parent: Node, name: string, value: string, x: number, y: number, w: number, h: number,
                        size: number, color: string, center = false): Label {
    const n = box(parent, name, x, y, w, h);
    const l = n.addComponent(Label);
    setTextFont(l);
    l.string = String(value);
    l.fontSize = size;
    l.lineHeight = Math.round(size * 1.45);
    l.color = new Color().fromHEX(color);
    l.horizontalAlign = center ? Label.HorizontalAlign.CENTER : Label.HorizontalAlign.LEFT;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    l.overflow = Label.Overflow.SHRINK;
    l.enableWrapText = true;
    // Assigning a loaded font while a new Label still has overflow NONE can
    // resize its UITransform. Restore the layout box after all label setters.
    n.getComponent(UITransform)!.setContentSize(w,h);
    return l;
}

export function heading(parent: Node, name: string, value: string, x: number, y: number, w: number, h: number,
                        size: number, color: string, center = false): Label {
    const l = caption(parent, name, value, x, y, w, h, size, color, center);
    setTextFont(l,true);
    l.lineHeight = Math.ceil(size * 1.3);
    l.node.getComponent(UITransform)!.setContentSize(w,h);
    return l;
}

export function stockBadge(parent:Node,x:number,y:number):void {
    const badge=frame(parent,'StockBadge',x,y,36,20,'#DCE7BD','#95A77E',false);
    setTextStyle(caption(badge,'Caption','种源',0,0,34,18,10,'#395741',true),'status');
}

export const animalSummaryHeight=84;
export const animalCardWidth=(c:PageCanvas):number=>c.inner-12;
const animalDetailsWidth=54;
const nextStage:Record<string,string>={幼年:'成长',成长:'成年',成年:'老年',老年:'寿终'};
export const animalStageDeadline=(a:Animal):number=>nextStage[a.stage]&&Number.isFinite(a.stageEndsAt)?a.stageEndsAt!:Infinity;

export function animalSummary(c:PageCanvas,parent:Node,a:Animal,width:number,top:number,checkWidth=0,disabled=false):void {
    const left=-width/2+checkWidth,textLeft=left+69;
    const textWidth=width-checkWidth-69-animalDetailsWidth-21;
    const thumb=box(parent,'Thumb',left+34,top-34,50,48,disabled?'#DBD6C8':'#ECDEB8');
    const portrait=picture(thumb,'Portrait',a.art,0,0,48,46,a.stage);
    if(disabled)portrait.getComponent(Sprite)!.grayscale=true;
    if(a.retained)stockBadge(parent,left+28,top-13);
    caption(parent,'ScoreLabel','评分',left+23,top-69,23,18,11,'#5A523B').lineHeight=16;
    const score=setTextStyle(caption(parent,'Score',a.score===undefined?'—':String(a.score),left+49,top-69,26,18,13,paper.green),'number');
    score.fontSize=13;score.lineHeight=18;score.enableWrapText=false;

    const deadline=animalStageDeadline(a),timed=Number.isFinite(deadline);
    const nameWidth=timed?Math.min(textWidth-67,Math.max(36,Array.from(a.name).length*17+4)):textWidth;
    const name=setTextStyle(caption(parent,'Name',a.name,textLeft+nameWidth/2,top-24,nameWidth,24,17,paper.ink),'entry');
    name.enableWrapText=false;
    const info=[
        ['Identity',a.breed+' · '+a.coat,48],
        ['Stage',a.sex+' · '+a.stage+' · '+a.status,67],
    ] as const;
    for(const [key,value,offset] of info){
        const label=setTextStyle(caption(parent,key,value,textLeft+textWidth/2,top-offset,textWidth,19,12,paper.muted),'secondary');
        label.enableWrapText=false;
    }
    if(timed){
        const clockWidth=textWidth-nameWidth-6,clockX=textLeft+nameWidth+6+clockWidth/2;
        const clock=setTextStyle(caption(parent,'StageCountdown','',clockX,top-24,clockWidth,30,12,paper.ink),'countdown');
        clock.fontSize=12;clock.lineHeight=15;clock.enableWrapText=clockWidth<100;
        c.ui.bindStageCountdown(clock,deadline,undefined,'距'+nextStage[a.stage]+' ');
    }
}

export function animalDetails(c:PageCanvas,parent:Node,name:string,choice:Choice,width:number,top:number):void {
    const control=press(parent,name,'详情',width/2-35,top-34,animalDetailsWidth,()=>c.ui.choose(choice),false,false,44);
    setTextStyle(control.getChildByName('Caption')!.getComponent(Label)!,'smallAction');
}

export function tap(n: Node, fn: () => void): void {
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
        const a = e.getUIStartLocation(), b = e.getUILocation();
        if (Math.hypot(a.x-b.x, a.y-b.y) > 14) return;
        e.propagationStopped = true;
        if(!allowsGuideTap(n))return;
        playTap();
        fn();
    });
}

export function press(parent: Node, name: string, title: string, x: number, y: number, w: number, fn: () => void,
                      primary = false, disabled = false, h = 48, secondaryFill = '#F0D6A3'): Node {
    const edge = disabled ? '#ABA58F' : primary ? '#254536' : '#A38252';
    const fill = disabled ? '#F0E5CC' : primary ? '#345B48' : secondaryFill==='#F0D6A3'?'#EDD3A0':secondaryFill;
    const n = frame(parent, name, x, y, w, h, fill, edge, false);
    if (!disabled) {
        solidRect(n, -w/2+1, h/2-2, w-2, 1, primary ? '#77936C' : '#FFF0D0');
        solidRect(n, -w/2, -h/2-1, w, 1, edge);
    }
    const l = caption(n, 'Caption', title, 0, 0, w-8, h-4, 14, disabled ? '#706E5F' : primary ? '#FFF0C8' : paper.ink, true);
    setTextStyle(l,primary?'primaryButton':'secondaryButton');
    if(disabled)l.color=new Color().fromHEX('#71654E');
    if (!disabled) tap(n, fn);
    return n;
}

export function animalFilters(c:PageCanvas,field:'品种'|'物种',second:'品种'|'成长状态'='成长状态',compact=false):void {
    const groups=(c.p.filters||[]).filter(group=>group.length);
    if(!groups.length)return;
    const gap=8,h=compact?34:44,y=c.slot(h,compact?8:10),w=(c.inner-gap*(groups.length-1))/groups.length;
    const fields:FilterField[]=groups.map((options,i)=>{
        const current=options.find(a=>a.active)||options[0];
        const x=-c.inner/2+w/2+i*(w+gap);
        const title=i?second:field;
        const anchor=frame(c.body,title==='成长状态'?'GrowthStageFilter':title==='品种'?'BreedFilter':'SpeciesFilter',x,y,w,h,'#FFF1D2','#B39665',false);
        const label=title+'　'+current.label;
        setTextWeight(caption(anchor,'Caption',label,-5,0,w-28,h-2,compact?13:14,'#29483E'),true);
        const arrow=box(anchor,'Arrow',w/2-16,-1,10,8);
        for(let j=0;j<3;j++)solidRect(arrow,-5+2*j,2-2*j,10-4*j,2,'#6A583C');
        tap(anchor,()=>c.ui.openFilter(fields,i));
        return {anchor,options};
    });
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
        setTextWeight(caption(entry,'Caption',option.label||'',-7,0,width-32,rowHeight-3,14,option.active?paper.green:paper.ink),!!option.active);
        if(option.active)caption(entry,'Mark','✓',width/2-15,0,20,rowHeight-3,14,paper.green,true);
        tap(entry,()=>{close();if(!option.active)choose({...option,replace:true});});
    });
    return overlay;
}

// These six approved poses are shared by both sexes. Every other coat has two portraits.
const sharedRestingCoats = new Set([
    'angora-coat01', 'angora-coat02', 'angora-coat06', 'domestic-coat01',
    'persian-coat03', 'persian-coat04',
]);

function stageArt(art: string, stage: string): string {
    if (!art.startsWith('pets/')) return art;
    const id = art.slice(5);
    if (stage === '幼年') return 'pet-young/' + id;
    if (stage === '已故') {
        const coat = id.split('_')[0];
        return 'pets/' + (sharedRestingCoats.has(coat) ? coat : id) + '-rest';
    }
    return art;
}

export function picture(parent: Node, name: string, art: string, x: number, y: number, w: number, h: number,
                        stage = ''): Node {
    const resolved = stageArt(art, stage);
    const size = stage === '成长' ? .85 : stage === '老年' ? .94 : 1;
    const n = box(parent, name, x, y - (1-size)*h*.36, 1, 1);
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    const apply = (image: SpriteFrame) => {
        if (!isValid(n, true)) return;
        sp.spriteFrame = image;
        const {width, height} = image.originalSize;
        const scale = Math.min(w/width, h/height) * size;
        n.getComponent(UITransform)!.setContentSize(width*scale, height*scale);
    };
    const path=resolved+'/spriteFrame';
    const cached=resources.get(path,SpriteFrame);
    if(cached) apply(cached);
    else resources.load(path,SpriteFrame,(err,image)=>{if(!err&&image)apply(image);});
    return n;
}

// Give cached or fast artwork time to appear with its controls. The renderer
// can attach slow images later, so their requests must not hold up the ledger.
export async function prepareIllustration(key:string, args:Args, page:LedgerPage):Promise<void> {
    const counters:Record<string,string>={
        lab:'lab',research:'lab',market:'market',orders:'orders',credits:'orders',orderDesk:'orders',
        recycle:'lab',show:'stage','show.board':'stage','show.tier':'stage'
    };
    const counter=counters[key==='sale'?String(args.channel):key] || (key==='sale'&&args.channel==='order'?'orders':'');
    const paths=new Set<string>();
    if(page.art)paths.add(stageArt(page.art, page.stage || ''));
    if(['pair','pairConfirm'].includes(page.presentation?.kind||''))paths.add('rooms/breeding-room');
    for(const pageArt of page.visual?.openingBooklet??[])paths.add(pageArt.art);
    if(counter)paths.add('shop-modules/'+counter);
    if(key==='show'&&page.visual?.pet)paths.add(stageArt(page.visual.pet,page.visual.petStage||''));
    if(['roomNutrition','nutritionShop','checkinReceipt'].includes(key)||key==='lab'&&args.tab==='nutrition'){
        for(const row of page.rows||[])if(row.art)paths.add(stageArt(row.art,row.stage||''));
    }
    if(key==='rooms'&&page.presentation?.nutrition)paths.add('rooms/nutrition-meal-fill');
    if(page.visual?.openingRoom){
        paths.add('pet-young/domestic-coat01_female');
        paths.add('pet-young/domestic-coat01_male');
    }
    if(page.visual?.grownIds)paths.add('onboarding/growth-spark');
    const missing=Array.from(paths,art=>art+'/spriteFrame')
        .filter(path=>!resources.get(path,SpriteFrame));
    if(!missing.length)return;
    let deadline:ReturnType<typeof setTimeout>|undefined;
    try {
        await Promise.race([
            Promise.all(missing.map(path=>new Promise<void>(resolve=>{
                resources.load(path,SpriteFrame,()=>resolve());
            }))).catch(()=>{}),
            new Promise<void>(resolve=>{deadline=setTimeout(resolve,400);}),
        ]);
    } finally {
        if(deadline!==undefined)clearTimeout(deadline);
    }
}

export function lines(value: string, width: number, size: number): number {
    return String(value).split('\n').reduce((total, line) => {
        const em = Array.from(line).reduce((sum, c) => sum + (c.charCodeAt(0)<128 ? 0.58 : 1), 0);
        return total + Math.max(1, Math.ceil(em*size/Math.max(1, width-2)));
    }, 0);
}
