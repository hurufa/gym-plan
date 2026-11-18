// tests/food.test.js
// Phase 7 checks: foods.json against the schema and enums (acceptance criterion 4: every food's kcal
// within 10% of 4P+4C+9F), sources, tags and the no-pork/no-alcohol rule; meal-templates.json (slots,
// 3-4 meals plus 1-2 snacks, 5+ daily menus per goal, 300 g vegetables, 2 fruit portions); and
// negative cases proving each validator rule fires.

import { suite, test, assert, eq, noErrors } from './harness.js';
import { loadData } from '../data.js';
import { validateFoods, validateMealTemplates, kcalDeviation, menuTotals } from '../schema.js';

const load = () => Promise.all([loadData('enums'), loadData('foods'), loadData('meal-templates')]);

suite('foods.json', () => {
  test('every food validates against the schema and enums.json', async () => {
    const [enums, foods] = await load();
    noErrors(validateFoods(foods, enums));
  });
  test('acceptance 4: every food kcal is within 10% of 4P + 4C + 9F', async () => {
    const [, foods] = await load();
    const off = foods.filter(f => Math.abs(kcalDeviation(f)) > 0.1).map(f => `${f.id} ${Math.round(kcalDeviation(f) * 100)}%`);
    noErrors(off);
    eq(foods.length >= 60, true, `${foods.length} foods`);
  });
  test('values are as eaten: cooked rice and boiled chicken carry their TKPI codes', async () => {
    const [, foods] = await load();
    const f = id => foods.find(x => x.id === id);
    eq([f('nasi-putih').state, f('nasi-putih').source, f('nasi-putih').kcal], ['cooked', 'TKPI AP0001', 180]);
    eq([f('dada-ayam-rebus').state, f('dada-ayam-rebus').source], ['boiled', 'TKPI FP0122']);
  });
  test('most foods come from TKPI; every estimate says why', async () => {
    const [, foods] = await load();
    const tkpi = foods.filter(f => f.source.startsWith('TKPI')).length;
    assert(tkpi / foods.length > 0.6, `${tkpi} of ${foods.length} from TKPI`);
    noErrors(foods.filter(f => f.source === 'estimate' && !f.note).map(f => f.id));
  });
  test('each filter leaves foods for every slot (no beef, dairy, seafood, egg, nuts; vegetarian)', async () => {
    const [enums, foods] = await load();
    const errors = [];
    for (const t of ['beef', 'dairy', 'seafood', 'egg', 'nuts']) for (const s of enums.foodSlots)
      if (!foods.some(f => !f.tags.includes(t) && f.slots.includes(s.id))) errors.push(`no ${s.id} food without ${t}`);
    for (const s of enums.foodSlots) if (!foods.some(f => f.tags.includes('vegetarian') && f.slots.includes(s.id))) errors.push(`no vegetarian ${s.id}`);
    noErrors(errors);
  });
});

suite('meal-templates.json', () => {
  test('every menu validates: slots, meal counts, prep notes, vegetables, fruit, 5+ menus per goal', async () => {
    const [enums, foods, tpl] = await load();
    noErrors(validateMealTemplates(tpl, foods, enums));
  });
  test('default portions give a sensible day before scaling (1,300-2,400 kcal, 60 g+ protein)', async () => {
    const [, foods, tpl] = await load();
    const byId = Object.fromEntries(foods.map(f => [f.id, f]));
    noErrors(tpl.menus.map(m => [m.id, menuTotals(m, byId)]).filter(([, t]) => t.kcal < 1300 || t.kcal > 2400 || t.protein < 60)
      .map(([id, t]) => `${id}: ${Math.round(t.kcal)} kcal, ${Math.round(t.protein)} g protein`));
  });
  test('templates use foods from every slot and both 3-meal and 4-meal days', async () => {
    const [enums, , tpl] = await load();
    const used = new Set(tpl.menus.flatMap(m => m.meals.flatMap(ml => ml.items.map(i => i.slot))));
    eq([...used].sort(), enums.foodSlots.map(s => s.id).sort());
    const mains = new Set(tpl.menus.map(m => m.meals.filter(ml => ml.type !== 'snack').length));
    assert(mains.has(3) && mains.has(4), [...mains].join(','));
  });
});

suite('Food validators reject broken data (negative cases)', () => {
  const expectError = (errors, re) => assert(errors.some(e => re.test(e)), `expected an error matching ${re}, got: ${errors.slice(0, 3).join(' | ') || 'none'}`);
  const foodsWith = async mutate => { const [enums, foods] = await load(); const c = structuredClone(foods); mutate(c); return validateFoods(c, enums); };
  const menusWith = async mutate => { const [enums, foods, tpl] = await load(); const c = structuredClone(tpl); mutate(c); return validateMealTemplates(c, foods, enums); };
  test('kcal that does not match the macros', async () => expectError(await foodsWith(l => { l[0].kcal = 400; }), /% off 4P\+4C\+9F/));
  test('a pork food', async () => expectError(await foodsWith(l => { l[0].name.id = 'Sate babi'; }), /pork or alcohol/));
  test('an alcoholic ingredient', async () => expectError(await foodsWith(l => { l[0].name.en = 'Rice wine'; }), /pork or alcohol/));
  test('unknown tag', async () => expectError(await foodsWith(l => { l[0].tags = ['meat']; }), /unknown tag "meat"/));
  test('vegetarian beef', async () => expectError(await foodsWith(l => { const b = l.find(f => f.tags.includes('beef')); b.tags.push('vegetarian'); }), /vegetarian food tagged beef/));
  test('bad source', async () => expectError(await foodsWith(l => { l[0].source = 'internet'; }), /source must be/));
  test('estimate without a note', async () => expectError(await foodsWith(l => { const e = l.find(f => f.source === 'estimate'); delete e.note; }), /estimate needs a note/));
  test('under 60 foods', async () => expectError(await foodsWith(l => { l.length = 59; }), /only 59 foods/));
  test('a menu with an unknown food', async () => expectError(await menusWith(t => { t.menus[0].meals[0].items[0].food = 'pizza'; }), /"pizza" does not exist/));
  test('a food in a slot it cannot fill', async () => expectError(await menusWith(t => { t.menus[0].meals[0].items[0].food = 'bayam-rebus'; }), /cannot fill slot/));
  test('too few vegetables', async () => expectError(await menusWith(t => { for (const ml of t.menus[0].meals) ml.items = ml.items.filter(i => i.slot !== 'vegetable'); }), /g vegetables, need 300/));
  test('one fruit portion', async () => expectError(await menusWith(t => { const ml = t.menus[0].meals.find(x => x.items.some(i => i.slot === 'fruit')); ml.items = ml.items.filter(i => i.slot !== 'fruit'); }), /fruit portions, need 2/));
  test('no snack', async () => expectError(await menusWith(t => { t.menus[0].meals = t.menus[0].meals.filter(x => x.type !== 'snack'); }), /0 snacks/));
  test('fewer than 5 menus for a goal', async () => expectError(await menusWith(t => { t.menus = t.menus.slice(0, 4); }), /daily menus, need at least 5/));
  test('missing prep note', async () => expectError(await menusWith(t => { delete t.menus[0].meals[0].prep.id; }), /prep\.id missing/));
});
