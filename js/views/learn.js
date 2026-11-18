// views/learn.js
// Learn section: #/learn lists every glossary entry by topic with a search box (How muscles grow
// first); #/learn/<id> shows one entry: short answer, explanation, a worked example and related
// entries. Content comes from data/glossary.json. Terms are not auto-linked on these pages.

import { loadData } from '../data.js';
import { t, tx } from '../i18n.js';
import { esc, icon } from '../ui.js';

const GROUPS = ['training', 'plan', 'nutrition', 'recovery'];

export function render(root, ctx) {
  root.innerHTML = `<div class="page"><p class="muted">…</p></div>`;
  loadData('glossary').then(list => (ctx.params[0] ? entry(root, list, ctx.params[0]) : index(root, list)));
}

function index(root, list) {
  const featured = list.find(e => e.id === 'growth-mechanism');
  root.innerHTML = `
    <div data-no-terms>
    <header class="brand page-head"><div class="stack">
      <span class="eyebrow eyebrow--rule">${esc(t('learn.eyebrow'))}</span>
      <h1 class="display-48">${esc(t('learn.title'))} <span class="key">${esc(t('learn.titleKey'))}</span></h1>
      <p>${esc(t('learn.intro'))}</p>
    </div></header>
    <div class="page stack-lg">
      <a class="card card--accent stack-sm learn-feature" href="#/learn/${featured.id}">
        <span class="eyebrow">${esc(t('learn.start'))}</span><h2>${esc(tx(featured.term))}</h2><p>${esc(tx(featured.short))}</p></a>
      <div class="field"><label for="learn-q">${esc(t('learn.search'))}</label>
        <div class="input-wrap"><input id="learn-q" type="search" autocomplete="off"></div></div>
      <p class="small muted" data-count aria-live="polite"></p>
      ${GROUPS.map(g => `<section class="stack-sm" data-group="${g}"><h2>${esc(t('learn.groups.' + g))}</h2>
        <ul class="stack-sm" role="list">${list.filter(e => e.group === g && e.id !== 'growth-mechanism').map(e => `<li data-entry="${e.id}" data-text="${esc([tx(e.term), tx(e.short), ...Object.values(e.aliases).flat()].join(' ').toLowerCase())}">
          <a class="learn-item" href="#/learn/${e.id}"><strong>${esc(tx(e.term))}</strong><span class="small muted">${esc(tx(e.short))}</span></a></li>`).join('')}</ul></section>`).join('')}
    </div></div>`;
  const q = root.querySelector('#learn-q'), count = root.querySelector('[data-count]');
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    let n = 0;
    root.querySelectorAll('[data-entry]').forEach(li => { const show = !v || li.dataset.text.includes(v); li.hidden = !show; n += show; });
    root.querySelectorAll('[data-group]').forEach(s => { s.hidden = !s.querySelector('[data-entry]:not([hidden])'); });
    count.textContent = v ? t('learn.found', { n }) : '';
  });
}

function entry(root, list, id) {
  const e = list.find(x => x.id === id);
  if (!e) { location.replace('#/learn'); return; }
  const related = e.related.map(r => list.find(x => x.id === r)).filter(Boolean);
  root.innerHTML = `
    <div data-no-terms>
    <header class="brand page-head"><div class="stack">
      <span class="eyebrow eyebrow--rule">${esc(t('learn.groups.' + e.group))}</span>
      <h1 class="display-48">${esc(tx(e.term))}</h1>
    </div></header>
    <article class="page stack-lg learn-entry">
      <p class="lead">${esc(tx(e.short))}</p>
      ${tx(e.body).map(p => `<p>${esc(p)}</p>`).join('')}
      <div class="card stack-sm"><span class="eyebrow">${esc(t('learn.example'))}</span><p class="mono">${esc(tx(e.example))}</p></div>
      ${related.length ? `<section class="stack-sm"><h2>${esc(t('learn.related'))}</h2><ul class="stack-sm" role="list">${related.map(r =>
        `<li><a class="learn-item" href="#/learn/${r.id}"><strong>${esc(tx(r.term))}</strong><span class="small muted">${esc(tx(r.short))}</span></a></li>`).join('')}</ul></section>` : ''}
      <a class="btn btn--secondary" href="#/learn">${icon('back')}${esc(t('learn.all'))}</a>
    </article></div>`;
}
