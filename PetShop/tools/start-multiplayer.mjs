import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createMultiplayerServer } from '../server/multiplayer.mjs';

const dataDirectory = path.resolve(process.env.MULTIPLAYER_DATA_DIR || fileURLToPath(new URL('../local/multiplayer/', import.meta.url)));
const addressFile = path.join(dataDirectory, '试玩地址.url');
const stopRequest = path.join(dataDirectory, 'stop-request');
if (process.argv[2] === '--stop') {
    if (existsSync(dataDirectory)) writeFileSync(stopRequest, '');
    console.log('下次检查时将关闭本机多人试玩服。');
    process.exit(0);
}
const port = Number(process.env.MULTIPLAYER_PORT || 17889);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('多人服端口无效。');
const portable = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'PetShop', 'tools', 'cloudflared.exe');
const executable = process.env.CLOUDFLARED || (portable && existsSync(portable) ? portable : 'cloudflared');

let publicOrigin = null;
const server = createMultiplayerServer({ dataDirectory, publicOrigin: () => publicOrigin });
try {
    server.listen(port, '127.0.0.1');
    await once(server, 'listening');
} catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    console.error('多人服端口已在使用。如果试玩服已经运行，可在存档目录查看「试玩地址.url」。');
    process.exit(1);
}

// Do not run the tunnel until this process owns its loopback listener.
if (existsSync(addressFile)) unlinkSync(addressFile);
if (existsSync(stopRequest)) unlinkSync(stopRequest);
const tunnel = spawn(executable, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:' + port], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let connected = false;
let announced = false;
function observe(line) {
    if (!publicOrigin) {
        const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com(?=[\s/|]|$)/i);
        if (match) publicOrigin = new URL(match[0]).origin;
    }
    if (line.includes('Registered tunnel connection')) connected = true;
    if (publicOrigin && connected && !announced) {
        writeFileSync(addressFile, '[InternetShortcut]\r\nURL=' + publicOrigin + '/\r\n');
        announced = true;
        console.log('异地试玩地址：' + publicOrigin + '/\n地址已保存到 ' + addressFile + '\n保持电脑在线。按 Ctrl+C 结束本次开服。');
    }
    if (/\b(ERR|WRN)\b/.test(line)) console.error(line);
}
for (const stream of [tunnel.stdout, tunnel.stderr]) createInterface({input:stream}).on('line', observe);
console.log('正在连接异地试玩入口……');

let stopping = false;
function stop() {
    stopping = true;
    if (tunnel.exitCode === null && !tunnel.killed) tunnel.kill();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
if (process.platform === 'win32') process.once('SIGBREAK', stop);
const stopCheck = setInterval(() => {
    if (existsSync(stopRequest)) stop();
}, 1000);
stopCheck.unref();
tunnel.once('error', error => {
    console.error(error.code === 'ENOENT' ? '找不到 cloudflared。请先按多人开服说明安装。' : error.message);
    process.exitCode = 1;
});
tunnel.once('close', code => {
    clearInterval(stopCheck);
    if (announced && existsSync(addressFile)) unlinkSync(addressFile);
    if (existsSync(stopRequest)) unlinkSync(stopRequest);
    if (!stopping) process.exitCode = code || 1;
    server.close();
    server.closeAllConnections();
});
