import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, realpathSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serveFile } from './main.mjs';
import { MultiplayerStore } from './multiplayer-store.mjs';
import { renderMultiplayerLogin, loginStyles, loginScript, loginArtFile, loginMusicFile, gameAccountScript } from './multiplayer-login.mjs';

const buildDirectory=fileURLToPath(new URL('../build/web-mobile/',import.meta.url));
const multiplayerData=fileURLToPath(new URL('../local/multiplayer/',import.meta.url));
const loopbacks=new Set(['localhost','127.0.0.1','[::1]']);
const loginCsp="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; media-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const error=(status,message)=>Object.assign(new Error(message),{status});
const entryLifetime=60_000;

function send(req,res,status,type,value) {
  res.writeHead(status,{'Content-Type':type,'Content-Length':Buffer.byteLength(value),'Cache-Control':'no-store'});
  res.end(req.method==='HEAD'?undefined:value);
}
function sendLoginMusic(req,res,clip) {
  res.setHeader('Accept-Ranges','bytes');
  const range=req.method==='GET'&&/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');
  if(!range||(!range[1]&&!range[2]))return send(req,res,200,'audio/mpeg',clip);
  const size=clip.length;
  const start=range[1]?Number(range[1]):Math.max(0,size-Number(range[2]));
  const end=range[1]&&range[2]?Math.min(size-1,Number(range[2])):size-1;
  if(start>end){
    res.setHeader('Content-Range','bytes */'+size);
    return send(req,res,416,'audio/mpeg','');
  }
  res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);
  return send(req,res,206,'audio/mpeg',clip.subarray(start,end+1));
}
function json(req,res,status,value) {
  send(req,res,status,'application/json; charset=utf-8',JSON.stringify(value));
}
function loginPage(res) {
  res.writeHead(303,{Location:'/login','Cache-Control':'no-store'});
  res.end();
}
function fixedOrigin(value) {
  const url=new URL(value);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||
    !(url.protocol==='https:'||(url.protocol==='http:'&&loopbacks.has(url.hostname)))) {
    throw Error('PUBLIC_ORIGIN 需要 HTTPS 站点地址，回环开发可使用 HTTP。');
  }
  return url.origin;
}
function isInside(root,child) {
  const rel=path.relative(root,child);
  return !rel||!(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel));
}
function sessionCookie(req,secure) {
  const name=secure?'__Host-petshop-mp':'petshop-mp-local';
  const matches=(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
  return {name,token:matches.length===1?matches[0].slice(name.length+1):''};
}
function setCookie(res,name,token,secure,expiresAt) {
  const age=Math.max(0,Math.floor((expiresAt-Date.now())/1000));
  res.setHeader('Set-Cookie',name+'='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(secure?'; Secure':''));
}
async function body(req,limit) {
  if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')
    throw error(415,'请求需要 JSON。');
  if(Number(req.headers['content-length'])>limit)throw error(413,'请求内容过多。');
  let size=0;const chunks=[];
  for await(const part of req){
    size+=part.length;
    if(size>limit)throw error(413,'请求内容过多。');
    chunks.push(part);
  }
  try {
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(value&&typeof value==='object'&&!Array.isArray(value))return value;
  } catch {}
  throw error(400,'请求内容无效。');
}
function limitAttempt(store,res,parts,limit) {
  const key=createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  const seconds=store.takeAuthAttempt(key,limit,600_000);
  if(seconds){
    res.setHeader('Retry-After',String(seconds));
    throw error(429,'操作过于频繁，请稍后再试。');
  }
}
function gameResult(store,token,route,data,receiptId,account) {
  return store.withGame(token,game=>{
    try {
      if(route==='/api/shop')return game.shop();
      if(receiptId)return game.receipt(receiptId);
      if(route==='/api/action')return game.act(data);
      if(route==='/api/heartbeat')return game.heartbeat(data.clientId,data.foreground,data.reader);
      if(typeof data.page!=='string'||(data.args!=null&&(typeof data.args!=='object'||Array.isArray(data.args))))
        throw error(400,'页面参数无效。');
      if(data.page==='multiplayerAccount')return {shop:game.shop(),page:{title:'切换多人账号',rows:[]}};
      const result=game.page(data.page,data.args||{});
      if(data.page==='login'){
        result.page.subtitle='多人店铺 · '+account.username;
        const clock=result.page.rows.find(r=>r.title==='设备时间');
        if(clock){clock.title='经营时间';clock.text='成长、订单和比赛使用本服时间，离开后仍会继续结算。';}
        result.page.actions.push({label:'切换多人账号',page:'multiplayerAccount'});
      }
      return result;
    } catch(e){
      if(e.constructor===Error&&!e.status&&!e.code)throw error(409,e.message);
      throw e;
    }
  });
}

export function createMultiplayerServer({publicOrigin,dataDirectory=multiplayerData,webRoot=buildDirectory}={}) {
  const resolvePublic=typeof publicOrigin==='function'?publicOrigin:null;
  let origin=publicOrigin&&!resolvePublic?fixedOrigin(publicOrigin):null;
  const web=realpathSync(webRoot);
  if(isInside(web,path.resolve(dataDirectory)))throw Error('多人数据目录必须位于静态游戏目录之外。');
  mkdirSync(dataDirectory,{recursive:true,mode:0o700});
  const data=realpathSync(dataDirectory);
  if(isInside(web,data)||isInside(data,web))throw Error('多人数据目录与静态游戏目录必须分开。');
  const store=new MultiplayerStore(path.join(data,'multiplayer.sqlite'));
  const entries=new Map();
  function issueEntry(token) {
    const now=Date.now();
    for(const [key,entry] of entries) {
      if(entry.expiresAt>now)break;
      entries.delete(key);
    }
    const key=randomBytes(24).toString('base64url');
    entries.set(key,{token,expiresAt:now+entryLifetime});
    return '/play?entry='+key;
  }
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    try {
      if(resolvePublic&&!origin){
        const value=resolvePublic();
        if(!value)throw error(503,'多人店铺正在准备，请稍后再试。');
        origin=fixedOrigin(value);
      }
      const host=req.headers.host||'',port=server.address()?.port;
      const local=[...loopbacks].some(h=>host===h+':'+port||(port===80&&host===h));
      if(!local&&(!origin||host!==new URL(origin).host))throw error(403,'站点地址不匹配。');
      const expected=origin||'http://'+host,secure=expected.startsWith('https:');
      if((req.method==='POST'||req.headers.origin!==undefined)&&req.headers.origin!==expected)
        throw error(403,'请在本店页面内操作。');
      const get=req.method==='GET'||req.method==='HEAD';
      const route=decodeURIComponent(req.url.split('?')[0]);
      if(!route.startsWith('/')||route.startsWith('//')||/[\\:\x00]/u.test(route)||route.split('/').includes('..'))
        throw error(400,'资源路径无效。');
      const {name,token}=sessionCookie(req,secure);
      if(get&&(route==='/'||route==='/index.html'))return loginPage(res);
      if(route==='/api/health'&&get)return json(req,res,200,{service:'petshop-multiplayer',status:'ok',protocol:1,gameplay:1});
      if(route==='/login'&&get){
        res.setHeader('Content-Security-Policy',loginCsp);
        return send(req,res,200,'text/html; charset=utf-8',renderMultiplayerLogin());
      }
      if(route==='/auth/login.css'&&get)return send(req,res,200,'text/css; charset=utf-8',loginStyles);
      if(route==='/auth/login.js'&&get)return send(req,res,200,'text/javascript; charset=utf-8',loginScript);
      if(route==='/auth/game-account.js'&&get)return send(req,res,200,'text/javascript; charset=utf-8',gameAccountScript);
      if(route==='/auth/shopfront.png'&&get)return send(req,res,200,'image/png',await readFile(loginArtFile));
      if(route==='/auth/login-music.mp3'&&get)return sendLoginMusic(req,res,await readFile(loginMusicFile));
      if(route==='/auth/session'&&get){
        const account=store.session(token)?.account;
        return json(req,res,200,account?{authenticated:true,username:account.username}:{authenticated:false});
      }
      if(['/auth/register','/auth/login','/auth/logout'].includes(route)){
        if(req.method!=='POST')throw error(405,'请使用 POST。');
        if(route==='/auth/logout'){
          store.logout(token);
          setCookie(res,name,'',secure,0);
          return json(req,res,200,{ok:true});
        }
        const peer=req.socket.remoteAddress||'local';
        limitAttempt(store,res,[route,peer],route==='/auth/register'?300:1200);
        const {username}=await body(req,4096);
        if(typeof username!=='string')throw error(400,'请填写账号名。');
        const nameKey=username.trim().normalize('NFKC').toLowerCase();
        limitAttempt(store,res,[route,peer,nameKey],60);
        const previous=store.session(token);
        const sameAccount=route==='/auth/login'&&previous?.account.username.toLowerCase()===nameKey;
        const login=sameAccount&&previous.expiresAt>Date.now()+entryLifetime
          ? {...previous,token}
          : await (route==='/auth/register'?store.register(username):store.login(username));
        if(previous&&previous.account.id!==login.account.id)store.logout(token);
        setCookie(res,name,login.token,secure,login.expiresAt);
        return json(req,res,200,{ok:true,username:login.account.username,entry:issueEntry(login.token)});
      }
      const receipt=route.match(/^\/api\/receipts\/([\w-]{1,100})$/);
      const read=route==='/api/shop'||!!receipt, write=['/api/page','/api/action','/api/heartbeat'].includes(route);
      if(read||write){
        if(req.method!==(read?'GET':'POST'))throw error(405,'请求方式不正确。');
        const session=store.session(token);
        if(!session)throw error(401,'请先登录多人店铺。');
        const gameAccount=req.headers['x-petshop-game-account'];
        if(gameAccount!==undefined&&gameAccount!==session.account.id)throw error(401,'当前店铺账号已切换，请重新登录。');
        const args=write?await body(req,512*1024):null;
        const result=gameResult(store,token,route,args,receipt?.[1],session.account);
        if(route==='/api/page'&&args.page==='multiplayerAccount')res.setHeader('X-PetShop-Account','switch');
        return json(req,res,200,result);
      }
      if(route==='/favicon.ico'&&get){res.writeHead(204);return res.end();}
      const entry=route==='/play';
      if(!entry&&!/^\/(?:assets|cocos-js|src)\//.test(route)&&!['/style.css','/index.js','/application.js'].includes(route))
        throw error(404,'地址不存在。');
      if(!get)throw error(405,'请求方式不正确。');
      const session=store.session(token);
      if(entry){
        const key=new URL(req.url,expected).searchParams.get('entry'),permit=entries.get(key);
        if(req.method!=='GET'||!session||!permit||permit.token!==token||permit.expiresAt<=Date.now())return loginPage(res);
        entries.delete(key);
        const file=await realpath(path.join(web,'index.html'));
        if(!isInside(web,file))throw error(403,'资源路径超出游戏目录。');
        const html=await readFile(file,'utf8');
        const script='<meta name="petshop-game-account" content="'+session.account.id+'"><script src="/auth/game-account.js"></script>';
        const head=/<head\b[^>]*>/i;
        const gameHtml=head.test(html)?html.replace(head,m=>m+script):html.replace(/<body\b|$/i,m=>script+m);
        return send(req,res,200,'text/html; charset=utf-8',gameHtml);
      }
      if(!session)throw error(401,'请先登录多人店铺。');
      await serveFile(req,res,web,route);
    } catch(e){
      if(res.destroyed||res.headersSent)return;
      if(Number.isInteger(e.status)&&e.status>=400&&e.status<600)return json(req,res,e.status,{error:e.message});
      if(e instanceof URIError)return json(req,res,400,{error:'资源路径编码无效。'});
      if(['ENOENT','ENOTDIR','EISDIR'].includes(e.code))return json(req,res,404,{error:'资源不存在。'});
      console.error('多人店铺服务异常',e.code||e.name);
      json(req,res,500,{error:'多人店铺暂时无法处理请求。'});
    }
  });
  server.once('close',()=>store.close());
  return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const port=Number(process.env.MULTIPLAYER_PORT||17889);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('MULTIPLAYER_PORT 需要 1 至 65535 之间的端口号。');
  const server=createMultiplayerServer({webRoot:process.env.MULTIPLAYER_WEB_ROOT,dataDirectory:process.env.MULTIPLAYER_DATA_DIR,
    publicOrigin:process.env.PUBLIC_ORIGIN});
  server.listen(port,'127.0.0.1',()=>console.log('多人店铺已监听 http://127.0.0.1:'+port));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
}
