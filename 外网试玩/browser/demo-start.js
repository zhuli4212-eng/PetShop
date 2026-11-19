const status = document.getElementById('demo-status');
const game = document.getElementById('GameDiv');

async function connectDemo() {
  const workers = navigator.serviceWorker;
  if (!workers) throw Error('请在支持浏览器存档的浏览器中打开试玩。');
  const workerUrl = new URL('__PETSHOP_DEMO_WORKER__', location.href);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 15000);
  try {
    const controlled = new Promise((resolve, reject) => {
      const check = () => {
        if (workers.controller?.scriptURL === workerUrl.href) resolve();
      };
      workers.addEventListener('controllerchange', check, { signal: abort.signal });
      abort.signal.addEventListener('abort', () => reject(Error('连接试玩超时。')), { once: true });
      check();
    });
    await Promise.all([workers.register(workerUrl, { updateViaCache: 'none' }), controlled]);
    const response = await fetch('/api/shop', { cache: 'no-store', signal: abort.signal });
    const shop = await response.json();
    if (!response.ok || !shop.profileId) throw Error(shop.error || '无法读取试玩存档。');
  } finally {
    clearTimeout(timeout);
    abort.abort();
  }
}

try {
  await connectDemo();
  status.hidden = true;
  game.hidden = false;
  await window.System.import('./__PETSHOP_GAME_ENTRY__');
} catch (error) {
  console.error(error);
  game.hidden = true;
  status.hidden = false;
  status.textContent = '试玩暂时无法打开，请刷新重试，或用手机系统浏览器打开。';
}
