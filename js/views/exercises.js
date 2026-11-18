// views/exercises.js
// Exercise library (#/exercises): search by name or muscle, filter by muscle group, equipment and
// movement pattern, and optionally show only exercises the profile allows (equipment, level, areas
// to avoid). Filters persist for the browser session. Each result links to #/exercise/<id>.

import { getState } from '../state.js';
import { loadData } from '../data.js';
import { t, tx } from '../i18n.js';
import { esc } from '../ui.js';
import { blockReason } from '../planner.js';

const KEY = 'gym-app-library-filters';
const readFilters = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; } };
const saveFilters = f => { try { sessionStorage.setItem(KEY, JSON.stringify(f)); } catch { /* storage unavailable */ } };

export function filterExercises(exercises, enums, f, profile) {
  const groupOf = Object.fromEntries(enums.muscles.map(m => [m.id, m.group]));
  const names = Object.fromEntries(enums.muscles.map(m => [m.id, m.name]));
  const q = (f.q || '').trim().toLowerCase();
  return exercises.filter(e => {
    if (f.group && !e.primary.some(m => groupOf[m] === f.group)) return false;
    if (f.equipment && !e.equipment.includes(f.equipment)) return false;
    if (f.pattern && e.pattern !== f.pattern) return false;
    if (f.fitsMe && profile && blockReason(e, profile)) return false;
    if (q) {
      const hay = [e.name.en, e.name.id, ...[...e.primary, ...e.secondary].flatMap(m => [names[m]?.en, names[m]?.id])].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function render(root) {
  const profile = getState().profile;
  const f = readFilters() || { q: '', group: '', equipment: '', pattern: '', fitsMe: !!profile };
  root.innerHTML = `<div class="page"><p class="muted">…</p></div>`;
  Promise.all([loadData('exercises'), loadData('enums')]).then(([exercises, enums]) => {
    const opt = (list, cur) => `<option value="">${esc(t('library.all'))}</option>` + list.map(x => `<option value="${x.id}" ${cur === x.id ? 'selected' : ''}>${esc(tx(x.name))}</option>`).join('');
    root.innerHTML = `
      <header class="brand page-head"><div class="stack">
        <span class="eyebrow eyebrow--rule">${esc(t('library.eyebrow'))}</span>
        <h1 class="display-48">${esc(t('library.title'))} <span class="key">${esc(t('library.key'))}</span></h1>
      </div></header>
      <div class="page stack">
        <form class="lib-filters stack-sm" role="search" data-filters>
          <div class="field"><label for="lib-q">${esc(t('library.search'))}</label>
            <div class="input-wrap"><input id="lib-q" name="q" type="search" value="${esc(f.q)}" placeholder="${esc(t('library.searchPlaceholder'))}" autocomplete="off"></div></div>
          <div class="lib-selects">
            <div class="field"><label for="lib-group">${esc(t('library.muscle'))}</label><div class="input-wrap"><select id="lib-group" name="group">${opt(enums.groups, f.group)}</select></div></div>
            <div class="field"><label for="lib-eq">${esc(t('library.equipment'))}</label><div class="input-wrap"><select id="lib-eq" name="equipment">${opt(enums.equipment, f.equipment)}</select></div></div>
            <div class="field"><label for="lib-pat">${esc(t('library.pattern'))}</label><div class="input-wrap"><select id="lib-pat" name="pattern">${opt(enums.patterns, f.pattern)}</select></div></div>
          </div>
          ${profile ? `<label class="toggle"><span>${esc(t('library.fitsMe'))}<br><span class="small muted">${esc(t('library.fitsMeHint'))}</span></span><input type="checkbox" name="fitsMe" ${f.fitsMe ? 'checked' : ''}></label>` : ''}
          <div class="row" style="justify-content:space-between"><p class="small" data-count aria-live="polite"></p>
            <button type="button" class="btn btn--ghost" data-clear>${esc(t('library.clear'))}</button></div>
        </form>
        <ul role="list" class="lib-list" data-list></ul>
      </div>`;
    const form = root.querySelector('[data-filters]');
    const list = root.querySelector('[data-list]');
    const groupName = id => tx(enums.groups.find(g => g.id === id).name);
    const groupOf = Object.fromEntries(enums.muscles.map(m => [m.id, m.group]));
    const levelName = id => tx(enums.levels.find(l => l.id === id).name);
    const patName = id => tx(enums.patterns.find(p => p.id === id).name);
    const draw = () => {
      const cur = { q: form.q.value, group: form.group.value, equipment: form.equipment.value, pattern: form.pattern.value, fitsMe: !!form.fitsMe?.checked };
      saveFilters(cur);
      const res = filterExercises(exercises, enums, cur, profile);
      root.querySelector('[data-count]').textContent = t('library.count', { n: res.length });
      list.innerHTML = res.length ? res.map(e => {
        const groups = [...new Set(e.primary.map(m => groupOf[m]).filter(Boolean))].map(groupName).join(', ');
        return `<li><a class="card lib-item" href="#/exercise/${e.id}">
          <span class="lib-name">${esc(tx(e.name))}</span>
          <span class="small muted">${esc(groups || patName(e.pattern))} · ${esc(patName(e.pattern))}</span>
          <span class="badge badge--neutral">${esc(levelName(e.level))}</span></a></li>`;
      }).join('') : `<li><p class="muted">${esc(t('library.none'))}</p></li>`;
    };
    form.addEventListener('input', draw);
    form.addEventListener('change', draw);
    form.addEventListener('submit', e => e.preventDefault());
    root.querySelector('[data-clear]').addEventListener('click', () => {
      form.q.value = ''; form.group.value = ''; form.equipment.value = ''; form.pattern.value = '';
      if (form.fitsMe) form.fitsMe.checked = false;
      draw();
    });
    draw();
  });
}
