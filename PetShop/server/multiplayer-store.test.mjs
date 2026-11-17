import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { MultiplayerStore } from './multiplayer-store.mjs';

const opened = Date.parse('2026-11-16T12:00:00+08:00');
const hasStatus = status => error => error.status === status;

function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'petshop-multiplayer-'));
  const path = join(folder, 'shops.sqlite');
  const instances = [];
  let now = opened;
  t.after(() => {
    for (const store of instances) store.close();
    rmSync(folder, { recursive: true, force: true });
  });
  function connect() {
    const store = new MultiplayerStore(path, { wall: () => now, monotonic: () => 0 });
    instances.push(store);
    return store;
  }
  return { path, connect, setTime: time => { now = time; } };
}

// Workers own separate connections and wait for the same start signal.
const workerSource = `
  import { parentPort, workerData } from 'node:worker_threads';
  const { MultiplayerStore } = await import(workerData.module);
  const { path, opened, input } = workerData;
  const store = new MultiplayerStore(path, { wall: () => opened, monotonic: () => 0 });
  parentPort.once('message', async () => {
    try {
      const value = input.command
        ? store.withGame(input.token, game => game.act(input.command))
        : await store.register(input.username);
      parentPort.postMessage({ ok: true, value });
    } catch (error) {
      parentPort.postMessage({ ok: false, status: error.status, message: error.message });
    } finally {
      store.close();
    }
  });
  parentPort.postMessage('ready');
`;
async function race(path, inputs) {
  const module = new URL('./multiplayer-store.mjs', import.meta.url).href;
  const entry = new URL('data:text/javascript,' + encodeURIComponent(workerSource));
  const workers = inputs.map(input => new Worker(entry, { workerData: { path, opened, module, input } }));
  try {
    await Promise.all(workers.map(worker => once(worker, 'message')));
    const replies = workers.map(worker => once(worker, 'message').then(([value]) => value));
    for (const worker of workers) worker.postMessage('go');
    return await Promise.all(replies);
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
  }
}

test('手动注册及同名登录沿用规范名字，账号和店铺只创建一次', async t => {
  const { path, connect } = fixture(t);
  const store = connect();
  await assert.rejects(store.login('未注册'), hasStatus(404));
  for (const name of [null, '', '猫 狗', '/', 'x'.repeat(33), '猫\n狗']) {
    await assert.rejects(store.register(name), hasStatus(400));
    await assert.rejects(store.login(name), hasStatus(400));
  }
  const results = await race(path, [{ username: ' Ａlice ' }, { username: 'aLiCe' }]);
  const success = results.filter(result => result.ok);
  assert.equal(success.length, 1);
  assert.equal(results.find(result => !result.ok).status, 409);
  const [first] = success;
  const second = await store.login('alice');
  assert.deepEqual(second.account, first.value.account);
  assert.notEqual(second.token, first.value.token);
  assert.equal(store.withGame(second.token, game => game.shop().profileId),
    store.withGame(first.value.token, game => game.shop().profileId));

  const chinese = '猫'.repeat(32);
  assert.equal((await store.register(chinese)).account.username, chinese);
  assert.equal((await store.login(' ' + chinese)).account.username, chinese);
});

test('会话独立，数据库只留令牌摘要，退出和到期均可跨重启验证', async t => {
  const setup = fixture(t);
  const first = setup.connect();
  const a = await first.register('店主.A');
  const b = await first.login('店主.a');
  const reader = new DatabaseSync(setup.path, { readOnly: true });
  try {
    const hashes = reader.prepare('SELECT token_hash FROM sessions').all().map(row => row.token_hash);
    assert.deepEqual(hashes.sort(), [a.token, b.token].map(token =>
      createHash('sha256').update(token).digest('hex')).sort());
    assert.equal(reader.prepare('SELECT count(*) AS n FROM shops').get().n, 1);
  } finally {
    reader.close();
  }
  first.close();
  const second = setup.connect();
  assert.deepEqual(second.session(a.token), { account: a.account, expiresAt: a.expiresAt });
  assert.equal(second.logout(a.token), true);
  assert.equal(second.logout(a.token), false);
  assert.equal(second.session(a.token), null);
  assert.throws(() => second.withGame(a.token, game => game.shop()), hasStatus(401));
  for (const bad of ['', null, ' '.repeat(43), 'a'.repeat(43)]) {
    assert.equal(second.session(bad), null);
  }
  setup.setTime(b.expiresAt - 1);
  assert.deepEqual(second.session(b.token).account, b.account);
  setup.setTime(b.expiresAt);
  assert.equal(second.session(b.token), null);
  assert.throws(() => second.withGame(b.token, game => game.shop()), hasStatus(401));
  const fresh = await second.login('店主.A');
  assert.deepEqual(second.session(fresh.token).account, a.account);
});

test('两个 SQLite 连接同时签到共用回执，不同店主的进度与回执隔离', async t => {
  const { path, connect } = fixture(t);
  const store = connect();
  const a = await store.register('A');
  const secondDevice = await store.login('a');
  const b = await store.register('B');
  const shop = store.withGame(a.token, game => game.shop());
  assert.notEqual(store.withGame(b.token, game => game.shop().profileId), shop.profileId);
  const command = { type: 'care.checkin', args: {}, requestId: 'multiplayer-checkin',
    profileId: shop.profileId, version: shop.version };
  const results = await race(path, [a, secondDevice].map(auth => ({ token: auth.token, command })));
  assert.ok(results.every(result => result.ok), JSON.stringify(results.map(result => result.message)));
  assert.deepEqual(results[0].value, results[1].value);
  store.close();
  const reopened = connect();
  assert.deepEqual(reopened.withGame(a.token, game => game.receipt(command.requestId)), results[0].value);
  assert.equal(reopened.withGame(a.token, game => game.state.pets.length), 4);
  assert.throws(() => reopened.withGame(a.token, game => game.act({ ...command, requestId: 'stale-transaction' })), hasStatus(409));
  assert.throws(() => reopened.withGame(b.token, game => game.act(command)), hasStatus(409));
  assert.throws(() => reopened.withGame(b.token, game => game.receipt(command.requestId)), hasStatus(404));
  assert.equal(reopened.withGame(b.token, game => game.state.pets.length), 2);
});

test('过期请求被拒后其到期产仔仍然提交，关闭重启读取同一窝幼崽', async t => {
  const setup = fixture(t);
  const store = setup.connect();
  const { token } = await store.register('兔舍');
  const shop = store.withGame(token, game => game.shop());
  const state = store.withGame(token, game => game.snapshot().state);
  const [mother, father] = state.pets;
  const command = { requestId: 'multiplayer-breed', type: 'care.breed', version: shop.version,
    profileId: shop.profileId, args: { species: 'rabbit', mother: mother.id, father: father.id } };
  store.withGame(token, game => game.act(command));
  setup.setTime(opened + 120_000);
  assert.throws(() => store.withGame(token, game => game.act({ ...command, requestId: 'multiplayer-stale' })), hasStatus(409));
  store.close();
  const saved = setup.connect().withGame(token, game => game.snapshot().state);
  assert.equal(saved.rooms.rabbit.job, null);
  assert.equal(saved.clock, opened + 120_000);
  const children = saved.pets.filter(pet => pet.motherId === mother.id);
  assert.ok(children.length >= 3 && children.every(pet => pet.bornAt === saved.clock));
  assert.equal(saved.receipts['multiplayer-stale'], undefined);
});

test('注册与登录限额各自保存，双连接及重启共用窗口，到期后可继续', t => {
  const setup = fixture(t);
  const first = setup.connect();
  const second = setup.connect();
  assert.equal(first.takeAuthAttempt('register-source', 2, 2500), 0);
  assert.equal(second.takeAuthAttempt('register-source', 2, 2500), 0);
  assert.equal(first.takeAuthAttempt('register-source', 2, 2500), 3);
  assert.equal(second.takeAuthAttempt('login-source', 1, 1000), 0);
  first.close();
  second.close();
  const reopened = setup.connect();
  setup.setTime(opened + 1501);
  assert.equal(reopened.takeAuthAttempt('register-source', 2, 2500), 1);
  assert.equal(reopened.takeAuthAttempt('login-source', 1, 1000), 0);
  setup.setTime(opened + 2500);
  assert.equal(reopened.takeAuthAttempt('register-source', 2, 2500), 0);
});
