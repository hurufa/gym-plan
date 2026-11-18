// nutrition.js
// Nutrition rules as pure functions (no DOM): BMR (Mifflin-St Jeor), TDEE, the calorie target with
// its guardrails, macro targets, the weight-trend checks (fast loss, calibration, profile weight),
// and meal-plan assembly from meal-templates.json: filters, substitutes, swaps, scaling portions to
// the protein and calorie targets, rounding, and the protein fallback. Used by views/nutrition.js
// and tests. Every result carries the numbers behind it so the page can show the calculation.

import { parseLocalDate, localDate } from './state.js';

export const LIFE_FACTORS = { sitting: 1.2, 'some-walking': 1.35, 'on-feet': 1.5, labour: 1.7 };
export const PER_TRAINING_DAY = 0.025;

// Calorie adjustment in % of TDEE: default and the slider range [min, max] per goal.
// CLAUDE.md lists four ranges for five goals; the two 0% goals share 0 to +5%.
export const ADJUST = {
  'build-muscle': { def: 10, defAdvanced: 5, range: [5, 10] },
  'lose-fat': { def: -20, range: [-25, -15] },
  recomposition: { def: -5, range: [-10, 0] },
  'get-stronger': { def: 0, range: [0, 5] },
  'general-fitness': { def: 0, range: [0, 5] },
};

export const PROTEIN = { min: 1.6, def: 1.8, deficit: 2.2, max: 2.2 };
export const FAT = { min: 0.6, def: 0.8, floor: 0.5 };
export const MIN_CARBS = 100;
export const KCAL_TOL = 0.05, PROTEIN_TOL = 10, MAX_PROTEIN_FOOD_G = 300;
export const FILTER_TAGS = ['beef', 'dairy', 'seafood', 'egg', 'nuts'];

const round = (n, step = 1) => Math.round(n / step) * step;

export const bmi = p => p.weightKg / (p.heightCm / 100) ** 2;
export function bmr(p) {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}
export const activityFactor = p => LIFE_FACTORS[p.dailyLife] + PER_TRAINING_DAY * p.days;
export const tdee = p => bmr(p) * activityFactor(p);

export function adjustRange(p) {
  const a = ADJUST[p.goal];
  return { def: p.goal === 'build-muscle' && p.experience === 'advanced' ? a.defAdvanced : a.def, range: a.range };
}

// Calorie target with the guardrails, in order:
// (1) under 18, or BMI under 18.5 with a deficit goal: no deficit (maintenance) and the reason.
// (2) never below BMR; when the floor applies, report the smaller deficit.
// adjustPct: the slider value (null = goal default). offsetKcal: accepted calibration/fast-loss changes.
export function calorieTarget(p, { adjustPct = null, offsetKcal = 0 } = {}) {
  const b = bmr(p), factor = activityFactor(p), t = b * factor, bmiV = bmi(p);
  const { def, range } = adjustRange(p);
  let pct = adjustPct == null ? def : Math.min(range[1], Math.max(range[0], adjustPct));
  const notes = [];
  let locked = false;
  if (pct < 0 && (p.age < 18 || (bmiV < 18.5 && (p.goal === 'lose-fat' || p.goal === 'recomposition')))) {
    notes.push({ code: p.age < 18 ? 'under-18' : 'low-bmi', bmi: bmiV });
    pct = 0;
    locked = true;
  }
  let kcal = t * (1 + pct / 100) + (locked ? 0 : offsetKcal);
  if (kcal < b) {
    notes.push({ code: 'bmr-floor', wanted: round(kcal, 10), pct: round((b / t - 1) * 100, 0.1) });
    kcal = b;
  }
  kcal = round(kcal, 10);
  return { bmr: b, factor, lifeFactor: LIFE_FACTORS[p.dailyLife], tdee: t, bmi: bmiV, pct, defaultPct: def, range, offsetKcal: locked ? 0 : offsetKcal,
    kcal, effectivePct: round((kcal / t - 1) * 100, 0.1), deficit: kcal < t * 0.99, locked, notes };
}

// Weight used for g/kg targets: actual weight, or the weight at BMI 25 when BMI is over 30.
export const referenceWeight = p => (bmi(p) > 30 ? 25 * (p.heightCm / 100) ** 2 : p.weightKg);

// Protein and fat in g/kg of the reference weight, carbs fill the rest. If carbs fall under 100 g,
// fat goes down toward 0.6 g/kg, then protein toward 1.6 g/kg; every change is listed.
export function macroTargets(p, cal) {
  const w = referenceWeight(p);
  let proteinPerKg = cal.deficit ? PROTEIN.deficit : PROTEIN.def;
  let fatPerKg = FAT.def;
  const carbsFor = () => (cal.kcal - 4 * proteinPerKg * w - 9 * fatPerKg * w) / 4;
  const changes = [];
  if (carbsFor() < MIN_CARBS) {
    const from = fatPerKg;
    fatPerKg = Math.max(FAT.min, (cal.kcal - 4 * proteinPerKg * w - 4 * MIN_CARBS) / 9 / w);
    if (fatPerKg < from) changes.push({ code: 'fat-lowered', from, to: round(fatPerKg, 0.01) });
  }
  if (carbsFor() < MIN_CARBS) {
    const from = proteinPerKg;
    proteinPerKg = Math.max(PROTEIN.min, (cal.kcal - 9 * fatPerKg * w - 4 * MIN_CARBS) / 4 / w);
    if (proteinPerKg < from) changes.push({ code: 'protein-lowered', from, to: round(proteinPerKg, 0.01) });
  }
  const protein = round(proteinPerKg * w), fat = round(Math.max(fatPerKg, FAT.floor) * w);
  const carbs = Math.max(0, round((cal.kcal - 4 * protein - 9 * fat) / 4));
  if (carbs < MIN_CARBS) changes.push({ code: 'carbs-still-low', carbs });
  return { refWeight: w, usesBmi25: w !== p.weightKg, proteinPerKg, fatPerKg, protein, fat, carbs, changes };
}

export function targets(p, prefs = {}) {
  const cal = calorieTarget(p, prefs);
  return { cal, macros: macroTargets(p, cal) };
}

// ---------- Weight trend ----------

const dayNum = d => Math.round(parseLocalDate(d).getTime() / 864e5);
const sortedWeights = list => [...list].filter(w => w.kg > 0 && w.date).sort((a, b) => (a.date < b.date ? -1 : 1));

// Average of the weigh-ins in the 7 days ending on `date` (null if none).
export function avg7(weights, date) {
  const end = dayNum(date);
  const xs = weights.filter(w => { const d = dayNum(w.date); return d <= end && d > end - 7; }).map(w => w.kg);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

// Guardrail 3 (Lose fat): the 7-day average dropped more than 1% of body weight per week, two weeks
// running -> suggest raising calories by 10%.
export function fastLossCheck(p, weights, today = localDate()) {
  if (p.goal !== 'lose-fat') return null;
  const ws = sortedWeights(weights);
  const t0 = parseLocalDate(today);
  const at = k => { const d = new Date(t0); d.setDate(d.getDate() - 7 * k); return avg7(ws, localDate(d)); };
  const [a0, a1, a2] = [at(0), at(1), at(2)];
  if (a0 == null || a1 == null || a2 == null) return null;
  const drop1 = (a1 - a0) / a1, drop2 = (a2 - a1) / a2;
  return drop1 > 0.01 && drop2 > 0.01 ? { code: 'fast-loss', drops: [round(drop2 * 100, 0.1), round(drop1 * 100, 0.1)], raisePct: 10 } : null;
}

// Least-squares slope in kg per day.
function slope(points) {
  const n = points.length, mx = points.reduce((a, q) => a + q[0], 0) / n, my = points.reduce((a, q) => a + q[1], 0) / n;
  const num = points.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0), den = points.reduce((a, q) => a + (q[0] - mx) ** 2, 0);
  return den ? num / den : 0;
}

// Calibration: after 14 days with at least 10 weigh-ins, compare the weight trend with the change
// the target predicts (7,700 kcal per kg) and offer a 100-200 kcal change when they disagree by
// 100 kcal a day or more. Not offered again within 14 days of the last calibration.
export const KCAL_PER_KG = 7700;
export function calibrationCheck(cal, weights, today = localDate(), lastCalibratedAt = null) {
  const end = dayNum(today);
  if (lastCalibratedAt && end - dayNum(lastCalibratedAt) < 14) return null;
  const ws = sortedWeights(weights);
  if (!ws.length || end - dayNum(ws[0].date) < 14) return null;
  const recent = ws.filter(w => end - dayNum(w.date) < 14);
  if (recent.length < 10) return null;
  const actualPerWeek = slope(recent.map(w => [dayNum(w.date), w.kg])) * 7;
  const expectedPerWeek = (cal.kcal - cal.tdee) * 7 / KCAL_PER_KG;
  const gapKcal = (actualPerWeek - expectedPerWeek) * KCAL_PER_KG / 7; // + = gaining more than predicted
  if (Math.abs(gapKcal) < 100) return { code: 'on-track', actualPerWeek, expectedPerWeek, weighIns: recent.length };
  const change = -Math.sign(gapKcal) * Math.min(200, Math.max(100, round(Math.abs(gapKcal), 50)));
  return { code: 'adjust', actualPerWeek, expectedPerWeek, gapKcal, change, weighIns: recent.length };
}

// Offer to recalculate when the latest logged weight is 2 kg or more away from the profile weight.
export function profileWeightCheck(p, weights) {
  const last = sortedWeights(weights).at(-1);
  return last && Math.abs(last.kg - p.weightKg) >= 2 ? { code: 'recalc', kg: last.kg, date: last.date, profileKg: p.weightKg } : null;
}

// ---------- Foods, filters and substitutes ----------

export const defaultPrefs = () => ({ adjustPct: null, offsetKcal: 0, lastCalibratedAt: null, filters: { budget: false, vegetarian: false, ...Object.fromEntries(FILTER_TAGS.map(t => [t, false])) }, never: [], swaps: {}, updatedAt: 0 });
export const prefsOf = st => { const d = defaultPrefs(); const n = st.nutrition || {}; return { ...d, ...n, filters: { ...d.filters, ...(n.filters || {}) } }; };

export function allowed(food, prefs) {
  if (prefs.never?.includes(food.id)) return false;
  const f = prefs.filters || {};
  if (f.vegetarian && !food.tags.includes('vegetarian')) return false;
  return !FILTER_TAGS.some(t => f[t] && food.tags.includes(t));
}

// Distance between two foods per 100 g (protein, carbs, fat, kcal), used for "similar macros".
export const distance = (a, b) => Math.hypot((a.protein - b.protein) / 5, (a.carbs - b.carbs) / 10, (a.fat - b.fat) / 5, (a.kcal - b.kcal) / 50);
// Price per useful unit for budget mode: per gram of protein in the protein slot, per kcal otherwise
// (vegetables and fruit: per 100 g).
export function unitPrice(food, slot) {
  if (slot === 'protein') return food.price_idr / Math.max(food.protein, 0.5);
  if (slot === 'vegetable' || slot === 'fruit') return food.price_idr;
  return food.price_idr / Math.max(food.kcal, 1);
}

// Foods that can replace `food` in `slot`, most similar first (budget mode: cheapest of the
// 5 most similar first).
export function alternatives(food, slot, foods, prefs, exclude = []) {
  const list = foods.filter(f => f.id !== food.id && f.slots.includes(slot) && allowed(f, prefs) && !exclude.includes(f.id))
    .sort((a, b) => distance(a, food) - distance(b, food));
  if (!prefs.filters?.budget) return list;
  const near = list.slice(0, 5).sort((a, b) => unitPrice(a, slot) - unitPrice(b, slot));
  return [...near, ...list.slice(5)];
}

// The food used for a template item after swaps, filters and budget mode.
function resolveFood(item, key, byId, foods, prefs, usedInMeal, usedInDay = []) {
  const swapped = prefs.swaps?.[key];
  if (swapped && byId[swapped] && byId[swapped].slots.includes(item.slot) && allowed(byId[swapped], prefs)) return { food: byId[swapped], reason: 'swap' };
  const base = byId[item.food];
  if (allowed(base, prefs) && !prefs.filters?.budget) return { food: base, reason: null };
  // Prefer a substitute not used elsewhere that day, for variety.
  const fresh = alternatives(base, item.slot, foods, prefs, [...usedInMeal, ...usedInDay]);
  const alts = fresh.length ? fresh : alternatives(base, item.slot, foods, prefs, usedInMeal);
  if (allowed(base, prefs)) {
    // Budget mode: keep the default unless a similar food is cheaper.
    const cheaper = alts.slice(0, 5).find(f => distance(f, base) < 4 && unitPrice(f, item.slot) < unitPrice(base, item.slot) * 0.8);
    return cheaper ? { food: cheaper, reason: 'budget' } : { food: base, reason: null };
  }
  return alts[0] ? { food: alts[0], reason: 'filter' } : { food: null, reason: 'filter' };
}

// ---------- Scaling ----------

// Per-item gram limits. Protein foods: at most 300 g (dry foods such as whey: twice the portion).
function bounds(item, food) {
  const g0 = item.g;
  switch (item.slot) {
    case 'protein': return [Math.max(food.portion.unit ? food.portion.g : 20, round(g0 * 0.3, 5)), food.state === 'dry' ? g0 * 2 : MAX_PROTEIN_FOOD_G];
    case 'carb': return [Math.max(food.portion.unit ? food.portion.g : 15, round(g0 * 0.25, 5)), g0 * 4];
    case 'fat': return [Math.max(food.portion.unit ? food.portion.g : 5, round(g0 * 0.5, 5)), g0 * 3];
    default: return [g0, g0]; // vegetables and fruit keep their portions
  }
}

const sumOf = (items, k) => items.reduce((a, i) => a + i.food[k] * i.g / 100, 0);
export const dayTotals = items => ({ kcal: sumOf(items, 'kcal'), protein: sumOf(items, 'protein'), carbs: sumOf(items, 'carbs'), fat: sumOf(items, 'fat'), fiber: sumOf(items, 'fiber') });

function applyScale(items, s) {
  for (const i of items) { const k = s[i.slot]; if (k != null) i.g = Math.min(i.max, Math.max(i.min, i.g0 * k)); }
}
// Smallest scale in [0, 20] for `slot` where fn(totals) reaches the goal (fn rises with the scale).
function solveScale(items, s, slot, fn, goal) {
  let lo = 0, hi = 20;
  for (let n = 0; n < 40; n++) {
    const mid = (lo + hi) / 2;
    applyScale(items, { ...s, [slot]: mid });
    if (fn(dayTotals(items)) < goal) lo = mid; else hi = mid;
  }
  s[slot] = hi;
  applyScale(items, s);
}

// Rounds to 5 g (whole pieces for unit foods), then nudges single items in 5 g steps until the day
// is inside the tolerances (or nothing more can move).
function roundAndTune(items, kcal, protein) {
  for (const i of items) {
    if (i.food.portion.unit) i.g = Math.max(1, Math.round(i.g / i.food.portion.g)) * i.food.portion.g;
    else i.g = Math.max(5, round(i.g, 5));
  }
  const movable = slot => items.filter(i => i.slot === slot && !i.food.portion.unit);
  for (let n = 0; n < 200; n++) {
    const t = dayTotals(items);
    const dP = protein - t.protein, dK = kcal - t.kcal;
    let pick = null, step = 0;
    if (Math.abs(dP) > PROTEIN_TOL - 3) {
      const c = movable('protein').filter(i => (dP > 0 ? i.g + 5 <= i.max : i.g - 5 >= i.min)).sort((a, b) => b.food.protein - a.food.protein)[0];
      if (c) { pick = c; step = Math.sign(dP) * 5; }
    }
    if (!pick && Math.abs(dK) > kcal * (KCAL_TOL - 0.015)) {
      const c = [...movable('carb'), ...movable('fat')].filter(i => (dK > 0 ? i.g + 5 <= i.max : i.g - 5 >= i.min)).sort((a, b) => b.food.kcal - a.food.kcal)[0];
      if (c) { pick = c; step = Math.sign(dK) * 5; }
    }
    if (!pick) break;
    pick.g += step;
  }
}

function scaleDay(items, kcal, protein) {
  const s = { protein: 1, carb: 1, fat: 1 };
  applyScale(items, s);
  for (let n = 0; n < 12; n++) {
    solveScale(items, s, 'protein', t => t.protein, protein);
    // Carbs carry the calories; fat moves only when carbs hit a limit.
    s.fat = 1;
    solveScale(items, s, 'carb', t => t.kcal, kcal);
    const k = dayTotals(items).kcal;
    if (Math.abs(k - kcal) > kcal * 0.01) solveScale(items, s, 'fat', t => t.kcal, kcal);
  }
  roundAndTune(items, kcal, protein);
}

const FAMILIES = ['soy', 'egg', 'dairy', 'seafood', 'beef'];
const family = f => FAMILIES.find(t => f.tags.includes(t)) || (f.slots.includes('carb') ? 'legume' : 'poultry');
const proteinDensity = f => f.protein / Math.max(f.kcal, 1);

// Replaces the protein item with the lowest protein per kcal by a food with at least 15% more
// protein per kcal: the same kind of food first, then the most similar. Returns the item or null.
function leanerSwap(all, meals, foods, prefs) {
  const items = all.filter(i => i.slot === 'protein' && i.reason !== 'swap').sort((a, b) => proteinDensity(a.food) - proteinDensity(b.food));
  for (const it of items) {
    const meal = meals.find(m => m.items.includes(it));
    const used = meal.items.map(i => i.food.id);
    const better = foods.filter(f => f.slots.includes('protein') && allowed(f, prefs) && !used.includes(f.id) && proteinDensity(f) > proteinDensity(it.food) * 1.15)
      .sort((a, b) => (family(b) === family(it.food)) - (family(a) === family(it.food)) || distance(a, it.food) - distance(b, it.food))[0];
    if (!better) continue;
    it.food = better;
    it.reason = 'lean';
    [it.min, it.max] = bounds({ slot: it.slot, g: it.g0 }, better);
    meal.changed = true;
    return it;
  }
  return null;
}

// Builds one day from a menu: resolve foods, scale, round. Returns meals with items and totals,
// plus the check against the targets.
export function assembleDay(menu, foods, tg, prefs = defaultPrefs()) {
  const byId = Object.fromEntries(foods.map(f => [f.id, f]));
  const missing = [], usedInDay = [];
  const meals = menu.meals.map((m, mi) => {
    const used = [];
    const items = [];
    m.items.forEach((it, ii) => {
      const key = `${menu.id}:${mi}:${ii}`;
      const r = resolveFood(it, key, byId, foods, prefs, used, usedInDay);
      if (!r.food) { missing.push({ key, slot: it.slot, food: it.food }); return; }
      used.push(r.food.id);
      if (r.reason) usedInDay.push(r.food.id);
      const [min, max] = bounds(it, r.food);
      items.push({ key, slot: it.slot, defaultFood: it.food, food: r.food, reason: r.reason, g0: it.g, g: it.g, min, max });
    });
    return { type: m.type, name: m.name, prep: m.prep, items, changed: items.some(i => i.food.id !== i.defaultFood) };
  });
  const all = meals.flatMap(m => m.items);
  let protein = tg.macros.protein, fallback = null;
  scaleDay(all, tg.cal.kcal, protein);
  // Over the calorie target at the protein target: swap the fattiest protein food for a leaner
  // one of the same kind (fried tempeh -> steamed tempeh) and scale again.
  for (let n = 0; n < 12 && dayTotals(all).kcal > tg.cal.kcal * (1 + KCAL_TOL); n++) {
    const swap = leanerSwap(all, meals, foods, prefs);
    if (!swap) break;
    for (const i of all) i.g = i.g0;
    scaleDay(all, tg.cal.kcal, protein);
  }
  // Protein fallback: when the protein target cannot be reached with at most 300 g of any protein
  // food (reason 'cap'), or only by going over the calorie target with the foods the filters allow
  // (reason 'kcal'), lower it to 1.6 g/kg and say so.
  const t0 = dayTotals(all);
  const reason = t0.protein < protein - PROTEIN_TOL ? 'cap' : t0.kcal > tg.cal.kcal * (1 + KCAL_TOL) ? 'kcal' : null;
  const lowered = round(PROTEIN.min * tg.macros.refWeight);
  if (reason && lowered < protein) {
    fallback = { code: 'protein-fallback', reason, from: protein, to: lowered };
    protein = lowered;
    for (const i of all) i.g = i.g0;
    scaleDay(all, tg.cal.kcal, protein);
    for (let n = 0; n < 12 && dayTotals(all).kcal > tg.cal.kcal * (1 + KCAL_TOL); n++) {
      if (!leanerSwap(all, meals, foods, prefs)) break;
      for (const i of all) i.g = i.g0;
      scaleDay(all, tg.cal.kcal, protein);
    }
  }
  for (const m of meals) m.totals = dayTotals(m.items);
  const totals = dayTotals(all);
  const check = {
    kcalOk: Math.abs(totals.kcal - tg.cal.kcal) <= tg.cal.kcal * KCAL_TOL,
    proteinOk: Math.abs(totals.protein - protein) <= PROTEIN_TOL,
    vegetableG: all.filter(i => i.slot === 'vegetable').reduce((a, i) => a + i.g, 0),
    fruitPortions: all.filter(i => i.slot === 'fruit').length,
  };
  return { menuId: menu.id, name: menu.name, meals, totals, targetKcal: tg.cal.kcal, targetProtein: protein, fallback, missing, check };
}

export const menusForGoal = (tpl, goal) => tpl.menus.filter(m => m.goals.includes(goal));

// Menu for a date: rotates through the goal's menus by calendar day, so consecutive days differ
// (every goal has 5 or more menus).
export function menuForDate(menus, date) {
  const n = dayNum(date);
  return menus[((n % menus.length) + menus.length) % menus.length];
}

// The seven days (Monday to Sunday) of the week containing `date`.
export function weekDates(date) {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return localDate(x); });
}
