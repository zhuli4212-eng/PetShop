import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../云端经营版/package.json'));
const { build } = require('esbuild');
const output = path.join(here, 'dist');
const { origin } = JSON.parse(await readFile(path.join(here, 'proxy-origin.json'), 'utf8'));
const upstream = new URL(origin);
if (upstream.protocol !== 'https:' || upstream.origin !== origin) {
  throw new Error('The account service origin must be an absolute HTTPS origin without a path.');
}

await mkdir(output, { recursive: true });
await build({
  entryPoints: [path.join(here, 'proxy.mjs')],
  outfile: path.join(output, '_worker.js'),
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  charset: 'utf8',
  define: { PETSHOP_ACCOUNTS_ORIGIN: JSON.stringify(origin) },
  minify: true,
  legalComments: 'eof',
});
await copyFile(path.join(here, '_routes.json'), path.join(output, '_routes.json'));
console.log('Pages account proxy and routes built in', output);
