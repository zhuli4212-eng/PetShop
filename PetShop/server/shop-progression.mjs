export function shopProgress(rules, totalXp) {
  let level = 1, intoLevel = totalXp;
  while (level < rules.maxLevel) {
    const cost = rules.levelUpCosts[level - 1] ?? rules.laterCostPerLevel * level;
    if (intoLevel < cost) return { level, total: totalXp, intoLevel, toNext: cost, maxLevel: rules.maxLevel };
    intoLevel -= cost;
    level++;
  }
  return { level, total: totalXp, intoLevel, toNext: 0, maxLevel: rules.maxLevel };
}

export function saleExperience(rules, channel, lines) {
  if (!['market', 'order', 'guest'].includes(channel)) return 0;
  const { base, coinsPerBonus, maxBonus } = rules.saleXp;
  return lines.reduce((sum, line) =>
    sum + base + Math.min(maxBonus, Math.floor(line.amount / coinsPerBonus)), 0);
}

export function shopRaceAccess(rules, createdAt, now) {
  const day = 86400000, beijingOffset = 8 * 3600000;
  const openingMidnight = Math.floor((createdAt + beijingOffset) / day) * day - beijingOffset;
  const shopDay = Math.max(1, 1 + Math.floor((now - openingMidnight) / day));
  const raceAccess = Object.fromEntries(Object.entries(rules.raceOpensDay).map(([mode, opensDay]) => {
    const opensAt = Math.max(createdAt, openingMidnight + (opensDay - 1) * day);
    return [mode, { opensDay, opensAt, unlocked: now >= opensAt }];
  }));
  return { shopDay, raceAccess };
}
