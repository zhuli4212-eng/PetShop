import { readLegacyShop } from './legacy.js';
import { bindLoginMusic } from './__PETSHOP_LOGIN_MUSIC_MODULE__';
import { playOpening } from './__PETSHOP_OPENING_MODULE__';

const byId = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const setup = params.has('set-password');
const register = !setup && params.has('register');
const nameKey = 'petshop.trial.lastUsername';
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const allowedSites = ['https://play.zhu-li-4212.xyz', 'https://petshop-trial.pages.dev', 'https://petshop.zhu-li-4212.xyz'];
const apiBase = location.origin + '/petshop-api/v1/';
const entry = location.pathname;
const mainVersion = '__PETSHOP_MAIN_SHA256__';
const mainScript = './__PETSHOP_MAIN_SCRIPT__';
const gameEntry = './__PETSHOP_GAME_ENTRY__';
const form = byId('account-form');
const nameInput = byId('username');
const passwordInput = byId('password');
const submit = byId('submit');
const codeInput = byId('setup-code');
const proofChoice = byId('use-legacy-proof');
const accountLayer = byId('account-layer');
const ledger = accountLayer.querySelector('.ledger');
let completeLogin;
let setLoginMusicActive;
let accountReady;
const submitText = setup ? '设置密码并登录' : register ? '注册并开店' : '登录店铺';

function statusError(message) {
  byId('error').hidden = !message;
  byId('error').textContent = message;
}

async function api(path, data, token) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(apiBase + path, {
    method: data === undefined ? 'GET' : 'POST', headers, credentials: 'omit',
    cache: 'no-store', redirect: 'error', body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || '店铺暂时无法处理请求。');
  return value;
}

function connectGame(token) {
  let leaving = false;
  const login = async switchAccount => {
    if (leaving) return;
    leaving = true;
    try {
      if (switchAccount) await api('auth/logout', {}, token);
    } catch { /* The token is held only in this page and is discarded on navigation. */ }
    finally { location.replace(entry); }
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, target, ...options) {
    const url = new URL(target, document.baseURI);
    const game = url.origin === location.origin && /^\/api\/(?:shop|heartbeat|action|page|receipts\/[\w-]+)$/.test(url.pathname);
    if (!game) return open.call(this, method, target, ...options);
    const path = url.pathname.slice('/api/'.length);
    const result = open.call(this, method, apiBase + path, ...options);
    this.setRequestHeader('Authorization', 'Bearer ' + token);
    this.addEventListener('load', () => {
      if (this.status === 401) void login(false);
      else if (path === 'page' && this.getResponseHeader('X-PetShop-Account') === 'switch') void login(true);
    }, { once: true });
    return result;
  };
  // Cocos sends one final heartbeat as a Beacon on page exit. Use keepalive so it can carry the token.
  if (navigator.sendBeacon) {
    const originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (target, data) => {
      const url = new URL(target, document.baseURI);
      if (url.origin !== location.origin || url.pathname !== '/api/heartbeat') return originalBeacon(target, data);
      void fetch(apiBase + 'heartbeat', {
        method: 'POST', body: data, headers: {'Content-Type':'application/json', Authorization:'Bearer ' + token},
        keepalive: true, credentials: 'omit', redirect: 'error',
      }).catch(() => {});
      return true;
    };
  }
}

function loadScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(Error('游戏资源加载失败，请重新打开店铺。'));
    document.head.append(script);
  });
}

async function refreshGameMain() {
  const url = new URL(mainScript, document.baseURI);
  const key = 'petshop.trial.game-main:' + url.pathname;
  try { if (localStorage.getItem(key) === mainVersion) return; } catch {}
  const response = await fetch(url, {cache:'reload', credentials:'same-origin'});
  if (!response.ok) throw Error('无法更新游戏资源，请重新登录。');
  const digest = await crypto.subtle.digest('SHA-256',await response.arrayBuffer());
  const version = Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  if (version !== mainVersion) throw Error('游戏资源正在更新，请稍后重新登录。');
  try { localStorage.setItem(key,mainVersion); } catch {}
}

async function enterShop(token) {
  const shop = await api('shop', undefined, token);
  if (shop.protocol !== 1 || !shop.profileId) throw Error('未能读取这个账号的店铺。');
  history.replaceState(null, '', entry);
  connectGame(token);
  setLoginMusicActive(false);
  accountLayer.hidden = true;
  const viewport = document.querySelector('meta[name=viewport]');
  if (viewport?.dataset.gameContent) viewport.content = viewport.dataset.gameContent;
  document.title = '麦穗宠物店';
  completeLogin();
}

async function showAccountForm() {
  if (!local && !allowedSites.includes(location.origin)) {
    throw Error('请从宠物店的试玩网址打开。');
  }
  byId('heading').textContent = setup ? '设置密码' : register ? '注册店主' : '店主登录';
  document.title = byId('heading').textContent + ' · 麦穗宠物店';
  byId(register || setup ? 'login-tab' : 'register-tab').hidden = false;
  byId('set-password-link').hidden = register || setup;
  byId('password-label').textContent = setup ? '新密码' : '密码';
  byId('password-hint').hidden = !(register || setup);
  passwordInput.autocomplete = register || setup ? 'new-password' : 'current-password';
  submit.textContent = submitText;
  if (!register) {
    try { nameInput.value = localStorage.getItem(nameKey) || ''; } catch {}
  }
  if (setup) {
    byId('setup-proof').hidden = false;
    codeInput.disabled = false;
    codeInput.required = true;
  }
  if (register || setup) {
    try {
      const legacy = await readLegacyShop();
      if (register) byId('legacy-choice').hidden = !legacy;
      else byId('old-proof-choice').hidden = !legacyProof(legacy);
    } catch { statusError('暂时无法读取浏览器里的旧店，请刷新重试。'); }
  }
  byId('anonymous').hidden = false;
}

window.petshopBeforeShop = showEntry => {
  if (accountReady) return accountReady;
  accountReady = new Promise(resolve => { completeLogin = resolve; });
  accountLayer.hidden = false;
  setLoginMusicActive = bindLoginMusic({autoplay:true});
  if (!setup && !register && !params.has('login')) {
    playOpening(byId('login-opening').content.firstElementChild.cloneNode(true), ledger);
  }
  void showAccountForm().catch(error => statusError(error.message)).finally(() => { byId('loading').hidden = true; });
  showEntry();
  return accountReady;
};

async function bootGame() {
  await refreshGameMain();
  for (const tag of document.querySelectorAll('[data-game-script]')) await loadScript(tag.dataset.gameScript);
  await window.System.import(gameEntry);
}

function bootFailed() {
  byId('GameDiv').hidden = true;
  accountLayer.hidden = false;
  byId('loading').hidden = true;
  statusError('加载失败，请重试。');
  byId('retry').textContent = '重新载入';
  byId('retry').hidden = false;
}

function legacyProof(snapshot) {
  const state = snapshot?.state;
  return state?.profileId && /^[a-f0-9]{64}$/i.test(state.rootSeed)
    ? {profileId:state.profileId, rootSeed:state.rootSeed} : null;
}

proofChoice.addEventListener('change', () => {
  codeInput.disabled = proofChoice.checked;
  codeInput.required = !proofChoice.checked;
  byId('code-field').hidden = proofChoice.checked;
  statusError('');
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  const username = nameInput.value.trim();
  if (!username) {
    statusError('请填写账号名。');
    nameInput.focus();
    return;
  }
  if (!passwordInput.value) {
    statusError('请填写密码。');
    passwordInput.focus();
    return;
  }
  const length = Array.from(passwordInput.value).length;
  if (length < 8 || length > 128) {
    statusError('密码长度应为 8–128 个字符。');
    passwordInput.focus();
    return;
  }
  const useProof = setup && !byId('old-proof-choice').hidden && proofChoice.checked;
  const code = codeInput.value.trim().replace(/[\s-]/g, '');
  if (setup && !useProof && !/^[0-9a-f]{16}$/i.test(code)) {
    statusError('请输入店主登记簿中的 16 位验证码。');
    codeInput.focus();
    return;
  }
  statusError('');
  submit.disabled = true;
  nameInput.readOnly = true;
  passwordInput.readOnly = true;
  submit.textContent = setup ? '正在设置密码…' : register ? '正在注册…' : '正在登录…';
  let account;
  try {
    const data = {username, password:passwordInput.value};
    if (setup) {
      if (useProof) {
        data.legacyProof = legacyProof(await readLegacyShop());
        if (!data.legacyProof) throw Error('没有找到此浏览器的旧店凭据，请使用一次性验证码。');
      } else data.code = code;
    }
    if (register && byId('import-legacy').checked && !byId('legacy-choice').hidden) {
      data.legacySnapshot = await readLegacyShop();
      if (!data.legacySnapshot) throw Error('未能读取选中的旧店。请刷新后重试。');
    }
    account = await api(setup ? 'auth/set-password' : register ? 'auth/register' : 'auth/login', data);
    if (!account.token || !account.username) throw Error('未能取得该店主的登录信息。');
    try { localStorage.setItem(nameKey, account.username); } catch {}
    submit.textContent = '正在打开店铺…';
    await enterShop(account.token);
    passwordInput.value = '';
    codeInput.value = '';
  } catch (error) {
    statusError(error instanceof TypeError || error instanceof SyntaxError ? '暂时连不上店铺，请稍后再试。' : error.message);
    if (account?.token) {
      passwordInput.value = '';
      byId('anonymous').hidden = true;
      byId('heading').textContent = '重新打开店铺';
      byId('retry').textContent = '返回登录';
      byId('retry').hidden = false;
    } else {
      nameInput.readOnly = false;
      passwordInput.readOnly = false;
      submit.disabled = false;
      submit.textContent = submitText;
    }
  }
});

byId('retry').addEventListener('click', () => location.replace(entry));
window.addEventListener('pageshow', event => { if (event.persisted) location.replace(entry); });
bootGame().catch(bootFailed);
