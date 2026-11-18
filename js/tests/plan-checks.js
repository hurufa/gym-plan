// tests/plan-checks.js
// Acceptance criterion 1 as code: checkPlan() lists every rule a generated plan breaks, and
// profileMatrix() yields all 900 goal x days x equipment x experience x length combinations,
// each with no injury and with each single injury flag (3,600 profiles). No DOM: runs in the
// browser (tests.html) and in Node.

import { blockReason, groupMaps, countSets } from '../planner.js';

export const MATRIX = {
  goal: ['build-muscle', 'lose-fat', 'recomposition', 'get-stronger', 'general-fitness'],
  days: [2, 3, 4, 5, 6],
  equipment: ['full-gym', 'dumbbells', 'bodyweight'],
  experience: ['beginner', 'intermediate', 'advanced'],
  sessionLength: [45, 60, 75, 90],
  injuries: [[], ['knee'], ['lower-back'], ['shoulder']],
};

export function* profileMatrix() {
  for (const goal of MATRIX.goal) for (const days of MATRIX.days) for (const equipment of MATRIX.equipment)
    for (const experience of MATRIX.experience) for (const sessionLength of MATRIX.sessionLength) for (const injuries of MATRIX.injuries) {
      yield {
        goal, days, equipment, experience, sessionLength, injuries,
        // Home setups are tested without extras (the hardest case for coverage).
        pullupBar: equipment === 'full-gym', bands: equipment === 'full-gym',
        sex: 'female', age: 30, heightCm: 165, weightKg: 60, dailyLife: 'sitting', dailySteps: 5000,
      };
    }
}

export function checkPlan(plan, profile, data) {
  const errors = [];
  const exById = Object.fromEntries(data.exercises.map(e => [e.id, e]));
  const { groupOf, groups, major } = groupMaps(data.enums);
  const [, hi] = plan.range;
  if (plan.sessions.length !== profile.days) errors.push(`expected ${profile.days} sessions, got ${plan.sessions.length}`);
  for (const s of plan.sessions) {
    for (const e of s.exercises) {
      if (!e.exerciseId) continue;
      const ex = exById[e.exerciseId];
      if (!ex) { errors.push(`${s.key}: unknown exercise ${e.exerciseId}`); continue; }
      const r = blockReason(ex, profile);
      if (r === 'equipment') errors.push(`${s.key}: ${ex.id} needs other equipment`);
      if (r === 'injury') errors.push(`${s.key}: ${ex.id} carries a selected injury tag`);
      if (r === 'level') errors.push(`${s.key}: ${ex.id} is above the user's level`);
    }
    if (s.durationMin > profile.sessionLength) errors.push(`${s.key}: ${s.durationMin} min > ${profile.sessionLength}`);
    const main = s.exercises[0];
    if (main.role !== 'main' || !main.exerciseId || !(main.sets > 0)) errors.push(`${s.key}: main lift missing`);
  }
  const w = countSets(plan.sessions.flatMap(s => s.exercises), exById, groupOf, groups);
  for (const g of major) if (w[g] < 4) errors.push(`${g}: ${w[g]} weekly sets < 4`);
  for (const g of groups) if (w[g] > hi) errors.push(`${g}: ${w[g]} weekly sets > ${hi}`);
  return errors;
}

export const profileLabel = p => `${p.goal}/${p.days}d/${p.equipment}/${p.experience}/${p.sessionLength}m/${p.injuries.join('+') || 'none'}`;
