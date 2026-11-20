import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { initCare, carePage, lifeDates, stageEnd } from './care.mjs';
import { salePrice } from './business.mjs';
import { getPetTags, cardQualityScore } from './animal-traits.mjs';
import { defectDisplayLabel } from './defect.mjs';
import { ShopEngine } from './shop-engine.mjs';

const now=Date.UTC(2026,10,20,4);
function fixture(){const s={coins:680,ratingBps:0,research:{rabbit:[0,0,0],cat:[0,0,0],dog:[0,0,0]}};initCare(s,now);return s;}

test('最近一窝仅在首次查看前出现在繁育台，房间始终可重看',()=>{
  const game=new ShopEngine({wall:()=>now,monotonic:()=>0});
  game.ensure();
  const room=game.state.rooms.rabbit;
  room.lastLitter={ids:[game.state.pets[0].id],bornAt:now-2000,mother:'兔妈妈',father:'兔爸爸'};
  const canReview=()=>game.page('breed').page.actions.some(choice=>choice.page==='litter');
  assert.equal(canReview(),true);
  assert.equal(game.page('litter').page.presentation.kind,'litter');
  assert.equal(canReview(),false);
  assert.ok(game.page('rooms').page.rows.some(row=>row.link?.page==='litter'));
  game.state.rooms.rabbit.lastLitter={ids:[game.state.pets[1].id],bornAt:now-1000,mother:'兔妈妈',father:'兔爸爸'};
  assert.equal(canReview(),true);
});

test('名册和档案传真实标签、五项等级和独立缺陷；保留现价与真实记录',()=>{
  const s=fixture(),p=s.pets[0];
  p.reviews=1;p.reviewHistory=[{field:0,at:now,before:'温顺',after:'温顺',beforeRarity:'普通',afterRarity:'少见',grade:p.traits[0].grade}];
  const roster=carePage(s,'rooms',{},now),row=roster.rows.find(row=>row.animal?.id===p.id);
  assert.equal(row.animal.traits.length,5);
  assert.deepEqual(row.animal.tags,getPetTags(p));
  assert.deepEqual(row.animal.defect,{label:defectDisplayLabel(p.traits[5].grade),grade:p.traits[5].grade});
  assert.equal(row.animal.stageEndsAt,stageEnd(p,now));
  assert.equal(row.animal.score,cardQualityScore(p.traits));
  const page=carePage(s,'pet',{id:p.id},now);
  assert.equal(page.presentation.traits.length,5);
  assert.deepEqual(page.presentation.animal.tags,row.animal.tags);
  for(const title of ['品种和品质','阶段与繁育','荣誉加价','店铺加成'])assert.ok(!page.rows.some(row=>row.title===title));
  for(const title of ['阶段','来源','实际年龄','出生时刻','成年时刻'])assert.ok(page.rows.some(row=>row.title===title));
  assert.equal(page.rows.find(row=>row.title==='当前市场估值').text.split(' 金币')[0],String(salePrice(s,p,now,'market')));
  assert.ok(page.rows.some(row=>row.title==='性格复评'&&row.text.includes('普通） → 温顺（少见')));
});

test('复评只展示已有标签，只有一条随机使用动作，不允许界面指定维度',()=>{
  const s=fixture(),p=s.pets[0];s.rooms.rabbit.items.review=1;
  const page=carePage(s,'review',{species:'rabbit',id:p.id},now);
  assert.equal(page.presentation.kind,'review');
  assert.deepEqual(page.presentation.animal.tags,getPetTags(p));
  assert.ok(page.rows.some(row=>row.title.includes('可能降档')));
  assert.ok(page.rows.every(row=>!row.action));
  const actions=page.actions.filter(a=>a.type==='care.review');
  assert.equal(actions.length,1);
  assert.deepEqual(actions[0].args,{species:'rabbit',id:p.id});
  assert.match(actions[0].confirm,/随机改变 1 条标签的稀有度，可能降档/);
  assert.equal(actions[0].disabled,false);
  s.rooms.rabbit.items.review=0;
  assert.equal(carePage(s,'review',{species:'rabbit',id:p.id},now).actions.find(a=>a.type==='care.review').disabled,true);
});

test('档案阶段终点随真实阶段推进，寿终后不继续倒计时',()=>{
  const s=fixture(),p=s.pets[0],dates=lifeDates(p);
  for(const [at,stage,end] of [[dates.growthAt-1,'幼年',dates.growthAt],[dates.growthAt,'成长',dates.adultAt],
    [dates.adultAt,'成年',dates.oldAt],[dates.oldAt,'老年',dates.deathAt],[dates.deathAt,'已故',null]]){
    const a=carePage(s,'pet',{id:p.id},at).presentation.animal;
    assert.equal(a.stage,stage);assert.equal(a.stageEndsAt,end);
  }
});

test('阶段计时按原始剩余量跨 24 小时、1 小时及最后一秒边界',()=>{
  // Exercise the real Cocos formatter without importing the engine or creating a save.
  const source=readFileSync(new URL('../assets/scripts/ShopSession.ts',import.meta.url),'utf8');
  const block=source.slice(source.indexOf('export function stageTime'),source.indexOf('function renderState'));
  const format=runInNewContext(block.replace('export ','').replace('seconds:number','seconds').replace('):string',')')+';stageTime');
  for(const [seconds,text] of [[90000,'1 天'],[86400,'1 天'],[86399.999,'23 小时 59 分'],[3600,'1 小时 0 分'],
    [3599.999,'59 分 59 秒'],[60,'1 分 0 秒'],[59.999,'0 分 59 秒'],[.001,'0 分 1 秒'],[0,'0 分 0 秒'],[-1,'0 分 0 秒']])assert.equal(format(seconds),text);
});
