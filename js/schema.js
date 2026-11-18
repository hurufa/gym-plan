// schema.js
// Validators for the content data files against enums.json. Each returns a list of readable
// problems (empty = valid). Used by tests.html and runnable in Node for quick checks
// (no DOM use). validateExercises checks single entries and the library as a whole;
// validateFoods and validateMealTemplates check foods.json and meal-templates.json.

import { isAvailable, SETUPS } from './equipment.js';

const HYPE = /\b(transform\w*|unleash\w*|journey|ultimate|game[- ]changer)\b/i;
const TIME_PROMISE = /\b(in|within|dalam)\s+\d+\s*(days?|weeks?|months?|hari|minggu|bulan)\b/i;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LANGS = ['en', 'id'];

const isText = v => typeof v === 'string' && v.trim().length > 0;
const sentences = s => (s.match(/[.!?](\s|$)/g) || []).length;

function checkBilingualText(e, field, errors, { minLen = 1 } = {}) {
  const v = e[field];
  for (const l of LANGS) {
    if (!v || !isText(v[l])) errors.push(`${e.id}: ${field}.${l} missing`);
    else if (v[l].length < minLen) errors.push(`${e.id}: ${field}.${l} too short (${v[l].length} chars)`);
    else if (HYPE.test(v[l])) errors.push(`${e.id}: ${field}.${l} uses a banned hype word`);
  }
}
function checkBilingualList(e, field, errors, { min = 1, exact = null } = {}) {
  const v = e[field];
  if (!v || !Array.isArray(v.en) || !Array.isArray(v.id)) { errors.push(`${e.id}: ${field} must be {en:[], id:[]}`); return; }
  for (const l of LANGS) {
    if (exact !== null && v[l].length !== exact) errors.push(`${e.id}: ${field}.${l} needs exactly ${exact} items, has ${v[l].length}`);
    if (v[l].length < min) errors.push(`${e.id}: ${field}.${l} needs at least ${min} items`);
    v[l].forEach((s, i) => { if (!isText(s)) errors.push(`${e.id}: ${field}.${l}[${i}] empty`); else if (HYPE.test(s)) errors.push(`${e.id}: ${field}.${l}[${i}] hype word`); });
  }
  if (v.en.length !== v.id.length) errors.push(`${e.id}: ${field} has ${v.en.length} en items but ${v.id.length} id items`);
}

export function validateExercise(e, enums, allIds) {
  const errors = [];
  const ids = key => new Set(enums[key].map(x => x.id));
  const muscles = ids('muscles'), patterns = ids('patterns'), equipment = ids('equipment'), levels = ids('levels'), stress = ids('stress');
  const id = e?.id ?? '(no id)';
  if (!isText(e?.id) || !ID_RE.test(e.id)) errors.push(`${id}: id must be kebab-case`);
  for (const l of LANGS) if (!isText(e.name?.[l])) errors.push(`${id}: name.${l} missing`);

  if (!Array.isArray(e.primary) || !e.primary.length) errors.push(`${id}: primary must list at least one muscle`);
  if (!Array.isArray(e.secondary)) errors.push(`${id}: secondary must be an array`);
  for (const m of [...(e.primary || []), ...(e.secondary || [])]) if (!muscles.has(m)) errors.push(`${id}: unknown muscle "${m}"`);
  for (const m of e.primary || []) if ((e.secondary || []).includes(m)) errors.push(`${id}: "${m}" is both primary and secondary`);

  if (!Array.isArray(e.equipment) || !e.equipment.length) errors.push(`${id}: equipment missing`);
  else {
    for (const q of e.equipment) if (!equipment.has(q)) errors.push(`${id}: unknown equipment "${q}"`);
    if (!e.equipment.some(q => SETUPS.includes(q))) errors.push(`${id}: equipment must include a setup (${SETUPS.join(', ')})`);
  }
  if (!patterns.has(e.pattern)) errors.push(`${id}: unknown pattern "${e.pattern}"`);
  if (!e.patternParams || typeof e.patternParams !== 'object') errors.push(`${id}: patternParams missing`);
  else for (const [k, v] of Object.entries(e.patternParams)) {
    const allowed = enums.patternParams[k];
    if (!allowed) errors.push(`${id}: unknown patternParams key "${k}"`);
    else if (!allowed.includes(v)) errors.push(`${id}: patternParams.${k} "${v}" not in enums`);
  }
  if (!levels.has(e.level)) errors.push(`${id}: unknown level "${e.level}"`);
  if (!Array.isArray(e.stress)) errors.push(`${id}: stress must be an array`);
  else for (const s of e.stress) if (!stress.has(s)) errors.push(`${id}: unknown stress "${s}"`);
  if (typeof e.bodyweight !== 'boolean') errors.push(`${id}: bodyweight must be true/false`);
  if (e.bodyweight && !['bodyweight', 'pull-up-bar'].includes(e.patternParams?.implement)) errors.push(`${id}: bodyweight exercise must use implement bodyweight or pull-up-bar`);
  if (!e.bodyweight && ['bodyweight', 'pull-up-bar'].includes(e.patternParams?.implement)) errors.push(`${id}: implement is bodyweight but bodyweight is false`);

  for (const k of ['easier', 'harder']) {
    if (e[k] !== null && (typeof e[k] !== 'string' || !allIds.has(e[k]))) errors.push(`${id}: ${k} "${e[k]}" is not an exercise id`);
    if (e[k] === e.id) errors.push(`${id}: ${k} points to itself`);
  }
  if (!Array.isArray(e.alternatives) || !e.alternatives.length) errors.push(`${id}: alternatives must list at least one id`);
  else for (const a of e.alternatives) {
    if (!allIds.has(a)) errors.push(`${id}: alternative "${a}" does not exist`);
    if (a === e.id) errors.push(`${id}: lists itself as an alternative`);
  }

  checkBilingualText(e, 'builds', errors, { minLen: 120 });
  checkBilingualText(e, 'role', errors, { minLen: 60 });
  for (const l of LANGS) {
    const b = e.builds?.[l];
    if (isText(b)) {
      const n = sentences(b);
      if (n < 2 || n > 3) errors.push(`${id}: builds.${l} should be 2-3 sentences, has ${n}`);
      if (TIME_PROMISE.test(b)) errors.push(`${id}: builds.${l} promises a result in a set time`);
    }
  }
  checkBilingualList(e, 'steps', errors, { min: 3 });
  checkBilingualList(e, 'cues', errors, { exact: 3 });
  checkBilingualList(e, 'mistakes', errors, { min: 2 });
  return errors;
}

// Library-level checks: count, uniqueness, coverage per setup and per pattern.
export function validateExercises(list, enums) {
  const errors = [];
  if (!Array.isArray(list)) return ['exercises.json must be an array'];
  if (list.length < 45) errors.push(`need at least 45 exercises, have ${list.length}`);
  const allIds = new Set(list.map(e => e.id));
  if (allIds.size !== list.length) errors.push('duplicate exercise ids');
  for (const e of list) errors.push(...validateExercise(e, enums, allIds));

  for (const l of LANGS) {
    const seen = new Map();
    for (const e of list) {
      const b = e.builds?.[l]?.trim();
      if (!b) continue;
      if (seen.has(b)) errors.push(`builds.${l} identical for ${seen.get(b)} and ${e.id}`);
      seen.set(b, e.id);
      // No two exercises may share any single builds sentence either.
    }
    const sentenceOwner = new Map();
    for (const e of list) for (const s of (e.builds?.[l] || '').split(/(?<=[.!?])\s+/)) {
      const k = s.trim().toLowerCase();
      if (k.length < 20) continue;
      if (sentenceOwner.has(k) && sentenceOwner.get(k) !== e.id) errors.push(`builds.${l} sentence shared by ${sentenceOwner.get(k)} and ${e.id}: "${s}"`);
      sentenceOwner.set(k, e.id);
    }
  }

  const groupOf = Object.fromEntries(enums.muscles.map(m => [m.id, m.group]));
  const lifting = list.filter(e => e.pattern !== 'cardio');
  for (const setup of SETUPS) {
    for (const extras of [{}, { pullupBar: true, bands: true }]) {
      const avail = lifting.filter(e => isAvailable(e, setup, extras));
      for (const g of enums.groups) {
        if (!avail.some(e => e.primary.some(m => groupOf[m] === g.id))) {
          errors.push(`no exercise with ${g.id} as primary for setup ${setup}${extras.bands ? ' + extras' : ''}`);
        }
      }
    }
    if (!list.some(e => e.pattern === 'cardio' && isAvailable(e, setup))) errors.push(`no cardio option for ${setup}`);
  }
  for (const p of enums.patterns) if (!list.some(e => e.pattern === p.id)) errors.push(`pattern ${p.id} has no exercise`);
  // Every alternative should train an overlapping muscle group.
  for (const e of list) {
    const groups = new Set(e.primary.map(m => groupOf[m]));
    for (const a of e.alternatives || []) {
      const alt = list.find(x => x.id === a);
      if (alt && !alt.primary.some(m => groups.has(groupOf[m]))) errors.push(`${e.id}: alternative ${a} trains different primary groups`);
    }
  }
  return errors;
}

// ---- Foods and meal templates (phase 7) ----

// Atwater check: kcal must be within 10% of 4 x protein + 4 x carbs + 9 x fat.
export const macroKcal = f => 4 * f.protein + 4 * f.carbs + 9 * f.fat;
export const kcalDeviation = f => (f.kcal - macroKcal(f)) / macroKcal(f);

const FORBIDDEN_FOOD = /\b(babi|pork|bacon|ham|lard|lemak babi|wine|beer|bir|arak|rum|sake|mirin|ang ?ciu|alkohol|alcohol|tuak|brem)\b/i;
const MEAT_TAGS = ['beef', 'seafood'];
const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fiber'];
// Foods CLAUDE.md names as required (matched on the Indonesian name).
export const REQUIRED_FOODS = ['nasi putih', 'nasi merah', 'kentang', 'ubi', 'oatmeal', 'roti gandum', 'dada ayam', 'telur', 'tempe', 'tahu',
  'tongkol', 'lele', 'daging sapi', 'susu', 'yoghurt', 'kacang', 'bayam', 'kangkung', 'brokoli', 'pisang', 'pepaya', 'apel', 'whey'];

export function validateFoods(list, enums) {
  const errors = [];
  if (!Array.isArray(list)) return ['foods.json must be an array'];
  if (list.length < 60) errors.push(`only ${list.length} foods, need at least 60`);
  const ids = key => new Set(enums[key].map(x => x.id));
  const states = ids('foodStates'), tags = ids('foodTags'), slots = ids('foodSlots');
  const seen = new Set();
  for (const f of list) {
    const id = f?.id ?? '(no id)';
    if (!isText(f?.id) || !ID_RE.test(f.id)) errors.push(`${id}: id must be kebab-case`);
    if (seen.has(id)) errors.push(`${id}: duplicate id`);
    seen.add(id);
    checkBilingualText(f, 'name', errors);
    for (const l of LANGS) if (FORBIDDEN_FOOD.test(f.name?.[l] || '')) errors.push(`${id}: name.${l} names pork or alcohol`);
    if (!states.has(f.state)) errors.push(`${id}: unknown state "${f.state}"`);
    if (!Array.isArray(f.slots) || !f.slots.length) errors.push(`${id}: slots must be a non-empty list`);
    else for (const s of f.slots) if (!slots.has(s)) errors.push(`${id}: unknown slot "${s}"`);
    for (const k of NUTRIENTS) if (typeof f[k] !== 'number' || !(f[k] >= 0)) errors.push(`${id}: ${k} must be a number >= 0`);
    // carbs is total carbohydrate and already includes fiber.
    if (f.protein + f.carbs + f.fat > 100) errors.push(`${id}: macros add up to more than 100 g per 100 g`);
    if (f.fiber > f.carbs && f.carbs > 0) errors.push(`${id}: fiber is more than total carbs`);
    if (macroKcal(f) > 0 && Math.abs(kcalDeviation(f)) > 0.1) errors.push(`${id}: kcal ${f.kcal} is ${Math.round(kcalDeviation(f) * 100)}% off 4P+4C+9F = ${Math.round(macroKcal(f))}`);
    const p = f.portion;
    if (!p || !(p.g > 0) || typeof p.unit !== 'boolean') errors.push(`${id}: portion needs g > 0 and unit (true/false)`);
    else checkBilingualText({ id, label: p.label }, 'label', errors);
    if (!Number.isInteger(f.price_idr) || f.price_idr <= 0) errors.push(`${id}: price_idr must be a positive whole number of Rupiah`);
    if (!Array.isArray(f.tags)) errors.push(`${id}: tags must be a list`);
    else {
      for (const t of f.tags) if (!tags.has(t)) errors.push(`${id}: unknown tag "${t}"`);
      if (f.tags.includes('vegetarian') && f.tags.some(t => MEAT_TAGS.includes(t))) errors.push(`${id}: vegetarian food tagged ${f.tags.filter(t => MEAT_TAGS.includes(t))}`);
    }
    if (!(f.source === 'estimate' || /^TKPI [A-Z]{2}\d{4}$/.test(f.source || ''))) errors.push(`${id}: source must be "TKPI <code>" or "estimate"`);
    if (f.source === 'estimate' && !isText(f.note)) errors.push(`${id}: estimate needs a note saying why`);
  }
  const names = list.map(f => f.name?.id?.toLowerCase() || '');
  for (const r of REQUIRED_FOODS) if (!names.some(n => n.includes(r))) errors.push(`required food missing: ${r}`);
  for (const s of slots) if (!list.some(f => f.slots?.includes(s))) errors.push(`no food for slot ${s}`);
  return errors;
}

// Day totals from the template's default portions (before nutrition.js scales them).
export function menuTotals(menu, byId) {
  const items = menu.meals.flatMap(m => m.items);
  const sum = k => items.reduce((a, i) => a + (byId[i.food]?.[k] || 0) * i.g / 100, 0);
  return { kcal: sum('kcal'), protein: sum('protein'),
    vegetableG: items.filter(i => i.slot === 'vegetable').reduce((a, i) => a + i.g, 0),
    fruitPortions: items.filter(i => i.slot === 'fruit').length };
}

export function validateMealTemplates(tpl, foods, enums) {
  const errors = [];
  const menus = tpl?.menus;
  if (!Array.isArray(menus)) return ['meal-templates.json needs a menus list'];
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const types = new Set(enums.mealTypes.map(x => x.id)), goals = new Set(enums.goals);
  const seen = new Set(), signatures = new Map();
  for (const m of menus) {
    const id = m?.id ?? '(no id)';
    if (!isText(m?.id) || !ID_RE.test(m.id)) errors.push(`${id}: id must be kebab-case`);
    if (seen.has(id)) errors.push(`${id}: duplicate id`);
    seen.add(id);
    checkBilingualText(m, 'name', errors);
    if (!Array.isArray(m.goals) || !m.goals.length) errors.push(`${id}: goals must be a non-empty list`);
    else for (const g of m.goals) if (!goals.has(g)) errors.push(`${id}: unknown goal "${g}"`);
    const meals = m.meals || [];
    const main = meals.filter(x => x.type !== 'snack').length, snacks = meals.length - main;
    if (main < 3 || main > 4) errors.push(`${id}: ${main} meals, need 3 or 4`);
    if (snacks < 1 || snacks > 2) errors.push(`${id}: ${snacks} snacks, need 1 or 2`);
    meals.forEach((ml, i) => {
      const mid = `${id} meal ${i + 1}`;
      if (!types.has(ml.type)) errors.push(`${mid}: unknown meal type "${ml.type}"`);
      checkBilingualText({ id: mid, ...ml }, 'name', errors);
      checkBilingualText({ id: mid, ...ml }, 'prep', errors, { minLen: 15 });
      if (!ml.items?.length) errors.push(`${mid}: no items`);
      for (const it of ml.items || []) {
        const f = byId[it.food];
        if (!f) errors.push(`${mid}: food "${it.food}" does not exist`);
        else if (!f.slots.includes(it.slot)) errors.push(`${mid}: ${it.food} cannot fill slot ${it.slot}`);
        if (!Number.isInteger(it.g) || it.g <= 0) errors.push(`${mid}: ${it.food} needs whole grams > 0`);
      }
      if (ml.type !== 'snack' && !(ml.items || []).some(it => it.slot === 'protein')) errors.push(`${mid}: main meal without a protein slot`);
    });
    if (meals.every(ml => (ml.items || []).every(it => byId[it.food]))) {
      const t = menuTotals(m, byId);
      if (t.vegetableG < 300) errors.push(`${id}: ${t.vegetableG} g vegetables, need 300`);
      if (t.fruitPortions < 2) errors.push(`${id}: ${t.fruitPortions} fruit portions, need 2`);
    }
    const sig = meals.flatMap(ml => (ml.items || []).map(it => it.food)).sort().join();
    if (signatures.has(sig)) errors.push(`${id}: same foods as ${signatures.get(sig)}`);
    signatures.set(sig, id);
  }
  for (const g of enums.goals) {
    const n = menus.filter(m => m.goals?.includes(g)).length;
    if (n < 5) errors.push(`goal ${g}: ${n} daily menus, need at least 5`);
  }
  return errors;
}

// ---- Glossary (phase 10) ----

// Terms CLAUDE.md requires in the Learn section, plus the growth mechanism and estimated 1RM.
export const REQUIRED_TERMS = ['progressive-overload', 'sets-reps', 'rir', 'rpe', 'ramp-up-sets', 'rest-periods', 'deload', 'compound-isolation',
  'training-volume', 'tdee', 'bmr', 'deficit-surplus', 'macros', 'protein-timing', 'sleep-recovery', 'doms', 'warm-up', 'splits', 'days-per-week',
  'growth-mechanism', 'e1rm'];
const GLOSSARY_GROUPS = ['training', 'plan', 'nutrition', 'recovery'];

export function validateGlossary(list) {
  const errors = [];
  if (!Array.isArray(list)) return ['glossary.json must be an array'];
  const ids = new Set(list.map(e => e.id));
  for (const r of REQUIRED_TERMS) if (!ids.has(r)) errors.push(`missing required term ${r}`);
  const aliasOwner = { en: new Map(), id: new Map() };
  for (const e of list) {
    if (!isText(e.id) || !ID_RE.test(e.id)) errors.push(`${e.id}: id must be kebab-case`);
    if (!GLOSSARY_GROUPS.includes(e.group)) errors.push(`${e.id}: unknown group "${e.group}"`);
    checkBilingualText(e, 'term', errors);
    checkBilingualText(e, 'short', errors, { minLen: 40 });
    checkBilingualText(e, 'example', errors, { minLen: 20 });
    checkBilingualList(e, 'body', errors, { min: 2 });
    for (const l of LANGS) {
      if ((e.short?.[l] || '').length > 320) errors.push(`${e.id}: short.${l} is too long for a popover`);
      const aliases = e.aliases?.[l];
      if (!Array.isArray(aliases) || !aliases.length) { errors.push(`${e.id}: aliases.${l} missing`); continue; }
      for (const a of aliases) {
        const k = a.toLowerCase();
        if (aliasOwner[l].has(k)) errors.push(`alias "${a}" (${l}) used by ${aliasOwner[l].get(k)} and ${e.id}`);
        aliasOwner[l].set(k, e.id);
      }
    }
    for (const r of e.related || []) if (!ids.has(r)) errors.push(`${e.id}: related "${r}" does not exist`);
  }
  return errors;
}
