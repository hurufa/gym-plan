// contrast.js
// WCAG 2.2 contrast math plus the list of every foreground/background token pair the UI uses.
// Used by styleguide.html (live table per theme) and tests.html (pass/fail assertions).

export function parseColor(str) {
  const s = str.trim();
  if (s.startsWith('#')) {
    const h = s.length === 4 ? [...s.slice(1)].map(c => c + c).join('') : s.slice(1);
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(1);
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`Unparsable color: ${str}`);
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p[3] ?? 1];
}

const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

// Alpha-composite fg over an opaque bg.
function flatten(fg, bg) {
  const a = fg[3];
  return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a));
}

export function ratio(fgStr, bgStr) {
  const bg = parseColor(bgStr);
  const fg = flatten(parseColor(fgStr), bg);
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [foreground token, background token, minimum ratio, where it is used]
export const PAIRS = [
  ['--ink', '--bg', 4.5, 'body text on page'],
  ['--ink', '--surface', 4.5, 'text on cards'],
  ['--ink', '--surface-2', 4.5, 'input text, inactive chips'],
  ['--ink-muted', '--bg', 4.5, 'secondary text on page'],
  ['--ink-muted', '--surface', 4.5, 'secondary text on cards'],
  ['--ink-muted', '--surface-2', 4.5, 'unit suffix in inputs'],
  ['--on-primary', '--primary', 4.5, 'primary button, active chip, toast'],
  ['--on-brand', '--brand', 4.5, 'text on brand surfaces, any size'],
  ['--key', '--brand', 4.5, 'key word and labels in orange on header blocks, any size'],
  ['--on-key', '--key', 4.5, 'main button on header blocks (dark text on orange)'],
  ['--brand', '--on-brand', 4.5, 'selected answer on header blocks (block-colour text on light fill)'],
  ['--accent', '--surface', 4.5, 'accent text under 24 px (cards only)'],
  ['--accent', '--bg', 3, 'accent text on page, 24 px and larger only'],
  ['--on-accent', '--accent', 4.5, 'PR badge text on accent fill'],
  ['--on-danger', '--danger', 4.5, 'danger button'],
  ['--danger', '--surface', 4.5, 'error text on cards'],
  ['--danger', '--bg', 4.5, 'error text on page'],
  ['--danger', '--surface-2', 4.5, 'error text near inputs'],
  ['--warning', '--surface', 4.5, 'warning text/icon on cards'],
  ['--warning', '--bg', 4.5, 'warning text/icon on page'],
  ['--success', '--surface', 4.5, 'set-completed text/icon'],
  ['--success', '--bg', 4.5, 'set-completed text/icon on page'],
  ['--ink', '--surface', 4.5, 'text in inputs on header blocks (light field on dark block)'],
  // UI component boundaries and graphics (3:1)
  ['--ink-muted', '--bg', 3, 'input/checkbox border on page'],
  ['--ink-muted', '--surface', 3, 'input/checkbox border on card'],
  ['--accent', '--surface', 3, 'timer ring, active nav indicator'],
  ['--accent', '--surface-2', 3, 'timer ring over its track'],
  ['--btn-border', '--bg', 3, 'main button outline on page'],
  ['--muscle-primary', '--surface', 3, 'primary muscle on body map'],
  ['--chart-1', '--surface', 3, 'chart series 1'],
  ['--chart-2', '--surface', 3, 'chart series 2'],
  ['--chart-3', '--surface', 3, 'chart series 3'],
  ['--chart-4', '--surface', 3, 'chart series 4'],
  // Readability targets (not WCAG rules) for the body map and outlined panels
  ['--muscle-idle', '--figure-base', 1.6, 'untrained muscle vs body-map figure (target)'],
  ['--muscle-idle', '--surface', 2, 'untrained muscle vs card (target)'],
  ['--muscle-primary', '--muscle-idle', 3, 'trained vs untrained muscle'],
  ['--line', '--surface', 1.4, 'panel outline vs card (target)'],
];

export function tokenValue(el, name) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

// Returns one row per pair for the theme applied at `el`.
export function checkPairs(el) {
  return PAIRS.map(([fg, bg, min, use]) => {
    const r = ratio(tokenValue(el, fg), tokenValue(el, bg));
    return { fg, bg, min, use, ratio: r, pass: r >= min };
  });
}

// Rendered-contrast audit: checks the colours the browser actually computes for every visible text
// under `root` against the background it sits on (the nearest ancestor with an opaque-enough fill).
// Catches cascade mistakes that token pairs cannot, such as light text inheriting onto a light control.
// Returns [{ text, fg, bg, ratio, min }] for each failure. Text over images or gradients is skipped.
export function auditContrast(root) {
  const fails = [];
  const seen = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (seen.has(el) || el.closest('svg, script, style, template, [hidden]')) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || box.width < 2 || box.height < 2 || cs.clip === 'rect(0px, 0px, 0px, 0px)') continue;
    let bg = null, opacity = 1;
    for (let a = el; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      opacity *= Number(s.opacity);
      if (s.backgroundImage !== 'none' && !s.backgroundImage.startsWith('url("data:image/svg')) { bg = 'skip'; break; }
      const c = parseColor(s.backgroundColor);
      if (c[3] >= 0.5) { bg = s.backgroundColor; break; }
    }
    if (bg === 'skip' || opacity < 0.5) continue;
    bg ??= getComputedStyle(document.body).backgroundColor;
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const min = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    const r = ratio(cs.color, bg);
    if (r < min) fails.push({ text: el.textContent.trim().slice(0, 40), fg: cs.color, bg, ratio: Math.round(r * 100) / 100, min });
  }
  return fails;
}
