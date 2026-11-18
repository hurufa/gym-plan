// tests/nutrition.test.js
// Phase 8 checks: BMR, activity factor and TDEE; goal adjustments and the slider range; the three
// calorie guardrails; macro targets (deficit protein, BMI over 30, carbs under 100 g); the weight
// trend checks (fast loss, calibration, profile weight); and acceptance criterion 3: 12 profiles from
// 1,300 to 3,500 kcal against every filter produce days within 5% of calories and 10 g of protein,
// or report the protein fallback correctly. Also filters, swaps, rounding and menu rotation.

import { suite, test, assert, eq, noErrors } from './harness.js';
import { loadData } from '../data.js';
import * as N from '../nutrition.js';
import { mergeStates, defaultState } from '../state.js';

const P = (sex, age, heightCm, weightKg, dailyLife, days, goal, experience = 'intermediate') => ({ sex, age, heightCm, weightKg, dailyLife, days, goal, experience });
const load = () => Promise.all([loadData('foods'), loadData('meal-templates')]);
const prefsWith = (filters = {}, extra = {}) => ({ ...N.defaultPrefs(), ...extra, filters: { ...N.defaultPrefs().filters, ...filters } });

// 12 sample profiles, lowest 1,300 kcal and highest 3,500 kcal (asserted below).
export const PROFILES = [
  P('female', 30, 161, 58, 'sitting', 3, 'lose-fat'),
  P('female', 32, 163, 64, 'some-walking', 3, 'lose-fat'),
  P('male', 50, 168, 75, 'sitting', 3, 'lose-fat'),
  P('female', 28, 160, 60, 'some-walking', 3, 'recomposition'),
  P('female', 35, 165, 62, 'some-walking', 3, 'general-fitness'),
  P('male', 30, 172, 70, 'some-walking', 4, 'recomposition'),
  P('male', 35, 185, 110, 'some-walking', 4, 'lose-fat'),
  P('female', 25, 168, 62, 'on-feet', 4, 'build-muscle'),
  P('male', 27, 175, 75, 'some-walking', 4, 'get-stronger'),
  P('male', 24, 176, 74, 'some-walking', 5, 'build-muscle'),
  P('male', 24, 180, 82, 'on-feet', 5, 'build-muscle'),
  P('male', 22, 188, 95, 'on-feet', 3, 'build-muscle'),
];
const FILTERS = [{}, { beef: true }, { dairy: true }, { seafood: true }, { egg: true }, { nuts: true }, { vegetarian: true }, { budget: true }];

suite('Nutrition: energy', () => {
  test('BMR (Mifflin-St Jeor) for both sexes', () => {
    eq(N.bmr(P('male', 30, 180, 80, 'sitting', 3)), 10 * 80 + 6.25 * 180 - 150 + 5);
    eq(N.bmr(P('female', 30, 160, 60, 'sitting', 3)), 600 + 1000 - 150 - 161);
  });
  test('activity factor = daily-life factor + 0.025 per training day; TDEE = BMR x factor', () => {
    const p = P('female', 29, 162, 58, 'some-walking', 4, 'build-muscle');
    eq(Math.round(N.activityFactor(p) * 1000) / 1000, 1.45);
    eq(Math.round(N.tdee(p)), Math.round(1286.5 * 1.45));
    eq(['sitting', 'some-walking', 'on-feet', 'labour'].map(k => N.LIFE_FACTORS[k]), [1.2, 1.35, 1.5, 1.7]);
  });
  test('goal defaults: +10% (advanced +5%), -20%, -5%, 0%, 0%', () => {
    const p = g => P('male', 30, 175, 75, 'some-walking', 4, g);
    eq(['build-muscle', 'lose-fat', 'recomposition', 'get-stronger', 'general-fitness'].map(g => N.calorieTarget(p(g)).pct), [10, -20, -5, 0, 0]);
    eq(N.calorieTarget({ ...p('build-muscle'), experience: 'advanced' }).pct, 5);
  });
  test('the slider is clamped to the goal range', () => {
    const p = P('male', 30, 175, 75, 'some-walking', 4, 'lose-fat');
    eq([N.calorieTarget(p, { adjustPct: -40 }).pct, N.calorieTarget(p, { adjustPct: -5 }).pct, N.calorieTarget(p, { adjustPct: -17 }).pct], [-25, -15, -17]);
    eq(N.ADJUST.recomposition.range, [-10, 0]);
  });
  test('target = TDEE x (1 + adjustment), rounded to 10 kcal', () => {
    const p = P('female', 29, 162, 58, 'some-walking', 4, 'build-muscle');
    eq(N.calorieTarget(p).kcal, Math.round(1286.5 * 1.45 * 1.1 / 10) * 10);
  });
});

suite('Nutrition: guardrails (acceptance 3)', () => {
  test('under 18 with a deficit goal: maintenance, slider locked, reason given', () => {
    const c = N.calorieTarget(P('male', 16, 175, 70, 'some-walking', 4, 'lose-fat'));
    eq([c.pct, c.locked, c.notes[0].code, c.kcal], [0, true, 'under-18', Math.round(c.tdee / 10) * 10]);
  });
  test('BMI under 18.5 with Lose fat or Recomposition: maintenance; with Build muscle: unchanged', () => {
    const thin = g => P('female', 25, 170, 52, 'sitting', 3, g); // BMI 18.0
    for (const g of ['lose-fat', 'recomposition']) eq([N.calorieTarget(thin(g)).pct, N.calorieTarget(thin(g)).notes[0]?.code], [0, 'low-bmi'], g);
    eq([N.calorieTarget(thin('build-muscle')).pct, N.calorieTarget(thin('build-muscle')).notes.length], [10, 0]);
  });
  test('target below BMR is raised to BMR, with the smaller deficit reported', () => {
    const p = P('female', 60, 150, 50, 'sitting', 2, 'lose-fat');
    const c = N.calorieTarget(p, { adjustPct: -25 });
    const floor = c.notes.find(n => n.code === 'bmr-floor');
    assert(floor, 'bmr-floor note');
    eq(c.kcal, Math.round(c.bmr / 10) * 10);
    assert(floor.pct > -25 && floor.pct < 0, `reported deficit ${floor.pct}%`);
  });
  test('guardrail 3: 7-day average dropping over 1% a week, two weeks running, suggests +10%', () => {
    const p = P('male', 30, 175, 80, 'sitting', 4, 'lose-fat');
    const day = n => { const d = new Date(2026, 10, 18); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    // n = days ago; weight was higher in the past.
    const fast = Array.from({ length: 21 }, (_, n) => ({ date: day(n), kg: 77 + 0.15 * n })); // about 1.3% a week
    const slow = Array.from({ length: 21 }, (_, n) => ({ date: day(n), kg: 79 + 0.05 * n })); // about 0.4% a week
    eq(N.fastLossCheck(p, fast, '2026-11-18')?.raisePct, 10, 'fast loss detected');
    eq(N.fastLossCheck(p, slow, '2026-11-18'), null, 'slow loss passes');
    eq(N.fastLossCheck({ ...p, goal: 'recomposition' }, fast, '2026-11-18'), null, 'only for Lose fat');
  });
});

suite('Nutrition: macros', () => {
  test('protein 1.8 g/kg by default, 2.2 g/kg in a deficit; fat 0.8 g/kg; carbs fill the rest', () => {
    const p = P('male', 27, 175, 75, 'some-walking', 4, 'get-stronger');
    const t = N.targets(p);
    eq([t.macros.protein, t.macros.fat], [135, 60]);
    eq(t.macros.carbs, Math.round((t.cal.kcal - 4 * 135 - 9 * 60) / 4));
    eq(N.targets({ ...p, goal: 'lose-fat' }).macros.proteinPerKg, 2.2);
  });
  test('BMI over 30 uses the weight at BMI 25 for the height', () => {
    const m = N.targets(P('male', 35, 180, 110, 'sitting', 3, 'general-fitness')).macros;
    eq([m.usesBmi25, Math.round(m.refWeight * 10) / 10, m.protein], [true, 81, Math.round(1.8 * 81)]);
  });
  test('carbs under 100 g: fat goes toward 0.6 g/kg first, then protein toward 1.6, and both are listed', () => {
    const m = N.targets(P('female', 30, 161, 58, 'sitting', 3, 'lose-fat')).macros;
    eq(m.changes.map(c => c.code), ['fat-lowered']);
    assert(m.fatPerKg >= 0.6 && m.fatPerKg < 0.8 && m.carbs >= 99, JSON.stringify(m));
    const m2 = N.macroTargets(P('female', 30, 161, 58, 'sitting', 3, 'lose-fat'), { kcal: 1000, deficit: true });
    eq(m2.changes.map(c => c.code).slice(0, 2), ['fat-lowered', 'protein-lowered']);
    eq(m2.fatPerKg, 0.6);
  });
});

suite('Nutrition: weight checks', () => {
  const series = (days, kgFn, end = '2026-11-18') => Array.from({ length: days }, (_, i) => {
    const d = new Date(2026, 10, 18); d.setDate(d.getDate() - (days - 1 - i));
    return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, kg: kgFn(i) };
  });
  const cal = N.calorieTarget(P('male', 30, 175, 80, 'some-walking', 4, 'lose-fat'));
  test('calibration waits for 14 days and 10 weigh-ins', () => {
    eq(N.calibrationCheck(cal, series(10, () => 80), '2026-11-18'), null, '10 days only');
    eq(N.calibrationCheck(cal, series(15, () => 80).filter((_, i) => i % 2), '2026-11-18'), null, '7 weigh-ins');
  });
  test('weight flat while a deficit predicts loss -> lower the target by 100-200 kcal', () => {
    const r = N.calibrationCheck(cal, series(15, () => 80), '2026-11-18');
    eq(r.code, 'adjust');
    assert(r.change <= -100 && r.change >= -200, `change ${r.change}`);
  });
  test('losing at the predicted rate -> on track, no change offered', () => {
    const perDay = (cal.kcal - cal.tdee) / N.KCAL_PER_KG;
    eq(N.calibrationCheck(cal, series(15, i => 80 + perDay * i), '2026-11-18').code, 'on-track');
  });
  test('losing much faster than predicted -> raise the target', () => {
    eq(Math.sign(N.calibrationCheck(cal, series(15, i => 80 - 0.25 * i), '2026-11-18').change), 1);
  });
  test('not offered again within 14 days of the last calibration', () => {
    eq(N.calibrationCheck(cal, series(15, () => 80), '2026-11-18', '2026-11-10'), null);
  });
  test('latest weigh-in 2 kg or more from the profile weight offers a recalculation', () => {
    const p = P('male', 30, 175, 80, 'sitting', 4, 'lose-fat');
    eq(N.profileWeightCheck(p, [{ date: '2026-11-17', kg: 78.5 }]), null);
    eq(N.profileWeightCheck(p, [{ date: '2026-11-10', kg: 80 }, { date: '2026-11-17', kg: 77.9 }])?.kg, 77.9);
  });
});

suite('Meal plans: acceptance criterion 3', () => {
  test('the 12 sample profiles span 1,300 to 3,500 kcal', () => {
    const k = PROFILES.map(p => N.targets(p).cal.kcal).sort((a, b) => a - b);
    eq([k[0], k.at(-1), k.length], [1300, 3500, 12]);
  });
  test('every profile x every filter x every menu of its goal: within 5% kcal and 10 g protein, or the fallback is reported', async () => {
    const [foods, tpl] = await load();
    const errors = [];
    let days = 0, fallbacks = 0;
    for (const p of PROFILES) {
      const tg = N.targets(p);
      const lowered = Math.round(1.6 * tg.macros.refWeight);
      for (const f of FILTERS) for (const m of N.menusForGoal(tpl, p.goal)) {
        days++;
        const d = N.assembleDay(m, foods, tg, prefsWith(f));
        const id = `${p.sex} ${p.weightKg} kg ${p.goal} ${tg.cal.kcal} kcal ${JSON.stringify(f)} ${m.id}`;
        if (d.fallback) {
          fallbacks++;
          if (d.fallback.to !== lowered || d.targetProtein !== lowered || d.fallback.from !== tg.macros.protein) errors.push(`${id}: fallback reported wrongly ${JSON.stringify(d.fallback)}`);
        } else if (d.targetProtein !== tg.macros.protein) errors.push(`${id}: protein target changed without a fallback`);
        if (!d.check.kcalOk) errors.push(`${id}: ${Math.round(d.totals.kcal)} kcal`);
        if (!d.check.proteinOk) errors.push(`${id}: ${Math.round(d.totals.protein)} g protein vs ${d.targetProtein}`);
        if (d.missing.length) errors.push(`${id}: ${d.missing.length} items without a substitute`);
        if (d.check.vegetableG < 300 || d.check.fruitPortions < 2) errors.push(`${id}: ${d.check.vegetableG} g veg, ${d.check.fruitPortions} fruit`);
      }
    }
    noErrors(errors);
    assert(days > 700, `${days} days`);
    assert(fallbacks > 0, 'some combinations need the fallback');
  });
  test('3 or 4 meals plus 1 or 2 snacks per day, each meal with grams, macros and a preparation note', async () => {
    const [foods, tpl] = await load();
    const tg = N.targets(PROFILES[5]);
    const errors = [];
    for (const m of tpl.menus) {
      const d = N.assembleDay(m, foods, tg);
      const main = d.meals.filter(x => x.type !== 'snack').length, snacks = d.meals.length - main;
      if (main < 3 || main > 4 || snacks < 1 || snacks > 2) errors.push(`${m.id}: ${main} meals, ${snacks} snacks`);
      for (const ml of d.meals) if (!ml.prep?.en || !ml.items.every(i => i.g > 0) || !(ml.totals.kcal > 0)) errors.push(`${m.id}: incomplete meal`);
    }
    noErrors(errors);
  });
});

suite('Meal plans: assembly rules', () => {
  test('portions round to 5 g; eggs, bread and fruit come in whole pieces; protein foods stay at or under 300 g', async () => {
    const [foods, tpl] = await load();
    const errors = [];
    for (const p of PROFILES) for (const m of N.menusForGoal(tpl, p.goal)) {
      for (const i of N.assembleDay(m, foods, N.targets(p)).meals.flatMap(x => x.items)) {
        if (i.food.portion.unit ? i.g % i.food.portion.g !== 0 : i.g % 5 !== 0) errors.push(`${m.id} ${i.food.id}: ${i.g} g`);
        if (i.slot === 'protein' && i.g > 300) errors.push(`${m.id} ${i.food.id}: ${i.g} g protein food`);
      }
    }
    noErrors(errors);
  });
  test('filters remove every food with the tag; vegetarian keeps eggs and dairy only', async () => {
    const [foods, tpl] = await load();
    const tg = N.targets(PROFILES[8]);
    const errors = [];
    for (const f of [...N.FILTER_TAGS, 'vegetarian']) for (const m of tpl.menus) {
      for (const i of N.assembleDay(m, foods, tg, prefsWith({ [f]: true })).meals.flatMap(x => x.items)) {
        if (f === 'vegetarian' ? !i.food.tags.includes('vegetarian') : i.food.tags.includes(f)) errors.push(`${f} ${m.id}: ${i.food.id}`);
      }
    }
    noErrors(errors);
  });
  test('"never show" hides a food everywhere; a swap replaces one item and the day is re-scaled', async () => {
    const [foods, tpl] = await load();
    const tg = N.targets(PROFILES[8]);
    const menu = tpl.menus.find(m => m.id === 'ayam-bakar-sayur-bening');
    const hidden = N.assembleDay(menu, foods, tg, prefsWith({}, { never: ['nasi-putih'] }));
    assert(!hidden.meals.flatMap(x => x.items).some(i => i.food.id === 'nasi-putih'), 'nasi putih hidden');
    const sw = N.assembleDay(menu, foods, tg, prefsWith({}, { swaps: { 'ayam-bakar-sayur-bening:1:1': 'tongkol-bakar' } }));
    const it = sw.meals[1].items[1];
    eq([it.food.id, it.reason], ['tongkol-bakar', 'swap']);
    assert(sw.check.kcalOk && sw.check.proteinOk, 'still on target');
  });
  test('swap alternatives share the slot and are ordered by similar macros', async () => {
    const [foods] = await load();
    const chicken = foods.find(f => f.id === 'dada-ayam-rebus');
    const alts = N.alternatives(chicken, 'protein', foods, N.defaultPrefs());
    assert(alts.length > 10 && alts.every(f => f.slots.includes('protein')), 'protein foods');
    assert(N.distance(alts[0], chicken) <= N.distance(alts.at(-1), chicken), 'sorted');
  });
  test('budget mode lowers the estimated cost of the week', async () => {
    const [foods, tpl] = await load();
    const tg = N.targets(PROFILES[9]);
    const cost = prefs => tpl.menus.reduce((a, m) => a + N.assembleDay(m, foods, tg, prefs).meals.flatMap(x => x.items).reduce((b, i) => b + i.food.price_idr * i.g / 100, 0), 0);
    const normal = cost(prefsWith()), budget = cost(prefsWith({ budget: true }));
    assert(budget < normal * 0.9, `normal Rp ${Math.round(normal)}, budget Rp ${Math.round(budget)}`);
  });
  test('menus rotate by date: no two days in a row repeat; weeks start on Monday', async () => {
    const [, tpl] = await load();
    const errors = [];
    for (const g of ['build-muscle', 'lose-fat', 'recomposition', 'get-stronger', 'general-fitness']) {
      const menus = N.menusForGoal(tpl, g);
      const dates = N.weekDates('2026-11-18');
      dates.slice(1).forEach((dt, i) => { if (N.menuForDate(menus, dt) === N.menuForDate(menus, dates[i])) errors.push(`${g}: ${dt} repeats`); });
      if (new Set(dates.map(dt => N.menuForDate(menus, dt).id)).size < 5) errors.push(`${g}: fewer than 5 menus in a week`);
    }
    noErrors(errors);
    eq([N.weekDates('2026-11-18')[0], N.weekDates('2026-11-22')[6]], ['2026-11-16', '2026-11-22']);
  });
  test('nutrition preferences survive Merge import (newer updatedAt wins)', () => {
    const a = { ...defaultState(), nutrition: { ...N.defaultPrefs(), adjustPct: 7, updatedAt: 1 } };
    const b = { ...defaultState(), nutrition: { ...N.defaultPrefs(), adjustPct: 9, updatedAt: 2 } };
    eq([mergeStates(a, b).nutrition.adjustPct, mergeStates(b, a).nutrition.adjustPct], [9, 9]);
  });
});
