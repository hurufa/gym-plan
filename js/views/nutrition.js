// views/nutrition.js
// Nutrition pages. The disclaimer (with a tick box) is shown once before the first nutrition screen
// and linked from every page (#/nutrition/about). Tabs: #/nutrition (one day's meals, ?date=YYYY-MM-DD,
// weigh-in, trend offers), #/nutrition/week (seven days), #/nutrition/targets (the calculation with
// every number, calorie slider), #/nutrition/filters (food filters, budget mode, hidden foods, swaps).
// All numbers come from nutrition.js; this file only renders and stores preferences.

import { getState, update, localDate, uuid } from '../state.js';
import { loadData } from '../data.js';
import { t, tx, formatDate, formatNumber, formatIDR } from '../i18n.js';
import { esc, icon, openSheet, toast } from '../ui.js';
import * as N from '../nutrition.js';

const n0 = v => formatNumber(Math.round(v));
const n1 = v => formatNumber(v, { maximumFractionDigits: 1 });
const n2 = v => formatNumber(v, { maximumFractionDigits: 3 });
const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + formatNumber(Math.abs(v), { maximumFractionDigits: 1 });

let cache = null;
const data = async () => cache ??= Promise.all([loadData('foods'), loadData('meal-templates'), loadData('enums')]).then(([foods, tpl, enums]) => ({ foods, tpl, enums }));

const setPrefs = fn => update(s => { const p = N.prefsOf(s); fn(p); p.updatedAt = Date.now(); s.nutrition = p; });

export function render(root, ctx) {
  root.innerHTML = `<div class="page"><p class="muted">…</p></div>`;
  data().then(d => draw(root, ctx, d));
}

function draw(root, ctx, d) {
  const s = getState();
  const sub = ctx.params[0];
  if (sub === 'about') return disclaimer(root, ctx, true);
  if (!s.nutritionAck) return disclaimer(root, ctx, false);
  const tab = ['week', 'targets', 'filters'].includes(sub) ? sub : 'today';
  const p = s.profile, prefs = N.prefsOf(s), tg = N.targets(p, prefs);
  const tabs = [['today', '#/nutrition'], ['week', '#/nutrition/week'], ['targets', '#/nutrition/targets'], ['filters', '#/nutrition/filters']];
  root.innerHTML = `
    <header class="brand page-head"><div class="stack">
      <span class="eyebrow eyebrow--rule">${esc(t('nutrition.eyebrow'))}</span>
      <h1 class="display-48">${esc(t('nutrition.title'))} <span class="key">${esc(t('nutrition.titleKey'))}</span></h1>
      <p class="big-num">${esc(t('nutrition.headTargets', { kcal: n0(tg.cal.kcal), protein: n0(tg.macros.protein), carbs: n0(tg.macros.carbs), fat: n0(tg.macros.fat) }))}</p>
    </div></header>
    <nav class="tabs" aria-label="${esc(t('nutrition.tabsLabel'))}"><ul role="list">${tabs.map(([k, href]) =>
      `<li><a href="${href}" ${k === tab ? 'aria-current="page"' : ''}>${esc(t('nutrition.tabs.' + k))}</a></li>`).join('')}</ul></nav>
    <div class="page stack-lg" data-body></div>
    <div class="page"><a class="btn btn--ghost" href="#/nutrition/about">${icon('info')}${esc(t('nutrition.aboutLink'))}</a></div>`;
  const body = root.querySelector('[data-body]');
  const view = { today, week, targets: targetsView, filters }[tab];
  view(body, ctx, d, tg, prefs);
}

// ---------- Disclaimer ----------

function disclaimer(root, ctx, readOnly) {
  const s = getState();
  root.innerHTML = `
    <header class="brand page-head"><div class="stack">
      <span class="eyebrow eyebrow--rule">${esc(t('nutrition.eyebrow'))}</span>
      <h1 class="display-48">${esc(t('nutrition.disclaimer.title'))} <span class="key">${esc(t('nutrition.disclaimer.key'))}</span></h1>
    </div></header>
    <div class="page stack-lg">
      <div class="card stack">
        <p>${esc(t('nutrition.disclaimer.body'))}</p>
        <ul class="stack-sm">${['under18', 'pregnant', 'eating', 'medical'].map(k => `<li>${esc(t('nutrition.disclaimer.' + k))}</li>`).join('')}</ul>
        <p>${esc(t('nutrition.disclaimer.estimates'))}</p>
      </div>
      ${readOnly ? `<a class="btn btn--secondary" href="#/nutrition">${icon('back')}${esc(t('nutrition.disclaimer.back'))}</a>`
        : `<label class="check"><input type="checkbox" data-ack ${s.nutritionAck ? 'checked' : ''}><span>${esc(t('nutrition.disclaimer.tick'))}</span></label>
           <button class="btn btn--primary" data-continue ${s.nutritionAck ? '' : 'disabled'}>${esc(t('common.continue'))}</button>`}
    </div>`;
  if (readOnly) return;
  const box = root.querySelector('[data-ack]'), go = root.querySelector('[data-continue]');
  box.addEventListener('change', () => { go.disabled = !box.checked; });
  go.addEventListener('click', () => { if (!box.checked) return; update(st => { st.nutritionAck = true; }); ctx.rerender(); });
}

// ---------- Notices shared by Today and Targets ----------

function guardNotices(tg) {
  const out = [];
  for (const nt of tg.cal.notes) {
    const msg = nt.code === 'bmr-floor' ? t('nutrition.guard.bmrFloor', { wanted: n0(nt.wanted), bmr: n0(tg.cal.bmr), pct: signed(nt.pct) })
      : t('nutrition.guard.' + (nt.code === 'under-18' ? 'under18' : 'lowBmi'), { bmi: n1(nt.bmi) });
    out.push(`<div class="notice notice--warning">${icon('warning')}<div><strong>${esc(t('nutrition.guard.title'))}</strong> ${esc(msg)}</div></div>`);
  }
  for (const c of tg.macros.changes) {
    const msg = c.code === 'carbs-still-low' ? t('nutrition.macros.carbsLow', { carbs: c.carbs })
      : t('nutrition.macros.' + (c.code === 'fat-lowered' ? 'fatLowered' : 'proteinLowered'), { from: n2(c.from), to: n2(c.to) });
    out.push(`<div class="notice">${icon('info')}<div>${esc(msg)}</div></div>`);
  }
  return out.join('');
}

function trendNotices(s, tg, prefs) {
  const p = s.profile, out = [];
  const fast = N.fastLossCheck(p, s.bodyweights);
  if (fast && !tg.cal.locked) out.push(`<div class="notice notice--warning">${icon('warning')}<div class="stack-sm">
    <p>${esc(t('nutrition.trend.fastLoss', { a: n1(fast.drops[0]), b: n1(fast.drops[1]) }))}</p>
    <button class="btn btn--secondary" data-offset="${Math.round(tg.cal.kcal * 0.1 / 10) * 10}" data-reason="fast">${esc(t('nutrition.trend.raise', { kcal: n0(Math.round(tg.cal.kcal * 0.1 / 10) * 10) }))}</button></div></div>`);
  const cal = N.calibrationCheck(tg.cal, s.bodyweights, localDate(), prefs.lastCalibratedAt);
  if (cal?.code === 'adjust' && !tg.cal.locked) out.push(`<div class="notice">${icon('info')}<div class="stack-sm">
    <p>${esc(t('nutrition.trend.calibrate', { n: cal.weighIns, actual: signed(Math.round(cal.actualPerWeek * 100) / 100), expected: signed(Math.round(cal.expectedPerWeek * 100) / 100), change: signed(cal.change) }))}</p>
    <div class="row"><button class="btn btn--secondary" data-offset="${cal.change}" data-reason="calibrate">${esc(t('nutrition.trend.apply', { change: signed(cal.change) }))}</button>
    <button class="btn btn--ghost" data-calibrated>${esc(t('nutrition.trend.keep'))}</button></div></div></div>`);
  const pw = N.profileWeightCheck(p, s.bodyweights);
  if (pw) out.push(`<div class="notice">${icon('info')}<div class="stack-sm">
    <p>${esc(t('nutrition.trend.profileWeight', { kg: n1(pw.kg), date: formatDate(pw.date), profile: n1(pw.profileKg) }))}</p>
    <button class="btn btn--secondary" data-use-weight="${pw.kg}">${esc(t('nutrition.trend.useWeight', { kg: n1(pw.kg) }))}</button></div></div>`);
  return out.join('');
}

function bindTrend(body, ctx) {
  body.querySelectorAll('[data-offset]').forEach(b => b.addEventListener('click', () => {
    setPrefs(p => { p.offsetKcal = (p.offsetKcal || 0) + Number(b.dataset.offset); if (b.dataset.reason === 'calibrate') p.lastCalibratedAt = localDate(); });
    toast(t('nutrition.trend.applied'));
    ctx.rerender();
  }));
  body.querySelector('[data-calibrated]')?.addEventListener('click', () => { setPrefs(p => { p.lastCalibratedAt = localDate(); }); ctx.rerender(); });
  body.querySelector('[data-use-weight]')?.addEventListener('click', e => {
    update(s => { s.profile = { ...s.profile, weightKg: Number(e.currentTarget.dataset.useWeight), updatedAt: Date.now() }; });
    toast(t('nutrition.trend.weightUpdated'));
    ctx.rerender();
  });
}

// ---------- Today (one day) ----------

const portionText = (it, food) => {
  if (!food.portion.unit) return '';
  const n = Math.round(it.g / food.portion.g);
  return n === 1 ? tx(food.portion.label) : `${n} × ${tx(food.portion.label)}`;
};
const reasonBadge = r => (r ? `<span class="badge badge--neutral">${esc(t('nutrition.reason.' + r))}</span>` : '');

function dayCheck(day) {
  const ok = day.check.kcalOk && day.check.proteinOk && !day.missing.length;
  return ok ? '' : `<div class="notice notice--warning">${icon('warning')}<div>${esc(t('nutrition.dayOff', { kcal: n0(day.totals.kcal), protein: n0(day.totals.protein) }))}</div></div>`;
}

function today(body, ctx, d, tg, prefs) {
  const s = getState();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.date || '') ? ctx.query.date : localDate();
  const menus = N.menusForGoal(d.tpl, s.profile.goal);
  const menu = N.menuForDate(menus, date);
  const day = N.assembleDay(menu, d.foods, tg, prefs);
  const price = day.meals.flatMap(m => m.items).reduce((a, i) => a + i.food.price_idr * i.g / 100, 0);
  const stat = (label, val, target, unit, ok) => `<div class="stat"><span class="eyebrow">${esc(label)}</span>
    <span class="big-num stat-value">${n0(val)} <span class="stat-unit">/ ${n0(target)} ${esc(unit)}</span></span>
    ${ok == null ? '' : `<span class="small">${icon(ok ? 'check' : 'warning')} ${esc(t(ok ? 'nutrition.onTarget' : 'nutrition.offTarget'))}</span>`}</div>`;
  const lastWeight = [...s.bodyweights].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const todays = s.bodyweights.find(w => w.date === localDate());

  body.innerHTML = `
    ${guardNotices(tg)}${trendNotices(s, tg, prefs)}
    ${day.fallback ? `<div class="notice">${icon('info')}<div>${esc(t('nutrition.fallback.' + day.fallback.reason, { from: day.fallback.from, to: day.fallback.to }))}</div></div>` : ''}
    ${day.missing.length ? `<div class="notice notice--warning">${icon('warning')}<div>${esc(t('nutrition.missing', { n: day.missing.length }))}</div></div>` : ''}
    ${dayCheck(day)}
    <section class="stack">
      <div class="row row--between"><div class="stack-sm">
        <span class="eyebrow eyebrow--rule">${esc(formatDate(date))}</span>
        <h2>${esc(tx(day.name))}</h2></div>
        ${date !== localDate() ? `<a class="btn btn--ghost" href="#/nutrition">${esc(t('nutrition.backToday'))}</a>` : ''}</div>
      <div class="stat-grid">
        ${stat(t('nutrition.kcal'), day.totals.kcal, day.targetKcal, t('nutrition.unitKcal'), day.check.kcalOk)}
        ${stat(t('nutrition.protein'), day.totals.protein, day.targetProtein, 'g', day.check.proteinOk)}
        ${stat(t('nutrition.carbs'), day.totals.carbs, tg.macros.carbs, 'g', null)}
        ${stat(t('nutrition.fat'), day.totals.fat, tg.macros.fat, 'g', null)}
      </div>
      <p class="small muted">${esc(t('nutrition.dayFacts', { veg: n0(day.check.vegetableG), fruit: day.check.fruitPortions, fiber: n0(day.totals.fiber), price: formatIDR(Math.round(price / 500) * 500) }))}</p>
    </section>
    ${day.meals.map((m, mi) => meal(m, mi)).join('')}
    <section class="card stack" aria-labelledby="w-title">
      <h2 id="w-title">${esc(t('nutrition.weigh.title'))}</h2>
      <p class="small muted">${esc(lastWeight ? t('nutrition.weigh.last', { kg: n1(lastWeight.kg), date: formatDate(lastWeight.date) }) : t('nutrition.weigh.none'))}</p>
      <form class="row" data-weigh>
        <div class="field"><label for="w-kg">${esc(t('nutrition.weigh.label'))}</label>
          <div class="input-wrap"><input id="w-kg" name="kg" type="number" inputmode="decimal" min="30" max="300" step="0.1" required value="${todays ? todays.kg : ''}"><span class="suffix">kg</span></div></div>
        <button class="btn btn--secondary" type="submit">${esc(t('common.save'))}</button>
      </form>
      <p class="small muted">${esc(t('nutrition.weigh.hint'))}</p>
    </section>`;

  bindTrend(body, ctx);
  body.querySelector('[data-weigh]').addEventListener('submit', e => {
    e.preventDefault();
    const kg = Number(e.currentTarget.kg.value);
    if (!(kg >= 30 && kg <= 300)) return;
    update(st => {
      const rec = st.bodyweights.find(w => w.date === localDate());
      if (rec) Object.assign(rec, { kg, updatedAt: Date.now() });
      else st.bodyweights.push({ id: uuid(), updatedAt: Date.now(), date: localDate(), kg });
    });
    toast(t('nutrition.weigh.saved', { kg: n1(kg) }));
    ctx.rerender();
  });
  body.querySelectorAll('[data-swap]').forEach(b => b.addEventListener('click', () => {
    const it = day.meals.flatMap(m => m.items).find(i => i.key === b.dataset.swap);
    swapSheet(it, d, ctx);
  }));
}

function meal(m, mi) {
  return `<section class="card stack" aria-labelledby="meal-${mi}">
    <div class="stack-sm"><span class="eyebrow eyebrow--rule">${esc(t('nutrition.mealType.' + m.type))}</span>
      <h3 id="meal-${mi}">${esc(tx(m.name))}</h3>
      <p class="small">${esc(tx(m.prep))}</p>
      ${m.changed ? `<p class="small muted">${esc(t('nutrition.prepChanged'))}</p>` : ''}</div>
    <div class="table-wrap"><table class="table meal-table" aria-labelledby="meal-${mi}">
      <thead><tr><th>${esc(t('nutrition.col.food'))}</th><th class="num">${esc(t('nutrition.col.grams'))}</th><th class="num">${esc(t('nutrition.unitKcal'))}</th><th class="num">${esc(t('nutrition.col.protein'))}</th><th><span class="visually-hidden">${esc(t('nutrition.col.swap'))}</span></th></tr></thead>
      <tbody>${m.items.map(it => `<tr>
        <td>${esc(tx(it.food.name))} ${reasonBadge(it.reason)}${portionText(it, it.food) ? `<br><span class="small muted">${esc(portionText(it, it.food))}</span>` : ''}</td>
        <td class="num">${n0(it.g)} g</td><td class="num">${n0(it.food.kcal * it.g / 100)}</td><td class="num">${n1(it.food.protein * it.g / 100)}</td>
        <td><button class="btn btn--ghost" data-swap="${esc(it.key)}" aria-label="${esc(t('nutrition.swapFood', { food: tx(it.food.name) }))}">${esc(t('nutrition.swap'))}</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">${esc(t('nutrition.mealTotal'))}</th><td></td><td class="num">${n0(m.totals.kcal)}</td><td class="num">${n1(m.totals.protein)}</td><td></td></tr></tfoot>
    </table></div></section>`;
}

async function swapSheet(it, d, ctx) {
  const prefs = N.prefsOf(getState());
  const alts = N.alternatives(it.food, it.slot, d.foods, prefs).slice(0, 8);
  const row = f => `<button class="pick" data-pick="${esc(f.id)}" type="button"><span>${esc(tx(f.name))}</span>
    <small>${esc(t('nutrition.per100', { kcal: n0(f.kcal), p: n1(f.protein), c: n1(f.carbs), f: n1(f.fat), price: formatIDR(f.price_idr) }))}</small></button>`;
  const bodyEl = document.createElement('div');
  bodyEl.className = 'stack';
  bodyEl.innerHTML = `<p class="small">${esc(t('nutrition.swapIntro', { food: tx(it.food.name) }))}</p>
    <div class="pick-list">${alts.map(row).join('') || `<p>${esc(t('nutrition.noAlternatives'))}</p>`}</div>
    <button class="btn btn--danger" type="button" data-never>${icon('close')}${esc(t('nutrition.never', { food: tx(it.food.name) }))}</button>`;
  let picked = null;
  bodyEl.addEventListener('click', e => {
    const b = e.target.closest('[data-pick], [data-never]');
    if (!b) return;
    picked = b.dataset.pick ? { pick: b.dataset.pick } : { never: it.food.id };
    b.closest('dialog').close();
  });
  await openSheet({ title: t('nutrition.swapTitle'), body: bodyEl, closeLabel: t('common.close') });
  if (!picked) return;
  setPrefs(p => {
    if (picked.pick) p.swaps = { ...p.swaps, [it.key]: picked.pick };
    else { p.never = [...new Set([...p.never, picked.never])]; const sw = { ...p.swaps }; delete sw[it.key]; p.swaps = sw; }
  });
  toast(picked.pick ? t('nutrition.swapped') : t('nutrition.hidden'));
  ctx.rerender();
}

// ---------- Week ----------

function week(body, ctx, d, tg, prefs) {
  const s = getState();
  const menus = N.menusForGoal(d.tpl, s.profile.goal);
  const today = localDate();
  const rows = N.weekDates(today).map(date => ({ date, day: N.assembleDay(N.menuForDate(menus, date), d.foods, tg, prefs) }));
  body.innerHTML = `
    <p>${esc(t('nutrition.weekIntro', { n: menus.length }))}</p>
    <div class="table-wrap"><table class="table week-table">
      <caption class="visually-hidden">${esc(t('nutrition.tabs.week'))}</caption>
      <thead><tr><th>${esc(t('nutrition.col.date'))}</th><th>${esc(t('nutrition.col.menu'))}</th><th class="num">${esc(t('nutrition.unitKcal'))}</th><th class="num">${esc(t('nutrition.col.protein'))}</th></tr></thead>
      <tbody>${rows.map(({ date, day }) => `<tr ${date === today ? 'aria-current="date"' : ''}>
        <td>${esc(formatDate(date))}${date === today ? ` <span class="badge">${esc(t('nutrition.today'))}</span>` : ''}</td>
        <td><a href="#/nutrition?date=${date}">${esc(tx(day.name))}</a>${day.check.kcalOk && day.check.proteinOk ? '' : ` ${icon('warning', t('nutrition.offTarget'))}`}</td>
        <td class="num">${n0(day.totals.kcal)}</td><td class="num">${n0(day.totals.protein)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted">${esc(t('nutrition.weekTolerance', { kcal: n0(tg.cal.kcal), protein: n0(tg.macros.protein) }))}</p>`;
}

// ---------- Targets (the calculation) ----------

function targetsView(body, ctx, d, tg, prefs) {
  const p = getState().profile, c = tg.cal, m = tg.macros;
  const sexConst = p.sex === 'male' ? '+ 5' : '− 161';
  const formula = (label, text) => `<div class="stack-sm"><span class="eyebrow">${esc(label)}</span><p class="mono">${esc(text)}</p></div>`;
  const lo = c.tdee * 0.9, hi = c.tdee * 1.1;
  body.innerHTML = `
    ${guardNotices(tg)}
    <section class="card stack" aria-labelledby="cal-title">
      <h2 id="cal-title">${esc(t('nutrition.calc.calories'))}</h2>
      ${formula(t('nutrition.calc.bmr'), t('nutrition.calc.bmrFormula', { kg: n1(p.weightKg), cm: n1(p.heightCm), age: p.age, sexConst, bmr: n0(c.bmr) }))}
      ${formula(t('nutrition.calc.activity'), t('nutrition.calc.activityFormula', { life: n2(c.lifeFactor), lifeLabel: t('options.dailyLife.' + p.dailyLife + '.label'), days: p.days, factor: n2(c.factor) }))}
      ${formula(t('nutrition.calc.tdee'), t('nutrition.calc.tdeeFormula', { bmr: n0(c.bmr), factor: n2(c.factor), tdee: n0(c.tdee), lo: n0(lo), hi: n0(hi) }))}
      ${formula(t('nutrition.calc.target'), t('nutrition.calc.targetFormula', { tdee: n0(c.tdee), pct: signed(c.pct), offset: c.offsetKcal ? ` ${signed(c.offsetKcal)} kcal` : '', kcal: n0(c.kcal) }))}
      <div class="field">
        <label for="adj">${esc(t('nutrition.calc.slider', { goal: t('options.goal.' + p.goal + '.label') }))}</label>
        ${c.range[0] === c.range[1] || c.locked ? `<p class="small muted">${esc(t(c.locked ? 'nutrition.calc.sliderLocked' : 'nutrition.calc.sliderFixed'))}</p>` : `
        <input class="slider" id="adj" type="range" min="${c.range[0]}" max="${c.range[1]}" step="1" value="${c.pct}" aria-valuetext="${esc(signed(c.pct))}%">
        <div class="slider-row"><span>${signed(c.range[0])}%</span><output for="adj" class="big-num" data-adj-out>${signed(c.pct)}%</output><span>${signed(c.range[1])}%</span></div>
        <p class="small muted">${esc(t('nutrition.calc.sliderDefault', { pct: signed(c.defaultPct) }))}</p>`}
      </div>
      ${c.offsetKcal ? `<div class="row"><p class="small">${esc(t('nutrition.calc.offset', { kcal: signed(c.offsetKcal) }))}</p><button class="btn btn--ghost" data-reset-offset>${esc(t('nutrition.calc.resetOffset'))}</button></div>` : ''}
    </section>
    <section class="card stack" aria-labelledby="mac-title">
      <h2 id="mac-title">${esc(t('nutrition.calc.macros'))}</h2>
      ${m.usesBmi25 ? `<p class="small">${esc(t('nutrition.calc.bmi25', { bmi: n1(c.bmi), w: n1(m.refWeight) }))}</p>` : ''}
      ${formula(t('nutrition.protein'), t('nutrition.calc.proteinFormula', { perKg: n2(m.proteinPerKg), w: n1(m.refWeight), g: m.protein, kcal: n0(m.protein * 4), why: t(c.deficit ? 'nutrition.calc.proteinDeficit' : 'nutrition.calc.proteinDefault') }))}
      ${formula(t('nutrition.fat'), t('nutrition.calc.fatFormula', { perKg: n2(m.fatPerKg), w: n1(m.refWeight), g: m.fat, kcal: n0(m.fat * 9) }))}
      ${formula(t('nutrition.carbs'), t('nutrition.calc.carbsFormula', { kcal: n0(c.kcal), p: m.protein, f: m.fat, g: m.carbs }))}
      <p class="small muted">${esc(t('nutrition.calc.ranges'))}</p>
    </section>`;
  const slider = body.querySelector('#adj');
  if (slider) {
    const out = body.querySelector('[data-adj-out]');
    slider.addEventListener('input', () => { out.textContent = `${signed(Number(slider.value))}%`; slider.setAttribute('aria-valuetext', `${signed(Number(slider.value))}%`); });
    slider.addEventListener('change', () => { setPrefs(pr => { pr.adjustPct = Number(slider.value); }); ctx.rerender(); requestAnimationFrame(() => document.getElementById('adj')?.focus()); });
  }
  body.querySelector('[data-reset-offset]')?.addEventListener('click', () => { setPrefs(pr => { pr.offsetKcal = 0; }); ctx.rerender(); });
}

// ---------- Filters ----------

function filters(body, ctx, d, tg, prefs) {
  const keys = ['vegetarian', ...N.FILTER_TAGS, 'budget'];
  const byId = Object.fromEntries(d.foods.map(f => [f.id, f]));
  const swaps = Object.entries(prefs.swaps).filter(([, id]) => byId[id]);
  body.innerHTML = `
    <section class="stack">
      <h2>${esc(t('nutrition.filters.title'))}</h2>
      <p class="small muted">${esc(t('nutrition.filters.hint'))}</p>
      <div class="chip-group" role="group" aria-label="${esc(t('nutrition.filters.title'))}">${keys.map(k =>
        `<label class="chip"><input type="checkbox" data-filter="${k}" ${prefs.filters[k] ? 'checked' : ''}>${esc(t('nutrition.filters.' + k))}</label>`).join('')}</div>
    </section>
    <section class="stack">
      <h2>${esc(t('nutrition.filters.neverTitle'))}</h2>
      ${prefs.never.length ? `<ul class="stack-sm" role="list">${prefs.never.filter(id => byId[id]).map(id => `<li class="row row--between"><span>${esc(tx(byId[id].name))}</span>
        <button class="btn btn--ghost" data-unhide="${esc(id)}">${esc(t('nutrition.filters.show'))}</button></li>`).join('')}</ul>`
        : `<p class="small muted">${esc(t('nutrition.filters.neverNone'))}</p>`}
    </section>
    <section class="stack">
      <h2>${esc(t('nutrition.filters.swapsTitle'))}</h2>
      <p class="small muted">${esc(t('nutrition.filters.swapsCount', { n: swaps.length }))}</p>
      ${swaps.length ? `<button class="btn btn--secondary" data-clear-swaps>${esc(t('nutrition.filters.clearSwaps'))}</button>` : ''}
    </section>`;
  body.addEventListener('change', e => {
    const k = e.target.dataset.filter;
    if (!k) return;
    setPrefs(p => { p.filters = { ...p.filters, [k]: e.target.checked }; });
  });
  body.querySelectorAll('[data-unhide]').forEach(b => b.addEventListener('click', () => { setPrefs(p => { p.never = p.never.filter(x => x !== b.dataset.unhide); }); ctx.rerender(); }));
  body.querySelector('[data-clear-swaps]')?.addEventListener('click', () => { setPrefs(p => { p.swaps = {}; }); toast(t('nutrition.filters.swapsCleared')); ctx.rerender(); });
}
