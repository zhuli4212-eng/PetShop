import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { initCare, careAction, carePage } from './care.mjs';
import { initBusiness, tickBusiness, businessHeartbeat, businessPage as view, businessAction as act,
  purchasePrice, youngPurchaseBase, salePrice, readyOrderId } from './business.mjs';

const t0 = Date.parse('2026-11-16T00:00:00+08:00'), min = 60_000;
function fresh() {
  const s = { coins: 680, ratingBps: 0 };
  initCare(s, t0);
  initBusiness(s, t0);
  return s;
}
const quoted = (s, channel, ids, targetId, at = t0) =>
  view(s, 'saleQuote', { channel, ids, targetId }, at).actions[0].args;

test('订单区分缺项、占用及未持有的货架幼体，采购预计收入与实际成交一致', () => {
  const s = fresh(), [mother, father] = s.pets;
  const [offer] = s.rooms.rabbit.shelf.offers;
  s.orders = [
    { order: { id:'first', species:'rabbit', breed:offer.breedKey, diff:1, rate:155 } },
    { order: { id:'second', species:'rabbit', tag:offer.traits[0].label, diff:1, rate:155 } },
    { order: null, readyAt:t0+min },
  ];
  // One matching animal is deceased, the other is reserved for breeding.
  for (const pet of s.pets) pet.breedKey=offer.breedKey;
  mother.bornAt=t0-5*24*60*min;
  s.rooms.rabbit.job={motherId:'another-mother',fatherId:father.id};
  const missing=view(s,'orderDesk',{id:'first'},t0);
  assert.match(missing.rows.find(r=>r.title==='本店可交付 0 只').text,/已故 1 只.*繁育中 1 只/);
  assert.match(missing.rows.find(r=>r.link?.args?.id===offer.id).text,/尚未持有.*购价.*预计收入/);
  assert.equal(missing.rows.find(r=>r.link?.args?.id===offer.id).stage,'幼年');
  const details=()=>carePage(s,'offer',{species:'rabbit',id:offer.id},t0);
  const preview=details(), orders=preview.rows.filter(r=>r.title.startsWith('可交第'));
  assert.equal(preview.stage,'幼年');
  assert.deepEqual(orders.map(r=>r.title),['可交第 1 单','可交第 2 单']);
  const purchase=preview.actions[0], price=purchase.args.price, before=s.coins;
  careAction(s,purchase.type,purchase.args,t0);
  assert.equal(s.coins,before-price);
  const quote=quoted(s,'order',[offer.id],'first');
  assert.match(orders[0].text,new RegExp('预计收入 '+quote.amounts[0]+' 金币'));
  act(s,'sale.commit',quote,t0);
  assert.equal(s.coins,before-price+quote.amounts[0]);
  assert.throws(()=>act(s,'sale.commit',quote,t0),error=>{
    assert.match(error.message,/委托已经结束/);
    assert.ok(error.message.includes(offer.name) && error.message.includes('已离店'));
    return true;
  });
  assert.match(details().rows[0].title,/售出或换批/);
  s.rooms.rabbit.shelf.offers=[null,null];
  const noStock=view(s,'orderDesk',{id:'second'},t0);
  assert.ok(noStock.rows.some(r=>r.title==='所需标签 · '+offer.traits[0].label));
  assert.match(noStock.rows.find(r=>r.title==='本批货架').text,/没有.*下一批随机/);
});

test('确认繁育显示选育方向，复评风险和采购报价仍按现行规则显示', () => {
  const s=fresh(),[mother,father]=s.pets;
  mother.traits[0].grade='S';
  s.rooms.rabbit.items={guide:1,review:1};
  const pair=carePage(s,'breed',{species:'rabbit',mother:mother.id,father:father.id,guide:0},t0);
  assert.match(pair.actions.find(a=>a.type==='care.breed').confirm,/选育指导 幼体性格属性会更容易遗传自母本/);
  const review=carePage(s,'review',{species:'rabbit',id:mother.id},t0);
  assert.equal(review.stage,'成年');
  assert.equal(carePage(s,'review',{species:'rabbit',id:mother.id},t0+3*24*60*min).stage,'老年');
  assert.match(review.rows[0].text,/70%、20%、10%.*同词或稀有度降低.*无法选回/);
  assert.match(review.rows[1].action.confirm,/降档也消耗.*无法选回/);
  s.coins=6000;
  careAction(s,'care.unlock',{species:'cat',price:6000},t0);
  s.ratingBps=10000;
  const services=carePage(s,'services',{species:'cat'},t0);
  assert.match(services.actions.find(a=>a.args.item==='review').confirm,/基准 300 金币，实付 290 金币/);
  assert.match(view(s,'decor',{},t0).rows.find(r=>r.title==='台灯').action.confirm,/基准 60 金币，实付 60 金币/);
});

test('售价和支出按定稿逐阶段整算，荣誉独立于渠道和后代', () => {
  const s = fresh();
  s.ratingBps = 10000;
  const cat = { ...s.pets[0], species: 'cat', breedKey: 'british', bornAt: t0 - 90 * min };
  assert.equal(youngPurchaseBase(cat), 2690);
  assert.equal(purchasePrice(s, 2690), 2560);
  assert.equal(purchasePrice(s, 300), 290);
  assert.equal(purchasePrice(s, 60), 60);
  assert.equal(salePrice(s, cat, t0, 'market'), 2400);
  assert.equal(salePrice(s, cat, t0, 'order', 135), 3240);
  cat.honor = .8;
  assert.equal(salePrice(s, cat, t0, 'guest', 215), 7080);
  cat.bred = true;
  assert.equal(salePrice(s, cat, t0, 'market'), 2400);
  cat.bornAt = t0 - 12 * 24 * 60 * min;
  assert.equal(salePrice(s, cat, t0, 'recycle'), 1200);
  s.research.cat[2] = 10;
  assert.equal(salePrice(s, cat, t0, 'recycle'), 1200);
});

test('多只交付一次完成单槽；跨日未交单仍在，到期一槽仅补一张', () => {
  const s = fresh(), id = s.orders[0].order.id;
  tickBusiness(s, t0 + 24 * 60 * min);
  assert.equal(s.orders[0].order.id, id);
  const ids = s.pets.map(p => p.id);
  const live = quoted(s, 'order', ids, id);
  const page = view(s, 'saleQuote', live, t0);
  assert.equal(page.rows.length, 3);
  assert.ok(page.rows[2].text.includes('最后'));
  assert.throws(() => quoted(s, 'order', [ids[0], ids[0]], id));
  act(s, 'sale.commit', live, t0);
  assert.equal(s.coins, 680 + 2 * 162);
  assert.equal(s.pets.length, 0);
  assert.equal(s.sales[0].lines.length, 2);
  assert.equal(s.orders.filter(slot => slot.order).length, 2);
  assert.throws(() => act(s, 'sale.commit', live, t0));
  tickBusiness(s, t0 + 30 * min - 1);
  assert.equal(s.orders[0].order, null);
  tickBusiness(s, t0 + 30 * min);
  assert.ok(s.orders[0].order && s.orders[0].order.id !== id);
});

test('从房间挑选、报价和交付同物种的多只动物，从市场柜台可看全店', () => {
  const s=fresh(), ids=s.pets.map(p=>p.id);
  const cat={...s.pets[0],id:'cat-in-next-room',species:'cat',breedKey:'british'};
  s.pets.push(cat);
  const scope={channel:'market',species:'rabbit'};
  const sale=view(s,'sale',scope,t0);
  assert.deepEqual(sale.rows.map(row=>row.select),ids);
  assert.deepEqual(sale.actions[0].args,scope);
  assert.equal(view(s,'market',{},t0).rows.length,3);
  assert.throws(()=>view(s,'saleQuote',{...scope,ids:[ids[0],cat.id]},t0),/不再符合/);
  const [confirm,edit]=view(s,'saleQuote',{...scope,ids},t0).actions;
  assert.equal(edit.type,'ui.editSelection');
  assert.equal(confirm.go,undefined);
  assert.equal(confirm.args.species,'rabbit');
  assert.equal(view(s,'recycle',{},t0).rows.length,0);
  cat.bornAt=t0-10*24*60*min;
  const recycled=view(s,'recycle',{species:'cat'},t0);
  assert.deepEqual(recycled.rows.map(row=>row.select),[cat.id]);
  assert.deepEqual(recycled.actions[0].args,{channel:'recycle',species:'cat'});
  assert.equal(view(s,'recycle',{},t0).rows.length,1);
  act(s,confirm.type,confirm.args,t0);
  assert.deepEqual(s.pets.map(p=>p.id),[cat.id]);
});

test('市场两个入口按房间标签显示可售和禁售个体，切换筛选保留入口及房种', () => {
  const s = fresh(), [mother,father] = s.pets;
  father.bred = true;
  function add(id, fields) {
    const p = {...mother,id,name:id,...fields};
    s.pets.push(p);
    return p;
  }
  const seed = add('seed-rabbit',{retained:true});
  const busy = add('busy-seed',{retained:true});
  const dead = add('dead-seed',{retained:true,bornAt:t0-7*24*60*min});
  const cat = add('cat-seed',{species:'cat',breedKey:'british',retained:true});
  s.rooms.rabbit.job = {motherId:busy.id,fatherId:'unregistered'};
  const expected = {
    全部:[mother,father,seed,busy,dead], 种源:[seed,busy,dead], 未繁育:[mother,seed],
  };
  for (const [filter, pets] of Object.entries(expected)) {
    const room = carePage(s,'rooms',{species:'rabbit',filter},t0);
    assert.deepEqual(room.rows.flatMap(row=>row.animal?[row.animal.id]:[]),pets.map(p=>p.id));
    for (const [page,scope] of [['sale',{channel:'market',species:'rabbit'}],['market',{channel:'market'}]]) {
      const listed = view(s,page,{...scope,filter},t0);
      const all = page==='market' ? [...pets,cat] : pets;
      assert.deepEqual(listed.rows.map(r=>r.link.args.id),all.map(p=>p.id));
      assert.equal(listed.visual.eligibleCount,all.filter(p=>p===mother||p===father).length);
      assert.equal(listed.visual.protectedCount,all.filter(p=>p.retained).length);
      assert.deepEqual(listed.filters[0].map(choice=>choice.label),Object.keys(expected));
      assert.deepEqual(listed.filters[0].filter(choice=>choice.active).map(choice=>choice.label),[filter]);
      for (const choice of listed.filters[0]) {
        assert.equal(choice.page,page);
        assert.deepEqual(choice.args,{...scope,filter:choice.label,stage:'全部'});
      }
      for (const [i,row] of listed.rows.entries()) {
        const p=all[i];
        assert.equal(row.link.page,'pet');
        assert.equal(row.visual.number,p.id.slice(0,5).toUpperCase());
        if(s.rooms[p.species]){
          const {stageEndsAt,...roomAnimal}=carePage(s,'rooms',{species:p.species},t0).rows.find(r=>r.animal?.id===p.id).animal;
          assert.deepEqual(row.animal,roomAnimal);
        }
        if (p===mother || p===father) {
          assert.equal(row.select,p.id);
          assert.equal(row.visual.price,salePrice(s,p,t0,'market'));
          assert.equal(row.visual.blockedReason,undefined);
        } else {
          assert.equal(row.select,undefined);
          assert.equal(row.visual.price,undefined);
          assert.match(row.visual.blockedReason,/种源保护/);
          if(p===busy)assert.match(row.visual.blockedReason,/繁育中/);
          if(p===dead)assert.match(row.visual.blockedReason,/已故/);
        }
      }
      assert.equal(listed.actions.length,Number(listed.visual.eligibleCount>0));
      const stages=['全部','幼年','成长','成年','老年','已故'];
      assert.deepEqual(listed.filters[1].map(o=>o.label),stages);
      for (const choice of listed.filters[1]){
        const stage=choice.label;
        assert.deepEqual(choice.args,{...scope,filter,stage});
        const filtered=view(s,page,choice.args,t0);
        const matches=all.filter(p=>stage==='全部'||stage===(p===cat?'成长':p===dead?'已故':'成年'));
        assert.deepEqual(filtered.rows.map(r=>r.link.args.id),matches.map(p=>p.id));
        assert.equal(filtered.visual.eligibleCount,matches.filter(p=>p===mother||p===father).length);
        assert.ok(filtered.filters[0].every(o=>o.args.stage===stage));
      }
    }
  }
  const empty=view(s,'sale',{channel:'market',species:'dog',filter:'已故'},t0);
  assert.equal(empty.rows.length,0);
  assert.equal(empty.visual.eligibleCount,0);
  const legacy=view(s,'market',{filter:'已故'},t0);
  assert.deepEqual(legacy.filters.map(group=>group.find(o=>o.active).label),['全部','已故']);
  assert.deepEqual(legacy.rows.map(row=>row.link.args.id),[dead.id]);
});

test('市场成长阶段进入新报价的凭据，跨阶段整批拒绝，旧报价按原条件成交',()=>{
  const s=fresh(),[a,b]=s.pets,scope={channel:'market',species:'rabbit',filter:'未繁育',stage:'幼年'};
  a.bornAt=t0-12*min+1;b.bornAt=t0;
  const list=view(s,'sale',scope,t0);
  assert.deepEqual(list.actions[0].args,scope);
  const ids=[a.id,b.id], command=view(s,'saleQuote',{...scope,ids},t0).actions[0];
  assert.equal(command.args.stage,'幼年');
  assert.throws(()=>act(s,command.type,{...command.args,stage:'全部'},t0),/重新核价/);
  assert.throws(()=>act(s,command.type,command.args,t0+1),/不符合「幼年」筛选，目前为成长/);
  assert.throws(()=>view(s,'saleQuote',{...scope,ids},t0+1),/不符合「幼年」筛选/);
  assert.deepEqual(s.pets.map(p=>p.id),ids);assert.equal(s.coins,680);assert.equal(s.sales.length,0);
  // A quote issued by the previous four-status market has no growth-stage term.
  const amount=salePrice(s,a,t0,'market'),lines=[{id:a.id,name:a.name,amount}];
  const terms=['market',null,lines,['兔房最后的未繁育母兔'],'rabbit','未繁育'];
  const hash=createHash('sha256').update(JSON.stringify(terms)).digest('hex');
  act(s,'sale.commit',{channel:'market',species:'rabbit',filter:'未繁育',ids:[a.id],amounts:[amount],hash},t0);
  assert.deepEqual(s.pets.map(p=>p.id),[b.id]);assert.equal(s.coins,680+amount);
});

test('市场筛选报价和成交复核个体状态；在全部中已繁育、空闲、未留种的动物可售', () => {
  const s=fresh(), [a,b]=s.pets;
  const scope={channel:'market',species:'rabbit',filter:'未繁育'};
  const list=view(s,'sale',scope,t0);
  assert.deepEqual(list.actions[0].args,scope);
  const ids=[a.id], confirm=view(s,'saleQuote',{...list.actions[0].args,ids},t0).actions[0];
  assert.equal(confirm.args.filter,scope.filter);
  assert.throws(()=>act(s,confirm.type,{...confirm.args,filter:'全部'},t0),/重新核价/);
  s.rooms.rabbit.job={motherId:a.id,fatherId:b.id};
  assert.throws(()=>act(s,confirm.type,confirm.args,t0),/繁育中/);
  s.rooms.rabbit.job=null;
  a.bred=true;
  assert.throws(()=>view(s,'saleQuote',{...scope,ids},t0),/不符合「未繁育」筛选/);
  assert.throws(()=>act(s,confirm.type,confirm.args,t0),/不符合「未繁育」筛选/);
  assert.equal(s.sales.length,0);
  assert.equal(s.coins,680);
  const current=view(s,'market',{},t0).rows.find(r=>r.select===a.id);
  assert.match(current.visual.summary,/已繁育/);
  const quote=quoted(s,'market',ids);
  assert.deepEqual(quote.amounts,[current.visual.price]);
  act(s,'sale.commit',quote,t0);
  assert.equal(s.coins,680+current.visual.price);
  assert.deepEqual(view(s,'market',{},t0).rows.map(r=>r.select),[b.id]);
});

test('批量同一只失效/变价拒绝整批；幼年和已故仅可按对应渠道交付', () => {
  const s = fresh(), [a, b] = s.pets, ids = [a.id, b.id];
  const oldQuote = quoted(s, 'market', ids);
  s.ratingBps = 10000;
  assert.throws(() => act(s, 'sale.commit', oldQuote, t0), /重新核价/);
  assert.equal(s.pets.length, 2);
  assert.equal(s.coins, 680);
  s.ratingBps = 0;
  s.rooms.rabbit.job = { motherId: a.id, fatherId: 'other' };
  assert.throws(() => act(s, 'sale.commit', oldQuote, t0), /不再符合/);
  s.rooms.rabbit.job = null;
  a.bornAt = t0 - 10 * 24 * 60 * min;
  const market=view(s,'market',{},t0);
  assert.equal(market.rows.length,2);
  assert.equal(market.visual.eligibleCount,1);
  assert.equal(market.rows.find(r=>r.link.args.id===a.id).visual.blockedReason,'已故');
  assert.deepEqual(view(s, 'recycle', {}, t0).rows.map(r=>r.select), [a.id]);
  const before=structuredClone(s);
  assert.throws(()=>quoted(s,'recycle',ids),/只回收已故/);
  assert.throws(()=>act(s,'sale.commit',{...oldQuote,channel:'recycle'},t0),/只回收已故/);
  assert.deepEqual(s,before);
  act(s, 'sale.commit', quoted(s, 'recycle', [a.id]), t0);
  assert.deepEqual(s.pets.map(p=>p.id), [b.id]);
  assert.equal(s.coins, 680 + 7);
});

test('种源不进入任何交易，报价后留种整笔拒绝；取消留种后可重新核价',()=>{
  for(const channel of ['market','order','guest']){
    const s=fresh(), [a,b]=s.pets, ids=[a.id,b.id];
    let targetId;
    if(channel==='order')targetId=s.orders[0].order.id;
    if(channel==='guest'){
      for(const p of s.pets)p.traits[0]={...p.traits[0],label:'温顺',grade:'A'};
      targetId='regular-guest';
      s.visitors.active={id:targetId,endsAt:t0+min,requirement:{species:'rabbit',breed:'angora',stage:'成年',dimension:0,tag:'温顺',rarity:'普通'}};
    }
    const at=t0;
    const sale=()=>view(s,'sale',{channel,targetId},at);
    const quote=quoted(s,channel,ids,targetId,at);
    for(const p of s.pets)careAction(s,'care.retain',{id:p.id,retained:true},t0);
    const protectedList=sale();
    assert.equal(protectedList.rows.length,channel==='market'?2:0);
    assert.equal(protectedList.visual.protectedCount,2);
    assert.equal(protectedList.actions.length,0);
    if(channel!=='market')assert.match(protectedList.empty,/种源不可出售/);
    if(channel==='order'){
      assert.equal(readyOrderId(s,at),null);
      assert.equal(view(s,'orders',{},at).rows[0].visual.available,false);
    }
    if(channel==='guest')assert.equal(view(s,'guest',{},at).actions[0].disabled,true);
    careAction(s,'care.retain',{id:b.id,retained:false},at);
    assert.deepEqual(sale().rows.filter(r=>r.select).map(r=>r.select),[b.id]);
    const marked=structuredClone(s);
    assert.throws(()=>quoted(s,channel,ids,targetId,at),/种源/);
    assert.throws(()=>act(s,'sale.commit',quote,at),/种源/);
    assert.deepEqual(s,marked);
    careAction(s,'care.retain',{id:a.id,retained:false},at);
    act(s,'sale.commit',quoted(s,channel,ids,targetId,at),at);
    assert.deepEqual(s.pets,[]);
    assert.equal(s.sales.length,1);
  }
});

test('留种保护跨寿终，取消后可批量回收，已故时不能重新标记',()=>{
  const s=fresh(),[a,b]=s.pets, at=t0+7*24*60*min;
  careAction(s,'care.retain',{id:a.id,retained:true},t0);
  assert.equal(view(s,'recycle',{},t0).visual.protectedCount,0);
  const recycled=view(s,'recycle',{},at);
  assert.equal(recycled.visual.protectedCount,1);
  assert.deepEqual(recycled.rows.map(r=>r.select),[b.id]);
  const detail=carePage(s,'pet',{id:a.id},at);
  assert.ok(detail.actions.some(a=>a.type==='care.retain'&&a.args.retained===false));
  assert.ok(!detail.actions.some(a=>a.page==='recycle'));
  const ids=[b.id,a.id], before=structuredClone(s);
  assert.throws(()=>quoted(s,'recycle',ids,null,at),/种源/);
  assert.throws(()=>act(s,'sale.commit',{channel:'recycle',ids},at),/种源/);
  assert.deepEqual(s,before);
  careAction(s,'care.retain',{id:a.id,retained:false},at);
  assert.throws(()=>careAction(s,'care.retain',{id:a.id,retained:true},at),/已故/);
  const quote=quoted(s,'recycle',ids,null,at);
  act(s,'sale.commit',quote,at);
  assert.equal(s.coins,680+quote.amounts.reduce((total,price)=>total+price,0));
  assert.equal(s.pets.length,0);
});

test('免费/额外取消不互相转扣，已购余额跨日', () => {
  const s = fresh();
  act(s, 'order.buyCredit', { price: 300 }, t0);
  const ids = s.orders.map(slot => slot.order.id);
  assert.throws(() => act(s, 'order.cancel', { id: ids[0], source: 'paid' }, t0));
  for (const id of ids) act(s, 'order.cancel', { id, source: 'free' }, t0);
  const next = t0 + 31 * min;
  tickBusiness(s, next);
  assert.throws(() => act(s, 'order.cancel', { id: s.orders[0].order.id, source: 'free' }, next));
  assert.equal(s.cancelCredits, 1);
  assert.equal(s.coins, 380);
  tickBusiness(s, t0 + 24 * 60 * min);
  assert.equal(s.cancelCredits, 1);
  assert.equal(s.businessDay.freeUsed, 0);
  s.cancelCredits = 99;
  assert.throws(() => act(s, 'order.buyCredit', { price: 300 }, next));
  assert.equal(s.coins, 380);
});

test('研究加成百分比和满级保留率；前置/锁房/旧报价不会扣款', () => {
  const s = fresh(); s.coins = 10000;
  s.research.rabbit = [3, 0, 0];
  const args = { species: 'rabbit', branch: 0 };
  const node = () => view(s, 'researchNode', args, t0);
  assert.equal(node().rows[0].text, '+15%');
  assert.equal(node().rows[1].text, '+20%');
  assert.ok(node().subtitle.includes('前置不足'));
  assert.throws(() => act(s, 'research.upgrade', { ...args, level: 3, price: 1600 }, t0));
  assert.throws(() => act(s, 'research.upgrade', { species: 'cat', branch: 0, level: 0, price: 250 }, t0));
  s.research.rabbit[1] = 1;
  const upgrade = node().actions.find(a => a.type);
  assert.throws(() => act(s, upgrade.type, { ...upgrade.args, price: 0 }, t0));
  assert.equal(s.coins, 10000);
  act(s, upgrade.type, upgrade.args, t0);
  assert.equal(s.coins, 8400);
  assert.equal(s.research.rabbit[0], 4);
  assert.equal(view(s, 'researchTable', { ...args, branch: 1 }, t0).rows[10].text, '+30%');
  assert.equal(view(s, 'researchTable', { ...args, branch: 2 }, t0).rows[10].text, '25%');
});

test('手册、各级表和确认窗按本物种的当前等级给出同一组实际效果', () => {
  const s = fresh(), species = 'rabbit';
  s.research.rabbit = [3, 3, 3]; s.coins = 5000;
  s.rooms.rabbit.mutationEnabled = false;
  const handbook = view(s, 'research', {species}, t0);
  const pairs = [['11.5%', '12%'], ['19.62%', '20.16%'], ['43 金币', '44 金币']];
  pairs.forEach(([current, next], branch) => {
    const args = {species, branch}, detail = view(s, 'researchNode', args, t0);
    const benefit = detail.visual.benefit, table = view(s, 'researchTable', args, t0);
    assert.deepEqual(handbook.rows[branch].visual.benefit, benefit);
    assert.equal(table.rows[3].visual.benefit.currentValue, current);
    assert.equal(table.rows[4].visual.benefit.currentValue, next);
    assert.equal(benefit.currentValue, current);
    assert.equal(benefit.nextValue, next);
    assert.equal(Boolean(benefit.switchNote), branch === 1);
    const confirm = detail.actions.find(a => a.type === 'research.upgrade').confirm;
    for (const part of ['兔房', '4 级', '1600 金币', current, next]) assert.ok(confirm.includes(part), part);
    if (branch === 1) assert.ok(confirm.includes(benefit.switchNote));
    assert.equal(table.rows[10].visual.benefit.nextValue, null);
  });
  s.research.rabbit = [10, 10, 10];
  const maxed = view(s, 'researchNode', {species, branch:1}, t0);
  assert.equal(maxed.visual.benefit.currentValue, '23.4%');
  assert.equal(maxed.visual.benefit.nextBonus, null);
  assert.ok(!maxed.actions.some(a => a.type === 'research.upgrade'));
});

test('装饰一次购买，固定位置收放不会重复扣款', () => {
  const s = fresh();
  const { type, args } = view(s, 'decor', {}, t0).rows[0].action;
  act(s, type, args, t0);
  assert.equal(s.coins, 600);
  assert.throws(() => act(s, type, args, t0));
  act(s, 'decor.place', { key: 'fence', placed: true }, t0);
  assert.equal(s.decor.fence.placed, true);
  act(s, 'decor.place', { key: 'fence', placed: false }, t0);
  assert.equal(s.coins, 600);
});

test('来客仅计相邻前台心跳区间，多设备取并集；第三次命中、到期不补发', () => {
  const s = fresh();
  const beat = (id, delta, on = true) => businessHeartbeat(s, { clientId: id, foreground: on }, t0 + delta);
  beat('a', 0); beat('b', 10_000); beat('a', 20_000); beat('b', 30_000);
  assert.equal(s.visitors.elapsed, 30000);
  beat('a', 40_000, false); beat('b', 70_000); beat('a', 75_000);
  assert.equal(s.visitors.elapsed, 30000);
  s.pets[0].traits[0].grade = 'A';
  s.visitors.elapsed = 10 * min - 5000;
  s.visitors.misses = 2;
  beat('a', 80_000);
  assert.equal(s.businessDay.arrived, 1);
  const g = s.visitors.active;
  assert.ok(g.requirement.tag);
  const alive = view(s, 'sale', { channel: 'guest', targetId: g.id }, t0 + 81_000);
  assert.ok(alive.rows.some(row => row.select === s.pets[0].id));
  tickBusiness(s, g.endsAt);
  assert.equal(s.visitors.active, null);
  assert.equal(s.visitors.elapsed, 0);
});
