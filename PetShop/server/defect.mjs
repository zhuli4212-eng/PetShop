export const GRADES = ['E', 'D', 'C', 'B', 'A', 'S', 'S+'];

const defectLabels = ['严重缺陷', '明显缺陷', '轻微缺陷', '基本健全', '状态良好', '接近完美', '完美无缺'];
const traitWeights = [15, 20, 15, 25, 25]; // 性格、品相、毛发、体态、体型
const perfectByGrade = [1, 2, 3, 5, 10, 18, 30];
const gapTable = [
  {gap: 0, e: 0, d: 0.5, c: 1.5, a: 14, match: 1},
  {gap: 2, e: 1, d: 4, c: 10, a: 10, match: 0.6},
  {gap: 6, e: 24, d: 27, c: 29, a: 2, match: 0.2},
];

export const defectDisplayLabel = grade => defectLabels[GRADES.indexOf(grade)];
export function defectTrait(grade) {
  return {type: '缺陷', label: defectDisplayLabel(grade), rarity: '普通', grade};
}

// All rates are percentages. Both preview and litter settlement read the same distribution.
export function defectProbabilities(motherTraits, fatherTraits) {
  let gapSum = 0, perfectSum = 0;
  for (const [i, weight] of traitWeights.entries()) {
    const mother = GRADES.indexOf(motherTraits[i].grade);
    const father = GRADES.indexOf(fatherTraits[i].grade);
    gapSum += weight * Math.abs(mother - father);
    perfectSum += weight * perfectByGrade[Math.min(mother, father)];
  }
  const gap = gapSum / 100;
  const segment = gap <= gapTable[1].gap ? 0 : 1;
  const low = gapTable[segment], high = gapTable[segment + 1];
  const fraction = (gap - low.gap) / (high.gap - low.gap);
  const interpolate = key => low[key] + (high[key] - low[key]) * fraction;
  const e = interpolate('e'), d = interpolate('d'), c = interpolate('c'), a = interpolate('a');
  const mildPercent = d + c, defectPercent = e + mildPercent;
  const perfectPercent = perfectSum / 100 * interpolate('match');
  const b = 100 - defectPercent - a - perfectPercent;
  const gradePercents = [e, d, c, b, a, perfectPercent * 0.8, perfectPercent / 5];
  return {defectPercent, perfectPercent, obviousPercent: e, mildPercent, gradePercents};
}
