const canvas = document.getElementById('GameCanvas');
let press;
let queue = Promise.resolve();

function walletHit(event) {
  const cc = window.cc;
  const root = cc?.director?.getScene()?.getChildByName('Canvas');
  const shop = root?.getComponent('ShopMain');
  if (shop?.state !== 'open' || shop.letter || shop.session.confirm || shop.session.dropdown || shop.session.bonusVisit) return null;
  const wallet = shop.layer.activeInHierarchy
    ? shop.layer.getChildByPath('DeskPage/Header/Wallet')
    : shop.home.getChildByPath('Header/Wallet');
  if (!wallet?.activeInHierarchy) return null;
  const bounds = wallet.getComponent('cc.UITransform');
  const camera = root.getComponent(cc.Canvas).cameraComponent;
  if (!bounds || !camera) return null;
  const rect = canvas.getBoundingClientRect();
  const [left, bottom] = [-bounds.width / 2, -bounds.height / 2];
  const toScreen = (x, y) => camera.worldToScreen(bounds.convertToWorldSpaceAR(new cc.Vec3(x, y, 0)));
  const lower = toScreen(left, bottom), upper = toScreen(-left, -bottom);
  const x = (event.clientX - rect.left) * canvas.width / rect.width;
  const y = (rect.bottom - event.clientY) * canvas.height / rect.height;
  return x >= lower.x && x <= upper.x && y >= lower.y && y <= upper.y ? shop : null;
}

async function addCoins(shop) {
  // Serialize clicks and use the live version even if several taps arrived before the redraw.
  const readShop = () => fetch('./api/shop', { cache: 'no-store' }).then(response => response.json());
  const requestId = crypto.randomUUID();
  let receipt;
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await readShop();
    try {
      receipt = await shop.session.send({
        requestId, profileId: snapshot.profileId, version: snapshot.version,
        type: 'localTest.addCoins', args: {},
      });
      break;
    } catch (error) {
      if (error.status !== 409 || attempt === 2) throw error;
    }
  }
  if (shop.session.current) await shop.session.read();
  else shop.applyShop(await readShop());
  shop.notify(receipt.message);
}

canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  press = walletHit(event) ? { id: event.pointerId, x: event.clientX, y: event.clientY } : undefined;
});
canvas.addEventListener('pointercancel', () => { press = undefined; });
canvas.addEventListener('pointerup', event => {
  const start = press;
  press = undefined;
  if (!start || start.id !== event.pointerId ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return;
  const shop = walletHit(event);
  if (!shop) return;
  queue = queue.then(() => addCoins(shop)).catch(error => shop.notify(error.message));
});
