import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginArtFile, loginMusicFile } from '../server/multiplayer-login.mjs';
import { installLocalTestRuntime } from './local-test/package.mjs';

const localTest = process.argv[3] === '--local-test';
if (process.argv.length !== (localTest ? 4 : 3)) {
  throw Error('用法：node PetShop/tools/package-local-preview.mjs <新输出目录> [--local-test]');
}
const game = fileURLToPath(new URL('../', import.meta.url));
const project = path.resolve(game, '..');
const browser = path.join(project, '外网试玩/browser');
const client = path.join(game, 'build/web-mobile');
const output = path.resolve(process.argv[2]);
const runtime = path.join(output, 'PetShop');
const web = path.join(runtime, 'build/web-mobile');
const splash = path.join(web, 'local-opening');
const port = localTest ? 17940 : 17939;
const label = localTest ? '本地全功能测试包' : '本地查看版';
const launcher = localTest ? '启动本地测试包.cmd' : '启动本地查看版.cmd';
const save = localTest ? 'save-test' : 'save';
if (localTest && path.relative(path.join(project, 'output'), path.dirname(output)) !== '') {
  throw Error('全功能测试包必须输出到项目 output 下的独立目录。');
}

const [opening, gameHtml, bundle] = await Promise.all([
  readFile(path.join(browser, 'opening.html'), 'utf8'),
  readFile(path.join(client, 'index.html'), 'utf8'),
  readFile(path.join(client, 'assets/main/index.js')),
]);
if (!gameHtml.includes("System.import('./index.js')") || !opening.includes('id="login-opening"')) {
  throw Error('Cocos 启动页或开场模板已改变，请检查后再打包。');
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim();
const manifest = {
  sourceCommit: revision,
  clientSha256: createHash('sha256').update(bundle).digest('hex'),
  port,
  ...(localTest && { mode: 'local-test' }),
  entry: '/',
  startup: ['cocos', 'loading', 'opening', 'login', 'shop'],
};
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
await mkdir(path.join(runtime, 'tools'), { recursive: true });
await cp(client, web, { recursive: true });
await mkdir(splash);
await Promise.all([
  cp(path.join(game, 'server'), path.join(runtime, 'server'), {
    recursive: true, filter: source => !source.endsWith('.test.mjs'),
  }),
  cp(path.join(game, 'start-offline.cmd'), path.join(runtime, 'start-offline.cmd')),
  cp(path.join(game, 'tools/start.mjs'), path.join(runtime, 'tools/start.mjs')),
  cp(path.join(browser, 'opening'), path.join(splash, 'opening'), { recursive: true }),
  cp(path.join(browser, 'opening.js'), path.join(splash, 'opening.js')),
  cp(path.join(browser, 'opening.css'), path.join(splash, 'opening.css')),
  cp(path.join(game, 'tools/local-preview-entry.css'), path.join(splash, 'entry.css')),
  cp(path.join(game, 'tools/local-preview-entry.mjs'), path.join(splash, 'entry.mjs')),
  cp(loginArtFile, path.join(splash, 'shopfront.png')),
  cp(loginMusicFile, path.join(splash, 'music.mp3')),
  cp(path.join(game, 'server/login-music.mjs'), path.join(splash, 'login-music.mjs')),
  cp(path.join(game, 'assets/resources/fonts/Sans-LICENSE.txt'), path.join(output, 'Sans-LICENSE.txt')),
  cp(path.join(game, 'assets/resources/fonts/Serif-LICENSE.txt'), path.join(output, 'Serif-LICENSE.txt')),
]);
if (localTest) await installLocalTestRuntime(runtime, web);

const entryMarkup = `
<div id="local-login" hidden>
  <main class="ledger">
    <img class="shopfront" src="./local-opening/shopfront.png" alt="">
    <section class="sheet" aria-labelledby="heading">
      <header class="shop-brand">
        <h1 id="heading">店主登录</h1>
        <button class="music-control" id="login-music-control" type="button" hidden>播放音乐</button>
      </header>
      <audio id="login-music" src="./local-opening/music.mp3" preload="none" loop hidden></audio>
      <button class="primary" id="enter-shop" type="button">进入店铺</button>
    </section>
  </main>
</div>
${opening.replaceAll('./opening/', './local-opening/opening/')}
<script>
  window.petshopBeforeShop = onVisible => import('./local-opening/entry.mjs')
    .then(({ enterLocalShop }) => enterLocalShop(onVisible));
</script>
`;
const entry = gameHtml.replace('<html>', '<html lang="zh-CN">')
  .replace('<title>Cocos Creator | PetShop</title>', '<title>麦穗宠物店 · '+label+'</title>')
  .replace('</head>', '  <link rel="stylesheet" href="./local-opening/entry.css">\n' +
    '  <link rel="stylesheet" href="./local-opening/opening.css">\n</head>')
  .replace('<body>', '<body>\n' + entryMarkup)
  .replace('</body>', (localTest ? '<script type="module" src="./local-opening/wallet.mjs"></script>\n' : '') + '</body>');
const launch = [
  '@echo off',
  'setlocal',
  `set "PETSHOP_PORT=${port}"`,
  `set "PETSHOP_ONBOARDING=${localTest ? 0 : 1}"`,
  `set "PETSHOP_SAVE_DIR=%~dp0${save}"`,
  `set "PETSHOP_MAINTENANCE_DIR=${localTest ? '' : '%~dp0save\\maintenance'}"`,
  'call "%~dp0PetShop\\start-offline.cmd" %*',
  'exit /b %ERRORLEVEL%',
].join('\r\n') + '\r\n';
const instructions = [
  '麦穗宠物店 · ' + label,
  '',
  `双击「${launcher}」，或在服务启动后打开 http://127.0.0.1:${port}/ 。`,
  '先显示 Cocos 标题和统一加载。完整播放开场，或点击「跳过」，再从本地登录页点「进入店铺」。',
  localTest ? '全部功能入口及三种房间已开放。每次点击右上角金币增加 10,000。测试存档保存在 save-test。'
    : '首次进入打开交接信，进度保存在本目录的 save 文件夹里。',
  '运行需要 Windows 和 Node.js 22 或更新版本。游戏资源与服务均包含在此文件夹中。',
  '',
  '游戏来源：' + revision,
].join('\r\n') + '\r\n';
await Promise.all([
  writeFile(path.join(web, 'game.html'), entry),
  writeFile(path.join(web, 'index.html'), entry),
  writeFile(path.join(output, launcher), launch),
  writeFile(path.join(output, '版本.json'), JSON.stringify(manifest, null, 2) + '\n'),
  writeFile(path.join(output, '查看说明.txt'), instructions),
]);
console.log(output);
