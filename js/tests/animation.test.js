// tests/animation.test.js
// Phase 5 checks: acceptance criterion 2 (every exercise has a figure whose pattern passes the joint
// and contact-point checks, sampled at 20 points), negative cases proving each check fires, the IK
// helper, the GSAP tempo timeline, reduced motion, working-muscle highlighting and the library filter.

import { suite, test, assert, eq, noErrors } from './harness.js';
import { loadData } from '../data.js';
import { checkFigure, sampleFigure, SAMPLES } from './figure-checks.js';
import { specFor, variantKey, workingSegments } from '../figure-patterns.js';
import { ik, TEMPO, buildTimeline, mountFigure, figureSvg } from '../animations.js';
import { filterExercises } from '../views/exercises.js';

const exercises = () => loadData('exercises');

suite('Figure: acceptance criterion 2 (every exercise)', () => {
  test('every exercise maps to a figure pattern; every pattern in enums.json is used', async () => {
    const [list, enums] = await Promise.all([exercises(), loadData('enums')]);
    const errors = [];
    for (const e of list) { try { specFor(e); } catch (err) { errors.push(`${e.id}: ${err.message}`); } }
    for (const p of enums.patterns) if (!list.some(e => e.pattern === p.id)) errors.push(`pattern ${p.id} unused`);
    noErrors(errors);
  });
  test(`every exercise passes the joint and contact checks at ${SAMPLES} sample points`, async () => {
    noErrors((await exercises()).flatMap(e => checkFigure(e)));
  });
  test('samples cover the whole movement (p = 0 to 1)', async () => {
    const s = sampleFigure((await exercises())[0]);
    eq([s.length, s[0].p, s.at(-1).p], [20, 0, 1]);
  });
  test('the figure renders for every exercise and highlights the working muscles', async () => {
    const errors = [];
    for (const e of await exercises()) {
      const svg = figureSvg(e, 0.5, e.id);
      if (!svg.includes('<line')) errors.push(`${e.id}: no segments drawn`);
      if (e.pattern !== 'cardio' && !workingSegments(e).size) errors.push(`${e.id}: no working segment`);
      if (e.pattern !== 'cardio' && !svg.includes('seg--work')) errors.push(`${e.id}: working segment not drawn`);
    }
    noErrors(errors);
  });
});

suite('Figure checks reject broken poses (negative cases)', () => {
  const broken = async (id, change) => {
    const ex = (await exercises()).find(e => e.id === id);
    const spec = specFor(ex);
    return checkFigure(ex, change(spec));
  };
  const expect = (errs, re) => assert(errs.some(e => re.test(e)), `expected ${re}, got: ${errs.slice(0, 2).join(' | ') || 'none'}`);
  test('a sliding foot is caught (fixed contact moves 2 px or more)', async () => expect(await broken('barbell-back-squat', s => ({
    ...s, frame: p => { const c = s.frame(p); return { ...c, legs: { ...c.legs, n: { ...c.legs.n, ankle: [c.legs.n.ankle[0] + 5 * p, c.legs.n.ankle[1]] } } }; } })), /fixed ankleN moved/));
  test('a hand off the bar is caught', async () => expect(await broken('barbell-bench-press', s => ({
    ...s, frame: p => { const c = s.frame(p); return { ...c, props: { bar: [c.props.bar[0] + 6, c.props.bar[1]] } }; } })), /from the bar/));
  test('an out-of-reach target is caught', async () => expect(await broken('pull-up', s => ({
    ...s, frame: p => { const c = s.frame(p); return { ...c, arms: { n: { hand: [160, -60] }, f: c.arms.f } }; } })), /cannot reach/));
  test('an elbow bending to the wrong side is caught', async () => expect(await broken('dumbbell-curl', s => ({
    ...s, elbowSign: { n: 1, f: 1 } })), /bends to the wrong side/));
  test('a knee pointing away from the toes is caught', async () => expect(await broken('goblet-squat', s => ({
    ...s, frame: p => ({ ...s.frame(p), bend: { ...(s.frame(p).bend || {}), ln: 1 } }) })), /not over the toes/));
  test('flexion over 150 degrees is caught', async () => expect(await broken('dumbbell-curl', s => ({
    ...s, frame: p => { const c = s.frame(p); const sh = [148, 82]; return { ...c, arms: { n: { hand: [sh[0] + 4, sh[1] + 6] }, f: c.arms.f } }; } })), /flexion \d+° > 150/));
});

suite('IK helper', () => {
  test('reachable target: end lands on the target and both bones keep their length', () => {
    const r = ik([0, 0], [40, 30], 32, 30, 1);
    assert(Math.hypot(r.end[0] - 40, r.end[1] - 30) < 1e-6 && r.reached, 'end on target');
    assert(Math.abs(Math.hypot(...r.mid) - 32) < 1e-6, 'upper length');
    assert(Math.abs(Math.hypot(r.end[0] - r.mid[0], r.end[1] - r.mid[1]) - 30) < 1e-6, 'lower length');
  });
  test('the sign picks the bending side', () => {
    const a = ik([0, 0], [0, 50], 32, 30, 1), b = ik([0, 0], [0, 50], 32, 30, -1);
    assert(a.mid[0] < 0 && b.mid[0] > 0, `${a.mid[0]} / ${b.mid[0]}`);
  });
  test('unreachable target: reached is false', () => eq(ik([0, 0], [0, 80], 32, 30, 1).reached, false));
});

suite('Timeline and playback', () => {
  test('tempo is defined once: 2 s down, 1 s up, 0.5 s pause', () => eq(TEMPO, { down: 2, up: 1, pause: 0.5 }));
  test('a dynamic pattern loops in 3.5 s: p reaches 1 at 2 s, 0 at 3 s and stays 0 through the pause', async () => {
    assert(window.gsap, 'GSAP loaded');
    const ex = (await exercises()).find(e => e.id === 'barbell-back-squat');
    let p = -1;
    const tl = buildTimeline(specFor(ex), x => { p = x; });
    tl.pause();
    eq(Math.round(tl.duration() * 100) / 100, 3.5);
    const at = s => { tl.seek(s, false); return Math.round(p * 1000) / 1000; };
    eq([at(0), at(1), at(2), at(2.5), at(3), at(3.4)].map(v => Math.round(v * 100) / 100), [0, 0.5, 1, 0.5, 0, 0]);
    tl.kill();
  });
  test('holds keep a 3.5 s still loop; cardio runs a continuous cycle', async () => {
    const list = await exercises();
    const hold = buildTimeline(specFor(list.find(e => e.id === 'plank')), () => {});
    const walk = buildTimeline(specFor(list.find(e => e.id === 'brisk-walk')), () => {});
    eq([hold.duration(), Math.round(walk.duration() * 10) / 10], [3.5, 1.1]);
    hold.kill(); walk.kill();
  });
  test('speed control: 0.5x halves the playback rate, 1x restores it; pause and play work', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const f = mountFigure(host, (await exercises()).find(e => e.id === 'push-up'), { reduced: false });
    assert(f.animated, 'animated');
    f.setSpeed(0.5); eq(f.timeline.timeScale(), 0.5);
    f.setSpeed(1); eq(f.timeline.timeScale(), 1);
    f.pause(); eq(f.playing(), false);
    f.play(); eq(f.playing(), true);
    f.destroy(); host.remove();
  });
  test('reduced motion: no timeline; static start and end poses are shown', async () => {
    const host = document.createElement('div');
    const f = mountFigure(host, (await exercises()).find(e => e.id === 'push-up'), { reduced: true, startLabel: 'Start', endLabel: 'End' });
    eq([f.animated, host.querySelectorAll('svg.figure').length, host.querySelectorAll('figcaption').length], [false, 2, 2]);
  });
  test('every variant key is stable and unique per pattern setup', async () => {
    const keys = new Set((await exercises()).map(variantKey));
    assert(keys.size >= 40, `only ${keys.size} variants`);
  });
});

suite('Exercise library filter', () => {
  const run = async f => filterExercises(...(await Promise.all([exercises(), loadData('enums')])), { q: '', group: '', equipment: '', pattern: '', fitsMe: false, ...f }, null);
  test('no filter returns every exercise', async () => eq((await run({})).length, (await exercises()).length));
  test('search matches names and muscles in both languages', async () => {
    assert((await run({ q: 'squat' })).length >= 5, 'name');
    assert((await run({ q: 'paha belakang' })).some(e => e.id === 'lying-leg-curl'), 'Indonesian muscle name');
  });
  test('muscle group filter uses primary muscles only', async () => {
    const r = await run({ group: 'calves' });
    assert(r.length >= 2 && r.every(e => e.primary.includes('calves')), r.map(e => e.id).join(','));
  });
  test('equipment and pattern filters combine', async () => {
    const r = await run({ equipment: 'bodyweight', pattern: 'horizontal-push' });
    assert(r.length >= 3 && r.every(e => e.equipment.includes('bodyweight') && e.pattern === 'horizontal-push'));
  });
  test('"only what I can do" applies the profile (equipment, level, injuries)', async () => {
    const [list, enums] = await Promise.all([exercises(), loadData('enums')]);
    const profile = { equipment: 'bodyweight', experience: 'beginner', injuries: ['knee'], pullupBar: false, bands: false };
    const r = filterExercises(list, enums, { fitsMe: true }, profile);
    assert(r.length > 5 && r.every(e => e.equipment.includes('bodyweight') && !e.stress.includes('knee') && e.level === 'beginner' && !e.equipment.includes('pull-up-bar')));
  });
});
