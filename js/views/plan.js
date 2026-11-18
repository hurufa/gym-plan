// views/plan.js
// Plan page. Routes: #/plan (week: notices, split choice, calendar, steps, session cards),
// #/plan/coverage (body map + weekly sets per group vs the goal range), #/plan/why (plain-language
// reasons). ?open=<templateId> opens one session card. Data comes from plans.js / planner.js.

import { getState, update, parseLocalDate } from '../state.js';
import { t, tx, formatDate, formatNumber } from '../i18n.js';
import { esc, icon, openSheet, toast } from '../ui.js';
import { ensurePlan, regenerate, setSwap, swapOptions, deloadOffer, activeDeload, startDeload, endDeload, sessionsForWeek } from '../plans.js';
import { SLOTS, GOALS, exerciseGroups, groupMaps, TIMING } from '../planner.js';
import { bodyMap, groupStates } from '../bodymap.js';
import { e1rmHistory } from '../tracker.js';

const fmtRest = ([lo, hi]) => (hi <= 90 ? t('plan.restSec', { lo, hi }) : t('plan.restMin', { lo: formatNumber(lo / 60), hi: formatNumber(hi / 60) }));
const groupName = (enums, g) => tx(enums.groups.find(x => x.id === g).name);
const fmtSets = n => formatNumber(n, { maximumFractionDigits: 1 });

// The session's "what it builds" line. If the main lift fell back to another pattern (a filter
// removed the usual one), describe the session from the muscles it actually trains.
export function sessionBuilds(ses, data) {
  const main = ses.exercises[0];
  if (!main.fallback) return t(`plan.sessions.${ses.templateId}.builds`);
  const groups = ses.groups.map(g => groupName(data.enums, g).toLocaleLowerCase()).join(', ');
  return t('plan.buildsFallback.' + main.fallback, { main: tx(data.exById[main.exerciseId].name), groups });
}

export function render(root, ctx) {
  root.innerHTML = `<div class="page"><p class="muted">…</p></div>`;
  ensurePlan().then(r => { if (r) draw(root, ctx, r.plan, r.data); });
}

function draw(root, ctx, plan, data) {
  const s = getState();
  const p = s.profile;
  const tab = ['coverage', 'why'].includes(ctx.params[0]) ? ctx.params[0] : 'week';
  const splitName = t('plan.splits.' + plan.splitId);
  const words = splitName.split(' ');
  const tabs = [['week', '#/plan'], ['coverage', '#/plan/coverage'], ['why', '#/plan/why']];
  root.innerHTML = `
    <header class="brand page-head"><div class="stack">
      <span class="eyebrow eyebrow--rule">${esc(t('plan.eyebrow'))}</span>
      <h1 class="display-48">${esc(words.slice(0, -1).join(' '))} <span class="key">${esc(words.at(-1))}</span></h1>
      <p>${esc(t('plan.meta', { days: p.days, min: p.sessionLength, goal: t(`options.goal.${p.goal}.label`) }))}</p>
    </div></header>
    <nav class="tabs" aria-label="${esc(t('plan.tabsLabel'))}"><ul role="list">${tabs.map(([k, href]) =>
      `<li><a href="${href}" ${k === tab ? 'aria-current="page"' : ''}>${esc(t('plan.tabs.' + k))}</a></li>`).join('')}</ul></nav>
    <div class="page stack-lg" data-body></div>`;
  const body = root.querySelector('[data-body]');
  if (tab === 'week') week(body, ctx, plan, data);
  else if (tab === 'coverage') coverage(body, plan, data);
  else why(body, plan, data);
}

// ---------- Week ----------

function week(body, ctx, plan, data) {
  const s = getState();
  const p = s.profile;
  const { enums, exById } = data;
  const notices = [];
  const deload = activeDeload(s);
  if (deload) {
    const end = parseLocalDate(deload.startDate); end.setDate(end.getDate() + 6);
    notices.push(`<div class="notice">${icon('info')}<div class="stack-sm"><p>${esc(t('plan.deload.active', { date: formatDate(end) }))}</p>
      <button class="btn btn--secondary" data-end-deload>${esc(t('plan.deload.end'))}</button></div></div>`);
  } else {
    const offer = deloadOffer(s, e1rmHistory(s.workouts, exById));
    if (offer) notices.push(`<div class="notice">${icon('info')}<div class="stack-sm"><strong>${esc(t('plan.deload.offerTitle'))}</strong>
      <p>${esc(offer.reason === 'e1rm-drop' ? t('plan.deload.offerDrop', { name: tx(exById[offer.exerciseId].name) }) : t('plan.deload.offerEight'))}</p>
      <button class="btn btn--primary" data-start-deload>${esc(t('plan.deload.start'))}</button></div></div>`);
  }
  if (plan.notes.includes('beginner-high-days')) notices.push(`<div class="notice notice--warning">${icon('warning')}<div class="stack-sm">
    <strong>${esc(t('plan.warn.beginnerTitle', { days: p.days }))}</strong><p>${esc(t('plan.warn.beginnerBody'))}</p>
    <button class="btn btn--secondary" data-four-days>${esc(t('plan.warn.switch4'))}</button></div></div>`);
  for (const [code, key] of [['bodyweight-strength', 'bwStrength'], ['ppl-once-weekly', 'pplOnce'], ['rir-beginner', 'rirBeginner'], ['swap-dropped', 'swapDropped']]) {
    if (plan.notes.includes(code)) notices.push(`<div class="notice">${icon('info')}<div>${esc(t('plan.warn.' + key))}</div></div>`);
  }

  const order = plan.sessions.map((ses, i) => ({ ses, i, day: plan.schedule[i] })).sort((a, b) => a.day - b.day);
  const byDay = d => order.filter(o => o.day === d);
  const cardioByDay = d => plan.cardio.filter(c => c.weekday === d);
  const calendar = [0, 1, 2, 3, 4, 5, 6].map(d => {
    const items = byDay(d).map(o => `<a href="#/plan?open=${o.ses.key}" class="cal-session">${esc(t(`plan.sessions.${o.ses.templateId}.name`))}</a>`);
    for (const c of cardioByDay(d)) items.push(`<span class="cal-cardio">${esc(t('plan.week.cardio', { name: tx(exById[c.exerciseId].name), lo: c.minutes[0], hi: c.minutes[1] }))}${c.afterLifting ? ' · ' + esc(t('plan.week.after')) : ''}${c.optional ? ' · ' + esc(t('plan.week.optional')) : ''}</span>`);
    return `<li class="cal-day ${byDay(d).length ? 'cal-day--train' : ''}"><span class="eyebrow">${esc(t('plan.weekdays.' + d))}</span>
      ${items.length ? items.join('') : `<span class="muted small">${esc(t('plan.week.rest'))}</span>`}</li>`;
  }).join('');

  const steps = plan.steps ? `<p class="small">${esc(plan.steps.target != null
    ? t('plan.week.steps', { n: formatNumber(plan.steps.target), base: formatNumber(plan.steps.base) }) : t('plan.week.stepsUnknown'))}</p>` : '';

  const splitChoice = plan.splitOptions.length > 1 ? `<div class="field"><span class="label" id="split-l">${esc(t('plan.splitChoice.label'))}</span>
    <fieldset class="segmented" aria-labelledby="split-l"><legend>${esc(t('plan.splitChoice.label'))}</legend>${plan.splitOptions.map(id =>
      `<label><input type="radio" name="split" value="${id}" ${id === plan.splitId ? 'checked' : ''}>${esc(t('plan.splitChoice.' + (id.startsWith('ppl') ? 'ppl' : 'fb')))}</label>`).join('')}</fieldset></div>` : '';

  const sessions = sessionsForWeek(plan, s);
  body.innerHTML = `
    ${notices.length ? `<div class="stack-sm">${notices.join('')}</div>` : ''}
    ${splitChoice}
    <section class="stack">
      <div class="row" style="justify-content:space-between"><h2>${esc(t('plan.tabs.week'))}</h2>
        <button class="btn btn--secondary" data-edit-days>${esc(t('plan.week.editDays'))}</button></div>
      <ol role="list" class="calendar">${calendar}</ol>
      ${steps}
    </section>
    <section class="stack">${order.map(o => sessionCard(sessions[o.i], o, plan, data, ctx.query.open === o.ses.key)).join('')}</section>`;

  body.querySelector('[data-start-deload]')?.addEventListener('click', () => { startDeload(); ctx.rerender(); });
  body.querySelector('[data-end-deload]')?.addEventListener('click', () => { endDeload(); ctx.rerender(); });
  body.querySelector('[data-four-days]')?.addEventListener('click', () => {
    update(st => { st.profile.days = 4; st.profile.updatedAt = Date.now(); st.profileChanged = { fields: ['days'], at: Date.now() }; });
    ctx.rerender();
  });
  body.querySelectorAll('input[name="split"]').forEach(r => r.addEventListener('change', () => { regenerate(data, { split: r.value }); ctx.rerender(); }));
  body.querySelector('[data-edit-days]').addEventListener('click', () => editDays(plan, data, ctx));
  body.querySelectorAll('[data-swap]').forEach(b => b.addEventListener('click', () => swapSheet(b.dataset, plan, data, ctx)));
  if (ctx.query.open) body.querySelector(`#s-${CSS.escape(ctx.query.open)}`)?.scrollIntoView({ block: 'start' });
}

function routine(ids, data) {
  const byId = Object.fromEntries((data.warmups || []).map(w => [w.id, w]));
  return `<ul role="list" class="stack-sm">${ids.map(id => byId[id]).filter(Boolean).map(w =>
    `<li><strong>${esc(tx(w.name))}</strong> · ${esc(tx(w.dose))}<br><span class="muted small">${esc(tx(w.how))}</span></li>`).join('')}</ul>`;
}

function sessionCard(ses, o, plan, data, open) {
  const { enums, exById } = data;
  const p = getState().profile;
  const name = t(`plan.sessions.${ses.templateId}.name`);
  const states = groupStates(enums, Object.fromEntries(ses.groups.map(g => [g, 'primary'])));
  const live = ses.exercises.filter(e => e.exerciseId && e.sets > 0);
  const empty = ses.exercises.filter(e => !e.exerciseId);
  const dropped = ses.exercises.filter(e => e.exerciseId && !e.sets);
  const droppedBy = why => dropped.filter(e => e.dropped === why).map(e => tx(exById[e.exerciseId].name));
  const areas = (p.injuries || []).map(i => t('options.injury.' + i).toLocaleLowerCase()).join(', ');
  const exRow = e => {
    const ex = exById[e.exerciseId];
    const reps = e.unit === 'seconds' ? t('plan.setsSecs', { sets: e.sets, lo: e.reps[0], hi: e.reps[1] }) : t('plan.setsReps', { sets: e.sets, lo: e.reps[0], hi: e.reps[1] });
    return `<li class="ex-row">
      <div class="ex-head"><a href="#/exercise/${ex.id}" class="ex-name">${esc(tx(ex.name))}</a>
        ${e.role === 'main' ? `<span class="badge badge--neutral">${esc(t('plan.mainLift'))}</span>` : ''}
        ${e.swapped ? `<span class="badge badge--neutral">${esc(t('plan.swapped'))}</span>` : ''}</div>
      <p class="num">${esc(reps)} · ${esc(t('plan.rir', { lo: e.rir[0], hi: e.rir[1] }))} · ${esc(t('plan.rest', { rest: fmtRest(e.restSec) }))}</p>
      ${e.rampUps.length ? `<p class="small muted">${esc(t('plan.rampUps', { list: e.rampUps.map(r => t('plan.rampItem', r)).join(', ') }))}</p>` : ''}
      <button class="btn btn--ghost" data-swap data-template="${ses.templateId}" data-slot="${e.slotId}">${esc(t('plan.swap'))}</button></li>`;
  };
  return `<details class="card session" id="s-${ses.key}" ${open ? 'open' : ''}>
    <summary><span class="eyebrow">${esc(t('plan.weekdaysLong.' + o.day))} · ${esc(t('plan.sessionN', { n: o.i + 1 }))}</span>
      <span class="session-title">${esc(name)}</span>
      <span class="muted small">${esc(t('plan.duration', { min: ses.durationMin }))} · ${esc(ses.groups.map(g => groupName(enums, g)).join(', '))}</span></summary>
    <div class="stack session-body">
      <section class="stack-sm"><h3>${esc(t('plan.todayBuilds'))}</h3>
        <p>${esc(sessionBuilds(ses, data))}</p>
        ${bodyMap({ enums, states, size: 'small', label: `${t('plan.todayBuilds')}: ${ses.groups.map(g => groupName(enums, g)).join(', ')}`, captions: captions() })}
        <a class="btn btn--ghost" href="#/learn/growth-mechanism">${icon('book')}${esc(t('learn.growthLink'))}</a>
      </section>
      <section class="stack-sm"><h3>${esc(t('plan.warmup'))}</h3>${routine(ses.warmup, data)}</section>
      <section class="stack-sm"><h3>${esc(t('plan.exercises'))}</h3>
        <ol role="list" class="stack">${live.map(exRow).join('')}</ol>
        ${live.some(e => e.rampUps.length) ? `<p class="small muted">${esc(t('plan.rampNote'))}</p>` : ''}
        ${empty.map(e => `<div class="notice notice--warning">${icon('warning')}<div>${esc(t('plan.empty.' + e.empty, { slot: t('plan.slots.' + e.slotId), areas }))}</div></div>`).join('')}
        ${droppedBy('time').length ? `<p class="small muted">${esc(t('plan.dropped.time', { min: p.sessionLength, list: droppedBy('time').join(', ') }))}</p>` : ''}
        ${droppedBy('volume').length ? `<p class="small muted">${esc(t('plan.dropped.volume', { list: droppedBy('volume').join(', ') }))}</p>` : ''}
      </section>
      <section class="stack-sm"><h3>${esc(t('plan.cooldown'))}</h3>${routine(ses.cooldown, data)}</section>
    </div></details>`;
}

async function swapSheet({ template, slot }, plan, data, ctx) {
  const p = getState().profile;
  const ses = plan.sessions.find(x => x.templateId === template);
  const entry = ses.exercises.find(e => e.slotId === slot);
  const ids = swapOptions(data, ses, entry, p, SLOTS);
  const isSwapped = getState().swaps.some(sw => sw.templateId === template && sw.slotId === slot);
  const actions = [{ label: t('common.cancel'), value: '', variant: 'ghost' }];
  if (isSwapped) actions.push({ label: t('plan.swapReset'), value: '__reset', variant: 'secondary' });
  const list = ids.length
    ? `<div class="options options--list" role="list">${ids.map(id => `<button class="btn btn--secondary btn--block" data-pick="${id}">${esc(tx(data.exById[id].name))}</button>`).join('')}</div>`
    : `<p>${esc(t('plan.swapNone'))}</p>`;
  const bodyEl = document.createElement('div');
  bodyEl.className = 'stack';
  bodyEl.innerHTML = `<p class="muted">${esc(t('plan.swapIntro'))}</p>${list}`;
  // Picking an option closes the sheet with that id as its value.
  bodyEl.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const dlg = bodyEl.closest('dialog');
    dlg.returnValue = b.dataset.pick;
    dlg.close();
  });
  const choice = await openSheet({ title: t('plan.swapTitle', { name: tx(data.exById[entry.exerciseId].name) }), body: bodyEl, actions, closeLabel: t('common.close') });
  if (!choice) return;
  setSwap(data, template, slot, choice === '__reset' ? null : choice);
  toast(t('plan.swapDone'));
  location.hash = `#/plan?open=${template}`;
  ctx.rerender();
}

async function editDays(plan, data, ctx) {
  const bodyEl = document.createElement('div');
  bodyEl.className = 'stack';
  bodyEl.innerHTML = `<p class="muted">${esc(t('plan.week.editIntro'))}</p>` + plan.sessions.map((ses, i) => {
    const name = t(`plan.sessions.${ses.templateId}.name`);
    return `<div class="field"><label for="day-${i}">${esc(t('plan.week.dayFor', { name }))}</label>
      <div class="input-wrap"><select id="day-${i}" data-i="${i}">${[0, 1, 2, 3, 4, 5, 6].map(d =>
        `<option value="${d}" ${plan.schedule[i] === d ? 'selected' : ''}>${esc(t('plan.weekdaysLong.' + d))}</option>`).join('')}</select></div></div>`;
  }).join('') + `<p class="error-msg" role="alert" hidden>${icon('error')} ${esc(t('plan.week.clash'))}</p>`;
  const v = await openSheet({ title: t('plan.week.editTitle'), body: bodyEl, closeLabel: t('common.close'),
    actions: [{ label: t('common.cancel'), value: '', variant: 'ghost' }, { label: t('common.save'), value: 'save', variant: 'primary' }] });
  if (v !== 'save') return;
  const schedule = [...bodyEl.querySelectorAll('select')].map(sel => Number(sel.value));
  if (new Set(schedule).size !== schedule.length) { toast(t('plan.week.clash')); return; }
  regenerate(data, { schedule });
  toast(t('plan.week.saved'));
  ctx.rerender();
}

// ---------- Coverage ----------

// Group state against the goal range; `under` carries the reason the planner found.
export function coverageStates(plan) {
  const [lo, hi] = plan.range;
  return Object.fromEntries(Object.entries(plan.weekly).map(([g, n]) => {
    if (n > hi) return [g, 'over'];
    if (n >= lo) return [g, 'in'];
    const u = plan.under.find(x => x.group === g);
    return [g, { equipment: 'underEquipment', time: 'underTime', options: 'underOptions' }[u?.reason] || 'under'];
  }));
}

function coverage(body, plan, data) {
  const { enums, exById } = data;
  const { groupOf } = groupMaps(enums);
  const [lo, hi] = plan.range;
  const states = coverageStates(plan);
  const mapStates = Object.fromEntries(Object.entries(states).map(([g, st]) => [g, st.startsWith('under') ? 'under' : st]));
  // Which exercises feed which group (summed over the week).
  const feeds = {};
  for (const ses of plan.sessions) for (const e of ses.exercises) {
    if (!e.exerciseId || !e.sets) continue;
    const { primary, secondary } = exerciseGroups(exById[e.exerciseId], groupOf);
    for (const [set, helper] of [[primary, false], [secondary, true]]) for (const g of set) {
      feeds[g] ??= {};
      const k = e.exerciseId + (helper ? ':h' : '');
      feeds[g][k] = (feeds[g][k] || 0) + e.sets;
    }
  }
  const rows = enums.groups.map(g => {
    const list = Object.entries(feeds[g.id] || {}).map(([k, n]) => {
      const [id, h] = k.split(':');
      return `${esc(tx(exById[id].name))} × ${n}${h ? ` (${esc(t('plan.coverage.helper'))})` : ''}`;
    });
    const st = states[g.id];
    return `<tr><th scope="row">${esc(tx(g.name))}</th><td class="num">${fmtSets(plan.weekly[g.id])}</td>
      <td>${st.startsWith('under') ? icon('warning') + ' ' : ''}${esc(t('plan.coverage.states.' + st))}</td>
      <td class="small">${list.length ? list.join('<br>') : esc(t('plan.coverage.none'))}</td></tr>`;
  }).join('');
  body.innerHTML = `
    <section class="stack">
      <p>${esc(t('plan.coverage.intro', { lo, hi }))}</p>
      ${bodyMap({ enums, states: groupStates(enums, mapStates), label: t('plan.coverage.mapLabel'), captions: captions() })}
      <p class="small muted">${esc(t('plan.coverage.legend'))}</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">${esc(t('plan.coverage.colGroup'))}</th><th scope="col" class="num">${esc(t('plan.coverage.colSets'))}</th>
        <th scope="col">${esc(t('plan.coverage.colState'))}</th><th scope="col">${esc(t('plan.coverage.colFrom'))}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </section>`;
}

// ---------- Why this plan ----------

function why(body, plan, data) {
  const s = getState();
  const p = s.profile;
  const { enums } = data;
  const [lo, hi] = plan.range;
  const goalReps = [GOALS[p.goal].main, GOALS[p.goal].acc];
  const target = plan.target[enums.groups[0].id];
  const rir = p.experience === 'beginner' ? [2, 3] : [1, 3];
  const underTime = plan.under.filter(u => u.reason === 'time');
  const underEq = plan.under.filter(u => u.reason === 'equipment');
  const underOpt = plan.under.filter(u => u.reason === 'options');
  const names = list => list.map(u => `${groupName(enums, u.group)} (${fmtSets(u.sets)})`).join(', ');
  let closes = '';
  if (underTime.length) {
    const day = underTime.every(u => u.closesWithDay), min = underTime.every(u => u.closesWithMinutes);
    closes = t('plan.why.' + (day && min ? 'closesBoth' : day ? 'closesDay' : min ? 'closesMinutes' : 'closesNeither'));
  }
  const para = (head, ...texts) => `<section class="stack-sm"><h2 class="display-32">${esc(t('plan.why.' + head))}</h2>${texts.filter(Boolean).map(x => `<p>${esc(x)}</p>`).join('')}</section>`;
  body.innerHTML = [
    para('splitHead', t('plan.why.split.' + plan.splitId)),
    para('repsHead',
      t('plan.why.reps', { mlo: goalReps[0][0], mhi: goalReps[0][1], alo: goalReps[1][0], ahi: goalReps[1][1], goalWhy: t('plan.why.goal.' + p.goal) }),
      p.goal === 'get-stronger' && p.experience === 'beginner' ? t('plan.why.beginnerStrength') : '',
      p.equipment !== 'full-gym' ? t('plan.why.bodyweightReps') : '',
      t('plan.why.rir', { lo: rir[0], hi: rir[1] })),
    para('volumeHead',
      t('plan.why.volume', { target, lo, hi, levelWhy: t('plan.why.level.' + p.experience) }),
      t('plan.why.floor'),
      underTime.length ? `${t('plan.why.underTime', { groups: names(underTime) })} ${closes}` : '',
      underOpt.length ? t('plan.why.underOptions', { groups: names(underOpt) }) : '',
      plan.under.length ? '' : t('plan.why.allInRange'),
      underEq.length ? t('plan.why.underEquipment', { groups: names(underEq) }) : ''),
    para('timeHead', t('plan.why.time', { min: p.sessionLength, wu: TIMING.warmupSec / 60, cd: TIMING.cooldownSec / 60 })),
    para('filtersHead', p.injuries?.length ? t('plan.why.injuries', { areas: p.injuries.map(i => t('options.injury.' + i).toLocaleLowerCase()).join(', ') }) : t('plan.why.noInjuries')),
    para('cardioHead', t('plan.why.cardio.' + p.goal)),
  ].join('');
}

const captions = () => [t('plan.front'), t('plan.back')];
