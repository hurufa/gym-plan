// sw.js
// Service worker: caches every app file on install so the app works fully offline after the first
// load. Hosted: cache first (fast, offline). On localhost: network first, falling back to the cache,
// so development never serves stale files. Page navigations fall back to the cached index.html.
// VERSION and ASSETS between the markers are written by `node scripts/precache.js`; VERSION is a
// hash of all listed files, so any change installs a fresh cache and removes the old one.

/* precache:start */
const VERSION = '81581a347b08';
const ASSETS = [
  './',
  './css/animations.css',
  './css/base.css',
  './css/components.css',
  './css/tokens.css',
  './data/enums.json',
  './data/exercises.json',
  './data/foods.json',
  './data/glossary.json',
  './data/i18n/en.json',
  './data/i18n/id.json',
  './data/meal-templates.json',
  './data/warmups.json',
  './fonts/anton-latin-400-normal.woff2',
  './fonts/barlow-latin-400-normal.woff2',
  './fonts/barlow-latin-500-normal.woff2',
  './fonts/barlow-latin-600-normal.woff2',
  './fonts/jetbrains-mono-latin-500-normal.woff2',
  './fonts/jetbrains-mono-latin-700-normal.woff2',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512-maskable.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './index.html',
  './js/animations.js',
  './js/app.js',
  './js/bodymap.js',
  './js/charts.js',
  './js/contrast.js',
  './js/data.js',
  './js/equipment.js',
  './js/figure-patterns.js',
  './js/file-notice.js',
  './js/glossary.js',
  './js/i18n.js',
  './js/nutrition.js',
  './js/planner.js',
  './js/plans.js',
  './js/router.js',
  './js/schema.js',
  './js/session.js',
  './js/state.js',
  './js/tracker.js',
  './js/ui.js',
  './js/views/exercise.js',
  './js/views/exercises.js',
  './js/views/home.js',
  './js/views/learn.js',
  './js/views/nutrition.js',
  './js/views/onboarding.js',
  './js/views/plan.js',
  './js/views/progress.js',
  './js/views/session.js',
  './js/views/settings.js',
  './manifest.webmanifest',
  './vendor/gsap.min.js',
];
/* precache:end */

const CACHE = `gym-app-${VERSION}`;
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache (GitHub Pages sends max-age=600), so a new version
  // is never filled with files the browser kept from the previous one.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('gym-app-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function fromCache(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  if (req.mode === 'navigate') return caches.match('./index.html');
  return undefined;
}

async function fromNetwork(req) {
  const res = await fetch(req);
  if (res.ok && new URL(req.url).origin === self.location.origin) {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(DEV
    ? fromNetwork(req).catch(async () => (await fromCache(req)) || Response.error())
    : fromCache(req).then(hit => hit || fromNetwork(req)));
});
