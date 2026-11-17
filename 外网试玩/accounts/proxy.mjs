const prefix = '/petshop-api/v1/';
const postRoutes = new Set(['auth/register', 'auth/login', 'auth/logout', 'auth/set-password', 'page', 'action', 'heartbeat']);
const requestHeaders = ['authorization', 'content-type', 'origin', 'access-control-request-method', 'access-control-request-headers'];
const responseHeaders = ['content-type', 'vary', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-expose-headers', 'access-control-max-age', 'x-petshop-account', 'retry-after'];

function selectedHeaders(headers, names) {
  const result = new Headers();
  for (const name of names) {
    if (headers.has(name)) result.set(name, headers.get(name));
  }
  return result;
}

function failure(status, message) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(prefix)) return env.ASSETS.fetch(request);
    const route = url.pathname.slice(prefix.length);
    const read = route === 'health' || route === 'shop' || /^receipts\/[\w-]+$/.test(route);
    if (url.search || (!read && !postRoutes.has(route))) return failure(404, '接口不存在。');
    if (request.method !== 'OPTIONS' && request.method !== (read ? 'GET' : 'POST')) {
      return failure(405, '不支持此请求方法。');
    }

    let response;
    try {
      response = await fetch(PETSHOP_ACCOUNTS_ORIGIN + prefix + route, {
        method: request.method,
        headers: selectedHeaders(request.headers, requestHeaders),
        body: request.method === 'POST' ? request.body : undefined,
        redirect: 'manual',
        cache: 'no-store',
      });
    } catch {
      return failure(502, '暂时无法连接试玩账号服务。');
    }
    if ((response.status >= 300 && response.status < 400) ||
        (response.status !== 204 && !response.headers.get('content-type')?.includes('application/json'))) {
      return failure(502, '试玩账号服务暂时无法使用。');
    }
    const headers = selectedHeaders(response.headers, responseHeaders);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  },
};
