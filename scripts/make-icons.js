// scripts/make-icons.js
// Renders the PWA icons from icons/icon.svg with sharp: icon-192.png, icon-512.png,
// icon-512-maskable.png (the artwork without the edge stripe, barbell inside the safe zone) and
// apple-touch-icon.png (180). Run after `npm install`: `node scripts/make-icons.js`.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'icons/icon.svg'));

const plain = (size, file) => sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(root, 'icons', file));

// Maskable: same artwork without the bottom stripe (launchers crop the edges, which would leave a
// floating band). The barbell already sits inside the central safe circle (radius 40%).
const maskable = (size, file) => sharp(Buffer.from(svg.toString().replace(/<rect y="436"[^>]*\/>/, '')), { density: 384 })
  .resize(size, size).png().toFile(join(root, 'icons', file));

await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await maskable(512, 'icon-512-maskable.png');
await plain(180, 'apple-touch-icon.png');
console.log('icons written: icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png');
