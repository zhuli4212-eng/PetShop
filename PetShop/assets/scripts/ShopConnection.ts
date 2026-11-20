import { PREVIEW, WECHAT } from 'cc/env';

export type Args = Record<string, any>;
export interface Choice {
    label?:string; page?:string; type?:string; args?:Args; confirm?:string; locked?:boolean;
    go?:string; goArgs?:Args; useSelection?:boolean; allowEmptySelection?:boolean; disabled?:boolean; active?:boolean; replace?:boolean;
}
export interface Animal {
    id:string; number:string; name:string; breed:string; coat:string; sex:string; stage:string; status:string; art:string;
    retained?:boolean; stageEndsAt?:number|null;
    guided?:boolean; selectedBreeding?:boolean;
    score?:number;
    traits?:{type:string;grade:string}[];
    tags?:AnimalTag[];
    defect?:{label:string;grade:string};
}
export interface AnimalTag {dimension:number;type:string;grade:string;tagId:string;label:string;rarity:string;}
export interface LedgerRow {
    title:string; text?:string; art?:string; select?:string; stage?:string;
    link?:Choice; action?:Choice; done?:boolean; current?:boolean; animal?:Animal;
}
export interface MutationPreview {
    enabled:boolean; level:number;
    fields:{name:string;mother:string;father:string;off:number;on:number}[];
}
export interface NutritionEffect {
    rate:number; startsAt:number; endsAt:number;
}
export interface GuideCue {text:string;target?:string;next?:Choice;selectedText?:string;}
export interface LedgerPage {
    readNoteIds?:string[];
    visual?:Args;
    title:string; subtitle?:string; art?:string; stage?:string; animals?:string[]; animalStages?:string[];
    presentation?:{kind:string; bornAt?:number; endsAt?:number; nextStageAt?:number|null; remaining?:number; mutationPreview?:MutationPreview; nutrition?:NutritionEffect; archived?:boolean};
    tabs?:Choice[]; filters?:Choice[][]; selectionLabel?:string;
    rows?:LedgerRow[]; actions?:Choice[]; empty?:string; initialSelection?:string[];
    guide?:GuideCue;
}
export interface ShopSnapshot {
    protocol:1; profileId:string; version:number; name:string; coins:number;
    entrances:string[]; rooms:string[]; decor:string[]; now:number; dayClaimed:boolean;
    shopLevel?:number;
    shopExperience?:{total:number;intoLevel:number;toNext:number;maxLevel:number};
    featureAccess?:Record<string,{name:string;requiredLevel:number;unlocked:boolean}>;
    notice?:{key:string,text:string,at:number}; hints?:{id:string,text:string}[];
    taskShortcut?:{completed:number;total:number;choice:Choice};
    guest?:{id:string;endsAt:number};
    letter?:ShopLetter|null;
}
export interface ShopLetter {ids:string[];page:LedgerPage;}
export interface Command {requestId:string; profileId:string; version:number; type:string; args:Args;}
export class ServerError extends Error {
    constructor(message:string, public readonly status:number) {super(message);}
}
export function requestId():string {
    return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
}

function serviceBase(origin:string):string {
    return origin.trim().replace(/\/+$/,'') || (PREVIEW || WECHAT ? 'http://127.0.0.1:17888' : '');
}
export function sendDeparture(origin:string,data:Args):void {
    const body=JSON.stringify(data);
    if(typeof navigator!=='undefined'&&typeof navigator.sendBeacon==='function'){
        try {if(navigator.sendBeacon(serviceBase(origin)+'/api/heartbeat',new Blob([body],{type:'application/json'})))return;}
        catch{/* Non-browser hosts may expose an incomplete Beacon implementation. */}
    }
    void api(origin,'heartbeat',data).catch(()=>{});
}
export function api<T>(origin:string, path:string, data?:Args):Promise<T> {
    const base=serviceBase(origin);
    return new Promise((resolve,reject)=>{
        const r=new XMLHttpRequest();
        r.open(data===undefined?'GET':'POST',base+'/api/'+path);
        if(data!==undefined)r.setRequestHeader('Content-Type','application/json');
        const timeout=9000;
        r.timeout=timeout;
        const interrupted=()=>{
            clearTimeout(deadline);
            reject(new ServerError('连接中断，请重连后查询本次操作。',0));
        };
        // A stalled response may never deliver the native XHR timeout event.
        const deadline=setTimeout(()=>{interrupted();r.abort();},timeout);
        r.onload=()=>{
            clearTimeout(deadline);
            try {
                const value=JSON.parse(r.responseText);
                if(r.status!==200) {reject(new ServerError(value.error||'店铺请求失败。',r.status));return;}
                resolve(value as T);
            } catch {reject(new ServerError('未能读取服务器回执。',0));}
        };
        r.onerror=r.ontimeout=r.onabort=interrupted;
        try {r.send(data===undefined?null:JSON.stringify(data));}
        catch(error){clearTimeout(deadline);reject(error);}
    });
}
export async function connectShop(origin=''):Promise<ShopSnapshot> {
    const shop=await api<ShopSnapshot>(origin,'shop');
    if(shop.protocol!==1 || !shop.profileId || !Number.isSafeInteger(shop.version) || !Array.isArray(shop.entrances))
        throw new Error('请先启动经营版店铺服务器。');
    return shop;
}
