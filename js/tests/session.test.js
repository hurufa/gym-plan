// tests/session.test.js
// Phase 6 checks: session creation from the queue, load prefill and progression, set logging, the
// timestamp-based rest timer and elapsed time, skip and swap, finishing (saved record, queue, volume),
// surviving a reload, PR detection, e1RM history feeding the deload rule, the weekly streak, and
// acceptance criterion 5 (logged data survives a reload; a 06:00 UTC+7 session lands on its local date).

import { suite, test, assert, eq } from './harness.js';
import { loadData } from '../data.js';
import * as st from '../state.js';
import * as S from '../session.js';
import { generatePlan, deloadSuggestion } from '../planner.js';
import { detectPRs, exerciseHistory, e1rmHistory, streak, weekStart } from '../tracker.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const data = async () => {
  const [exercises, enums] = await Promise.all([loadData('exercises'), loadData('enums')]);
  return { exercises, enums, warmups: [], exById: Object.fromEntries(exercises.map(e => [e.id, e])) };
};
const PROFILE = { goal: 'build-muscle', days: 4, equipment: 'full-gym', experience: 'intermediate', sessionLength: 60, injuries: [], pullupBar: true, bands: true };
async function fresh() {
  const d = await data();
  const s = st.defaultState();
  s.profile = { ...PROFILE };
  s.plan = generatePlan(s.profile, d);
  return { d, s };
}
const T0 = new Date(2026, 10, 17, 6, 0).getTime(); // 06:00 local time

suite('Session: create and log', () => {
  test('the next session in the queue becomes the active session, with every planned exercise', async () => {
    const { d, s } = await fresh();
    const a = S.createSession(s, d, T0);
    const planned = s.plan.sessions[0].exercises.filter(e => e.exerciseId && e.sets > 0);
    eq(a.items.map(i => [i.exerciseId, i.sets.length]), planned.map(e => [e.exerciseId, e.sets]));
    eq(a.items[0].ramp.length, planned[0].rampUps.length, 'ramp-up sets carried over');
  });
  test('first time on an exercise: no prefilled load and the "start light" flag', async () => {
    const { d, s } = await fresh();
    const it = S.createSession(s, d, T0).items[0];
    eq([it.suggestion.firstTime, it.sets[0].kg], [true, null]);
  });
  test('acceptance 5: a session started at 06:00 local time is dated that local day', async () => {
    const { d, s } = await fresh();
    eq(S.createSession(s, d, T0).date, '2026-11-17');
    if (new Date(T0).getTimezoneOffset() === -420) eq(new Date(T0).toISOString().slice(0, 10), '2026-11-16', 'the UTC date would be wrong');
  });
  test('logging a set starts the rest timer (middle of the rest range) from the timestamp', async () => {
    const { d, s } = await fresh();
    const a = S.createSession(s, d, T0);
    S.logSet(a, 0, 0, { reps: 8, kg: 60, rir: 2 }, T0 + 60000);
    const total = S.restSeconds(a.items[0].target);
    eq(a.rest.total, total);
    eq(S.restRemaining(a, T0 + 60000 + 30000), total - 30);
    eq(S.restRemaining(a, T0 + 60000 + total * 1000 + 5000), 0);
    S.addRest(a, 30, T0 + 61000);
    eq(S.restRemaining(a, T0 + 61000), total + 29);
  });
  test('elapsed time is computed from the start timestamp (correct after a locked phone)', async () => {
    const { d, s } = await fresh();
    eq(S.elapsedSec(S.createSession(s, d, T0), T0 + 125500), 125);
  });
  test('the active session survives a reload (saved to storage and read back)', async () => {
    const { d, s } = await fresh();
    const mem = memoryStorage();
    st.useStorage(mem);
    st.replaceState(s);
    st.update(x => { x.activeSession = S.createSession(x, d, T0); S.logSet(x.activeSession, 0, 0, { reps: 9, kg: 62.5, rir: 1 }, T0 + 1000); });
    const before = JSON.stringify(st.getState().activeSession);
    st.useStorage(mem);
    eq(JSON.stringify(st.load().activeSession), before);
  });
  test('skip moves on; swap changes only this session, keeping the slot', async () => {
    const { d, s } = await fresh();
    const a = S.createSession(s, d, T0);
    S.skipItem(a, 0);
    eq([a.items[0].skipped, a.index], [true, 1]);
    const old = a.items[1];
    S.swapItem(a, 1, 'one-arm-dumbbell-row', d, s.workouts, s.profile);
    eq([a.items[1].exerciseId, a.items[1].slotId, a.items[1].swappedFrom], ['one-arm-dumbbell-row', old.slotId, old.exerciseId]);
    eq(s.plan.sessions[0].exercises[1].exerciseId, old.exerciseId, 'plan unchanged');
  });
});

suite('Session: finish, history and progression', () => {
  async function logged(kg = 60, reps = 10) {
    const { d, s } = await fresh();
    s.activeSession = S.createSession(s, d, T0);
    s.activeSession.items[0].sets.forEach((_, j) => S.logSet(s.activeSession, 0, j, { reps, kg, rir: 2 }, T0 + (j + 1) * 60000));
    const rec = S.finishSession(s, d, T0 + 3600000);
    return { d, s, rec };
  }
  test('finishing saves the workout, advances the queue and clears the active session', async () => {
    const { s, rec } = await logged();
    eq([s.workouts.length, s.queueIndex, s.activeSession], [1, 1, null]);
    eq([rec.date, rec.durationSec], ['2026-11-17', 3600]);
    eq(rec.volumeKg, 60 * 10 * rec.exercises[0].sets.length);
    assert(rec.exercises.slice(1).every(x => x.skipped), 'untouched exercises are kept as skipped');
  });
  test('the record matches the shape the exercise page reads (exercises[].sets[] = { reps, kg, rir })', async () => {
    const { rec } = await logged();
    const h = exerciseHistory([rec], rec.exercises[0].exerciseId);
    eq([h.length, h[0].date, h[0].sets[0]], [1, '2026-11-17', { reps: 10, kg: 60, rir: 2 }]);
  });
  test('acceptance 5: a logged workout is still there after a reload', async () => {
    const { s } = await logged();
    const mem = memoryStorage();
    st.useStorage(mem);
    st.replaceState(s);
    st.useStorage(mem);
    const reread = st.load();
    eq([reread.workouts.length, reread.workouts[0].exercises[0].sets.length], [1, s.workouts[0].exercises[0].sets.length]);
  });
  test('next time: top of the range at target RIR raises the load (+2.5 kg upper body)', async () => {
    const { d, s } = await logged(60, 10);
    s.queueIndex = 0;
    const it = S.createSession(s, d, T0 + 7 * 864e5).items[0];
    eq([it.suggestion.action, it.sets[0].kg], ['increase-load', 62.5]);
  });
  test('next time: below the top keeps the load and asks for more reps', async () => {
    const { d, s } = await logged(60, 7);
    s.queueIndex = 0;
    const it = S.createSession(s, d, T0 + 7 * 864e5).items[0];
    eq([it.suggestion.action, it.sets[0].kg], ['add-reps', 60]);
  });
  test('discarding keeps the queue where it was', async () => {
    const { d, s } = await fresh();
    s.activeSession = S.createSession(s, d, T0);
    S.discardSession(s);
    eq([s.activeSession, s.queueIndex ?? 0, s.workouts.length], [null, 0, 0]);
  });
  test('a deload session halves the sets', async () => {
    const { d, s } = await fresh();
    const normal = S.createSession(s, d, T0), deload = S.createSession(s, d, T0, { deload: true });
    eq(deload.items.map(i => i.sets.length), normal.items.map(i => Math.ceil(i.sets.length / 2)));
    assert(deload.items.every(i => i.target.rir[0] >= 4), 'RIR 4+');
  });
});

suite('PR detection', () => {
  const ex = (over = {}) => ({ id: 'x', bodyweight: false, patternParams: { implement: 'barbell' }, ...over });
  const prev = [{ reps: 8, kg: 60 }, { reps: 6, kg: 65 }];
  test('first time on an exercise: no PRs (baseline)', () => eq(detectPRs(ex(), [{ reps: 10, kg: 100 }], []), []));
  test('heaviest load', () => {
    const r = detectPRs(ex(), [{ reps: 3, kg: 70 }], prev);
    assert(r.some(p => p.type === 'heaviest' && p.kg === 70 && p.previous === 65));
  });
  test('most reps at a load used before', () => {
    const r = detectPRs(ex(), [{ reps: 10, kg: 60 }], prev);
    assert(r.some(p => p.type === 'reps-at-load' && p.kg === 60 && p.reps === 10 && p.previous === 8));
  });
  test('best estimated 1RM (Epley), only from sets of 1-10 reps', () => {
    assert(detectPRs(ex(), [{ reps: 10, kg: 60 }], prev).some(p => p.type === 'e1rm'), '10 reps counts');
    assert(!detectPRs(ex(), [{ reps: 12, kg: 62.5 }], [{ reps: 10, kg: 62.5 }]).some(p => p.type === 'e1rm'), '12 reps does not');
  });
  test('no PR when nothing beats the history', () => eq(detectPRs(ex(), [{ reps: 6, kg: 60 }], prev), []));
  test('bodyweight exercises track rep PRs only', () => {
    const r = detectPRs(ex({ bodyweight: true, patternParams: { implement: 'bodyweight' } }), [{ reps: 15, kg: null }], [{ reps: 12, kg: null }]);
    eq(r.map(p => p.type), ['reps']);
  });
});

suite('History, deload signal and streak', () => {
  const w = (date, sets, id = 'barbell-bench-press') => ({ id: date, date, startedAt: 0, exercises: [{ exerciseId: id, sets }] });
  test('e1RM history drops twice in a row -> the deload rule fires', async () => {
    const d = await data();
    const h = e1rmHistory([w('2026-11-03', [{ reps: 5, kg: 100 }]), w('2026-11-10', [{ reps: 5, kg: 97.5 }]), w('2026-11-17', [{ reps: 5, kg: 95 }])], d.exById);
    eq(h['barbell-bench-press'].length, 3);
    eq(deloadSuggestion({ level: 'beginner', history: h }), { reason: 'e1rm-drop', exerciseId: 'barbell-bench-press' });
  });
  test('weeks start on Monday', () => eq([weekStart('2026-11-17'), weekStart('2026-11-22'), weekStart('2026-11-23')], ['2026-11-16', '2026-11-16', '2026-11-23']));
  test('streak counts consecutive complete weeks; the week in progress does not break it', () => {
    const list = ['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11', '2026-11-16'].map(dt => w(dt, []));
    eq(streak(list, 2, new Date(2026, 10, 18)), 2, 'two complete weeks, current week in progress');
    eq(streak(list, 2, new Date(2026, 10, 25)), 0, 'last week incomplete breaks it');
    eq(streak([...list, w('2026-11-18', [])], 2, new Date(2026, 10, 19)), 3, 'current week complete counts');
  });
});
