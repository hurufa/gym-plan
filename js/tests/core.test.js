// tests/core.test.js
// Phase 2 checks: state schema/migration, local dates, export/import (replace and merge),
// i18n key parity and date format, loadData (inline and fetch), router, profile diff, reminders.

import { suite, test, assert, eq } from './harness.js';
import * as st from '../state.js';
import { loadData, clearDataCache } from '../data.js';
import { setLang, t, formatDate } from '../i18n.js';
import { parseHash } from '../router.js';
import { changedFields, TRAINING_FIELDS, BODY_FIELDS } from '../views/onboarding.js';
import { needsBackupReminder } from '../views/home.js';

// In-memory Storage stand-in so tests never touch the app's real localStorage key.
function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const rec = (id, updatedAt, extra = {}) => ({ id, updatedAt, ...extra });

suite('State: schema and migration', () => {
  test('a fresh state has schemaVersion 1 and every collection as an empty array', () => {
    const s = st.defaultState();
    eq(s.schemaVersion, 1);
    for (const c of st.COLLECTIONS) eq(s[c], [], c);
  });
  test('version 0 data (no schemaVersion) migrates to v1 and keeps the profile', () => {
    const s = st.migrate({ profile: { goal: 'lose-fat' }, settings: { lang: 'id' } });
    eq(s.schemaVersion, 1);
    eq(s.profile.goal, 'lose-fat');
    eq(s.settings.lang, 'id');
    eq(s.settings.theme, 'system', 'missing settings get defaults');
    assert(Array.isArray(s.workouts));
  });
  test('data from a newer schema is rejected', () => {
    let threw = false;
    try { st.migrate({ schemaVersion: 99 }); } catch { threw = true; }
    assert(threw);
  });
  test('save then load through storage returns the same data', () => {
    const mem = memoryStorage();
    st.useStorage(mem);
    st.load();
    st.update(s => { s.profile = { goal: 'get-stronger', updatedAt: 1 }; });
    st.useStorage(mem);
    eq(st.load().profile.goal, 'get-stronger');
  });
  test('upsertRecord adds id and updatedAt; deleteRecord removes it', () => {
    st.useStorage(memoryStorage());
    st.load();
    const r = st.upsertRecord('bodyweights', { date: '2026-11-17', kg: 70 });
    assert(/^[0-9a-f-]{36}$/.test(r.id), 'uuid');
    assert(typeof r.updatedAt === 'number');
    eq(st.getState().bodyweights.length, 1);
    st.upsertRecord('bodyweights', { ...r, kg: 69.5 });
    eq(st.getState().bodyweights.length, 1, 'same id updates in place');
    eq(st.getState().bodyweights[0].kg, 69.5);
    st.deleteRecord('bodyweights', r.id);
    eq(st.getState().bodyweights.length, 0);
  });
});

suite('Dates', () => {
  test('localDate uses local date parts (06:00 local stays on that day)', () => {
    eq(st.localDate(new Date(2026, 10, 17, 6, 0)), '2026-11-17');
    eq(st.localDate(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
  });
  test('UTC+7: a session at 06:00 local lands on the local date, not the UTC date', () => {
    const d = new Date('2026-11-16T23:00:00Z'); // 06:00 on 17 Nov in UTC+7
    if (d.getTimezoneOffset() !== -420) {
      // The trap only shows when the machine runs in UTC+7; elsewhere check the general rule.
      eq(st.localDate(d), `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      return;
    }
    eq(d.toISOString().slice(0, 10), '2026-11-16', 'toISOString gives the UTC (wrong) day');
    eq(st.localDate(d), '2026-11-17');
  });
  test('parseLocalDate round-trips with localDate', () => eq(st.localDate(st.parseLocalDate('2026-03-09')), '2026-03-09'));
  test('formatDate gives "13 November 2026" in both languages', () => {
    eq(formatDate('2026-11-13', 'en'), '13 November 2026');
    eq(formatDate('2026-11-13', 'id'), '13 November 2026');
    eq(formatDate('2026-06-01', 'id'), '1 Juni 2026');
    eq(formatDate(new Date(2026, 7, 17), 'en'), '17 August 2026');
  });
  test('export file name uses the local date', () => eq(st.exportFileName(new Date(2026, 10, 17, 6)), 'gym-data-2026-11-17.json'));
});

suite('Export and import', () => {
  const sample = () => {
    const s = st.defaultState();
    s.profile = { goal: 'build-muscle', days: 4, updatedAt: 1000 };
    s.workouts = [rec('w1', 100, { date: '2026-11-10', sets: [{ reps: 8, kg: 60 }] }), rec('w2', 200, { date: '2026-11-12' })];
    s.bodyweights = [rec('b1', 150, { date: '2026-11-10', kg: 72.4 })];
    s.lastExportAt = 5;
    return s;
  };
  test('Replace all on a cleared app restores identical data', () => {
    st.useStorage(memoryStorage());
    const original = st.replaceState(sample());
    const file = st.exportData(original);
    st.clearAll();
    eq(st.getState().workouts.length, 0, 'cleared');
    const v = st.validateImport(file);
    assert(v.ok, 'valid: ' + v.errors.join(','));
    st.applyImport(v.data, 'replace');
    eq(st.getState(), original);
  });
  test('Merge keeps the newer record, keeps local-only and adds file-only records', () => {
    const mine = sample();
    mine.workouts = [rec('a', 100, { v: 'mine-old' }), rec('b', 300, { v: 'mine-new' }), rec('only-mine', 1)];
    const theirs = st.defaultState();
    theirs.workouts = [rec('a', 200, { v: 'theirs-new' }), rec('b', 250, { v: 'theirs-old' }), rec('only-theirs', 1)];
    const m = st.mergeStates(mine, theirs);
    const byId = Object.fromEntries(m.workouts.map(r => [r.id, r]));
    eq(byId.a.v, 'theirs-new');
    eq(byId.b.v, 'mine-new');
    assert(byId['only-mine'] && byId['only-theirs']);
    eq(m.workouts.length, 4);
  });
  test('Merge picks the profile with the newer updatedAt', () => {
    const mine = sample();
    const theirs = st.defaultState();
    theirs.profile = { goal: 'lose-fat', updatedAt: 2000 };
    eq(st.mergeStates(mine, theirs).profile.goal, 'lose-fat');
    theirs.profile.updatedAt = 10;
    eq(st.mergeStates(mine, theirs).profile.goal, 'build-muscle');
  });
  test('preview counts added / changed / unchanged / removed', () => {
    const mine = sample();
    const theirs = structuredClone(mine);
    theirs.workouts[0] = { ...theirs.workouts[0], updatedAt: 999, note: 'edited' };
    theirs.workouts.push(rec('w3', 50));
    theirs.bodyweights = [];
    const merge = st.previewImport(mine, theirs, 'merge').rows.find(r => r.collection === 'workouts');
    eq([merge.added, merge.updated, merge.unchanged], [1, 1, 1]);
    const replaceBw = st.previewImport(mine, theirs, 'replace').rows.find(r => r.collection === 'bodyweights');
    eq(replaceBw.removed, 1);
  });
  test('import rejects non-JSON, foreign JSON and damaged records', () => {
    eq(st.validateImport('not json').errors, ['notJson']);
    eq(st.validateImport('{"hello":1}').errors, ['notExport']);
    const bad = st.defaultState();
    bad.workouts = [{ date: '2026-01-01' }];
    eq(st.validateImport(JSON.stringify({ app: 'gym-app', data: bad })).errors, ['badRecord:workouts']);
    eq(st.validateImport(JSON.stringify({ app: 'gym-app', data: { schemaVersion: 50 } })).errors, ['newerVersion']);
  });
});

suite('i18n', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, p + k + '.') : [p + k]));
  test('id.json and en.json have the same keys', async () => {
    const [en, id] = await Promise.all([loadData('i18n/en'), loadData('i18n/id')]);
    const a = new Set(keys(en)), b = new Set(keys(id));
    const onlyEn = [...a].filter(k => !b.has(k)), onlyId = [...b].filter(k => !a.has(k));
    eq({ onlyEn, onlyId }, { onlyEn: [], onlyId: [] });
  });
  test('no empty strings in either language', async () => {
    for (const l of ['en', 'id']) {
      const data = await loadData('i18n/' + l);
      const flat = keys(data).filter(k => k.split('.').reduce((o, x) => o[x], data) === '');
      eq(flat, [], l);
    }
  });
  test('t() fills placeholders and switches language', async () => {
    await setLang('en');
    eq(t('common.stepOf', { n: 2, total: 9 }), 'Step 2 of 9');
    await setLang('id');
    eq(t('common.stepOf', { n: 2, total: 9 }), 'Langkah 2 dari 9');
    await setLang('en');
  });
});

suite('Data loading and routing', () => {
  test('loadData reads an inlined <script type="application/json"> block (single-file build)', async () => {
    const el = document.createElement('script');
    el.type = 'application/json';
    el.id = 'data-inline-probe';
    el.textContent = '{"ok":true,"text":"<\\/script> escaped"}';
    document.body.append(el);
    clearDataCache();
    eq(await loadData('inline-probe'), { ok: true, text: '</script> escaped' });
    el.remove();
  });
  test('loadData fetches ./data/<name>.json otherwise', async () => {
    clearDataCache();
    const en = await loadData('i18n/en');
    eq(en.nav.home, 'Home');
  });
  test('loadData rejects a missing file', async () => {
    let threw = false;
    try { await loadData('does-not-exist'); } catch { threw = true; }
    assert(threw);
  });
  test('parseHash splits route, params and query', () => {
    eq(parseHash('#/exercise/barbell-back-squat'), { name: 'exercise', params: ['barbell-back-squat'], query: {} });
    eq(parseHash('#/onboarding?edit=1'), { name: 'onboarding', params: [], query: { edit: '1' } });
    eq(parseHash(''), { name: '', params: [], query: {} });
  });
});

suite('Profile edits and reminders', () => {
  test('changedFields reports only fields that differ', () => {
    const a = { goal: 'lose-fat', days: 3, injuries: ['knee'], weightKg: 70 };
    eq(changedFields(a, { ...a, days: 4, injuries: ['knee'] }), ['days']);
    eq(changedFields(a, { ...a, weightKg: 69 }), ['weightKg']);
  });
  test('training and body fields do not overlap', () => eq(TRAINING_FIELDS.filter(f => BODY_FIELDS.includes(f)), []));
  test('backup reminder after 14 days without export', () => {
    const now = Date.UTC(2026, 10, 17);
    eq(needsBackupReminder({ lastExportAt: now - 15 * 864e5 }, now), true);
    eq(needsBackupReminder({ lastExportAt: now - 13 * 864e5 }, now), false);
    eq(needsBackupReminder({ lastExportAt: null, onboardedAt: now - 20 * 864e5 }, now), true);
  });
});
