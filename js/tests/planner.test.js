// tests/planner.test.js
// Phase 4 checks: acceptance criterion 1 over all 3,600 profiles (plus Push/Pull/Legs for 3 days),
// split selection, programming variables, the set counting rule, ramp-up sets, injury handling,
// swaps, under-target reporting, cardio and steps, deload and progression rules, and the body map.

import { suite, test, assert, eq, noErrors } from './harness.js';
import { loadData } from '../data.js';
import * as P from '../planner.js';
import { profileMatrix, checkPlan, profileLabel } from './plan-checks.js';
import { bodyMap, groupStates, exerciseStates, DRAWN_MUSCLES } from '../bodymap.js';
import { coverageStates } from '../views/plan.js';

const data = async () => {
  const [exercises, enums, warmups] = await Promise.all([loadData('exercises'), loadData('enums'), loadData('warmups')]);
  return { exercises, enums, warmups, exById: Object.fromEntries(exercises.map(e => [e.id, e])) };
};
const base = { goal: 'build-muscle', days: 4, equipment: 'full-gym', experience: 'intermediate', sessionLength: 60, injuries: [],
  pullupBar: true, bands: true, sex: 'male', age: 30, heightCm: 175, weightKg: 75, dailyLife: 'sitting', dailySteps: 6000 };

suite('Planner: acceptance criterion 1 (all profiles)', () => {
  test('3,600 profiles (900 combinations x no injury + each single injury), plus Push/Pull/Legs for 3 days: every rule holds', async () => {
    const d = await data();
    const failures = [];
    let plans = 0;
    for (const p of profileMatrix()) {
      for (const split of p.days === 3 ? ['full-body-3', 'ppl-3'] : [undefined]) {
        if (split === 'ppl-3' && p.experience === 'beginner') continue; // PPL is not offered to beginners
        plans++;
        const errs = checkPlan(P.generatePlan(p, d, { split }), p, d);
        if (errs.length) failures.push(`${profileLabel(p)} ${split || ''}: ${errs.join('; ')}`);
      }
    }
    assert(plans >= 3600, `only ${plans} plans`);
    noErrors(failures);
  });
});

suite('Plan checker rejects broken plans (negative cases)', () => {
  const broken = async (mutate, profile = base) => {
    const d = await data();
    const plan = structuredClone(P.generatePlan(profile, d));
    mutate(plan, d);
    return checkPlan(plan, profile, d);
  };
  const expect = (errs, re) => assert(errs.some(e => re.test(e)), `expected ${re}, got: ${errs.join(' | ') || 'none'}`);
  test('session over the time limit', async () => expect(await broken(p => { p.sessions[0].durationMin = 99; }), /min > 60/));
  test('main lift removed', async () => expect(await broken(p => { p.sessions[1].exercises[0].exerciseId = null; }), /main lift missing/));
  test('exercise with a selected injury tag', async () =>
    expect(await broken(p => { p.sessions[0].exercises[1].exerciseId = 'barbell-back-squat'; }, { ...base, injuries: ['knee'] }), /injury tag/));
  test('exercise needing other equipment', async () =>
    expect(await broken(p => { p.sessions[0].exercises[1].exerciseId = 'leg-press'; }, { ...base, equipment: 'bodyweight', pullupBar: false, bands: false }), /other equipment/));
  test('unknown exercise id', async () => expect(await broken(p => { p.sessions[0].exercises[1].exerciseId = 'nope'; }), /unknown exercise/));
  test('group above the top of the range', async () => expect(await broken(p => { p.sessions[0].exercises[0].sets = 40; }), /> 20/));
  test('major group under 4 weekly sets', async () =>
    expect(await broken(p => { for (const s of p.sessions) for (const e of s.exercises) if (e.role !== 'main') e.sets = 0; for (const s of p.sessions) s.exercises[0].sets = 1; }), /< 4/));
});

suite('Planner: splits and programming', () => {
  test('split by days: 2 full body, 3 full body (PPL offered to intermediate+), 4 U/L, 5 U/L/P/P/L, 6 PPL x2', () => {
    eq(P.splitOptions(2, 'beginner'), ['full-body-2']);
    eq(P.splitOptions(3, 'beginner'), ['full-body-3']);
    eq(P.splitOptions(3, 'advanced'), ['full-body-3', 'ppl-3']);
    eq(P.splitOptions(4, 'intermediate'), ['upper-lower']);
    eq(P.splitOptions(5, 'beginner'), ['ul-ppl']);
    eq(P.splitOptions(6, 'advanced'), ['ppl-6']);
  });
  test('beginners on 5 or 6 days get the warning (and still get their plan)', async () => {
    const d = await data();
    for (const days of [5, 6]) {
      const plan = P.generatePlan({ ...base, experience: 'beginner', days }, d);
      assert(plan.notes.includes('beginner-high-days'), String(days));
      eq(plan.sessions.length, days);
    }
    assert(!P.generatePlan({ ...base, days: 5 }, d).notes.includes('beginner-high-days'), 'intermediate gets no warning');
  });
  test('beginner asking for PPL on 3 days still gets full body', async () => {
    eq(P.generatePlan({ ...base, days: 3, experience: 'beginner' }, await data(), { split: 'ppl-3' }).splitId, 'full-body-3');
  });
  test('2-day full body: each session trains every major group (primary or secondary)', async () => {
    const d = await data();
    const { groupOf, major } = P.groupMaps(d.enums);
    for (const equipment of ['full-gym', 'dumbbells', 'bodyweight']) {
      const plan = P.generatePlan({ ...base, days: 2, equipment, sessionLength: 75, pullupBar: false, bands: false }, d);
      for (const s of plan.sessions) {
        const hit = new Set(s.exercises.filter(e => e.exerciseId && e.sets).flatMap(e => { const g = P.exerciseGroups(d.exById[e.exerciseId], groupOf); return [...g.primary, ...g.secondary]; }));
        noErrors(major.filter(g => !hit.has(g)).map(g => `${equipment} ${s.key} misses ${g}`));
      }
    }
  });
  test('rep ranges, rest and RIR follow the goal table; beginners lift 5-8 on Get stronger and use RIR 2-3', async () => {
    const d = await data();
    const main = p => P.generatePlan(p, d).sessions[0].exercises[0];
    eq(main({ ...base, goal: 'get-stronger' }).reps, [3, 6]);
    eq(main({ ...base, goal: 'get-stronger' }).restSec, [180, 300]);
    eq(main({ ...base, goal: 'get-stronger', experience: 'beginner' }).reps, [5, 8]);
    eq(main({ ...base, goal: 'general-fitness' }).restSec, [60, 90]);
    const beginner = P.generatePlan({ ...base, experience: 'beginner' }, d);
    assert(beginner.sessions.every(s => s.exercises.every(e => !e.sets || (e.rir[0] === 2 && e.rir[1] === 3))), 'beginner RIR 2-3');
    const acc = P.generatePlan(base, d).sessions[0].exercises.find(e => e.role !== 'main' && e.sets && !d.exById[e.exerciseId].bodyweight && !P.isTimed(d.exById[e.exerciseId]));
    eq(acc.reps, [10, 15], 'build-muscle accessory reps');
  });
  test('bodyweight exercises use 8-20 reps; holds use seconds', async () => {
    const d = await data();
    const plan = P.generatePlan({ ...base, equipment: 'bodyweight', pullupBar: false, bands: false }, d);
    const entries = plan.sessions.flatMap(s => s.exercises).filter(e => e.sets);
    for (const e of entries) {
      const ex = d.exById[e.exerciseId];
      if (P.isTimed(ex)) eq(e.unit, 'seconds', ex.id); else if (ex.bodyweight) eq(e.reps, [8, 20], ex.id);
    }
  });
  test('ramp-up sets: on weighted main lifts only (2 for beginners, 3 otherwise), never counted as weekly sets', async () => {
    const d = await data();
    const plan = P.generatePlan(base, d);
    for (const s of plan.sessions) for (const e of s.exercises) {
      const weightedMain = e.role === 'main' && e.sets && !d.exById[e.exerciseId].bodyweight;
      eq(e.rampUps.length, weightedMain ? 3 : 0, `${s.key}/${e.slotId}`);
    }
    eq(P.generatePlan({ ...base, experience: 'beginner' }, d).sessions[0].exercises[0].rampUps.map(r => r.pct), [50, 75]);
    const { groupOf, groups } = P.groupMaps(d.enums);
    eq(P.countSets(plan.sessions.flatMap(s => s.exercises), d.exById, groupOf, groups), plan.weekly, 'weekly = working sets only');
  });
  test('duration estimate = warm-up + cool-down + ramp-ups + sets x (40 s + mid rest)', () => {
    const s = { exercises: [{ exerciseId: 'x', sets: 3, restSec: [120, 180], rampUps: [{}, {}, {}] }, { exerciseId: 'y', sets: 2, restSec: [60, 90], rampUps: [] }] };
    eq(P.sessionSeconds(s), 360 + 300 + 3 * 90 + 3 * (40 + 150) + 2 * (40 + 75));
  });
});

suite('Planner: counting rule', () => {
  test('a set counts 1 for each primary group and 0.5 for each other secondary group', async () => {
    const d = await data();
    const { groupOf, groups } = P.groupMaps(d.enums);
    const w = P.countSets([{ exerciseId: 'barbell-bench-press', sets: 3 }], d.exById, groupOf, groups);
    eq([w.chest, w.shoulders, w.triceps, w.back], [3, 1.5, 1.5, 0]);
  });
  test('two primary muscles in one group count once (lats + upper back = 1 back set)', async () => {
    const d = await data();
    const { groupOf, groups } = P.groupMaps(d.enums);
    eq(P.countSets([{ exerciseId: 'seated-cable-row', sets: 2 }], d.exById, groupOf, groups).back, 2);
  });
  test('cardio does not count toward muscle groups', async () => {
    const d = await data();
    const { groupOf, groups } = P.groupMaps(d.enums);
    eq(Object.values(P.countSets([{ exerciseId: 'jogging', sets: 3 }], d.exById, groupOf, groups)).every(v => v === 0), true);
  });
});

suite('Planner: filters, swaps and limits', () => {
  test('an injury that removes a whole slot leaves it empty with the reason, never filled with a tagged exercise', async () => {
    const d = await data();
    const plan = P.generatePlan({ ...base, injuries: ['shoulder'] }, d);
    const empties = plan.sessions.flatMap(s => s.exercises).filter(e => !e.exerciseId);
    assert(empties.some(e => e.slotId === 'lateral' && e.empty === 'injury'), 'lateral slot empty for injury');
    assert(plan.sessions.flatMap(s => s.exercises).every(e => !e.exerciseId || !d.exById[e.exerciseId].stress.includes('shoulder')));
  });
  test('a main lift that falls back to another pattern is marked with the reason', async () => {
    const d = await data();
    const knee = P.generatePlan({ ...base, equipment: 'dumbbells', pullupBar: false, bands: false, injuries: ['knee'] }, d);
    const lowerA = knee.sessions.find(s => s.key === 'lower-a').exercises[0];
    eq([d.exById[lowerA.exerciseId].pattern, lowerA.fallback], ['hinge', 'injury']);
    const home = P.generatePlan({ ...base, equipment: 'bodyweight', experience: 'beginner', pullupBar: false, bands: false }, d);
    eq(home.sessions.find(s => s.key === 'lower-a').exercises[0].fallback, 'options');
    assert(!P.generatePlan(base, d).sessions.some(s => s.exercises[0].fallback), 'full gym, no filter: no fallback');
  });
  test('empty-slot reason is "level" when an option fits the equipment but not the level', async () => {
    const plan = P.generatePlan({ ...base, equipment: 'bodyweight', experience: 'beginner', pullupBar: false, bands: false }, await data());
    eq(plan.sessions.find(s => s.key === 'upper-a').exercises.find(e => e.slotId === 'v-push').empty, 'level');
  });
  test('a valid swap is used; a swap the profile cannot do is ignored', async () => {
    const d = await data();
    const ok = P.generatePlan(base, d, { swaps: [{ templateId: 'upper-a', slotId: 'biceps', exerciseId: 'hammer-curl' }] });
    const e = ok.sessions.find(s => s.key === 'upper-a').exercises.find(x => x.slotId === 'biceps');
    eq([e.exerciseId, e.swapped], ['hammer-curl', true]);
    const bad = P.generatePlan({ ...base, equipment: 'bodyweight', pullupBar: false, bands: false }, d, { swaps: [{ templateId: 'upper-a', slotId: 'biceps', exerciseId: 'hammer-curl' }] });
    assert(bad.sessions.find(s => s.key === 'upper-a').exercises.find(x => x.slotId === 'biceps').exerciseId !== 'hammer-curl');
  });
  test('under-target groups carry a reason; "time" claims are checked against +15 min / +1 day', async () => {
    const d = await data();
    const plan = P.generatePlan({ ...base, goal: 'build-muscle', experience: 'advanced', days: 2, sessionLength: 45 }, d);
    assert(plan.under.length > 0, 'expected under-target groups');
    for (const u of plan.under) {
      assert(['time', 'options', 'equipment'].includes(u.reason), u.group);
      if (u.reason === 'time') assert(typeof u.closesWithMinutes === 'boolean' && typeof u.closesWithDay === 'boolean', u.group);
    }
  });
  test('coverage states: under (with reason) / in / over', () => {
    const st = coverageStates({ range: [10, 15], weekly: { a: 9, b: 10, c: 15, d: 16, e: 3 }, under: [{ group: 'a', reason: 'time' }, { group: 'e', reason: 'equipment' }] });
    eq(st, { a: 'underTime', b: 'in', c: 'in', d: 'over', e: 'underEquipment' });
  });
});

suite('Planner: cardio, steps, deload, progression', () => {
  test('steps target = average + 2,000, capped at 10,000 (never below the current average)', () => {
    eq(P.stepsTarget(6000).target, 8000);
    eq(P.stepsTarget(9000).target, 10000);
    eq(P.stepsTarget(12000).target, 12000);
    eq(P.stepsTarget(null).target, null);
  });
  test('cardio goes on non-lifting days first, then after lifting', async () => {
    const d = await data();
    const fat3 = P.generatePlan({ ...base, goal: 'lose-fat', days: 3 }, d);
    assert(fat3.cardio.length === 3 && fat3.cardio.every(c => !fat3.schedule.includes(c.weekday) && !c.afterLifting));
    const fat6 = P.generatePlan({ ...base, goal: 'lose-fat', days: 6 }, d);
    eq(fat6.cardio.filter(c => !c.afterLifting).map(c => c.weekday), [6]);
    eq(fat6.cardio.filter(c => c.afterLifting).length, 2);
    assert(P.generatePlan({ ...base, goal: 'lose-fat' }, d).steps.target === 8000, 'steps on lose fat');
    eq(P.generatePlan(base, d).steps, null);
  });
  test('knee filter uses brisk walking instead of jogging', async () => {
    const plan = P.generatePlan({ ...base, goal: 'general-fitness', injuries: ['knee'] }, await data());
    assert(plan.cardio.every(c => c.exerciseId === 'brisk-walk'));
  });
  test('deload: half the sets (rounded up), same exercises, RIR 4+', () => {
    const s = P.deloadSession({ key: 'x', exercises: [{ exerciseId: 'a', sets: 3, rir: [2, 3] }, { exerciseId: 'b', sets: 4, rir: [1, 2] }] });
    eq(s.exercises.map(e => [e.exerciseId, e.sets, e.rir[0] >= 4]), [['a', 2, true], ['b', 2, true]]);
  });
  test('deload suggestion: 2 consecutive e1RM drops for anyone; 8 weeks only for intermediate+', () => {
    const now = Date.UTC(2026, 10, 17);
    eq(P.deloadSuggestion({ level: 'beginner', history: { squat: [100, 98, 96] }, now }), { reason: 'e1rm-drop', exerciseId: 'squat' });
    eq(P.deloadSuggestion({ level: 'beginner', trainingSince: now - 60 * 864e5, now }), null);
    eq(P.deloadSuggestion({ level: 'intermediate', trainingSince: now - 57 * 864e5, now }), { reason: 'eight-weeks' });
    eq(P.deloadSuggestion({ level: 'intermediate', trainingSince: now - 50 * 864e5, now }), null);
  });
  test('Epley e1RM for 1-10 reps only', () => {
    eq(P.e1rm(100, 1), 100);
    eq(Math.round(P.e1rm(100, 10) * 10) / 10, 133.3);
    eq(P.e1rm(100, 12), null);
  });
  test('double progression: +2.5 kg upper, +5 kg lower, only when all sets hit the top at target RIR', async () => {
    const d = await data();
    const entry = { sets: 3, reps: [6, 10], rir: [2, 3] };
    const top = [{ reps: 10, kg: 60, rir: 2 }, { reps: 10, kg: 60, rir: 2 }, { reps: 10, kg: 60, rir: 2 }];
    eq(P.progression({ ex: d.exById['barbell-bench-press'], entry, sets: top }).load, 62.5);
    eq(P.progression({ ex: d.exById['barbell-back-squat'], entry, sets: top }).load, 65);
    eq(P.progression({ ex: d.exById['barbell-bench-press'], entry, sets: [...top.slice(0, 2), { reps: 9, kg: 60, rir: 2 }] }).action, 'add-reps');
    eq(P.progression({ ex: d.exById['barbell-bench-press'], entry, sets: top.map(s => ({ ...s, rir: 0 })) }).action, 'add-reps', 'ground out past target RIR');
  });
  test('dumbbells: extend the range by 3 when the next jump is over 10%', async () => {
    const d = await data();
    const entry = { sets: 2, reps: [10, 15], rir: [1, 2] };
    const sets = kg => [{ reps: 15, kg, rir: 1 }, { reps: 15, kg, rir: 1 }];
    eq(P.progression({ ex: d.exById['dumbbell-lateral-raise'], entry, sets: sets(8) }), { action: 'extend-range', load: 8, reps: [10, 18] });
    eq(P.progression({ ex: d.exById['dumbbell-lateral-raise'], entry, sets: [{ reps: 18, kg: 8, rir: 1 }, { reps: 18, kg: 8, rir: 1 }], extendedRange: true }).action, 'increase-load');
    eq(P.progression({ ex: d.exById['dumbbell-bench-press'], entry, sets: sets(30) }).load, 32);
  });
  test('bodyweight: move to `harder` when available, else add a 3 s lowering phase', async () => {
    const d = await data();
    const entry = { sets: 2, reps: [8, 20], rir: [2, 3] };
    const sets = [{ reps: 20, rir: 2 }, { reps: 20, rir: 2 }];
    eq(P.progression({ ex: d.exById['push-up'], entry, sets, exById: d.exById, profile: { ...base, equipment: 'bodyweight', experience: 'intermediate' } }).exerciseId, 'decline-push-up');
    eq(P.progression({ ex: d.exById['doorway-row'], entry, sets, exById: d.exById, profile: base }).action, 'slow-eccentric');
  });
});

suite('Body map', () => {
  test('every muscle in enums (except heart and lungs) is drawn in its listed view', async () => {
    const { enums } = await data();
    noErrors(enums.muscles.filter(m => m.view && !DRAWN_MUSCLES[m.view].includes(m.id)).map(m => `${m.id} missing from ${m.view}`));
  });
  test('exercise states: primary solid, secondary hatched, others idle', async () => {
    const { enums, exById } = await data();
    const el = document.createElement('div');
    el.innerHTML = bodyMap({ enums, states: exerciseStates(exById['barbell-bench-press']) });
    assert(el.querySelector('[data-muscle="chest"]').classList.contains('muscle--primary'));
    const tri = el.querySelector('[data-muscle="triceps"]');
    assert(tri.classList.contains('muscle--secondary') && /url\(#bm\d+-sec\)/.test(tri.getAttribute('style')), 'triceps hatched');
    assert(el.querySelector('[data-muscle="quads"]').classList.contains('muscle--idle'));
  });
  test('group states spread to every muscle of the group; hatch ids are unique per map', async () => {
    const { enums } = await data();
    const st = groupStates(enums, { back: 'under', chest: 'in' });
    eq(['lats', 'upper-back', 'traps', 'spinal-erectors'].map(m => st[m]), ['under', 'under', 'under', 'under']);
    const a = bodyMap({ enums, states: st }), b = bodyMap({ enums, states: st });
    assert(a.match(/id="(bm\d+)-sec"/)[1] !== b.match(/id="(bm\d+)-sec"/)[1]);
  });
  test('interactive map: muscles are focusable buttons labelled with what they do', async () => {
    const { enums } = await data();
    const el = document.createElement('div');
    el.innerHTML = bodyMap({ enums, interactive: true });
    const q = el.querySelector('[data-muscle="quads"]');
    eq([q.getAttribute('tabindex'), q.getAttribute('role')], ['0', 'button']);
    assert(q.getAttribute('aria-label').includes(':'), 'label has the daily-life line');
  });
});
