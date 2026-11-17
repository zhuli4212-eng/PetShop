import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';

if (process.argv.length !== 3) throw Error('Usage: node check.mjs <built release directory>');
const release = path.resolve(process.argv[2]);
const temp = await mkdtemp(path.join(os.tmpdir(), 'petshop-release-check-'));
const database = path.join(temp, 'synthetic.sqlite');
const user = {username:'部署验收', password:randomUUID()};
let child, origin;

async function start() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  origin = 'http://127.0.0.1:' + port;
  child = spawn(process.execPath, ['server.mjs'], {
    cwd:release,
    env:{...process.env, PETSHOP_DB:database, PETSHOP_ORIGIN:origin, PORT:String(port)},
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

try {
  await start();
  await api('shop', {status:401});
  const registered = await api('auth/register', {body:user});
  await api('auth/register', {body:user, status:409});
  await api('auth/login', {body:{...user, password:randomUUID()}, status:401});
  const first = await api('shop', {token:registered.token});
  assert.equal(first.dayClaimed, false);
  const action = {profileId:first.profileId, version:first.version, requestId:randomUUID(), type:'care.checkin', args:{}};
  const login = await api('auth/login', {body:user});
  assert.equal(login.accountId, registered.accountId);
  assert.notEqual(login.token, registered.token);
  const [saved, retried] = await Promise.all([registered.token, login.token].map(token => api('action', {body:action, token})));
  assert.deepEqual(retried, saved);
  await stop();

  const db = new DatabaseSync(database, {readOnly:true});
  try {
    const info = db.prepare('SELECT id, password_hash, snapshot FROM trial_accounts').all();
    assert.equal(info.length, 1);
    assert.equal(info[0].id, registered.accountId);
    assert.ok(/^scrypt-32768-8-3\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(info[0].password_hash));
    assert.equal(JSON.parse(info[0].snapshot).state.profileId, first.profileId);
    assert.equal(db.prepare('SELECT count(*) AS n FROM trial_sessions').get().n, 2);
    assert.ok(db.prepare('SELECT count(*) AS n FROM trial_auth_limits').get().n > 0);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    db.close();
  }

  await start();
  const reloaded = await api('shop', {token:login.token});
  assert.equal(reloaded.profileId, first.profileId);
  assert.equal(reloaded.dayClaimed, true);
  assert.deepEqual(await api('action', {token:registered.token, body:action}), saved);
  assert.deepEqual(await api('receipts/' + action.requestId, {token:login.token}), saved);
  const session = await api('auth/login', {body:user});
  assert.equal(session.accountId, registered.accountId);
  const rooms = await api('page', {token:session.token, body:{page:'rooms', args:{species:'rabbit'}}});
  assert.equal(rooms.page.rows.filter(row => row.animal).length, 4);
  console.log('Passed: registration, password login, concurrent check-in replay, SQLite integrity, restart, sessions, receipts and rabbit room.');
} finally {
  await stop();
  await rm(temp, {recursive:true, force:true, maxRetries:3, retryDelay:100});
}
