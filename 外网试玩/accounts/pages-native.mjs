import accountService from 'petshop:released-accounts';

const prefix = '/petshop-api/v1/';
const posts = new Set(['auth/register', 'auth/login', 'auth/logout', 'auth/set-password', 'page', 'action', 'heartbeat']);

function failure(status, message) {
  return Response.json({error:message}, {status, headers:{'Cache-Control':'no-store'}});
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(prefix)) return env.ASSETS.fetch(request);
    const route = url.pathname.slice(prefix.length);
    const read = route === 'health' || route === 'shop' || /^receipts\/[\w-]+$/.test(route);
    if (url.search || (!read && !posts.has(route))) return failure(404, '接口不存在。');
    if (request.method !== 'OPTIONS' && request.method !== (read ? 'GET' : 'POST')) {
      return failure(405, '不支持此请求方法。');
    }

    const result = await accountService.fetch(request, env, ctx);
    const response = new Response(result.body, result);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  },
};
