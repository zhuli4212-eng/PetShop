// 2026-11-20 approved scoring rules. show-live-v2.mjs connects these rules to
// isolated local-test events; ordinary and historical legacy events stay on v1.
// Grade indices follow care/show: E=0, D=1, C=2, B=3, A=4, S=5, S+=6.
export const SHOW_SCORING_VERSION = 2;

const PRIVATE_THRESHOLDS = Object.freeze({
  1: Object.freeze({bronze:96,silver:120,gold:140}),
  3: Object.freeze({bronze:328,silver:394,gold:458}),
  5: Object.freeze({bronze:610,silver:680,gold:767}),
});
const PUBLIC_QUALIFICATION = Object.freeze({4:470,5:655});
const ALLOWED_COUNTS = Object.freeze({private:[1,3,5],public:[4,5]});

function validateRuleSnapshot(rules) {
  if(!rules || rules.scoringVersion!==SHOW_SCORING_VERSION ||
      !Object.hasOwn(ALLOWED_COUNTS,rules.mode)) {
    throw new TypeError('Unsupported show scoring version or mode.');
  }
  const {attributes,coreAttribute}=rules;
  if(!Array.isArray(attributes) || !ALLOWED_COUNTS[rules.mode].includes(attributes.length) ||
      Array.from(attributes).some(i=>!Number.isInteger(i)||i<0||i>4) ||
      new Set(attributes).size!==attributes.length) {
    throw new TypeError('Show attributes must be distinct ordinary dimensions with an approved count.');
  }
  if(attributes.length===1 ? coreAttribute!==null :
      !Number.isInteger(coreAttribute)||!attributes.includes(coreAttribute)) {
    throw new TypeError('The fixed core must be an examined attribute; single-attribute shows have no core.');
  }
  return rules;
}

/**
 * SERVER-ONLY persisted rule snapshot. The event generator must uniformly pick
 * coreAttribute once from attributes before opening the event and reuse this
 * snapshot for every entrant/retry. Never send it directly in an API response.
 * A missing core is accepted only for the private one-attribute event.
 */
export function createShowRuleSnapshot({mode,attributes,coreAttribute=null}={}) {
  const rules={scoringVersion:SHOW_SCORING_VERSION,mode,
    attributes:Array.isArray(attributes)?[...attributes]:attributes,coreAttribute};
  validateRuleSnapshot(rules);
  Object.freeze(rules.attributes);
  return Object.freeze(rules);
}

/** Final integer score only: no core, intermediate values or per-dimension bonus. */
export function scoreShowGrades(gradeIndices,rules) {
  validateRuleSnapshot(rules);
  if(!Array.isArray(gradeIndices)||gradeIndices.length!==6 ||
      Array.from(gradeIndices).some(g=>!Number.isInteger(g)||g<0||g>6)) {
    throw new TypeError('Exactly six grade indices from E=0 through S+=6 are required.');
  }
  const base=rules.attributes.reduce((sum,i)=>sum+20*gradeIndices[i],0);
  const core=rules.coreAttribute===null?0:2*gradeIndices[rules.coreAttribute];
  // Defect multipliers are (2 + defect index) / 5. Every intermediate is an
  // integer, so binary floating point cannot shift a threshold. Round only here.
  const numerator=(base+core)*(2+gradeIndices[5]);
  return Math.floor((2*numerator+5)/10);
}

function maximumScore(rules) {
  return scoreShowGrades([6,6,6,6,6,6],rules);
}

function validateFinalScore(score,rules) {
  if(!Number.isSafeInteger(score)||score<0||score>maximumScore(rules)) {
    throw new TypeError('A final integer score within this event\'s range is required.');
  }
}

export function privateAwardTier(score,rules) {
  validateRuleSnapshot(rules);
  if(rules.mode!=='private')throw new TypeError('Private award thresholds require a private event.');
  validateFinalScore(score,rules);
  const thresholds=PRIVATE_THRESHOLDS[rules.attributes.length];
  return score>=thresholds.gold?'gold':score>=thresholds.silver?'silver':
    score>=thresholds.bronze?'bronze':null;
}

/**
 * Rank server-computed FINAL integer scores by distinct qualified score bands.
 * rewardKeys, when supplied, are opaque approved reward identifiers in rank
 * order. No default reward count, cash, trophies, rating or honor is invented.
 * This function allocates identifiers only; it never mutates a shop or pays out.
 */
export function rankPublicScores(entries,rules,{rewardKeys}={}) {
  validateRuleSnapshot(rules);
  if(rules.mode!=='public')throw new TypeError('Public ranking requires a public event.');
  if(!Array.isArray(entries))throw new TypeError('Entries must be an array.');
  if(rewardKeys!==undefined && (!Array.isArray(rewardKeys)||
      Array.from(rewardKeys).some(key=>typeof key!=='string'||!key.trim()))) {
    throw new TypeError('Reward identifiers must be an explicit array of nonempty strings.');
  }
  const ids=new Set();
  const ranked=entries.map(entry=>{
    if(!entry||typeof entry.id!=='string'||!entry.id.trim()||ids.has(entry.id)) {
      throw new TypeError('Each entry must have a distinct nonempty id.');
    }
    ids.add(entry.id);
    validateFinalScore(entry.score,rules);
    // Whitelist fields: callers cannot leak the internal snapshot by spreading
    // it into an entry. Input order within a tie does not confer a better rank.
    return {id:entry.id,score:entry.score};
  }).sort((a,b)=>b.score-a.score);
  const threshold=PUBLIC_QUALIFICATION[rules.attributes.length];
  let rank=0,previous=null,qualifiedCount=0;
  for(const entry of ranked) {
    const qualified=entry.score>=threshold;
    if(qualified) {
      if(entry.score!==previous)rank++;
      previous=entry.score;
      qualifiedCount++;
    }
    Object.assign(entry,{qualified,rank:qualified?rank:null,
      rewardKey:qualified&&rewardKeys!==undefined?(rewardKeys[rank-1]??null):null});
  }
  return {entries:ranked,qualifiedCount,qualifiedScoreBands:rank,
    rewardsConfigured:rewardKeys!==undefined};
}

/**
 * Minimal public response allowlist, not a complete page model. The approved
 * design hides public difficulty but does not specify whether the examined
 * attribute list itself should be shown. Until that UI contract is resolved,
 * this projection omits public count/list/threshold rather than inventing an
 * information-disclosure rule. Private events can show their ordinary examined
 * attributes and cup lines. Neither mode exposes the core or its bonus detail.
 * Use this projection again after loading snapshots from storage.
 */
export function publicShowRuleView(rules) {
  validateRuleSnapshot(rules);
  const view={scoringVersion:SHOW_SCORING_VERSION,mode:rules.mode};
  if(rules.mode==='private') {
    view.attributes=[...rules.attributes];
    view.attributeCount=rules.attributes.length;
    view.cupThresholds={...PRIVATE_THRESHOLDS[rules.attributes.length]};
  }
  return view;
}
