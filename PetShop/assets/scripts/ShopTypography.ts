import { assetManager, Color, Font, isValid, Label, Node, resources, sys } from 'cc';

type FontKey = 'sans' | 'bold' | 'serif';
const paths:Record<FontKey,string> = {
    sans:'fonts/NotoSansCJKsc-Regular', bold:'fonts/NotoSansCJKsc-Bold', serif:'fonts/NotoSerifCJKsc-Bold',
};
const fonts:Partial<Record<FontKey,Font>> = {};
const roles = new WeakMap<Label,FontKey>();
const pending = new Map<Label,boolean>();
let loading:Promise<void>|undefined;
const useIPhoneSystemFonts = sys.isBrowser && /\biPhone\b/.test(navigator.userAgent);

function bind(label:Label,key:FontKey):void {
    roles.set(label,key);
    const font=fonts[key];
    label.isBold=useIPhoneSystemFonts && key!=='sans';
    label.isItalic=false;
    label.useSystemFont=useIPhoneSystemFonts && !!font;
    if(font) {
        if(useIPhoneSystemFonts) label.fontFamily=key==='serif'?'serif':'sans-serif';
        else label.font=font;
        if(pending.has(label)){label.enabled=pending.get(label)!;pending.delete(label);}
    } else {
        if(!pending.has(label))pending.set(label,label.enabled);
        label.enabled=false;
    }
}

/** Select the appropriate asset weight or request the equivalent system weight. */
export function setTextWeight(label:Label,bold:boolean):Label {
    bind(label,roles.get(label)==='serif'?'serif':bold?'bold':'sans');
    return label;
}
export function setTextFont(label:Label,heading=false,bold=false):Label {
    bind(label,heading?'serif':bold?'bold':'sans');
    return label;
}

export type TextRole = 'pageTitle'|'contentTitle'|'animalName'|'section'|'entry'|'body'|'value'|'field'|'secondary'|'compact'|'primaryButton'|'secondaryButton'|'smallAction'|'expand'|'headerValue'|'grade'|'tag'|'defect'|'status'|'countdown'|'number'|'disabled'|'danger'|'success'|'column'|'identifier';
const styles:Record<TextRole,[FontKey,number,number,string]> = {
    pageTitle:['serif',22,30,'#FFE3A1'],contentTitle:['serif',20,28,'#355749'],
    animalName:['serif',21,28,'#355749'],section:['serif',17,24,'#355749'],
    entry:['bold',17,24,'#362E20'],body:['sans',14,22,'#362E20'],
    value:['sans',13,20,'#362E20'],field:['sans',13,20,'#675C43'],
    secondary:['sans',12,18,'#665B45'],compact:['sans',11,16,'#665B45'],
    primaryButton:['bold',14,20,'#FFF0C2'],secondaryButton:['bold',14,20,'#493B22'],
    smallAction:['bold',12,18,'#25493E'],expand:['bold',13,20,'#365848'],
    headerValue:['bold',14,20,'#FFE6AA'],grade:['bold',14,20,'#24473C'],
    tag:['sans',12,18,'#483D31'],defect:['bold',11,16,'#4A412D'],
    status:['sans',10,14,'#395741'],countdown:['sans',13,20,'#362E20'],
    number:['bold',20,26,'#304D40'],disabled:['sans',14,22,'#71654E'],
    danger:['bold',13,20,'#8C352D'],success:['bold',13,20,'#285A40'],
    column:['sans',12,18,'#665B45'],identifier:['bold',14,20,'#345749'],
};
export function setTextStyle(label:Label,role:TextRole):Label {
    const [key,size,height,color]=styles[role];
    bind(label,key);label.fontSize=size;label.lineHeight=height;label.color=new Color().fromHEX(color);
    return label;
}

/** Scene-authored labels share the same assets as labels created at runtime. */
export function bindSceneFonts(root:Node):void {
    for(const label of root.getComponentsInChildren(Label)) {
        if(roles.has(label))continue;
        const isTitle=label.node.name==='Title';
        setTextFont(label,isTitle,label.isBold);
        if(isTitle)setTextStyle(label,'pageTitle');
        else if(label.node.parent?.name==='Wallet')setTextStyle(label,'headerValue');
    }
}

function webFontFamily(url:string):string {
    const name=url.slice(url.lastIndexOf('/')+1).replace(/\.(ttf|woff2)$/,'');
    // Cocos puts the family into Canvas font shorthand without quotes.
    const family=url.endsWith('.woff2')?'PetShop_'+name.replace(/[^\w-]/g,'_'):name;
    return family+'_LABEL';
}

async function downloadFont(url:string,signal:AbortSignal|undefined,activity:()=>void):Promise<ArrayBuffer> {
    const response=await fetch(url,{signal});
    if(!response.ok)throw new Error('店铺资源下载失败。');
    activity();
    const reader=url.startsWith('blob:')?undefined:response.body?.getReader();
    if(!reader){
        const buffer=await response.arrayBuffer();
        activity();
        return buffer;
    }
    const chunks:Uint8Array[]=[];
    let received=0;
    try {
        for(;;){
            const {done,value}=await reader.read();
            if(done)break;
            chunks.push(value);
            received+=value.byteLength;
            activity();
        }
    } finally {reader.releaseLock();}
    const bytes=new Uint8Array(received);
    let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return bytes.buffer;
}

type WebFontWindow = Window & {
    petshopAssetUrl?:(url:string)=>string;
    petshopReleasePackedAsset?:(url:string)=>void;
};

function registerWebFontDownloader(signal:AbortSignal|undefined,browser:WebFontWindow,activity:()=>void):void {
    const readFont=(url:string,_options:unknown,done:(error:Error|null,family?:string)=>void)=>{
        const family=webFontFamily(url);
        const source=browser.petshopAssetUrl?.(url)??url;
        void downloadFont(source,signal,activity).then(buffer=>{
            document.fonts.add(new FontFace(family,buffer));
            if(source!==url)browser.petshopReleasePackedAsset?.(url);
        }).then(()=>done(null,family),error=>done(error as Error));
    };
    // Keep the original URL for the font family while reading the packed bytes.
    assetManager.downloader.register('.woff2',readFont);
    if(browser.petshopAssetUrl)assetManager.downloader.register('.ttf',readFont);
}

async function waitForWebFont(font:Font):Promise<void> {
    if(typeof document==='undefined')return;
    // Creator 3.8.8 can return a TTF asset after its own three-second timeout,
    // including on a failed download. Match its versioned TTF family convention
    // using the public nativeUrl (TTFFont's family field is engine-private).
    const url=font.nativeUrl;
    if(!document.fonts||!/\.(ttf|woff2)$/.test(url))
        throw new Error('浏览器无法验证店铺字体。');
    const family=webFontFamily(url);
    const faces=await document.fonts.load('16px '+JSON.stringify(family),'麦穗宠物店芋头臻选绒光𠮷S+#%0123');
    if(!faces.length||faces.some(face=>face.status!=='loaded'))
        throw new Error('店铺字体尚未加载完成。');
}

export function loadShopFonts():Promise<void> {
    if(loading)return loading;
    const browser=typeof document==='undefined'?undefined:window as WebFontWindow;
    const controller=browser&&typeof AbortController==='function'?new AbortController():undefined;
    let deadline:ReturnType<typeof setTimeout>;
    let rejectIdle:(error:Error)=>void;
    const timeout=new Promise<never>((_,reject)=>{rejectIdle=reject;});
    const reportActivity=()=>{
        clearTimeout(deadline);
        deadline=setTimeout(()=>{
            rejectIdle(new Error('店铺资源加载超时。'));
            controller?.abort();
        },90000);
    };
    reportActivity();
    if(browser)registerWebFontDownloader(controller?.signal,browser,reportActivity);
    const fontsReady=Promise.all((Object.keys(paths) as FontKey[]).map(key=>new Promise<void>((resolve,reject)=>{
        resources.load(paths[key],Font,(error,font)=>{
            if(error||!font){reject(error||new Error('字体资源缺失：'+paths[key]));return;}
            void waitForWebFont(font).then(()=>{
                fonts[key]=font;
                for(const [label] of pending) {
                    if(!isValid(label,true)){pending.delete(label);continue;}
                    if(roles.get(label)===key)bind(label,key);
                }
                reportActivity();
                resolve();
            },reject);
        });
    })));
    loading=Promise.race([fontsReady,timeout]).then(()=>undefined)
        .catch(error=>{controller?.abort();loading=undefined;throw error;}).finally(()=>clearTimeout(deadline));
    return loading;
}
