// Use actual completed steps and bytes received by the required resources.
(() => {
  const engineSteps = 4;
  const resources = new Map();
  let phase = 'engine';
  let steps = 0;
  let resourceBytes = 0;
  let failed = false;
  let hidden = false;
  let timeout;
  let queued = false;

  function paint() {
    queued = false;
    const panel = document.getElementById('petshop-loading-panel');
    if (!panel) return;
    panel.hidden = hidden;
    const message = document.getElementById('petshop-loading-message');
    const progress = document.getElementById('petshop-loading-progress');
    const detail = document.getElementById('petshop-loading-detail');
    const retry = document.getElementById('petshop-loading-retry');
    const label = failed ? '加载失败，请重试。' : phase === 'engine' ? '正在启动游戏…' :
      phase === 'resources' ? '正在载入资源…' :
      phase === 'prepare' ? '正在准备游戏…' : phase === 'ready' ? '准备完成' : '正在连接店铺…';
    if (message.textContent !== label) message.textContent = label;
    retry.hidden = !failed;
    progress.hidden = failed;
    detail.hidden = failed || phase === 'connect';
    if (failed || phase === 'connect') {
      progress.removeAttribute('value');
      return;
    }
    const received = [...resources.values()].reduce((sum, bytes) => sum + bytes, 0);
    const value = phase === 'engine' ? Math.floor(10 * steps / engineSteps) :
      phase === 'ready' ? 100 : phase === 'prepare' ? 99 :
      Math.min(99, 10 + Math.floor(89 * received / resourceBytes));
    progress.value = value;
    detail.textContent = resourceBytes > 0
      ? `${value}% · ${(received / 1048576).toFixed(1)} / ${(resourceBytes / 1048576).toFixed(1)} MiB`
      : `${value}%`;
  }

  function schedulePaint() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  }

  function fail() {
    clearTimeout(timeout);
    failed = true;
    hidden = false;
    paint();
  }

  function resetDeadline() {
    clearTimeout(timeout);
    timeout = setTimeout(() => { if (phase === 'engine' || phase === 'prepare') fail(); }, 120000);
  }

  window.petshopLoading = {
    step(count) {
      if (phase !== 'engine') return;
      steps = Math.min(count, engineSteps - 1);
      if (!failed) resetDeadline();
      schedulePaint();
    },
    beginResources(bytes) {
      clearTimeout(timeout);
      resourceBytes = bytes;
      phase = 'resources';
      paint();
    },
    transferred(asset, received) {
      if (phase !== 'resources' || failed) return;
      resources.set(asset, received);
      schedulePaint();
    },
    prepareGame() {
      phase = 'prepare';
      resetDeadline();
      paint();
    },
    ready() {
      clearTimeout(timeout);
      phase = 'ready';
      failed = false;
      paint();
    },
    connect() {
      phase = 'connect';
      hidden = false;
      paint();
    },
    hide() { hidden = true; paint(); },
    fail,
  };

  resetDeadline();
  document.addEventListener('DOMContentLoaded', paint, {once:true});
  window.addEventListener('petshop:startup-failed', fail);
  window.addEventListener('error', event => {
    if (event.target?.id === 'petshop-start' && phase === 'engine') fail();
  }, true);
  window.addEventListener('petshop:startup-ready', resetDeadline, {once:true});

  document.addEventListener('click', event => {
    if (event.target.id === 'petshop-loading-retry') location.reload();
    if (event.target.id === 'retry') location.replace(location.pathname);
  });
})();
