const origin = 'https://petshop.zhu-li-4212.xyz';
const api = '/petshop-api/v1/';
const hosts = new Set(['petshop-trial.pages.dev', 'play.zhu-li-4212.xyz']);
const posts = new Set(['auth/register', 'auth/login', 'auth/logout', 'auth/set-password', 'page', 'action', 'heartbeat']);
const failure = status => Response.json({error:'暂时无法连接店铺，请稍后重试。'}, {status, headers:{'Cache-Control':'no-store'}});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!hosts.has(url.hostname)) return failure(403);
    if (url.hostname === 'play.zhu-li-4212.xyz' && !url.pathname.startsWith(api) && !url.pathname.startsWith('/petshop/')) {
      return env.ASSETS.fetch(request);
    }
    const isApi = url.pathname.startsWith(api);
    const personal = url.hostname === 'play.zhu-li-4212.xyz';
    if (personal && !isApi && !url.pathname.startsWith('/petshop/')) return env.ASSETS.fetch(request);
    if (isApi) {
      const route = url.pathname.slice(api.length);
      const read = ['health','shop'].includes(route) || /^receipts\/[\w-]+$/.test(route);
      if (url.search || (!read && !posts.has(route))) return failure(404);
      if (request.method !== 'OPTIONS' && request.method !== (read ? 'GET' : 'POST')) return failure(405);
    } else if (!['GET','HEAD'].includes(request.method)) return failure(405);
    const source = request.headers.get('origin');
    if (source && !['https://petshop-trial.pages.dev','https://play.zhu-li-4212.xyz'].includes(source)) return failure(403);
    if (typeof env.PETSHOP_ORIGIN_SECRET !== 'string' || env.PETSHOP_ORIGIN_SECRET.length < 40) return failure(503);
    const headers = new Headers();
    for (const name of ['authorization','content-type','origin','range','if-none-match','if-modified-since','access-control-request-method','access-control-request-headers']) {
      if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    }
    headers.set('X-Petshop-Origin-Secret', env.PETSHOP_ORIGIN_SECRET);
    const ip = request.headers.get('cf-connecting-ip');
    if (ip) headers.set('X-Petshop-Client-IP',ip);
    const path = personal && !isApi ? url.pathname.slice('/petshop'.length) : url.pathname;
    let response;
    try {
      response = await fetch(origin + path + url.search, {
        method:request.method, headers, body:request.method === 'POST' ? request.body : undefined,
        redirect:'manual', ...(isApi ? {cache:'no-store'} : {}),
      });
    } catch {return failure(502);}
    if (response.status >= 300 && response.status < 400 && response.status !== 304) return failure(502);
    if (isApi && response.status !== 204 && !response.headers.get('content-type')?.includes('application/json')) return failure(502);
    const result = new Headers();
    for (const name of ['content-type','content-length','content-range','accept-ranges','etag','last-modified','cache-control','vary','access-control-allow-origin','access-control-allow-methods','access-control-allow-headers','access-control-expose-headers','x-petshop-account','retry-after']) {
      if (response.headers.has(name)) result.set(name,response.headers.get(name));
    }
    if (isApi) result.set('Cache-Control','no-store');
    return new Response(response.body,{status:response.status,headers:result});
  },
};
