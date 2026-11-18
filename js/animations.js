// animations.js
// Motion for the app: UI motion (page transitions, onboarding step slides, set-completed check) and
// the articulated exercise figure: two-bone IK solver, pose solver, SVG renderer and one GSAP
// timeline per movement pattern (pose generators live in figure-patterns.js). GSAP is loaded as a
// classic script (./vendor/gsap.min.js) and read from window.gsap. Reduced motion: UI helpers
// change instantly and the figure shows static start and end poses instead of looping.

import { SEG, specFor, workingSegments, onTorso, polar } from './figure-patterns.js';

const gsap = () => window.gsap;

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// UI durations come from the CSS motion tokens (in seconds, for GSAP).
export function duration(token = '--dur-base') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return v.endsWith('ms') ? parseFloat(v) / 1000 : parseFloat(v) || 0.25;
}
// The token easing is cubic-bezier(0.2, 0, 0, 1); "expo.out" is GSAP's closest built-in curve.
const EASE = 'expo.out';

// Runs an entrance tween; if animation frames are paused (hidden tab), snap to the end state so
// content is never left invisible.
function enter(el, from, dur) {
  gsap().fromTo(el, from, { opacity: 1, x: 0, y: 0, duration: dur, ease: EASE, clearProps: 'all' });
  setTimeout(() => {
    if (el.style.opacity !== '' && el.style.opacity !== '1') { gsap().killTweensOf(el); gsap().set(el, { clearProps: 'all' }); }
  }, dur * 1000 + 250);
}

export function pageIn(el) {
  if (reducedMotion() || !gsap()) return;
  enter(el, { opacity: 0, y: 8 }, duration('--dur-base'));
}

// Slide a new onboarding step in from the right (dir = 1) or left (dir = -1).
export function slideIn(el, dir = 1) {
  if (reducedMotion() || !gsap()) return;
  enter(el, { opacity: 0, x: 40 * dir }, duration('--dur-slow'));
}

export function checkPop(el) {
  el.classList.remove('anim-check');
  void el.offsetWidth; // restart the CSS animation
  el.classList.add('anim-check');
}

// ---------------------------------------------------------------------------------------------
// Exercise figure
// ---------------------------------------------------------------------------------------------

// Exercise tempo, defined once: 2 s lowering, 1 s lifting, 0.5 s pause (seconds).
export const TEMPO = { down: 2, up: 1, pause: 0.5 };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = v => Math.hypot(v[0], v[1]);
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const deg = r => (r * 180) / Math.PI;

// Two-bone IK: the middle joint for a limb from `root` towards `target`. s (+1/-1) picks the side
// the joint bends to. When the target is out of reach the limb stretches toward it and `reached`
// is false (tests use this to catch sliding contacts).
export function ik(root, target, l1, l2, s) {
  const v = sub(target, root);
  const raw = len(v) || 1e-9;
  const d = Math.min(Math.max(raw, Math.abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6);
  const dir = [v[0] / raw, v[1] / raw];
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = [-dir[1], dir[0]];
  const mid = [root[0] + dir[0] * a + perp[0] * h * s, root[1] + dir[1] * a + perp[1] * h * s];
  const end = [root[0] + dir[0] * d, root[1] + dir[1] * d];
  return { mid, end, reached: Math.abs(raw - d) < 0.01 };
}

// Joint positions for one set of controls.
export function solve(c, view) {
  const J = { hip: c.hip };
  const t = (c.torso * Math.PI) / 180;
  J.shoulder = [c.hip[0] + SEG.torso * Math.sin(t), c.hip[1] - SEG.torso * Math.cos(t)];
  J.neck = onTorso(c.hip, c.torso, 1 + SEG.neck / SEG.torso);
  J.head = onTorso(c.hip, c.torso, 1 + (SEG.neck + SEG.head) / SEG.torso);
  const across = [Math.cos(t), Math.sin(t)]; // left-right axis in the front view
  const side = k => (view === 'front' ? (k === 'n' ? 1 : -1) : 0);
  J.reach = {};
  for (const k of ['n', 'f']) {
    const K = k.toUpperCase();
    const hipK = [c.hip[0] + across[0] * SEG.hipHalf * side(k), c.hip[1] + across[1] * SEG.hipHalf * side(k)];
    const shK = [J.shoulder[0] + across[0] * SEG.shoulderHalf * side(k), J.shoulder[1] + across[1] * SEG.shoulderHalf * side(k)];
    const leg = ik(hipK, c.legs[k].ankle, SEG.thigh, SEG.shin, c.bend?.['l' + k] ?? -1);
    const arm = ik(shK, c.arms[k].hand, SEG.upper, SEG.fore, c.bend?.['a' + k] ?? 1);
    Object.assign(J, { ['hip' + K]: hipK, ['knee' + K]: leg.mid, ['ankle' + K]: leg.end, ['toe' + K]: polar(leg.end, c.legs[k].toe, SEG.foot),
      ['shoulder' + K]: shK, ['elbow' + K]: arm.mid, ['hand' + K]: arm.end });
    J.reach['leg' + K] = leg.reached;
    J.reach['arm' + K] = arm.reached;
  }
  return J;
}

// Flexion (0 = straight) and bending side for a joint between two segments.
export function flexion(root, mid, end) {
  const u = sub(mid, root), l = sub(end, mid);
  const cosv = (u[0] * l[0] + u[1] * l[1]) / (len(u) * len(l) || 1);
  return { flex: deg(Math.acos(Math.max(-1, Math.min(1, cosv)))), side: Math.sign(cross(u, l)) };
}

const WIDTH = { torso: 24, torsoFront: 34, pelvis: 12, thigh: 15, shin: 12, foot: 7, upperArm: 11, foreArm: 9, neck: 8 };
const f1 = n => Math.round(n * 10) / 10;
const seg = (a, b, w, cls) => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke-width="${w}" class="${cls}"/>`;
function shapeSvg(s) {
  if (s.t === 'line') return `<line x1="${f1(s.a[0])}" y1="${f1(s.a[1])}" x2="${f1(s.b[0])}" y2="${f1(s.b[1])}" class="${s.cls}"/>`;
  if (s.t === 'circle') return `<circle cx="${f1(s.c[0])}" cy="${f1(s.c[1])}" r="${s.r}" class="${s.cls}"/>`;
  const rot = s.rot ? ` transform="rotate(${s.rot} ${f1(s.x + s.w / 2)} ${f1(s.y + s.h / 2)})"` : '';
  return `<rect x="${f1(s.x)}" y="${f1(s.y)}" width="${f1(s.w)}" height="${f1(s.h)}" class="${s.cls}"${rot}/>`;
}

// SVG content (without the <svg> wrapper) for exercise `ex` at phase p.
export function poseInner(ex, p, spec = specFor(ex)) {
  const c = spec.frame(p);
  const J = solve(c, spec.view);
  const work = workingSegments(ex);
  const cls = (name, far) => `seg${work.has(name) ? ' seg--work' : ''}${far ? ' seg--far' : ''}`;
  const limbs = (K, far) => [
    seg(J['hip' + K], J['knee' + K], WIDTH.thigh, cls('thigh', far)),
    seg(J['knee' + K], J['ankle' + K], WIDTH.shin, cls('shin', far)),
    seg(J['ankle' + K], J['toe' + K], WIDTH.foot, cls('shin', far)),
  ].join('');
  const arm = (K, far) => seg(J['shoulder' + K], J['elbow' + K], WIDTH.upperArm, cls('upperArm', far)) + seg(J['elbow' + K], J['hand' + K], WIDTH.foreArm, cls('foreArm', far));
  const shapes = spec.draw(c, J);
  const front = spec.view === 'front';
  return [
    `<g class="fig-equip">${shapes.filter(s => s.layer !== 'front').map(shapeSvg).join('')}</g>`,
    `<g class="fig-far">${limbs('F', !front)}${arm('F', !front)}</g>`,
    `<g class="fig-body">`,
    front ? seg(J.hipF, J.hipN, WIDTH.pelvis, cls('pelvis')) + seg(J.shoulderF, J.shoulderN, WIDTH.upperArm, cls('upperArm')) : '',
    seg(J.hip, J.shoulder, front ? WIDTH.torsoFront : WIDTH.torso, cls('torso')),
    front ? '' : `<circle cx="${f1(J.hip[0])}" cy="${f1(J.hip[1])}" r="${WIDTH.pelvis}" class="seg-fill${work.has('pelvis') ? ' seg--work' : ''}"/>`,
    seg(J.shoulder, J.neck, WIDTH.neck, cls('neck')),
    `<circle cx="${f1(J.head[0])}" cy="${f1(J.head[1])}" r="${SEG.head}" class="seg-fill"/>`,
    `</g>`,
    `<g class="fig-near">${limbs('N', false)}${arm('N', false)}</g>`,
    `<g class="fig-equip-front">${shapes.filter(s => s.layer === 'front').map(shapeSvg).join('')}</g>`,
  ].join('');
}

export const figureSvg = (ex, p, label = '', spec = specFor(ex)) =>
  `<svg class="figure" viewBox="0 0 320 260" role="img" aria-label="${label.replace(/"/g, '&quot;')}">${poseInner(ex, p, spec)}</svg>`;

// One GSAP timeline per movement pattern: p goes 0 -> 1 (lowering) -> 0 (lifting), then pauses.
// Holds stay still; cardio runs a continuous gait cycle.
export function buildTimeline(spec, onFrame) {
  const state = { p: 0 };
  const update = () => onFrame(state.p);
  const tl = gsap().timeline({ repeat: -1, onRepeat: update });
  if (spec.hold) tl.to({}, { duration: TEMPO.down + TEMPO.up + TEMPO.pause });
  else if (spec.cycle) tl.fromTo(state, { p: 0 }, { p: 1, duration: spec.cycle, ease: 'none', onUpdate: update });
  else {
    tl.to(state, { p: 1, duration: TEMPO.down, ease: 'sine.inOut', onUpdate: update })
      .to(state, { p: 0, duration: TEMPO.up, ease: 'sine.inOut', onUpdate: update })
      .to({}, { duration: TEMPO.pause });
  }
  update();
  return tl;
}

// Mounts the animated figure (or, with reduced motion or no GSAP, the static start and end poses)
// into `host`. Returns { play, pause, setSpeed, playing, destroy, animated }.
export function mountFigure(host, ex, { label = '', startLabel = 'Start', endLabel = 'End', reduced = reducedMotion() } = {}) {
  const spec = specFor(ex);
  if (reduced || !gsap()) {
    host.innerHTML = `<div class="figure-static">${spec.hold || spec.cycle
      ? `<figure>${figureSvg(ex, spec.cycle ? 0.25 : 1, label, spec)}</figure>`
      : `<figure>${figureSvg(ex, 0, `${label}: ${startLabel}`, spec)}<figcaption class="eyebrow">${startLabel}</figcaption></figure>
         <figure>${figureSvg(ex, 1, `${label}: ${endLabel}`, spec)}<figcaption class="eyebrow">${endLabel}</figcaption></figure>`}</div>`;
    return { animated: false, play() {}, pause() {}, setSpeed() {}, playing: () => false, destroy() {} };
  }
  host.innerHTML = `<svg class="figure" viewBox="0 0 320 260" role="img" aria-label="${label.replace(/"/g, '&quot;')}"></svg>`;
  const svg = host.firstElementChild;
  const tl = buildTimeline(spec, p => { svg.innerHTML = poseInner(ex, p, spec); });
  return {
    animated: true,
    play: () => tl.play(),
    pause: () => tl.pause(),
    setSpeed: x => tl.timeScale(x),
    playing: () => !tl.paused(),
    destroy: () => tl.kill(),
    timeline: tl,
  };
}
