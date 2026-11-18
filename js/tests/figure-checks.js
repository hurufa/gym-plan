// tests/figure-checks.js
// Section 4 checks as code, shared by tests.html and Node runs. checkFigure(exercise) samples the
// exercise's pattern at 20 points of the movement and lists every broken rule:
//   - every limb reaches its target (otherwise a contact would slide)
//   - knee and elbow flexion stay within 0-150 degrees
//   - knees stay on the toe side of the hip-ankle line (knees track over toes) where declared
//   - elbows bend to the declared anatomical side, never flipping through straight
//   - fixed contacts (feet, hands, back) move less than 2 px
//   - hands stay within 2 px of the bar or dumbbell they hold
// No DOM use.

import { specFor } from '../figure-patterns.js';
import { solve, flexion, cross } from '../animations.js';

export const SAMPLES = 20;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];

export function sampleFigure(ex, spec = specFor(ex)) {
  return Array.from({ length: SAMPLES }, (_, i) => {
    const p = i / (SAMPLES - 1);
    const c = spec.frame(p);
    return { p, c, J: solve(c, spec.view) };
  });
}

export function checkFigure(ex, spec = specFor(ex)) {
  const samples = sampleFigure(ex, spec);
  const errors = [];
  const add = (p, msg) => errors.push(`${ex.id} @p=${p.toFixed(2)}: ${msg}`);
  const base = samples[0].J;
  for (const { p, c, J } of samples) {
    for (const [k, ok] of Object.entries(J.reach)) if (!ok) add(p, `${k} cannot reach its target`);
    for (const K of ['N', 'F']) {
      const knee = flexion(J['hip' + K], J['knee' + K], J['ankle' + K]);
      const elbow = flexion(J['shoulder' + K], J['elbow' + K], J['hand' + K]);
      if (knee.flex > 150) add(p, `knee${K} flexion ${knee.flex.toFixed(0)}° > 150`);
      if (elbow.flex > 150) add(p, `elbow${K} flexion ${elbow.flex.toFixed(0)}° > 150`);
      const k = K.toLowerCase();
      if (spec.kneeToe.includes(k) && knee.flex > 3) {
        const line = sub(J['ankle' + K], J['hip' + K]);
        const kneeSide = Math.sign(cross(line, sub(J['knee' + K], J['hip' + K])));
        const toeSide = Math.sign(cross(line, sub(J['toe' + K], J['hip' + K])));
        if (toeSide && kneeSide !== toeSide) add(p, `knee${K} is not over the toes`);
      }
      if (elbow.flex > 3 && spec.elbowSign[k] && elbow.side !== spec.elbowSign[k]) add(p, `elbow${K} bends to the wrong side`);
    }
    for (const f of spec.fixed) {
      const name = typeof f === 'string' ? f : f.joint;
      const moved = typeof f === 'string' ? dist(J[name], base[name]) : Math.abs(J[name][f.axis === 'y' ? 1 : 0] - base[name][f.axis === 'y' ? 1 : 0]);
      if (moved >= 2) add(p, `fixed ${name} moved ${moved.toFixed(1)} px`);
    }
    for (const [hand, prop] of spec.grips) {
      const target = c.props[prop];
      if (!target) { add(p, `grip prop ${prop} missing`); continue; }
      const d = dist(J[hand], target);
      if (d > 2) add(p, `${hand} is ${d.toFixed(1)} px from the ${prop}`);
    }
  }
  return errors;
}

// Elbow and knee bend sides actually produced, per exercise (used to review elbowSign declarations).
export function bendSides(ex) {
  const sides = { elbowN: new Set(), elbowF: new Set(), kneeN: new Set(), kneeF: new Set() };
  for (const { J } of sampleFigure(ex)) {
    for (const K of ['N', 'F']) {
      const e = flexion(J['shoulder' + K], J['elbow' + K], J['hand' + K]);
      const k = flexion(J['hip' + K], J['knee' + K], J['ankle' + K]);
      if (e.flex > 3) sides['elbow' + K].add(e.side);
      if (k.flex > 3) sides['knee' + K].add(k.side);
    }
  }
  return Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, [...v]]));
}
