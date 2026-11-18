// tracker.js
// Reads logged workouts: per-exercise history, personal records (PRs), estimated-1RM history for the
// deload rule, session volume and the weekly streak; for the Progress pages also weekly sets per
// muscle group, training days, weekly adherence, the weight trend (7-day average), e1RM series,
// all PRs recomputed from history, and manual workout records. Pure functions; no DOM.
// Workout record (written by session.js, read here and on the exercise page):
//   { id, updatedAt, date: 'YYYY-MM-DD' (local), templateId, startedAt, endedAt, durationSec, deload,
//     exercises: [{ exerciseId, slotId, skipped, target: { sets, reps, unit, rir }, sets: [{ reps, kg, rir }] }],
//     volumeKg, totalReps, prs: [...] }
// PR rules: weighted exercises track heaviest load, most reps at a given load and best estimated 1RM
// (Epley, 1-10 reps only); bodyweight, band and timed exercises track most reps (or seconds) only.
// The first time an exercise is logged sets the baseline and is not a PR.

import { e1rm } from './planner.js';
import { parseLocalDate, localDate } from './state.js';

export const usesLoad = ex => !ex.bodyweight && ex.patternParams?.implement !== 'band';

// All logged sets of one exercise, oldest first, with their workout date.
export function exerciseHistory(workouts, exerciseId) {
  return [...workouts].sort((a, b) => (a.date === b.date ? a.startedAt - b.startedAt : a.date < b.date ? -1 : 1))
    .flatMap(w => (w.exercises || []).filter(x => x.exerciseId === exerciseId && !x.skipped && x.sets?.length)
      .map(x => ({ workoutId: w.id, date: w.date, target: x.target, sets: x.sets })));
}

export const lastPerformance = (workouts, exerciseId) => exerciseHistory(workouts, exerciseId).at(-1) || null;

// PRs of `sets` against every earlier logged set of the same exercise.
export function detectPRs(ex, sets, previous) {
  const done = sets.filter(s => s.reps > 0);
  if (!done.length || !previous.length) return [];
  const prs = [];
  if (!usesLoad(ex)) {
    const prevBest = Math.max(...previous.map(s => s.reps || 0));
    const best = Math.max(...done.map(s => s.reps));
    if (best > prevBest) prs.push({ type: 'reps', exerciseId: ex.id, reps: best, previous: prevBest });
    return prs;
  }
  const loaded = done.filter(s => s.kg > 0);
  const prevLoaded = previous.filter(s => s.kg > 0);
  if (!loaded.length || !prevLoaded.length) return prs;
  const prevMax = Math.max(...prevLoaded.map(s => s.kg));
  const max = Math.max(...loaded.map(s => s.kg));
  if (max > prevMax) prs.push({ type: 'heaviest', exerciseId: ex.id, kg: max, previous: prevMax });
  // Most reps at a load used before.
  let repPr = null;
  for (const s of loaded) {
    const atLoad = prevLoaded.filter(p => p.kg === s.kg);
    if (!atLoad.length) continue;
    const prevReps = Math.max(...atLoad.map(p => p.reps));
    if (s.reps > prevReps && (!repPr || s.reps - prevReps > repPr.reps - repPr.previous)) repPr = { type: 'reps-at-load', exerciseId: ex.id, kg: s.kg, reps: s.reps, previous: prevReps };
  }
  if (repPr) prs.push(repPr);
  const best = Math.max(0, ...loaded.map(s => e1rm(s.kg, s.reps) || 0));
  const prevBest = Math.max(0, ...prevLoaded.map(s => e1rm(s.kg, s.reps) || 0));
  if (best > 0 && prevBest > 0 && best > prevBest + 1e-9) prs.push({ type: 'e1rm', exerciseId: ex.id, kg: Math.round(best * 10) / 10, previous: Math.round(prevBest * 10) / 10 });
  return prs;
}

// Best estimated 1RM per session for every weighted exercise, oldest first (deload rule input).
export function e1rmHistory(workouts, exById) {
  const out = {};
  for (const w of [...workouts].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startedAt - b.startedAt))) {
    for (const x of w.exercises || []) {
      const ex = exById[x.exerciseId];
      if (!ex || !usesLoad(ex) || x.skipped) continue;
      const best = Math.max(0, ...(x.sets || []).map(s => e1rm(s.kg, s.reps) || 0));
      if (best > 0) (out[x.exerciseId] ??= []).push(best);
    }
  }
  return out;
}

export function volume(exercises) {
  let kg = 0, reps = 0;
  for (const x of exercises) for (const s of x.sets || []) { reps += s.reps || 0; kg += (s.kg || 0) * (s.reps || 0); }
  return { volumeKg: Math.round(kg * 10) / 10, totalReps: reps };
}

// Monday of the week containing a local date string.
export function weekStart(dateStr) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDate(d);
}

// Consecutive weeks (Monday to Sunday) in which every planned session was logged. The current week
// counts once it is complete; while it is still in progress it does not break the streak.
export function streak(workouts, daysPerWeek, today = new Date()) {
  const perWeek = {};
  for (const w of workouts) perWeek[weekStart(w.date)] = (perWeek[weekStart(w.date)] || 0) + 1;
  const d = parseLocalDate(weekStart(localDate(today)));
  let n = 0;
  if ((perWeek[localDate(d)] || 0) >= daysPerWeek) n++;
  for (;;) {
    d.setDate(d.getDate() - 7);
    if ((perWeek[localDate(d)] || 0) >= daysPerWeek) n++; else break;
  }
  return n;
}

// ---------- Phase 9: progress views ----------

const byDate = (a, b) => (a.date === b.date ? (a.startedAt || 0) - (b.startedAt || 0) : a.date < b.date ? -1 : 1);
const addDays = (dateStr, n) => { const d = parseLocalDate(dateStr); d.setDate(d.getDate() + n); return localDate(d); };
export { addDays };

// Working sets logged per muscle group in the week starting `monday` (same counting rule as the
// planner: 1 per primary group, 0.5 per secondary group; warm-up and ramp-up sets are never logged).
export function loggedWeeklySets(workouts, monday, exById, countSets, groupOf, groups) {
  const end = addDays(monday, 7);
  const entries = workouts.filter(w => w.date >= monday && w.date < end)
    .flatMap(w => (w.exercises || []).filter(x => !x.skipped).map(x => ({ exerciseId: x.exerciseId, sets: (x.sets || []).filter(s => s.reps > 0).length })));
  return countSets(entries, exById, groupOf, groups);
}

// Training days: date -> number of workouts that day.
export function trainingDays(workouts) {
  const out = {};
  for (const w of workouts) out[w.date] = (out[w.date] || 0) + 1;
  return out;
}

// The last `weeks` weeks (oldest first): logged sessions vs planned sessions per week.
export function weeklyAdherence(workouts, daysPerWeek, weeks = 8, today = new Date()) {
  const counts = {};
  for (const w of workouts) counts[weekStart(w.date)] = (counts[weekStart(w.date)] || 0) + 1;
  const thisWeek = weekStart(localDate(today));
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisWeek, -7 * (weeks - 1 - i));
    return { start, done: counts[start] || 0, planned: daysPerWeek, current: start === thisWeek };
  });
}

// Weigh-ins (oldest first) with the 7-day moving average: mean of the weigh-ins in the 7 days
// ending on each weigh-in's date.
export function weightTrend(bodyweights) {
  const list = [...bodyweights].filter(w => w.kg > 0).sort(byDate);
  return list.map(w => {
    const from = addDays(w.date, -6);
    const win = list.filter(x => x.date >= from && x.date <= w.date);
    return { date: w.date, kg: w.kg, avg: Math.round(win.reduce((a, x) => a + x.kg, 0) / win.length * 100) / 100, id: w.id };
  });
}

// Best estimated 1RM per workout for one exercise, with dates (sets of 1-10 reps only).
export function e1rmSeries(workouts, exerciseId) {
  return exerciseHistory(workouts, exerciseId).map(h => ({ date: h.date, e1rm: Math.max(0, ...h.sets.map(s => e1rm(s.kg, s.reps) || 0)) }))
    .filter(p => p.e1rm > 0).map(p => ({ ...p, e1rm: Math.round(p.e1rm * 10) / 10 }));
}

// Weighted exercises with at least one logged set, most logged first.
export function loggedLifts(workouts, exById) {
  const n = {};
  for (const w of workouts) for (const x of w.exercises || []) if (!x.skipped && x.sets?.some(s => s.kg > 0) && exById[x.exerciseId] && usesLoad(exById[x.exerciseId])) n[x.exerciseId] = (n[x.exerciseId] || 0) + 1;
  return Object.keys(n).sort((a, b) => n[b] - n[a]);
}

// Every PR, recomputed from the history in date order (so editing or deleting a workout updates the
// list), newest first. Each: { type, exerciseId, date, workoutId, kg?, reps?, previous }.
export function allPRs(workouts, exById) {
  const seen = {};
  const out = [];
  for (const w of [...workouts].sort(byDate)) {
    for (const x of w.exercises || []) {
      const ex = exById[x.exerciseId];
      if (!ex || x.skipped || !x.sets?.length) continue;
      const prev = seen[x.exerciseId] || [];
      for (const pr of detectPRs(ex, x.sets, prev)) out.push({ ...pr, date: w.date, workoutId: w.id });
      seen[x.exerciseId] = [...prev, ...x.sets];
    }
  }
  return out.reverse();
}

// A manual workout record (same shape as a session record). sets: [{ reps, kg, rir }].
export function manualWorkout({ id, date, durationMin, exercises, note }, now = Date.now()) {
  const exs = exercises.filter(x => x.exerciseId).map(x => ({ exerciseId: x.exerciseId, slotId: null, skipped: false, swappedFrom: null, target: null,
    sets: x.sets.filter(s => s.reps > 0).map(s => ({ reps: Number(s.reps), kg: s.kg === '' || s.kg == null ? null : Number(s.kg), rir: s.rir === '' || s.rir == null ? null : Number(s.rir) })) }))
    .filter(x => x.sets.length);
  const start = parseLocalDate(date); start.setHours(12);
  return { id, updatedAt: now, date, templateId: null, manual: true, startedAt: start.getTime(), endedAt: start.getTime() + (durationMin || 0) * 60000,
    durationSec: Math.round((durationMin || 0) * 60), deload: false, exercises: exs, ...volume(exs), note: note || '' };
}
