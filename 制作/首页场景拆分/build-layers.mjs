import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const folder = fileURLToPath(new URL('.', import.meta.url));
const assets = path.resolve(folder, '../../PetShop/assets/art');
const width = 640;
const height = 1120;
const layerFolder = path.join(folder, '图层');
mkdirSync(layerFolder, { recursive: true });

function ffmpeg(args, input) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-threads', '1', ...args], {
    input, windowsHide: true, maxBuffer: 24 * 1024 * 1024,
  });
  if (result.status !== 0) throw Error(result.error?.message || result.stderr.toString());
  return result.stdout;
}

function readRaster(src, w, h) {
  return ffmpeg(['-i', src, '-vf', `scale=${w}:${h}:flags=neighbor`,
    '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1']);
}

function writePng(name, w, h, pixels) {
  ffmpeg(['-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`,
    '-i', 'pipe:0', '-frames:v', '1', '-threads', '1', path.join(folder, name)], pixels);
}

const input = path.join(assets, 'shop-interior.png');
const original = readRaster(input, width, height);
const generated = readRaster(path.join(folder, '物件参考-ImageGen.png'), width, height);
const rect = (left, top, right, bottom) => [[left,top],[right,top],[right,bottom],[left,bottom]];
const specs = [
  { id:'door', name:'动物房间门', poly:rect(20,49,146,286) },
  { id:'keys', name:'账号钥匙板', poly:rect(150,83,232,160) },
  { id:'window', name:'窗户', poly:rect(239,23,405,178) },
  { id:'cabinet', name:'赛事柜框与上层陈列', poly:rect(426,28,622,298) },
  { id:'order', name:'订单柜台', poly:[[190,246],[194,220],[196,193],[225,184],[275,187],[284,177],
    [284,166],[309,157],[330,162],[351,178],[351,222],[359,220],[366,191],[404,190],[423,206],
    [432,224],[434,337],[191,338]] },
  { id:'lab', name:'培育柜与篮盒', poly:[[20,335],[156,335],[159,412],[183,420],[205,436],
    [209,517],[213,529],[213,606],[20,606]] },
  { id:'lab-plant', name:'柜上藤蔓植物', poly:[[19,304],[37,298],[61,297],[79,307],[87,326],
    [79,355],[62,378],[48,406],[28,409],[24,379],[17,350]] },
  { id:'market', name:'自由市场柜台', poly:[[454,329],[617,330],[622,612],[424,612],
    [422,430],[446,427],[453,414]] },
  { id:'rug', name:'长地毯', poly:[[248,399],[392,398],[406,968],[234,971],[229,959]] , locked:true },
  { id:'old-decor', name:'原装饰工具箱', poly:[[20,630],[62,616],[124,613],[151,614],
    [157,643],[166,655],[169,698],[179,729],[180,798],[170,808],[39,818],[20,815]] },
  { id:'old-breed', name:'原繁育藤篮', poly:[[502,637],[513,622],[538,610],[573,610],
    [606,617],[618,630],[622,648],[619,678],[601,695],[569,701],[539,701],[508,691],[502,676]] },
  { id:'task-table', name:'任务簿木桌与桌旗', poly:[[19,864],[42,852],[147,839],[180,859],
    [191,881],[198,922],[193,954],[193,998],[162,1001],[23,1007],[20,987]] },
  { id:'old-book', name:'原绿色签到簿', poly:[[40,855],[46,831],[65,822],[114,813],[147,814],
    [159,829],[168,854],[171,872],[159,895],[113,909],[66,908],[48,889]] },
  { id:'old-guest', name:'原来客账簿柜', poly:[[414,862],[423,815],[444,774],[478,778],[520,789],
    [549,786],[560,762],[578,754],[604,762],[606,786],[617,790],[617,961],[607,996],
    [553,1016],[429,992],[429,937],[413,910]] },
  { id:'floor-plant', name:'门口盆栽', poly:[[552,987],[556,981],[559,974],[568,974],[570,961],
    [579,954],[590,958],[594,968],[605,963],[614,968],[616,978],[621,982],[622,1019],
    [618,1049],[600,1067],[576,1066],[564,1056],[557,1033],[559,1012],[553,1005]] },
  { id:'mat', name:'门口踏垫', poly:rect(239,1041,401,1107), locked:true },
];

function inside(poly, x, y) {
  let hit = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [ax, ay] = poly[a], [bx, by] = poly[b];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) hit = !hit;
  }
  return hit;
}

function box(poly) {
  const x = poly.map(p => p[0]), y = poly.map(p => p[1]);
  return { left: Math.min(...x), top: Math.min(...y), right: Math.max(...x), bottom: Math.max(...y) };
}

const owners = new Int16Array(width * height).fill(-1);
for (const [id, spec] of specs.entries()) {
  const { left, top, right, bottom } = box(spec.poly);
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    if (inside(spec.poly, x + .5, y + .5)) owners[y * width + x] = id;
  }
}

function crop({ id, name, poly, locked = false }, source, keep, dx = 0, dy = 0) {
  const { left, top, right, bottom } = box(poly);
  const w = right - left, h = bottom - top;
  const pixels = Buffer.alloc(w * h * 4);
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const i = y * width + x;
    if (!inside(poly, x + .5, y + .5) || (keep && !keep(i))) continue;
    source.copy(pixels, ((y - top) * w + x - left) * 4, i * 4, i * 4 + 4);
  }
  const src = `图层/${id}.png`;
  writePng(src, w, h, pixels);
  return { id, name, src, x:left + dx, y:top + dy, w, h, locked, pixels };
}

function stamp(out, item) {
  for (let y = 0; y < item.h; y++) for (let x = 0; x < item.w; x++) {
    const from = (y * item.w + x) * 4;
    if (item.pixels[from + 3] === 0) continue;
    const to = ((item.y + y) * width + item.x + x) * 4;
    item.pixels.copy(out, to, from, from + 4);
  }
}

// Hidden floor pixels have no source image. Continue the original planks at
// the same height using neighboring strips and keep every exposed pixel intact.
function reflect(x, size) {
  const phase = ((x % (size * 2)) + size * 2) % (size * 2);
  return phase < size ? phase : size * 2 - phase - 1;
}

function fillWood(dest, x, y, stripStart, stripWidth) {
  const sx = stripStart + reflect(x - stripStart, stripWidth);
  const from = (y * width + sx) * 4;
  const to = (y * width + x) * 4;
  original.copy(dest, to, from, from + 4);
}

// Match the exposed left floorboard joints in the original and the clean reference.
// The reference supplies one continuous patch, including staggered board ends.
const floorJoints = [
  [610, 610], [612, 613], [631, 632], [650, 651], [670, 671], [693, 693],
  [717, 717], [734, 734], [758, 758], [781, 781], [807, 808], [818, 817],
];
const decorFloor = specs.findIndex(item => item.id === 'old-decor');
const decorFloorRows = new Map();
for (let y = floorJoints[0][0]; y < floorJoints.at(-1)[0]; y++) {
  const next = floorJoints.findIndex(([joint]) => joint > y);
  const [top, referenceTop] = floorJoints[next - 1];
  const [bottom, referenceBottom] = floorJoints[next];
  const referenceY = Math.round(referenceTop + (y - top) * (referenceBottom - referenceTop) / (bottom - top));
  const from = y * width;
  const right = owners.subarray(from, from + width).lastIndexOf(decorFloor) + 1;
  decorFloorRows.set(y, { referenceY, right });
}

function fillDecorFloor(dest, x, y) {
  const { referenceY, right } = decorFloorRows.get(y);
  const from = (referenceY * width + Math.max(22, x)) * 4;
  const neighbor = (y * width + right) * 4;
  const to = (y * width + x) * 4;
  // Match the original wood color and soften the join by the visible boards.
  const blend = Math.max(0, 1 - (right - x) / 7);
  for (let channel = 0; channel < 3; channel++) {
    const tone = Math.min(255, generated[from + channel] + channel);
    dest[to + channel] = Math.round(tone * (1 - blend) + original[neighbor + channel] * blend);
  }
}

const base = Buffer.from(original);
const removed = new Set(['old-decor','old-guest','old-breed']);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = y * width + x, owner = owners[i];
  if (owner < 0) continue;
  const { id } = specs[owner];
  if (id === 'old-decor') fillDecorFloor(base, x, y);
  else if (id === 'old-guest') fillWood(base, x, y, 200, 27);
  else if (id === 'old-breed') fillWood(base, x, y, 430, 59);
  else if (y >= 355 && !['lab','lab-plant','market'].includes(id)) {
    fillWood(base, x, y, y < 610 ? 212 : y < 1008 ? 200 : 153, 22);
  } else {
    // These occluded wall/counter surfaces are visible only in the layout editor
    // when their original furniture is hidden or moved.
    const sy = y < 250 ? 174 + reflect(y - 174, 10) : 306 + reflect(y - 306, 16);
    const sx = y < 250 ? 147 + reflect(x - 147, 32) : 292 + reflect(x - 292, 30);
    const from = (sy * width + sx) * 4, to = i * 4;
    original.copy(base, to, from, from + 4);
  }
}
writePng('图层/墙面地板.png', width, height, base);

const originals = specs.map((s,i) => crop(s, original, pixel => owners[pixel] === i));
const rebuilt = Buffer.from(base);
for (const item of originals) stamp(rebuilt, item);
if (!rebuilt.equals(original)) throw Error('拆分重组与原图不一致');
writePng('原版复原.png', width, height, rebuilt);

const newPieces = [
  crop({ id:'door-animal', name:'门上兔子与爪印', poly:rect(69,100,109,158) }, generated),
  crop({ id:'events-display', name:'赛事 · 奖牌陈列', poly:rect(450,134,610,184) }, generated),
  crop({ id:'honor-display', name:'荣誉 · 册子与奖杯', poly:rect(450,193,610,255) }, generated),
  crop({ id:'lab-tools', name:'培育台 · 档案与饲料', poly:[[22,409],[29,387],[73,389],[82,389],
    [105,405],[143,412],[181,414],[208,419],[207,524],[22,525]] }, generated),
  crop({ id:'window-decor-left', name:'窗上装饰 · 左', poly:[[244,57],[262,55],[296,55],[297,72],
    [278,82],[277,108],[255,109],[247,89],[244,86]] }, generated),
  crop({ id:'window-decor-right', name:'窗上装饰 · 右', poly:[[341,56],[390,56],[401,74],
    [397,87],[394,108],[366,113],[363,90],[342,78]] }, generated),
  crop({ id:'breed', name:'繁育 · 木制草窝', poly:[[493,642],[515,616],[528,612],[607,612],
    [618,620],[617,695],[609,710],[488,709],[485,700],[493,679]] }, generated, undefined, 0,-2),
  crop({ id:'task-cover', name:'任务贴页', poly:[[76,838],[135,835],[151,875],[100,885],[91,869]] }, generated),
  crop({ id:'checkin-gift', name:'门口签到礼物', poly:[[187,941],[194,930],[205,927],[210,934],
    [218,930],[228,934],[230,947],[230,979],[210,985],[197,981],[190,971],[189,955]] }, generated, undefined, -5, 101),
];

function clearBehind(item, overlays, sample) {
  const pixels = Buffer.from(item.pixels);
  for (const overlay of overlays) {
    for (let y = 0; y < overlay.h; y++) for (let x = 0; x < overlay.w; x++) {
      if (!overlay.pixels[(y * overlay.w + x) * 4 + 3]) continue;
      const sourceX = overlay.x + x;
      const sourceY = overlay.y + y;
      const localX = sourceX - item.x;
      const localY = sourceY - item.y;
      if (localX < 0 || localX >= item.w || localY < 0 || localY >= item.h) continue;
      const target = (localY * item.w + localX) * 4;
      if (!item.pixels[target + 3]) continue;
      const [sx, sy] = sample(sourceX, sourceY);
      const from = (sy * width + sx) * 4;
      original.copy(pixels, target, from, from + 4);
    }
  }
  const src = `图层/${item.id}-clean.png`;
  writePng(src, item.w, item.h, pixels);
  return { ...item, src, pixels };
}

// The old shelf jars and laboratory tools were painted into their furniture.
// Keep the original furniture layers for comparison and prepare empty ones
// for rearranging the new props. The replacement sprites cover these repairs.
const shelfOverlays = newPieces.filter(item => ['events-display', 'honor-display'].includes(item.id));
const labOverlay = newPieces.find(item => item.id === 'lab-tools');
const cleanFurniture = new Map([
  ['cabinet', clearBehind(originals.find(item => item.id === 'cabinet'),
    shelfOverlays, (x, y) => [497 + reflect(x - 497, 9), y])],
  ['lab', clearBehind(originals.find(item => item.id === 'lab'),
    [labOverlay], (x, y) => [131 + reflect(x - 131, 13), 423 + reflect(y - 423, 19)])],
]);
const revised = Buffer.from(base);
const revisedLayers = originals.filter(item => !removed.has(item.id))
  .map(item => cleanFurniture.get(item.id) ?? item).concat(newPieces);
for (const item of revisedLayers) stamp(revised, item);
const mutablePixels = new Uint8Array(width * height);
for (let i = 0; i < owners.length; i++) if (owners[i] >= 0 && removed.has(specs[owners[i]].id)) mutablePixels[i] = 1;
for (const item of newPieces) for (let y = 0; y < item.h; y++) for (let x = 0; x < item.w; x++) {
  if (item.pixels[(y * item.w + x) * 4 + 3]) mutablePixels[(item.y + y) * width + item.x + x] = 1;
}
let diff = 0, protectedDiff = 0;
for (let i = 0; i < owners.length; i++) {
  if (original.readUInt32LE(i * 4) === revised.readUInt32LE(i * 4)) continue;
  diff++;
  if (mutablePixels[i] === 0) protectedDiff++;
}
if (protectedDiff) throw Error('保留区出现像素变化');
writePng('新版摆放.png', width, height, revised);

for (const name of ['shopkeeper','ui-coin','ui-home']) {
  writeFileSync(path.join(layerFolder, name + '.png'), readFileSync(path.join(assets, name + '.png')));
}

const hotspots = [
  { id:'rooms', link:'door', text:'动物房间', x:31,y:66,w:104,h:218, label:[82,281], target:'动物房间' },
  { id:'login', link:'keys', text:'账号', x:150,y:86,w:80,h:76, label:[194,163], target:'账号' },
  { id:'decor', link:'window', text:'装饰', x:243,y:25,w:159,h:120, label:[323,144], target:'装饰' },
  { id:'show', link:'events-display', text:'赛事', x:434,y:47,w:182,h:138, label:[528,145], target:'赛事' },
  { id:'collection', link:'honor-display', text:'荣誉', x:434,y:187,w:182,h:85, label:[528,261], target:'荣誉' },
  { id:'orders', link:'order', text:'普通订单', x:194,y:179,w:234,h:155, label:[322,254], target:'订单' },
  { id:'lab', link:'lab', text:'培育中心', x:21,y:395,w:190,h:210, label:[115,533], target:'培育中心' },
  { id:'market', link:'market', text:'自由市场', x:429,y:332,w:187,h:277, label:[529,527], target:'自由市场' },
  { id:'breed', link:'breed', text:'繁育', x:485,y:610,w:135,h:120, label:[555,722], target:'繁育' },
  { id:'tasks', link:'task-table', text:'任务', x:22,y:819,w:172,h:190, label:[110,925], target:'任务' },
  { id:'gift', link:'checkin-gift', text:'签到', x:169,y:1019,w:73,h:82, label:[205,1093], target:'签到' },
];
const placed = item => {
  const { pixels, ...layer } = item;
  return layer;
};
const keeper = { id:'keeper', name:'店长', src:'图层/shopkeeper.png', x:294,y:341,w:51,h:145, locked:true };
const data = {
  width, height, wallFloor:'图层/墙面地板.png',
  original:[...originals.map(placed), keeper], revised:[...revisedLayers.map(placed), keeper],
  hotspots, reference:'物件参考-ImageGen.png',
};
writeFileSync(path.join(folder,'scene-data.js'), 'globalThis.PETSHOP_SCENE = ' + JSON.stringify(data,null,2) + ';\n');
const receipt = {
  source: 'PetShop/assets/art/shop-interior.png',
  sourceSha256: createHash('sha256').update(readFileSync(input)).digest('hex'),
  width, height, originalSceneLayers: originals.length,
  revisedSceneLayers: revisedLayers.length,
  originalRestoredPixelDifferences: 0, updatedPixels: diff, protectedPixelDifferences: protectedDiff,
};
writeFileSync(path.join(folder,'像素校验.json'), JSON.stringify(receipt,null,2) + '\n');
console.log(JSON.stringify(receipt));
