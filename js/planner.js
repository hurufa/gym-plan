// planner.js
// Turns a profile into a weekly training plan with explicit, readable rules (no randomness):
// split by days and level, slot-based exercise choice filtered by equipment, level and injuries,
// programming variables by goal, set allocation that respects the session-length limit and the
// weekly set range, cardio and steps, deload and progression rules.
// generatePlan(profile, data, opts) is pure: data = { exercises, enums, warmups }.
// Set counting rule (used here, in coverage and in the tracker): a working set counts 1 for each
// group that holds a primary muscle and 0.5 for each other group that holds a secondary muscle.

import { isAvailable } from './equipment.js';

export const LEVELS = ['beginner', 'intermediate', 'advanced'];
// Where spare time goes first, and what is cut first (from the end).
export const GROUP_PRIORITY = ['chest', 'back', 'quads', 'hamstrings', 'glutes', 'shoulders', 'biceps', 'triceps', 'calves', 'core'];

// Programming variables by goal. Rest is in seconds; reps are [low, high].
export const GOALS = {
  'build-muscle': { main: [6, 10], acc: [10, 15], weekly: [10, 20], restMain: [120, 180], restAcc: [60, 90], cardio: { count: 1, optional: true, intensity: 'light' } },
  'lose-fat': { main: [6, 10], acc: [10, 15], weekly: [10, 15], restMain: [120, 180], restAcc: [60, 90], cardio: { count: 3, optional: false, intensity: 'moderate' }, steps: true },
  'recomposition': { main: [6, 10], acc: [8, 15], weekly: [10, 16], restMain: [120, 180], restAcc: [60, 90], cardio: { count: 2, optional: false, intensity: 'light' } },
  'get-stronger': { main: [3, 6], acc: [8, 12], weekly: [8, 14], restMain: [180, 300], restAcc: [90, 120], cardio: { count: 1, optional: true, intensity: 'light' } },
  'general-fitness': { main: [8, 12], acc: [12, 15], weekly: [8, 12], restMain: [60, 90], restAcc: [60, 90], cardio: { count: 3, optional: false, intensity: 'moderate' } },
};
export const BODYWEIGHT_REPS = [8, 20];
export const HOLD_SECONDS = [20, 45];
export const WALL_SIT_SECONDS = [30, 60];
export const CARDIO_MINUTES = [20, 30];

export const TIMING = { warmupSec: 360, cooldownSec: 300, workSec: 40, rampSec: 90 };
const SETS = { mainStart: 3, mainMin: 2, mainMax: 5, accStart: 2, accMin: 2, accMax: 4 };

// Each slot lists exercises in order of preference. The first one the user can do is used.
// Main slots fall back across patterns so every session keeps a main lift; accessory slots stay
// empty (with the reason shown) when nothing in their list is allowed.
export const SLOTS = {
  'main-squat': ['barbell-back-squat', 'leg-press', 'goblet-squat', 'dumbbell-bulgarian-split-squat', 'bodyweight-bulgarian-split-squat', 'reverse-lunge', 'bodyweight-squat',
    'romanian-deadlift', 'dumbbell-romanian-deadlift', 'barbell-hip-thrust', 'single-leg-rdl', 'single-leg-glute-bridge', 'glute-bridge'],
  'main-hinge': ['barbell-deadlift', 'romanian-deadlift', 'dumbbell-romanian-deadlift', 'single-leg-rdl', 'barbell-hip-thrust', 'single-leg-glute-bridge', 'glute-bridge',
    'leg-press', 'goblet-squat', 'reverse-lunge'],
  'main-hpush': ['barbell-bench-press', 'dumbbell-bench-press', 'push-up', 'incline-push-up', 'cable-fly'],
  'main-vpush': ['overhead-press', 'dumbbell-shoulder-press', 'pike-push-up', 'barbell-bench-press', 'dumbbell-bench-press', 'push-up', 'incline-push-up'],
  'main-pull': ['barbell-row', 'pull-up', 'lat-pulldown', 'one-arm-dumbbell-row', 'chin-up', 'seated-cable-row', 'negative-chin-up', 'band-row', 'doorway-row'],
  'main-vpull': ['pull-up', 'lat-pulldown', 'chin-up', 'negative-chin-up', 'band-lat-pulldown', 'one-arm-dumbbell-row', 'band-row', 'doorway-row'],
  'h-push': ['barbell-bench-press', 'dumbbell-bench-press', 'push-up', 'incline-push-up'],
  'chest-2': ['incline-dumbbell-press', 'dumbbell-bench-press', 'decline-push-up', 'push-up', 'incline-push-up'],
  'fly': ['cable-fly', 'decline-push-up', 'push-up', 'incline-push-up'],
  'v-push': ['overhead-press', 'dumbbell-shoulder-press', 'pike-push-up'],
  'h-pull': ['seated-cable-row', 'one-arm-dumbbell-row', 'band-row', 'doorway-row'],
  'h-pull-2': ['one-arm-dumbbell-row', 'barbell-row', 'seated-cable-row', 'band-row', 'doorway-row'],
  'v-pull': ['lat-pulldown', 'pull-up', 'chin-up', 'negative-chin-up', 'band-lat-pulldown', 'doorway-row', 'band-row'],
  'hinge': ['romanian-deadlift', 'dumbbell-romanian-deadlift', 'single-leg-rdl', 'lying-leg-curl', 'sliding-leg-curl'],
  'knee-flex': ['lying-leg-curl', 'sliding-leg-curl'],
  'quad-iso': ['leg-extension', 'wall-sit'],
  'single-leg': ['dumbbell-bulgarian-split-squat', 'bodyweight-bulgarian-split-squat', 'reverse-lunge', 'wall-sit'],
  'squat-2': ['leg-press', 'goblet-squat', 'bodyweight-squat', 'wall-sit'],
  'glute': ['barbell-hip-thrust', 'single-leg-glute-bridge', 'glute-bridge'],
  'calves': ['standing-calf-raise', 'single-leg-calf-raise'],
  'lateral': ['dumbbell-lateral-raise', 'band-lateral-raise'],
  'biceps': ['barbell-curl', 'dumbbell-curl', 'band-curl', 'doorframe-curl'],
  'biceps-2': ['hammer-curl', 'dumbbell-curl', 'band-curl', 'doorframe-curl'],
  'triceps': ['triceps-pushdown', 'overhead-dumbbell-triceps-extension', 'diamond-push-up', 'bodyweight-triceps-extension', 'bench-dip'],
  'triceps-2': ['overhead-dumbbell-triceps-extension', 'parallel-bar-dip', 'bench-dip', 'bodyweight-triceps-extension', 'diamond-push-up'],
  'core': ['cable-crunch', 'crunch'],
  'core-2': ['plank', 'side-plank'],
};

// Session templates: the first slot is the main lift.
export const TEMPLATES = {
  'fb-a': ['main-squat', 'h-push', 'h-pull', 'hinge', 'lateral', 'biceps', 'triceps', 'calves', 'core'],
  'fb-b': ['main-hinge', 'v-push', 'v-pull', 'single-leg', 'chest-2', 'knee-flex', 'triceps-2', 'core-2'],
  'fb-c': ['main-hpush', 'squat-2', 'h-pull-2', 'glute', 'lateral', 'biceps-2', 'calves', 'core'],
  'upper-a': ['main-hpush', 'h-pull', 'v-push', 'v-pull', 'lateral', 'biceps', 'triceps'],
  'upper-b': ['main-vpush', 'chest-2', 'v-pull', 'h-pull-2', 'fly', 'biceps-2', 'triceps-2'],
  'lower-a': ['main-squat', 'hinge', 'quad-iso', 'knee-flex', 'calves', 'core'],
  'lower-b': ['main-hinge', 'single-leg', 'squat-2', 'glute', 'calves', 'core-2'],
  'push': ['main-hpush', 'v-push', 'chest-2', 'lateral', 'triceps', 'triceps-2'],
  'pull': ['main-pull', 'v-pull', 'h-pull-2', 'biceps', 'biceps-2', 'core'],
  'legs': ['main-squat', 'hinge', 'single-leg', 'knee-flex', 'calves', 'core-2'],
  'push-b': ['main-vpush', 'chest-2', 'h-push', 'fly', 'lateral', 'triceps-2', 'triceps'],
  'pull-b': ['main-vpull', 'h-pull', 'h-pull-2', 'biceps-2', 'biceps', 'core-2'],
  'legs-b': ['main-hinge', 'single-leg', 'squat-2', 'glute', 'knee-flex', 'calves', 'core'],
};

export const SPLITS = {
  'full-body-2': { days: 2, templates: ['fb-a', 'fb-b'] },
  'full-body-3': { days: 3, templates: ['fb-a', 'fb-b', 'fb-c'] },
  'ppl-3': { days: 3, templates: ['push', 'pull', 'legs'] },
  'upper-lower': { days: 4, templates: ['upper-a', 'lower-a', 'upper-b', 'lower-b'] },
  'ul-ppl': { days: 5, templates: ['upper-a', 'lower-a', 'push-b', 'pull', 'legs-b'] },
  'ppl-6': { days: 6, templates: ['push', 'pull', 'legs', 'push-b', 'pull-b', 'legs-b'] },
};

// Monday = 0. Spread sessions so rest days fall between them where possible.
export const DEFAULT_SCHEDULE = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };

// Split ids offered for a number of days and level; the first is the default.
export function splitOptions(days, level) {
  if (days === 3) return level === 'beginner' ? ['full-body-3'] : ['full-body-3', 'ppl-3'];
  return Object.keys(SPLITS).filter(id => SPLITS[id].days === days);
}

const rank = l => LEVELS.indexOf(l);
const lexLess = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const mid = ([a, b]) => (a + b) / 2;
const LOWER = new Set(['quads', 'hamstrings', 'glutes', 'calves']);

export function groupMaps(enums) {
  const groupOf = Object.fromEntries(enums.muscles.map(m => [m.id, m.group]));
  return { groupOf, groups: enums.groups.map(g => g.id), major: enums.groups.filter(g => g.major).map(g => g.id) };
}

// Groups an exercise counts toward: { primary: Set, secondary: Set (excluding primary groups) }.
export function exerciseGroups(ex, groupOf) {
  const primary = new Set(ex.primary.map(m => groupOf[m]).filter(Boolean));
  const secondary = new Set(ex.secondary.map(m => groupOf[m]).filter(g => g && !primary.has(g)));
  return { primary, secondary };
}

// Weekly sets per group for a list of { exerciseId, sets } entries (cardio and dropped excluded).
export function countSets(entries, exById, groupOf, groups) {
  const out = Object.fromEntries(groups.map(g => [g, 0]));
  for (const e of entries) {
    const ex = exById[e.exerciseId];
    if (!ex || ex.pattern === 'cardio' || !e.sets) continue;
    const { primary, secondary } = exerciseGroups(ex, groupOf);
    primary.forEach(g => { out[g] += e.sets; });
    secondary.forEach(g => { out[g] += e.sets * 0.5; });
  }
  return out;
}

export const isTimed = ex => ex.pattern === 'core-hold' || ex.patternParams?.tempo === 'isometric';
const noLoad = ex => ex.bodyweight || ex.patternParams?.implement === 'band';

// Why an exercise is not allowed for this profile (null = allowed).
export function blockReason(ex, profile) {
  if (!ex) return 'missing';
  if (!isAvailable(ex, profile.equipment, { pullupBar: profile.pullupBar, bands: profile.bands })) return 'equipment';
  if (ex.stress.some(s => (profile.injuries || []).includes(s))) return 'injury';
  if (rank(ex.level) > rank(profile.experience)) return 'level';
  return null;
}

function prescription(ex, role, profile, goal) {
  let reps;
  if (isTimed(ex)) reps = ex.id === 'wall-sit' ? WALL_SIT_SECONDS : HOLD_SECONDS;
  else if (noLoad(ex)) reps = BODYWEIGHT_REPS;
  else if (role === 'main') reps = profile.goal === 'get-stronger' && profile.experience === 'beginner' ? [5, 8] : goal.main;
  else reps = goal.acc;
  const rir = profile.experience === 'beginner' ? [2, 3] : role === 'main' ? [2, 3] : [1, 2];
  const rest = role === 'main' ? goal.restMain : goal.restAcc;
  const rampUps = role === 'main' && !noLoad(ex)
    ? (profile.experience === 'beginner' ? [{ pct: 50, reps: 5 }, { pct: 75, reps: 3 }] : [{ pct: 50, reps: 5 }, { pct: 70, reps: 4 }, { pct: 85, reps: 3 }])
    : [];
  return { reps: [...reps], unit: isTimed(ex) ? 'seconds' : 'reps', rir, restSec: [...rest], rampUps };
}

export const setCost = entry => TIMING.workSec + mid(entry.restSec);
export function sessionSeconds(session) {
  let s = TIMING.warmupSec + TIMING.cooldownSec;
  for (const e of session.exercises) {
    if (!e.exerciseId || !e.sets) continue;
    s += e.rampUps.length * TIMING.rampSec + e.sets * setCost(e);
  }
  return s;
}

function pickExercise(slotId, templateId, used, profile, exById, swaps) {
  const swap = swaps.find(s => s.templateId === templateId && s.slotId === slotId);
  if (swap && !blockReason(exById[swap.exerciseId], profile) && !used.has(swap.exerciseId) && exById[swap.exerciseId].pattern !== 'cardio') {
    return { exerciseId: swap.exerciseId, swapped: true };
  }
  const reasons = new Set();
  for (const id of SLOTS[slotId]) {
    const r = blockReason(exById[id], profile) || (used.has(id) ? 'duplicate' : null);
    if (!r) return { exerciseId: id, swapped: false, swapIgnored: !!swap };
    reasons.add(r);
  }
  // Report why the options that fit the equipment were not used (injury, then level, then already
  // used); 'equipment' only when nothing in the list fits the equipment.
  const reason = ['injury', 'level', 'duplicate'].find(r => reasons.has(r)) || 'equipment';
  return { exerciseId: null, reason };
}

function buildSession(templateId, index, profile, goal, exById, swaps) {
  const used = new Set();
  const exercises = TEMPLATES[templateId].map((slotId, i) => {
    const role = i === 0 ? 'main' : 'accessory';
    const pick = pickExercise(slotId, templateId, used, profile, exById, swaps);
    if (!pick.exerciseId) return { slotId, role, exerciseId: null, sets: 0, empty: pick.reason, reps: [0, 0], rir: [0, 0], restSec: [0, 0], rampUps: [] };
    used.add(pick.exerciseId);
    const ex = exById[pick.exerciseId];
    // A main lift that fell back to another movement pattern changes what the session is built around.
    // fallback: 'injury' if an exercise of the intended pattern was removed by an injury filter,
    // otherwise 'options' (equipment or level).
    let fallback = null;
    const intended = exById[SLOTS[slotId][0]].pattern;
    if (role === 'main' && !pick.swapped && ex.pattern !== intended) {
      fallback = SLOTS[slotId].some(id => exById[id].pattern === intended && blockReason(exById[id], profile) === 'injury') ? 'injury' : 'options';
    }
    return { slotId, role, exerciseId: pick.exerciseId, swapped: pick.swapped, ...(fallback ? { fallback } : {}), sets: role === 'main' ? SETS.mainStart : SETS.accStart, ...prescription(ex, role, profile, goal) };
  });
  return { key: templateId, templateId, index, exercises };
}

// Core of the planner: fit every session in the time limit, keep each group at or under the top
// of the goal range, grow toward the level-scaled target, then lift major groups to 4+ sets.
function allocate(sessions, ctx) {
  const { exById, groupOf, groups, major, limitSec, lo, hi, target } = ctx;
  const all = () => sessions.flatMap(s => s.exercises);
  const weekly = () => countSets(all(), exById, groupOf, groups);
  const prio = g => GROUP_PRIORITY.indexOf(g);
  const entryPrio = e => Math.min(...[...exerciseGroups(exById[e.exerciseId], groupOf).primary].map(prio), 99);
  const active = s => s.exercises.filter(e => e.exerciseId && e.sets > 0);
  const drop = (e, why) => { e.dropped = why; e.sets = 0; };
  // Would removing `loss` sets from x push any major group (that is now at 4+) below 4?
  const keepsFloors = (x, loss, w, except = null) => {
    const { primary, secondary } = exerciseGroups(exById[x.exerciseId], groupOf);
    return major.every(mg => mg === except || w[mg] < 4 || w[mg] - loss * (primary.has(mg) ? 1 : secondary.has(mg) ? 0.5 : 0) >= 4);
  };
  const lossOf = x => (x.role === 'main' || x.sets > SETS.accMin ? 1 : x.sets);
  const removeOne = (e, why) => {
    const min = e.role === 'main' ? SETS.mainMin : SETS.accMin;
    if (e.sets > min) e.sets--; else if (e.role !== 'main') drop(e, why); else return false;
    return true;
  };

  // 1. Fit each session in the time limit: trim accessories from the lowest priority up.
  for (const s of sessions) {
    let guard = 200;
    while (sessionSeconds(s) > limitSec && guard--) {
      const acc = active(s).filter(e => e.role !== 'main').sort((a, b) => entryPrio(b) - entryPrio(a) || b.sets - a.sets);
      const victim = acc.find(e => e.sets > SETS.accMin) || acc[0];
      if (victim) { removeOne(victim, 'time'); continue; }
      const main = active(s).find(e => e.role === 'main');
      if (!main || !removeOne(main, 'time')) break;
    }
  }

  // 2. Stay at or under the top of the weekly range.
  for (let guard = 300; guard--;) {
    const w = weekly();
    const over = groups.find(g => w[g] > hi);
    if (!over) break;
    const contributors = all().filter(e => e.exerciseId && e.sets > 0).map(e => {
      const { primary, secondary } = exerciseGroups(exById[e.exerciseId], groupOf);
      return { e, share: primary.has(over) ? 1 : secondary.has(over) ? 0.5 : 0 };
    }).filter(c => c.share).sort((a, b) => b.share - a.share || (a.e.role === 'main') - (b.e.role === 'main') || b.e.sets - a.e.sets);
    if (!contributors.some(c => removeOne(c.e, 'volume'))) break;
  }

  // Adding one set to `e`: allowed if time fits and no group passes the top of the range.
  const canAdd = (s, e, w) => {
    if (e.sets >= (e.role === 'main' ? SETS.mainMax : SETS.accMax)) return false;
    if (sessionSeconds(s) + setCost(e) > limitSec) return false;
    const { primary, secondary } = exerciseGroups(exById[e.exerciseId], groupOf);
    return [...primary].every(g => w[g] + 1 <= hi) && [...secondary].every(g => w[g] + 0.5 <= hi);
  };

  // 3. Grow toward the target, highest-priority deficit first, fewest sets first.
  for (let guard = 400; guard--;) {
    const w = weekly();
    let best = null;
    sessions.forEach((s, si) => active(s).forEach((e, ei) => {
      const deficit = [...exerciseGroups(exById[e.exerciseId], groupOf).primary].filter(g => w[g] < target[g]);
      if (!deficit.length || !canAdd(s, e, w)) return;
      const key = [Math.min(...deficit.map(prio)), e.sets, si, ei];
      if (!best || lexLess(key, best.key)) best = { e, key };
    }));
    if (!best) break;
    best.e.sets++;
  }

  // 4. Major groups need 4+ weekly sets. Add sets where they count; if a session is full,
  // free time by trimming arm, calf and core work (or groups already past their target).
  for (let round = 0; round < 3 && major.some(g => weekly()[g] < 4); round++) for (const g of major) {
    for (let guard = 60; guard--;) {
      const w = weekly();
      if (w[g] >= 4) break;
      const options = [];
      sessions.forEach(s => s.exercises.forEach(e => {
        if (!e.exerciseId || (e.dropped && e.dropped !== 'time' && e.dropped !== 'volume')) return;
        const { primary, secondary } = exerciseGroups(exById[e.exerciseId], groupOf);
        const share = primary.has(g) ? 1 : secondary.has(g) ? 0.5 : 0;
        if (share) options.push({ s, e, share });
      }));
      options.sort((a, b) => b.share - a.share || a.e.sets - b.e.sets);
      let done = false;
      for (const { s, e, share } of options) {
        const snapshot = all().map(x => [x, x.sets, x.dropped]);
        const restore = () => snapshot.forEach(([x, sets, dropped]) => { x.sets = sets; if (dropped) x.dropped = dropped; else delete x.dropped; });
        const before = w[g];
        const revive = e.sets === 0;
        if (revive) { e.sets = e.role === 'main' ? SETS.mainMin : SETS.accMin; delete e.dropped; }
        const fits = () => sessionSeconds(s) <= limitSec;
        if (!revive) e.sets++;
        // Free time in this session from entries that do not feed a major group below 4.
        let guard2 = 40;
        while (!fits() && guard2--) {
          const ww = weekly();
          // Accessories first (lowest priority first); main lifts only down to their minimum.
          const victims = active(s).filter(x => x !== e && (x.role !== 'main' || x.sets > SETS.mainMin)).filter(x => {
            const { primary, secondary } = exerciseGroups(exById[x.exerciseId], groupOf);
            // A victim may feed `g` too, if less directly than `e` (net gain).
            const vShare = primary.has(g) ? 1 : secondary.has(g) ? 0.5 : 0;
            return vShare < share && keepsFloors(x, lossOf(x), ww, g);
          }).sort((a, b) => (a.role === 'main') - (b.role === 'main') || entryPrio(b) - entryPrio(a));
          if (!victims.length) break;
          removeOne(victims[0], 'time');
        }
        // Make room under the cap: trim other work feeding the capped group but not `g`,
        // without pushing any major group below 4.
        for (let guard3 = 20; guard3--;) {
          const w2 = weekly();
          const capped = groups.find(x => w2[x] > hi);
          if (!capped) break;
          const victim = all().filter(x => x !== e && x.exerciseId && x.sets > 0).map(x => {
            const { primary, secondary } = exerciseGroups(exById[x.exerciseId], groupOf);
            return { x, primary, secondary, share: primary.has(capped) ? 1 : secondary.has(capped) ? 0.5 : 0 };
          }).filter(v => v.share && !v.primary.has(g) && !v.secondary.has(g) && (v.x.role !== 'main' || v.x.sets > SETS.mainMin) && keepsFloors(v.x, lossOf(v.x), w2))
            .sort((a, b) => (a.x.role === 'main') - (b.x.role === 'main') || b.share - a.share || entryPrio(b.x) - entryPrio(a.x))[0];
          if (!victim || !removeOne(victim.x, 'volume')) break;
        }
        const overCap = groups.some(x => weekly()[x] > hi);
        if (fits() && e.sets <= (e.role === 'main' ? SETS.mainMax : SETS.accMax) && !overCap && weekly()[g] > before) { done = true; break; }
        restore();
      }
      if (!done) break;
    }
  }
}

export function stepsTarget(dailySteps) {
  if (dailySteps == null) return { target: null, base: null };
  return { target: Math.max(dailySteps, Math.min(dailySteps + 2000, 10000)), base: dailySteps };
}

function planCardio(profile, goal, schedule, exById) {
  const c = goal.cardio;
  const jog = c.intensity === 'moderate' && profile.experience !== 'beginner' && !blockReason(exById.jogging, profile);
  const exerciseId = jog ? 'jogging' : 'brisk-walk';
  const free = [0, 1, 2, 3, 4, 5, 6].filter(d => !schedule.includes(d));
  const out = [];
  // Non-lifting days first, spread across the week; then after lifting sessions (outside the time budget).
  const spread = free.length <= c.count ? free : Array.from({ length: c.count }, (_, i) => free[Math.floor((i * free.length) / c.count)]);
  spread.forEach(d => out.push({ exerciseId, minutes: [...CARDIO_MINUTES], weekday: d, afterLifting: false, optional: c.optional, intensity: c.intensity }));
  for (let i = schedule.length - 1; out.length < c.count && i >= 0; i--) {
    out.push({ exerciseId, minutes: [...CARDIO_MINUTES], weekday: schedule[i], afterLifting: true, optional: c.optional, intensity: c.intensity });
  }
  return out.sort((a, b) => a.weekday - b.weekday);
}

function pickRoutine(warmups, kind, sessionGroups, profile, max) {
  const general = warmups.filter(w => w.kind === kind && w.general);
  const specific = warmups.filter(w => w.kind === kind && !w.general && !(w.stress || []).some(s => (profile.injuries || []).includes(s)) &&
    (!w.equipment || w.equipment.every(q => q === profile.equipment || profile.equipment === 'full-gym' || (q === 'bands' && profile.bands))));
  const scored = specific.map((w, i) => ({ w, i, hits: w.groups.filter(g => sessionGroups.includes(g)).length })).filter(x => x.hits);
  scored.sort((a, b) => b.hits - a.hits || a.i - b.i);
  return [...general.slice(0, 1), ...scored.slice(0, max).map(x => x.w)].map(w => w.id);
}

// Main entry. opts: { split, schedule, swaps: [{templateId, slotId, exerciseId}], probe }
export function generatePlan(profile, data, opts = {}) {
  const { exercises, enums, warmups = [] } = data;
  const exById = Object.fromEntries(exercises.map(e => [e.id, e]));
  const { groupOf, groups, major } = groupMaps(enums);
  const goal = GOALS[profile.goal];
  const [lo, hi] = goal.weekly;
  const level = profile.experience;
  const perLevel = level === 'beginner' ? lo : level === 'intermediate' ? Math.round((lo + hi) / 2) : Math.round(lo + 0.75 * (hi - lo));
  const target = Object.fromEntries(groups.map(g => [g, perLevel]));
  const options = splitOptions(profile.days, level);
  const splitId = options.includes(opts.split) ? opts.split : options[0];
  const swaps = opts.swaps || [];
  const limitSec = profile.sessionLength * 60;

  const sessions = SPLITS[splitId].templates.map((t, i) => buildSession(t, i, profile, goal, exById, swaps));
  allocate(sessions, { exById, groupOf, groups, major, limitSec, lo, hi, target });

  const entries = sessions.flatMap(s => s.exercises);
  const weekly = countSets(entries, exById, groupOf, groups);
  for (const s of sessions) {
    const live = s.exercises.filter(e => e.exerciseId && e.sets > 0);
    const sg = new Set(live.flatMap(e => [...exerciseGroups(exById[e.exerciseId], groupOf).primary]));
    s.groups = groups.filter(g => sg.has(g));
    s.durationMin = Math.ceil(sessionSeconds(s) / 60);
    s.warmup = pickRoutine(warmups, 'warmup', s.groups, profile, 3);
    s.cooldown = pickRoutine(warmups, 'cooldown', s.groups, profile, 3);
  }

  const schedule = validSchedule(opts.schedule, profile.days) ? [...opts.schedule] : [...DEFAULT_SCHEDULE[profile.days]];
  const notes = [];
  if (level === 'beginner' && profile.days >= 5) notes.push('beginner-high-days');
  if (splitId === 'ppl-3') notes.push('ppl-once-weekly');
  if (options.includes('ppl-3') && splitId === 'full-body-3') notes.push('ppl-available');
  if (profile.goal === 'get-stronger' && profile.equipment === 'bodyweight') notes.push('bodyweight-strength');
  if (level === 'beginner') notes.push('rir-beginner');
  if (swaps.length && sessions.some(s => s.exercises.some(e => e.swapIgnored))) notes.push('swap-dropped');

  const reachable = new Set(exercises.filter(e => e.pattern !== 'cardio' && !blockReason(e, profile))
    .flatMap(e => { const x = exerciseGroups(e, groupOf); return [...x.primary, ...x.secondary]; }));
  // Why a group is under the range: 'equipment' (nothing available trains it), 'time' (a session
  // that could hold another set for it is full) or 'options' (its exercises are at their set limit,
  // or more sets would push another group past the top of the range).
  const underReason = g => {
    if (!reachable.has(g)) return 'equipment';
    for (const s of sessions) for (const e of s.exercises) {
      if (!e.exerciseId || !exerciseGroups(exById[e.exerciseId], groupOf).primary.has(g)) continue;
      const max = e.role === 'main' ? SETS.mainMax : SETS.accMax;
      if (e.sets < max && sessionSeconds(s) + setCost(e) * (e.sets ? 1 : SETS.accMin) > limitSec) return 'time';
    }
    return 'options';
  };
  const under = groups.filter(g => weekly[g] < lo).map(g => ({ group: g, sets: weekly[g], reason: underReason(g) }));
  // Check honestly whether one more day or 15 more minutes would close the gap.
  if (!opts.probe && under.some(u => u.reason === 'time')) {
    const closes = p => { const w = generatePlan(p, data, { probe: true, swaps }).weekly; return under.filter(u => w[u.group] >= lo).map(u => u.group); };
    const byMinutes = profile.sessionLength < 90 ? closes({ ...profile, sessionLength: profile.sessionLength + 15 }) : [];
    const byDay = profile.days < 6 ? closes({ ...profile, days: profile.days + 1 }) : [];
    for (const u of under) { u.closesWithMinutes = byMinutes.includes(u.group); u.closesWithDay = byDay.includes(u.group); }
  }

  return {
    version: 1,
    splitId, splitOptions: options,
    schedule,
    sessions,
    weekly, range: [lo, hi], target,
    under,
    cardio: planCardio(profile, goal, schedule, exById),
    steps: goal.steps ? stepsTarget(profile.dailySteps) : null,
    notes,
    profileUpdatedAt: profile.updatedAt ?? null,
  };
}

export function validSchedule(schedule, days) {
  return Array.isArray(schedule) && schedule.length === days && new Set(schedule).size === days && schedule.every(d => Number.isInteger(d) && d >= 0 && d <= 6);
}

// Deload week: same exercises and loads, half the sets (rounded up), stop at RIR 4 or more.
export function deloadSession(session) {
  return { ...session, deload: true, exercises: session.exercises.map(e => (e.sets ? { ...e, sets: Math.ceil(e.sets / 2), rir: [4, 5] } : e)) };
}

// Deload suggestion. history: { [exerciseId]: [e1rm per session, oldest first] }.
// Returns { reason: 'e1rm-drop', exerciseId } | { reason: 'eight-weeks' } | null. Beginners only get the
// e1RM signal; deloads are never scheduled for them.
export function deloadSuggestion({ level, history = {}, lastDeloadAt = null, trainingSince = null, now = Date.now() }) {
  for (const [exerciseId, e] of Object.entries(history)) {
    const n = e.length;
    if (n >= 3 && e[n - 1] < e[n - 2] && e[n - 2] < e[n - 3]) return { reason: 'e1rm-drop', exerciseId };
  }
  if (level !== 'beginner') {
    const since = lastDeloadAt ?? trainingSince;
    if (since && now - since >= 8 * 7 * 864e5) return { reason: 'eight-weeks' };
  }
  return null;
}

// Epley estimated 1RM, valid for 1-10 reps only.
export const e1rm = (kg, reps) => (reps >= 1 && reps <= 10 ? (reps === 1 ? kg : kg * (1 + reps / 30)) : null);

// Next target for one exercise after a session.
// sets: [{reps, kg, rir}] logged; entry: plan entry; ex: exercise; dumbbellStep: kg per dumbbell jump.
export function progression({ ex, entry, sets, exById, profile, extendedRange = false, dumbbellStep = 2 }) {
  const [lo, hi] = entry.reps;
  const top = extendedRange ? hi + 3 : hi;
  const allTop = sets.length >= entry.sets && sets.every(s => s.reps >= top && (s.rir == null || s.rir >= entry.rir[0]));
  const load = sets.length ? Math.max(...sets.map(s => s.kg || 0)) : 0;
  if (!allTop) return { action: 'add-reps', load, reps: [lo, top] };
  if (noLoad(ex)) {
    const harder = ex.harder && exById[ex.harder] && profile && !blockReason(exById[ex.harder], profile) ? ex.harder : null;
    return harder ? { action: 'harder', exerciseId: harder, reps: [lo, hi] } : { action: 'slow-eccentric', eccentricSec: 3, reps: [lo, hi] };
  }
  const isDumbbell = ex.patternParams?.implement === 'dumbbell';
  if (isDumbbell) {
    const step = load < 10 ? Math.min(1, dumbbellStep) : dumbbellStep;
    if (!extendedRange && load > 0 && step / load > 0.10) return { action: 'extend-range', load, reps: [lo, hi + 3] };
    return { action: 'increase-load', load: load + step, reps: [lo, hi] };
  }
  const lower = ex.primary.some(m => LOWER.has(m) || ['adductors'].includes(m));
  return { action: 'increase-load', load: load + (lower ? 5 : 2.5), reps: [lo, hi] };
}
