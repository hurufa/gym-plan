// plans.js
// Keeps the stored plan in step with the profile. ensurePlan() regenerates when there is no plan
// or the profile changed (training fields), keeping the split choice, edited days (when the number
// of days is unchanged) and manual swaps that are still valid. Also handles swaps, day edits,
// split choice and deload weeks. Planning rules live in planner.js.

import { getState, update, upsertRecord, deleteRecord, localDate, parseLocalDate } from './state.js';
import { loadData } from './data.js';
import { generatePlan, blockReason, TEMPLATES, deloadSuggestion, deloadSession } from './planner.js';
import { TRAINING_FIELDS } from './views/onboarding.js';

export async function planData() {
  const [exercises, enums, warmups] = await Promise.all([loadData('exercises'), loadData('enums'), loadData('warmups')]);
  return { exercises, enums, warmups, exById: Object.fromEntries(exercises.map(e => [e.id, e])) };
}

// A swap stays valid while its template/slot exists and the exercise is still allowed.
export function validSwap(sw, profile, exById) {
  return TEMPLATES[sw.templateId]?.includes(sw.slotId) && !blockReason(exById[sw.exerciseId], profile);
}

export function regenerate(data, changes = {}) {
  const s = getState();
  const prev = s.plan;
  const split = 'split' in changes ? changes.split : prev?.options?.split;
  const schedule = changes.schedule ?? (prev?.schedule?.length === s.profile.days ? prev.schedule : undefined);
  const swaps = s.swaps.filter(sw => validSwap(sw, s.profile, data.exById));
  const plan = generatePlan(s.profile, data, { split, schedule, swaps });
  // Swaps that no longer fit (new equipment, level or injury filter) are removed; say so once.
  if (swaps.length < s.swaps.length && !plan.notes.includes('swap-dropped')) plan.notes.push('swap-dropped');
  plan.options = { split: split ?? null };
  plan.createdAt = prev?.createdAt ?? Date.now();
  plan.updatedAt = Date.now();
  update(st => {
    st.plan = plan;
    st.swaps = swaps;
    delete st.profileChanged;
  });
  return plan;
}

export async function ensurePlan() {
  const s = getState();
  if (!s.profile) return null;
  const data = await planData();
  const p = s.plan;
  // Body-data edits only touch nutrition; training-field edits (or a missing plan) regenerate.
  const trainingChanged = s.profileChanged?.fields?.some(f => TRAINING_FIELDS.includes(f));
  if (!p || p.version !== 1 || trainingChanged) regenerate(data);
  else if (s.profileChanged) update(st => { delete st.profileChanged; st.plan.profileUpdatedAt = st.profile.updatedAt; });
  return { plan: getState().plan, data };
}

export function setSwap(data, templateId, slotId, exerciseId) {
  const existing = getState().swaps.find(sw => sw.templateId === templateId && sw.slotId === slotId);
  if (exerciseId) upsertRecord('swaps', { ...(existing || {}), templateId, slotId, exerciseId });
  else if (existing) deleteRecord('swaps', existing.id);
  return regenerate(data);
}

// Replacement options for a slot: the slot's own list plus the current exercise's alternatives,
// allowed for this profile and not already in the session.
export function swapOptions(data, session, entry, profile, slots) {
  const current = data.exById[entry.exerciseId];
  const used = new Set(session.exercises.map(e => e.exerciseId).filter(Boolean));
  const ids = [...new Set([...(slots[entry.slotId] || []), ...(current?.alternatives || [])])];
  return ids.filter(id => id !== entry.exerciseId && !used.has(id) && data.exById[id] && data.exById[id].pattern !== 'cardio' && !blockReason(data.exById[id], profile));
}

// ---- deload weeks ----
const DAY = 864e5;
export function activeDeload(s = getState(), today = new Date()) {
  const t = parseLocalDate(localDate(today)).getTime();
  return s.deloads.find(d => { const start = parseLocalDate(d.startDate).getTime(); return t >= start && t < start + 7 * DAY && !d.endedEarly; }) || null;
}
export function deloadOffer(s = getState(), history = {}) {
  if (activeDeload(s)) return null;
  const last = s.deloads.map(d => parseLocalDate(d.startDate).getTime()).sort((a, b) => b - a)[0] ?? null;
  return deloadSuggestion({ level: s.profile.experience, history, lastDeloadAt: last, trainingSince: s.plan?.createdAt ?? null });
}
export const startDeload = () => upsertRecord('deloads', { startDate: localDate() });
export function endDeload() {
  const d = activeDeload();
  if (d) upsertRecord('deloads', { ...d, endedEarly: true });
}
// Sessions as they should be trained this week (halved during a deload week).
export const sessionsForWeek = (plan, s = getState()) => (activeDeload(s) ? plan.sessions.map(deloadSession) : plan.sessions);
