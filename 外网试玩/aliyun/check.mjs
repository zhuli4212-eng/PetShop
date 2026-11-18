import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';

if (![3,4].includes(process.argv.length)) throw Error('Usage: node check.mjs <built release directory> [previous release for upgrade and reset rehearsal]');
const release = path.resolve(process.argv[2]);
const previous = process.argv[3] && path.resolve(process.argv[3]);
const temp = await mkdtemp(path.join(os.tmpdir(), 'petshop-release-check-'));
const database = path.join(temp, 'synthetic.sqlite');
const user = {username:'部署验收', password:randomUUID()};
let child, origin;

async function start(directory=release, filename=database, requireExisting=false) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  origin = 'http://127.0.0.1:' + port;
  child = spawn(process.execPath, ['server.mjs'], {
    cwd:directory,
    env:{...process.env, PETSHOP_DB:filename, PETSHOP_ORIGIN:origin, PORT:String(port),
      PETSHOP_REQUIRE_EXISTING:requireExisting?'1':'0'},
    stdio:['ignore', 'ignore', 'inherit'], windowsHide:true,
  });
  await once(child, 'spawn');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode) throw Error('Test server exited during startup.');
    try {
      const health = await api('health');
      assert.equal(health.storage, 'trial-accounts');
      assert.equal(health.status, 'ok');
      return;
    } catch (error) {
      if (error.cause?.code !== 'ECONNREFUSED') throw error;
      await delay(100);
    }
  }
  throw Error('Test server did not become ready.');
}

async function stop() {
  if (child?.pid && child.exitCode === null && !child.signalCode) {
    const exit = once(child, 'exit');
    child.kill();
    await exit;
  }
  child = null;
}

async function api(route, {token, body, status=200}={}) {
  const headers = {Origin:origin};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(origin + '/petshop-api/v1/' + route, {
    method:body ? 'POST' : 'GET', headers, body:body && JSON.stringify(body),
    redirect:'error', signal:AbortSignal.timeout(15000),
  });
  assert.equal(res.status, status, route);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  return res.json();
}

function actionFor(shop, type, args={}) {
  return {profileId:shop.profileId, version:shop.version, requestId:randomUUID(), type,args};
}

function identities(filename) {
  const db = new DatabaseSync(filename, {readOnly:true});
  try {
    return db.prepare('SELECT id,name_key,username,password_hash FROM trial_accounts ORDER BY id').all();
  } finally { db.close(); }
}

try {
  let oldUser, oldShop;
  if (previous) {
    await start(previous);
    oldUser = {username:'旧版店主',password:randomUUID()};
    const old = await api('auth/register', {body:oldUser});
    const state = await api('shop', {token:old.token});
    await api('action', {token:old.token,body:actionFor(state,'care.checkin')});
    oldShop = await api('shop', {token:old.token});
    await stop();
  }
  await start(release,database,Boolean(previous));
  if (oldUser) {
    const old = await api('auth/login', {body:oldUser});
    const shop = await api('shop', {token:old.token});
    assert.equal(shop.profileId, oldShop.profileId);
    assert.equal(shop.dayClaimed, true);
    assert.equal(shop.onboarding, undefined);
  }
  await api('shop', {status:401});
  const registered = await api('auth/register', {body:user});
  await api('auth/register', {body:user, status:409});
  await api('auth/login', {body:{...user, password:randomUUID()}, status:401});
  const first = await api('shop', {token:registered.token});
  assert.equal(first.dayClaimed, false);
  if (previous) assert.equal(first.onboarding?.step,0);
  const action = actionFor(first, first.onboarding?'onboarding.enter':'care.checkin');
  const login = await api('auth/login', {body:user});
  assert.equal(login.accountId, registered.accountId);
  assert.notEqual(login.token, registered.token);
  const [saved, retried] = await Promise.all([registered.token, login.token].map(token => api('action', {body:action, token})));
  assert.deepEqual(retried, saved);
  await stop();

  const db = new DatabaseSync(database, {readOnly:true});
  try {
    const info = db.prepare('SELECT id, password_hash, snapshot FROM trial_accounts').all();
    assert.equal(info.length, previous?2:1);
    const account = info.find(row=>row.id===registered.accountId);
    assert.ok(/^scrypt-32768-8-3\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(account.password_hash));
    assert.equal(JSON.parse(account.snapshot).state.profileId, first.profileId);
    assert.equal(db.prepare('SELECT count(*) AS n FROM trial_sessions').get().n, previous?4:2);
    assert.ok(db.prepare('SELECT count(*) AS n FROM trial_auth_limits').get().n > 0);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    db.close();
  }

  await start(release,database,Boolean(previous));
  const reloaded = await api('shop', {token:login.token});
  assert.equal(reloaded.profileId, first.profileId);
  assert.equal(reloaded.dayClaimed, !first.onboarding);
  assert.equal(reloaded.onboarding?.step,first.onboarding?1:undefined);
  assert.deepEqual(await api('action', {token:registered.token, body:action}), saved);
  assert.deepEqual(await api('receipts/' + action.requestId, {token:login.token}), saved);
  const session = await api('auth/login', {body:user});
  assert.equal(session.accountId, registered.accountId);
  if (first.onboarding) {
    for (const type of ['openLetter','proceed','openRoom']) {
      const shop = await api('shop', {token:session.token});
      await api('action', {token:session.token,body:actionFor(shop,'onboarding.'+type)});
    }
    const meal = await api('page', {token:session.token,body:{page:'roomNutrition',args:{species:'rabbit'}}});
    assert.equal(meal.shop.onboarding.step,3);
    assert.equal(meal.page.rows[0].title,'臻选兔兔营养餐');
  }
  const rooms = await api('page', {token:session.token, body:{page:'rooms', args:{species:'rabbit'}}});
  assert.equal(rooms.page.rows.filter(row => row.animal).length, first.onboarding?2:4);
  console.log('Passed: registration, login, concurrent action replay, restart, sessions, receipts, SQLite and rabbit room.');
  if (previous) {
    await stop();
    const backup=path.join(temp,'before-reset.sqlite');
    const accounts=identities(database);
    const reset=JSON.parse(execFileSync(process.execPath,[path.join(release,'reset-shops.mjs'),database,backup],{encoding:'utf8'}));
    assert.equal(reset.resetShops,accounts.length);
    assert.deepEqual(identities(database),accounts);
    assert.deepEqual(identities(backup),accounts);
    await start(release,database,true);
    for (const [credentials,profileId] of [[oldUser,oldShop.profileId],[user,first.profileId]]) {
      const account=await api('auth/login',{body:credentials});
      const shop=await api('shop',{token:account.token});
      assert.notEqual(shop.profileId,profileId);
      assert.equal(shop.coins,680);
      assert.deepEqual(shop.rooms,[]);
      assert.equal(shop.onboarding.step,0);
    }
    await api('action',{token:session.token,body:action,status:409});
    await stop();
    await start(previous,backup,true);
    const restored=await api('auth/login',{body:oldUser});
    const shop=await api('shop',{token:restored.token});
    assert.equal(shop.profileId,oldShop.profileId);
    assert.equal(shop.dayClaimed,true);
    console.log('Passed: previous package upgrade, reset without changing account credentials, and database backup rollback.');
  }
} finally {
  await stop();
  await rm(temp, {recursive:true, force:true, maxRetries:3, retryDelay:100});
}
