// tests/data.test.js
// Phase 3 checks: enums.json integrity, every exercise against the schema and enums, library-level
// rules (count, unique builds, coverage per setup and pattern), equipment availability, and
// negative cases proving the validator rejects broken entries.

import { suite, test, assert, eq, noErrors } from './harness.js';
import { loadData } from '../data.js';
import { validateExercise, validateExercises } from '../schema.js';
import { isAvailable } from '../equipment.js';

const load = () => Promise.all([loadData('enums'), loadData('exercises')]);

suite('enums.json', () => {
  test('ids are unique within each list', async () => {
    const enums = await loadData('enums');
    const errors = [];
    for (const k of ['groups', 'muscles', 'patterns', 'equipment', 'levels', 'stress']) {
      const ids = enums[k].map(x => x.id);
      if (new Set(ids).size !== ids.length) errors.push(`${k} has duplicate ids`);
      for (const x of enums[k]) if (!x.name?.en || !x.name?.id) errors.push(`${k}.${x.id} missing a name`);
    }
    noErrors(errors);
  });
  test('exactly the ten set-target groups exist', async () => {
    const { groups } = await loadData('enums');
    eq(groups.map(g => g.id), ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']);
  });
  test('every muscle maps to one of the ten groups (heart-lungs is the only non-lifting entry)', async () => {
    const { groups, muscles } = await loadData('enums');
    const g = new Set(groups.map(x => x.id));
    noErrors(muscles.filter(m => !(g.has(m.group) || (m.id === 'heart-lungs' && m.group === null))).map(m => `${m.id} -> ${m.group}`));
  });
  test('every muscle has a one-line daily-life description in both languages', async () => {
    const { muscles } = await loadData('enums');
    noErrors(muscles.filter(m => !m.daily?.en || !m.daily?.id).map(m => m.id));
  });
  test('every group has at least one muscle', async () => {
    const { groups, muscles } = await loadData('enums');
    noErrors(groups.filter(g => !muscles.some(m => m.group === g.id)).map(g => g.id));
  });
});

suite('exercises.json', () => {
  test('every exercise validates against the schema and enums.json', async () => {
    const [enums, list] = await load();
    const ids = new Set(list.map(e => e.id));
    noErrors(list.flatMap(e => validateExercise(e, enums, ids)));
  });
  test('library rules: 45+ entries, unique ids and builds, all groups covered in every setup, all patterns used', async () => {
    const [enums, list] = await load();
    noErrors(validateExercises(list, enums));
  });
  test('at least 45 exercises', async () => {
    const [, list] = await load();
    assert(list.length >= 45, `have ${list.length}`);
  });
  test('no two exercises share the same builds text (en or id)', async () => {
    const [, list] = await load();
    for (const l of ['en', 'id']) eq(new Set(list.map(e => e.builds[l])).size, list.length, l);
  });
  test('cardio options exist for every setup', async () => {
    const [, list] = await load();
    for (const s of ['full-gym', 'dumbbells', 'bodyweight']) assert(list.some(e => e.pattern === 'cardio' && isAvailable(e, s)), s);
  });
  // Planner needs 4+ weekly sets per major group with any single injury flag. Sets count 1 for a
  // primary and 0.5 for a secondary muscle, so a group must stay reachable as primary or secondary.
  test('each injury filter leaves every group trainable (primary or secondary) in every setup', async () => {
    const [enums, list] = await load();
    const groupOf = Object.fromEntries(enums.muscles.map(m => [m.id, m.group]));
    const errors = [];
    for (const tag of ['knee', 'lower-back', 'shoulder']) for (const setup of ['full-gym', 'dumbbells', 'bodyweight']) {
      const left = list.filter(e => e.pattern !== 'cardio' && !e.stress.includes(tag) && isAvailable(e, setup));
      for (const g of enums.groups) {
        if (!left.some(e => [...e.primary, ...e.secondary].some(m => groupOf[m] === g.id))) errors.push(`${tag} filter + ${setup}: no exercise reaches ${g.id}`);
      }
    }
    noErrors(errors);
  });
  test('knee filter still leaves a primary quad exercise in every setup', async () => {
    const [, list] = await load();
    for (const setup of ['full-gym', 'dumbbells', 'bodyweight']) {
      assert(list.some(e => !e.stress.includes('knee') && e.primary.includes('quads') && isAvailable(e, setup)), setup);
    }
  });
});

suite('Equipment availability', () => {
  const ex = { equipment: ['full-gym', 'dumbbells', 'bodyweight', 'pull-up-bar'] };
  test('full gym can do anything', () => assert(isAvailable({ equipment: ['bodyweight', 'bands'] }, 'full-gym')));
  test('pull-up exercise needs the bar at home', () => {
    eq(isAvailable(ex, 'bodyweight', { pullupBar: false }), false);
    eq(isAvailable(ex, 'bodyweight', { pullupBar: true }), true);
  });
  test('dumbbell-only exercise is not offered to bodyweight setups', () => eq(isAvailable({ equipment: ['full-gym', 'dumbbells'] }, 'bodyweight'), false));
  test('band exercise needs bands', () => {
    const band = { equipment: ['dumbbells', 'bands'] };
    eq(isAvailable(band, 'dumbbells', {}), false);
    eq(isAvailable(band, 'dumbbells', { bands: true }), true);
  });
});

suite('Validator rejects broken entries (negative cases)', () => {
  const broken = async mutate => {
    const [enums, list] = await load();
    const copy = structuredClone(list);
    mutate(copy);
    return validateExercises(copy, enums);
  };
  const expectError = (errors, re) => assert(errors.some(e => re.test(e)), `expected an error matching ${re}, got: ${errors.slice(0, 3).join(' | ') || 'none'}`);
  test('unknown muscle id', async () => expectError(await broken(l => { l[0].primary = ['pecs']; }), /unknown muscle "pecs"/));
  test('missing Indonesian builds', async () => expectError(await broken(l => { delete l[0].builds.id; }), /builds\.id missing/));
  test('duplicate builds sentence', async () => expectError(await broken(l => { l[1].builds.en = l[0].builds.en; }), /identical|shared/));
  test('dangling alternative', async () => expectError(await broken(l => { l[0].alternatives = ['made-up-exercise']; }), /does not exist/));
  test('two cues instead of three', async () => expectError(await broken(l => { l[0].cues.en.pop(); }), /exactly 3/));
  test('time-bound promise in builds', async () => expectError(await broken(l => { l[0].builds.en = 'Bigger thighs in 30 days. Guaranteed growth for everyone who squats.'; }), /promises a result/));
  test('hype word', async () => expectError(await broken(l => { l[0].role.en = 'This will transform your legs completely and quickly, more than any other lift here.'; }), /hype/));
  test('removing every bodyweight back exercise breaks coverage', async () =>
    expectError(await broken(l => { for (const e of l) if (e.id === 'doorway-row') e.primary = ['biceps']; }), /no exercise with back as primary for setup bodyweight/));
});
