// views/progress.js
// Progress pages. Tabs: #/progress (streak, weekly adherence, training-day heatmap, PR list),
// #/progress/body (weight with 7-day average, measurements), #/progress/lifts (estimated 1RM per lift,
// weekly sets per muscle group vs the plan), #/progress/log (workouts, meal check-off, notes).
// #/progress/workout/<id|new> edits a workout or logs one by hand. Every record can be edited or
// deleted. Numbers come from tracker.js; charts from charts.js.

import { getState, update, localDate, uuid } from '../state.js';
import { loadData } from '../data.js';
import { t, tx, formatDate, formatNumber } from '../i18n.js';
import { esc, icon, toast, confirmDialog } from '../ui.js';
import * as T from '../tracker.js';
import { lineChart, barChart, heatmap, chartFigure } from '../charts.js';
import { countSets, groupMaps, GOALS } from '../planner.js';
import { ensurePlan } from '../plans.js';

const n1 = v => formatNumber(v, { maximumFractionDigits: 1 });
const short = d => { const [day, month] = formatDate(d).split(' '); return `${day} ${month.slice(0, 3)}`; };
const tableLabels = () => ({ showLabel: t('progress.chart.showTable'), hideLabel: t('progress.chart.hideTable') });
let cache = null;
const data = async () => cache ??= Promise.all([loadData('exercises'), loadData('enums')]).then(([exercises, enums]) => ({ exercises, enums, exById: Object.fromEntries(exercises.map(e => [e.id, e])) }));

export function render(root, ctx) {
  root.innerHTML = `<div class="page"><p class="muted">…</p></div>`;
  data().then(d => draw(root, ctx, d));
}

function draw(root, ctx, d) {
  const sub = ctx.params[0];
  if (sub === 'workout') return editor(root, ctx, d, ctx.params[1]);
  const tab = ['body', 'lifts', 'log'].includes(sub) ? sub : 'overview';
  const tabs = [['overview', '#/progress'], ['body', '#/progress/body'], ['lifts', '#/progress/lifts'], ['log', '#/progress/log']];
  root.innerHTML = `
    <header class="brand page-head"><div class="stack">
      <span class="eyebrow eyebrow--rule">${esc(t('progress.eyebrow'))}</span>
      <h1 class="display-48">${esc(t('progress.title'))} <span class="key">${esc(t('progress.titleKey'))}</span></h1>
    </div></header>
    <nav class="tabs" aria-label="${esc(t('progress.tabsLabel'))}"><ul role="list">${tabs.map(([k, href]) =>
      `<li><a href="${href}" ${k === tab ? 'aria-current="page"' : ''}>${esc(t('progress.tabs.' + k))}</a></li>`).join('')}</ul></nav>
    <div class="page stack-lg" data-body></div>`;
  const body = root.querySelector('[data-body]');
  ({ overview, body: bodyTab, lifts, log })[tab](body, ctx, d);
}

const prText = (pr, d) => {
  const name = tx(d.exById[pr.exerciseId]?.name);
  const v = pr.type === 'reps' ? t('progress.pr.reps', { reps: pr.reps, previous: pr.previous })
    : pr.type === 'reps-at-load' ? t('progress.pr.repsAtLoad', { reps: pr.reps, kg: n1(pr.kg), previous: pr.previous })
      : t('progress.pr.' + (pr.type === 'e1rm' ? 'e1rm' : 'heaviest'), { kg: n1(pr.kg), previous: n1(pr.previous) });
  return { name, v };
};

// ---------- Overview ----------

function overview(body, ctx, d) {
  const s = getState(), p = s.profile, today = localDate();
  const adherence = T.weeklyAdherence(s.workouts, p.days, 8);
  const thisWeek = adherence.at(-1);
  const prs = T.allPRs(s.workouts, d.exById);
  const weeks = Array.from({ length: 16 }, (_, i) => T.addDays(T.weekStart(today), -7 * (15 - i)));
  const days = T.trainingDays(s.workouts);
  const trainedDates = Object.keys(days).filter(x => x >= weeks[0]).sort();
  const dayLabels = t('progress.dayLetters').split(',');
  body.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><span class="eyebrow">${esc(t('home.streak'))}</span><span class="big-num stat-value">${T.streak(s.workouts, p.days)} <span class="stat-unit">${esc(t('home.weeks'))}</span></span></div>
      <div class="stat"><span class="eyebrow">${esc(t('progress.thisWeek'))}</span><span class="big-num stat-value">${thisWeek.done} <span class="stat-unit">/ ${thisWeek.planned}</span></span></div>
      <div class="stat"><span class="eyebrow">${esc(t('progress.workouts'))}</span><span class="big-num stat-value">${s.workouts.length}</span></div>
    </div>
    ${s.workouts.length ? '' : `<div class="notice">${icon('info')}<div>${esc(t('progress.empty'))} <a href="#/session">${esc(t('home.startSession'))}</a> · <a href="#/progress/workout/new">${esc(t('progress.log.addWorkout'))}</a></div></div>`}
    <section class="card stack">
      <h2>${esc(t('progress.adherence.title'))}</h2>
      ${chartFigure({ ...tableLabels(),
        svg: barChart({ title: t('progress.adherence.title'), desc: t('progress.adherence.desc', { days: p.days }), max: Math.max(p.days, ...adherence.map(a => a.done)),
          bars: adherence.map(a => ({ label: short(a.start) + (a.current ? ' *' : ''), value: a.done, target: a.planned, pattern: a.done < a.planned })) }),
        legend: [{ label: t('progress.adherence.complete'), solid: true }, { label: t('progress.adherence.incomplete'), hatch: true }, { label: t('progress.adherence.planned', { days: p.days }), target: true }],
        table: { head: [t('progress.col.week'), t('progress.col.done'), t('progress.col.planned')], rows: adherence.map(a => [formatDate(a.start), String(a.done), String(a.planned)]) } })}
      <p class="small muted">${esc(t('progress.adherence.note'))}</p>
    </section>
    <section class="card stack">
      <h2>${esc(t('progress.heatmap.title'))}</h2>
      ${chartFigure({ ...tableLabels(),
        svg: heatmap({ title: t('progress.heatmap.title'), desc: t('progress.heatmap.desc', { n: trainedDates.length }), days, weeks, today, dayLabels }),
        legend: [{ label: t('progress.heatmap.trained'), solid: true }, { label: t('progress.heatmap.rest'), line: false }],
        table: { head: [t('progress.col.date'), t('progress.col.workouts')], rows: trainedDates.map(x => [formatDate(x), String(days[x])]) } })}
    </section>
    <section class="stack">
      <h2>${esc(t('progress.pr.title'))}</h2>
      ${prs.length ? `<ul class="stack-sm" role="list">${prs.slice(0, 30).map(pr => { const { name, v } = prText(pr, d); return `<li class="pr-item">${icon('trophy')}<div><strong>${esc(name)}</strong><br><span class="small">${esc(v)} · ${esc(formatDate(pr.date))}</span></div></li>`; }).join('')}</ul>`
        : `<p class="muted">${esc(t('progress.pr.none'))}</p>`}
    </section>`;
}

// ---------- Body ----------

function bodyTab(body, ctx, d) {
  const s = getState();
  const trend = T.weightTrend(s.bodyweights);
  const meas = [...s.measurements].sort((a, b) => (a.date < b.date ? -1 : 1));
  const MEAS = ['waistCm', 'chestCm', 'armCm'];
  body.innerHTML = `
    <section class="card stack">
      <h2>${esc(t('progress.weight.title'))}</h2>
      ${trend.length ? chartFigure({ ...tableLabels(),
        svg: lineChart({ title: t('progress.weight.title'), desc: t('progress.weight.desc', { n: trend.length, first: n1(trend[0].kg), last: n1(trend.at(-1).kg), avg: n1(trend.at(-1).avg) }), xLabel: short,
          series: [{ name: 'daily', points: trend.map(w => ({ x: w.date, y: w.kg })), marker: 'circle', color: 3 }, { name: 'avg', points: trend.map(w => ({ x: w.date, y: w.avg })), line: true, marker: 'none', color: 2 }] }),
        legend: [{ label: t('progress.weight.daily'), marker: 'circle', color: 3 }, { label: t('progress.weight.avg'), line: true, color: 2 }],
        table: { head: [t('progress.col.date'), t('progress.col.kg'), t('progress.col.avg')], rows: trend.map(w => [formatDate(w.date), n1(w.kg), n1(w.avg)]) } })
        : `<p class="muted">${esc(t('progress.weight.none'))}</p>`}
      <form class="stack-sm" data-weight-form>
        <input type="hidden" name="id">
        <div class="row">
          <div class="field"><label for="wf-date">${esc(t('progress.col.date'))}</label><input id="wf-date" name="date" type="date" required max="${localDate()}" value="${localDate()}"></div>
          <div class="field"><label for="wf-kg">${esc(t('progress.weight.label'))}</label><div class="input-wrap"><input id="wf-kg" name="kg" type="number" inputmode="decimal" min="30" max="300" step="0.1" required><span class="suffix">kg</span></div></div>
        </div>
        <div class="row"><button class="btn btn--primary" type="submit">${esc(t('common.save'))}</button><button class="btn btn--ghost" type="reset">${esc(t('common.cancel'))}</button></div>
      </form>
      ${recordList(s.bodyweights, w => `${formatDate(w.date)} · ${n1(w.kg)} kg`, 'bodyweights')}
    </section>
    <section class="card stack">
      <h2>${esc(t('progress.meas.title'))}</h2>
      ${meas.length ? chartFigure({ ...tableLabels(),
        svg: lineChart({ title: t('progress.meas.title'), desc: t('progress.meas.desc', { n: meas.length }), xLabel: short,
          series: MEAS.map((k, i) => ({ name: k, points: meas.filter(m => m[k] > 0).map(m => ({ x: m.date, y: m[k] })), line: true, dash: i === 1, marker: ['circle', 'square', 'diamond'][i], color: [1, 3, 4][i] })).filter(x => x.points.length) }),
        legend: MEAS.map((k, i) => ({ label: t('progress.meas.' + k), line: true, dash: i === 1, marker: ['circle', 'square', 'diamond'][i], color: [1, 3, 4][i] })),
        table: { head: [t('progress.col.date'), ...MEAS.map(k => t('progress.meas.' + k))], rows: meas.map(m => [formatDate(m.date), ...MEAS.map(k => (m[k] ? n1(m[k]) : '–'))]) } })
        : `<p class="muted">${esc(t('progress.meas.none'))}</p>`}
      <form class="stack-sm" data-meas-form>
        <input type="hidden" name="id">
        <div class="field"><label for="mf-date">${esc(t('progress.col.date'))}</label><input id="mf-date" name="date" type="date" required max="${localDate()}" value="${localDate()}"></div>
        <div class="row">${MEAS.map(k => `<div class="field"><label for="mf-${k}">${esc(t('progress.meas.' + k))} <span class="muted">(${esc(t('common.optional'))})</span></label>
          <div class="input-wrap"><input id="mf-${k}" name="${k}" type="number" inputmode="decimal" min="10" max="250" step="0.5"><span class="suffix">cm</span></div></div>`).join('')}</div>
        <p class="small muted">${esc(t('progress.meas.hint'))}</p>
        <div class="row"><button class="btn btn--primary" type="submit">${esc(t('common.save'))}</button><button class="btn btn--ghost" type="reset">${esc(t('common.cancel'))}</button></div>
      </form>
      ${recordList(s.measurements, m => `${formatDate(m.date)} · ${MEAS.filter(k => m[k]).map(k => `${t('progress.meas.' + k)} ${n1(m[k])} cm`).join(' · ')}`, 'measurements')}
    </section>`;

  const weightForm = body.querySelector('[data-weight-form]');
  weightForm.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget, kg = Number(f.kg.value), date = f.date.value;
    if (!(kg >= 30 && kg <= 300) || !date) return;
    update(st => {
      // One weigh-in per day: saving a date that already has one replaces it.
      const rec = st.bodyweights.find(w => w.id === f.id.value) || st.bodyweights.find(w => w.date === date);
      if (rec) Object.assign(rec, { date, kg, updatedAt: Date.now() });
      else st.bodyweights.push({ id: uuid(), updatedAt: Date.now(), date, kg });
    });
    toast(t('progress.saved'));
    ctx.rerender();
  });
  const measForm = body.querySelector('[data-meas-form]');
  measForm.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget;
    const vals = Object.fromEntries(MEAS.map(k => [k, f[k].value ? Number(f[k].value) : null]));
    if (!MEAS.some(k => vals[k]) || !f.date.value) { toast(t('progress.meas.needOne')); return; }
    update(st => {
      const rec = st.measurements.find(m => m.id === f.id.value);
      if (rec) Object.assign(rec, { date: f.date.value, ...vals, updatedAt: Date.now() });
      else st.measurements.push({ id: uuid(), updatedAt: Date.now(), date: f.date.value, ...vals });
    });
    toast(t('progress.saved'));
    ctx.rerender();
  });
  bindRecordList(body, ctx, {
    bodyweights: r => { weightForm.id.value = r.id; weightForm.date.value = r.date; weightForm.kg.value = r.kg; weightForm.kg.focus(); },
    measurements: r => { measForm.id.value = r.id; measForm.date.value = r.date; MEAS.forEach(k => { measForm[k].value = r[k] ?? ''; }); measForm.date.focus(); },
  });
}

// Newest-first list with Edit and Delete for a collection.
function recordList(list, label, collection, limit = 30) {
  const rows = [...list].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
  if (!rows.length) return '';
  return `<ul class="stack-sm" role="list">${rows.map(r => `<li class="alt-row"><span>${esc(label(r))}</span><span class="row">
    <button class="btn btn--ghost" data-edit="${collection}:${r.id}" aria-label="${esc(t('common.edit'))}: ${esc(label(r))}">${esc(t('common.edit'))}</button>
    <button class="btn btn--ghost" data-delete="${collection}:${r.id}" aria-label="${esc(t('progress.delete'))}: ${esc(label(r))}">${icon('trash')}${esc(t('progress.delete'))}</button></span></li>`).join('')}</ul>`;
}
function bindRecordList(body, ctx, editors = {}) {
  body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const [c, id] = b.dataset.edit.split(':');
    const rec = getState()[c].find(r => r.id === id);
    if (c === 'workouts') location.hash = `#/progress/workout/${id}`;
    else if (rec) editors[c]?.(rec);
  }));
  body.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', async () => {
    const [c, id] = b.dataset.delete.split(':');
    const ok = await confirmDialog({ title: t('progress.deleteTitle'), body: `<p>${esc(t('progress.deleteBody'))}</p>`, confirm: t('progress.delete'), cancel: t('common.cancel'), danger: true, closeLabel: t('common.close') });
    if (!ok) return;
    update(st => { st[c] = st[c].filter(r => r.id !== id); });
    toast(t('progress.deleted'));
    ctx.rerender();
  }));
}

// ---------- Lifts ----------

function lifts(body, ctx, d) {
  const s = getState();
  const ids = T.loggedLifts(s.workouts, d.exById);
  const pick = ids.includes(ctx.query.lift) ? ctx.query.lift : ids[0];
  const weekParam = /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.week || '') ? T.weekStart(ctx.query.week) : T.weekStart(localDate());
  const series = pick ? T.e1rmSeries(s.workouts, pick) : [];
  body.innerHTML = `
    <section class="card stack">
      <h2>${esc(t('progress.lifts.title'))}</h2>
      ${ids.length ? `<div class="field"><label for="lift">${esc(t('progress.lifts.pick'))}</label>
        <select id="lift">${ids.map(id => `<option value="${id}" ${id === pick ? 'selected' : ''}>${esc(tx(d.exById[id].name))}</option>`).join('')}</select></div>
        ${chartFigure({ ...tableLabels(),
          svg: lineChart({ title: t('progress.lifts.chartTitle', { name: tx(d.exById[pick].name) }), desc: t('progress.lifts.desc', { n: series.length, first: n1(series[0]?.e1rm ?? 0), last: n1(series.at(-1)?.e1rm ?? 0) }), xLabel: short,
            series: [{ name: 'e1rm', points: series.map(p => ({ x: p.date, y: p.e1rm })), line: true, marker: 'square', color: 2 }] }),
          legend: [{ label: t('progress.lifts.legend'), line: true, marker: 'square', color: 2 }],
          table: { head: [t('progress.col.date'), t('progress.lifts.legend')], rows: series.map(p => [formatDate(p.date), `${n1(p.e1rm)} kg`]) } })}
        <p class="small muted">${esc(t('progress.lifts.note'))}</p>`
        : `<p class="muted">${esc(t('progress.lifts.none'))}</p>`}
    </section>
    <section class="card stack" data-sets><p class="muted">…</p></section>`;
  body.querySelector('#lift')?.addEventListener('change', e => { location.hash = `#/progress/lifts?lift=${e.target.value}&week=${weekParam}`; });

  ensurePlan().then(r => {
    const box = body.querySelector('[data-sets]');
    if (!r || !box) return;
    const { groupOf, groups } = groupMaps(d.enums);
    const logged = T.loggedWeeklySets(s.workouts, weekParam, d.exById, countSets, groupOf, groups);
    const planned = r.plan.weekly;
    const [lo, hi] = GOALS[s.profile.goal].weekly;
    const name = g => tx(d.enums.groups.find(x => x.id === g).name);
    const end = T.addDays(weekParam, 6);
    box.innerHTML = `
      <h2>${esc(t('progress.sets.title'))}</h2>
      <div class="row row--between">
        <a class="btn btn--ghost" href="#/progress/lifts?week=${T.addDays(weekParam, -7)}${pick ? `&lift=${pick}` : ''}">${icon('back')}${esc(t('progress.sets.prev'))}</a>
        <span class="eyebrow">${esc(formatDate(weekParam))} – ${esc(formatDate(end))}</span>
        ${weekParam < T.weekStart(localDate()) ? `<a class="btn btn--ghost" href="#/progress/lifts?week=${T.addDays(weekParam, 7)}${pick ? `&lift=${pick}` : ''}">${esc(t('progress.sets.next'))}</a>` : '<span></span>'}
      </div>
      ${chartFigure({ ...tableLabels(),
        svg: barChart({ title: t('progress.sets.title'), desc: t('progress.sets.desc', { lo, hi }),
          bars: groups.map(g => ({ label: name(g), value: logged[g], target: planned[g], pattern: logged[g] < planned[g] })) }),
        legend: [{ label: t('progress.sets.reached'), solid: true }, { label: t('progress.sets.below'), hatch: true }, { label: t('progress.sets.planned'), target: true }],
        table: { head: [t('progress.col.group'), t('progress.col.logged'), t('progress.col.planned')], rows: groups.map(g => [name(g), n1(logged[g]), n1(planned[g])]) } })}
      <p class="small muted">${esc(t('progress.sets.note', { lo, hi }))}</p>`;
  });
}

// ---------- Log ----------

const MEAL_STATUS = ['followed', 'partly', 'not'];

function log(body, ctx, d) {
  const s = getState(), today = localDate();
  const workoutLabel = w => `${formatDate(w.date)} · ${w.templateId ? t(`plan.sessions.${w.templateId}.name`) : t('progress.log.manual')} · ${t('progress.log.sets', { n: (w.exercises || []).reduce((a, x) => a + (x.sets?.length || 0), 0) })}${w.volumeKg ? ` · ${formatNumber(w.volumeKg)} kg` : ''}`;
  const todayMeal = s.meals.find(m => m.date === today);
  const recentMeals = [...s.meals].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);
  body.innerHTML = `
    <section class="stack">
      <div class="row row--between"><h2>${esc(t('progress.log.workouts'))}</h2>
        <a class="btn btn--primary" href="#/progress/workout/new">${icon('plus')}${esc(t('progress.log.addWorkout'))}</a></div>
      ${s.workouts.length ? recordList(s.workouts, workoutLabel, 'workouts', 100) : `<p class="muted">${esc(t('progress.log.noWorkouts'))}</p>`}
    </section>
    <section class="card stack">
      <h2>${esc(t('progress.meals.title'))}</h2>
      <fieldset class="segmented"><legend>${esc(t('progress.meals.question', { date: formatDate(today) }))}</legend>
        ${MEAL_STATUS.map(v => `<label><input type="radio" name="meal-today" value="${v}" ${todayMeal?.status === v ? 'checked' : ''}>${esc(t('progress.meals.' + v))}</label>`).join('')}
      </fieldset>
      ${recentMeals.length ? `<ul class="stack-sm" role="list">${recentMeals.map(m => `<li class="alt-row"><span>${esc(formatDate(m.date))} · ${esc(t('progress.meals.' + m.status))}</span>
        <button class="btn btn--ghost" data-delete="meals:${m.id}" aria-label="${esc(t('progress.delete'))}: ${esc(formatDate(m.date))}">${icon('trash')}${esc(t('progress.delete'))}</button></li>`).join('')}</ul>` : ''}
      ${recentMeals.length ? `<p class="small muted">${esc(t('progress.meals.adherence', { n: recentMeals.filter(m => m.status === 'followed').length, total: recentMeals.length }))}</p>` : ''}
    </section>
    <section class="card stack">
      <h2>${esc(t('progress.notes.title'))}</h2>
      <form class="stack-sm" data-note-form>
        <input type="hidden" name="id">
        <div class="field"><label for="nf-date">${esc(t('progress.col.date'))}</label><input id="nf-date" name="date" type="date" required max="${today}" value="${today}"></div>
        <div class="field"><label for="nf-text">${esc(t('progress.notes.label'))}</label><textarea id="nf-text" name="text" rows="3" required maxlength="1000"></textarea></div>
        <div class="row"><button class="btn btn--primary" type="submit">${esc(t('common.save'))}</button><button class="btn btn--ghost" type="reset">${esc(t('common.cancel'))}</button></div>
      </form>
      ${recordList(s.notes, n => `${formatDate(n.date)} · ${n.text}`, 'notes')}
    </section>`;
  body.querySelectorAll('input[name="meal-today"]').forEach(r => r.addEventListener('change', () => {
    update(st => {
      const rec = st.meals.find(m => m.date === today);
      if (rec) Object.assign(rec, { status: r.value, updatedAt: Date.now() });
      else st.meals.push({ id: uuid(), updatedAt: Date.now(), date: today, status: r.value });
    });
    toast(t('progress.saved'));
    ctx.rerender();
  }));
  const noteForm = body.querySelector('[data-note-form]');
  noteForm.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget, text = f.text.value.trim();
    if (!text) return;
    update(st => {
      const rec = st.notes.find(n => n.id === f.id.value);
      if (rec) Object.assign(rec, { date: f.date.value, text, updatedAt: Date.now() });
      else st.notes.push({ id: uuid(), updatedAt: Date.now(), date: f.date.value, text });
    });
    toast(t('progress.saved'));
    ctx.rerender();
  });
  bindRecordList(body, ctx, { notes: r => { noteForm.id.value = r.id; noteForm.date.value = r.date; noteForm.text.value = r.text; noteForm.text.focus(); } });
}

// ---------- Workout editor (manual entry and edits) ----------

function editor(root, ctx, d, id) {
  const s = getState();
  const existing = id && id !== 'new' ? s.workouts.find(w => w.id === id) : null;
  if (id !== 'new' && !existing) { location.replace('#/progress/log'); return; }
  const model = existing
    ? { date: existing.date, durationMin: Math.round((existing.durationSec || 0) / 60), note: existing.note || '',
      exercises: existing.exercises.filter(x => x.sets?.length).map(x => ({ exerciseId: x.exerciseId, sets: x.sets.map(st => ({ reps: st.reps, kg: st.kg ?? '', rir: st.rir ?? '' })) })) }
    : { date: localDate(), durationMin: 60, note: '', exercises: [{ exerciseId: '', sets: [{ reps: '', kg: '', rir: '' }] }] };
  const options = [...d.exercises].sort((a, b) => tx(a.name).localeCompare(tx(b.name)));

  const paint = () => {
    root.innerHTML = `
      <header class="brand page-head"><div class="stack">
        <span class="eyebrow eyebrow--rule">${esc(t('progress.eyebrow'))}</span>
        <h1 class="display-48">${esc(t(existing ? 'progress.edit.titleEdit' : 'progress.edit.titleNew'))} <span class="key">${esc(t('progress.edit.key'))}</span></h1>
      </div></header>
      <form class="page stack-lg" data-editor novalidate>
        <div class="row">
          <div class="field"><label for="ed-date">${esc(t('progress.col.date'))}</label><input id="ed-date" name="date" type="date" required max="${localDate()}" value="${model.date}"></div>
          <div class="field"><label for="ed-dur">${esc(t('progress.edit.duration'))}</label><div class="input-wrap"><input id="ed-dur" name="durationMin" type="number" inputmode="numeric" min="0" max="300" value="${model.durationMin}"><span class="suffix">${esc(t('common.min'))}</span></div></div>
        </div>
        ${model.exercises.map((x, i) => `<fieldset class="card stack" data-ex="${i}"><legend class="visually-hidden">${esc(t('progress.edit.exercise', { n: i + 1 }))}</legend>
          <div class="field"><label for="ed-ex-${i}">${esc(t('progress.edit.exercise', { n: i + 1 }))}</label>
            <select id="ed-ex-${i}" data-field="exerciseId"><option value="">${esc(t('progress.edit.choose'))}</option>
            ${options.map(e => `<option value="${e.id}" ${e.id === x.exerciseId ? 'selected' : ''}>${esc(tx(e.name))}</option>`).join('')}</select></div>
          ${x.sets.map((st, j) => `<div class="row" data-set="${j}">
            <span class="eyebrow">${esc(t('session.setN', { n: j + 1 }))}</span>
            <div class="field"><label for="ed-r-${i}-${j}">${esc(t('progress.edit.reps'))}</label><input id="ed-r-${i}-${j}" data-field="reps" type="number" inputmode="numeric" min="0" max="200" value="${st.reps}"></div>
            <div class="field"><label for="ed-k-${i}-${j}">${esc(t('progress.edit.kg'))}</label><div class="input-wrap"><input id="ed-k-${i}-${j}" data-field="kg" type="number" inputmode="decimal" min="0" max="500" step="0.5" value="${st.kg}"><span class="suffix">kg</span></div></div>
            <div class="field"><label for="ed-i-${i}-${j}">RIR</label><input id="ed-i-${i}-${j}" data-field="rir" type="number" inputmode="numeric" min="0" max="10" value="${st.rir}"></div>
            <button class="btn btn--ghost" type="button" data-remove-set="${i}:${j}" aria-label="${esc(t('progress.edit.removeSet', { n: j + 1 }))}">${icon('minus')}</button>
          </div>`).join('')}
          <div class="row"><button class="btn btn--secondary" type="button" data-add-set="${i}">${icon('plus')}${esc(t('progress.edit.addSet'))}</button>
            <button class="btn btn--ghost" type="button" data-remove-ex="${i}">${icon('trash')}${esc(t('progress.edit.removeExercise'))}</button></div>
        </fieldset>`).join('')}
        <button class="btn btn--secondary" type="button" data-add-ex>${icon('plus')}${esc(t('progress.edit.addExercise'))}</button>
        <div class="field"><label for="ed-note">${esc(t('progress.notes.label'))} <span class="muted">(${esc(t('common.optional'))})</span></label><textarea id="ed-note" name="note" rows="2" maxlength="1000">${esc(model.note)}</textarea></div>
        <p class="error-msg" data-error hidden role="alert"></p>
        <div class="row">
          <button class="btn btn--primary" type="submit">${esc(t('common.save'))}</button>
          <a class="btn btn--ghost" href="#/progress/log">${esc(t('common.cancel'))}</a>
          ${existing ? `<button class="btn btn--danger" type="button" data-delete-workout>${icon('trash')}${esc(t('progress.delete'))}</button>` : ''}
        </div>
      </form>`;
    bind();
  };
  // Inputs write straight into the model, so re-painting after add/remove keeps typed values.
  const bind = () => {
    const form = root.querySelector('[data-editor]');
    form.addEventListener('input', e => {
      const el = e.target;
      if (el.name === 'date') model.date = el.value;
      else if (el.name === 'durationMin') model.durationMin = Number(el.value) || 0;
      else if (el.name === 'note') model.note = el.value;
      const ex = el.closest('[data-ex]'), set = el.closest('[data-set]');
      if (!ex || !el.dataset.field) return;
      const x = model.exercises[ex.dataset.ex];
      if (set) x.sets[set.dataset.set][el.dataset.field] = el.value; else x[el.dataset.field] = el.value;
    });
    form.addEventListener('change', e => { if (e.target.dataset.field === 'exerciseId') model.exercises[e.target.closest('[data-ex]').dataset.ex].exerciseId = e.target.value; });
    form.addEventListener('click', async e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.addSet != null) { const x = model.exercises[b.dataset.addSet]; const last = x.sets.at(-1) || {}; x.sets.push({ reps: last.reps ?? '', kg: last.kg ?? '', rir: '' }); paint(); }
      else if (b.dataset.removeSet) { const [i, j] = b.dataset.removeSet.split(':').map(Number); model.exercises[i].sets.splice(j, 1); if (!model.exercises[i].sets.length) model.exercises[i].sets.push({ reps: '', kg: '', rir: '' }); paint(); }
      else if (b.dataset.removeEx != null) { model.exercises.splice(Number(b.dataset.removeEx), 1); if (!model.exercises.length) model.exercises.push({ exerciseId: '', sets: [{ reps: '', kg: '', rir: '' }] }); paint(); }
      else if (b.hasAttribute('data-add-ex')) { model.exercises.push({ exerciseId: '', sets: [{ reps: '', kg: '', rir: '' }] }); paint(); root.querySelector(`#ed-ex-${model.exercises.length - 1}`)?.focus(); }
      else if (b.hasAttribute('data-delete-workout')) {
        const ok = await confirmDialog({ title: t('progress.deleteTitle'), body: `<p>${esc(t('progress.deleteBody'))}</p>`, confirm: t('progress.delete'), cancel: t('common.cancel'), danger: true, closeLabel: t('common.close') });
        if (!ok) return;
        update(st => { st.workouts = st.workouts.filter(w => w.id !== existing.id); });
        toast(t('progress.deleted'));
        location.hash = '#/progress/log';
      }
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const err = form.querySelector('[data-error]');
      const rec = T.manualWorkout({ id: existing?.id || uuid(), date: model.date, durationMin: model.durationMin, exercises: model.exercises, note: model.note });
      if (!model.date || model.date > localDate()) { err.hidden = false; err.textContent = t('progress.edit.errDate'); return; }
      if (!rec.exercises.length) { err.hidden = false; err.textContent = t('progress.edit.errEmpty'); return; }
      update(st => {
        const i = st.workouts.findIndex(w => w.id === rec.id);
        if (i < 0) { st.workouts.push(rec); return; }
        // Editing a session record keeps its session fields (template, start time, targets).
        const old = st.workouts[i];
        if (old.manual) { st.workouts[i] = rec; return; }
        const targets = Object.fromEntries((old.exercises || []).map(x => [x.exerciseId, x]));
        const exercises = rec.exercises.map(x => ({ ...x, slotId: targets[x.exerciseId]?.slotId ?? null, target: targets[x.exerciseId]?.target ?? null, swappedFrom: targets[x.exerciseId]?.swappedFrom ?? null }));
        st.workouts[i] = { ...old, date: rec.date, durationSec: rec.durationSec, note: rec.note, exercises, ...T.volume(exercises), updatedAt: rec.updatedAt };
      });
      toast(t('progress.saved'));
      location.hash = '#/progress/log';
    });
  };
  paint();
}
