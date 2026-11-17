import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile, realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
if (process.argv.length !== 3) throw Error('Usage: node check-pages-native.mjs <built Pages directory>');
const out = path.resolve(process.argv[2]);
const require = createRequire(await realpath(path.join(here, '../../云端经营版/node_modules/wrangler/package.json')));
const {Miniflare} = require('miniflare');
const runtime = new Miniflare({
  modules:true, script:await readFile(path.join(out,'_worker.js'),'utf8'),
  compatibilityDate:'2026-05-15', compatibilityFlags:['nodejs_compat'],
  d1Databases:['DB'], d1Persist:false,
  serviceBindings:{ASSETS:request => new Response('static:' + new URL(request.url).pathname)},
  outboundService:() => {throw Error('Unexpected network request from the account Worker.');},
});

const personal = 'https://play.zhu-li-4212.xyz', standalone = 'https://petshop-trial.pages.dev';
const pathPrefix = '/petshop-api/v1/';
async function api(site, route, {method='GET', origin=site, body, token}={}) {
  const headers = {Origin:origin};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  return runtime.dispatchFetch(site + pathPrefix + route, {method, headers, body:body && JSON.stringify(body)});
}
async function success(site, route, options) {
  const response = await api(site,route,options);
  assert.equal(response.status,200,route);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'),site);
  return response.json();
}

try {
  const db = await runtime.getD1Database('DB');
  for (const file of ['0000_trial_accounts.sql','0001_trial_passwords.sql']) {
    const sql = await readFile(path.join(here,'drizzle',file),'utf8');
    for (const part of sql.split('--> statement-breakpoint')) {
      if (part.trim()) await db.prepare(part.trim()).run();
    }
  }
  const routes = JSON.parse(await readFile(path.join(out,'_routes.json'),'utf8'));
  assert.deepEqual(routes,{version:1,include:[pathPrefix+'*'],exclude:[]});
  for (const host of [personal,standalone]) {
    assert.equal((await success(host,'health')).storage,'trial-accounts');
    assert.equal((await api(host,'auth/login',{method:'OPTIONS'})).status,204);
    assert.equal((await api(host,'shop')).status,401);
    assert.equal((await api(host,'health?x=1')).status,404);
    assert.equal((await api(host,'health',{method:'POST'})).status,405);
    assert.equal((await api(host,'health',{origin:'https://unlisted.invalid'})).status,403);
  }
  for (const p of ['/petshop/','/assets/chapter-one.js']) {
    assert.equal(await (await runtime.dispatchFetch(personal+p)).text(),'static:'+p);
  }
  const user = {username:'restore-test',password:randomUUID()};
  const registered = await success(personal,'auth/register',{method:'POST',body:user});
  const first = await success(personal,'shop',{token:registered.token});
  assert.equal(first.dayClaimed,false);
  const action = {profileId:first.profileId,version:first.version,requestId:randomUUID(),type:'care.checkin',args:{}};
  const saved = await success(personal,'action',{method:'POST',body:action,token:registered.token});
  const login = await success(standalone,'auth/login',{method:'POST',body:user});
  assert.equal(login.accountId,registered.accountId);
  const resumed = await success(standalone,'shop',{token:login.token});
  assert.equal(resumed.profileId,first.profileId);
  assert.equal(resumed.dayClaimed,true);
  assert.deepEqual(await success(standalone,'action',{method:'POST',body:action,token:login.token}),saved);
  const room = await success(standalone,'page',{method:'POST',body:{page:'rooms',args:{species:'rabbit'}},token:login.token});
  assert.equal(room.page.rows.filter(row=>row.animal).length,4);
  console.log('Local Pages Worker passed both site origins, D1 continuity, request replay, route and static checks.');
} finally {
  await runtime.dispose();
}
