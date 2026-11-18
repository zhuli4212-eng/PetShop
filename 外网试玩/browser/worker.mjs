import { GameError, RequestGameStore } from '../../PetShop/server/request-store.mjs';

const scope = new URL(self.registration.scope);
const storeName = 'shop';
let database;

function openShop() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open('petshop-trial:' + scope.pathname, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
  });
  return database;
}
function gameRequest(game, path, data) {
  if (path === 'shop') return game.shop();
  if (path.startsWith('receipts/')) return game.receipt(path.slice('receipts/'.length));
  if (path === 'action') return game.act(data);
  if (path === 'heartbeat') return game.heartbeat(data.clientId, data.foreground, data.reader);
  const result = game.page(data.page, data.args || {});
  if (data.page === 'login') {
    result.page.subtitle = '外网试玩 · 本浏览器存档';
    result.page.rows.unshift({ title: '试玩进度', text: '使用当前浏览器回到这个网址，可继续经营。清除本站数据会重置试玩进度。' });
  }
  return result;
}

async function transact(path, data) {
  const db = await openShop();
  // A single IndexedDB transaction serializes every tab, including snapshot and action receipt.
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const read = store.get('player');
    let result, domainError;
    read.onsuccess = () => {
      try {
        const game = new RequestGameStore(read.result ?? null);
        try { result = gameRequest(game, path, data); }
        catch (error) { domainError = error; }
        if (game.dirty) store.put(game.snapshot(), 'player');
      } catch (error) { domainError = error; transaction.abort(); }
    };
    transaction.oncomplete = () => domainError ? reject(domainError) : resolve(result);
    transaction.onabort = () => reject(domainError || transaction.error || Error('无法保存试玩进度。'));
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
async function respond(request, path) {
  try {
    if (request.method === 'GET' && path === 'health') return json({ service: 'petshop', storage: 'browser-trial', status: 'ok', protocol: 1, gameplay: 1 });
    const get = path === 'shop' || /^receipts\/[\w-]+$/.test(path);
    if (!get && !['action', 'heartbeat', 'page'].includes(path)) return json({ error: '接口不存在。' }, 404);
    if (request.method !== (get ? 'GET' : 'POST')) return json({ error: '不支持此请求方法。' }, 405);
    return json(await transact(path, get ? null : await request.json()));
  } catch (error) {
    const status = error instanceof GameError ? error.status : 503;
    return json({ error: error.message || '暂时无法读写浏览器试玩存档。' }, status);
  }
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith('/api/')) return;
  event.respondWith(respond(event.request, url.pathname.slice('/api/'.length)));
});
