import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { loginArtFile } from '../../PetShop/server/multiplayer-login.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cloud = path.resolve(here, '../../云端经营版');
const { build } = createRequire(path.join(cloud, 'package.json'))('esbuild');
const {values} = parseArgs({options:{client:{type:'string'},out:{type:'string'},version:{type:'string'},source:{type:'string'}}});
if(values.version&&(!/^\d{4}\.\d{2}\.\d{2}\.[1-9]\d*$/.test(values.version)||!/^\p{ASCII_Hex_Digit}{40}$/u.test(values.source??''))) {
  throw Error('A release version (YYYY.MM.DD.N) and a full --source commit are required together.');
}
if(values.source&&!values.version)throw Error('--source requires --version.');
const client = path.resolve(values.client ?? path.join(cloud, 'dist/client'));
const dist = path.resolve(values.out ?? path.join(here, 'dist'));
const shim = path.join(here, 'crypto.mjs');
const boot = "System.import('./index.js').catch(function(err) { console.error(err); })";
const original = await readFile(path.join(client, 'index.html'), 'utf8');
if (!original.includes(boot)) throw Error('The Cocos bootstrap has changed.');
await mkdir(dist, { recursive: true });
await cp(client, dist, { recursive: true });
const worker = await build({
  entryPoints: [path.join(here, 'worker.mjs')], outfile: path.join(dist, 'trial-worker.js'),
  bundle: true, platform: 'browser', target: 'es2020', format: 'iife', charset: 'utf8',
  alias: { 'node:crypto': shim, 'node:buffer': shim },
  minify: true, legalComments: 'eof',
});
if (worker.errors.length) throw Error('Trial Worker build failed.');
await cp(path.join(here, 'node_modules/@noble/hashes/LICENSE'), path.join(dist, 'trial-crypto-LICENSE.txt'));
const login = await readFile(path.join(here,'login.html'),'utf8');
const style = await readFile(path.join(here,'login.css'),'utf8');
const main = await readFile(path.join(dist,'assets/main/index.js'));
const release = createHash('sha256').update(main).digest('hex');
const fingerprint = content => createHash('sha256').update(content).digest('hex').slice(0,16);
// Cocos loads config.<version>.json and index.<version>.js for a versioned bundle.
const config = await readFile(path.join(dist,'assets/main/config.json'));
const version = fingerprint(Buffer.concat([main,config]));
const mainScript = `assets/main/index.${version}.js`;
const settings = JSON.parse(await readFile(path.join(client,'src/settings.json'),'utf8'));
settings.assets.bundleVers.main = version;
const settingsText = JSON.stringify(settings);
const settingsPath = `src/settings.${fingerprint(settingsText)}.json`;
const application = (await readFile(path.join(client,'application.js'),'utf8')).replace('src/settings.json',settingsPath);
const applicationName = `application.${fingerprint(application)}.js`;
const entry = (await readFile(path.join(client,'index.js'),'utf8')).replace('./application.js','./'+applicationName);
const entryPath = `src/entry.${fingerprint(entry)}.js`;
if(!application.includes(settingsPath)||!entry.includes(applicationName))throw Error('The Cocos application loader has changed.');
const releaseInfo = {version:values.version??`local-${version}`,sourceCommit:values.source??null,
  clientEntry:entryPath,clientBundle:mainScript,clientSha256:release};
await Promise.all([
  writeFile(path.join(dist,mainScript),main),
  writeFile(path.join(dist,`assets/main/config.${version}.json`),config),
  writeFile(path.join(dist,settingsPath),settingsText),
  writeFile(path.join(dist,'src',applicationName),application),
  writeFile(path.join(dist,entryPath),entry),
  writeFile(path.join(dist,'release.json'),JSON.stringify(releaseInfo,null,2)+'\n'),
]);
const start = (await readFile(path.join(here,'start.js'),'utf8'))
  .replace('__PETSHOP_MAIN_SHA256__',release)
  .replace('__PETSHOP_MAIN_SCRIPT__',mainScript)
  .replace('__PETSHOP_GAME_ENTRY__',entryPath);
const html = original.replace('<html>', '<html lang="zh-CN">')
  .replace(/(<meta name="viewport"\s+)content="([^"]*)"/, '$1data-game-content="$2" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"')
  .replace('<title>Cocos Creator | PetShop</title>', '<title>店主登录 · 宠物店</title>')
  .replace('href="style.css"', 'id="game-style" media="not all" href="style.css"')
  .replace('</head>', `<link rel="stylesheet" id="login-style" href="./trial-login.css?v=${fingerprint(style)}"></head>`)
  .replace('<div id="GameDiv"', () => login.replace('<!-- PETSHOP_RELEASE -->',values.version?
    `<small class="release-version" id="petshop-release">版本 ${values.version}</small>`:'') + '\n<div id="GameDiv" hidden')
  .replace(/<script src="(src\/[^"]+\.bundle\.js)" charset="utf-8">\s*<\/script>/g,
    '<script type="application/x-petshop-loader" data-game-script="$1"></script>')
  .replace(/<script>\s*System\.import\('\.\/index\.js'\)[\s\S]*?<\/script>/, `<script type="module" src="./trial-start.js?v=${fingerprint(start)}"></script>`);
if (!html.includes('data-game-script="src/system.bundle.js"') || !html.includes('src="./trial-start.js?v=')) {
  throw Error('The Cocos script loader has changed.');
}
await cp(loginArtFile, path.join(dist, 'trial-shopfront.png'));
await writeFile(path.join(dist,'trial-start.js'), start);
await cp(path.join(here, 'legacy.js'), path.join(dist, 'legacy.js'));
await writeFile(path.join(dist, 'trial-login.css'), style);
await writeFile(path.join(dist, 'index.html'), html);
console.log('Static browser trial ready at', dist);
