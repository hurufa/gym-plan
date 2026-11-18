// ui.js
// Small DOM helpers and the behaviour of shared components: escaping, icons, toast,
// bottom sheet, confirm dialog, popover, stepper and progress ring.
// Imported by views and by styleguide.html. Styles live in css/components.css.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Inline icons (stroke = currentColor). Kept as path data so they theme automatically.
const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  plan: 'M4 5h16v15H4zM4 9h16M9 3v4M15 3v4',
  dumbbell: 'M2 12h2M20 12h2M6 7v10M18 7v10M4 9v6M20 9v6M6 12h12',
  food: 'M7 3v8a2 2 0 0 0 2 2v8M5 3v6M9 3v6M17 3c-2 2-2 6 0 8v10',
  chart: 'M4 20V4M4 20h16M8 16l4-5 3 3 5-7',
  book: 'M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  warning: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  error: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v5M12 16v.5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5V8',
  check: 'M5 12l5 5 9-10',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
};
export function icon(name, label = '') {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}><path d="${ICONS[name]}"/></svg>`;
}

export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

// Toast: brief, non-blocking, announced politely.
export function toast(message, ms = 3500) {
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = html('<div class="toast-region" role="status" aria-live="polite"></div>');
    document.body.append(region);
  }
  const el = html(`<div class="toast">${esc(message)}</div>`);
  region.append(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

// Bottom sheet built on <dialog>: focus trap, Esc to close and inert background come from the browser.
// actions: [{label, value, variant}] -> resolves with the chosen value (or null on close).
export function openSheet({ title, body, actions = [], closeLabel = 'Close' }) {
  const dlg = html(`<dialog class="sheet" aria-labelledby="sheet-title">
    <div class="sheet-head"><h3 id="sheet-title">${esc(title)}</h3>
      <button class="btn btn--ghost" data-close aria-label="${esc(closeLabel)}">${icon('close')}</button></div>
    <div class="sheet-body"></div>
    <div class="sheet-actions"></div></dialog>`);
  const bodyEl = dlg.querySelector('.sheet-body');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
  const actionsEl = dlg.querySelector('.sheet-actions');
  for (const a of actions) {
    const b = html(`<button class="btn btn--${a.variant || 'secondary'}">${esc(a.label)}</button>`);
    b.addEventListener('click', () => { dlg.returnValue = a.value; dlg.close(); });
    actionsEl.append(b);
  }
  if (!actions.length) actionsEl.remove();
  document.body.append(dlg);
  return new Promise(resolve => {
    dlg.querySelector('[data-close]').addEventListener('click', () => { dlg.returnValue = ''; dlg.close(); });
    dlg.addEventListener('close', () => { resolve(dlg.returnValue || null); dlg.remove(); });
    dlg.showModal();
  });
}

export async function confirmDialog({ title, body, confirm, cancel, danger = false, closeLabel }) {
  const v = await openSheet({
    title, body, closeLabel,
    actions: [{ label: cancel, value: 'no', variant: 'secondary' }, { label: confirm, value: 'yes', variant: danger ? 'danger' : 'primary' }],
  });
  return v === 'yes';
}

// Popover anchored under a trigger. One open at a time; closes on Esc, outside click or second tap.
let openPop = null;
export function closePopover() {
  if (!openPop) return;
  openPop.trigger.setAttribute('aria-expanded', 'false');
  openPop.el.remove();
  openPop = null;
}
export function popover(trigger, contentHtml) {
  const same = openPop?.trigger === trigger;
  closePopover();
  if (same) return;
  const id = 'pop-' + Math.random().toString(36).slice(2);
  const el = html(`<div class="popover" id="${id}" role="dialog" aria-label="${esc(trigger.textContent)}">${contentHtml}</div>`);
  document.body.append(el);
  const r = trigger.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left + scrollX, scrollX + document.documentElement.clientWidth - el.offsetWidth - 8));
  el.style.left = left + 'px';
  el.style.top = (r.bottom + scrollY + 6) + 'px';
  trigger.setAttribute('aria-expanded', 'true');
  trigger.setAttribute('aria-controls', id);
  openPop = { trigger, el };
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openPop) { const t = openPop.trigger; closePopover(); t.focus(); } });
document.addEventListener('click', e => { if (openPop && !openPop.el.contains(e.target) && !openPop.trigger.contains(e.target)) closePopover(); });

// Stepper: <div class="stepper" data-step="2.5" data-min="0"><button data-dec>…<input>…<button data-inc>
document.addEventListener('click', e => {
  const btn = e.target.closest('.stepper [data-inc], .stepper [data-dec]');
  if (!btn) return;
  const root = btn.closest('.stepper');
  const input = root.querySelector('input');
  const step = Number(root.dataset.step || 1);
  const min = root.dataset.min !== undefined ? Number(root.dataset.min) : -Infinity;
  const max = root.dataset.max !== undefined ? Number(root.dataset.max) : Infinity;
  const v = Number(input.value || 0) + (btn.hasAttribute('data-inc') ? step : -step);
  input.value = String(Math.round(Math.min(max, Math.max(min, v)) * 100) / 100);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

// Progress ring markup; set fraction 0..1 with setRing().
const R = 90, C = 2 * Math.PI * R;
export function ringMarkup(label = '') {
  return `<div class="ring"><svg viewBox="0 0 200 200" aria-hidden="true">
    <circle class="ring-track" cx="100" cy="100" r="${R}" fill="none" stroke-width="10"/>
    <circle class="ring-value" cx="100" cy="100" r="${R}" fill="none" stroke-width="10" stroke-dasharray="${C}" stroke-dashoffset="0"/>
    </svg><span class="ring-label big-num" role="timer" aria-live="off">${esc(label)}</span></div>`;
}
export function setRing(ringEl, fraction, label) {
  ringEl.querySelector('.ring-value').style.strokeDashoffset = String(C * (1 - Math.max(0, Math.min(1, fraction))));
  if (label !== undefined) ringEl.querySelector('.ring-label').textContent = label;
}
