import { lstat, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root=fileURLToPath(new URL('../',import.meta.url));

// Stage all outputs before changing a directory that a preview or packaging tool can read.
export async function replaceOutputs(names,produce) {
  const stage=await mkdtemp(path.join(root,'.build-stage-'));
  const backup=path.join(stage,'previous');
  const moved=[],installed=[];
  let restored=true;
  try {
    await produce(stage);
    await mkdir(backup);
    for(const name of names) {
      const destination=path.join(root,name);
      const existing=await lstat(destination).catch(error=>{
        if(error.code!=='ENOENT')throw error;
      });
      if(existing) {
        if(!existing.isDirectory())throw Error('Expected an actual directory at '+destination);
        await rename(destination,path.join(backup,name));
        moved.push(name);
      }
      await rename(path.join(stage,name),destination);
      installed.push(name);
    }
  } catch(error) {
    restored=false;
    for(const name of installed.reverse())await rename(path.join(root,name),path.join(stage,name));
    for(const name of moved.reverse())await rename(path.join(backup,name),path.join(root,name));
    restored=true;
    throw error;
  } finally {
    if(restored)await rm(stage,{recursive:true,force:true});
  }
}
