// Use actual completed steps and bytes received by the required resources.
(() => {
  const engineSteps = 4;
  const resourceCount = 3;
  const resources = new Map();
  let phase = 'engine';
  let steps = 0;
  let completed = 0;
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
      phase === 'resources' ? '正在载入资源…' : '正在连接店铺…';
    if (message.textContent !== label) message.textContent = label;
    retry.hidden = !failed;
    progress.hidden = failed;
    detail.hidden = failed || phase === 'connect';
    if (failed || phase === 'connect') {
      progress.removeAttribute('value');
      return;
    }
    const transfers = [...resources.values()];
    const received = transfers.reduce((sum, item) => sum + item.received, 0);
    const total = transfers.length === resourceCount && transfers.every(item => item.total > 0)
      ? transfers.reduce((sum, item) => sum + item.total, 0) : 0;
    const preparedFraction = completed / resourceCount;
    const downloadedFraction = total > 0 ? Math.min(.99, received / total) : 0;
    const fraction = Math.max(preparedFraction, downloadedFraction);
    const value = Math.floor(100 * (steps + fraction * resourceCount) / (engineSteps + resourceCount));
    progress.value = value;
    detail.textContent = total > 0
      ? `${value}% · ${(received / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MiB`
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
    timeout = setTimeout(() => { if (phase === 'engine') fail(); }, 120000);
  }

  window.petshopLoading = {
    step(count) {
      if (phase !== 'engine') return;
      steps = Math.min(count, engineSteps - 1);
      if (!failed) resetDeadline();
      schedulePaint();
    },
    transferred(asset, received, total) {
      if (phase !== 'resources' || failed) return;
      resources.set(asset, { received, total });
      schedulePaint();
    },
    prepared(count) {
      if (phase !== 'resources' || failed) return;
      completed = count;
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
  window.addEventListener('petshop:startup-failed', () => { if (phase === 'engine') fail(); });
  window.addEventListener('error', event => {
    if (event.target?.id === 'petshop-start' && phase === 'engine') fail();
  }, true);
  window.addEventListener('petshop:startup-ready', () => {
    clearTimeout(timeout);
    phase = 'resources';
    steps = engineSteps;
    failed = false;
    paint();
  }, {once:true});

  document.addEventListener('click', event => {
    if (event.target.id === 'petshop-loading-retry') location.reload();
    if (event.target.id === 'retry') location.replace(location.pathname);
  });
})();
