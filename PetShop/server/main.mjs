import { createServer } from 'node:http';
import { realpath, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { GameStore, GameError } from './game-store.mjs';
import { openMaintenance, isLocalOperator, maintenanceDirectory } from './local-maintenance.mjs';

const defaultWebRoot = fileURLToPath(new URL('../build/web-mobile/', import.meta.url));
const defaultSave = fileURLToPath(new URL('../local/local_sim/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
};

function reply(req, res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function allowOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!URL.canParse(origin)) return false;
  const url = new URL(origin);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const localEditor = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!localEditor && url.host !== req.headers.host) return false;
  res.setHeader('Access-Control-Allow-Origin', url.origin);
  res.setHeader('Vary', 'Origin');
  return true;
}

export async function serveFile(req, res, webRoot, pathname) {
  let root;
  try {
    root = await realpath(webRoot);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return reply(req, res, 503, { error: '请先构建 Cocos Web Mobile，或设置 PETSHOP_WEB_ROOT。' });
  }
  // Only paths inside the published build are public, including linked files.
  const requested = path.join(root, pathname === '/' ? 'index.html' : pathname);
  const actual = await realpath(requested);
  const relative = path.relative(root, actual);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    return reply(req, res, 403, { error: '路径超出游戏目录。' });
  }
  const file = await open(actual, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile()) return reply(req, res, 404, { error: '资源不存在。' });
    res.writeHead(200, {
      'Content-Type': types[path.extname(actual).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else await pipeline(file.createReadStream({ autoClose: false }), res);
  } finally {
    await file.close();
  }
}

async function readBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new GameError('请求需要 JSON。',415);
  const chunks=[]; let size=0;
  for await(const part of req) {
    size+=part.length;
    if(size>512*1024) throw new GameError('本次选择过多，请分批操作。',413);
    chunks.push(part);
  }
  try {const obj=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(obj&&typeof obj==='object'&&!Array.isArray(obj))return obj;} catch {}
  throw new GameError('请求内容无效。',400);
}

export function createPetShopServer(webRoot = defaultWebRoot, options = {}) {
  const game=options.store || new GameStore(options.saveDirectory || process.env.PETSHOP_SAVE_DIR || defaultSave,
    {onboarding:options.onboarding??process.env.PETSHOP_ONBOARDING==='1'});
  let restoreError, operatorCredential;
  const pulse=setInterval(()=>{try {game.checkpoint();} catch(err) {console.error('结算失败',err.message);}},15_000);
  pulse.unref();
  const server=createServer(async (req, res) => {
    try {
      if (!allowOrigin(req, res)) return reply(req, res, 403, { error: '来源不受支持。' });
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type' });
        return res.end();
      }
      const pathname = decodeURIComponent(req.url.split('?')[0]);
      if (!pathname.startsWith('/') || /[\\:\x00]/u.test(pathname) || pathname.split('/').includes('..')) {
        return reply(req, res, 400, { error: '资源路径无效。' });
      }
      if(pathname==='/api/local-show-maintenance'){
        if(req.method!=='POST'||!isLocalOperator(req,operatorCredential))return reply(req,res,403,{error:'需要本机赛事维护权限。'});
        const {command,id,reason}=await readBody(req);
        return reply(req,res,200,game.maintainShow(command,id,reason));
      }
      if(req.method==='POST' && ['/api/page','/api/action','/api/heartbeat'].includes(pathname)) {
        const data=await readBody(req);
        try {
          let result;
          if(pathname==='/api/action') result=game.act(data);
          else if(pathname==='/api/heartbeat') result=game.heartbeat(data.clientId,data.foreground,data.reader);
          else {
            if(typeof data.page!=='string' || (data.args!=null && (typeof data.args!=='object'||Array.isArray(data.args)))) throw new GameError('页面参数无效。',400);
            result=game.page(data.page,data.args||{});
          }
          return reply(req,res,200,result);
        } catch(err) {
          if(err.code||err instanceof TypeError||err instanceof ReferenceError) throw err;
          return reply(req,res,err.status||409,{error:err.message});
        }
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return reply(req,res,405,{error:'此接口不支持此请求方法。'});
      if (pathname === '/api/health') {
        if(restoreError){game.resumeExisting();restoreError=undefined;}
        return reply(req, res, 200, { service: 'petshop', status: 'ok', protocol: 1, gameplay:1 });
      }
      if (pathname === '/api/shop') return reply(req, res, 200, game.shop());
      if (pathname.startsWith('/api/receipts/')) return reply(req,res,200,game.receipt(pathname.slice('/api/receipts/'.length)));
      if (pathname === '/favicon.ico') {res.writeHead(204);return res.end();}
      if (pathname === '/api' || pathname.startsWith('/api/')) return reply(req, res, 404, { error: '接口不存在。' });
      await serveFile(req, res, webRoot, pathname);
    } catch (error) {
      if (res.destroyed || res.headersSent) return;
      if (error instanceof GameError) return reply(req,res,error.status,{error:error.message});
      if (error instanceof URIError) return reply(req, res, 400, { error: '资源路径编码无效。' });
      if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) return reply(req, res, 404, { error: '资源不存在。' });
      console.error(error.message);
      reply(req, res, 500, { error: '读取游戏资源失败。' });
    }
  });
  server.once('listening',()=>{
    try {game.resumeExisting();} catch(e) {restoreError=e;console.error('恢复经营档失败',e.message);}
    if(options.maintenanceDirectory){
      try {operatorCredential=openMaintenance(options.maintenanceDirectory,server.address().port,webRoot);}
      catch(e){console.error('本机赛事维护未就绪',e.message);}
    }
  });
  server.once('close',()=>{
    clearInterval(pulse);
    operatorCredential=undefined;
    try {game.checkpoint(true);}catch(e){console.error('停服存档失败',e.message);}
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const host = process.env.PETSHOP_HOST || '127.0.0.1';
  const port = Number(process.env.PETSHOP_PORT || '17888');
  const server = createPetShopServer(process.env.PETSHOP_WEB_ROOT || defaultWebRoot,{maintenanceDirectory});
  server.on('error', (error) => { console.error('宠物店服务启动失败。', error.message); process.exitCode = 1; });
  server.listen(port, host, () => {
    const urlHost = host.includes(':') ? '[' + host + ']' : host;
    console.log('宠物店本地服务已启动 http://' + urlHost + ':' + server.address().port);
  });
  const stop=()=>{if(server.listening)server.close();};
  process.once('SIGINT',stop);
  process.once('SIGTERM',stop);
  process.once('SIGHUP',stop);
  if(process.platform==='win32')process.once('SIGBREAK',stop);
}
