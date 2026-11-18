import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = process.env.PETSHOP_PORT || '17888';
if(!/^\d{1,5}$/.test(port)||Number(port)<1||Number(port)>65535)throw new Error('PETSHOP_PORT 必须是有效端口。');
const origin = 'http://127.0.0.1:'+Number(port)+'/';
const server = fileURLToPath(new URL('../server/main.mjs', import.meta.url));
const index = fileURLToPath(new URL('../build/web-mobile/index.html', import.meta.url));
const editorPath = 'D:\\app\\CocosCreator\\3.8.8\\CocosCreator.exe';

async function readHealth() {
    let response;
    try {
        response = await fetch(new URL('api/health', origin), {
            signal: AbortSignal.timeout(1500), redirect: 'error',
        });
    } catch (error) {
        if (error.cause?.code === 'ECONNREFUSED') return false;
        throw new Error(port+' 端口没有返回宠物店的健康信息。请检查占用该端口的程序。');
    }
    const info = response.ok ? await response.json().catch(() => null) : null;
    if (info?.service !== 'petshop' || info.status !== 'ok' || info.protocol !== 1) {
        throw new Error(port+' 端口的服务或协议不匹配。请检查占用该端口的程序。');
    }
    if(info.gameplay !== 1) throw new Error('旧版店铺服务仍在运行。请退出旧服务，再启动经营版。');
    return true;
}

async function startServer() {
    await access(server).catch(() => { throw new Error('缺少 server/main.mjs。'); });
    const child = spawn(process.execPath, [server], {
        cwd: root, detached: true, windowsHide: true, stdio: 'ignore',
        env: { ...process.env, PETSHOP_HOST: '127.0.0.1', PETSHOP_PORT: port,
            PETSHOP_ONBOARDING:process.env.PETSHOP_ONBOARDING??'1',
            PETSHOP_WEB_ROOT: dirname(index) },
    });
    await once(child, 'spawn');
    child.unref();
    // Another launcher can win the exclusive port bind between the probe and spawn.
    // Use the listener's health response as the readiness signal in either case.
    for (let attempt = 0; attempt < 40; attempt++) {
        if (await readHealth()) return;
        await delay(200);
    }
    if (child.exitCode === null) child.kill();
    throw new Error('8 秒内未能连上服务端。可在工程目录运行 node server/main.mjs 查看启动错误。');
}

async function main() {
    const args = process.argv.slice(2);
    if (args.some(arg => !['--editor', '--no-browser', '--check-only'].includes(arg))) {
        throw new Error('可用参数：--editor 打开正式工程，--no-browser 仅启动服务并核验，--check-only 只核验。');
    }
    const openEditor = args.includes('--editor');
    let html;
    if (openEditor) {
        await access(editorPath).catch(() => { throw new Error('找不到编辑器：' + editorPath); });
    } else {
        html = await readFile(index).catch(() => {
            throw new Error('缺少 Web Mobile 构建。在工程目录运行下面的 PowerShell 命令，再重新启动：\n' +
                `& '${editorPath}' --project (Get-Location).Path --build ('configPath=' + (Resolve-Path 'tools/build-web-mobile.json').Path)`);
        });
    }
    if (!(await readHealth())) {
        if (args.includes('--check-only')) throw new Error('宠物店服务端尚未启动。');
        await startServer();
    }
    if (openEditor) {
        console.log('宠物店服务端已就绪，编辑器路径：' + editorPath);
    } else {
        const response = await fetch(origin, { signal: AbortSignal.timeout(3000), redirect: 'error' });
        if (!response.ok || !html.equals(Buffer.from(await response.arrayBuffer()))) {
            throw new Error('服务端未返回当前工程的 Web Mobile 首页。请检查构建目录和运行中的服务端。');
        }
        console.log('宠物店服务端和游戏首页已就绪：' + origin);
    }
    if (!args.includes('--no-browser') && !args.includes('--check-only')) {
        const env = { ...process.env };
        if (openEditor) delete env.ELECTRON_RUN_AS_NODE;
        const viewer = spawn(openEditor ? editorPath : 'rundll32.exe',
            openEditor ? ['--project', root] : ['url.dll,FileProtocolHandler', origin], {
            detached: true, stdio: 'ignore', windowsHide: !openEditor, env,
        });
        await once(viewer, 'spawn');
        viewer.unref();
    }
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
