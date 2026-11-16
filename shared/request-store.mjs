import { GameError, ShopEngine, validateState } from './shop-engine.mjs';

export { GameError };

// One instance belongs to one storage revision and one request. The caller
// commits the full snapshot, including reader sequence numbers, with CAS.
export class RequestGameStore extends ShopEngine {
  constructor(snapshot=null, options={}) {
    super(options);
    this.dirty=false;
    if(snapshot===null) {
      this.initialize(null);
      return;
    }
    const readers=snapshot?.readers;
    if(!Array.isArray(readers))throw new GameError('经营档的会话记录无法读取。',503);
    for(const pair of readers) {
      if(!Array.isArray(pair)||pair.length!==2)throw new GameError('经营档的会话记录无法读取。',503);
      const [id,entry]=pair;
      if(typeof id!=='string'||!/^[-\w]{8,100}$/.test(id)||this.readers.has(id)||
        !Number.isFinite(entry?.at)||typeof entry.foreground!=='boolean'||!Number.isSafeInteger(entry.seq)||entry.seq<0)
        throw new GameError('经营档的会话记录无法读取。',503);
      this.readers.set(id,{at:entry.at,foreground:entry.foreground,seq:entry.seq});
    }
    this.initialize(structuredClone(validateState(snapshot.state)));
  }
  save(s) {
    super.save(s);
    this.dirty=true;
  }
  snapshot() {
    return structuredClone({state:this.state,readers:[...this.readers]});
  }
}
