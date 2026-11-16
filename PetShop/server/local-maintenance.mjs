import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, renameSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// The local operator and the running service share the OS user profile.
export const maintenanceDirectory = process.env.PETSHOP_MAINTENANCE_DIR || path.join(homedir(), '.petshop', 'maintenance');
export const credentialPath = (directory, port) => path.join(directory, 'local-'+port+'.key');

export function openMaintenance(directory,port,webRoot) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  // Editor-only installations might not have a Web Mobile build yet.
  const resolvedWebRoot=existsSync(webRoot)?realpathSync(webRoot):path.resolve(webRoot);
  const relative=path.relative(resolvedWebRoot,realpathSync(directory));
  if(relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)){
    throw Error('维护凭据目录必须位于网页资源目录之外。');
  }
  const key=randomBytes(32).toString('hex');
  const target=credentialPath(directory,port);
  const temp=target+'.'+randomBytes(8).toString('hex')+'.tmp';
  writeFileSync(temp,key,{mode:0o600,flag:'wx'});
  renameSync(temp,target);
  return Buffer.from('Bearer '+key);
}

export function isLocalOperator(req,expected) {
  if(!expected||req.headers.origin)return false;
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return false;
  const provided=Buffer.from(req.headers.authorization||'');
  return provided.length===expected.length && timingSafeEqual(provided,expected);
}
