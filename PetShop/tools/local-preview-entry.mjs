import { bindLoginMusic } from './login-music.mjs';
import { playOpening } from './opening.js';

let entry;

export function enterLocalShop(showEntry) {
  return entry ??= new Promise(resolve => {
    const panel = document.getElementById('local-login');
    const login = panel.querySelector('.ledger');
    const opening = document.querySelector('#login-opening').content.firstElementChild.cloneNode(true);
    const setMusicActive = bindLoginMusic({ autoplay: true });
    document.getElementById('enter-shop').addEventListener('click', () => {
      panel.hidden = true;
      setMusicActive(false);
      resolve();
    }, { once: true });
    playOpening(opening, login);
    panel.hidden = false;
    showEntry();
  });
}
