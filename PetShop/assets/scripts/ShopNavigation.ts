import type { Args } from './ShopConnection';

// A section replaces the current level-two view. Other destinations share one
// work window owned by the section that opened it.
const sections: Record<string,string> = {
    rooms:'rooms', login:'login', onboarding:'onboarding', tasks:'tasks', profile:'profile', checkinReceipt:'profile', orders:'orders', guest:'guest', market:'market',
    breed:'breed', decor:'decor', lab:'lab', shelf:'lab', services:'lab', recycle:'lab', research:'lab',
    show:'show', 'show.history':'show', 'show.archive':'show', 'show.board':'show', 'show.tier':'show',
    collection:'collection', 'collection.theme':'collection',
};

export function featureFor(key:string,args:Args):string|undefined {
    if(key==='breed'&&args.mother&&args.father&&!args.picking)return undefined;
    return sections[key];
}

export function accessFeature(key:string,args:Args):string {
    if(key==='sale'||key==='saleQuote')
        return ({order:'orders',guest:'guest',market:'market',recycle:'lab'} as Record<string,string>)[args.channel];
    if(['pet','roomRoster','roomReceipt','roomNutrition','nutritionDetail'].includes(key))return 'rooms';
    if(['litter','litterKeep','litterSale'].includes(key))return 'breed';
    if(['offer','review','researchNode','researchTable','nutritionShop'].includes(key))return 'lab';
    if(['orderDesk','credits'].includes(key))return 'orders';
    if(key==='lastVisit'||key==='openingGuide')return 'login';
    if(key.startsWith('show.'))return 'show';
    return sections[key]||key;
}

// The browser owns a single back entry while the game is in a feature. Switching
// siblings or editing a quote never adds entries to the real browser history.
export class GameBrowserBack {
    private readonly win=typeof window!=='undefined' && typeof window.history?.pushState==='function' ? window : undefined;
    private removing=false;
    constructor(private active:()=>boolean, private back:()=>void) {
        this.win?.addEventListener('popstate',this.pop);
        this.sync(); // A reload starts at the store even if it occurred in a panel.
    }
    sync():void {
        const history=this.win?.history;
        if(!history||this.removing)return;
        if(this.active()&&!history.state?.petshopBack) {
            history.pushState({...history.state,petshopBack:true},'');
        } else if(!this.active()&&history.state?.petshopBack) {
            this.removing=true;
            history.back();
        }
    }
    private pop=():void=>{
        if(this.removing)this.removing=false;
        else if(!this.win?.history.state?.petshopBack && this.active())this.back();
        this.sync();
    };
    dispose():void { this.win?.removeEventListener('popstate',this.pop); }
}
