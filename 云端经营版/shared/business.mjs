import { createHash, randomInt, randomUUID } from 'node:crypto';
import { BREEDS, SPECIES, TRAITS, breedName, carePage, isBusy, petArt, retainedLitterPets, rosterFilter, rosterFilters, rosterStage, stageEnd, stageNames, stageOf, stockStatus } from './care.mjs';
import { bredValuePercent, researchBenefit } from './research-effects.mjs';

const minute = 60_000;
const day = 24 * 60 * minute;
const speciesList = ['rabbit', 'cat', 'dog'];
const gradeNames = ['E', 'D', 'C', 'B', 'A', 'S', 'S+'];
const baseValues = { rabbit: 100, cat: 1200, dog: 1300 };
const breedFactors = [100, 110, 120, 135];
const stageFactors = { 幼年: 80, 成长: 92, 成年: 100, 老年: 65, 已故: 0 };
const channelNames = { market: '自由市场', order: '订单交付', recycle: '研究所回收', guest: '来客委托' };
const researchNames = ['稀有标签研究', '六维选育研究', '繁育后价值研究'];
const researchBases = { rabbit: 100, cat: 250, dog: 400 };
const ornaments = {
  fence: { name: '矮篱', base: 80 }, lamp: { name: '台灯', base: 60 },
  plant: { name: '盆栽', base: 100 }, rug: { name: '地毯', base: 120 },
};

const bjDay = now => new Date(now + 8 * 60 * minute).toISOString().slice(0, 10);
const timeLabel = now => new Date(now + 8 * 60 * minute).toISOString().slice(5, 16).replace('T', ' ');
const choose = list => list[randomInt(list.length)];
function weighted(weights) {
  let roll = randomInt(weights.reduce((sum, n) => sum + n, 0));
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
}
const speciesName = key => SPECIES[key].name;
const roomKeys = (s, asOf) => speciesList.filter(key => s.rooms[key] && s.rooms[key].openedAt <= asOf);
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const halfUp = (numerator, denominator) => Math.floor((2 * numerator + denominator) / (2 * denominator));

export function purchasePrice(s, base) {
  return 10 * Math.ceil(base * (200000 - (s.ratingBps || 0)) / 2000000);
}

function quality(p) {
  const indexSum = p.traits.reduce((total, trait) => total + gradeNames.indexOf(trait.grade), 0);
  const normalised = p.traits.slice(0, 5);
  return 600 + 5 * (indexSum - 18) + 18 * normalised.filter(t => t.rarity === '少见').length
    + 48 * normalised.filter(t => t.rarity === '稀有').length;
}
function breedBase(p) {
  const index = SPECIES[p.species].breeds.indexOf(p.breedKey);
  return baseValues[p.species] * (p.mixed ? 100 : breedFactors[index]) / 100;
}
export function youngPurchaseBase(p) {
  const youngValue = halfUp(breedBase(p) * 80 * quality(p), 60000);
  return 10 * Math.ceil(28 * youngValue / 100);
}
export function valuation(s, p, now) {
  const base = breedBase(p);
  const q = quality(p);
  const stage = stageOf(p, now);
  const value = halfUp(base * q * stageFactors[stage], 60000);
  const adult = halfUp(base * q, 600);
  const minimum = Math.max(1, Math.floor(6 * base / 100));
  const bredRate = bredValuePercent(s.research[p.species]?.[2] ?? 0);
  const retained = p.bred ? Math.max(minimum, halfUp(value * bredRate, 100)) : value;
  const honor = Math.floor(base * Math.round((p.honor || 0) * 100) / 100);
  const deadPrice = honor ? Math.max(minimum, Math.floor((adult + 5 * honor) / 10)) : minimum;
  const multiplier = 10000 + (s.ratingBps || 0);
  return {base,qualityUnits:q,stage,stagePercent:stageFactors[stage],value,adult,minimum,bredRate,retained,honor,deadPrice,multiplier};
}
export function salePrice(s, p, now, channel, rate = 100) {
  const {stage,deadPrice,multiplier,retained,honor}=valuation(s,p,now);
  if (channel === 'recycle') {
    requireValue(stage === '已故', '研究所只回收已故动物。');
    return halfUp(deadPrice * multiplier, 10000);
  }
  return halfUp(multiplier * (retained * rate + 100 * honor), 1000000);
}

function makeOrder(s, date, first = false) {
  const species = choose(roomKeys(s, date));
  const diff = first ? 0 : weighted([70, 25, 5]);
  const order = { id: randomUUID(), species, diff, rate: [135, 155, 180][diff] };
  if (diff && randomInt(2)) {
    order.breed = SPECIES[species].breeds[diff === 2 ? 3 : weighted([4, 3, 2])];
  } else if (diff) {
    order.tag = choose(choose(TRAITS)[diff - 1]);
  }
  return order;
}
function orderCondition(order) {
  const pet = speciesName(order.species);
  if (order.breed) return '登记品种为' + BREEDS[order.breed].name;
  if (order.tag) return pet + ' · 带「' + order.tag + '」标签';
  return pet + ' · 任意品种';
}
function matchesOrder(p, order) {
  return p.species === order.species && (!order.breed || (!p.mixed && p.breedKey === order.breed))
    && (!order.tag || p.traits.slice(0, 5).some(t => t.label === order.tag));
}
function offerIncome(s, offer, order, now) {
  // Purchased stock starts at age zero. Use the same rounding as an actual order delivery.
  return salePrice(s, { ...offer, bornAt: now }, now, 'order', order.rate);
}
export function offerOrderRows(s, offer, now) {
  const rows = [];
  for (const [index, { order }] of (s.orders ?? []).entries()) {
    if (!order || !matchesOrder(offer, order)) continue;
    rows.push({ title: '可交第 ' + (index + 1) + ' 单', text: orderCondition(order) +
      ' · 购入后立即交付，预计收入 ' + offerIncome(s, offer, order, now) + ' 金币。' });
  }
  return rows.length ? rows : [{ title: '当前普通订单', text: '这只幼体目前没有匹配的普通订单。' }];
}
function orderStockRows(s, order, now) {
  const speciesPets = s.pets.filter(p => p.species === order.species);
  const matching = speciesPets.filter(p => matchesOrder(p, order));
  const rows = [{ title: '所需物种 · ' + speciesName(order.species), text: '本店持有 ' + speciesPets.length + ' 只。' }];
  if (order.breed || order.tag) rows.push({ title: order.breed ? '所需登记品种 · ' + BREEDS[order.breed].name : '所需标签 · ' + order.tag,
    text: '该物种中符合此项的有 ' + matching.length + ' 只。' });
  const counts = new Map();
  for (const p of matching) {
    const reason = saleBlock(s, p, now, 'order') || '可交付';
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  rows.push({ title: '本店可交付 ' + (counts.get('可交付') || 0) + ' 只',
    text: [...counts].filter(([reason]) => reason !== '可交付').map(([reason, n]) => reason + ' ' + n + ' 只').join(' · ') ||
      (matching.length ? '符合条件的在店动物均可交付。' : '当前没有符合全部条件的在册动物。') });
  const offers = (s.rooms[order.species]?.shelf?.offers || []).filter(p => p && matchesOrder(p, order));
  if (offers.length) {
    for (const offer of offers) rows.push({ ...linkRow('可采购 · ' + offer.name + '（' + offer.sex + '）',
      '尚未持有 · 购价 ' + purchasePrice(s, youngPurchaseBase(offer)) + ' 金币 · 立即交付预计收入 ' +
      offerIncome(s, offer, order, now) + ' 金币，成交前重新核价。', 'offer', { species: order.species, id: offer.id }, petArt(offer)), stage:'幼年' });
  } else rows.push({ title: '本批货架', text: '目前没有符合这张订单的在售幼体。下一批随机供货。' });
  return rows;
}
export function readyOrderId(s, now) {
  return s.orders.find(({ order }) => order && canFillOrder(s, order, now))?.order.id ?? null;
}
const canFillOrder = (s, order, now) => s.pets.some(p => !saleBlock(s, p, now, 'order') && matchesOrder(p, order));
function daily(s, now) {
  const date = bjDay(now);
  if (s.businessDay?.date !== date) s.businessDay = { date, freeUsed: 0, bought: 0, arrived: 0 };
}
export function initBusiness(s, now) {
  s.research ||= Object.fromEntries(speciesList.map(key => [key, [0, 0, 0]]));
  s.orders ||= Array.from({ length: 3 }, (_, i) => ({ order: makeOrder(s, now, i === 0), readyAt: null }));
  s.cancelCredits ??= 0;
  s.decor ||= Object.fromEntries(Object.keys(ornaments).map(key => [key, { owned: false, placed: false }]));
  s.visitors ||= { active: null, elapsed: 0, misses: 0, sessions: {}, intervals: [], since: now };
  s.sales ||= [];
  daily(s, now);
}
function endVisit(v, time) {
  v.active = null;
  v.elapsed = 0;
  v.misses = 0;
  v.intervals = [];
  v.since = time;
}
export function tickBusiness(s, now) {
  daily(s, now);
  for (const slot of s.orders) {
    if (!slot.order && now >= slot.readyAt) {
      slot.order = makeOrder(s, slot.readyAt);
      slot.order.refilledAt=slot.readyAt;
      slot.readyAt = null;
    }
  }
  const v = s.visitors;
  if (v.active && now >= v.active.endsAt) endVisit(v, v.active.endsAt);
  for (const [key, last] of Object.entries(v.sessions)) {
    if (now - last > minute) delete v.sessions[key];
  }
}

function visitorRequirements(p, stage) {
  const base = { species: p.species, breed: p.mixed ? 'mixed' : p.breedKey, stage };
  const list = [];
  p.traits.slice(0, 5).forEach((t, dimension) => {
    if (gradeNames.indexOf(t.grade) >= 4) list.push({ ...base, dimension, tag: t.label, rarity: t.rarity });
  });
  if (gradeNames.indexOf(p.traits[1].grade) >= 4) {
    list.push({ ...base, coat: BREEDS[p.breedKey].coats[p.coatIndex - 1] });
  }
  return list;
}
function pickVisit(s, now) {
  const immediate = [], future = [];
  for (const p of s.pets) {
    if (saleBlock(s, p, now, 'guest')) continue;
    let at = now;
    // Several short stages can fit inside one 25-minute preparation window.
    while (at <= now + 25 * minute) {
      const stage = stageOf(p, at), end = stageEnd(p, at);
      if (stage === '已故' || !end || end <= at) break;
      const isNow = at === now;
      if (end - at >= (isNow ? 2 : 5) * minute) {
        (isNow ? immediate : future).push(...visitorRequirements(p, stage));
      }
      at = end;
    }
  }
  const pool = immediate.length && future.length ? (randomInt(100) < 70 ? immediate : future) :
    immediate.length ? immediate : future;
  if (!pool.length) return null;
  const species = choose([...new Set(pool.map(r => r.species))]);
  const bySpecies = pool.filter(r => r.species === species);
  const tag = choose([...new Set(bySpecies.map(r => Boolean(r.tag)))]);
  const unique = new Map(bySpecies.filter(r => Boolean(r.tag) === tag).map(r => [JSON.stringify(r), r]));
  return choose([...unique.values()]);
}
function matchesVisit(p, request, now) {
  if (p.species !== request.species || (p.mixed ? 'mixed' : p.breedKey) !== request.breed ||
      stageOf(p, now) !== request.stage) return false;
  if (request.tag) {
    const trait = p.traits[request.dimension];
    return trait.label === request.tag && trait.rarity === request.rarity && gradeNames.indexOf(trait.grade) >= 4;
  }
  return request.coat === BREEDS[p.breedKey].coats[p.coatIndex - 1] && gradeNames.indexOf(p.traits[1].grade) >= 4;
}
function visitCondition(v) {
  const r = v.requirement;
  return [r.breed === 'mixed' ? '杂交' + speciesName(r.species) : BREEDS[r.breed].name, r.stage,
    r.tag ? r.rarity + '标签「' + r.tag + '」且该维至少A' : r.coat + '花色且品相至少A'].join(' · ');
}
// Track the union of confirmed foreground intervals. Another device may confirm an
// earlier start later, so keeping only the most recent end would lose valid time.
function addInterval(v, start, end) {
  const intervals = v.intervals.filter(pair => pair[1] >= end - 30000);
  const previous = intervals.reduce((sum, [a, b]) => sum + b - a, 0);
  intervals.push([start, end]);
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const pair of intervals) {
    const tail = merged.at(-1);
    if (tail && tail[1] >= pair[0]) tail[1] = Math.max(tail[1], pair[1]);
    else merged.push([...pair]);
  }
  v.intervals = merged;
  v.elapsed += merged.reduce((sum, [a, b]) => sum + b - a, 0) - previous;
}
export function businessHeartbeat(s, { clientId, foreground }, now) {
  requireValue(typeof clientId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(clientId), '连接标识无效。');
  const v = s.visitors, key = 'client:' + clientId, last = v.sessions[key];
  if (!foreground) { delete v.sessions[key]; return; }
  v.sessions[key] = now;
  if (v.active || s.businessDay.arrived >= 6 || last === undefined || now - last > 30000 || now <= last) return;
  addInterval(v, Math.max(last, v.since), now);
  if (v.elapsed < 10 * minute) return;
  v.elapsed -= 10 * minute;
  const requirement = pickVisit(s, now);
  if (!requirement) return;
  if (v.misses < 2 && randomInt(100) >= 35) { v.misses++; return; }
  v.active = { id: randomUUID(), requirement, endsAt: now + 30 * minute };
  v.elapsed = 0;
  v.misses = 0;
  s.businessDay.arrived++;
}

function saleTarget(s, args, now) {
  const channel = args.channel;
  requireValue(Object.hasOwn(channelNames, channel), '请选择出售渠道。');
  if (channel === 'order') {
    const slot = s.orders.find(entry => entry.order?.id === args.targetId);
    requireValue(slot, '这张委托已经结束，请返回订单夹。');
    return { channel, rate: slot.order.rate, condition: orderCondition(slot.order), slot,
      eligible: p => matchesOrder(p, slot.order) };
  }
  if (channel === 'guest') {
    const guest = s.visitors.active;
    requireValue(guest && guest.id === args.targetId && now < guest.endsAt, '这位客人已经离店。');
    return { channel, rate: 215, condition: visitCondition(guest), eligible: p => matchesVisit(p, guest.requirement, now) };
  }
  if ((channel === 'market' || channel === 'recycle') && args.species !== undefined) {
    requireValue(Object.hasOwn(SPECIES, args.species), '请选择要出售动物的房间。');
    const name=speciesName(args.species)+'房';
    const condition=channel==='market'?'收购'+name+'的空闲活体':name+' · 仅回收已故动物';
    return { channel, species: args.species, rate: 100, condition,
      eligible: p => p.species === args.species };
  }
  return { channel, rate: 100, condition: channel === 'market' ? '收购空闲的在店活体' : '仅回收已故动物',
    eligible: () => true };
}
function saleBlocks(s, p, now, channel) {
  const reasons = [], deceased = stageOf(p, now) === '已故';
  if (channel === 'recycle' && !deceased) reasons.push('活体');
  if (isBusy(s, p)) reasons.push('繁育中');
  if (channel !== 'recycle' && deceased) reasons.push('已故');
  if (p.retained) reasons.push('种源保护');
  return reasons;
}
function saleBlock(s, p, now, channel) {
  return saleBlocks(s, p, now, channel)[0];
}
function petCaption(p, now, status = p.bred ? '已繁育' : '未繁育') {
  return [breedName(p), BREEDS[p.breedKey].coats[p.coatIndex - 1], p.sex, stageOf(p, now),
    status, ...(p.retained?['种源']:[])].join(' · ');
}
function quoteSelection(s, args, now, agreedAmounts) {
  const ids = args.ids;
  requireValue(Array.isArray(ids) && ids.length && new Set(ids).size === ids.length, '请勾选动物，每只只能选一次。');
  let target;
  const filter = args.channel === 'market' ? rosterFilter(args.filter) : '全部';
  const stage = args.channel === 'market' ? rosterStage(args.stage,args.filter) : '全部';
  const lines = [], issues = [];
  try { target = saleTarget(s, args, now); }
  catch (error) {
    if (args.channel !== 'order' && args.channel !== 'guest') throw error;
    issues.push(error.message);
  }
  const byId = new Map(s.pets.map(p => [p.id, p]));
  const departed = new Map(), missing = new Set(ids.filter(id => !byId.has(id)));
  if (missing.size) for (const sale of s.sales || []) {
    for (const line of sale.lines) if (missing.has(line.id)) departed.set(line.id, line.name);
  }
  for (const [index, id] of ids.entries()) {
    const p = byId.get(id);
    const name = (p?.name || departed.get(id) || '所选动物') + ' #' + String(id).slice(0, 6).toUpperCase();
    if (!p) { issues.push(name + '已离店'); continue; }
    const blocked = saleBlock(s, p, now, args.channel);
    if (blocked || (target && !target.eligible(p))) {
      const reason = {活体:'仍在世，研究所只回收已故动物',种源保护:'已标记为种源'}[blocked] || blocked;
      issues.push(name + (reason ? '（' + reason + '）' : '') + '不再符合交付条件');
      continue;
    }
    if (!rosterFilters[filter](s, p, now)) {
      issues.push(name + '已不符合「' + filter + '」筛选');
      continue;
    }
    if(stage!=='全部' && stageOf(p,now)!==stage){
      issues.push(name+'已不符合「'+stage+'」筛选，目前为'+stageOf(p,now));
      continue;
    }
    if (!target) continue;
    const amount = salePrice(s, p, now, args.channel, target.rate);
    if (Array.isArray(agreedAmounts) && agreedAmounts[index] !== amount) {
      issues.push(name + '现价 ' + amount + ' 金币');
    }
    lines.push({ id, name: p.name, amount });
  }
  if (issues.length) throw new Error(issues.map(text => text.replace(/。$/, '')).join('。') + '。请重新核价。');
  const selected = new Set(ids), risks = [];
  for (const species of speciesList) for (const sex of ['母', '公']) {
    const remaining = s.pets.filter(p => p.species === species && p.sex === sex && !p.bred && !isBusy(s, p) &&
      stageOf(p, now) !== '已故');
    if (remaining.length && remaining.every(p => selected.has(p.id))) risks.push(speciesName(species) + '房最后的未繁育' + sex + speciesName(species));
  }
  const terms = [target.channel, args.targetId || null, lines, risks];
  if (target.species) terms.push(target.species);
  if (filter !== '全部') terms.push(filter);
  if (stage !== '全部') terms.push({stage});
  const hash = createHash('sha256').update(JSON.stringify(terms)).digest('hex');
  return { target, lines, risks, hash, filter, stage, total: lines.reduce((sum, row) => sum + row.amount, 0) };
}
export function validateSaleQuote(s, args, now) {
  const quote = quoteSelection(s, args, now, args.amounts);
  requireValue(quote.hash === args.hash, '报价或未繁育动物余量已变化，请重新核价后再确认。');
  let kept = [];
  if(args.litterRetention) {
    if(args.channel!=='market')throw new Error('请从本窝的自由市场报价确认。');
    kept=retainedLitterPets(s,args.litterRetention,args.ids,now);
  }
  return { quote, kept };
}
function saleCommit(s, args, now) {
  const { quote, kept } = validateSaleQuote(s, args, now);
  const ids = new Set(args.ids);
  for(const p of kept)p.retained=true;
  s.pets = s.pets.filter(p => !ids.has(p.id));
  s.coins += quote.total;
  s.sales.push({ at: now, channel: args.channel, targetId: args.targetId || null, lines: quote.lines, total: quote.total });
  if (quote.target.slot) { quote.target.slot.order = null; quote.target.slot.readyAt = now + 30 * minute; }
  if (args.channel === 'guest') endVisit(s.visitors, now);
  return '已交付 ' + ids.size + ' 只，收入 ' + quote.total + ' 金币。';
}
function researchCost(s, species, target) {
  return purchasePrice(s, researchBases[species] * target * target);
}
function requirements(branch, level) {
  if (level <= 3) return [];
  return (level <= 6 ? [(branch + 1) % 3] : [0, 1, 2].filter(b => b !== branch))
    .map(index => ({ index, needed: level - 3 }));
}
function researchState(s, species, branch) {
  requireValue(speciesList.includes(species) && Number.isInteger(branch) && branch >= 0 && branch < 3, '研究项目不存在。');
  const levels = s.research[species], level = levels[branch];
  if (!s.rooms[species]) return '房间未开放';
  if (level === 10) return '已满级';
  if (requirements(branch, level + 1).some(r => levels[r.index] < r.needed)) return '前置不足';
  if (s.coins < researchCost(s, species, level + 1)) return '金币不足';
  return '可研究';
}
const nextPage = (label, page, args = {}) => ({ label, page, args });
const linkRow = (title, text, page, args = {}, art) => ({ title, text, art, link: { page, args } });
function marketRoster(s, page, args, target, now) {
  const filter = rosterFilter(args.filter);
  const stage = rosterStage(args.stage,args.filter);
  const scope = {channel:'market', ...(target.species && {species:target.species})};
  const rows = [], counts = {'种源保护':0, '繁育中':0, '已故':0};
  let eligibleCount = 0;
  for (const p of s.pets) {
    if (!target.eligible(p) || !rosterFilters[filter](s,p,now) || (stage!=='全部' && stageOf(p,now)!==stage)) continue;
    const reasons = saleBlocks(s,p,now,'market');
    const number = p.id.slice(0,5).toUpperCase(), summary = petCaption(p,now,stockStatus(s,p));
    const visual = {name:p.name, number, summary};
    const row = {...linkRow(p.name,summary+' · #'+number,'pet',{id:p.id},petArt(p)), stage:stageOf(p,now), visual};
    if (reasons.length) {
      for (const reason of reasons) counts[reason]++;
      visual.blockedReason = reasons.join(' · ');
      row.text += ' · 不可出售：'+visual.blockedReason;
    } else {
      visual.price = salePrice(s,p,now,'market',target.rate);
      row.title += '  ·  '+visual.price+' 金币';
      row.select = p.id;
      eligibleCount++;
    }
    rows.push(row);
  }
  const reasons = Object.entries(counts).filter(([,count])=>count).map(([reason,count])=>reason+' '+count+' 只');
  return {title:channelNames.market, subtitle:[target.condition,...reasons].join(' · '),
    visual:{eligibleCount, protectedCount:counts.种源保护}, empty:'当前筛选下没有动物。', rows,
    filters:[Object.keys(rosterFilters).map(label=>({...nextPage(label,page,{...scope,filter:label,stage}), active:label===filter})),
      ['全部',...stageNames].map(label=>({...nextPage(label,page,{...scope,filter,stage:label}),active:label===stage}))],
    actions:eligibleCount?[{...nextPage('核对所选报价','saleQuote',{...scope,...(filter!=='全部'&&{filter}),...(stage!=='全部'&&{stage})}),useSelection:true}]:[]};
}
function orderActions(s, id) {
  const source = s.businessDay.freeUsed < 3 ? 'free' : 'paid';
  const actions = [nextPage('选择交付动物', 'sale', { channel: 'order', targetId: id })];
  if (source === 'free' || s.cancelCredits > 0) {
    actions.push({ label: source === 'free' ? '使用免费次数取消' : '使用已购次数取消', type: 'order.cancel',
      args: { id, source }, confirm: '消耗一次' + (source === 'free' ? '免费' : '已购') +
        '取消次数，本槽 30 分钟后更新。确认取消？', go: 'orders' });
  } else actions.push(nextPage('查看额外取消次数', 'credits'));
  return actions;
}

export function businessPage(s, page, args, now) {
  if (page === 'lab') {
    return { title: '研究所', art: 'shop-modules/lab', visual: { shelf: carePage(s,'shelf',{species:'rabbit'},now) }, rows: [
      linkRow('幼体货架', '每个已开放动物房各有两格，每 30 分钟换批。', 'shelf'),
      linkRow('研究手册', '选一个动物房，看看研究能让幼体或售价改善多少。', 'research'),
      linkRow('服务单', '购买特征复评或选育指导服务。', 'services'),
      linkRow('回收窗口', '仅回收已故动物，可多选并逐只核价。', 'recycle'),
    ] };
  }
  if (page === 'market' || page === 'recycle' || page === 'sale') {
    const channel = page === 'sale' ? args.channel : page;
    const target = saleTarget(s, { ...args, channel }, now);
    if (channel === 'market') return marketRoster(s,page,args,target,now);
    const targetArgs = { channel, ...(args.targetId && { targetId: args.targetId }), ...(target.species && { species: target.species }) };
    const eligible = [], omitted = { 种源保护: 0, 繁育中: 0, 已故: 0, 活体: 0, 不符需求: 0 };
    for (const p of s.pets) {
      if (target.species && p.species !== target.species) continue;
      const blocked = !target.eligible(p) ? '不符需求' : saleBlock(s, p, now, channel);
      if (blocked) omitted[blocked]++;
      else eligible.push(p);
    }
    const reasons = Object.entries(omitted).filter(([, count]) => count).map(([reason, count]) => reason + ' ' + count + ' 只');
    return { title: channelNames[channel], subtitle: [target.condition, ...reasons].join(' · '), visual:{protectedCount:omitted.种源保护},
      empty: (channel === 'recycle' ? '当前没有可回收的已故动物。' : '当前没有符合收购条件的动物。') +
        (omitted.种源保护 ? '种源不可出售，可在个体档案中取消留种。' : ''),
      rows: eligible.map(p => {
        const price = salePrice(s, p, now, channel, target.rate);
        return { title: p.name + '  ·  ' + price + ' 金币', visual:{ name:p.name,price,summary:petCaption(p,now) },
          text: petCaption(p, now) + ' · #' + p.id.slice(0, 6).toUpperCase(),
          art: petArt(p), stage: stageOf(p, now), select: p.id };
      }),
      actions: eligible.length ? [{ label: '核对所选报价', page: 'saleQuote', args: targetArgs, useSelection: true }] : [] };
  }
  if (page === 'saleQuote') {
    const { target, lines, total, risks, hash, filter, stage } = quoteSelection(s, args, now);
    const scope = target.species ? { species: target.species } : {};
    const rows = lines.map(line => ({ title: line.name, text: line.amount + ' 金币 · 编号 ' + line.id.slice(0, 6).toUpperCase() }));
    if (risks.length) rows.push({ title: '繁育提醒', text: '本批包含' + risks.join('、') + '。' });
    return { title: '核对出售', subtitle: channelNames[args.channel] + ' · ' + lines.length + ' 只，合计 ' + total + ' 金币',
      rows, actions: [{ label: '确认交付 · ' + total + ' 金币', type: 'sale.commit',
        args: { channel: args.channel, ...scope, ...(filter!=='全部'&&{filter}), ...(stage!=='全部'&&{stage}), ids: args.ids, targetId: args.targetId || null,
          amounts: lines.map(line => line.amount), hash } }, { label: '修改选择', type: 'ui.editSelection' }] };
  }
  if (page === 'orders') {
    return { title: '普通订单', subtitle: '普通订单长期有效，交付时核验动物。', visual:{remaining:3 - s.businessDay.freeUsed}, rows: s.orders.map((slot, i) => {
      if (!slot.order) return { title: '第 ' + (i + 1) + ' 单 · 等待新客', text: timeLabel(slot.readyAt) + ' 更新（北京时间）' };
      const order=slot.order, condition=orderCondition(order), difficulty=['简单', '普通', '困难'][order.diff];
      const available=canFillOrder(s,order,now);
      const choices=orderActions(s,order.id);
      return {...linkRow('第 ' + (i + 1) + ' 单 · ' + difficulty, condition + ' · 基础估值 ×' + (order.rate / 100), 'orderDesk', { id:order.id }),
        visual:{name:order.breed?'品种收养委托':order.tag?'特征收养委托':'街坊的委托',condition,difficulty,rate:order.rate/100,available,choices}};
    }),
      actions: [nextPage('额外取消次数', 'credits')] };
  }
  if (page === 'orderDesk') {
    const slot = s.orders.find(item => item.order?.id === args.id);
    if (!slot) return { title: '委托已结束', rows: [], actions: [nextPage('查看订单夹', 'orders')] };
    return { title: '普通委托', subtitle: orderCondition(slot.order), rows: [
      ...orderStockRows(s, slot.order, now),
      { title: '订单倍率', text: '基础估值 ×' + slot.order.rate / 100 + '，荣誉另计。' },
      { title: '可用取消次数', text: '今日免费 ' + (3 - s.businessDay.freeUsed) + ' 次 · 已购 ' + s.cancelCredits + ' 次' },
    ], actions: orderActions(s, args.id) };
  }
  if (page === 'credits') {
    const price = purchasePrice(s, 300);
    return { title: '额外取消次数', rows: [
      { title: '今日免费剩余', text: (3 - s.businessDay.freeUsed) + ' / 3 次' },
      { title: '已购余额', text: s.cancelCredits + ' / 99 次 · 跨日保留' },
      { title: '今日已购买', text: s.businessDay.bought + ' / 3 次' },
      { title: '每次基准 300 金币', text: '实付 ' + price + ' 金币' },
    ], actions: s.businessDay.bought < 3 && s.cancelCredits < 99 && s.coins >= price ?
      [{ label: '购买 1 次', type: 'order.buyCredit', args: { price },
        confirm: '支付 ' + price + ' 金币，增加 1 次额外取消次数？' }] : [] };
  }
  if (page === 'guest') {
    const v = s.visitors, g = v.active;
    if (!g) return { title: '特殊来客', art: 'shop-modules/guest', rows: [
      { title: '正在候客', text: '符合顾客偏好的动物可吸引特殊来客；在店经营时等候到访。' },
      { title: '今日到店', text: s.businessDay.arrived + ' / 6 位' },
    ] };
    const hasMatch = s.pets.some(p => !saleBlock(s, p, now, 'guest') && matchesVisit(p, g.requirement, now));
    return { title: '书店来客', subtitle: visitCondition(g), rows: [
      { title: '来客报价', text: '基础估值 ×2.15，荣誉另计。' },
      { title: '离店时间', text: timeLabel(g.endsAt) + '（北京时间）' },
      ...(!hasMatch ? [{ title: '暂时无法交付', text: '店内空闲动物尚未满足这份委托，可在客人离店前再次查看。' }] : []),
    ], actions: [{ ...nextPage('挑选动物', 'sale', { channel: 'guest', targetId: g.id }), disabled: !hasMatch },
      { label: '婉拒来客', type: 'guest.dismiss', args: { id: g.id }, confirm: '婉拒后这位客人将离店。' }] };
  }
  if (page === 'research' || page === 'researchNode' || page === 'researchTable') return researchPage(s, page, args);
  if (page === 'decor') return decorPage(s);
  return null;
}

function researchPage(s, page, args) {
  const species = args.species ?? 'rabbit';
  requireValue(speciesList.includes(species), '物种不存在。');
  const levels = s.research[species];
  const benefitAt = (branch, level) => researchBenefit(branch, level, speciesName(species), s.rooms[species]?.mutationEnabled !== false);
  if (page === 'research') {
    return { title: '研究技能树', visual:{levels,open:!!s.rooms[species],handbook:speciesName(species)+'房研究手册'}, subtitle: s.rooms[species] ?
      '当前总等级 ' + levels.reduce((sum, x) => sum + x, 0) + ' / 30' : '开放该物种房间后可以研究。',
      tabs: speciesList.map(key => ({...nextPage(speciesName(key) + '房', 'research', { species: key }), active: key === species})),
      rows: levels.map((level, branch) => {
        const benefit = benefitAt(branch, level), status = researchState(s, species, branch);
        return { ...linkRow(researchNames[branch] + ' · ' + level + ' 级',
          benefit.overview + ' · ' + status, 'researchNode', { species, branch }), visual: { benefit, status } };
      }) };
  }
  const branch = args.branch, status = researchState(s, species, branch);
  const level = levels[branch], target = level + 1;
  const benefit = benefitAt(branch, level), description = benefit.description;
  if (page === 'researchTable') {
    return { title: researchNames[branch], subtitle: description, visual: { benefit, status }, rows: Array.from({ length: 11 }, (_, i) => {
      const entry = benefitAt(branch, i);
      return { title: i + ' 级' + (level === i ? ' · 当前' : ''), text: entry.currentBonus, visual: { benefit: entry } };
    }) };
  }
  const rows = [{ title: '当前 · ' + level + ' 级', text: benefit.currentBonus }];
  const origin=Number.isInteger(args.originBranch)&&args.originBranch>=0&&args.originBranch<levels.length?args.originBranch:branch;
  const context=origin===branch?{species,branch}:{species,branch,originBranch:origin};
  const actions = [nextPage('查看 0–10 级效果', 'researchTable', context)];
  if(origin!==branch) actions.push(nextPage('查看原研究','researchNode',{species,branch:origin}));
  if (level < 10) {
    const price = researchCost(s, species, target);
    rows.push({ title: '下级 · ' + target + ' 级', text: benefit.nextBonus },
      { title: '基准 / 实付', text: researchBases[species] * target * target + ' / ' + price + ' 金币' },
      { title: '本分支前置', text: '需要 ' + level + ' 级 · 已满足' });
    for (const req of requirements(branch, target)) {
      rows.push(linkRow(researchNames[req.index] + ' · 前置', levels[req.index] + ' / ' + req.needed + ' 级 · ' +
        (levels[req.index] >= req.needed ? '已满足' : '未满足'), 'researchNode', { species, branch: req.index, originBranch:origin }));
    }
    if (status === '可研究') {
      const subject = ['重新抽一个标签时，抽到稀有的机会',
        '例如父母毛发都是 B，幼体毛发升到 A 的机会', '例如原本估价 200 金币，繁育后能保留的身价'][branch];
      const confirm = [speciesName(species) + '房' + researchNames[branch] + '升至 ' + target + ' 级',
        '花费 ' + price + ' 金币', subject, benefit.currentValue + ' → ' + benefit.nextValue, benefit.switchNote]
        .filter(Boolean).join('\n');
      actions.push({ label: '升级至 ' + target + ' 级', type: 'research.upgrade', args: { species, branch, level, price }, confirm });
    }
  }
  return { title: researchNames[branch], subtitle: description + ' ' + status, visual:{description,status,benefit},rows, actions };
}
function decorPage(s) {
  return { title: '店内装饰', subtitle: '购入后可随时在固定位置摆出或收起。', rows: Object.entries(ornaments).map(([key, item]) => {
    const record = s.decor[key], price = purchasePrice(s, item.base), art = 'decor/' + key;
    if (!record.owned) return { title: item.name, art, text: '基准 ' + item.base + ' · 实付 ' + price + ' 金币',
      action: { type: 'decor.buy', args: { key, price }, confirm: '购买' + item.name + '？基准 ' + item.base + ' 金币，实付 ' + price + ' 金币。' } };
    return { title: item.name + (record.placed ? ' · 已摆出' : ' · 已收起'), art,
      text: record.placed ? '点此收起' : '点此摆出', action: { type: 'decor.place', args: { key, placed: !record.placed } } };
  }) };
}
function pay(s, price, agreed) {
  requireValue(agreed === price, '实付价格有变化，请重新确认。');
  requireValue(s.coins >= price, '金币不足。');
  s.coins -= price;
}
export function businessAction(s, type, args, now) {
  switch (type) {
    case 'sale.commit': return saleCommit(s, args, now);
    case 'order.buyCredit': {
      requireValue(s.businessDay.bought < 3, '今天已经买过 3 次。');
      requireValue(s.cancelCredits < 99, '已购次数达到 99 次。');
      pay(s, purchasePrice(s, 300), args.price);
      s.cancelCredits++;
      s.businessDay.bought++;
      return '已购入 1 次额外取消次数。';
    }
    case 'order.cancel': {
      const slot = s.orders.find(entry => entry.order?.id === args.id);
      requireValue(slot, '委托已结束，请查看当前订单。');
      if (args.source === 'free') {
        requireValue(s.businessDay.freeUsed < 3, '今日免费次数已用完，请重新选择。');
        s.businessDay.freeUsed++;
      } else {
        requireValue(args.source === 'paid' && s.businessDay.freeUsed >= 3 && s.cancelCredits > 0,
          '当前取消额度变化，请重新确认。');
        s.cancelCredits--;
      }
      slot.order = null;
      slot.readyAt = now + 30 * minute;
      return '已取消委托，此槽将在 30 分钟后更新。';
    }
    case 'guest.dismiss': {
      requireValue(s.visitors.active && s.visitors.active.id === args.id, '这位来客已经离店。');
      endVisit(s.visitors, now);
      return '已送别来客。';
    }
    case 'research.upgrade': {
      const { species, branch, level, price } = args;
      const status = researchState(s, species, branch);
      requireValue(status === '可研究', status);
      requireValue(level === s.research[species][branch], '研究等级已变化，请重新确认。');
      pay(s, researchCost(s, species, level + 1), price);
      s.research[species][branch]++;
      return speciesName(species) + '房' + researchNames[branch] + '已升至 ' + (level + 1) + ' 级。';
    }
    case 'decor.buy': {
      const { key, price } = args;
      requireValue(Object.hasOwn(ornaments, key), '装饰不存在。');
      requireValue(!s.decor[key].owned, '该装饰已购买。');
      pay(s, purchasePrice(s, ornaments[key].base), price);
      s.decor[key].owned = true;
      return '已购买' + ornaments[key].name + '，可点选摆出。';
    }
    case 'decor.place': {
      const { key, placed } = args;
      requireValue(Object.hasOwn(ornaments, key) && s.decor[key].owned && typeof placed === 'boolean', '请先购买该装饰。');
      s.decor[key].placed = placed;
      return ornaments[key].name + (placed ? '已摆出。' : '已收起。');
    }
    default: return undefined;
  }
}
