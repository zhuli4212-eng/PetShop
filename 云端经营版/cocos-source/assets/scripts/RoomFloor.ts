// Floor points are measured from the top left of the room illustration, at the feet.
interface Point { x:number; depth:number }
const spacingX=.158, spacingY=.214;
function distance(a:Point,b:Point):number {
    return Math.hypot((a.x-b.x)/spacingX,(a.depth-b.depth)/spacingY);
}

export function litterPositions(count:number,width:number,height:number) {
    if(!count)return [];
    const columns=Math.min(count,Math.ceil(Math.sqrt(count*1.8))),rows=Math.ceil(count/columns);
    const cellW=width*.90/columns,cellH=height*.43/rows;
    const hit=Math.min(width*.19,cellW*.84,cellH*.9),feet=-hit*.46;
    // Portraits have transparent margins. The touch targets stay inside their own floor cells.
    const size=Math.min(width*.20,cellW*.82,cellH*1.23);
    return Array.from({length:count},(_,i)=>{
        const row=Math.floor(i/columns),inRow=Math.min(columns,count-row*columns);
        const x=(i%columns-(inRow-1)/2)*cellW;
        const y=height*(.5-.53)-(row+.78)*cellH-feet;
        return {x,y,hit,feet,size,patrol:{x:Math.min(width*.035,(cellW-hit)*.4),y:(cellH-hit)*.12}};
    });
}

export class RoomFloor {
    private readonly homes:Point[];
    private readonly assigned=new Map<string,Point>();

    constructor(private readonly rabbitRoom:boolean) {
        // Start from a feasible packing so even a full room always has ten usable homes.
        // Resample over the entire floor, keeping only positions clear of nearby animals.
        const homes=Array.from({length:10},(_,i)=>({
            x:.10+(i%5)*.20,depth:i<5 ? .57 : (i%5===2 ? .86 : .91),
        }));
        for(let pass=0;pass<80;pass++){
            for(let i=0;i<homes.length;i++){
                const p={x:.09+Math.random()*.82,depth:.554+Math.random()*.372};
                if(rabbitRoom && p.x>.37 && p.x<.63 && p.depth>.87)continue;
                if(homes.every((h,j)=>j===i || distance(p,h)>=1))homes[i]=p;
            }
        }
        for(let i=homes.length-1;i>0;i--){
            const j=Math.floor(Math.random()*(i+1));
            [homes[i],homes[j]]=[homes[j],homes[i]];
        }
        this.homes=homes;
    }

    positions(ids:string[],width:number,height:number) {
        this.assigned.forEach((_p,id)=>{if(!ids.includes(id))this.assigned.delete(id);});
        const taken=new Set(this.assigned.values());
        const free=this.homes.filter(p=>!taken.has(p));
        for(const id of ids)if(!this.assigned.has(id))this.assigned.set(id,free.shift()!);
        const points=ids.map(id=>this.assigned.get(id)!);
        const size=width*.128,hit=Math.max(size,Math.min(44,width*.14));
        const feet=-hit/2+width*.006;
        return points.map(p=>{
            // Share the spare space between the two patrols. Diagonally separated
            // animals can use different depths while each centre stays tappable.
            let room=1;
            for(const other of points){
                if(other!==p)room=Math.min(room,(distance(p,other)-.91)/(2*Math.SQRT2));
            }
            let dx=Math.min(room*spacingX*width,width*(Math.min(p.x,1-p.x)-.012)-hit/2);
            let dy=Math.min(room*spacingY,p.depth-.54,.945-p.depth)*height;
            if(this.rabbitRoom && p.x+dx/width>.37 && p.x-dx/width<.63 && p.depth+dy/height>.88){
                if(p.depth<=.88)dy=Math.min(dy,(.88-p.depth)*height);
                else dx=Math.min(dx,Math.max(.37-p.x,p.x-.63)*width);
            }
            return {x:(p.x-.5)*width,y:(.5-p.depth)*height-feet,size,hit,feet,
                patrol:{x:Math.max(0,dx),y:Math.max(0,dy)}};
        });
    }
}
