// session.js
// Workout session mode, as functions over the state object (no DOM): create the next session in the
// queue, prefill loads from the last performance plus the progression rule, log sets, run the rest
// timer and elapsed time from timestamps (correct after the phone locks), skip or swap exercises and
// finish (saves the workout, detects PRs, advances the queue). Views call these inside state.update().
// Active session shape (state.activeSession):
//   { id, templateId, queueIndex, startedAt, date, deload, index,
//     items: [{ exerciseId, slotId, role, target: { sets, reps, unit, rir, restSec, rampUps },
//               suggestion, ramp: [{ pct, reps, done }], sets: [{ reps, kg, rir, done, at }], skipped }],
//     rest: { endsAt, total, alerted } | null }

import { uuid, localDate } from './state.js';
import { progression, deloadSession } from './planner.js';
import { exerciseHistory, lastPerformance, detectPRs, volume, usesLoad } from './tracker.js';

// Rest used by the timer: the middle of the prescribed range, rounded to 15 s.
export const restSeconds = target => Math.round((target.restSec[0] + target.restSec[1]) / 2 / 15) * 15;

// Load increment shown on the steppers.
export const loadStep = ex => (ex.patternParams?.implement === 'dumbbell' ? 1 : 2.5);

// What to aim for today. First time on an exercise: no load (the user starts light and the logged
// sets become the baseline). Afterwards: the progression rule applied to the last session's sets.
export function suggestion(ex, entry, workouts, profile, exById) {
  const last = lastPerformance(workouts, ex.id);
  if (!last) return { firstTime: true, kg: null, reps: entry.reps[0], range: [...entry.reps], action: null };
  const extendedRange = !!(last.target?.reps && last.target.reps[1] > entry.reps[1]);
  const p = progression({ ex, entry, sets: last.sets, exById, profile, extendedRange });
  const lastKg = Math.max(0, ...last.sets.map(s => s.kg || 0));
  return {
    firstTime: false,
    kg: usesLoad(ex) ? (p.load ?? lastKg) || null : null,
    reps: p.reps[0],
    range: p.reps,
    action: p.action,
    harder: p.exerciseId || null,
    eccentricSec: p.eccentricSec || null,
    lastKg,
  };
}

function makeItem(entry, data, workouts, profile) {
  const ex = data.exById[entry.exerciseId];
  const sug = suggestion(ex, entry, workouts, profile, data.exById);
  return {
    exerciseId: entry.exerciseId,
    slotId: entry.slotId,
    role: entry.role,
    target: { sets: entry.sets, reps: sug.range, unit: entry.unit, rir: entry.rir, restSec: entry.restSec, rampUps: entry.rampUps },
    suggestion: { firstTime: sug.firstTime, action: sug.action, harder: sug.harder, eccentricSec: sug.eccentricSec },
    ramp: entry.rampUps.map(r => ({ ...r, done: false })),
    sets: Array.from({ length: entry.sets }, () => ({ reps: sug.reps, kg: sug.kg, rir: null, done: false, at: null })),
    skipped: false,
  };
}

// Builds the next session in the queue. A missed day never skips a session: the queue only moves
// when a session is finished.
export function createSession(st, data, now = Date.now(), { deload = false } = {}) {
  const plan = st.plan;
  const queueIndex = (st.queueIndex ?? 0) % plan.sessions.length;
  const ses = deload ? deloadSession(plan.sessions[queueIndex]) : plan.sessions[queueIndex];
  return {
    id: uuid(),
    templateId: ses.templateId,
    queueIndex,
    startedAt: now,
    date: localDate(new Date(now)),
    deload,
    index: 0,
    items: ses.exercises.filter(e => e.exerciseId && e.sets > 0).map(e => makeItem(e, data, st.workouts, st.profile)),
    rest: null,
  };
}

export function logSet(active, i, j, values, now = Date.now()) {
  const set = active.items[i].sets[j];
  Object.assign(set, values, { done: true, at: now });
  const total = restSeconds(active.items[i].target);
  active.rest = { endsAt: now + total * 1000, total, alerted: false };
  return set;
}
export function unlogSet(active, i, j) { Object.assign(active.items[i].sets[j], { done: false, at: null }); }
export function addSet(active, i) {
  const last = active.items[i].sets.at(-1);
  active.items[i].sets.push({ reps: last?.reps ?? active.items[i].target.reps[0], kg: last?.kg ?? null, rir: null, done: false, at: null });
}

export const restRemaining = (active, now = Date.now()) => (active?.rest ? Math.max(0, Math.ceil((active.rest.endsAt - now) / 1000)) : 0);
export const elapsedSec = (active, now = Date.now()) => Math.max(0, Math.floor((now - active.startedAt) / 1000));
export function addRest(active, sec, now = Date.now()) { if (active.rest) active.rest.endsAt = Math.max(active.rest.endsAt, now) + sec * 1000; }
export function skipRest(active) { active.rest = null; }

export function goTo(active, i) { active.index = Math.max(0, Math.min(i, active.items.length - 1)); }
export function skipItem(active, i) {
  active.items[i].skipped = true;
  if (i === active.index && i < active.items.length - 1) active.index = i + 1;
}
export function unskipItem(active, i) { active.items[i].skipped = false; }

// Swap one exercise for this session only (the plan is unchanged).
export function swapItem(active, i, exerciseId, data, workouts, profile) {
  const old = active.items[i];
  const entry = { exerciseId, slotId: old.slotId, role: old.role, sets: old.target.sets, reps: old.target.reps, unit: old.target.unit, rir: old.target.rir, restSec: old.target.restSec, rampUps: usesLoad(data.exById[exerciseId]) ? old.target.rampUps : [] };
  const item = makeItem(entry, data, workouts, profile);
  item.swappedFrom = old.swappedFrom || old.exerciseId;
  active.items[i] = item;
}

// Saves the workout, returns the record (with PRs). Unlogged exercises are kept as skipped.
export function finishSession(st, data, now = Date.now()) {
  const a = st.activeSession;
  const exercises = a.items.map(it => {
    const sets = it.sets.filter(s => s.done).map(({ reps, kg, rir }) => ({ reps, kg: kg ?? null, rir: rir ?? null }));
    return { exerciseId: it.exerciseId, slotId: it.slotId, skipped: it.skipped || !sets.length, swappedFrom: it.swappedFrom || null,
      target: { sets: it.target.sets, reps: it.target.reps, unit: it.target.unit, rir: it.target.rir }, sets };
  });
  const prs = exercises.filter(x => x.sets.length).flatMap(x =>
    detectPRs(data.exById[x.exerciseId], x.sets, exerciseHistory(st.workouts, x.exerciseId).flatMap(h => h.sets)));
  const record = {
    id: a.id, updatedAt: now, date: a.date, templateId: a.templateId, startedAt: a.startedAt, endedAt: now,
    durationSec: elapsedSec(a, now), deload: a.deload, exercises, ...volume(exercises), prs,
  };
  st.workouts.push(record);
  st.queueIndex = a.queueIndex + 1;
  st.activeSession = null;
  return record;
}

export function discardSession(st) { st.activeSession = null; }
