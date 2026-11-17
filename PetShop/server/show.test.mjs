import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPetShopServer } from './main.mjs';
import { GameStore } from './game-store.mjs';
import {GAME_EPOCH as epoch, initShow, tickShow, showPage, showAction, themes, rankCash, publicTier,
  matchScores, shopRating, voidShowEntry} from './show.mjs';

const H=3600000, D=24*H;
function animal(name='小花',at=epoch) {
  return {id:name,name,species:'rabbit',breedKey:'angora',coatIndex:1,sex:'母',bornAt:at-H,bred:false,
    traits:['性格','品相','毛发','体态','体型','缺陷'].map(type=>({type,label:'测试',rarity:'普通',grade:'B'}))};
}
function fresh() {
  const s={profileId:'local-test',createdAt:epoch-2*D,rootSeed:'0123456789abcdef'.repeat(4),coins:680,pets:[animal()],rooms:{rabbit:{}}};
  initShow(s,epoch);tickShow(s,epoch);return s;
}
function preview(s,mode,theme,at=epoch,pet=s.pets[0]) {
  const index=Math.floor((at-epoch)/(mode==='public'?7*D:D));
  return showPage(s,'show.review',{mode,event:mode+'-'+index,theme,pet:pet.id},at).actions[0];
}
function enter(s,mode,theme,at=epoch,pet=s.pets[0]) {
  const action=preview(s,mode,theme,at,pet);
  return showAction(s,action.type,action.args,at);
}
test('40个主题，28天覆盖每个私人赛三次，报名窗口左闭右开',()=>{
  const s=fresh(),counts={};
  assert.equal(new Set(themes.map(t=>t.name)).size,40);
  assert.ok(themes.every(t=>t.targets.length===6&&t.targets.every(v=>v>=0&&v<=6)&&t.weights.reduce((a,b)=>a+b,0)===(t.mode==='private'?6:100)));
  const a=preview(s,'private','P01'),b=preview(s,'public','O01');
  assert.throws(()=>showAction(s,a.type,a.args,epoch+22*H),/截止/);
  assert.throws(()=>showAction(s,b.type,b.args,epoch+94*H),/截止/);
  for(let i=0;i<28;i++){
    tickShow(s,epoch+i*D);
    for(const t of s.show.activePrivate.choices) counts[t.id]=(counts[t.id]||0)+1;
  }
  assert.equal(Object.keys(counts).length,28);
  assert.ok(Object.values(counts).every(n=>n===3));
  assert.equal(s.coins,680);
});
test('私人报名按快照扣款，繁育占用及变价拒绝，离店仍给历史杯，重复结算不发两次',()=>{
  const s=fresh(), a=preview(s,'private','P01'); assert.equal(s.coins,680);
  s.rooms.rabbit.job={motherId:s.pets[0].id};assert.throws(()=>showAction(s,a.type,a.args,epoch),/空闲/);
  delete s.rooms.rabbit.job;s.pets[0].traits[1].grade='C';
  assert.throws(()=>showAction(s,a.type,a.args,epoch),/快照/);assert.equal(s.coins,680);
  s.pets[0].traits[1].grade='B';s.pets[0].bred=true;
  showAction(s,a.type,a.args,epoch);
  assert.equal(s.coins,660);
  assert.throws(()=>showAction(s,a.type,a.args,epoch),/已.*报名/);
  s.pets.pop();tickShow(s,epoch+D*2);
  assert.equal(s.show.entries['private-0'].outcome.tier,'gold');
  assert.equal(s.show.cups['P01-gold'].first,'private-0');
  assert.equal(s.show.cups['P01-gold'].count,1);assert.equal(s.pets.length,0);
  assert.equal(s.coins,660);assert.equal(shopRating(s),0.01);
  const recovered=structuredClone(s);tickShow(recovered,epoch+D*2);
  assert.deepEqual(recovered,s);
  const title=showPage(s,'collection.theme',{theme:'P01'},epoch+2*D);
  assert.equal(title.rows[0].link.args.event,'private-0');assert.ok(title.rows[1].title.includes('未收集'));
  assert.deepEqual(title.rows.map(r=>[r.art,!!r.visual?.uncollected,!!r.link]),[
    ['awards/gold',false,true],['awards/silver',true,false],['awards/bronze',true,false],
  ]);
  assert.deepEqual(title.actions[0].args,{mode:'private'});
  // 同主题下轮才可赢得相同档位，首获动物永久保留。
  const day=epoch+28*D;
  tickShow(s,day);s.pets.push(animal('小白',day));
  enter(s,'private','P01',day);tickShow(s,day+D);
  assert.equal(s.pets[0].honor,0.8);assert.equal(s.show.cups['P01-gold'].count,2);
  assert.equal(s.show.cups['P01-gold'].first,'private-0');assert.equal(s.ratingBps,100);
});
test('错过赛窗、店龄门槛和已报名均显示真正可报的下一窗和对应结果',()=>{
  const s=fresh();
  const lobby=(mode,at)=>{
    tickShow(s,at);
    return showPage(s,'show',{},at).rows.find(r=>r.visual.mode===mode&&r.title==='后续参赛时间')?.text;
  };
  assert.match(lobby('private',epoch+22*H),/11\/10 20:00.*11\/11 18:00.*11\/11 20:00/);
  assert.match(lobby('public',epoch+94*H),/11\/16 20:00.*11\/20 18:00.*11\/21 20:00/);
  // Thu 22:00 opening makes the third-day gate Saturday, after the live window closes.
  s.createdAt=epoch+74*H;
  assert.match(lobby('public',epoch+74*H),/11\/16 20:00.*11\/20 18:00/);
  s.createdAt=epoch-2*D;
  tickShow(s,epoch);
  const review=showPage(s,'show.review',{mode:'private',event:'private-0',theme:'P01',pet:s.pets[0].id},epoch);
  assert.match(review.actions[0].confirm,/基准 20 金币，实付 20 金币/);
  enter(s,'private','P01');
  assert.match(lobby('private',epoch),/11\/10 20:00/);
});
test('私人低于68无杯；技术作废只退一次并保留报名历史',()=>{
  const s=fresh();s.pets[0].traits.forEach(t=>t.grade='E');
  enter(s,'private','P01');tickShow(s,epoch+D);
  assert.equal(s.show.entries['private-0'].outcome.tier,null);assert.equal(s.ratingBps,0);
  const s2=fresh();enter(s2,'private','P01');assert.equal(voidShowEntry(s2,'private-0','服务端赛表错误'),true);
  assert.equal(s2.coins,680);assert.equal(voidShowEntry(s2,'private-0','重复'),false);
  tickShow(s2,epoch+D);assert.equal(s2.ratingBps,0);assert.equal(s2.show.entries['private-0'].outcome,undefined);
});
test('公开档位与并列现金的边界符合设计',()=>{
  assert.equal(publicTier(1,0),null);assert.equal(publicTier(1,1),'memorial');
  assert.deepEqual([1,2].map(n=>publicTier(n,2)),['silver','memorial']);
  assert.deepEqual([1,2,3,4,5].map(n=>publicTier(n,5)),['gold','silver','bronze','bronze','memorial']);
  for(const [n,total] of [[1,20],[2,90],[5,586],[10,1920],[100,6770]]){
    assert.equal(Array.from({length:n},(_,i)=>Math.max(20,rankCash(i+1,1,n))).reduce((a,b)=>a+b,0),total);
  }
  assert.equal(rankCash(1,2,100),405);assert.equal(rankCash(1,3,100),360);assert.equal(rankCash(1,1,0),0);
  const m=matchScores([6,6,6,6,6,6],themes[0]);
  assert.equal(m.total,0);
});
test('公开对手按种子独立冻结，报名不改变对手；同分抽签分杯、不影响并列现金',()=>{
  const s=fresh(), first=s.show.weeks['public-0'], other=fresh();
  assert.deepEqual(first,other.show.weeks['public-0']);
  for(const arr of Object.values(first.bots)) {
    assert.equal(arr.length,99);assert.ok(arr.every(v=>v.length===6&&v.every(g=>Number.isInteger(g)&&g>=0&&g<=6)));
  }
  assert.equal(createHash('sha256').update(Buffer.from(first.seed,'hex')).digest('hex'),first.commit);
  for(const genes of first.bots.rabbit) genes.splice(0,6,...first.theme.targets);
  s.pets[0].traits.forEach((t,i)=>t.grade=['E','D','C','B','A','S','S+'][first.theme.targets[i]]);
  const frozen=structuredClone(first);enter(s,'public','O01');
  assert.deepEqual(first,frozen);assert.equal(s.coins,680);s.pets=[];
  assert.equal(showPage(s,'show.board',{event:first.id},epoch).rows.length,0);
  tickShow(s,epoch+5*D);
  const entry=s.show.entries[first.id];
  assert.equal(entry.outcome.tieSize,100);assert.equal(entry.outcome.nq,100);
  assert.equal(entry.outcome.rankReward,53);assert.equal(s.coins,700);
  const cards=showPage(s,'show.board',{event:first.id},epoch+5*D).rows.slice(0,5);
  assert.deepEqual(cards.map(r=>parseInt(r.text)),[5,15,30,30,20]);
  assert.deepEqual(showPage(s,'show.board',{event:first.id,species:'cat'},epoch+5*D).rows.slice(0,5).map(r=>parseInt(r.text)),[4,15,30,30,20]);
  const resumed=structuredClone(s);tickShow(resumed,epoch+6*D);assert.equal(resumed.coins,733);
  assert.equal(resumed.show.entries[first.id].cashPaid,33);
  tickShow(resumed,epoch+6*D+1);assert.equal(resumed.coins,733);
  assert.equal(Object.keys(resumed.show.cups).length,1);
});
test('获奖名单沿用本店报名头像；各物种模拟头像与详情一致，查看不改名次或存档',()=>{
  const s=fresh(), event='public-0', now=epoch+5*D;
  s.pets[0].coatIndex=4;
  s.pets[0].bornAt=epoch-3*D-H;
  const registration={event,mode:'public',theme:'O01',pet:s.pets[0].id};
  assert.equal(showPage(s,'show',{},epoch).visual.petStage,'老年');
  assert.equal(showPage(s,'show.round',registration,epoch).rows.find(r=>r.link?.page==='show.review').stage,'老年');
  assert.equal(showPage(s,'show.review',registration,epoch).stage,'老年');
  enter(s,'public','O01');
  const entry=s.show.entries[event];
  s.pets=[];
  tickShow(s,now);
  const saved=structuredClone(s);
  assert.equal(showPage(s,'show.result',{event},now).rows.find(r=>r.title.startsWith('报名快照')).stage,'老年');
  function winners(species,tier) {return showPage(s,'show.tier',{event,species,tier},now).rows;}
  const mine=winners('rabbit',entry.outcome.tier).find(r=>r.link.page==='show.result');
  assert.equal(mine.art,'pets/angora-coat04_female');
  assert.equal(mine.stage,entry.pet.stage);
  assert.deepEqual(mine.link.args,{event});
  for(const [species,art] of Object.entries({rabbit:'pets/angora-coat01_female',cat:'pets/british-coat01_female',dog:'pets/shiba-coat01_male'})) {
    const rows=winners(species,'gold').filter(r=>r.link.page==='show.bot');
    assert.ok(rows.length);
    for(const row of rows) {assert.equal(row.art,art);assert.equal(row.stage,undefined);}
    const {page,args}=rows[0].link;
    const bot=showPage(s,page,args,now);
    assert.equal(bot.rows[0].art,art);assert.match(bot.rows[0].text,/物种示意/);
    assert.equal(bot.rows[1].title,'六维快照');
  }
  assert.deepEqual(s,saved);
  const emptyTheme=showPage(s,'collection.theme',{theme:'O02'},now);
  assert.deepEqual(emptyTheme.rows.map(r=>r.art),['awards/laurel','awards/gold','awards/silver','awards/bronze','awards/memorial']);
  assert.ok(emptyTheme.rows.every(r=>r.visual?.uncollected&&!r.link&&r.title.includes('未收集')));
});
test('周末离线跨过两次结算，最低分依然有纪念杯且没有现金',()=>{
  const s=fresh();for(const t of s.pets[0].traits)t.grade='E';
  enter(s,'public','O01');tickShow(s,epoch+7*D+1);
  const e=s.show.entries['public-0'];
  assert.ok(e.outcome.tier);assert.equal(e.outcome.guarantee,0);
  assert.equal(e.cashPaid,0);assert.equal(e.cashClosed,true);assert.equal(s.coins,680);
  assert.equal(s.show.weeks['public-1'].theme.id,'O02');
});
test('正式HTTP入口完成报名、查原请求和服务器重启后的领奖',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'petshop-contest-http-'));
  let now=epoch, server;
  t.after(async ()=>{
    if(server?.listening) await new Promise(resolve=>server.close(resolve));
    if(path.dirname(dir)===path.resolve(tmpdir()) && path.basename(dir).startsWith('petshop-contest-http-'))
      await rm(dir,{recursive:true,force:true});
  });
  async function launch() {
    const store=new GameStore(dir,{wall:()=>now,monotonic:()=>0});
    store.ensure();
    if(store.state.shopXp===0){store.state.shopXp=30;store.state.createdAt=epoch-2*D;store.save(store.state);}
    server=createPetShopServer(undefined,{store});
    server.listen(0,'127.0.0.1');await once(server,'listening');
    return 'http://127.0.0.1:'+server.address().port;
  }
  let origin=await launch();
  async function post(route,data) {
    const response=await fetch(origin+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    assert.equal(response.status,200);return response.json();
  }
  const desk=await post('page',{page:'show'});
  const first=await post('page',desk.page.rows[0].link);
  const named=first.page.rows.find(r=>r.link?.page==='show.review');
  const confirm=await post('page',named.link);
  const {type,args}=confirm.page.actions[0];
  const payload={requestId:'show-integration-0001',profileId:confirm.shop.profileId,version:confirm.shop.version,type,args};
  const receipt=await post('action',payload);
  assert.deepEqual(await post('action',payload),receipt);
  await new Promise(resolve=>server.close(resolve));
  now+=D;
  origin=await launch();
  const replay=await (await fetch(origin+'/api/receipts/'+payload.requestId)).json();
  assert.deepEqual(replay,receipt);
  const result=await post('page',{page:'show.result',args:{event:'private-0'}});
  assert.equal(result.shop.coins,660);
  assert.ok(result.page.rows.some(r=>r.title==='获得金杯'));
});
test('停服整周的名单与持续运行时冻结的同周相同，查历史不能补报名和领钱',()=>{
  const offline=fresh(), online=fresh(), start=epoch+7*D, later=start+15*D;
  tickShow(online,start);
  tickShow(online,later);tickShow(offline,later);
  assert.ok(!Object.hasOwn(offline.show.weeks,'public-1'));
  const frozen=structuredClone(offline);
  const archive=showPage(offline,'show.archive',{},later);
  assert.deepEqual(archive.rows.map(r=>r.link.args.event),['public-2','public-1','public-0']);
  for(const species of ['rabbit','cat','dog']){
    const args={event:'public-1',species};
    const page=showPage(offline,'show.board',args,later);
    assert.deepEqual(page,showPage(online,'show.board',args,later));
    assert.deepEqual(page.rows.slice(0,5).map(r=>parseInt(r.text)),[4,15,30,30,20]);
    for(const row of page.rows.slice(0,5)){
      const actual=showPage(offline,row.link.page,row.link.args,later);
      assert.deepEqual(actual,showPage(online,row.link.page,row.link.args,later));
      const bot=actual.rows[0].link;
      assert.deepEqual(showPage(offline,bot.page,bot.args,later),showPage(online,bot.page,bot.args,later));
    }
  }
  assert.throws(()=>showAction(offline,'show.enter',{mode:'public',event:'public-1',theme:'O02',pet:'小花'},later),/截止/);
  assert.deepEqual(offline,frozen);
});
test('旧档迁移保留已冻结主题与对手，开店前已开奖及未来期不展示，跨百年按八期分页',()=>{
  const s=fresh();
  delete s.show.calendar;s.createdAt=epoch+3*7*D+5*D+1;
  // Reuse the account at a later opening date with no historical personal entries.
  s.show.weeks={};
  const open=s.createdAt;
  tickShow(s,open);
  assert.equal(s.show.calendar.firstWeek,4);
  assert.equal(showPage(s,'show.archive',{},open).rows.length,0);
  const last=open+5217*7*D; // An abnormal forward clock should not materialize decades of bot arrays.
  s.show.weeks['public-3'].bots.rabbit[0].fill(6);
  const old=structuredClone(s.show.weeks['public-3']);
  tickShow(s,last);
  assert.deepEqual(s.show.weeks['public-3'],old);assert.equal(Object.keys(s.show.weeks).length,2);
  const archive=showPage(s,'show.archive',{},last);
  assert.equal(archive.rows.length,8);
  const next=showPage(s,archive.actions.at(-1).page,archive.actions.at(-1).args,last);
  assert.equal(next.rows.length,8);assert.notEqual(archive.rows.at(-1).link.args.event,next.rows[0].link.args.event);
  const oldest=showPage(s,'show.archive',{cursor:1000000},last);
  assert.equal(oldest.rows.at(-1).link.args.event,'public-4');
  for(const id of ['public-0','public-3','public-99999999','public--1','public-01','__proto__']){
    assert.equal(showPage(s,'show.board',{event:id},last).rows.length,0);
  }
  assert.equal(s.coins,680);assert.equal(s.ratingBps,0);
});
