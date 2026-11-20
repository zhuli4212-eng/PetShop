import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs, promisify } from 'node:util';
import { loginArtFile, loginMusicFile } from '../../PetShop/server/multiplayer-login.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cloud = path.resolve(here, '../../云端经营版');
const { build } = createRequire(path.join(cloud, 'package.json'))('esbuild');
const {values} = parseArgs({options:{client:{type:'string'},out:{type:'string'},version:{type:'string'},source:{type:'string'},demo:{type:'boolean'},'compress-fonts':{type:'boolean'}}});
if(values.version&&(!/^\d{4}\.\d{2}\.\d{2}\.[1-9]\d*$/.test(values.version)||!/^\p{ASCII_Hex_Digit}{40}$/u.test(values.source??''))) {
  throw Error('A release version (YYYY.MM.DD.N) and a full --source commit are required together.');
}
if(values.source&&!values.version)throw Error('--source requires --version.');
if (values.demo && !values.out) throw Error('Specify a new output directory with --out for the public demo.');
const client = path.resolve(values.client ?? (values.demo
  ? path.join(here, '../../PetShop/build/web-mobile')
  : path.join(cloud, 'dist/client')));
const dist = path.resolve(values.out ?? path.join(here, 'dist'));
const shim = path.join(here, 'crypto.mjs');
const boot = "System.import('./index.js').catch(function(err) { console.error(err); })";
const original = await readFile(path.join(client, 'index.html'), 'utf8');
if (original.includes('local-opening/')) throw Error('Use the original Cocos build for web publishing.');
if (!original.includes(boot)) throw Error('The Cocos bootstrap has changed.');
if (values.demo) await mkdir(path.dirname(dist), { recursive: true });
await mkdir(dist, { recursive: !values.demo });
await cp(client, dist, { recursive: true });
const worker = await build({
  entryPoints: [path.join(here, 'worker.mjs')], outfile: path.join(dist, 'trial-worker.js'),
  bundle: true, platform: 'browser', target: 'es2020', format: 'iife', charset: 'utf8',
  define: { PETSHOP_BROWSER_DEMO: String(values.demo === true) },
  alias: { 'node:crypto': shim, 'node:buffer': shim },
  minify: true, legalComments: 'eof',
});
if (worker.errors.length) throw Error('Trial Worker build failed.');
await cp(path.join(here, 'node_modules/@noble/hashes/LICENSE'), path.join(dist, 'trial-crypto-LICENSE.txt'));
const main = await readFile(path.join(dist,'assets/main/index.js'));
const release = createHash('sha256').update(main).digest('hex');
const fingerprint = content => createHash('sha256').update(content).digest('hex').slice(0,16);
// Cocos loads config.<version>.json and index.<version>.js for a versioned bundle.
const config = await readFile(path.join(dist,'assets/main/config.json'));
const version = fingerprint(Buffer.concat([main,config]));
const mainScript = `assets/main/index.${version}.js`;
const settings = JSON.parse(await readFile(path.join(client,'src/settings.json'),'utf8'));
settings.assets.bundleVers.main = version;
if (!values.demo && (values.version || values['compress-fonts'])) {
  const resources = path.join(dist, 'assets/resources');
  const { stdout } = await promisify(execFile)(process.env.PETSHOP_FONT_PYTHON || 'python',
    [path.join(here, 'compress-fonts.py'), resources], { windowsHide: true });
  process.stdout.write(stdout);
  const resourceConfig = await readFile(path.join(resources, 'config.json'));
  const resourceVersion = fingerprint(resourceConfig);
  settings.assets.bundleVers.resources = resourceVersion;
  await Promise.all([
    writeFile(path.join(resources, `config.${resourceVersion}.json`), resourceConfig),
    cp(path.join(resources, 'index.js'), path.join(resources, `index.${resourceVersion}.js`)),
  ]);
}
const settingsText = JSON.stringify(settings);
const settingsPath = `src/settings.${fingerprint(settingsText)}.json`;
const application = (await readFile(path.join(client,'application.js'),'utf8')).replace('src/settings.json',settingsPath);
const applicationName = `application.${fingerprint(application)}.js`;
const entry = (await readFile(path.join(client,'index.js'),'utf8')).replace('./application.js','./'+applicationName);
const entryPath = `src/entry.${fingerprint(entry)}.js`;
if(!application.includes(settingsPath)||!entry.includes(applicationName))throw Error('The Cocos application loader has changed.');
const releaseInfo = {version:values.version??`${values.demo ? 'demo' : 'local'}-${version}`,sourceCommit:values.source??null,
  clientEntry:entryPath,clientBundle:mainScript,clientSha256:release};
await Promise.all([
  writeFile(path.join(dist,mainScript),main),
  writeFile(path.join(dist,`assets/main/config.${version}.json`),config),
  writeFile(path.join(dist,settingsPath),settingsText),
  writeFile(path.join(dist,'src',applicationName),application),
  writeFile(path.join(dist,entryPath),entry),
  writeFile(path.join(dist,'release.json'),JSON.stringify(releaseInfo,null,2)+'\n'),
]);
if (values.demo) {
  const workerPath = './trial-worker.js?v=' + fingerprint(await readFile(path.join(dist, 'trial-worker.js')));
  const start = (await readFile(path.join(here, 'demo-start.js'), 'utf8'))
    .replace('__PETSHOP_DEMO_WORKER__', workerPath)
    .replace('__PETSHOP_GAME_ENTRY__', entryPath);
  const startPath = `demo-start.${fingerprint(start)}.js`;
  const html = original.replace('<html>', '<html lang="zh-CN">')
    .replace('<title>Cocos Creator | PetShop</title>', '<title>麦穗宠物店 · 免登录试玩</title>')
    .replace('<body>', '<body><p id="demo-status" role="status" style="color:#fff0cb">正在打开麦穗宠物店…</p>')
    .replace('<div id="GameDiv"', '<div id="GameDiv" hidden')
    .replace(boot, `import('./${startPath}').catch(() => { document.getElementById('demo-status').textContent = '试玩加载失败，请刷新重试。'; });`)
    .replace('</head>', '<style>#GameDiv[hidden]{display:none}</style></head>');
  await Promise.all([
    writeFile(path.join(dist, startPath), start),
    writeFile(path.join(dist, 'index.html'), html),
  ]);
  console.log('Public browser demo ready at', dist);
} else {
  const login = await readFile(path.join(here,'login.html'),'utf8');
  const bootWatchdog = await readFile(path.join(here,'boot-watchdog.js'),'utf8');
  const legacy = await readFile(path.join(here,'legacy.js'));
  const style = await readFile(path.join(here,'login.css'),'utf8') + '\n' +
    await readFile(path.join(here,'opening.css'),'utf8');
  let opening = await readFile(path.join(here,'opening.html'),'utf8');
  for (const name of ['shopfront','rabbit','envelope']) {
    const image = await readFile(path.join(here,'opening',name+'.png'));
    const asset = `src/opening-${name}.${fingerprint(image)}.png`;
    await writeFile(path.join(dist,asset),image);
    opening = opening.replace(`./opening/${name}.png`, './'+asset);
  }
  const openingScript = await readFile(path.join(here,'opening.js'));
  const openingModule = `src/opening.${fingerprint(openingScript)}.js`;
  const loginMusic = await readFile(loginMusicFile);
  const loginMusicPath = `src/login-music.${fingerprint(loginMusic)}.mp3`;
  const loginMusicScript = await readFile(new URL('../../PetShop/server/login-music.mjs',import.meta.url));
  const loginMusicModule = `src/login-music.${fingerprint(loginMusicScript)}.js`;
  await Promise.all([
    writeFile(path.join(dist,openingModule),openingScript),
    writeFile(path.join(dist,loginMusicPath),loginMusic),
    writeFile(path.join(dist,loginMusicModule),loginMusicScript),
  ]);
  const start = (await readFile(path.join(here,'start.js'),'utf8'))
    .replace("from './legacy.js'", `from './legacy.js?v=${fingerprint(legacy)}'`)
    .replace('__PETSHOP_MAIN_SHA256__',release)
    .replace('__PETSHOP_MAIN_SCRIPT__',mainScript)
    .replace('__PETSHOP_GAME_ENTRY__',entryPath)
    .replace('__PETSHOP_LOGIN_MUSIC_MODULE__',loginMusicModule)
    .replace('__PETSHOP_OPENING_MODULE__',openingModule);
  const html = original.replace('<html>', '<html lang="zh-CN">')
    .replace('<meta charset="utf-8">', tag => `${tag}<script>${bootWatchdog}</script>`)
    .replace(/(<meta name="viewport"\s+)content="([^"]*)"/, '$1data-game-content="$2" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"')
    .replace('<title>Cocos Creator | PetShop</title>', '<title>麦穗宠物店</title>')
    .replace('</head>', `<link rel="stylesheet" id="login-style" href="./trial-login.css?v=${fingerprint(style)}"></head>`)
    .replace('<div id="GameDiv"', () => login.replace('__PETSHOP_LOGIN_MUSIC_CLIP__',loginMusicPath).replace('<!-- PETSHOP_RELEASE -->',values.version?
      `<small class="release-version" id="petshop-release">版本 ${values.version}</small>`:'') + '\n' + opening + '\n<div id="GameDiv"')
    .replace(/<script src="(src\/[^"]+\.bundle\.js)" charset="utf-8">\s*<\/script>/g,
      '<script type="application/x-petshop-loader" data-game-script="$1"></script>')
    .replace(/<script>\s*System\.import\('\.\/index\.js'\)[\s\S]*?<\/script>/, `<script id="petshop-start" type="module" src="./trial-start.js?v=${fingerprint(start)}"></script>`);
  if (!html.includes('data-game-script="src/system.bundle.js"') || !html.includes('src="./trial-start.js?v=')
      || !html.includes('petshop:startup-failed')) {
    throw Error('The Cocos script loader has changed.');
  }
  await cp(loginArtFile, path.join(dist, 'trial-shopfront.png'));
  await writeFile(path.join(dist,'trial-start.js'), start);
  await writeFile(path.join(dist,'legacy.js'), legacy);
  await writeFile(path.join(dist, 'trial-login.css'), style);
  await writeFile(path.join(dist, 'index.html'), html);
  console.log('Static browser trial ready at', dist);
}
