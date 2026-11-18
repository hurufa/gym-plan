// charts.js
// Lightweight hand-written SVG charts (no chart library): line/points chart over dates, horizontal
// bar chart with a target range, and a training-day heatmap. Each returns SVG markup with role="img",
// <title> and <desc>; chartFigure() wraps a chart with its legend and a data table that a button
// shows or hides (the accessible fallback). Series differ by dash pattern and marker shape as well
// as colour (tokens --chart-1..4). Styles: .chart* in css/components.css.

import { esc } from './ui.js';
import { parseLocalDate } from './state.js';

let uid = 0;
const nextId = p => `${p}-${++uid}`;
const dayNum = d => Math.round(parseLocalDate(d).getTime() / 864e5);
const fmt = v => (Math.round(v * 10) / 10).toLocaleString(document.documentElement.lang === 'id' ? 'id-ID' : 'en-GB');

// Rounded axis bounds with about 4 steps.
export function niceRange(lo, hi) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
}

// Marker shapes; x and y may arrive as strings (toFixed), so coerce before adding.
const MARKERS = {
  circle: (x, y) => `<circle cx="${x}" cy="${y}" r="3.5"/>`,
  square: (x, y) => `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7"/>`,
  diamond: (x, y) => { x = +x; y = +y; return `<path d="M${x} ${y - 4.5}L${x + 4.5} ${y}L${x} ${y + 4.5}L${x - 4.5} ${y}Z"/>`; },
  none: () => '',
};

// series: [{ name, points: [{ x: 'YYYY-MM-DD', y }], line: bool, dash: bool, marker: 'circle'|'square'|'diamond'|'none', color: 1..4 }]
export function lineChart({ title, desc, series, xLabel = d => d, width = 640, height = 240 }) {
  const all = series.flatMap(s => s.points);
  const tid = nextId('ct'), did = nextId('cd');
  const head = `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${tid} ${did}"><title id="${tid}">${esc(title)}</title><desc id="${did}">${esc(desc)}</desc>`;
  if (!all.length) return `${head}</svg>`;
  const pad = { l: 52, r: 16, t: 12, b: 32 };
  let x0 = Math.min(...all.map(p => dayNum(p.x))), x1 = Math.max(...all.map(p => dayNum(p.x)));
  if (x0 === x1) { x0 -= 3; x1 += 3; }
  const ys = all.map(p => p.y);
  const yr = niceRange(Math.min(...ys), Math.max(...ys));
  const X = d => pad.l + (dayNum(d) - x0) / (x1 - x0) * (width - pad.l - pad.r);
  const Y = v => height - pad.b - (v - yr.min) / (yr.max - yr.min) * (height - pad.t - pad.b);
  const ticks = [];
  for (let v = yr.min; v <= yr.max + 1e-9; v += yr.step) ticks.push(`<text x="${pad.l - 8}" y="${Y(v) + 4}" text-anchor="end">${fmt(v)}</text><line class="chart-tick" x1="${pad.l - 4}" x2="${pad.l}" y1="${Y(v)}" y2="${Y(v)}"/>`);
  const dates = [...new Set(all.map(p => p.x))].sort();
  const xt = [...new Set([dates[0], dates[Math.floor((dates.length - 1) / 2)], dates.at(-1)])];
  const xticks = xt.map((d, i) => `<text x="${X(d)}" y="${height - 10}" text-anchor="${xt.length > 1 && i === 0 ? 'start' : i === xt.length - 1 && xt.length > 1 ? 'end' : 'middle'}">${esc(xLabel(d))}</text>`);
  const body = series.map(s => {
    const pts = [...s.points].sort((a, b) => (a.x < b.x ? -1 : 1));
    const path = s.line && pts.length > 1 ? `<path class="chart-line ${s.dash ? 'chart-line--dash' : ''}" d="${pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('')}"/>` : '';
    const marks = pts.map(p => MARKERS[s.marker || 'circle'](X(p.x).toFixed(1), Y(p.y).toFixed(1))).join('');
    return `<g class="chart-series chart-c${s.color || 1}">${path}<g class="chart-marks">${marks}</g></g>`;
  }).join('');
  return `${head}<g class="chart-axis"><line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height - pad.b}"/><line x1="${pad.l}" x2="${width - pad.r}" y1="${height - pad.b}" y2="${height - pad.b}"/>${ticks.join('')}${xticks.join('')}</g>${body}</svg>`;
}

// Horizontal bars. bars: [{ label, value, target: [lo, hi] | null, pattern: bool }]. A target range is
// drawn as a bracket under the bar; `pattern` hatches the bar (e.g. under target) so state is not colour only.
export function barChart({ title, desc, bars, max = null, unit = '', width = 640, rowH = 30 }) {
  const tid = nextId('ct'), did = nextId('cd');
  const labelW = 150, pad = 12, valW = 56;
  const top = Math.max(1, max ?? Math.max(...bars.flatMap(b => [b.value, ...[b.target ?? []].flat()])));
  const W = width - labelW - valW - pad;
  const sx = v => labelW + Math.min(v, top) / top * W;
  const height = bars.length * rowH + 8;
  const pid = nextId('hatch');
  const rows = bars.map((b, i) => {
    const y = 4 + i * rowH;
    // target: [lo, hi] = bracket under the bar; a number = vertical mark across the bar.
    const tgt = Array.isArray(b.target) ? `<path class="chart-target" d="M${sx(b.target[0])} ${y + rowH - 6}v4H${sx(b.target[1])}v-4"/>`
      : b.target != null ? `<path class="chart-target" d="M${sx(b.target).toFixed(1)} ${y + 1}V${y + rowH - 7}"/>` : '';
    return `<text class="chart-label" x="${labelW - 8}" y="${y + rowH / 2 + 1}" text-anchor="end">${esc(b.label)}</text>
      <rect class="chart-bar ${b.pattern ? 'chart-bar--hatch' : ''}" x="${labelW}" y="${y + 4}" width="${Math.max(0, sx(b.value) - labelW).toFixed(1)}" height="${rowH - 14}" ${b.pattern ? `style="fill:url(#${pid})"` : ''}/>
      ${tgt}<text class="chart-value" x="${width - 4}" y="${y + rowH / 2 + 1}" text-anchor="end">${fmt(b.value)}${esc(unit)}</text>`;
  }).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${tid} ${did}"><title id="${tid}">${esc(title)}</title><desc id="${did}">${esc(desc)}</desc>
    <defs><pattern id="${pid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="chart-hatch-bg" width="6" height="6"/><line class="chart-hatch" x1="0" y1="0" x2="0" y2="6"/></pattern></defs>${rows}</svg>`;
}

// Training-day heatmap: one column per week (Monday on top), filled square = trained, outlined = not.
// days: { 'YYYY-MM-DD': count }, dates: array of week-start dates (oldest first), today: date string.
export function heatmap({ title, desc, days, weeks, today, dayLabels }) {
  const tid = nextId('ct'), did = nextId('cd');
  const c = 18, gap = 4, left = 28, topPad = 4;
  const cells = weeks.map((mon, wi) => Array.from({ length: 7 }, (_, di) => {
    const d = parseLocalDate(mon); d.setDate(d.getDate() + di);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (ds > today) return '';
    const n = days[ds] || 0;
    return `<rect class="heat ${n ? 'heat--on' : ''} ${ds === today ? 'heat--today' : ''}" x="${left + wi * (c + gap)}" y="${topPad + di * (c + gap)}" width="${c}" height="${c}"><title>${ds}${n ? ` ×${n}` : ''}</title></rect>`;
  }).join('')).join('');
  const labels = [0, 2, 4, 6].map(i => `<text x="${left - 6}" y="${topPad + i * (c + gap) + c - 5}" text-anchor="end">${esc(dayLabels[i])}</text>`).join('');
  const w = left + weeks.length * (c + gap), h = topPad + 7 * (c + gap);
  return `<svg class="chart-svg chart-heat" viewBox="0 0 ${w} ${h}" style="max-width:${w * 1.4}px" role="img" aria-labelledby="${tid} ${did}"><title id="${tid}">${esc(title)}</title><desc id="${did}">${esc(desc)}</desc><g class="chart-axis">${labels}</g>${cells}</svg>`;
}

// Figure with legend and a toggleable data table. table: { head: [..], rows: [[..]] } (cells are text).
export function chartFigure({ svg, legend = [], table, showLabel, hideLabel, caption }) {
  const id = nextId('tbl');
  const legendHtml = legend.length ? `<ul class="chart-legend" role="list">${legend.map(l => `<li><svg viewBox="0 0 28 10" aria-hidden="true" class="chart-c${l.color || 1}">
    ${l.line ? `<line class="chart-line ${l.dash ? 'chart-line--dash' : ''}" x1="0" x2="28" y1="5" y2="5"/>` : ''}<g class="chart-marks">${MARKERS[l.marker || 'none'](14, 5)}</g>${l.hatch ? '<rect class="chart-bar--legend-hatch" x="2" y="1" width="24" height="8"/><path class="chart-hatch" d="M4 9L10 1M10 9L16 1M16 9L22 1M22 9L26 3.7"/>' : ''}${l.solid ? '<rect class="chart-bar" x="2" y="1" width="24" height="8"/>' : ''}${l.target ? '<path class="chart-target" d="M14 0V10"/>' : ''}</svg>${esc(l.label)}</li>`).join('')}</ul>` : '';
  return `<figure class="chart stack-sm">${caption ? `<figcaption class="eyebrow">${esc(caption)}</figcaption>` : ''}${svg}${legendHtml}
    <button class="btn btn--ghost" type="button" data-chart-table="${id}" aria-expanded="false" aria-controls="${id}" data-show="${esc(showLabel)}" data-hide="${esc(hideLabel)}">${esc(showLabel)}</button>
    <div class="table-wrap" id="${id}" hidden><table class="table"><thead><tr>${table.head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${table.rows.map(r => `<tr>${r.map((v, i) => (i ? `<td class="num">${esc(v)}</td>` : `<th scope="row">${esc(v)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div></figure>`;
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-chart-table]');
  if (!b) return;
  const t = document.getElementById(b.dataset.chartTable);
  const open = t.hidden;
  t.hidden = !open;
  b.setAttribute('aria-expanded', String(open));
  b.textContent = open ? b.dataset.hide : b.dataset.show;
});
