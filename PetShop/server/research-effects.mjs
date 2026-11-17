// The preview embeds this module too. Rates here are used both for settlement and for the handbook.
export function rareRedrawPercent(level) {
  return 10 * (1 + .05 * level);
}

export function scoreRiseChance(baseGrade, otherGrade, level) {
  let chance = [.18, .18, .18, .18, .10, .06, 0][baseGrade];
  if (otherGrade < baseGrade - 1) chance = Math.min(chance, .03);
  return Math.min(.90, chance * (1 + .03 * level));
}

export function bredValuePercent(level) {
  return 20 + level * .5;
}

function percent(value) {
  return Number(value.toFixed(2)) + '%';
}

export function researchBonus(branch, level) {
  if (branch === 2) return percent(bredValuePercent(level));
  return (level ? '+' : '') + percent((branch === 0 ? 5 : 3) * level);
}

export function researchBenefit(branch, level, speciesName, mutationEnabled = true) {
  const maxed = level >= 10, next = maxed ? level : level + 1;
  const currentBonus = researchBonus(branch, level);
  const nextBonus = maxed ? null : researchBonus(branch, next);
  let valueLabel, description, delta, example, overview, currentValue, nextValue, switchNote = '';
  if (branch === 0) {
    valueLabel = '重抽出稀有';
    const from = rareRedrawPercent(level), to = rareRedrawPercent(next);
    currentValue = percent(from); nextValue = maxed ? null : percent(to);
    overview = '重抽出稀有 '+currentValue+(maxed?'':' → '+nextValue);
    description = '升级后再配对，幼'+speciesName+'的前五项特征若重新抽标签，就更容易抽到稀有。';
    delta = maxed ? '' : '升这一级，重抽出稀有的机会增加 0.5 个百分点。';
    example = '重抽一个标签时，稀有机会'+(maxed?'是 '+currentValue:'从 '+currentValue+' 升到 '+nextValue)+'。';
  } else if (branch === 1) {
    valueLabel = '双亲 B 时升 A';
    const from = 100 * scoreRiseChance(3, 3, level), to = 100 * scoreRiseChance(3, 3, next);
    currentValue = percent(from);
    nextValue = maxed ? null : percent(to);
    overview = '双亲 B 时升 A '+currentValue+(maxed?'':' → '+nextValue);
    description = '开启选育加成后再配对，幼'+speciesName+'的前五项评分各有机会升一档，最高 S+。机会取决于父母的评分。';
    delta = maxed ? '' : '升这一级，多出原本升档机会的 3%。';
    example = '例如父母毛发都是 B，幼体毛发升 A 的机会'+(maxed?'是 '+currentValue:'从 '+currentValue+' 升到 '+nextValue+'，多 '+Number((to-from).toFixed(2))+' 个百分点')+'。';
    if (!mutationEnabled) switchNote = '本房选育加成已关闭，配对前可在繁育台打开。';
  } else {
    valueLabel = '估价 200 时';
    const from = 2 * bredValuePercent(level), to = 2 * bredValuePercent(next);
    currentValue = from + ' 金币';
    nextValue = maxed ? null : to + ' 金币';
    overview = '估价 200，繁育后保留 '+from+(maxed?'':' → '+to)+' 金币';
    description = '卖出繁育过的'+speciesName+'时，它能多保留一些原本的身价。荣誉和买家的加价另算。';
    delta = maxed ? '' : '升这一级，基础估价多保留 0.5 个百分点。';
    example = '例如基础估价 200 金币，繁育后'+(maxed?'保留 '+currentValue:'从 '+currentValue+' 增至 '+nextValue)+'。';
  }
  return {bonusLabel:branch === 2 ? '保留比例' : '比基础机会多', valueLabel, metric:valueLabel,
    description, currentBonus, nextBonus, currentValue, nextValue, overview, delta, example, switchNote};
}
