import { GRADES } from './defect.mjs';

export const TAG_RULES_VERSION = 2;
export const TRAIT_FIELDS = ['性格', '品相', '毛发', '体态', '体型'];
export const RARITIES = ['普通', '少见', '稀有'];
// IDs describe identity, not rarity. A review never changes the ID or name.
const definitions = [
  [['gentle','温顺'],['curious','好奇'],['friendly','亲人'],['calm','沉稳'],['bold','大胆'],['composed','从容']],
  [['round-eyes','圆眼'],['delicate','清秀'],['fine-brows','秀眉'],['bright-eyes','眼神明亮'],['lively-eyes','眼神灵动']],
  [['soft','柔软'],['smooth','顺毛'],['dense','细密'],['velvety','绒感'],['silky','丝光'],['lustrous','绒光']],
  [['balanced','匀称'],['relaxed','舒展'],['light-step','步态轻盈'],['upright','站姿端正'],['graceful','仪态出众']],
  [['compact','紧凑'],['slender','修长'],['even-frame','骨架匀整'],['flowing-outline','轮廓流畅'],['well-proportioned','比例匀美']],
];
const dimensionIds = ['temperament','appearance','coat','posture','build'];
export function tagIdFor(dimension, label) {
  const entry = definitions[dimension]?.find(([, name]) => name === label);
  // Preserve unknown old labels too; their exact identity must not disappear on restore.
  return entry ? dimensionIds[dimension] + ':' + entry[0] : 'legacy:' + dimension + ':' + encodeURIComponent(label);
}
export function traitTag(trait, dimension) {
  if (dimension < 0 || dimension >= 5 || !trait || typeof trait.label !== 'string' || !trait.label) return null;
  return { dimension, type: trait.type ?? TRAIT_FIELDS[dimension], grade: trait.grade,
    tagId: typeof trait.tagId === 'string' && trait.tagId ? trait.tagId : tagIdFor(dimension, trait.label),
    label: trait.label, rarity: trait.rarity };
}
export function getPetTags(pet) {
  return (pet?.traits ?? []).slice(0, 5).flatMap((trait, dimension) => {
    const tag = traitTag(trait, dimension);
    return tag ? [tag] : [];
  });
}
export function traitCapacity(pet) {
  const score = pet.traits.reduce((sum, trait) => sum + GRADES.indexOf(trait.grade) * 20, 0);
  const limit = score < 300 ? 1 : score < 400 ? 2 : score < 480 ? 3 : score < 580 ? 4 : 5;
  return { score, band: limit, limit };
}
export function cardQualityScore(traits) {
  if (traits?.length !== 6) return undefined;
  const grades = traits.map(trait => GRADES.indexOf(trait?.grade));
  if (grades.some(grade => grade < 0)) return undefined;
  const ordinary = grades.slice(0, 5).reduce((sum, grade) => sum + grade * 20, 0);
  return ordinary * (4 + 2 * grades[5]) / 10;
}
export function taggedTraits(gradedTraits, makeTag, random = Math.random) {
  const { limit } = traitCapacity({ traits: gradedTraits });
  let count = 1;
  for (let slot = 1; slot < limit; slot++) if (random() < .8) count++;
  const available = [0, 1, 2, 3, 4], chosen = new Set();
  for (let slot = 0; slot < count; slot++) {
    const index = Math.floor(random() * available.length);
    chosen.add(available.splice(index, 1)[0]);
  }
  const traits = gradedTraits.map((trait, dimension) => {
    if (dimension === 5) return { ...trait };
    const result = { type: trait.type ?? TRAIT_FIELDS[dimension], grade: trait.grade, tagId: null, label: null, rarity: null };
    if (chosen.has(dimension)) {
      const tag = makeTag(dimension);
      result.tagId = tag.tagId ?? tagIdFor(dimension, tag.label);
      result.label = tag.label;
      result.rarity = tag.rarity;
    }
    return result;
  });
  return { traits, tagRulesVersion: TAG_RULES_VERSION, tagCount: count };
}
export function fixedTagSubset(traits, random = Math.random) {
  return taggedTraits(traits, dimension => traits[dimension], random);
}
export function inheritedTag(dimension, mother, father, redraw, random = Math.random) {
  const source = random();
  const inherited = source < .35 ? traitTag(father.traits[dimension], dimension)
    : source < .70 ? traitTag(mother.traits[dimension], dimension) : null;
  return inherited ?? redraw(dimension);
}
export function reviewedRarity(rarity, random = Math.random) {
  if (rarity === '普通') return random() < .9 ? '少见' : '稀有';
  if (rarity === '少见') return random() < .9 ? '普通' : '稀有';
  if (rarity === '稀有') return random() < .2 ? '普通' : '少见';
  throw new Error('这条标签的稀有度无法复评，请重新查看动物档案。');
}

// This migration only adds identity metadata. Existing animals, offers and frozen
// litters keep their exact grades, names, rarity, count and review history.
export function normalizeAnimalTags(pet) {
  if (!pet?.traits) return false;
  let changed = false;
  for (const tag of getPetTags(pet)) {
    if (!pet.traits[tag.dimension].tagId) {
      pet.traits[tag.dimension].tagId = tag.tagId;
      changed = true;
    }
  }
  if (pet.tagRulesVersion === undefined) { pet.tagRulesVersion = 1; changed = true; }
  if (pet.tagCount === undefined) { pet.tagCount = getPetTags(pet).length; changed = true; }
  return changed;
}
export function normalizeStoredTags(state) {
  const animals = [...(state.pets ?? []), ...(state.onboarding?.offers ?? [])];
  for (const room of Object.values(state.rooms ?? {})) {
    animals.push(...(room.shelf?.offers ?? []), room.reservedSeed?.offer,
      room.job?.mother, room.job?.father, ...(room.job?.offspring ?? []));
  }
  let changed = false;
  for (const pet of animals) if (normalizeAnimalTags(pet)) changed = true;
  return changed;
}
