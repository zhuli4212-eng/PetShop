import { GameError, RequestGameStore } from '../shared/request-store.mjs';

const pendingAccount = 'pending-owner-migration';
const maxBodyBytes = 512 * 1024;

function json(value, status = 200, head = false) {
  return new Response(head ? null : JSON.stringify(value), {
    status,
    headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'},
  });
}

async function objectBody(request, limit = maxBodyBytes) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new GameError('请求需要 JSON。', 415);
  if (Number(request.headers.get('content-length')) > limit) throw new GameError('请求数据太大。', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new GameError('请求内容为空。', 400);
  const decoder = new TextDecoder();
  let length = 0, text = '';
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new GameError('请求数据太大。', 413); }
    text += decoder.decode(value, {stream:true});
  }
  try {
    const obj = JSON.parse(text + decoder.decode());
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
  } catch {}
  throw new GameError('请求内容无效。', 400);
}

const read = 'SELECT revision, snapshot FROM cloud_shops WHERE account_id = ?';
async function readShop(db, account) {
  const row = await db.prepare(read).bind(account).first();
  if (row) return row;
  // A private Site owner can move an existing shop once. Claiming is atomic
  // even if the owner's desktop and phone open the game at the same time.
  await db.prepare('UPDATE cloud_shops SET account_id = ? WHERE account_id = ? AND NOT EXISTS (SELECT 1 FROM cloud_shops WHERE account_id = ?)')
    .bind(account, pendingAccount, account).run();
  return db.prepare(read).bind(account).first();
}

function handleGame(store, path, body) {
  if (path === '/api/shop') return store.shop();
  if (path.startsWith('/api/receipts/')) return store.receipt(path.slice('/api/receipts/'.length));
  if (path === '/api/heartbeat') return store.heartbeat(body.clientId, body.foreground, body.reader);
  if (path === '/api/action') return store.act(body);
  if (typeof body.page !== 'string' || (body.args != null && (typeof body.args !== 'object' || Array.isArray(body.args)))) {
    throw new GameError('页面参数无效。', 400);
  }
  const result = store.page(body.page, body.args || {});
  if (body.page === 'login') {
    result.page.subtitle = '云端经营档';
    const clockRow = result.page.rows.find(row => row.title === '设备时间');
    if (clockRow) {
      clockRow.title = '经营时间';
      clockRow.text = '云端按服务器时间结算成长和赛事。换手机登录同一账号，可以继续经营这家店。';
    }
  }
  return result;
}

async function transact(db, account, pathname, body) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await readShop(db, account);
    const store = new RequestGameStore(row ? JSON.parse(row.snapshot) : null);
    let result, domainError;
    try {
      result = handleGame(store, pathname, body);
    } catch (error) {
      if (error instanceof TypeError || error instanceof ReferenceError || error.code) throw error;
      domainError = error instanceof GameError ? error : new GameError(error.message);
    }
    if (store.dirty || !row) {
      const snapshot = JSON.stringify(store.snapshot());
      const statement = row
        ? db.prepare('UPDATE cloud_shops SET snapshot = ?, revision = revision + 1 WHERE account_id = ? AND revision = ?').bind(snapshot, account, row.revision)
        : db.prepare('INSERT INTO cloud_shops(account_id, revision, snapshot) VALUES (?, 1, ?) ON CONFLICT(account_id) DO NOTHING').bind(account, snapshot);
      const written = await statement.run();
      if (written.meta.changes !== 1) continue;
    }
    if (domainError) throw domainError;
    return result;
  }
  throw new GameError('店铺正从另一台设备保存，请稍后重试。', 409);
}

async function importExisting(request, env, db) {
  if (request.method !== 'POST' || !env.PETSHOP_MIGRATION_KEY ||
      request.headers.get('authorization') !== 'Bearer ' + env.PETSHOP_MIGRATION_KEY) {
    throw new GameError('页面不存在。', 404);
  }
  const original = await objectBody(request, 1800000);
  // Foreground sessions belong to the desktop process. The game and its economic
  // history are copied intact. No machine maintenance key is part of a snapshot.
  if (original.visitors) { original.visitors.sessions = {}; original.visitors.intervals = []; }
  let snapshot;
  try { snapshot = new RequestGameStore({state:original, readers:[]}).snapshot(); }
  catch { throw new GameError('经营档格式无效。', 422); }
  const stored = await db.prepare('INSERT INTO cloud_shops(account_id, revision, snapshot) SELECT ?, 1, ? WHERE NOT EXISTS (SELECT 1 FROM cloud_shops)')
    .bind(pendingAccount, JSON.stringify(snapshot)).run();
  if (!stored.meta.changes) throw new GameError('云端已存在经营档。', 409);
  const saved = await db.prepare('SELECT json_extract(snapshot,\'$.state.coins\') AS coins, json_array_length(snapshot,\'$.state.pets\') AS animals, json_extract(snapshot,\'$.state.shopXp\') AS experience FROM cloud_shops WHERE account_id = ?')
    .bind(pendingAccount).first();
  return json({imported:true, ...saved}, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const head = request.method === 'HEAD';
    const get = request.method === 'GET' || head;
    try {
      if (!path.startsWith('/api/') && !path.startsWith('/internal/')) {
        return env.ASSETS.fetch(request);
      }
      const origin = request.headers.get('origin');
      if (!get && origin && origin !== url.origin) throw new GameError('来源不受支持。', 403);
      const db = env.DB.withSession ? env.DB.withSession('first-primary') : env.DB;
      if (path === '/api/health' && get) {
        await db.prepare('SELECT 1 FROM cloud_shops LIMIT 1').first();
        return json({service:'petshop', status:'ok', protocol:1, gameplay:1, storage:'cloud'}, 200, head);
      }
      if (path === '/internal/import') return await importExisting(request, env, db);
      const readPath = path === '/api/shop' || /^\/api\/receipts\/[\w-]+$/.test(path);
      const writePath = ['/api/page','/api/action','/api/heartbeat'].includes(path);
      if (!readPath && !writePath) throw new GameError('接口不存在。', 404);
      if (readPath ? !get : request.method !== 'POST') throw new GameError('不支持此请求方法。', 405);
      const id = request.headers.get('oai-authenticated-user-id');
      if (!id) throw new GameError('请先登录自己的 ChatGPT 账号再打开店铺。', 401);
      const body = writePath ? await objectBody(request) : null;
      return json(await transact(db, 'player:' + id, path, body), 200, head);
    } catch (error) {
      if (error instanceof GameError) return json({error:error.message}, error.status, head);
      console.error('Cloud shop request failed', path.split('/').slice(0,3).join('/'), error.name, error.message?.slice(0,180));
      return json({error:'云端店铺暂时无法保存或读取，请重试。'}, 503, head);
    }
  },
};
