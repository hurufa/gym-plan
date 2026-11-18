// scripts/vendor.js
// Copies third-party runtime files out of node_modules into the app folders:
// GSAP -> /vendor, latin woff2 fonts (Anton 400, JetBrains Mono 500/700, Barlow 400/500/600) -> /fonts.
// Run after `npm install`: `node scripts/vendor.js`. Never hand-write these files.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');

const files = [
  ['gsap/dist/gsap.min.js', 'vendor/gsap.min.js'],
  ['@fontsource/anton/files/anton-latin-400-normal.woff2', 'fonts/anton-latin-400-normal.woff2'],
  ...[500, 700].map(w => [`@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${w}-normal.woff2`, `fonts/jetbrains-mono-latin-${w}-normal.woff2`]),
  ...[400, 500, 600].map(w => [`@fontsource/barlow/files/barlow-latin-${w}-normal.woff2`, `fonts/barlow-latin-${w}-normal.woff2`]),
];

for (const [from, to] of files) {
  const src = join(nm, from);
  if (!existsSync(src)) {
    console.error(`Missing ${from}. Run "npm install" first.`);
    process.exit(1);
  }
  mkdirSync(dirname(join(root, to)), { recursive: true });
  copyFileSync(src, join(root, to));
  console.log(`copied ${to}`);
}
