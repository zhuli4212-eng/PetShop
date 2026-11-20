import test from 'node:test';
import assert from 'node:assert/strict';
import { GRADES, defectTrait, defectProbabilities, defectDisplayLabel } from './defect.mjs';
import { TRAIT_FIELDS, getPetTags, traitCapacity, fixedTagSubset, taggedTraits, inheritedTag,
  reviewedRarity, normalizeStoredTags, tagIdFor, cardQualityScore } from './animal-traits.mjs';
import { scoreRiseChance, rareRedrawPercent } from './research-effects.mjs';

const legacyTraits=grade=>TRAIT_FIELDS.map((type,i)=>({type,grade,label:['温顺','清秀','柔软','匀称','紧凑'][i],rarity:'普通'})).concat(defectTrait(grade));

test('卡片评分用前五项分数和乘缺陷系数，最低零分、最高 960 分',()=>{
  const traits=legacyTraits('B');
  assert.equal(cardQualityScore(traits),300);
  for(const [i,expected] of [120,180,240,300,360,420,480].entries()){
    traits[5]=defectTrait(GRADES[i]);
    assert.equal(cardQualityScore(traits),expected);
  }
  assert.equal(cardQualityScore(legacyTraits('E')),0);
  assert.equal(cardQualityScore(legacyTraits('S+')),960);
  assert.equal(cardQualityScore(traits.slice(0,5)),undefined);
});
function traitsAt(score) {
  let remaining=score/20;
  return legacyTraits('E').map(t=>{const index=Math.min(6,remaining);remaining-=index;return {...t,grade:GRADES[index]};});
}

test('六项评级决定五档容量，缺陷作为一项分数且标签稀有度不加分',()=>{
  for(const [score,limit] of [[0,1],[280,1],[300,2],[380,2],[400,3],[460,3],[480,4],[560,4],[580,5],[720,5]]) {
    const pet={traits:traitsAt(score)};
    assert.deepEqual(traitCapacity(pet),{score,band:limit,limit});
    pet.traits.slice(0,5).forEach(t=>t.rarity='稀有');
    assert.equal(traitCapacity(pet).limit,limit);
  }
  for(const [grade,score,limit] of [['B',360,2],['A',480,4],['S',600,5]])
    assert.deepEqual(traitCapacity({traits:legacyTraits(grade)}),{score,band:limit,limit});
});

test('新动物首条必出，其他槽在80%处划界，维度无重复且缺陷不生成标签',()=>{
  for(const [score,limit] of [[0,1],[300,2],[400,3],[480,4],[580,5]]) {
    for(const [roll,count] of [[.799999,limit],[.8,1]]) {
      const generated=fixedTagSubset(traitsAt(score),()=>roll);
      assert.equal(generated.traits.length,6);
      assert.equal(generated.tagCount,count);
      assert.equal(generated.tagRulesVersion,2);
      const tags=getPetTags(generated);
      assert.equal(tags.length,count);
      assert.equal(new Set(tags.map(t=>t.dimension)).size,count);
      assert.ok(tags.every(t=>t.dimension<5&&t.tagId));
      assert.deepEqual(generated.traits.map(t=>t.grade),traitsAt(score).map(t=>t.grade));
      for(const trait of generated.traits.slice(0,5).filter(t=>t.tagId===null))
        assert.deepEqual([trait.label,trait.rarity],[null,null]);
    }
  }
  for(let dimension=0;dimension<5;dimension++)
    assert.equal(getPetTags(fixedTagSubset(traitsAt(0),()=>dimension/5+.01))[0].dimension,dimension);
});

test('来源父35%母35%重抽30%，抽到缺维亲本转重抽而不减少条数',()=>{
  const mother={traits:legacyTraits('B')},father={traits:legacyTraits('S')};
  mother.traits[0].label='好奇';father.traits[0].rarity='少见';
  const redraw=()=>({label:'从容',rarity:'稀有'});
  for(const [roll,name,rarity] of [[0,'温顺','少见'],[.349999,'温顺','少见'],[.35,'好奇','普通'],[.699999,'好奇','普通'],[.70,'从容','稀有'],[.999999,'从容','稀有']]) {
    const tag=inheritedTag(0,mother,father,redraw,()=>roll);
    assert.deepEqual([tag.label,tag.rarity],[name,rarity]);
  }
  father.traits[0]={type:'性格',grade:'S',tagId:null,label:null,rarity:null};
  assert.equal(inheritedTag(0,mother,father,redraw,()=>.1).label,'从容');
  mother.traits[0]={type:'性格',grade:'B',tagId:null,label:null,rarity:null};
  assert.equal(inheritedTag(0,mother,father,redraw,()=>.5).label,'从容');
  const child=taggedTraits(legacyTraits('B'),i=>inheritedTag(i,mother,father,redraw,()=>.1),()=>0);
  assert.equal(child.tagCount,2);
  assert.equal(getPetTags(child)[0].label,'从容');
});

test('新升档基线7%和3%，研究与跨档上限沿用，缺陷概率不改变',()=>{
  assert.equal(scoreRiseChance(4,4,0),.07);
  assert.equal(scoreRiseChance(5,5,0),.03);
  assert.equal(scoreRiseChance(4,2,0),.03);
  assert.equal(scoreRiseChance(3,3,0),.18);
  assert.equal(scoreRiseChance(6,6,10),0);
  assert.ok(Math.abs(scoreRiseChance(4,4,10)-.091)<1e-12);
  assert.equal(rareRedrawPercent(0),10);assert.equal(rareRedrawPercent(10),15);
  const before=defectProbabilities(legacyTraits('B'),legacyTraits('B'));
  assert.equal(before.defectPercent,2);assert.equal(before.perfectPercent,5);
  assert.equal(defectProbabilities(fixedTagSubset(legacyTraits('B'),()=>.9).traits,legacyTraits('B')).perfectPercent,5);
  assert.deepEqual(GRADES.map(defectDisplayLabel),['严重缺陷','明显缺陷','轻微缺陷','基本健全','状态良好','接近完美','完美无缺']);
});

test('复评按当前稀有度抽另外两档，不改名、不保升、不允许原档',()=>{
  for(const [from,roll,to] of [['普通',.899999,'少见'],['普通',.9,'稀有'],['少见',.899999,'普通'],['少见',.9,'稀有'],['稀有',.199999,'普通'],['稀有',.2,'少见']])
    assert.equal(reviewedRarity(from,()=>roll),to);
  assert.throws(()=>reviewedRarity(null),/无法复评/);
});

test('旧动物、货架、预约和待产快照只补稳定ID，原五标签和历史保持，迁移可重复',()=>{
  const make=()=>({traits:legacyTraits('B'),reviews:2,reviewHistory:[{field:0,before:'好奇',after:'温顺'}]});
  const s={pets:[make()],rooms:{rabbit:{shelf:{offers:[make(),null]},reservedSeed:{offer:make()},job:{mother:make(),father:make(),offspring:[make()]}}},onboarding:{offers:[make()]}};
  const original=structuredClone(s);
  assert.equal(normalizeStoredTags(s),true);
  const all=[...s.pets,...s.rooms.rabbit.shelf.offers.filter(Boolean),s.rooms.rabbit.reservedSeed.offer,s.rooms.rabbit.job.mother,s.rooms.rabbit.job.father,...s.rooms.rabbit.job.offspring,...s.onboarding.offers];
  for(const p of all) {
    assert.equal(p.tagRulesVersion,1);assert.equal(p.tagCount,5);assert.equal(getPetTags(p).length,5);
    assert.equal(traitCapacity(p).limit,2);
    assert.equal(p.reviews,2);
    assert.deepEqual(p.traits.map(t=>[t.grade,t.label,t.rarity]),original.pets[0].traits.map(t=>[t.grade,t.label,t.rarity]));
  }
  const once=structuredClone(s);assert.equal(normalizeStoredTags(s),false);assert.deepEqual(s,once);
  const unknown=make();unknown.traits[0].label='旧档自有词';normalizeStoredTags({pets:[unknown]});
  assert.equal(getPetTags(unknown)[0].tagId,tagIdFor(0,'旧档自有词'));
  assert.equal(unknown.traits[0].label,'旧档自有词');
});
