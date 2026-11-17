import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { accountName } from '../../PetShop/server/account-name.mjs';
import { GameError, RequestGameStore } from '../../PetShop/server/request-store.mjs';
import { validPassword, passwordRecord, matchesPassword } from './passwords.mjs';

const prefix = '/petshop-api/v1/';
const sites = new Set(['https://play.zhu-li-4212.xyz', 'https://petshop-trial.pages.dev', 'https://petshop.zhu-li-4212.xyz']);
const sessionLifetime = 30 * 86400000;
const hash = value => createHash('sha256').update(value).digest('hex');
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

async function body(request, limit) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new GameError('请求需要 JSON。', 415);
  }
  const stream = request.body?.getReader();
  if (!stream) throw new GameError('请求内容为空。', 400);
  let length = 0, content = '';
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await stream.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > limit) { await stream.cancel(); throw new GameError('请求数据太大。', 413); }
    content += decoder.decode(chunk.value, { stream: true });
  }
  try {
    const parsed = JSON.parse(content + decoder.decode());
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  throw new GameError('请求内容无效。', 400);
}

async function limitAuth(db, key, maximum) {
  const now = Date.now(), windowMs = 600000;
  const bucket = hash(key);
  const updated = await db.prepare(`INSERT INTO trial_auth_limits VALUES (?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END
    WHERE expires_at<=? OR attempts<? RETURNING attempts`).bind(bucket, now + windowMs, now, now, now, maximum).first();
  if (!updated) throw new GameError('操作过于频繁，请稍后再试。', 429);
  if (updated.attempts === 1) await db.prepare('DELETE FROM trial_auth_limits WHERE expires_at<=?').bind(now).run();
}

async function setLegacyPassword(db, input, key) {
  const now = Date.now();
  const proof = input.legacyProof;
  const code = typeof input.code === 'string' ? input.code.trim().toLowerCase() : '';
  let condition, values;
  if (/^[0-9a-f]{16}$/.test(code)) {
    condition = 'EXISTS (SELECT 1 FROM trial_sessions s WHERE s.account_id=trial_accounts.id AND s.setup_digest=? AND s.setup_expires_at>? AND s.expires_at>?)';
    values = [hash(code),now,now];
  } else if (typeof proof?.profileId === 'string' && proof.profileId.length <= 128 &&
      typeof proof.rootSeed === 'string' && /^[0-9a-f]{64}$/.test(proof.rootSeed)) {
    condition = "json_extract(snapshot,'$.state.profileId')=? AND json_extract(snapshot,'$.state.rootSeed')=?";
    values = [proof.profileId,proof.rootSeed];
  } else {
    throw new GameError('请输入有效的一次性验证码，或使用原浏览器的旧店凭据。', 403);
  }
  const eligible = 'name_key=? AND password_hash IS NULL AND ' + condition;
  const unavailable = () => new GameError('旧店凭据无效、已过期，或此账号已设密码。',403);
  const account = await db.prepare('SELECT id,username FROM trial_accounts WHERE '+eligible).bind(key,...values).first();
  if (!account) throw unavailable();
  const record = passwordRecord(input.password);
  const token = randomBytes(32).toString('base64url');
  // Only the transaction installing this randomly salted record may revoke old sessions and issue the first protected session.
  const batch = await db.batch([
    db.prepare('UPDATE trial_accounts SET password_hash=? WHERE '+eligible).bind(record,key,...values),
    db.prepare('DELETE FROM trial_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM trial_accounts WHERE id=? AND password_hash=?)')
      .bind(account.id,account.id,record),
    db.prepare('INSERT INTO trial_sessions(digest,account_id,expires_at) SELECT ?,id,? FROM trial_accounts WHERE id=? AND password_hash=?')
      .bind(hash(token),now+sessionLifetime,account.id,record),
  ]);
  if (!batch[0].meta.changes) throw unavailable();
  return json({username:account.username,token,accountId:account.id});
}

async function legacySetupCode(db, token, digest) {
  const now = Date.now(), expires = now + 900000;
  const codeAt = expiry => createHmac('sha256',token).update('trial-password-setup:'+expiry).digest('hex').slice(0,16);
  // Refreshing the ledger keeps its current code until the 15-minute window ends.
  const session = await db.prepare(`UPDATE trial_sessions SET
    setup_digest=CASE WHEN setup_expires_at>? THEN setup_digest ELSE ? END,
    setup_expires_at=CASE WHEN setup_expires_at>? THEN setup_expires_at ELSE ? END
    WHERE digest=? AND expires_at>? RETURNING setup_expires_at`)
    .bind(now,hash(codeAt(expires)),now,expires,digest,now).first();
  if (!session) throw new GameError('请重新登录试玩账号。',401);
  return codeAt(session.setup_expires_at);
}

async function authenticate(db, request, route) {
  const peer = request.headers.get('cf-connecting-ip') || 'local';
  await limitAuth(db, route + ':' + peer, route === 'auth/register' ? 120 : 600);
  const registering = route === 'auth/register';
  const input = await body(request, registering ? 1800000 : 4096);
  const { name, key } = accountName(input.username);
  if (!validPassword(input.password)) throw new GameError('请输入 8 至 128 个字符的密码。',400);
  if (!registering) await limitAuth(db, route + ':account:' + key, 30);
  if (route === 'auth/set-password') return setLegacyPassword(db,input,key);
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const statements = [db.prepare('DELETE FROM trial_sessions WHERE expires_at<=?').bind(now)];
  let account;
  if (registering) {
    let snapshot;
    try {
      const game = new RequestGameStore(input.legacySnapshot ?? null);
      snapshot = game.snapshot();
      snapshot.readers = [];
      snapshot.state.visitors.sessions = {};
      snapshot.state.visitors.intervals = [];
    } catch { throw new GameError('无法读取旧店存档。原存档仍保留在这个浏览器。', 422); }
    account = { id: randomUUID(), username: name };
    statements.push(db.prepare('INSERT INTO trial_accounts(id,name_key,username,snapshot,password_hash) VALUES(?,?,?,?,?)')
      .bind(account.id, key, name, JSON.stringify(snapshot),passwordRecord(input.password)));
  } else {
    account = await db.prepare('SELECT id,username,password_hash FROM trial_accounts WHERE name_key=?').bind(key).first();
    if (!matchesPassword(input.password,account?.password_hash)) throw new GameError('账号名或密码不正确。旧账号请先设置密码。',401);
  }
  statements.push(db.prepare('INSERT INTO trial_sessions(digest,account_id,expires_at) VALUES(?,?,?)').bind(hash(token), account.id, now + sessionLifetime));
  try { await db.batch(statements); }
  catch (error) {
    if (registering && await db.prepare('SELECT id FROM trial_accounts WHERE name_key=?').bind(key).first()) {
      throw new GameError('这个账号名已注册。', 409);
    }
    throw error;
  }
  return json({ username: account.username, token, accountId: account.id });
}

function play(game, route, data, username) {
  if (route === 'shop') return game.shop();
  if (route.startsWith('receipts/')) return game.receipt(route.slice(9));
  if (route === 'heartbeat') return game.heartbeat(data.clientId, data.foreground, data.reader);
  if (route === 'action') return game.act(data);
  if (typeof data.page !== 'string' || (data.args != null && (typeof data.args !== 'object' || Array.isArray(data.args)))) {
    throw new GameError('页面参数无效。', 400);
  }
  if (data.page === 'multiplayerAccount') return {shop:game.shop(), page:{title:'切换账号', rows:[]}};
  const result = game.page(data.page, data.args || {});
  if (data.page === 'login') {
    result.page.subtitle = '试玩账号 · ' + username;
    result.page.actions.push({ label:'切换账号', page:'multiplayerAccount' });
    const clock = result.page.rows.find(row => row.title === '设备时间');
    if (clock) { clock.title = '经营时间'; clock.text = '换设备输入同一账号与密码，可继续经营这家店。'; }
  }
  return result;
}

async function dispatch(request, db, route) {
  const get = request.method === 'GET';
  if (get && route === 'health') {
    await db.prepare('SELECT 1 FROM trial_accounts LIMIT 1').first();
    return json({ service:'petshop', storage:'trial-accounts', status:'ok', protocol:1, gameplay:1 });
  }
  if (request.method === 'POST' && ['auth/register','auth/login','auth/set-password'].includes(route)) return authenticate(db, request, route);
  const read = route === 'shop' || /^receipts\/[\w-]+$/.test(route);
  if (!read && !['auth/logout','page','heartbeat','action'].includes(route)) throw new GameError('接口不存在。', 404);
  if (request.method !== (read ? 'GET' : 'POST')) throw new GameError('不支持此请求方法。', 405);
  const token = request.headers.get('authorization')?.match(/^Bearer ([\w-]{43})$/)?.[1];
  if (!token) throw new GameError('请先登录试玩账号。', 401);
  const digest = hash(token);
  if (route === 'auth/logout') {
    await db.prepare('DELETE FROM trial_sessions WHERE digest=?').bind(digest).run();
    return json({ ok: true });
  }
  const data = read ? null : await body(request, 512 * 1024);
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await db.prepare(`SELECT a.id,a.username,a.revision,a.snapshot,(a.password_hash IS NULL) AS legacy FROM trial_sessions s
      JOIN trial_accounts a ON a.id=s.account_id WHERE s.digest=? AND s.expires_at>?`).bind(digest, Date.now()).first();
    if (!row) throw new GameError('请重新登录试玩账号。', 401);
    const game = new RequestGameStore(JSON.parse(row.snapshot));
    let result, rejected;
    try { result = play(game, route, data, row.username); }
    catch (error) {
      if (!(error instanceof GameError) && error.constructor !== Error) throw error;
      rejected = error instanceof GameError ? error : new GameError(error.message);
    }
    if (game.dirty) {
      const written = await db.prepare('UPDATE trial_accounts SET snapshot=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM trial_sessions WHERE digest=? AND expires_at>?)')
        .bind(JSON.stringify(game.snapshot()), row.id, row.revision,digest,Date.now()).run();
      if (!written.meta.changes) continue;
    }
    if (rejected) throw rejected;
    if (row.legacy && route === 'page' && data.page === 'login') {
      const code = await legacySetupCode(db,token,digest);
      result.page.rows.unshift({title:'设置密码验证码',text:code+'（15 分钟有效）。在另一个标签页打开试玩，点「旧账号设置密码」，输入验证码并设置密码。'});
    }
    const response = json(result);
    if (route === 'page' && data.page === 'multiplayerAccount') response.headers.set('X-PetShop-Account','switch');
    return response;
  }
  throw new GameError('另一台设备正在保存，请重试。', 409);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get('origin');
    if (!url.pathname.startsWith(prefix)) return env.ASSETS ? env.ASSETS.fetch(request) : json({error:'接口不存在。'},404);
    const local = ['127.0.0.1','localhost','[::1]'].includes(url.hostname);
    const localOrigin = local && origin && /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin);
    if (origin && !sites.has(origin) && !localOrigin) return json({error:'来源不受支持。'},403);
    let response;
    try {
      response = request.method === 'OPTIONS' ? new Response(null,{status:204}) :
        await dispatch(request, env.DB.withSession?.('first-primary') ?? env.DB, url.pathname.slice(prefix.length));
    } catch (error) {
      if (!(error instanceof GameError)) console.error('Trial account request failed', error.name);
      response = error instanceof GameError ? json({error:error.message},error.status) : json({error:'暂时无法读取或保存试玩店铺。'},503);
    }
    response.headers.set('Vary','Origin');
    if (origin) {
      response.headers.set('Access-Control-Allow-Origin',origin);
      response.headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');
      response.headers.set('Access-Control-Allow-Headers','Authorization,Content-Type');
      response.headers.set('Access-Control-Expose-Headers','X-PetShop-Account');
    }
    return response;
  },
};
