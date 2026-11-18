import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RequestGameStore } from './request-store.mjs';
import { lifeDates, SPECIES } from './care.mjs';

const minute=60_000, start=Date.UTC(2026,10,19,2);
function fixture() {
  let now=start, game=new RequestGameStore(null,{wall:()=>now,monotonic:()=>0});
  game.state.shopXp=10;
  game.state.coins=100000;
  const read=(key,args={})=>game.page(key,args).page;
  const command=(type,args)=>{
    const {profileId,version}=game.shop();
    return {requestId:randomUUID(),profileId,version,type,args};
  };
  return {get game(){return game;},read,command,
    choose:choice=>game.act(command(choice.type,choice.args)),
    at(time){now=time;game.shop();},
    reopen(){game=new RequestGameStore(game.snapshot(),{wall:()=>now,monotonic:()=>0});},
  };
}

test('定向预约在下个批次交付指定品种和性别，费用、回执与普通货架独立',()=>{
  const f=fixture(),species='cat',breedKey='maine';
  const selected={species,breedKey};
  assert.match(f.read('seedReservation',selected).rows[0].text,/先开放/);
  assert.throws(()=>f.choose({type:'seed.reserve',args:{...selected,sex:'母',fee:200}}),/先开放/);
  f.choose({type:'care.unlock',args:{species,price:SPECIES.cat.roomCost}});
  const {actions}=f.read('lab');
  assert.deepEqual(actions.map(a=>a.page),['seedReservation','breedingCourses']);
  const seed=f.read('seedReservation',selected).actions[0];
  const before=f.game.state.coins, shelf=structuredClone(f.game.state.rooms.cat.shelf);
  const command=f.command(seed.type,seed.args);
  const receipt=f.game.act(command);
  f.reopen();
  assert.deepEqual(f.game.act(command),receipt);
  assert.deepEqual(f.game.state.rooms.cat.shelf,shelf);
  assert.equal(f.game.state.coins,before-200);
  assert.throws(()=>f.choose(seed),/今日已预约/);
  const held=f.game.state.rooms.cat.reservedSeed;
  assert.throws(()=>f.choose({type:'seed.claim',args:{species,id:held.offer.id,price:0}}),/尚未到货/);
  f.at(start+31*minute);
  assert.notEqual(f.game.state.rooms.cat.shelf.number,shelf.number);
  const purchase=f.read('seedReservation',selected).actions[0];
  assert.equal(purchase.args.id,held.offer.id);
  f.choose(purchase);
  const pet=f.game.state.pets.at(-1);
  assert.deepEqual([pet.breedKey,pet.sex,pet.bornAt],['maine','母',start+31*minute]);
  assert.equal(f.game.state.coins,before-200-purchase.args.price);
  assert.match(f.read('seedReservation',selected).rows.at(-1).title,/今日已预约/);

  f.at(start+1440*minute);
  let wallet=f.game.state.coins;
  f.choose(seed);
  f.choose(f.read('seedReservation',selected).actions[0]);
  assert.equal(f.game.state.coins,wallet);
  f.at(start+2880*minute);
  wallet=f.game.state.coins;
  f.choose(seed);
  const {expiresAt}=f.game.state.rooms.cat.reservedSeed;
  f.at(expiresAt);f.reopen();
  assert.equal(f.game.state.rooms.cat.reservedSeed,undefined);
  assert.equal(f.game.state.coins,wallet-200);
});

test('自愿报名培育课题，检验真实后代并签发一次证书，不消耗动物',()=>{
  const f=fixture(),species='cat',breedKey='british', selected={species,breedKey};
  f.choose({type:'care.unlock',args:{species,price:SPECIES.cat.roomCost}});
  const [father,mother]=f.game.state.pets.filter(p=>p.species===species);
  const offer=f.read('breedingCourses',selected).rows;
  assert.equal(offer[0].action.args.fee,3000);
  assert.equal(offer[1].action,undefined);
  const before=f.game.state.coins;
  f.choose(offer[0].action);
  assert.equal(f.game.state.coins,before-3000);
  assert.throws(()=>f.choose(f.read('breedingCourses',selected).actions[0]),/未满足/);
  f.at(lifeDates(father).adultAt);
  f.choose({type:'care.breed',args:{species,father:father.id,mother:mother.id}});
  f.at(f.game.state.rooms.cat.job.endsAt);
  const ids=f.game.state.pets.map(p=>p.id);
  const submit=f.read('breedingCourses',selected).actions[0];
  assert.equal(submit.disabled,false);
  const command=f.command(submit.type,submit.args);
  const receipt=f.game.act(command);f.reopen();
  assert.deepEqual(f.game.act(command),receipt);
  assert.deepEqual(f.game.state.pets.map(p=>p.id),ids);
  assert.equal(f.game.state.coins,before-3000);
  assert.ok(f.read('login').rows.some(row=>row.title==='英国短毛猫 · 初级培育证书'));
  assert.equal(f.read('breedingCourses',selected).rows[1].action.args.fee,6000);
});
