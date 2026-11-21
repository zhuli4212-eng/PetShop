import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('./', import.meta.url));

async function update(root, file, edits) {
  const target = path.join(root, file);
  let content = await readFile(target, 'utf8');
  for (const [before, after] of edits) {
    const count = typeof before === 'string' ? content.split(before).length - 1 : [...content.matchAll(before)].length;
    if (count !== 1) throw Error('本地测试包装接位置已变化：' + file);
    content = content.replace(before, after);
  }
  await writeFile(target, content);
}

export async function installLocalTestRuntime(runtime, web) {
  const tools = path.join(runtime, 'tools/local-test');
  await mkdir(tools);
  await Promise.all([
    cp(path.join(source, 'server.mjs'), path.join(tools, 'server.mjs')),
    cp(path.join(source, 'actions.mjs'), path.join(tools, 'actions.mjs')),
    cp(path.join(source, 'wallet.mjs'), path.join(web, 'local-opening/wallet.mjs')),
    update(runtime, 'tools/start.mjs', [['../server/main.mjs', './local-test/server.mjs']]),
    update(runtime, 'server/shop-engine.mjs', [
      ['const actionHandlers = [', "import { localTestAction } from '../tools/local-test/actions.mjs';\nconst actionHandlers = [localTestAction, "],
    ]),
    update(runtime, 'server/business.mjs', [
      [/function requirements\(branch, level\) \{[\s\S]*?\n\}/g, 'function requirements() { return []; }'],
    ]),
    update(runtime, 'server/breeding-programs.mjs', [
      ["const locked=tier>0&&!recorded[breedKey+'-'+(tier-1)];", 'const locked=false;'],
      ["||tier>0&&!state.records[breedKey+'-'+(tier-1)]", ''],
    ]),
  ]);
}
