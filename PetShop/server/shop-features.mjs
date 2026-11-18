import shopRules from './shop-feature-levels.json' with { type: 'json' };
export { shopRules };

export const featureNames = {
  rooms:'动物小屋', login:'店主登记簿', orders:'普通订单', show:'赛事', lab:'培育中心',
  market:'自由市场', profile:'每日签到', breed:'繁育', decor:'店铺装饰', guest:'特殊来客', collection:'荣誉',
};

export function featureAccess(rules, level) {
  return Object.fromEntries(Object.keys(featureNames).map(key => {
    const requiredLevel = rules.featureLevels[key];
    return [key, { name:featureNames[key], requiredLevel, unlocked: level >= requiredLevel }];
  }));
}

const owner = new Map();
const sections = {
  rooms:['roomRoster','roomReceipt','roomNutrition','nutritionDetail','pet','care.unlock','care.retain','care.feed'],
  login:['payment'],
  orders:['orderDesk','credits','order.cancel','order.buyCredit'],
  lab:['shelf','offer','services','review','recycle','research','researchNode','researchTable','nutritionShop',
    'care.buyPet','care.buyItem','care.buyNutrition','care.review','research.upgrade'],
  profile:['care.checkin'],
  breed:['litter','litterKeep','litterSale','care.breed','care.toggle','care.keepLitter'],
  decor:['decor.buy','decor.place'],
  guest:['guest.dismiss'],
};
for (const [feature, keys] of Object.entries(sections)) {
  for (const key of keys) owner.set(key, feature);
}
const saleFeatures = new Map([['market','market'],['order','orders'],['guest','guest'],['recycle','lab']]);

export function operationFeature(key, args) {
  if (key === 'sale' || key === 'saleQuote' || key === 'sale.commit') return saleFeatures.get(args.channel);
  if (Object.hasOwn(featureNames, key)) return key;
  if (key.startsWith('show.')) return 'show';
  if (key.startsWith('collection.')) return 'collection';
  return owner.get(key);
}
