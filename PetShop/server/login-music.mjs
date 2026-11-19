export function bindLoginMusic() {
  const audio = document.getElementById('login-music');
  const button = document.getElementById('login-music-control');
  const preference = 'petshop.login.music';
  let enabled = true, interacted = false, active = true;
  try { enabled = localStorage.getItem(preference) !== 'off'; } catch {}

  audio.volume = .8;
  function play() {
    if (active && enabled && interacted && !document.hidden && audio.paused) {
      void audio.play().catch(() => {});
    }
  }
  function interact(event) {
    if (!button.contains(event.target)) {
      interacted = true;
      play();
    }
  }
  function updateButton() {
    button.textContent = audio.paused ? '播放音乐' : '暂停音乐';
  }

  audio.addEventListener('play', updateButton);
  audio.addEventListener('pause', updateButton);
  audio.addEventListener('error', updateButton);
  button.addEventListener('click', () => {
    enabled = audio.paused;
    try { localStorage.setItem(preference, enabled ? 'on' : 'off'); } catch {}
    interacted = true;
    if (enabled) play();
    else audio.pause();
  });
  document.addEventListener('click', interact);
  document.addEventListener('keydown', interact);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.pause();
    else play();
  });
  window.addEventListener('pagehide', () => audio.pause());
  button.hidden = false;

  return value => {
    active = value;
    if (active) play();
    else audio.pause();
  };
}
