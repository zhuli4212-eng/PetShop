import { existsSync, mkdirSync, openSync, closeSync, fsyncSync, writeFileSync, readFileSync, renameSync,
  copyFileSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { GameError, ShopEngine, validateState } from './shop-engine.mjs';
import { maintenanceRounds, voidShowRound } from './show.mjs';
export { GameError, shopRules } from './shop-engine.mjs';

const minute=60_000;
export class GameStore extends ShopEngine {
  constructor(directory, options={}) {
    super(options);
    this.dir=directory;
    this.file=path.join(directory,'shop.json');
    this.backups=path.join(directory,'backups');
  }
  ensure() {
    if(this.state) return;
    mkdirSync(this.backups,{recursive:true});
    const candidates=[this.file,...readdirSync(this.backups).filter(n=>n.endsWith('.json')).sort().reverse().map(n=>path.join(this.backups,n))].filter(existsSync);
    let restored,fromBackup=false;
    for(const f of candidates) {
      try {restored=validateState(JSON.parse(readFileSync(f,'utf8'))); if(f!==this.file){restored.recoveredFrom=path.basename(f);fromBackup=true;}break;}
      catch(err) {console.error('读取经营存档失败',path.basename(f),err.message);}
    }
    if(!restored && candidates.length) throw new GameError('存档和备份均无法读取，请检查本机存档目录。',503);
    this.initialize(restored,{fromBackup,resetConnections:true});
  }
  save(s) {
    const tmp=this.file+'.tmp';
    const fd=openSync(tmp,'w');
    try {writeFileSync(fd,JSON.stringify(s));fsyncSync(fd);} finally {closeSync(fd);}
    renameSync(tmp,this.file);
    super.save(s);
    // 归档为已提交快照。备份盘故障不会把已生效的交易报告为失败。
    try {
      const day=Math.floor(s.clock/86400000), quarter=Math.floor(s.clock/(15*minute));
      for(const [suffix,slot] of [['daily',day],['quarter',quarter]]) {
        const target=path.join(this.backups,String(slot*(suffix==='daily'?86400000:15*minute)).padStart(14,'0')+'-'+suffix+'.json');
        if(existsSync(target)) continue;
        copyFileSync(this.file,target+'.tmp');renameSync(target+'.tmp',target);
        const files=readdirSync(this.backups).filter(n=>n.endsWith('-'+suffix+'.json')).sort();
        for(const name of files.slice(0,-(suffix==='daily'?7:96))) unlinkSync(path.join(this.backups,name));
      }
    } catch(err) {console.error('备用存档写入失败',err.message);}
  }
  resumeExisting() {
    if(existsSync(this.file) || (existsSync(this.backups)&&readdirSync(this.backups).some(n=>n.endsWith('.json'))))this.advance();
  }
  maintainShow(command,id,reason) {
    if(!this.state)this.resumeExisting();
    if(!this.state)throw new GameError('尚未创建本机店铺。',404);
    const now=this.advance();
    if(command==='list')return {profileId:this.state.profileId,rounds:maintenanceRounds(this.state,now)};
    if(command!=='void')throw new GameError('不支持此项赛事维护。',400);
    const s=structuredClone(this.state);
    let record;
    try {record=voidShowRound(s,id,reason,now);}catch(err){throw new GameError(err.message);}
    if(!this.state.show.voids?.[record.id]) {
      s.version++;s.clock=now;this.save(s);
    }
    return record;
  }
}
