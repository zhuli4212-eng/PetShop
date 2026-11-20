import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOW_SCORING_VERSION,createShowRuleSnapshot,scoreShowGrades,
  privateAwardTier,rankPublicScores,publicShowRuleView} from './show-rules-v2.mjs';

const rule=(mode,count,coreAttribute=count===1?null:0)=>
  createShowRuleSnapshot({mode,attributes:Array.from({length:count},(_,i)=>i),coreAttribute});
const four=rule('public',4),five=rule('public',5);

test('approved counts, dimensions and core are required; caller arrays cannot change a frozen round',()=>{
  const attributes=[0,2,4];
  const r=createShowRuleSnapshot({mode:'private',attributes,coreAttribute:2});
  attributes[0]=1;
  assert.deepEqual(r.attributes,[0,2,4]);
  assert.equal(r.scoringVersion,SHOW_SCORING_VERSION);
  assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.attributes));
  assert.throws(()=>{r.coreAttribute=4;},TypeError);
  assert.throws(()=>{r.attributes[0]=1;},TypeError);
  for(const args of [
    {},{mode:'__proto__',attributes:[0]},
    {mode:'private',attributes:[0,1],coreAttribute:0},
    {mode:'public',attributes:[0,1,2],coreAttribute:0},
    {mode:'public',attributes:[0,1,2,2],coreAttribute:2},
    {mode:'public',attributes:[0,1,2,5],coreAttribute:0},
    {mode:'private',attributes:[0],coreAttribute:0},
    {mode:'private',attributes:[0,1,2]},
    {mode:'private',attributes:[0,1,2],coreAttribute:4},
  ]) assert.throws(()=>createShowRuleSnapshot(args),TypeError);
});

test('only examined attributes count; labels are absent; defect is a multiplier and single events have no core',()=>{
  const single=createShowRuleSnapshot({mode:'private',attributes:[2]});
  assert.equal(scoreShowGrades([0,0,4,0,0,4],single),96); // A x defect A
  assert.equal(scoreShowGrades([6,6,4,6,6,4],single),96);
  assert.equal(scoreShowGrades([6,6,4,6,6,0],single),32);
  const triple=createShowRuleSnapshot({mode:'private',attributes:[0,2,4],coreAttribute:2});
  assert.equal(scoreShowGrades([4,6,5,6,6,4],triple),372); // (80+100+120+10) x1.2
  assert.equal(scoreShowGrades([4,0,5,0,6,4],triple),372);
});

test('highest final scores are 192,595,979 for private and 787,979 for public',()=>{
  const full=[6,6,6,6,6,6],empty=[0,0,0,0,0,0];
  for(const [mode,count,max] of [['private',1,192],['private',3,595],['private',5,979],['public',4,787],['public',5,979]]){
    assert.equal(scoreShowGrades(full,rule(mode,count)),max);
    assert.equal(scoreShowGrades(empty,rule(mode,count)),0);
  }
});

test('integer rational scoring rounds once after the defect multiplier, including fractions on either side',()=>{
  const triple=rule('private',3);
  assert.equal(scoreShowGrades([1,0,0,0,0,3],triple),22);
  assert.equal(scoreShowGrades([1,0,0,0,0,4],triple),26); // 26.4
  assert.equal(scoreShowGrades([1,0,0,0,0,5],triple),31); // 30.8
  assert.equal(scoreShowGrades([2,0,0,0,0,2],triple),35); // 35.2
  assert.equal(scoreShowGrades([2,0,0,0,0,4],triple),53); // 52.8
  // Current grade/coefficient grid yields fifths, so there is no reachable .5.
  // Compare every grade combination with an independent literal design formula.
  for(let encoded=0;encoded<7**6;encoded++){
    let n=encoded;
    const grades=Array.from({length:6},()=>{const digit=n%7;n=Math.floor(n/7);return digit;});
    const raw=(grades.slice(0,5).reduce((sum,g)=>sum+20*g,0)+2*grades[0])*(2+grades[5])/5;
    assert.equal(scoreShowGrades(grades,five),Math.round(raw));
  }
});

test('restored snapshots preserve one fixed core across entrants and retries without a draw',()=>{
  const r=rule('private',3,1),restored=JSON.parse(JSON.stringify(r));
  const scores=[4,5,6,0,0,3];
  assert.equal(scoreShowGrades(scores,r),310);
  assert.equal(scoreShowGrades(scores,restored),310);
  assert.equal(scoreShowGrades(scores,restored),310);
  assert.equal(scoreShowGrades([6,4,5,0,0,3],restored),308);
  assert.equal(restored.coreAttribute,1);
  assert.throws(()=>scoreShowGrades(scores,{...restored,scoringVersion:1}),TypeError);
  assert.throws(()=>scoreShowGrades(scores,{...restored,coreAttribute:4}),TypeError);
});

test('private cup boundaries include equality and return only the highest earned cup',()=>{
  for(const [count,limits] of [[1,[96,120,140]],[3,[328,394,458]],[5,[610,680,767]]]){
    const r=rule('private',count);
    assert.equal(privateAwardTier(0,r),null);
    const tiers=[null,'bronze','silver','gold'];
    limits.forEach((limit,i)=>{
      assert.equal(privateAwardTier(limit-1,r),tiers[i]);
      assert.equal(privateAwardTier(limit,r),tiers[i+1]);
    });
    assert.equal(privateAwardTier(scoreShowGrades([6,6,6,6,6,6],r),r),'gold');
  }
  assert.throws(()=>privateAwardTier(500,four),TypeError);
});

test('public qualification includes 470/655; nobody below the line fills an empty award band',()=>{
  for(const [r,limit] of [[four,470],[five,655]]){
    const ranked=rankPublicScores([{id:'below',score:limit-1},{id:'equal',score:limit}],r,
      {rewardKeys:['first','second','third','fourth']});
    assert.deepEqual(ranked.entries,[
      {id:'equal',score:limit,qualified:true,rank:1,rewardKey:'first'},
      {id:'below',score:limit-1,qualified:false,rank:null,rewardKey:null},
    ]);
    assert.equal(ranked.qualifiedScoreBands,1);
    assert.equal(ranked.qualifiedCount,1);
  }
  assert.deepEqual(rankPublicScores([],four,{rewardKeys:['first']}),{
    entries:[],qualifiedCount:0,qualifiedScoreBands:0,rewardsConfigured:true,
  });
  assert.equal(rankPublicScores([{id:'only',score:469}],four,{rewardKeys:['first']}).entries[0].rewardKey,null);
});

test('equal final scores share dense rank and reward; entrant order cannot split a tie',()=>{
  const entries=[{id:'a',score:600},{id:'b',score:700},{id:'c',score:700},{id:'d',score:500},{id:'e',score:469}];
  const original=structuredClone(entries),options={rewardKeys:['top','runner-up']};
  const ranked=rankPublicScores(entries,four,options);
  assert.deepEqual(entries,original);
  assert.deepEqual(ranked.entries.map(e=>[e.id,e.rank,e.rewardKey]),[
    ['b',1,'top'],['c',1,'top'],['a',2,'runner-up'],['d',3,null],['e',null,null],
  ]);
  const reversed=rankPublicScores([...entries].reverse(),four,options);
  const indexed=result=>Object.fromEntries(result.entries.map(e=>[e.id,{rank:e.rank,rewardKey:e.rewardKey}]));
  assert.deepEqual(indexed(ranked),indexed(reversed));
  assert.equal(ranked.qualifiedCount,4);
  assert.equal(ranked.qualifiedScoreBands,3);
});

test('undecided public rewards have no implicit five-band default or cash allocation',()=>{
  const result=rankPublicScores([{id:'a',score:700},{id:'b',score:600}],four);
  assert.equal(result.rewardsConfigured,false);
  assert.deepEqual(result.entries.map(e=>[e.rank,e.rewardKey]),[[1,null],[2,null]]);
  const none=rankPublicScores([{id:'a',score:700}],four,{rewardKeys:[]});
  assert.equal(none.rewardsConfigured,true);
  assert.equal(none.entries[0].rewardKey,null);
});

test('public response projections hide core and difficulty even after loading or adding internal metadata',()=>{
  const restored={...JSON.parse(JSON.stringify(four)),coreBonus:10,seed:'secret',difficulty:'hard',threshold:470};
  assert.deepEqual(publicShowRuleView(restored),{scoringVersion:2,mode:'public'});
  assert.deepEqual(publicShowRuleView(five),publicShowRuleView(four));
  assert.deepEqual(publicShowRuleView(rule('private',3)),{
    scoringVersion:2,mode:'private',attributes:[0,1,2],attributeCount:3,cupThresholds:{bronze:328,silver:394,gold:458},
  });
  const privateRules=createShowRuleSnapshot({mode:'private',attributes:[0,2,4],coreAttribute:2});
  const privateView=publicShowRuleView(privateRules);
  assert.deepEqual(privateView.attributes,[0,2,4]);
  privateView.attributes[0]=1;
  assert.deepEqual(privateRules.attributes,[0,2,4]);
  const board=rankPublicScores([{id:'a',score:700,rules:restored,seed:'secret'}],restored);
  assert.equal(JSON.stringify(board).includes('secret'),false);
  assert.deepEqual(Object.keys(board.entries[0]),['id','score','qualified','rank','rewardKey']);
  assert.equal(Object.hasOwn(publicShowRuleView(restored),'coreAttribute'),false);
});

test('reject malformed grades, fractional or impossible scores, duplicate entries and invalid reward configuration',()=>{
  for(const grades of [null,[],new Array(6),[0,0,0,0,0],[0,0,0,0,0,7],[0,0,0,0,0,-1],[0,0,0,0,0,1.5],[0,0,0,0,0,NaN]])
    assert.throws(()=>scoreShowGrades(grades,four),TypeError);
  for(const score of [NaN,Infinity,-1,470.5,788,'470'])
    assert.throws(()=>rankPublicScores([{id:'a',score}],four),TypeError);
  assert.throws(()=>rankPublicScores([{id:'a',score:500},{id:'a',score:600}],four),TypeError);
  assert.throws(()=>rankPublicScores([{id:'',score:500}],four),TypeError);
  assert.throws(()=>rankPublicScores([],rule('private',3)),TypeError);
  for(const rewardKeys of [null,5,new Array(2),[''],[{}]])
    assert.throws(()=>rankPublicScores([],four,{rewardKeys}),TypeError);
});
