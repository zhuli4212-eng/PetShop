import { _decorator, Component, isValid, resources, Sprite, SpriteFrame, UITransform } from 'cc';
const { ccclass } = _decorator;

// Foot positions expressed as percentages of the same 4:7 shop backdrop as the editor scene.
const aisle = [[50, 44], [56, 46], [53, 55], [46, 57], [44, 49]];

@ccclass('ShopkeeperWalk')
export class ShopkeeperWalk extends Component {
    private sprite!: Sprite;
    private idle!: SpriteFrame;
    private steps: (SpriteFrame | undefined)[] = [];
    private figureHeight = 0;
    private next = 1;
    private rest = 1;
    private strideTime = 0;

    start(): void {
        if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            this.enabled = false;
            return;
        }
        this.sprite = this.node.getChildByName('Art')!.getComponent(Sprite)!;
        this.idle = this.sprite.spriteFrame!;
        this.figureHeight = this.sprite.node.getComponent(UITransform)!.height;
        this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        for (let i = 0; i < 4; i++) {
            resources.load('shopkeeper/step-' + i + '/spriteFrame', SpriteFrame, (error, frame) => {
                if (!error && isValid(this, true)) this.steps[i] = frame;
            });
        }
    }

    update(dt: number): void {
        const delta = Math.min(dt, 0.1);
        if (this.rest > 0) {
            this.rest -= delta;
            return;
        }
        const [xp, yp] = aisle[this.next];
        const room = this.node.parent!.getComponent(UITransform)!;
        const foot = this.node.position;
        const dx = (xp / 100 - 0.5) * room.width - foot.x;
        const dy = (0.5 - yp / 100) * room.height - foot.y;
        const remaining = Math.hypot(dx, dy);
        const distance = room.width * 0.068 * delta;
        if (remaining <= distance) {
            this.node.setPosition(foot.x + dx, foot.y + dy, foot.z);
            this.next = (this.next + 1) % aisle.length;
            this.rest = 0.8 + this.next * 0.15;
            this.strideTime = 0;
            this.pose(this.idle);
            return;
        }
        this.node.setPosition(foot.x + dx * distance / remaining, foot.y + dy * distance / remaining, foot.z);
        this.sprite.node.setScale(dx > 0 ? -1 : 1, 1, 1);
        this.strideTime += delta;
        this.pose(this.steps[Math.floor(this.strideTime * 9) % 4] || this.idle);
    }

    private pose(frame: SpriteFrame): void {
        if (frame === this.sprite.spriteFrame) return;
        this.sprite.spriteFrame = frame;
        const source = frame.originalSize;
        this.sprite.node.getComponent(UITransform)!.setContentSize(
            source.width * this.figureHeight / source.height, this.figureHeight);
    }
}
