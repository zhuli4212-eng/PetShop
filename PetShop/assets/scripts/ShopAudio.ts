import { AudioClip, AudioSource, Node, resources, sys } from 'cc';

type Sound = 'tap'|'confirm'|'feed'|'growth'|'hatch'|'coins'|'reward';
export type AudioSetting = 'music'|'effects';
const settingsKey='petshop.audio.';
const effectVolume:Record<Sound,number>={tap:.33,confirm:.48,feed:.5,growth:.64,hatch:.58,coins:.48,reward:.61};
const transactionSounds:Record<string,Sound>={
    'onboarding.openRoom':'confirm','onboarding.feed':'growth','onboarding.buy':'confirm','onboarding.claim':'reward',
    'care.feed':'feed','care.breed':'confirm','care.checkin':'reward','care.unlock':'reward','care.buyPet':'confirm',
    'care.buyNutrition':'confirm','care.buyItem':'confirm','task.claim':'reward','sale.commit':'coins','research.upgrade':'confirm',
};
let current:ShopAudio|undefined;

export function playTap():void {
    current?.interact();
    current?.play('tap');
}

export class ShopAudio {
    private readonly music:AudioSource;
    private readonly effects:AudioSource;
    private readonly clips=new Map<Sound,AudioClip>();
    private readonly settings:Record<AudioSetting,boolean>={
        music:sys.localStorage.getItem(settingsKey+'music')!=='off',
        effects:sys.localStorage.getItem(settingsKey+'effects')!=='off',
    };
    private activated=false;
    private foreground=true;
    private musicRequested=false;
    private disposed=false;

    constructor(parent:Node) {
        this.music=this.source(parent,'ShopMusic');
        this.music.loop=true;
        this.music.volume=.34;
        this.effects=this.source(parent,'ShopEffects');
        this.effects.volume=.72;
        current=this;
        resources.load('audio/wheatlight',AudioClip,(error,clip)=>{
            if(error||!clip||this.disposed)return;
            this.music.clip=clip;
            this.syncMusic();
        });
        for(const name of Object.keys(effectVolume) as Sound[]){
            resources.load('audio/'+name,AudioClip,(error,clip)=>{
                if(!error&&clip&&!this.disposed)this.clips.set(name,clip);
            });
        }
    }

    private source(parent:Node,name:string):AudioSource {
        const n=new Node(name);
        n.active=false;
        parent.addChild(n);
        const source=n.addComponent(AudioSource);
        source.playOnAwake=false;
        n.active=true;
        return source;
    }

    interact():void {
        this.activated=true;
        this.syncMusic();
    }

    setForeground(foreground:boolean):void {
        this.foreground=foreground;
        this.syncMusic();
    }

    enabled(setting:AudioSetting):boolean {return this.settings[setting];}

    toggle(setting:AudioSetting):void {
        this.settings[setting]=!this.settings[setting];
        sys.localStorage.setItem(settingsKey+setting,this.settings[setting]?'on':'off');
        this.syncMusic();
    }

    private syncMusic():void {
        if(this.disposed||!this.music.clip)return;
        const play=this.activated&&this.foreground&&this.settings.music;
        if(play===this.musicRequested)return;
        this.musicRequested=play;
        if(play)this.music.play();
        else this.music.pause();
    }

    play(sound:Sound):void {
        const clip=this.clips.get(sound);
        if(clip&&this.activated&&this.foreground&&this.settings.effects&&!this.disposed){
            this.effects.playOneShot(clip,effectVolume[sound]);
        }
    }

    transaction(type:string):void {
        const sound=transactionSounds[type];
        if(sound)this.play(sound);
    }

    dispose():void {
        this.disposed=true;
        if(current===this)current=undefined;
        this.music.stop();
    }
}
