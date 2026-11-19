import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RequestGameStore } from './request-store.mjs';
import { purchasePrice, youngPurchaseBase } from './business.mjs';
import { lifeDates, makePet } from './care.mjs';

const start=Date.UTC(2026,10,18,4), minute=60_000;
const rabbitTask={id:'rabbit-pair'};
const panel=g=>g.page('tasks',{}).page;
function command(g,type,args) {
  const {profileId,version}=g.shop();
  return {requestId:randomUUID(),profileId,version,type,args};
}
const act=(g,type,args)=>g.act(command(g,type,args));

test('任务读取真实购入与配对，奖励领取一次并可在兔房投喂',()=>{
  let now=start;
  const options={wall:()=>now,monotonic:()=>0};
  const g=new RequestGameStore(null,options);
  g.state.shopXp=36;
  assert.equal(panel(g).subtitle,'0 / 6 已完成');
  assert.equal(panel(g).actions[0].disabled,true);
  assert.deepEqual(g.shop().taskShortcut,{completed:0,total:6,choice:{label:'开始兔子繁育',page:'breed',args:{species:'rabbit'}}});
  assert.throws(()=>act(g,'task.claim',rabbitTask),/请先完成/);
  const [firstMother,firstFather]=g.state.pets;
  act(g,'care.breed',{mother:firstMother.id,father:firstFather.id});
  assert.equal(panel(g).rows[0].done,true);
  now+=2*minute;
  assert.equal(panel(g).rows[1].done,false);

  const batch=g.state.rooms.rabbit.shelf;
  for(const offer of [...batch.offers]){
    act(g,'care.buyPet',{id:offer.id,batch:batch.number,price:purchasePrice(g.state,youngPurchaseBase(offer))});
  }
  const mother=batch.offers.find(p=>p.sex==='母').id, father=batch.offers.find(p=>p.sex==='公').id;
  assert.throws(()=>act(g,'care.breed',{mother,father}),/可繁育/);
  assert.equal(panel(g).subtitle,'2 / 6 已完成');
  now=Math.max(...g.state.pets.filter(p=>p.id===mother||p.id===father).map(p=>lifeDates(p).adultAt));
  const coins=g.state.coins;
  act(g,'care.breed',{mother,father});
  assert.equal(g.state.coins,coins);
  assert.equal(panel(g).subtitle,'3 / 6 已完成');
  assert.deepEqual(panel(g).actions[0].args,rabbitTask);
  assert.equal(g.state.rooms.rabbit.nutritionStock,undefined);
  assert.equal(g.state.tasks[rabbitTask.id].motherId,mother);

  const legacy=g.snapshot();
  delete legacy.state.tasks;
  assert.equal(panel(new RequestGameStore(legacy,options)).subtitle,'3 / 6 已完成');
  assert.throws(()=>act(g,'task.claim',rabbitTask),/请先完成全部/);
  g.page('market',{});
  act(g,'care.checkin',{});
  g.page('orders',{});
  assert.ok(panel(g).rows.every(r=>r.done));
  assert.equal(panel(g).subtitle,'6 / 6 已完成');
  assert.deepEqual(g.shop().taskShortcut,{completed:6,total:6,choice:{label:'领取任务奖励',page:'tasks'}});
  assert.equal(panel(g).actions[0].disabled,false);
  const restored=new RequestGameStore(g.snapshot(),options);
  const xp=restored.state.shopXp;
  const claim=command(restored,'task.claim',rabbitTask);
  const receipt=restored.act(claim);
  const reopened=new RequestGameStore(restored.snapshot(),options);
  assert.deepEqual(reopened.act(claim),receipt);
  assert.throws(()=>act(reopened,'task.claim',rabbitTask),/奖励已领取/);
  assert.match(panel(reopened).subtitle,/安置兔房/);
  assert.equal(reopened.shop().taskShortcut.choice.label,'看看一只种源');
  assert.equal(reopened.state.coins,coins+40);
  assert.equal(reopened.state.shopXp,xp);
  assert.equal(reopened.state.rooms.rabbit.nutritionStock.premium,2);
  assert.equal(reopened.state.rooms.rabbit.nutrition,undefined);
  act(reopened,'care.feed',{species:'rabbit',tier:'premium'});
  assert.equal(reopened.state.rooms.rabbit.nutritionStock.premium,1);
});

test('独立任务入口保留旧进度，锁定页可查看条件且不计完成',()=>{
  const options={wall:()=>start,monotonic:()=>0};
  const g=new RequestGameStore(null,options);
  assert.throws(()=>g.page('tutorial',{}),e=>e.status===404);
  const {rows}=panel(g);
  assert.deepEqual(rows.map(r=>r.link.page),['breed','lab','profile','orders','market','breed']);
  for(const key of ['lab','orders']){
    assert.throws(()=>g.page(key,{}),e=>e.status===403);
    const page=g.page(key,{fromTasks:true}).page;
    assert.equal(page.presentation.kind,'featureLocked');
    assert.match(page.rows[0].text,/2 级/);
  }
  assert.equal(panel(g).subtitle,'0 / 6 已完成');
  g.page('market',{});
  act(g,'care.checkin',{});
  assert.equal(panel(g).subtitle,'2 / 6 已完成');

  const old=g.snapshot();
  delete old.state.tasks.opening;
  old.state.visitBook.tutorial={bred:true,bought:true,claimed:true,ordersViewed:true,marketViewed:false};
  const reopened=new RequestGameStore(old,options);
  assert.deepEqual(panel(reopened).rows.map(r=>r.done),[true,true,true,true,false,false]);
  assert.equal(reopened.state.visitBook.tutorial,undefined);
  assert.equal(reopened.page('openingGuide',{}).page.actions[0].page,'tasks');
});

test('十五组自动开启，只记录本组动作，重进和重放领奖保持进度',()=>{
  let now=start;
  const options={wall:()=>now,monotonic:()=>0};
  let game=new RequestGameStore(null,options);
  game.state.onboarding={finishedAt:start,firstLitterAt:start-1};
  game.state.tasks.early={startedAt:start,claimed:{},progress:{}};
  game.state.coins=20_000;
  game.state.shopXp=10;
  const page=(key,args={})=>game.page(key,args).page;
  const choose=choice=>act(game,choice.type,choice.args);
  const pet=sex=>{
    const animal=makePet(new Set(game.state.pets.map(p=>p.name)),'rabbit','domestic',sex,now-5*minute,'验收测试');
    game.state.pets.push(animal);
    return animal.id;
  };
  const keep=()=>{const id=pet('母');act(game,'care.retain',{id,retained:true});return id;};
  const breed=()=>act(game,'care.breed',{mother:pet('母'),father:pet('公')});
  const litter=()=>{
    now=game.state.rooms.rabbit.job.endsAt;
    page('litter');
  };
  const breedAndView=()=>{breed();litter();};
  const sale=count=>{
    const ids=Array.from({length:count},()=>pet('公'));
    const quote=page('saleQuote',{channel:'market',ids}).actions[0];
    const request=command(game,quote.type,quote.args);
    return {request,receipt:game.act(request)};
  };
  const buy=count=>{
    for(let i=0;i<count;i++){
      let batch=game.state.rooms.rabbit.shelf;
      if(batch.offers.every(p=>!p)){
        now+=30*minute;
        game.shop();batch=game.state.rooms.rabbit.shelf;
      }
      const offer=batch.offers.find(Boolean);
      act(game,'care.buyPet',{id:offer.id,batch:batch.number,price:purchasePrice(game.state,youngPurchaseBase(offer))});
    }
  };
  const feed=()=>act(game,'care.feed',{species:'rabbit',tier:'premium'});
  const upgrade=branch=>choose(page('researchNode',{species:'rabbit',branch}).actions.find(a=>a.type==='research.upgrade'));
  const cancel=()=>act(game,'order.cancel',{id:game.state.orders.find(slot=>slot.order).order.id,source:'free'});
  let earlySale;
  const completeGroups=[
    ()=>{
      page('pet',{id:keep()});
      page('roomNutrition');
      assert.equal(panel(game).rows[1].done,false);
      feed();
      page('lab',{tab:'seed'});
      earlySale=sale(1);breed(); // These also match the next group, before it opens.
    },
    ()=>{
      assert.deepEqual(game.act(earlySale.request),earlySale.receipt);
      assert.match(panel(game).subtitle,/0 \/ 3/);
      litter(); // A previously started litter is newly born after this group opens.
      page('litter');
      assert.equal(game.state.tasks.early.progress.litters,1);
      assert.equal(game.state.tasks.early.progress.breeds,undefined);
      sale(1);page('lab',{tab:'seed'});breed();litter();
    },
    ()=>{sale(1);page('orders');},
    ()=>{page('pet',{id:keep()});page('lab',{tab:'services'});keep();},
    ()=>{buy(2);breedAndView();},
    ()=>{page('research');upgrade(0);sale(1);sale(1);},
    ()=>{
      now+=30*minute;
      feed();page('roomNutrition');breedAndView();
    },
    ()=>{cancel();sale(6);},
    ()=>{keep();keep();breedAndView();},
    ()=>{sale(5);sale(5);},
    ()=>{upgrade(1);buy(1);breedAndView();breedAndView();},
    ()=>{
      sale(6);breedAndView();
      now+=30*minute;feed();now+=30*minute;feed();
    },
    ()=>{
      page('orders');
      assert.equal(panel(game).rows.at(-1).done,false);
      cancel();buy(1);keep();now+=30*minute;page('orders');
    },
    ()=>{
      sale(8);sale(8);
      game.state.research.rabbit=[10,10,10];
      assert.equal(panel(game).rows[1].done,false);
      page('research');
    },
    ()=>{breedAndView();breedAndView();breedAndView();sale(8);},
  ];
  game.state.rooms.rabbit.nutritionStock={premium:6};
  assert.match(panel(game).subtitle,/^安置兔房 · 0 \/ 3/);
  assert.throws(()=>act(game,'task.claim',{id:'rabbit-shop-ready'}),/当前一组/);
  const claimed=new Set();
  for(const complete of completeGroups){
    const unopened=panel(game);
    assert.ok(unopened.rows.every(row=>!row.done),unopened.subtitle);
    assert.equal(unopened.actions[0].disabled,true);
    complete();
    const current=panel(game), claim=current.actions[0];
    assert.doesNotMatch(current.subtitle,/第\s*\d+\s*[\/组]/);
    assert.ok(current.rows.every(row=>row.done&&row.link?.page),current.subtitle);
    assert.equal(claim.disabled,false,current.subtitle);
    const before=game.state.coins;
    const request=command(game,claim.type,claim.args);
    const receipt=game.act(request);claimed.add(claim.args.id);
    assert.equal(game.state.coins-before,current.visual.rewards[0].quantity);
    game=new RequestGameStore(game.snapshot(),options);
    assert.deepEqual(game.act(request),receipt);
    assert.equal(game.state.coins-before,current.visual.rewards[0].quantity);
  }

  assert.equal(claimed.size,15);
  assert.equal(game.state.rooms.cat,undefined);
  assert.equal(panel(game).actions[0].label,'已领取');
  assert.match(game.shop().taskShortcut.choice.label,/经营任务已完成/);
});

test('旧档延续当前组的任务与进度，领奖后自动开启从零开始的新任务',()=>{
  const options={wall:()=>start,monotonic:()=>0};
  const old=new RequestGameStore(null,options).snapshot();
  const s=old.state;
  s.onboarding={finishedAt:start-1};
  s.care.signedDay='2026-11-18';
  s.pets[0].retained=true;
  s.tasks.early={progress:{feeds:1,litters:1,shelf:true,breeds:5},claimed:{}};
  s.sales.push({at:start-1,channel:'market',lines:[{id:'former-rabbit'}],total:100});
  const resumed=new RequestGameStore(old,options);
  assert.match(panel(resumed).subtitle,/安置兔房 · 4 \/ 4/);
  const claim=panel(resumed).actions[0];
  assert.match(act(resumed,claim.type,claim.args).message,/已开启「经营第一批兔子」/);
  const reopened=new RequestGameStore(resumed.snapshot(),options);
  assert.match(panel(reopened).subtitle,/经营第一批兔子 · 0 \/ 3/);
  assert.deepEqual(reopened.state.tasks.early.progress,{});
  assert.equal(reopened.state.tasks.early.legacy,undefined);
  assert.throws(()=>act(reopened,claim.type,claim.args),/已领取/);
});
