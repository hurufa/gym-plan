// app.js
// App shell: loads state and language, applies the theme, renders the navigation and routes
// hash URLs (#/, #/plan, #/exercise/<id>, #/onboarding?edit=1) to view modules in js/views/.
// A view exports render(root, ctx) and may return a cleanup function. After each render, glossary
// terms in the page become popover buttons (glossary.js).
// Other modules ask for a re-render with: window.dispatchEvent(new Event('app:rerender')).

import { getState, load } from './state.js';
import { setLang, detectLang, t } from './i18n.js';
import { icon, esc } from './ui.js';
import { pageIn } from './animations.js';
import { parseHash } from './router.js';
import { loadData } from './data.js';
import { setGlossary, linkTerms } from './glossary.js';
import * as home from './views/home.js';
import * as onboarding from './views/onboarding.js';
import * as settings from './views/settings.js';
import * as learn from './views/learn.js';
import * as plan from './views/plan.js';
import * as exercises from './views/exercises.js';
import * as exercise from './views/exercise.js';
import * as session from './views/session.js';
import * as nutrition from './views/nutrition.js';
import * as progress from './views/progress.js';

const ROUTES = {
  '': home,
  onboarding,
  settings,
  plan,
  exercises,
  exercise,
  session,
  nutrition,
  progress,
  learn,
};

const NAV = [
  ['', 'home', 'home'],
  ['plan', 'plan', 'plan'],
  ['exercises', 'exercises', 'dumbbell'],
  ['nutrition', 'nutrition', 'food'],
  ['progress', 'progress', 'chart'],
  ['learn', 'learn', 'book'],
  ['settings', 'settings', 'settings'],
];

export function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

const main = document.getElementById('main');
const nav = document.getElementById('nav');
let cleanup = null;
let firstRender = true;

function renderNav(active) {
  nav.setAttribute('aria-label', t('nav.label'));
  nav.innerHTML = `<div class="nav-brand">${esc(t('app.name'))}</div><ul>${NAV.map(([route, key, ic]) =>
    `<li><a href="#/${route}" ${route === active ? 'aria-current="page"' : ''}>${icon(ic)}<span>${esc(t('nav.' + key))}</span></a></li>`).join('')}</ul>`;
}

function route() {
  const s = getState();
  const r = parseHash();
  if (!s.profile && r.name !== 'onboarding') return location.replace('#/onboarding');
  if (s.profile && r.name === 'onboarding' && r.query.edit !== '1') return location.replace('#/');
  const view = ROUTES[r.name] ?? home;

  cleanup?.();
  const isOnboarding = r.name === 'onboarding';
  nav.hidden = isOnboarding;
  if (!isOnboarding) renderNav(r.name === 'exercise' ? 'exercises' : r.name === 'session' ? '' : (ROUTES[r.name] ? r.name : ''));
  main.innerHTML = '';
  const page = document.createElement('div');
  main.append(page);
  cleanup = view.render(page, { ...r, rerender: route }) || null;
  document.title = `${isOnboarding ? t('onboarding.label') : (r.name === 'session' ? t('summary.title') : t('nav.' + (NAV.find(n => n[0] === (r.name === 'exercise' ? 'exercises' : r.name))?.[1] || 'home')))} · ${t('app.name')}`;
  if (!firstRender) { main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  firstRender = false;
  pageIn(page);
  linkTerms(main);
}

// Views render some content after loading data; link glossary terms in that too. Throttled, not
// debounced, and SVG changes are ignored: the exercise figure redraws every frame, which would
// otherwise keep postponing the run forever.
let termTimer = null;
new MutationObserver(list => {
  if (termTimer || list.every(m => m.target.closest?.('svg') || m.target instanceof SVGElement)) return;
  termTimer = setTimeout(() => { termTimer = null; linkTerms(main); }, 60);
}).observe(main, { childList: true, subtree: true });

async function start() {
  const s = load();
  applyTheme(s.settings.theme);
  await setLang(s.settings.lang || detectLang());
  setGlossary(await loadData('glossary'));
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  // Skip link: move focus without touching the hash (the hash is the route).
  document.querySelector('.skip-link').addEventListener('click', e => { e.preventDefault(); main.focus(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(getState().settings.theme));
  addEventListener('hashchange', route);
  addEventListener('app:rerender', route);
  addEventListener('app:theme', () => applyTheme(getState().settings.theme));
  route();
  // Offline support (not in the single-file build, which inlines its data and runs from disk).
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !document.getElementById('data-enums')) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker not registered:', err.message));
  }
}

start().catch(err => {
  console.error(err);
  main.innerHTML = `<div class="page"><div class="notice notice--danger">${icon('error')}<div>${esc(err.message)}</div></div></div>`;
});
