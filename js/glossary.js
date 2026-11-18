// glossary.js
// Term popovers across the app. linkTerms(root) wraps the first mention of each glossary term on the
// page (aliases from data/glossary.json, current language) in a <button class="term">; tapping it
// opens a small popover with the short explanation and a link to the full entry in Learn.
// app.js runs linkTerms after every render (and when views add content later). Never links inside
// links, buttons, form controls, headings, charts, or anything marked [data-no-terms].

import { tx, getLang, t } from './i18n.js';
import { esc, popover, closePopover } from './ui.js';

let entries = [];
const byId = {};
export function setGlossary(list) {
  entries = list;
  for (const e of list) byId[e.id] = e;
  matchers = {};
}

// One matcher per language: aliases longest first. All-caps aliases (RIR, TDEE) match case-sensitively,
// the rest case-insensitively; both only as whole words (not inside "Rirs" or "deficits").
let matchers = {};
function matcherFor(lang) {
  if (matchers[lang]) return matchers[lang];
  const list = entries.flatMap(e => (e.aliases[lang] || []).map(a => ({ id: e.id, alias: a })))
    .sort((a, b) => b.alias.length - a.alias.length)
    .map(x => {
      const src = x.alias.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/\s+/g, '\\s+');
      const caps = x.alias === x.alias.toUpperCase() && /[A-Z]/.test(x.alias);
      return { ...x, re: new RegExp(`(?<![\\p{L}\\p{N}])${src}(?![\\p{L}\\p{N}])`, caps ? 'u' : 'iu') };
    });
  return (matchers[lang] = list);
}

const SKIP = 'a, button, input, select, textarea, label, option, svg, code, h1, .term, .page-head, [data-no-terms], .popover, .sheet, .toast-region, .tabs, nav';

export function linkTerms(root, lang = getLang()) {
  if (!entries.length || !root) return 0;
  const done = new Set([...root.querySelectorAll('.term[data-term]')].map(b => b.dataset.term));
  const list = matcherFor(lang).filter(m => !done.has(m.id));
  if (!list.length) return 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.nodeValue.trim().length > 2 && !n.parentElement.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let added = 0;
  for (let node of nodes) {
    for (;;) {
      // Earliest match in this text node among terms not yet linked on the page.
      let best = null;
      for (const m of list) {
        if (done.has(m.id)) continue;
        const r = m.re.exec(node.nodeValue);
        if (r && (!best || r.index < best.index || (r.index === best.index && r[0].length > best.text.length))) best = { id: m.id, index: r.index, text: r[0] };
      }
      if (!best) break;
      const after = node.splitText(best.index);
      const rest = after.splitText(best.text.length);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'term';
      b.dataset.term = best.id;
      b.setAttribute('aria-haspopup', 'dialog');
      b.setAttribute('aria-expanded', 'false');
      b.textContent = after.nodeValue;
      after.replaceWith(b);
      done.add(best.id);
      added++;
      node = rest;
    }
  }
  return added;
}

export function termPopoverHtml(id) {
  const e = byId[id];
  if (!e) return '';
  return `<p class="eyebrow">${esc(tx(e.term))}</p><p>${esc(tx(e.short))}</p>
    <p><a href="#/learn/${esc(id)}" data-learn-link>${esc(t('learn.readMore'))}</a></p>`;
}

document.addEventListener('click', e => {
  const b = e.target.closest('.term[data-term]');
  if (b) { popover(b, termPopoverHtml(b.dataset.term)); return; }
  if (e.target.closest('[data-learn-link]')) closePopover();
});
