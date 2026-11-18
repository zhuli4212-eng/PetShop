const scene = globalThis.PETSHOP_SCENE;
const $ = id => document.getElementById(id);
const shop = $('shop-scene');
const pieces = $('pieces');
const entrances = $('entrances');
const curtain = $('curtain');
const select = $('piece-select');
const xField = $('piece-x');
const yField = $('piece-y');
const visibleField = $('piece-visible');
const originalEntrances = [
  ...scene.hotspots.filter(item => ['rooms', 'login', 'orders', 'market'].includes(item.id)),
  { id: 'old-show', link: 'cabinet', text: '赛事台', x: 434, y: 48, w: 182, h: 235, label: [528, 145] },
  { id: 'old-lab', link: 'lab', text: '研究所', x: 21, y: 395, w: 190, h: 210, label: [115, 533] },
  { id: 'old-breed', link: 'old-breed', text: '繁育台', x: 489, y: 611, w: 132, h: 122, label: [554, 725] },
  { id: 'old-decor', link: 'old-decor', text: '装饰', x: 20, y: 615, w: 151, h: 211, label: [96, 817] },
  { id: 'old-archive', link: 'task-table', text: '动物档案', x: 22, y: 819, w: 170, h: 188, label: [110, 925] },
  { id: 'old-guest', link: 'old-guest', text: '特殊来客', x: 416, y: 757, w: 198, h: 251, label: [516, 907] },
];
const layouts = {};
let preset = 'revised';
let mode = 'play';
let selection = 'breed';
let signInClaimed = false;
let activeGuest = false;
let toastTimer;
let drag;
let returnFocus;

function copyPreset(name) {
  return scene[name].map(item => ({ ...item, visible: true }));
}

layouts.revised = copyPreset('revised');
layouts.original = copyPreset('original');
const current = () => layouts[preset];
const currentPiece = () => current().find(item => item.id === selection);
const sourcePiece = id => scene[preset].find(item => item.id === id);

function position(element, x, y, w, h) {
  element.style.left = x / scene.width * 100 + '%';
  element.style.top = y / scene.height * 100 + '%';
  if (w !== undefined) element.style.width = w / scene.width * 100 + '%';
  if (h !== undefined) element.style.height = h / scene.height * 100 + '%';
}

function createImage(src) {
  const image = new Image();
  image.src = src;
  image.alt = '';
  image.draggable = false;
  return image;
}

function selectPiece(id) {
  selection = id;
  syncControls();
  for (const piece of pieces.querySelectorAll('.piece')) {
    piece.classList.toggle('selected', mode === 'edit' && piece.dataset.id === id);
  }
}

function renderPieces() {
  const background = createImage(scene.wallFloor);
  background.className = 'piece';
  position(background, 0, 0, scene.width, scene.height);
  pieces.replaceChildren(background);
  for (const item of current()) {
    if (!item.visible || (mode === 'play' && signInClaimed && item.id === 'checkin-gift')) continue;
    const movable = mode === 'edit' && !item.locked;
    const piece = document.createElement(movable ? 'button' : 'div');
    piece.className = 'piece';
    piece.dataset.id = item.id;
    piece.classList.toggle('selected', movable && item.id === selection);
    piece.append(createImage(item.src));
    position(piece, item.x, item.y, item.w, item.h);
    if (movable) {
      piece.type = 'button';
      piece.setAttribute('aria-label', item.name);
      piece.addEventListener('pointerdown', event => startDrag(event, item, piece));
      piece.addEventListener('focus', () => selectPiece(item.id));
      piece.addEventListener('keydown', event => nudge(event, item, piece));
    }
    pieces.append(piece);
  }
}

function renderEntrances() {
  entrances.replaceChildren();
  for (const spot of preset === 'revised' ? scene.hotspots : originalEntrances) {
    const item = current().find(layer => layer.id === spot.link);
    if (!item?.visible || (spot.id === 'gift' && mode === 'play' && signInClaimed)) continue;
    const standard = sourcePiece(item.id);
    const dx = item.x - standard.x;
    const dy = item.y - standard.y;
    if (mode === 'play') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hotspot';
      button.setAttribute('aria-label', spot.target || spot.text);
      position(button, spot.x + dx, spot.y + dy, spot.w, spot.h);
      button.addEventListener('click', () => activateEntrance(spot, button));
      entrances.append(button);
    }
    const sign = document.createElement('span');
    sign.className = 'shop-sign';
    sign.textContent = spot.text;
    position(sign, spot.label[0] + dx, spot.label[1] + dy);
    entrances.append(sign);
  }
  const label = document.createElement('span');
  label.className = 'shop-sign keeper-sign';
  label.textContent = '店长';
  position(label, 320, 502);
  entrances.append(label);
}

function syncControls() {
  const item = currentPiece();
  if (!item) return;
  const layers = current();
  const index = layers.indexOf(item);
  select.value = item.id;
  xField.value = item.x;
  yField.value = item.y;
  xField.max = scene.width - item.w;
  yField.max = scene.height - item.h;
  visibleField.checked = item.visible;
  $('layer-up').disabled = index === layers.length - 1 || layers[index + 1].locked;
  $('layer-down').disabled = index === 0 || layers[index - 1].locked;
}

function loadChoices() {
  select.replaceChildren();
  for (const item of current()) {
    if (!item.locked) select.append(new Option(item.name, item.id));
  }
  if (!sourcePiece(selection)) selection = select.options[0].value;
  syncControls();
}

function render() {
  shop.classList.toggle('edit', mode === 'edit');
  for (const button of document.querySelectorAll('[data-preset]')) {
    button.setAttribute('aria-pressed', String(button.dataset.preset === preset));
  }
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  }
  $('play-tools').hidden = mode === 'edit' || preset === 'original';
  $('edit-tools').hidden = mode !== 'edit';
  renderPieces();
  renderEntrances();
}

function bounded(value, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : fallback;
}

function place(item, x, y, element) {
  item.x = bounded(x, scene.width - item.w, item.x);
  item.y = bounded(y, scene.height - item.h, item.y);
  if (element) position(element, item.x, item.y, item.w, item.h);
  else renderPieces();
  renderEntrances();
  syncControls();
}

function startDrag(event, item, element) {
  if (event.button !== 0 || drag) return;
  selectPiece(item.id);
  const bounds = shop.getBoundingClientRect();
  drag = { x: item.x, y: item.y, startX: event.clientX, startY: event.clientY };
  element.setPointerCapture(event.pointerId);
  element.onpointermove = move => {
    const x = drag.x + (move.clientX - drag.startX) * scene.width / bounds.width;
    const y = drag.y + (move.clientY - drag.startY) * scene.height / bounds.height;
    place(item, x, y, element);
  };
  element.onlostpointercapture = () => {
    element.onpointermove = null;
    drag = undefined;
  };
}

function nudge(event, item, element) {
  const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const move = moves[event.key];
  if (!move) return;
  event.preventDefault();
  const step = event.shiftKey ? 10 : 1;
  place(item, item.x + move[0] * step, item.y + move[1] * step, element);
}

function moveLayer(step) {
  const layers = current();
  const index = layers.indexOf(currentPiece());
  const other = layers[index + step];
  if (!other || other.locked) return;
  [layers[index], layers[index + step]] = [other, layers[index]];
  renderPieces();
  syncControls();
}

function message(text) { $('layout-message').textContent = text; }

function exportLayout() {
  const layers = current().map(({ id, x, y, visible }) => ({ id, x, y, visible }));
  const file = new Blob([JSON.stringify({ version: 1, preset, layers }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const download = document.createElement('a');
  download.href = url;
  download.download = '麦穗宠物店-首页摆放.json';
  download.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  message('已导出当前摆放。');
}

async function importLayout(event) {
  const [file] = event.target.files;
  if (!file) return;
  event.target.value = '';
  try {
    const data = JSON.parse(await file.text());
    const baseline = copyPreset(data.preset);
    if (data.version !== 1 || !Array.isArray(data.layers) || data.layers.length !== baseline.length) {
      throw new Error('布局文件版本不匹配。');
    }
    const itemsById = new Map(baseline.map(item => [item.id, item]));
    const next = data.layers.map(({ id, x, y, visible }, index) => {
      const item = itemsById.get(id);
      if (!item || !Number.isFinite(x) || !Number.isFinite(y) || typeof visible !== 'boolean' ||
          (item.locked && baseline[index].id !== id) || (!item.locked && baseline[index].locked)) {
        throw new Error('布局文件中的图层不匹配。');
      }
      itemsById.delete(id);
      if (item.locked) return item;
      return { ...item, x: bounded(x, scene.width - item.w, item.x),
        y: bounded(y, scene.height - item.h, item.y), visible };
    });
    preset = data.preset;
    layouts[preset] = next;
    loadChoices();
    render();
    message('已导入摆放。');
  } catch {
    message('无法导入，请选择从此预览导出的布局文件。');
  }
}

function showDialog(title, content, trigger) {
  returnFocus = trigger ?? returnFocus;
  $('dialog-title').textContent = title;
  $('dialog-content').replaceChildren(...content);
  curtain.hidden = false;
  entrances.inert = true;
  $('close-dialog').focus();
}

function closeDialog() {
  if (curtain.hidden) return;
  curtain.hidden = true;
  entrances.inert = false;
  returnFocus?.focus();
  returnFocus = undefined;
}

function paragraph(text) {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function actions() {
  const row = document.createElement('div');
  row.className = 'actions';
  return row;
}

function action(label, onClick, primary = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.classList.toggle('primary', primary);
  button.addEventListener('click', onClick);
  return button;
}

function showOrders(tab, trigger) {
  const tabs = actions();
  tabs.append(
    action('普通订单', () => showOrders('orders'), tab === 'orders'),
    action('特殊来客', () => showOrders('guest'), tab === 'guest'),
  );
  const copy = tab === 'orders' ? '查看顾客订单。' : activeGuest ? '新来客已到店。' : '暂无来客。';
  showDialog('订单', [tabs, paragraph(copy)], trigger);
}

function activateEntrance(spot, trigger) {
  if (spot.id === 'orders') {
    if (preset === 'revised') showOrders('orders', trigger);
    else showDialog('普通订单', [], trigger);
    return;
  }
  if (spot.id === 'gift') {
    signInClaimed = true;
    render();
    clearTimeout(toastTimer);
    $('toast').textContent = '签到成功';
    $('toast').hidden = false;
    toastTimer = window.setTimeout(() => { $('toast').hidden = true; }, 2400);
    return;
  }
  showDialog(spot.target || spot.text, [], trigger);
}

for (const button of document.querySelectorAll('[data-preset]')) {
  button.addEventListener('click', () => {
    preset = button.dataset.preset;
    closeDialog();
    message('');
    loadChoices();
    render();
  });
}
for (const button of document.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    closeDialog();
    message('');
    render();
  });
}
$('new-guest').addEventListener('click', event => {
  activeGuest = true;
  const row = actions();
  row.append(action('查看订单', () => showOrders('guest'), true), action('稍后', closeDialog));
  showDialog('特殊来客', [paragraph('有位新来客到店了。'), row], event.currentTarget);
});
$('reset-demo').addEventListener('click', () => {
  signInClaimed = false;
  activeGuest = false;
  $('toast').hidden = true;
  closeDialog();
  render();
});
$('close-dialog').addEventListener('click', closeDialog);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDialog(); });
$('reset-layout').addEventListener('click', () => {
  layouts[preset] = copyPreset(preset);
  message('已恢复初始摆放。');
  loadChoices();
  render();
});
select.addEventListener('change', () => selectPiece(select.value));
for (const input of [xField, yField]) {
  input.min = 0;
  input.addEventListener('change', () => place(currentPiece(), xField.valueAsNumber, yField.valueAsNumber));
}
visibleField.addEventListener('change', () => {
  currentPiece().visible = visibleField.checked;
  render();
});
$('layer-up').addEventListener('click', () => moveLayer(1));
$('layer-down').addEventListener('click', () => moveLayer(-1));
$('export-layout').addEventListener('click', exportLayout);
$('choose-layout').addEventListener('click', () => $('import-layout').click());
$('import-layout').addEventListener('change', importLayout);

loadChoices();
render();
