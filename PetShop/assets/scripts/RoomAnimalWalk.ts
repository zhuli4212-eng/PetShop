import { _decorator, Component, game, Game, isValid, Node, Rect, resources, Size, Sprite, SpriteFrame, Texture2D, UITransform } from 'cc';

const { ccclass } = _decorator;
type Patrol = { waypoints: number[][]; speed: number; cyclesPerSecond: number; rest: number };

// Offsets from each animal's own starting point, in percent of the illustrated floor.
const patrols: Record<string, Patrol> = {
    '兔': { waypoints: [[0,0],[-11,1],[-4,-4],[10,-2],[7,2]], speed: 11, cyclesPerSecond: 2, rest: .55 },
    '猫': { waypoints: [[0,0],[13,-2],[5,2],[-10,0],[-5,-3]], speed: 6.3, cyclesPerSecond: 2.3, rest: 1.2 },
    '狗': { waypoints: [[0,0],[-13,-2],[-5,2],[12,0],[6,-4]], speed: 9.2, cyclesPerSecond: 2.3, rest: .55 },
};
// These rabbit strips include the height of the airborne phase in the four drawings.
const hopsWithDrawnHeight = new Set([
    'pet-walk/lop-coat06_female/texture',
    'pet-young-walk/lop-coat06_female/texture',
]);
type Leg = { x: number; y: number; dx: number; dy: number; duration: number; cycles: number; elapsed: number };

@ccclass('RoomAnimalWalk')
export class RoomAnimalWalk extends Component {
    private sprite!: Sprite;
    private idle: SpriteFrame | null = null;
    private strip: Texture2D | null = null;
    private frames: SpriteFrame[] = [];
    private path = '';
    private requested = false;
    private readonly preference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    private hidden = false;
    private patrol!: Patrol;
    private hopping = false;
    private floorWidth = 0;
    private floorHeight = 0;
    private originX = 0;
    private originY = 0;
    private poseY = 0;
    private hopHeight = 0;
    private mirrorRoute = 1;
    private rest = 0;
    private next = 0;
    private leg: Leg | null = null;

    setup(figure: Node, art: string, stage: string, species: string, slot: number, width: number, height: number): void {
        this.sprite = figure.getComponent(Sprite)!;
        const directory = stage === '幼年' ? 'pet-young-walk/' : 'pet-walk/';
        this.path = directory + art.substring(art.lastIndexOf('/') + 1) + '/texture';
        this.patrol = patrols[species];
        this.hopping = species === '兔';
        this.floorWidth = width;
        this.floorHeight = height;
        this.originX = this.node.position.x;
        this.originY = this.node.position.y;
        this.poseY = figure.position.y;
        this.mirrorRoute = slot % 2 ? -1 : 1;
        this.rest = .32 + slot * .4;
    }

    onEnable(): void {
        this.hidden = typeof document !== 'undefined' && document.hidden;
        game.on(Game.EVENT_HIDE, this.hide, this);
        game.on(Game.EVENT_SHOW, this.show, this);
    }
    onDisable(): void {
        game.off(Game.EVENT_HIDE, this.hide, this);
        game.off(Game.EVENT_SHOW, this.show, this);
    }
    private hide(): void { this.hidden = true; }
    private show(): void { this.hidden = false; }

    private loadFrames(): void {
        this.requested = true;
        resources.load(this.path, Texture2D, (error, texture) => {
            if (error || !isValid(this, true)) return;
            const cell = texture.height;
            if (!cell || texture.width !== cell * 4) return;
            texture.addRef();
            this.strip = texture;
            for (let i = 0; i < 4; i++) {
                const frame = new SpriteFrame();
                frame.name = this.path.split('/')[1] + '-walk-' + i;
                frame.reset({ texture, rect: new Rect(i * cell, 0, cell, cell), originalSize: new Size(cell, cell) });
                frame.packable = false;
                this.frames.push(frame);
            }
        });
    }
    onDestroy(): void {
        for (const frame of this.frames) frame.destroy();
        this.strip?.decRef();
    }
    private stop(): void {
        this.leg = null;
        this.sprite.spriteFrame = this.idle;
        this.sprite.node.setPosition(0,this.poseY);
    }

    private beginLeg(): Leg {
        this.next = (this.next + 1) % this.patrol.waypoints.length;
        const [xp, yp] = this.patrol.waypoints[this.next];
        const { x, y } = this.node.position;
        const dx = this.originX + this.mirrorRoute * xp / 100 * this.floorWidth - x;
        const dy = this.originY - yp / 100 * this.floorHeight - y;
        const duration = Math.max(.8, Math.hypot(dx,dy) / (this.patrol.speed / 100 * this.floorWidth));
        this.sprite.node.setScale(dx > 0 ? -1 : 1, 1, 1);
        return { x, y, dx, dy, duration, cycles: Math.max(2, Math.round(duration * this.patrol.cyclesPerSecond)), elapsed: 0 };
    }
    update(dt: number): void {
        if (this.hidden || !this.patrol) return;
        if (this.preference?.matches) {
            if (this.leg) {
                this.stop();
                this.rest = this.patrol.rest;
            }
            return;
        }
        if (!this.requested) this.loadFrames();
        if (!this.frames.length || !this.sprite.spriteFrame) return;
        if (!this.idle) {
            this.idle = this.sprite.spriteFrame;
            this.hopHeight = hopsWithDrawnHeight.has(this.path) ? 0 : this.sprite.node.getComponent(UITransform)!.height * .08;
        }
        const delta = Math.min(dt, .1);
        if (!this.leg) {
            this.rest -= delta;
            if (this.rest > 0) return;
            this.leg = this.beginLeg();
        }
        const leg = this.leg;
        leg.elapsed += delta;
        if (leg.elapsed >= leg.duration) {
            this.node.setPosition(leg.x + leg.dx, leg.y + leg.dy);
            this.stop();
            this.rest = this.patrol.rest + Math.random() * 1.4;
            return;
        }
        let progress = leg.elapsed / leg.duration;
        const phase = progress * leg.cycles;
        const stride = phase % 1;
        this.sprite.spriteFrame = this.frames[Math.floor(stride * 4)];
        if (this.hopping) {
            progress = (phase - Math.sin(2 * Math.PI * stride) / (2 * Math.PI)) / leg.cycles;
            this.sprite.node.setPosition(0,this.poseY + this.hopHeight * Math.sin(Math.PI * stride));
        }
        this.node.setPosition(leg.x + leg.dx * progress, leg.y + leg.dy * progress);
    }
}
