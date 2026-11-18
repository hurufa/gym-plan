// scripts/precache.js
// Writes the service worker's precache list: every file the app needs offline (index.html, the
// manifest, css, js except tests, data, fonts, vendor, icons), plus VERSION = a hash of their contents.
// Run after changing any app file: `node scripts/precache.js`. `--check` exits with an error if sw.js
// is out of date (used by the acceptance run).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = dir => readdirSync(join(root, dir)).flatMap(f => {
  const p = join(dir, f);
  return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
});
const files = ['index.html', 'manifest.webmanifest',
  ...['css', 'js', 'data', 'fonts', 'vendor', 'icons'].flatMap(walk)]
  .map(f => f.split(sep).join('/'))
  .filter(f => !f.startsWith('js/tests/') && !/(^|\/)\./.test(f))
  .sort();

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 12);

const block = `/* precache:start */\nconst VERSION = '${version}';\nconst ASSETS = [\n  './',\n${files.map(f => `  './${f}',`).join('\n')}\n];\n/* precache:end */`;
const swPath = join(root, 'sw.js');
const sw = readFileSync(swPath, 'utf8');
const next = sw.replace(/\/\* precache:start \*\/[\s\S]*?\/\* precache:end \*\//, block);

if (process.argv.includes('--check')) {
  if (next !== sw) { console.error('sw.js is out of date: run node scripts/precache.js'); process.exit(1); }
  console.log(`sw.js up to date: ${files.length} files, version ${version}`);
} else {
  writeFileSync(swPath, next);
  console.log(`sw.js: ${files.length} files, version ${version}`);
}
