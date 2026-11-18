// views/settings.js
// Settings: profile (edit via onboarding in edit mode), language, theme, rest-timer sound and
// vibration, and data: export to gym-data-YYYY-MM-DD.json, import (validate, preview, Replace all
// or Merge) and clear all data. downloadExport() is also used by the Home backup reminder.

import { getState, update, exportData, exportFileName, validateImport, previewImport, applyImport, clearAll } from '../state.js';
import { t, setLang, getLang, formatDate } from '../i18n.js';
import { esc, icon, toast, openSheet, confirmDialog } from '../ui.js';

export function downloadExport() {
  const name = exportFileName();
  const blob = new Blob([exportData()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  update(s => { s.lastExportAt = Date.now(); });
  toast(t('settings.exported', { file: name }));
}

const seg = (name, legend, options, current) => `<fieldset class="segmented"><legend>${esc(legend)}</legend>${options.map(([v, label]) =>
  `<label><input type="radio" name="${name}" value="${v}" ${v === current ? 'checked' : ''}>${esc(label)}</label>`).join('')}</fieldset>`;

export function render(root, ctx) {
  const s = getState();
  const p = s.profile;
  root.innerHTML = `
    <header class="page-head"><div class="stack-sm">
      <span class="eyebrow eyebrow--rule">${esc(t('settings.eyebrow'))}</span>
      <h1>${esc(t('settings.title'))}</h1></div></header>
    <div class="page stack-lg">
      <section class="stack">
        <h2>${esc(t('settings.profile'))}</h2>
        <div class="card stack-sm">
          <p>${esc(t('home.profileLine', { goal: t(`options.goal.${p.goal}.label`), days: p.days, length: p.sessionLength, equipment: t(`options.equipment.${p.equipment}.label`) }))}</p>
          <p class="muted small">${esc(t('options.experience.' + p.experience + '.label'))} · ${p.age} ${esc(t('onboarding.about.ageUnit'))} · ${p.heightCm} cm · ${p.weightKg} kg</p>
          <a class="btn btn--secondary" href="#/onboarding?edit=1">${esc(t('settings.editProfile'))}</a>
        </div>
      </section>

      <section class="stack">
        <div class="field"><span class="label">${esc(t('settings.language'))}</span>
          ${seg('lang', t('settings.language'), [['id', 'Bahasa Indonesia'], ['en', 'English']], getLang())}</div>
        <div class="field"><span class="label">${esc(t('settings.theme'))}</span>
          ${seg('theme', t('settings.theme'), [['system', t('settings.themeSystem')], ['light', t('settings.themeLight')], ['dark', t('settings.themeDark')]], s.settings.theme)}</div>
        <label class="toggle"><span>${esc(t('settings.sound'))}</span><input type="checkbox" name="sound" ${s.settings.sound ? 'checked' : ''}></label>
        <label class="toggle"><span>${esc(t('settings.vibration'))}</span><input type="checkbox" name="vibration" ${s.settings.vibration ? 'checked' : ''}></label>
      </section>

      <section class="stack">
        <h2>${esc(t('settings.data'))}</h2>
        <p class="muted">${esc(t('settings.dataHint'))}</p>
        <p class="small">${esc(s.lastExportAt ? t('settings.lastExport', { date: formatDate(new Date(s.lastExportAt)) }) : t('settings.neverExported'))}</p>
        <div class="row">
          <button class="btn btn--primary" data-export>${icon('download')}${esc(t('settings.export'))}</button>
          <label class="btn btn--secondary">${icon('upload')}${esc(t('settings.import'))}
            <input type="file" accept="application/json,.json" class="visually-hidden" data-import></label>
          <button class="btn btn--danger" data-clear>${icon('trash')}${esc(t('settings.clear'))}</button>
        </div>
        <div data-import-error></div>
      </section>
    </div>`;

  root.addEventListener('change', async e => {
    const el = e.target;
    if (el.name === 'lang') {
      await setLang(el.value);
      update(st => { st.settings.lang = el.value; st.settings.updatedAt = Date.now(); });
      ctx.rerender();
    } else if (el.name === 'theme') {
      update(st => { st.settings.theme = el.value; st.settings.updatedAt = Date.now(); });
      window.dispatchEvent(new Event('app:theme'));
    } else if (el.name === 'sound' || el.name === 'vibration') {
      update(st => { st.settings[el.name] = el.checked; st.settings.updatedAt = Date.now(); });
    } else if (el.matches('[data-import]') && el.files[0]) {
      await importFile(el.files[0], root, ctx);
      el.value = '';
    }
  });
  root.querySelector('[data-export]').addEventListener('click', () => { downloadExport(); ctx.rerender(); });
  root.querySelector('[data-clear]').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: t('settings.clearTitle'), body: `<p>${esc(t('settings.clearBody'))}</p>`,
      confirm: t('settings.clearConfirm'), cancel: t('common.cancel'), danger: true, closeLabel: t('common.close') });
    if (!ok) return;
    clearAll();
    toast(t('settings.cleared'));
    location.hash = '#/onboarding';
  });
}

async function importFile(file, root, ctx) {
  const errBox = root.querySelector('[data-import-error]');
  errBox.innerHTML = '';
  const result = validateImport(await file.text());
  if (!result.ok) {
    const msgs = [...new Set(result.errors.map(e => e.split(':')[0]))].map(k => t('settings.importErrors.' + k));
    errBox.innerHTML = `<div class="notice notice--danger" role="alert">${icon('error')}<div><strong>${esc(t('settings.importFailed'))}</strong>${msgs.map(esc).join(' ')}</div></div>`;
    return;
  }
  const current = getState();
  const table = mode => {
    const pv = previewImport(current, result.data, mode);
    return `<h4 class="eyebrow eyebrow--rule">${esc(t('settings.' + mode))}</h4>
      <table class="table"><thead><tr><th>${esc(t('settings.colCollection'))}</th><th class="num">${esc(t('settings.colAdded'))}</th>
      <th class="num">${esc(t('settings.colUpdated'))}</th><th class="num">${esc(t('settings.colUnchanged'))}</th>${mode === 'replace' ? `<th class="num">${esc(t('settings.colRemoved'))}</th>` : ''}</tr></thead>
      <tbody>${pv.rows.map(r => `<tr><td>${esc(t('settings.collections.' + r.collection))}</td><td class="num">${r.added}</td><td class="num">${r.updated}</td><td class="num">${r.unchanged}</td>${mode === 'replace' ? `<td class="num">${r.removed}</td>` : ''}</tr>`).join('')}</tbody></table>
      ${pv.profileChanges ? `<p class="small">${esc(t('settings.profileWillChange'))}</p>` : ''}`;
  };
  const mode = await openSheet({
    title: t('settings.importTitle', { file: file.name }), closeLabel: t('common.close'),
    body: `<div class="stack"><p>${esc(t('settings.importIntro'))}</p>${table('merge')}${table('replace')}</div>`,
    actions: [
      { label: t('common.cancel'), value: '', variant: 'ghost' },
      { label: t('settings.merge'), value: 'merge', variant: 'secondary' },
      { label: t('settings.replace'), value: 'replace', variant: 'primary' },
    ],
  });
  if (mode !== 'merge' && mode !== 'replace') return;
  const next = applyImport(result.data, mode);
  if (next.settings.lang) await setLang(next.settings.lang);
  window.dispatchEvent(new Event('app:theme'));
  toast(t('settings.imported'));
  ctx.rerender();
}

