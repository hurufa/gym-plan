// bodymap.js
// Front/back SVG body map. Each muscle from enums.json is a shape tagged data-muscle="<id>".
// States never rely on colour alone:
//   exercise mode: primary = solid, secondary = hatch, idle = idle fill + outline
//   coverage mode: under = hatch, in = solid ink, over = solid accent (list underneath carries labels)
// bodyMap({ enums, states, interactive, label }) returns markup; wireBodyMap(root, onSelect) makes
// muscles tappable (click / Enter / Space). Shapes are drawn for the left side and mirrored.

import { esc } from './ui.js';
import { tx } from './i18n.js';

const W = 200;
const mirrorPoints = pts => pts.trim().split(/\s+/).map(p => { const [x, y] = p.split(',').map(Number); return `${W - x},${y}`; }).join(' ');
// e: ellipse [cx, cy, rx, ry]; p: polygon points. pair: also draw the mirrored right side.
const SHAPES = {
  front: [
    { m: 'upper-chest', p: '78,64 99,64 99,76 76,80', pair: true },
    { m: 'chest', p: '76,82 99,78 99,100 86,104 76,96', pair: true },
    { m: 'side-delts', e: [61, 74, 5, 10], pair: true },
    { m: 'front-delts', e: [70, 72, 8, 11], pair: true },
    { m: 'biceps', e: [62, 104, 6, 16], pair: true },
    { m: 'brachialis', e: [56, 124, 3.5, 6], pair: true },
    { m: 'forearms', p: '52,136 65,136 61,180 51,180', pair: true },
    { m: 'abs', p: '90,106 110,106 110,156 90,156' },
    { m: 'obliques', p: '79,106 88,108 88,154 81,150 77,128', pair: true },
    { m: 'core', p: '84,158 116,158 118,168 82,168' },
    { m: 'quads', p: '78,190 93,192 92,252 82,252 78,220', pair: true },
    { m: 'adductors', p: '94,192 99,192 99,232 95,228', pair: true },
    { m: 'calves', e: [85, 288, 5, 18], pair: true },
  ],
  back: [
    { m: 'traps', p: '88,48 112,48 124,62 100,84 76,62' },
    { m: 'side-delts', e: [61, 74, 5, 10], pair: true },
    { m: 'rear-delts', e: [70, 72, 8, 10], pair: true },
    { m: 'upper-back', p: '80,68 98,78 98,96 84,96', pair: true },
    { m: 'lats', p: '75,98 93,100 93,138 84,132 75,116', pair: true },
    { m: 'spinal-erectors', p: '94,100 106,100 107,164 93,164' },
    { m: 'triceps', e: [62, 104, 6, 16], pair: true },
    { m: 'forearms', p: '52,136 65,136 61,180 51,180', pair: true },
    { m: 'glutes', e: [88, 180, 11, 12], pair: true },
    { m: 'hamstrings', p: '78,194 98,194 96,252 82,252', pair: true },
    { m: 'calves', e: [87, 286, 7, 20], pair: true },
  ],
};
// Body silhouette under the muscles (not interactive).
const BASE = [
  '<circle cx="100" cy="26" r="16"/>',
  '<rect x="93" y="40" width="14" height="12"/>',
  '<polygon points="70,56 130,56 126,110 120,170 80,170 74,110"/>',
  '<polygon points="80,168 120,168 124,186 76,186"/>',
  ...[false, true].flatMap(m => {
    const P = s => (m ? mirrorPoints(s) : s);
    const cx = x => (m ? W - x : x);
    return [
      `<polygon points="${P('56,64 72,60 68,132 52,132')}"/>`,
      `<polygon points="${P('52,134 66,134 62,186 50,186')}"/>`,
      `<circle cx="${cx(56)}" cy="194" r="6"/>`,
      `<polygon points="${P('76,184 99,186 96,258 80,258')}"/>`,
      `<polygon points="${P('80,262 95,262 92,320 83,320')}"/>`,
      `<ellipse cx="${cx(87)}" cy="326" rx="8" ry="4"/>`,
    ];
  }),
].join('');

export const DRAWN_MUSCLES = { front: [...new Set(SHAPES.front.map(s => s.m))], back: [...new Set(SHAPES.back.map(s => s.m))] };

let uid = 0;

function shapeMarkup(s, attrs, title) {
  const one = mirrored => {
    if (s.e) { const [cx, cy, rx, ry] = s.e; return `<ellipse cx="${mirrored ? W - cx : cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`; }
    return `<polygon points="${mirrored ? mirrorPoints(s.p) : s.p}"/>`;
  };
  return `<g ${attrs}><title>${esc(title)}</title>${one(false)}${s.pair ? one(true) : ''}</g>`;
}

// Muscle states for one exercise: { muscleId: 'primary' | 'secondary' }.
export function exerciseStates(ex) {
  return { ...Object.fromEntries(ex.secondary.map(m => [m, 'secondary'])), ...Object.fromEntries(ex.primary.map(m => [m, 'primary'])) };
}
// Spread group states ({ chest: 'in', ... }) to every muscle in that group.
export function groupStates(enums, byGroup) {
  return Object.fromEntries(enums.muscles.filter(m => m.group && byGroup[m.group]).map(m => [m.id, byGroup[m.group]]));
}

// One view (front or back).
function view(side, { enums, states, interactive, id }) {
  const names = Object.fromEntries(enums.muscles.map(m => [m.id, m]));
  const fill = st => (st === 'secondary' ? `url(#${id}-sec)` : st === 'under' ? `url(#${id}-under)` : null);
  const shapes = SHAPES[side].map(s => {
    const st = states[s.m] || 'idle';
    const m = names[s.m];
    const label = `${tx(m.name)}${interactive ? ': ' + tx(m.daily) : ''}`;
    const f = fill(st);
    const attrs = `class="muscle muscle--${st}" data-muscle="${s.m}"${f ? ` style="fill:${f}"` : ''}` +
      (interactive ? ` tabindex="0" role="button" aria-label="${esc(label)}"` : '');
    return shapeMarkup(s, attrs, tx(m.name));
  }).join('');
  return `<svg class="bodymap-view" viewBox="0 0 200 340" aria-hidden="${interactive ? 'false' : 'true'}" ${interactive ? 'role="group"' : ''} focusable="false">
    <defs>
      <pattern id="${id}-sec" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" style="fill:var(--muscle-idle)"/><rect width="2.5" height="6" style="fill:var(--muscle-primary)"/></pattern>
      <pattern id="${id}-under" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" style="fill:var(--muscle-idle)"/><rect width="2.5" height="6" style="fill:var(--ink)"/></pattern>
    </defs>
    <g class="bodymap-base">${BASE}</g>${shapes}</svg>`;
}

// Front and back side by side. `label` is the accessible summary for the non-interactive map.
export function bodyMap({ enums, states = {}, interactive = false, label = '', captions = ['Front', 'Back'], size = '' }) {
  const id = `bm${++uid}`;
  return `<figure class="bodymap ${size ? 'bodymap--' + size : ''}" ${interactive ? '' : `role="img" aria-label="${esc(label)}"`}>
    <div class="bodymap-pair">
      <div>${view('front', { enums, states, interactive, id })}<figcaption class="eyebrow">${esc(captions[0])}</figcaption></div>
      <div>${view('back', { enums, states, interactive, id })}<figcaption class="eyebrow">${esc(captions[1])}</figcaption></div>
    </div></figure>`;
}

// Tapping a muscle calls onSelect(muscleId, element).
export function wireBodyMap(root, onSelect) {
  const pick = el => { const g = el.closest('[data-muscle]'); if (g) onSelect(g.dataset.muscle, g); };
  root.addEventListener('click', e => pick(e.target));
  root.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-muscle]')) { e.preventDefault(); pick(e.target); } });
}
