const meals = [
  { key:'quality', label:'优质', rate:1.5, priceRatio:.8 },
  { key:'select', label:'精选', rate:1.8, priceRatio:.9 },
  { key:'premium', label:'臻选', rate:2, priceRatio:1 },
];
const minutes = 30;
export const nutritionDuration = minutes * 60_000;
const animalNames = { rabbit:'兔', cat:'猫', dog:'狗' };
const premiumPrice = { rabbit:100, cat:400, dog:1000 };
const go = (label, page, args) => ({ label, page, args });
export const nutritionTier = key => meals.find(meal => meal.key === key);
export const nutritionPrice = (species, meal) => Math.round(premiumPrice[species]*meal.priceRatio);

export function nutritionWindow(room) {
  const effect = room?.nutrition;
  const meal = nutritionTier(effect?.tier);
  if (!meal || !Number.isFinite(effect.startsAt) || !Number.isFinite(effect.endsAt) ||
      effect.startsAt >= effect.endsAt) return undefined;
  return { rate:meal.rate, startsAt:effect.startsAt, endsAt:effect.endsAt };
}

export function activeNutrition(room, now) {
  const effect = nutritionWindow(room);
  return effect && effect.startsAt<=now && now<effect.endsAt ? effect : undefined;
}

export function nutritionStock(room, tier) {
  const count = room?.nutritionStock?.[tier];
  return Number.isSafeInteger(count) && count>0 ? count : 0;
}

export function nutritionPage(s, page, species, tier, now) {
  const animal = animalNames[species], room = animal + '房', name = animal.repeat(2) + '营养餐';
  const roomState=s.rooms[species], current = activeNutrition(roomState, now);
  const available=meals.find(m=>nutritionStock(roomState,m.key)>0);
  const meal = nutritionTier(tier) ?? (page==='roomNutrition'?available:undefined) ?? meals[0];
  const args = { species, tier:meal.key };
  const icon = m => 'rooms/'+species+'-nutrition-'+m.key;
  const art = icon(meal);
  const buy = go('去购买', 'nutritionShop', args);
  const count=nutritionStock(roomState,meal.key);
  const row = m => ({ title:m.label + name, art:icon(m),
    visual:{ rate:m.rate, stock:nutritionStock(roomState,m.key), selected:m.key===meal.key,
      pick:go('选择', 'roomNutrition', {species,tier:m.key}),
      detail:go('查看详情', 'nutritionDetail', {species,tier:m.key}) } });
  if (page === 'nutritionShop') return {
    title:'培育中心', subtitle:'营养餐',
    tabs:Object.entries(animalNames).map(([key,label])=>({
      ...go(label+'房','nutritionShop',{species:key}),active:key===species,
    })),
    rows:meals.map(m=>{
      const price=nutritionPrice(species,m);
      const stock=nutritionStock(roomState,m.key);
      const title=m.label+name;
      const label=!roomState?'房间未开放':s.coins<price?'金币不足':'购买 1 份';
      return { title, art:icon(m), current:m.key===tier, visual:{ rate:m.rate, price, stock },
        action:{label,type:'care.buyNutrition',args:{species,tier:m.key,price},disabled:!roomState||s.coins<price,
          confirm:'花费 '+price+' 金币购买 1 份'+title+'？'} };
    }),
  };
  if (!s.rooms[species]) return { title:'营养餐', rows:[{ title:'请先开放'+room+'。' }] };
  if (page === 'nutritionDetail') return {
    title:'道具详情', art,
    rows:[row(meal),
      { title:'作用范围', text:'整间'+room },
      { title:'持续时间', text:minutes+' 分钟' },
      { title:'价格', text:nutritionPrice(species,meal)+' 金币' },
      { title:'库存', text:count+' 份' }],
    visual:{rules:'只加速成年前成长，不影响繁育等待、衰老或死亡。\n离线继续计时，期间出生的幼体共享本房剩余时间。\n效果不叠加，到期后可再次投喂。'},
    actions:[{label:'返回选择',type:'ui.back'},buy],
  };
  const hint=current?'本房效果尚未结束，可查看详情。':!available?'暂无营养餐，可前往培育中心购买。':
    !count?'所选营养餐库存不足，请选择有库存的营养餐。':undefined;
  return { title:'选择'+name, art, rows:meals.map(row),
    visual:{hint},
    actions:[{ label:current?'效果生效中，暂不可使用':'投喂', type:'care.feed', args, disabled:!!current||!count }] };
}
