import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GameStore } from '../server/game-store.mjs';

export function seedGuideRecovery(directory, scenario, now=Date.now()-10_000) {
  if(!['missing','budget'].includes(scenario))throw new Error('请选择 missing 或 budget 验收档。');
  if(existsSync(directory)&&readdirSync(directory).length)throw new Error('验收档只能建在空目录。');
  const store=new GameStore(directory,{onboarding:true,wall:()=>now,monotonic:()=>0});
  const page=(key,args)=>store.page(key,args).page;
  const act=(type,args={})=>{
    const {profileId,version}=store.shop();
    return store.act({type,args,profileId,version,requestId:randomUUID()});
  };
  const commit=(channel,id)=>{
    const {type,args}=page('saleQuote',{channel,ids:[id]}).actions[0];
    act(type,args);
  };
  for(const step of ['enter','openLetter','proceed','openRoom','feed'])act('onboarding.'+step);
  const [mother,father]=store.state.onboarding.starters;
  act('care.breed',{mother,father});
  now=store.state.rooms.rabbit.job.endsAt;
  const first=page('litter').rows.find(row=>row.litterMember).animal;
  page('pet',{id:first.id});page('market');
  commit('market',mother);
  if(scenario==='budget'){
    page('pet',{id:father});page('recycle');
    commit('recycle',father);
  }
  const s=structuredClone(store.state);
  if(scenario==='missing')s.pets=s.pets.filter(pet=>pet.id!==father);
  else s.coins=75;
  store.save(s);
  return {now,father,profileId:s.profileId,coins:s.coins};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const [scenario,directory]=process.argv.slice(2);
  if(!directory)throw new Error('请指定独立的 PETSHOP_SAVE_DIR。');
  const fixture=seedGuideRecovery(resolve(directory),scenario);
  console.log(`${scenario} 验收档已创建 · ${fixture.coins} 金币`);
}
