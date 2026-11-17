export const loginArtFile = new URL('../assets/resources/shop-modules/opening.png', import.meta.url);

export function renderMultiplayerLogin() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#273f35">
  <title>店主登录 · 宠物店</title>
  <link rel="stylesheet" href="/auth/login.css">
  <script src="/auth/login.js" defer></script>
</head>
<body>
  <main class="ledger">
    <img class="shopfront" src="/auth/shopfront.png" width="384" height="576" alt="">
    <section class="sheet" aria-labelledby="heading">
      <header><span class="brand">宠物店</span><span class="rule" aria-hidden="true"></span></header>
      <h1 id="heading">店主登录</h1>
      <p id="loading" role="status">正在读取账号…</p>
      <noscript><p>请在浏览器中启用 JavaScript，然后刷新页面。</p></noscript>
      <div id="anonymous" hidden>
        <nav class="modes" aria-label="账号操作">
          <a id="login-tab" href="/login">登录</a>
          <a id="register-tab" href="/login?register">注册</a>
        </nav>
        <form id="account-form" method="post" action="/auth/login">
          <label for="username">账号名</label>
          <input id="username" name="username" type="text" required autocomplete="username" autocapitalize="none" spellcheck="false" enterkeyhint="go" aria-describedby="name-hint access-hint">
          <p class="hint" id="name-hint"></p>
          <p id="access-hint" class="notice">知道账号名即可进入对应店铺。</p>
          <button class="primary" id="submit" type="submit">登录店铺</button>
        </form>
      </div>
      <div id="signed-in" hidden>
        <p class="account-label">当前账号</p>
        <p id="current-name" dir="auto"></p>
        <a href="/" class="primary">返回店铺</a>
        <button id="logout" type="button" class="secondary">退出并切换账号</button>
      </div>
      <p id="error" role="alert" hidden></p>
      <button id="retry" class="secondary" type="button" hidden>重新读取</button>
    </section>
  </main>
</body>
</html>`;
}

export const loginStyles = `
:root {
  color-scheme: light;
  --ink: #352e21;
  --muted: #65563f;
  --green: #305643;
  --paper: #fff4d9;
  --line: #b39c72;
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
  color: var(--ink);
  background: #273f35;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body {
  min-height: 100vh; min-height: 100svh; margin: 0;
  display: grid; align-items: center; justify-items: center;
  padding: max(20px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
           max(20px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
}
.ledger {
  width: min(100%, 420px); border: 2px solid #463c2c;
  background: var(--paper); box-shadow: 0 4px 0 #172a23;
}
.shopfront {
  display: block; width: 100%; height: 126px; height: clamp(105px, 20svh, 166px);
  object-fit: cover; object-position: 50% 55%; image-rendering: pixelated;
  border-bottom: 3px solid #795b33;
}
.sheet { padding: clamp(20px, 5vw, 34px); }
header { display: flex; gap: 12px; align-items: center; color: var(--green); }
.brand { font: bold 15px/1.5 "Songti SC", SimSun, serif; letter-spacing: .14em; }
.rule { flex: 1; height: 1px; background: var(--line); }
h1 { margin: 12px 0 20px; font: bold clamp(28px, 6vw, 38px)/1.25 "Songti SC", SimSun, serif; }
.modes { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 24px; border: 1px solid var(--line); }
.modes a, .primary, .secondary {
  min-height: 46px; display: flex; align-items: center; justify-content: center;
  font-family: inherit; font-size: 16px; line-height: 1.4; font-weight: 600;
  text-align: center; text-decoration: none; cursor: pointer; border-radius: 2px;
}
.modes a { color: var(--muted); background: #f3e2bb; border-radius: 0; }
.modes a[aria-current="page"] { color: #fff9e8; background: var(--green); }
label, .account-label { display: block; margin: 0 0 7px; font-weight: 700; font-size: 15px; }
input {
  width: 100%; min-height: 48px; padding: 9px 12px; border: 1px solid #806e53;
  border-radius: 2px; background: #fffcf0; color: var(--ink); font: inherit; font-size: 18px;
}
.hint, .notice, #loading { font-size: 14px; line-height: 1.65; color: var(--muted); }
.hint { margin: 7px 0 18px; }
.notice { margin: 0 0 20px; padding: 8px 11px; border-left: 3px solid #a78445; background: #f3e7c8; color: #524328; }
.primary, .secondary { width: 100%; padding: 11px 16px; }
.primary { border: 1px solid #263e32; background: var(--green); color: #fffaf0; box-shadow: 0 2px 0 #233c30; }
.secondary { margin-top: 12px; border: 1px solid var(--line); background: #f6e7c8; color: var(--ink); }
button:disabled { opacity: .68; cursor: progress; }
:focus-visible { outline: 3px solid #9a4b20; outline-offset: 3px; }
input[aria-invalid="true"] { border-color: #984729; }
#error { color: #8a3220; font-weight: 600; line-height: 1.6; margin: 14px 0 0; overflow-wrap: anywhere; }
#current-name { font-size: 23px; font-weight: 700; overflow-wrap: anywhere; margin: 0 0 26px; }
@media (max-width: 699px) and (max-height: 620px) {
  .shopfront { height: 96px; }
  .sheet { padding-block: 17px; }
  h1 { margin-block: 8px 15px; }
  .modes { margin-bottom: 18px; }
  .hint { margin-bottom: 12px; }
  .notice { margin-bottom: 16px; }
}
@media (min-width: 700px) and (min-height: 440px) {
  .ledger { display: grid; grid-template-columns: minmax(0,.83fr) minmax(0,1fr); width: min(100%, 780px); }
  .shopfront { height: 100%; min-height: 455px; border: 0; border-right: 3px solid #795b33; }
  .sheet { align-self: center; padding: 34px; }
}
`;

// This function is sent as a standalone, same-origin script. Keep all its dependencies local.
function initializeLogin() {
  const element = id => document.getElementById(id);
  const heading = element('heading'), loading = element('loading'), retry = element('retry');
  const anonymous = element('anonymous'), signedIn = element('signed-in'), error = element('error');
  const form = element('account-form'), nameInput = element('username'), submit = element('submit'), logout = element('logout');
  const register = new URLSearchParams(location.search).has('register');
  const endpoint = register ? '/auth/register' : '/auth/login';
  const submitLabel = register ? '注册并开店' : '登录店铺';
  let busy = false;

  function showError(message = '') {
    error.hidden = !message;
    error.textContent = message;
    nameInput.removeAttribute('aria-invalid');
  }
  function title(label) {
    heading.textContent = label;
    document.title = label + ' · 宠物店';
  }
  async function request(url, body) {
    const response = await fetch(url, body === undefined ? {cache:'no-store'} : {
      method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body), cache:'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
      const message = typeof data.error === 'string' ? data.error : data.message;
      throw new Error(typeof message === 'string' ? message : '操作未完成，请再试一次。');
    }
    return data;
  }
  function messageFor(err) {
    return err instanceof TypeError || err instanceof SyntaxError ? '暂时连不上店铺，请稍后再试。' : err.message;
  }
  async function readSession() {
    retry.hidden = true;
    loading.hidden = false;
    showError();
    try {
      const session = await request('/auth/session');
      if (session.authenticated) {
        title('店主账号');
        element('current-name').textContent = session.username;
        signedIn.hidden = false;
      } else {
        title(register ? '注册店主' : '店主登录');
        element(register ? 'register-tab' : 'login-tab').setAttribute('aria-current','page');
        element('name-hint').textContent = register ? '1–32 个字符，可用中文、字母、数字及 . _ @ -。' : '输入注册时使用的账号名。';
        submit.textContent = submitLabel;
        form.action = endpoint;
        anonymous.hidden = false;
      }
    } catch (err) {
      showError(messageFor(err));
      retry.hidden = false;
    } finally {
      loading.hidden = true;
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const username = nameInput.value.trim();
    showError();
    if (!username) {
      showError('请填写账号名。');
      nameInput.setAttribute('aria-invalid','true');
      nameInput.focus();
      return;
    }
    busy = true; submit.disabled = true; nameInput.readOnly = true;
    submit.textContent = register ? '正在注册…' : '正在登录…';
    try {
      await request(endpoint, {username});
      location.replace('/');
    } catch (err) {
      showError(messageFor(err));
      busy = false; submit.disabled = false; nameInput.readOnly = false;
      submit.textContent = submitLabel;
    }
  });
  logout.addEventListener('click', async () => {
    if (busy) return;
    busy = true; logout.disabled = true; logout.textContent = '正在退出…';
    showError();
    try {
      await request('/auth/logout', {});
      location.replace('/login');
    } catch (err) {
      showError(messageFor(err));
      busy = false; logout.disabled = false; logout.textContent = '退出并切换账号';
    }
  });
  nameInput.addEventListener('input', () => showError());
  retry.addEventListener('click', readSession);
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  readSession();
}

export const loginScript = '(' + initializeLogin.toString() + ')();';

// The shipped Cocos client uses XMLHttpRequest for ledger pages. The multiplayer
// server marks the read-only account-switch page only after its link is chosen.
function connectAccountPage() {
  const apiRoot = new URL('/api/', location.href).href, pageUrl = apiRoot + 'page';
  const open = XMLHttpRequest.prototype.open;
  const observed = new WeakSet();
  XMLHttpRequest.prototype.open = function (method, url, ...options) {
    const result = open.call(this, method, url, ...options);
    if (new URL(url, document.baseURI).href.startsWith(apiRoot) && !observed.has(this)) {
      observed.add(this);
      this.addEventListener('load', function () {
        if (this.status === 401 && this.responseURL.startsWith(apiRoot)) {
          location.replace('/login');
        } else if (this.status === 200 && this.responseURL === pageUrl && this.getResponseHeader('X-PetShop-Account') === 'switch') {
          location.assign('/login?switch');
        }
      });
    }
    return result;
  };
}

export const gameAccountScript = '(' + connectAccountPage.toString() + ')();';
