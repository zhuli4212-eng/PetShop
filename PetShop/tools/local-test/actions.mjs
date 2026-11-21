export function localTestAction(state, type) {
  if (type !== 'localTest.addCoins') return undefined;
  const next = state.coins + 10000;
  if (!Number.isSafeInteger(next)) throw Error('金币已超过可保存范围。');
  state.coins = next;
  return '测试金币 +10,000';
}
