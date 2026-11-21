import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import accountService from './account-service.mjs';
import { openAccountDatabase } from './sqlite.mjs';

const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT.');
const backend = new URL('http://127.0.0.1:' + port);
const origin = new URL(process.env.PETSHOP_ORIGIN ?? backend.origin);
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
if ((origin.protocol !== 'https:' && !(isLocal && origin.protocol === 'http:')) ||
    origin.username || origin.password || origin.href !== origin.origin + '/') {
  throw Error('PETSHOP_ORIGIN must be an HTTPS origin or a local HTTP origin.');
}
const hosts = new Set([origin.host, backend.host, new URL('http://localhost:' + port).host]);
const trustProxy = process.env.PETSHOP_TRUST_PROXY === '1';
const production = process.env.PETSHOP_REQUIRE_EXISTING === '1';
const allowedOrigins = new Set([origin.origin]);
if (production) {
  allowedOrigins.add('https://petshop-trial.pages.dev');
  allowedOrigins.add('https://play.zhu-li-4212.xyz');
}
const hash = value => createHash('sha256').update(value).digest();
const originSecret = production && process.env.PETSHOP_ORIGIN_SECRET
  ? hash(process.env.PETSHOP_ORIGIN_SECRET) : null;
const prefix = '/petshop-api/v1/';
const postLimits = new Map([
  ['auth/register', 1800000], ['auth/login', 4096], ['auth/set-password', 4096],
  ['auth/logout', 4096], ['page', 512 * 1024], ['action', 512 * 1024], ['heartbeat', 512 * 1024],
]);

process.umask(0o077);
const DB = openAccountDatabase(process.env.PETSHOP_DB, {
  requireExisting: production,
});

function reject(res, status, error) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Connection': 'close',
  });
  res.end(JSON.stringify({ error }));
}

function clientAddress(req) {
  const peer = req.socket.remoteAddress;
  if (!trustProxy || peer !== '127.0.0.1') return peer;
  const proof = req.headersDistinct['x-petshop-origin-secret'];
  const player = req.headersDistinct['x-petshop-client-ip'];
  if (originSecret && proof?.length === 1 && timingSafeEqual(originSecret, hash(proof[0])) &&
      player?.length === 1 && isIP(player[0])) {
    return player[0];
  }
  const forwarded = req.headersDistinct['x-real-ip'];
  if (forwarded?.length === 1 && isIP(forwarded[0])) {
    return forwarded[0];
  }
  return peer;
}

async function readBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) return null;
  const chunks = [];
  let length = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

async function dispatch(req, res) {
  if (!hosts.has(req.headers.host)) return reject(res, 400, '请求域名无效。');
  if (!req.url.startsWith(prefix)) return reject(res, 404, '接口不存在。');
  const url = new URL(req.url, origin);
  const route = url.pathname.slice(prefix.length);
  const read = route === 'health' || route === 'shop' || /^receipts\/[\w-]+$/.test(route);
  if (!url.pathname.startsWith(prefix) || url.search || (!read && !postLimits.has(route))) {
    return reject(res, 404, '接口不存在。');
  }
  if (req.method !== 'OPTIONS' && req.method !== (read ? 'GET' : 'POST')) {
    return reject(res, 405, '不支持此请求方法。');
  }
  if (req.headers.origin !== undefined && !allowedOrigins.has(req.headers.origin)) {
    return reject(res, 403, '来源不受支持。');
  }
  const headers = new Headers();
  for (const name of ['authorization', 'content-type', 'origin']) {
    if (req.headers[name] !== undefined) headers.set(name, req.headers[name]);
  }
  headers.set('CF-Connecting-IP', clientAddress(req));

  let body;
  if (req.method === 'POST') {
    body = await readBody(req, postLimits.get(route));
    if (body === null) return reject(res, 413, '请求数据太大。');
  }
  const request = new Request(url, { method: req.method, headers, body });
  const reply = await accountService.fetch(request, { DB });
  const bytes = Buffer.from(await reply.arrayBuffer());
  res.writeHead(reply.status, Object.fromEntries(reply.headers));
  res.end(bytes);
}

const server = createServer({ requestTimeout: 30000, headersTimeout: 15000 }, (req, res) => {
  dispatch(req, res).catch(error => {
    if (res.destroyed) return;
    console.error('Account HTTP request failed:', error.name);
    if (res.headersSent) res.destroy();
    else reject(res, 503, '暂时无法读取或保存店铺。');
  });
});
server.once('close', () => DB.close());
process.once('SIGTERM', () => server.close());
process.once('SIGINT', () => server.close());
server.listen(port, '127.0.0.1', () => console.log('Petshop account API listening on ' + backend.origin));
