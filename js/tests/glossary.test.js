// tests/glossary.test.js
// Phase 10 checks: glossary.json against its schema (every required term, both languages, unique
// aliases, valid related links), technical terms kept in English in Indonesian with an explanation,
// term linking (first mention only, whole words, case rules, never inside links/buttons/headers),
// the popover content, the Learn pages for every entry, and the growth-mechanism links.

import { suite, test, assert, eq, noErrors } from './harness.js';
import { loadData } from '../data.js';
import { validateGlossary, REQUIRED_TERMS } from '../schema.js';
import { setGlossary, linkTerms, termPopoverHtml } from '../glossary.js';
import { setLang, getLang } from '../i18n.js';
import * as learn from '../views/learn.js';

const glossary = () => loadData('glossary');
const box = html => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const linked = d => [...d.querySelectorAll('.term')].map(b => `${b.dataset.term}:${b.textContent}`);

suite('glossary.json', () => {
  test('validates: required terms, both languages, unique aliases, related links exist', async () => noErrors(validateGlossary(await glossary())));
  test(`covers the ${REQUIRED_TERMS.length} required terms`, async () => {
    const ids = (await glossary()).map(e => e.id);
    eq(REQUIRED_TERMS.filter(r => !ids.includes(r)), []);
  });
  test('technical terms stay in English in Indonesian, with a short Indonesian explanation', async () => {
    const list = await glossary();
    const errors = [];
    for (const [id, en] of [['progressive-overload', 'progressive overload'], ['rir', 'RIR'], ['rpe', 'RPE'], ['deload', 'Deload'], ['tdee', 'TDEE']]) {
      const e = list.find(x => x.id === id);
      if (!e.short.id.toLowerCase().includes(en.toLowerCase())) errors.push(`${id}: Indonesian short text does not use "${en}"`);
      if (!/\(|adalah|berarti/.test(e.short.id)) errors.push(`${id}: no Indonesian explanation`);
    }
    noErrors(errors);
  });
  test('the validator rejects a duplicate alias and a dangling related link', async () => {
    const list = structuredClone(await glossary());
    list[1].aliases.en.push(list[0].aliases.en[0]);
    list[2].related = ['nope'];
    const errs = validateGlossary(list);
    assert(errs.some(e => /used by/.test(e)) && errs.some(e => /"nope" does not exist/.test(e)), errs.join(' | '));
  });
});

suite('Term popovers', () => {
  const ready = async () => setGlossary(await glossary());
  test('links the first mention of each term only', async () => {
    await ready();
    const d = box('<p>Stop at RIR 2. Next set RIR 1.</p><p>Do a deload week; the deload halves sets.</p>');
    eq(linkTerms(d, 'en'), 2);
    eq(linked(d), ['rir:RIR', 'deload:deload']);
  });
  test('whole words only, and all-caps terms match case-sensitively', async () => {
    await ready();
    const d = box('<p>XRIR glued; RIRs plural; rir lowercase; TDEEs plural; BMR here.</p>');
    linkTerms(d, 'en');
    eq(linked(d), ['bmr:BMR']);
  });
  test('never inside links, buttons, labels, headings, header blocks or [data-no-terms]', async () => {
    await ready();
    const d = box('<a href="#">RIR</a><button>TDEE</button><label>BMR</label><h1>Deload</h1><header class="page-head"><p>macros</p></header><p data-no-terms>DOMS</p><p>Warm-up first.</p>');
    linkTerms(d, 'en');
    eq(linked(d), ['warm-up:Warm-up']);
  });
  test('Indonesian aliases; a second run adds nothing', async () => {
    await ready();
    const d = box('<p>Lakukan pemanasan, lalu set ramp-up. Tidur cukup.</p>');
    eq(linkTerms(d, 'id'), 3);
    eq(linkTerms(d, 'id'), 0);
    eq(linked(d), ['warm-up:pemanasan', 'ramp-up-sets:set ramp-up', 'sleep-recovery:Tidur']);
  });
  test('the term is a button with aria-haspopup; the popover has the summary and a Learn link', async () => {
    await ready();
    const d = box('<p>Watch your TDEE.</p>');
    linkTerms(d, 'en');
    const b = d.querySelector('.term');
    eq([b.tagName, b.type, b.getAttribute('aria-haspopup')], ['BUTTON', 'button', 'dialog']);
    const pop = box(termPopoverHtml('tdee'));
    assert(pop.querySelector('a[href="#/learn/tdee"]') && pop.textContent.length > 60, pop.innerHTML);
  });
});

suite('Learn section', () => {
  const view = async (params, lang = 'en') => {
    const before = getLang();
    await setLang(lang);
    const root = document.createElement('div');
    learn.render(root, { params, query: {} });
    for (let i = 0; i < 40 && root.textContent.trim() === '…'; i++) await new Promise(r => setTimeout(r, 25));
    await setLang(before);
    return root;
  };
  test('the index lists every entry (How muscles grow featured first)', async () => {
    const root = await view([]);
    const list = await glossary();
    eq(root.querySelectorAll('[data-entry]').length + 1, list.length);
    eq(root.querySelector('.learn-feature').getAttribute('href'), '#/learn/growth-mechanism');
  });
  test('every entry page renders its explanation, example and related links, in both languages', async () => {
    const errors = [];
    for (const e of await glossary()) for (const lang of ['en', 'id']) {
      const root = await view([e.id], lang);
      if (!root.querySelector('h1')?.textContent.includes(e.term[lang])) errors.push(`${e.id} ${lang}: title`);
      if (root.querySelectorAll('.learn-entry > p').length < 1 + e.body[lang].length) errors.push(`${e.id} ${lang}: body`);
      if (!root.textContent.includes(e.example[lang])) errors.push(`${e.id} ${lang}: example`);
      if (root.querySelectorAll('.learn-entry section a').length !== e.related.length) errors.push(`${e.id} ${lang}: related`);
    }
    noErrors(errors);
  });
  test('"What this builds" sections link to How muscles grow (exercise page, plan sessions, home)', async () => {
    const errors = [];
    for (const f of ['exercise', 'plan', 'home']) {
      const src = await fetch(`./js/views/${f}.js`).then(r => r.text());
      if (!src.includes('#/learn/growth-mechanism')) errors.push(f);
    }
    noErrors(errors);
  });
});
