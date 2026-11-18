// scripts/dev-server.mjs
// Local static server for development: serves this folder with Cache-Control: no-store so edited
// data and modules are never served stale. Usage: node scripts/dev-server.mjs [port] (default 8417).
// Production and the README use any static host (npx serve, GitHub Pages).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 8417;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.md': 'text/plain' };

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': (TYPES[extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
})
  .on('error', err => {
    if (err.code !== 'EADDRINUSE') throw err;
    console.error(`Port ${port} is already in use: the server may already be running in another window.`);
    console.error(`Open http://localhost:${port}/ or start on another port: node scripts/dev-server.mjs ${port + 1}`);
    process.exit(1);
  })
  .listen(port, () => console.log(`Serving gym-app at http://localhost:${port}/  (Ctrl+C to stop)`));
