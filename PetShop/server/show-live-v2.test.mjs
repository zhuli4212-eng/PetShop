import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_EPOCH as epoch,initShow,tickShow,showPage,showAction,matchScores} from './show.mjs';
import {scoreShowGrades} from './show-rules-v2.mjs';

const D=86400000;
function fresh(v2=true){
  const pets=['rabbit','cat','dog'].map((species,i)=>({id:'animal-'+species,name:'参赛样本'+i,species,
    breedKey:['angora','british','shiba'][i],coatIndex:1,sex:'公',bornAt:epoch-D,
    traits:['性格','品相','毛发','体态','体型','缺陷'].map(type=>({type,grade:'S+',label:'测试',rarity:'普通'}))}));
  const s={profileId:'v2-live',createdAt:epoch-2*D,rootSeed:'0123456789abcdef'.repeat(4),coins:10000,
    pets,rooms:Object.fromEntries(pets.map(p=>[p.species,{openedAt:epoch-D}]))};
  initShow(s,epoch);if(v2){s.show.scoringVersion=2;s.show.v2FirstWeek=0;}
  tickShow(s,epoch);return s;
}
function enter(s,mode,theme,at=epoch){
  const r=mode==='private'?s.show.activePrivate:s.show.weeks['public-'+Math.floor((at-epoch)/(7*D))];
  const p=s.pets.find(p=>mode==='private'||p.species===r.theme.species);
  const page=showPage(s,'show.review',{mode,event:r.id,theme:theme.id,pet:p.id},at);
  const action=page.actions.find(a=>a.type==='show.enter');assert.ok(action,JSON.stringify(page));
  showAction(s,action.type,action.args,at);return s.show.entries[r.id];
}
function privateRound(s,count){return s.show.activePrivate.choices.find(t=>t.rules.attributes.length===count);}
function safe(page){
  assert.doesNotMatch(JSON.stringify(page),/coreAttribute|"rules"|coreBonus|"seed"|"draw"/);
}

test('本地新赛期持久化1/3/5项及同场核心，重复读取与重启不重抽；普通运行仍保留旧赛事',()=>{
  const s=fresh(),draw=structuredClone(s.show);
  assert.deepEqual(s.show.activePrivate.choices.map(t=>t.rules.attributes.length),[1,3,5]);
  for(const t of s.show.activePrivate.choices){
    assert.equal(new Set(t.rules.attributes).size,t.rules.attributes.length);
    assert.ok(t.rules.attributes.length===1?t.rules.coreAttribute===null:t.rules.attributes.includes(t.rules.coreAttribute));
  }
  for(let i=0;i<3;i++){safe(showPage(s,'show',{},epoch));initShow(s,epoch);tickShow(s,epoch);}
  assert.deepEqual(s.show,draw);const restored=structuredClone(s);tickShow(restored,epoch);assert.deepEqual(restored,s);
  assert.ok(!fresh(false).show.activePrivate.choices[0].rules);
});

test('三类私人赛真正报名、扣费和结算到九杯身份，每场只给最高杯，离店后仍保留且不重复发奖',()=>{
  for(const count of [1,3,5]){
    const s=fresh(),t=privateRound(s,count),entry=enter(s,'private',t),balance=s.coins;
    assert.equal(entry.fee,20);s.pets=[];tickShow(s,epoch+D);
    assert.equal(entry.outcome.match.total,scoreShowGrades([6,6,6,6,6,6],t.rules));
    assert.equal(entry.outcome.tier,'gold');assert.equal(s.coins,balance);
    assert.deepEqual(Object.keys(s.show.cups),[t.id+'-gold']);assert.equal(s.show.cups[t.id+'-gold'].count,1);
    safe(showPage(s,'show.result',{event:entry.id},epoch+D));
    const snapshot=structuredClone(s);tickShow(s,epoch+D);assert.deepEqual(s,snapshot);
    const book=showPage(s,'collection',{},epoch+D);assert.match(book.subtitle,/1 \/ 9/);assert.equal(book.rows.length,3);
  }
});

test('新公开赛按真实过线分数档同分同奖，低分不补位，旧经济仅作显式临时参数',()=>{
  const s=fresh(),w=s.show.weeks['public-0'],species=w.theme.species;
  w.bots[species]=[[6,6,6,6,6,6],[6,6,6,6,6,6],[5,5,5,5,5,5],[0,0,0,0,0,0]];
  const entry=enter(s,'public',w.theme),balance=s.coins;
  tickShow(s,epoch+5*D);
  assert.equal(entry.fee,0);assert.equal(entry.outcome.tier,'laurel');assert.equal(entry.outcome.tieRank,1);
  assert.equal(entry.outcome.tieSize,3);assert.equal(entry.outcome.nq,4);
  const board=showPage(s,'show.board',{event:w.id},epoch+5*D);safe(board);
  assert.equal(parseInt(board.rows[0].text),3);assert.equal(parseInt(board.rows[1].text),1);
  assert.equal(board.rows.slice(2,5).reduce((n,r)=>n+parseInt(r.text),0),0);
  assert.match(board.rows.at(-1).text,/临时参数/);
  const names=showPage(s,'show.tier',{event:w.id,tier:'laurel'},epoch+5*D);safe(names);
  assert.equal(names.rows.length,3);assert.ok(names.rows.every(r=>r.text.includes('第 1 分数档')));
  const old=entry.outcome.rankReward;tickShow(s,epoch+6*D);
  assert.equal(s.coins,balance+Math.max(entry.outcome.guarantee,old));
  const snapshot=structuredClone(s);tickShow(s,epoch+6*D);assert.deepEqual(s,snapshot);
});

test('公开4/5项交错及已开物种轮换固定，异物种拒绝，所有页面不泄露内部难度与核心',()=>{
  const s=fresh(),names=[];
  for(let index=0;index<3;index++){
    const at=epoch+index*7*D;s.pets.forEach(p=>{p.bornAt=at-D;});
    tickShow(s,at);const w=s.show.weeks['public-'+index];names.push(w.theme.species);
    assert.equal(w.theme.rules.attributes.length,index%2?5:4);
    const wrong=s.pets.find(p=>p.species!==w.theme.species);
    const args={mode:'public',event:w.id,theme:w.theme.id,pet:wrong.id};
    assert.match(showPage(s,'show.review',args,at).rows[0].title,/仅限/);
    const lobby=showPage(s,'show',{},at);lobby.rows=lobby.rows.filter(r=>r.visual.mode==='public');
    for(const page of [lobby,showPage(s,'show.round',args,at),
      showPage(s,'show.review',{...args,pet:s.pets.find(p=>p.species===w.theme.species).id},at)]){
      safe(page);assert.doesNotMatch(JSON.stringify(page),/困难|极难|核心|4项|5项|四项|五项/);
    }
  }
  assert.deepEqual(names,['dog','cat','rabbit']);
});

test('新公开赛离线重建与已冻结同场一致，查看历史不补报名不发奖；旧报名仍用原规则',()=>{
  const offline=fresh(),online=fresh();tickShow(online,epoch+7*D);
  tickShow(online,epoch+15*D);tickShow(offline,epoch+15*D);
  assert.ok(!offline.show.weeks['public-1']);
  const saved=structuredClone(offline);
  assert.deepEqual(showPage(offline,'show.board',{event:'public-1'},epoch+15*D),showPage(online,'show.board',{event:'public-1'},epoch+15*D));
  assert.deepEqual(offline,saved);
  const old=fresh(false),theme=old.show.activePrivate.choices[0];
  old.pets[0].traits.forEach((t,i)=>{t.grade=['E','D','C','B','A','S','S+'][theme.targets[i]];});
  const entry=enter(old,'private',theme);old.show.scoringVersion=2;old.show.v2FirstWeek=1;
  tickShow(old,epoch+D);assert.equal(entry.outcome.tier,'gold');assert.ok(!entry.theme.rules);
  assert.equal(entry.outcome.match.total,matchScores(entry.pet.scores,theme).total);
  assert.ok(old.show.activePrivate.choices[0].rules);
  const book=showPage(old,'collection',{},epoch+D);assert.match(book.subtitle,/0 \/ 9.*历史/);
  assert.ok(book.rows.some(r=>r.title.startsWith('历史 · ')));
});
