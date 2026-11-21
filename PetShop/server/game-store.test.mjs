import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GameStore, shopRules } from './game-store.mjs';
import { saleExperience, shopProgress } from './shop-progression.mjs';

test('旧动物可在档案留种或取消，重启后名册和交易名单使用同一标记',t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'petshop-retain-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  let g=new GameStore(directory);
  const shop=g.shop(), id=g.state.pets[0].id;
  const details=()=>g.page('pet',{id}).page;
  const mark=()=>details().actions.find(a=>a.type==='care.retain');
  const commit=(a,requestId)=>g.act({type:a.type,args:a.args,requestId,profileId:shop.profileId,version:g.shop().version});
  assert.equal(details().presentation.animal.retained,false);
  const a=mark();assert.equal(a.label,'留种');commit(a,'retain-from-file');
  g=new GameStore(directory);
  assert.equal(details().presentation.animal.retained,true);
  assert.equal(g.page('roomRoster',{}).page.rows.find(r=>r.animal?.id===id).animal.retained,true);
  assert.ok(!g.page('market',{}).page.rows.some(r=>r.select===id));
  assert.match(g.page('market',{}).page.subtitle,/种源保护 1 只/);
  assert.equal(details().actions.find(a=>a.page==='market').args.preselectId,id);
  assert.ok(!details().actions.some(a=>a.page==='recycle'));
  assert.throws(()=>g.page('saleQuote',{channel:'market',ids:[id]}),/种源|保护|不可/);
  const undo=mark();assert.equal(undo.label,'取消留种');commit(undo,'undo-retain-from-file');
  assert.equal(details().presentation.animal.retained,false);assert.equal(g.shop().coins,shop.coins);
  assert.ok(g.page('market',{}).page.rows.some(r=>r.select===id));
  assert.throws(()=>commit({...a,args:{id,retained:'false'}},'retain-invalid-value'),/留种/);
});

test('经营档先写盘再回执，相同请求重放、旧版本争抢和重启回拨均不重复发动物', t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'petshop-ledger-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  let utc=Date.UTC(2026,10,16,5),mono=0;
  const env={wall:()=>utc,monotonic:()=>mono};
  let g=new GameStore(directory,env);
  const shop=g.shop();
  const cmd={requestId:'receipt-checkin-one',profileId:shop.profileId,version:shop.version,type:'care.checkin',args:{}};
  const receipt=g.act(cmd);
  assert.deepEqual(g.act(cmd),receipt);
  assert.equal(g.state.pets.length,4);
  assert.throws(()=>g.act({...cmd,requestId:'receipt-checkin-two'}),/变化/);
  assert.throws(()=>g.act({...cmd,type:'order.cancel'}),/编号/);
  utc-=8000;
  g=new GameStore(directory,env);
  assert.deepEqual(g.receipt(cmd.requestId),receipt);
  mono+=20000;
  const reopened=g.shop();
  assert.equal(reopened.profileId,shop.profileId);
  assert.ok(reopened.now>=shop.now+20000);
  assert.equal(g.state.pets.length,4);
  assert.match(g.state.clockEvent.text,/回拨/);
});

test('JSON 可解析但赛历缺失的主档，使用已存在的同店备份恢复',t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'petshop-restore-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const before=new GameStore(directory).shop();
  const file=path.join(directory,'shop.json'),broken=JSON.parse(readFileSync(file,'utf8'));
  delete broken.show.weeks;writeFileSync(file,JSON.stringify(broken));
  const g=new GameStore(directory);const restored=g.shop();
  assert.equal(restored.profileId,before.profileId);
  assert.ok(g.state.recoveredFrom);assert.equal(g.state.pets.length,2);
  assert.ok(JSON.parse(readFileSync(file,'utf8')).show.weeks);
});
test('主档赛事根种子缺失或长度错误时改用原种子备份',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'petshop-seed-backup-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const original=new GameStore(dir);original.shop();
  const {rootSeed,profileId}=original.state;
  for(const damaged of [undefined,'abcd','z'.repeat(64)]) {
    const data=JSON.parse(readFileSync(original.file,'utf8'));
    data.rootSeed=damaged;writeFileSync(original.file,JSON.stringify(data));
    const reopened=new GameStore(dir);assert.equal(reopened.shop().profileId,profileId);
    assert.equal(reopened.state.rootSeed,rootSeed);
    assert.ok(reopened.state.recoveredFrom);
  }
});

test('旧批量报价逐只报告离店、留种、变价，整笔拒绝且必须重新确认',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'petshop-sale-conflict-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let time=Date.UTC(2026,10,16,10);
  const game=new GameStore(dir,{wall:()=>time,monotonic:()=>0});
  const {profileId}=game.shop();
  const send=(requestId,type,args,version=game.shop().version)=>game.act({requestId,profileId,version,type,args});
  send('claim-for-stale-sale','care.checkin',{});
  const [left,kept,growing]=game.state.pets;
  const quote=game.page('saleQuote',{channel:'market',ids:[left.id,kept.id,growing.id]});
  const stale=quote.page.actions[0];
  const single=game.page('saleQuote',{channel:'market',ids:[left.id]}).page.actions[0];
  send('sell-one-before-confirm',single.type,single.args);
  send('keep-one-before-confirm','care.retain',{id:kept.id,retained:true});
  time+=12*60_000;
  const before=game.shop(), pets=game.state.pets.map(p=>p.id), sales=game.state.sales.length;
  assert.throws(()=>send('confirm-stale-market',stale.type,stale.args,quote.shop.version),e=>{
    assert.match(e.message,new RegExp(left.name+' #[A-Z0-9]+已离店'));
    assert.match(e.message,new RegExp(kept.name+' .*种源'));
    assert.match(e.message,new RegExp(growing.name+' .*现价'));
    return true;
  });
  assert.equal(game.shop().coins,before.coins);
  assert.deepEqual(game.state.pets.map(p=>p.id),pets);
  assert.equal(game.state.sales.length,sales);
  assert.equal(game.state.receipts['confirm-stale-market'],undefined);
  const fresh=game.page('saleQuote',{channel:'market',ids:[growing.id]});
  const revised=fresh.page.actions[0];
  const staleVersion=fresh.shop.version;
  send('undo-keep-before-confirm','care.retain',{id:kept.id,retained:false});
  assert.throws(()=>send('unchanged-sale-still-stale',revised.type,revised.args,staleVersion),/重新确认/);
  assert.equal(game.shop().coins,before.coins);
  send('accept-updated-market',revised.type,revised.args);
  assert.equal(game.shop().coins,before.coins+revised.args.amounts[0]);
});

test('逐只成交价核算经验，批量跨两级解锁；拒绝过期、重复请求及重新启动均不重复发放',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'petshop-sale-xp-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let g=new GameStore(dir);
  const opening=g.shop(), ids=g.state.pets.map(p=>p.id);
  const args=g.page('saleQuote',{channel:'market',ids}).page;
  assert.deepEqual(opening.shopExperience,{total:0,intoLevel:0,toNext:10,maxLevel:60});
  assert.equal(args.visual.saleExperience,20);
  const confirm=args.actions[0];
  const payload={requestId:'multi-sale-experience',profileId:opening.profileId,version:opening.version,type:confirm.type,args:confirm.args};
  const denied=structuredClone(payload);
  denied.args.hash='expired';
  assert.throws(()=>g.act(denied),/重新核价/);
  const oldReward=structuredClone(payload);
  oldReward.args.saleExperience=200;
  assert.throws(()=>g.act(oldReward),/经验报价已变化/);
  assert.equal(g.shop().shopExperience.total,0);
  const receipt=g.act(payload), after=g.shop();
  assert.match(receipt.message,/店铺升至 3 级/);
  assert.equal(receipt.saleExperience,20);
  assert.deepEqual(receipt.levelUp,{from:1,to:3,unlocked:['orders','lab','guest']});
  assert.deepEqual(after.shopExperience,{total:20,intoLevel:0,toNext:10,maxLevel:60});
  assert.equal(after.shopLevel,3);
  for(const key of ['orders','lab','guest'])assert.ok(after.featureAccess[key].unlocked);
  assert.equal(after.featureAccess.show.unlocked,false);
  assert.equal(g.state.sales[0].saleExperience,20);
  g=new GameStore(dir);
  assert.deepEqual(g.act(payload),receipt);
  assert.equal(g.shop().shopExperience.total,20);
  assert.equal(g.shop().coins,opening.coins+confirm.args.amounts.reduce((a,b)=>a+b,0));
});

test('旧档按历史成交明细回填一次经验，只计活体成交；每只加成封顶，达到60级继续累计',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'petshop-xp-backfill-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const g=new GameStore(dir);g.shop();
  const s=g.state;delete s.shopXp;
  const lots=[
    {channel:'market',lines:[{amount:199},{amount:200}]},
    {channel:'order',lines:[{amount:6000}]},{channel:'guest',lines:[{amount:400}]},
    {channel:'recycle',lines:[{amount:1000}]},
  ];
  s.sales=lots;g.save(s);
  const first=new GameStore(dir).shop();
  assert.equal(first.shopExperience.total,10+11+30+12);
  assert.equal(first.shopLevel,5);assert.equal(first.shopExperience.intoLevel,3);
  const saved=JSON.parse(readFileSync(path.join(dir,'shop.json'),'utf8'));
  assert.equal(saved.shopXp,first.shopExperience.total);assert.equal(saved.coins,680);
  assert.deepEqual(new GameStore(dir).shop().shopExperience,first.shopExperience);
  assert.equal(saleExperience(shopRules,'guest',lots[0].lines),21);
  assert.equal(saleExperience(shopRules,'recycle',lots[0].lines),0);
  assert.deepEqual(shopProgress(shopRules,17645),{level:60,total:17645,intoLevel:5,toNext:0,maxLevel:60});
  assert.deepEqual(shopProgress({...shopRules,maxLevel:61},17645),{level:60,total:17645,intoLevel:5,toNext:600,maxLevel:61});
});

test('研究所回收只增加金币，从报价到正式回执均为零经验',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'petshop-recycling-xp-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let now=Date.UTC(2026,10,16);
  const g=new GameStore(dir,{wall:()=>now,monotonic:()=>0});
  const shop=g.shop(), [sold,remaining]=g.state.pets.map(p=>p.id);
  function sell(channel,id,requestId){
    const {shop:current,page}=g.page('saleQuote',{channel,ids:[id]});
    const {type,args}=page.actions[0];
    const receipt=g.act({type,args,requestId,profileId:shop.profileId,version:current.version});
    return [page,receipt];
  }
  sell('market',sold,'market-before-recycle');
  const afterMarket=g.shop();
  assert.equal(afterMarket.shopLevel,2);
  now+=7*86400000;
  const [quote,receipt]=sell('recycle',remaining,'recycling-xp-zero');
  assert.equal(quote.visual.saleExperience,0);assert.equal(receipt.saleExperience,0);
  assert.equal(g.state.sales.at(-1).saleExperience,0);
  assert.equal(g.shop().shopExperience.total,afterMarket.shopExperience.total);
  assert.ok(g.shop().coins>afterMarket.coins);
});

test('入口配置独立生效，房间别名、子页面、销售渠道、操作与来客心跳遵守同一等级',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'petshop-shop-gates-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const featureLevels={...shopRules.featureLevels,rooms:2,market:2,collection:1,breed:1};
  const g=new GameStore(dir,{rules:{...shopRules,featureLevels}});
  const first=g.shop(), order=g.state.orders[0].order.id, ids=g.state.pets.map(p=>p.id);
  for(const [page,args] of [['roomRoster',{}],['pet',{id:ids[0]}],['sale',{channel:'market'}],
    ['saleQuote',{channel:'order',ids,targetId:order}],['shelf',{}],['recycle',{}],['researchTable',{}],
    ['show.history',{}],['sale',{channel:'guest'}]]){
    assert.throws(()=>g.page(page,args),e=>e.status===403);
  }
  assert.equal(g.page('collection',{}).page.title,'奖杯收藏');
  assert.equal(first.featureAccess.breed.unlocked,true);
  assert.ok(!first.hints.some(h=>h.id.startsWith('order-')));
  for(const [type,args] of [['care.retain',{id:ids[0],retained:true}],['research.upgrade',{}],['sale.commit',{channel:'recycle',ids}],['show.enter',{}]]){
    assert.throws(()=>g.act({type,args,requestId:'locked-action-data',profileId:first.profileId,version:first.version}),e=>e.status===403);
  }
  g.heartbeat('client-for-gate',true);
  assert.deepEqual(g.state.visitors.sessions,{});
  assert.equal(g.state.pets.length,2);
  g.state.shopXp=10;
  assert.ok(g.page('roomRoster',{}).page.rows.length);
  assert.ok(g.page('saleQuote',{channel:'order',ids,targetId:order}).page.visual.saleExperience);
});

test('开店次日零点开私人赛，第三日零点开公开赛；重登延续店龄，未开放的报名不会扣费占位',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'petshop-race-days-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const first=Date.parse('2026-11-16T23:59:59.999+08:00'), day=86400000;
  let now=first;
  const clock={wall:()=>now,monotonic:()=>0};
  let g=new GameStore(dir,clock);
  const profile=g.shop().profileId;
  assert.throws(()=>g.page('show',{}),/4 级/);
  g.state.shopXp=30;g.save(g.state);
  function event(mode){
    const lobby=g.page('show',{}).page;
    assert.deepEqual(lobby.visual.raceAccess,g.shop().raceAccess);
    return lobby.rows.find(r=>r.visual.mode===mode&&r.link.page==='show.round').link.args;
  }
  const priv=event('private'), pub=event('public'), pet=g.state.pets[0].id;
  const tryEntry=(args,id)=>g.act({type:'show.enter',args,requestId:id,profileId:profile,version:g.shop().version});
  function verifyLocked(round,opensDay){
    const args={...round,pet};
    const details=g.page('show.round',round).page;
    assert.match(details.rows.find(row=>row.title==='六维目标').text,/缺陷 [EDCBAS]\+?$/);
    assert.ok(!details.rows.some(r=>r.link?.page==='show.review'));
    const check=g.page('show.review',args).page;
    assert.match(check.rows[0].title,new RegExp('开店第 '+opensDay+' 天'));
    assert.ok(!check.actions.some(a=>a.type==='show.enter'));
    assert.throws(()=>tryEntry({...args,token:'old-review'},'premature-race-entry'),new RegExp('开店第 '+opensDay+' 天'));
  }
  const access=g.shop().raceAccess;
  assert.deepEqual(access.private,{opensDay:2,opensAt:first+1,unlocked:false});
  assert.deepEqual(access.public,{opensDay:3,opensAt:first+1+day,unlocked:false});
  verifyLocked(priv,2);verifyLocked(pub,3);
  assert.equal(g.state.coins,680);assert.deepEqual(g.state.show.entries,{});
  assert.equal(g.page('collection',{}).page.title,'奖杯收藏');
  now++;
  g=new GameStore(dir,clock);
  assert.equal(g.shop().shopDay,2);
  assert.ok(g.shop().raceAccess.private.unlocked);
  const entry=g.page('show.review',{...priv,pet}).page.actions[0];
  tryEntry(entry.args,'private-second-day');
  assert.equal(g.state.coins,660);
  verifyLocked(pub,3);
  now+=day-1;
  g=new GameStore(dir,clock);
  assert.equal(g.shop().raceAccess.public.unlocked,false);
  now++;
  const third=g.shop();
  assert.equal(third.shopDay,3);
  assert.equal(third.raceAccess.public.unlocked,true);
  const publicEntry=g.page('show.review',{...pub,pet}).page.actions[0];
  tryEntry(publicEntry.args,'public-third-day');
  assert.ok(g.state.show.entries[pub.event]);
  now=Date.parse('2026-11-20T18:00:00+08:00');
  assert.throws(()=>tryEntry(publicEntry.args,'already-closed-round'),/报名已截止/);
});

test('更新前已报名的回执可重放，按原赛程结算奖励，开店日不重置',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'petshop-race-legacy-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let now=Date.parse('2026-11-16T21:00:00+08:00');
  const clock={wall:()=>now,monotonic:()=>0};
  const oldRules={...shopRules,raceOpensDay:{private:1,public:1}};
  let g=new GameStore(dir,{...clock,rules:oldRules});g.shop();
  g.state.shopXp=30;g.save(g.state);
  const round=g.page('show',{}).page.rows[0].link.args;
  const check=g.page('show.review',{...round,pet:g.state.pets[0].id});
  const {type,args}=check.page.actions[0],cmd={type,args,profileId:check.shop.profileId,version:check.shop.version,requestId:'legacy-race-registration'};
  const receipt=g.act(cmd), leftover=g.state.coins;
  delete g.state.createdAt;g.save(g.state); // Earliest room preserves the opening time in older saves.
  g=new GameStore(dir,clock);
  assert.equal(g.shop().raceAccess.private.unlocked,false);
  assert.deepEqual(g.act(cmd),receipt);
  assert.equal(g.state.coins,leftover);
  assert.ok(g.page('show',{}).page.rows.some(r=>r.link.page==='show.result'&&r.link.args.event===round.event));
  now=g.state.show.entries[round.event].result;
  g.shop();
  assert.ok(g.state.show.entries[round.event].outcome);
  const settled=structuredClone(g.state.show.entries[round.event]);
  g=new GameStore(dir,clock);g.shop();
  assert.deepEqual(g.state.show.entries[round.event],settled);
});
