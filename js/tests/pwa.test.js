// tests/pwa.test.js
// Phase 11 checks: the manifest (relative start_url/scope, icons that load at their stated sizes,
// a maskable icon), the service worker's precache list (every entry loads; every module reachable
// from js/app.js, every data file and every font is listed), and the registration rule (no service
// worker in the single-file build). Offline behaviour and the single-file build itself are checked
// in a real browser (see BUILD-LOG phase 11).

import { suite, test, assert, eq, noErrors } from './harness.js';

const swAssets = async () => {
  const src = await fetch('./sw.js', { cache: 'no-store' }).then(r => r.text());
  const block = src.match(/const ASSETS = \[([\s\S]*?)\];/)[1];
  return { src, version: src.match(/const VERSION = '([^']+)'/)[1], assets: [...block.matchAll(/'([^']+)'/g)].map(m => m[1]) };
};

// Every module reachable from js/app.js through static and dynamic imports.
async function moduleGraph(entry = './js/app.js') {
  const seen = new Set();
  const visit = async url => {
    if (seen.has(url)) return;
    seen.add(url);
    const src = await fetch(url).then(r => r.text());
    const specs = [...src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)].map(m => m[1] || m[2]);
    for (const s of specs) await visit('./' + new URL(s, new URL(url, location.href)).pathname.replace(/^.*?\/js\//, 'js/'));
  };
  await visit(entry);
  return [...seen];
}

suite('PWA: manifest', () => {
  test('relative start_url and scope, standalone display, theme colour', async () => {
    const m = await fetch('./manifest.webmanifest').then(r => r.json());
    eq([m.start_url, m.scope, m.display, m.theme_color], ['./', './', 'standalone', '#141414']);
  });
  test('icons load at their stated sizes; one is maskable; index.html links the manifest and icons', async () => {
    const m = await fetch('./manifest.webmanifest').then(r => r.json());
    const errors = [];
    for (const ic of m.icons) {
      const img = new Image();
      img.src = ic.src;
      await img.decode().catch(() => errors.push(`${ic.src} does not load`));
      if (`${img.naturalWidth}x${img.naturalHeight}` !== ic.sizes) errors.push(`${ic.src}: ${img.naturalWidth}x${img.naturalHeight}, manifest says ${ic.sizes}`);
    }
    if (!m.icons.some(i => i.purpose === 'maskable')) errors.push('no maskable icon');
    const html = await fetch('./index.html').then(r => r.text());
    for (const s of ['rel="manifest"', 'apple-touch-icon.png', 'icons/icon.svg']) if (!html.includes(s)) errors.push(`index.html lacks ${s}`);
    noErrors(errors);
  });
});

suite('PWA: service worker precache', () => {
  test('every precached URL loads (200)', async () => {
    const { assets } = await swAssets();
    const bad = [];
    for (const a of assets) { const r = await fetch(a, { cache: 'no-store' }); if (!r.ok) bad.push(`${a}: ${r.status}`); }
    noErrors(bad);
    assert(assets.length > 40, `${assets.length} assets`);
  });
  test('every module reachable from js/app.js is precached', async () => {
    const { assets } = await swAssets();
    const graph = await moduleGraph();
    assert(graph.length > 20, `${graph.length} modules found`);
    noErrors(graph.filter(m => !assets.includes(m)).map(m => `${m} not precached`));
  });
  test('every data file, font, stylesheet and GSAP are precached; tests are not', async () => {
    const { assets } = await swAssets();
    const html = await fetch('./index.html').then(r => r.text());
    const css = [...html.matchAll(/href="(\.\/css\/[^"]+)"/g)].map(m => m[1]);
    const fonts = [...(await Promise.all(css.map(c => fetch(c).then(r => r.text())))).join('').matchAll(/\.\.\/fonts\/([^'")]+)/g)].map(m => './fonts/' + m[1]);
    const need = [...css, ...new Set(fonts), './vendor/gsap.min.js', './index.html', './manifest.webmanifest',
      ...['enums', 'exercises', 'warmups', 'foods', 'meal-templates', 'glossary', 'i18n/en', 'i18n/id'].map(n => `./data/${n}.json`)];
    noErrors(need.filter(n => !assets.includes(n)).map(n => `${n} not precached`));
    eq(assets.filter(a => a.includes('/tests/')), []);
  });
  test('the cache name changes with the content (VERSION is a content hash)', async () => {
    const { version, src } = await swAssets();
    assert(/^[0-9a-f]{12}$/.test(version), version);
    assert(src.includes('gym-app-${VERSION}'), 'cache named after VERSION');
  });
  test('installing a new version fetches fresh files, bypassing the browser HTTP cache', async () => {
    const { src } = await swAssets();
    assert(/addAll\(ASSETS\.map\(u => new Request\(u, \{ cache: 'reload' \}\)\)\)/.test(src), 'install uses cache: reload');
  });
  test('registration is skipped in the single-file build (inline data present)', async () => {
    const src = await fetch('./js/app.js').then(r => r.text());
    assert(/serviceWorker[\s\S]{0,200}getElementById\('data-enums'\)/.test(src), 'app.js guards registration');
  });
});

suite('Release notice: personal project, not professionally reviewed', () => {
  test('the statement exists in both languages and says it is unreviewed and for personal use', async () => {
    const errors = [];
    for (const [lang, words] of [['en', /personal project[\s\S]*not been reviewed[\s\S]*own risk/i], ['id', /proyek pribadi[\s\S]*belum ditinjau[\s\S]*risiko sendiri/i]]) {
      const s = await fetch(`./data/i18n/${lang}.json`).then(r => r.json());
      if (!words.test(s.onboarding.welcome.disclaimer)) errors.push(`${lang}: onboarding statement`);
      if (!words.test(Object.values(s.settings.about).join(' '))) errors.push(`${lang}: Settings → About`);
    }
    noErrors(errors);
  });
  test('the first onboarding screen and Settings show it', async () => {
    const [onb, set] = await Promise.all(['onboarding', 'settings'].map(f => fetch(`./js/views/${f}.js`).then(r => r.text())));
    assert(onb.includes("t('onboarding.welcome.disclaimer')"), 'onboarding welcome');
    assert(set.includes("'settings.about.title'") && set.includes("['personal', 'reviewed', 'data', 'risk', 'storage']"), 'settings about');
  });
});
