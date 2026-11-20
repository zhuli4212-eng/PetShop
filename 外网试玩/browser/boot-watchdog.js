// Inlined before external assets so a stalled module cannot suppress recovery.
(() => {
  let ready = false;
  let failed = false;
  const timeout = setTimeout(fail, 45000);

  function fail() {
    if (ready || failed) return;
    failed = true;
    clearTimeout(timeout);
    document.getElementById('GameDiv').hidden = true;
    document.getElementById('account-layer').hidden = false;
    document.getElementById('loading').hidden = true;
    const error = document.getElementById('error');
    error.textContent = '加载失败，请重试。';
    error.hidden = false;
    const retry = document.getElementById('retry');
    retry.textContent = '重新载入';
    retry.hidden = false;
  }

  window.addEventListener('petshop:startup-failed', fail);
  window.addEventListener('error', event => {
    if (event.target?.id === 'petshop-start') fail();
  }, true);
  window.addEventListener('petshop:startup-ready', () => {
    ready = true;
    clearTimeout(timeout);
    if (!failed) return;
    document.getElementById('GameDiv').hidden = false;
    document.getElementById('account-layer').hidden = true;
    document.getElementById('error').hidden = true;
    document.getElementById('retry').hidden = true;
  }, {once:true});

  document.addEventListener('click', event => {
    if (event.target.id !== 'retry') return;
    if (ready) location.replace(location.pathname);
    else location.reload();
  });
})();
