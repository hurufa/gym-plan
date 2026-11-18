// tests/progress.test.js
// Phase 9 checks: weekly sets from logged workouts (same counting rule as the planner), training
// days and weekly adherence, the weight trend's 7-day average, e1RM series, PRs recomputed from
// history (editing a workout changes them), manual workouts (shape, local date, acceptance 5 after a
// reload), record edit/delete, and the SVG charts (accessible title/desc, markers, hatch, table).

import { suite, test, assert, eq } from './harness.js';
import { loadData } from '../data.js';
import * as st from '../state.js';
import * as T from '../tracker.js';
import { countSets, groupMaps } from '../planner.js';
import { lineChart, barChart, heatmap, chartFigure, niceRange } from '../charts.js';

const data = async () => {
  const [exercises, enums] = await Promise.all([loadData('exercises'), loadData('enums')]);
  return { exercises, enums, exById: Object.fromEntries(exercises.map(e => [e.id, e])) };
};
const w = (date, exercises, extra = {}) => ({ id: date + Math.random(), updatedAt: 1, date, startedAt: 0, exercises, ...extra });
const memoryStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

suite('Progress: tracker numbers', () => {
  test('weekly sets from logged workouts use the planner rule (1 primary, 0.5 secondary) and skip skipped exercises', async () => {
    const d = await data();
    const { groupOf, groups } = groupMaps(d.enums);
    const sets = n => Array.from({ length: n }, () => ({ reps: 8, kg: 60 }));
    const list = [w('2026-11-16', [{ exerciseId: 'barbell-bench-press', sets: sets(3) }]), w('2026-11-18', [{ exerciseId: 'barbell-bench-press', sets: sets(2) }, { exerciseId: 'barbell-back-squat', sets: sets(4), skipped: true }]),
      w('2026-11-23', [{ exerciseId: 'barbell-bench-press', sets: sets(5) }])];
    const got = T.loggedWeeklySets(list, '2026-11-16', d.exById, countSets, groupOf, groups);
    const expected = countSets([{ exerciseId: 'barbell-bench-press', sets: 5 }], d.exById, groupOf, groups);
    eq(got, expected);
    assert(got.chest === 5 && got.quads === 0, JSON.stringify(got));
  });
  test('training days and weekly adherence (oldest first, current week last)', () => {
    const list = [w('2026-11-16', []), w('2026-11-16', []), w('2026-11-18', []), w('2026-11-10', [])];
    eq(T.trainingDays(list), { '2026-11-16': 2, '2026-11-18': 1, '2026-11-10': 1 });
    const a = T.weeklyAdherence(list, 3, 3, new Date(2026, 10, 19));
    eq(a.map(x => [x.start, x.done, x.current]), [['2026-11-02', 0, false], ['2026-11-09', 1, false], ['2026-11-16', 3, true]]);
  });
  test('weight trend: 7-day moving average over the weigh-ins in the 7 days ending on each date', () => {
    const ws = [['2026-11-01', 60], ['2026-11-03', 61], ['2026-11-07', 59], ['2026-11-08', 58]].map(([date, kg], i) => ({ id: 'w' + i, date, kg }));
    eq(T.weightTrend(ws).map(x => x.avg), [60, 60.5, 60, 59.33]);
  });
  test('e1RM series per session (Epley, best set of 1-10 reps), dated', () => {
    const list = [w('2026-11-10', [{ exerciseId: 'barbell-back-squat', sets: [{ reps: 5, kg: 100 }, { reps: 12, kg: 90 }] }]), w('2026-11-17', [{ exerciseId: 'barbell-back-squat', sets: [{ reps: 3, kg: 110 }] }])];
    eq(T.e1rmSeries(list, 'barbell-back-squat'), [{ date: '2026-11-10', e1rm: 116.7 }, { date: '2026-11-17', e1rm: 121 }]);
  });
  test('PRs are recomputed from the history, so editing an earlier workout changes them', async () => {
    const d = await data();
    const a = w('2026-11-10', [{ exerciseId: 'barbell-back-squat', sets: [{ reps: 5, kg: 100 }] }]);
    const b = w('2026-11-17', [{ exerciseId: 'barbell-back-squat', sets: [{ reps: 5, kg: 105 }] }]);
    eq(T.allPRs([b, a], d.exById).map(p => p.type).sort(), ['e1rm', 'heaviest']);
    a.exercises[0].sets[0].kg = 110; // edit: the earlier workout was heavier after all
    eq(T.allPRs([a, b], d.exById), []);
  });
  test('loggedLifts lists weighted exercises only, most logged first', async () => {
    const d = await data();
    const list = [w('2026-11-10', [{ exerciseId: 'push-up', sets: [{ reps: 10, kg: null }] }, { exerciseId: 'barbell-back-squat', sets: [{ reps: 5, kg: 100 }] }]),
      w('2026-11-12', [{ exerciseId: 'barbell-bench-press', sets: [{ reps: 5, kg: 60 }] }]), w('2026-11-14', [{ exerciseId: 'barbell-bench-press', sets: [{ reps: 5, kg: 60 }] }])];
    eq(T.loggedLifts(list, d.exById), ['barbell-bench-press', 'barbell-back-squat']);
  });
});

suite('Progress: manual logging and records', () => {
  test('a manual workout has the session record shape, drops empty sets and computes volume', () => {
    const r = T.manualWorkout({ id: 'x', date: '2026-11-18', durationMin: 45, exercises: [{ exerciseId: 'barbell-back-squat', sets: [{ reps: '8', kg: '60', rir: '2' }, { reps: '', kg: '60', rir: '' }] }, { exerciseId: '', sets: [] }] }, 5);
    eq([r.date, r.manual, r.durationSec, r.exercises.length, r.exercises[0].sets, r.volumeKg, r.updatedAt], ['2026-11-18', true, 2700, 1, [{ reps: 8, kg: 60, rir: 2 }], 480, 5]);
    eq(T.exerciseHistory([r], 'barbell-back-squat')[0].sets[0], { reps: 8, kg: 60, rir: 2 });
  });
  test('acceptance 5: a workout logged at 06:00 local keeps its local date; after a reload it is still there for Progress', () => {
    const at6 = new Date(2026, 10, 17, 6, 0);
    const date = st.localDate(at6);
    eq(date, '2026-11-17');
    const mem = memoryStorage();
    st.useStorage(mem);
    const s = st.defaultState();
    s.workouts.push(T.manualWorkout({ id: 'm1', date, durationMin: 50, exercises: [{ exerciseId: 'barbell-back-squat', sets: [{ reps: 5, kg: 80 }] }] }));
    st.replaceState(s);
    st.useStorage(mem);
    const back = st.load();
    eq([back.workouts.length, back.workouts[0].date, T.trainingDays(back.workouts)['2026-11-17']], [1, '2026-11-17', 1]);
  });
  test('weights, measurements, meal check-offs and notes are records with id and updatedAt, editable and deletable', () => {
    const mem = memoryStorage();
    st.useStorage(mem);
    st.replaceState(st.defaultState());
    for (const [c, rec] of [['bodyweights', { date: '2026-11-18', kg: 70 }], ['measurements', { date: '2026-11-18', waistCm: 80 }], ['meals', { date: '2026-11-18', status: 'partly' }], ['notes', { date: '2026-11-18', text: 'Slept badly' }]]) {
      const saved = st.upsertRecord(c, rec);
      assert(saved.id && saved.updatedAt, `${c} has id and updatedAt`);
      st.upsertRecord(c, { ...saved, date: '2026-11-17' });
      eq([st.getState()[c].length, st.getState()[c][0].date], [1, '2026-11-17'], `${c} edited in place`);
      st.deleteRecord(c, saved.id);
      eq(st.getState()[c].length, 0, `${c} deleted`);
    }
  });
});

suite('Charts', () => {
  const parse = s => new DOMParser().parseFromString(s, 'image/svg+xml').documentElement;
  test('line chart: role img, title and desc referenced, one marker per point, dashed second line', () => {
    const svg = parse(lineChart({ title: 'Weight', desc: '3 weigh-ins', series: [
      { points: [{ x: '2026-11-01', y: 60 }, { x: '2026-11-02', y: 61 }, { x: '2026-11-04', y: 59 }], marker: 'circle', color: 3 },
      { points: [{ x: '2026-11-01', y: 60 }, { x: '2026-11-04', y: 60 }], line: true, dash: true, marker: 'square', color: 2 }] }));
    eq(svg.getAttribute('role'), 'img');
    const [tid, did] = svg.getAttribute('aria-labelledby').split(' ');
    eq([svg.querySelector(`[id="${tid}"]`).textContent, svg.querySelector(`[id="${did}"]`).textContent], ['Weight', '3 weigh-ins']);
    eq([svg.querySelectorAll('circle').length, svg.querySelectorAll('.chart-marks rect').length, svg.querySelectorAll('.chart-line--dash').length], [3, 2, 1]);
  });
  test('every marker shape produces valid path data (no string concatenation)', () => {
    const svg = lineChart({ title: 'a', desc: 'b', series: ['circle', 'square', 'diamond'].map((m, i) => ({ points: [{ x: '2026-11-01', y: 10 + i }, { x: '2026-11-08', y: 12 + i }], marker: m, line: true })) });
    // The bug this guards against: "52.0" + 4.5 gave "52.04.5", a number glued to another.
    const bad = [...svg.matchAll(/ d="([^"]+)"/g)].map(m => m[1]).filter(d => /\d\.\d+\.\d/.test(d));
    eq(bad, []);
  });
  test('line chart with a single point or no data still renders', () => {
    assert(parse(lineChart({ title: 'a', desc: 'b', series: [{ points: [{ x: '2026-11-01', y: 5 }] }] })).querySelector('circle'));
    eq(parse(lineChart({ title: 'a', desc: 'b', series: [] })).querySelectorAll('circle').length, 0);
  });
  test('bar chart: under-target bars are hatched (not colour only), targets drawn as marks', () => {
    const svg = parse(barChart({ title: 'Sets', desc: 'd', bars: [{ label: 'Chest', value: 4, target: 10, pattern: true }, { label: 'Back', value: 12, target: 10 }] }));
    eq([svg.querySelectorAll('pattern').length, svg.querySelectorAll('rect[style*="url(#"]').length, svg.querySelectorAll('.chart-target').length], [1, 1, 2]);
  });
  test('heatmap: one square per past day, filled when trained, today outlined', () => {
    const svg = parse(heatmap({ title: 'Days', desc: 'd', days: { '2026-11-16': 1, '2026-11-18': 2 }, weeks: ['2026-11-09', '2026-11-16'], today: '2026-11-18', dayLabels: 'M,T,W,T,F,S,S'.split(',') }));
    eq([svg.querySelectorAll('rect.heat').length, svg.querySelectorAll('.heat--on').length, svg.querySelectorAll('.heat--today').length], [10, 2, 1]);
  });
  test('figure: the data-table button toggles the table and aria-expanded', () => {
    const host = document.createElement('div');
    host.innerHTML = chartFigure({ svg: '<svg></svg>', table: { head: ['Date', 'kg'], rows: [['1 Nov', '60']] }, showLabel: 'Show', hideLabel: 'Hide' });
    document.body.append(host);
    const b = host.querySelector('[data-chart-table]'), tbl = host.querySelector('.table-wrap');
    eq([tbl.hidden, b.getAttribute('aria-expanded')], [true, 'false']);
    b.click();
    eq([tbl.hidden, b.getAttribute('aria-expanded'), b.textContent], [false, 'true', 'Hide']);
    host.remove();
  });
  test('axis ranges are rounded', () => eq(niceRange(57.1, 59.6), { min: 57, max: 60, step: 1 }));
});
