// views/session.js
// Workout session mode. #/session: start screen for the next session in the queue, or the active
// session (one exercise at a time: figure, target, ramp-up sets, working sets with reps, load and
// RIR, rest timer with sound/vibration, skip, swap for today, previous/next, end with save or
// discard). #/session/summary/<id>: duration, volume, PRs. Everything is saved after each change, so
// a reload resumes where you were; timers are computed from timestamps. A screen wake lock is held
// while the session is open (where supported). Logic lives in js/session.js.

import { getState, update } from '../state.js';
import { t, tx, formatNumber } from '../i18n.js';
import { esc, icon, openSheet, toast, ringMarkup, setRing } from '../ui.js';
import { mountFigure, checkPop } from '../animations.js';
import { ensurePlan, activeDeload, setSwap, swapOptions } from '../plans.js';
import { SLOTS } from '../planner.js';
import { usesLoad } from '../tracker.js';
import * as S from '../session.js';

const mmss = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const hms = sec => (sec >= 3600 ? `${Math.floor(sec / 3600)}:${mmss(sec % 3600).padStart(5, '0')}` : mmss(sec));
const fmtKg = kg => formatNumber(kg, { maximumFractionDigits: 1 });

// Short two-tone beep with the Web Audio API (no sound file needed).
let audio = null;
function beep() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach(at => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; g.gain.value = 0.15;
      o.connect(g); g.connect(audio.destination);
      o.start(audio.currentTime + at); o.stop(audio.currentTime + at + 0.15);
    });
  } catch { /* audio unavailable */ }
}

export function render(root, ctx) {
  if (ctx.params[0] === 'summary') return summary(root, ctx.params[1]);
  let cleanup = [];
  root.innerHTML = `<div class="page"><p class="muted">…</p></div>`;
  ensurePlan().then(r => {
    if (!r) { root.innerHTML = `<div class="page"><p>${esc(t('session.noPlan'))}</p></div>`; return; }
    const { data } = r;
    if (!getState().activeSession) start(root, data, () => active(root, data, cleanup, ctx));
    else active(root, data, cleanup, ctx);
  });
  return () => cleanup.forEach(f => f());
}

function start(root, data, go) {
  const s = getState();
  const plan = s.plan;
  const ses = plan.sessions[(s.queueIndex ?? 0) % plan.sessions.length];
  const deload = !!activeDeload(s);
  root.innerHTML = `
    <header class="brand page-head"><div class="stack">
      <span class="eyebrow eyebrow--rule">${esc(t('home.eyebrow'))}</span>
      <h1 class="display-48">${esc(t(`plan.sessions.${ses.templateId}.name`))}</h1>
      <p>${esc(t('plan.duration', { min: ses.durationMin }))}</p>
    </div></header>
    <div class="page stack">
      ${deload ? `<div class="notice">${icon('info')}<div>${esc(t('session.deload'))}</div></div>` : ''}
      <p>${esc(t('session.intro'))}</p>
      <button class="btn btn--primary btn--block" data-start>${esc(t('session.start'))}</button>
    </div>`;
  root.querySelector('[data-start]').addEventListener('click', () => {
    update(st => { st.activeSession = S.createSession(st, data, Date.now(), { deload }); });
    go();
  });
}

function active(root, data, cleanup, ctx) {
  const { exById } = data;
  const A = () => getState().activeSession;
  const mutate = fn => update(st => fn(st.activeSession, st));
  let figure = null, shownKey = null, wake = null;

  // Screen wake lock (re-requested when the page becomes visible again).
  const lock = async () => { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch { wake = null; } };
  const onVis = () => { if (document.visibilityState === 'visible') { lock(); tick(); } };
  document.addEventListener('visibilitychange', onVis);
  lock();
  const timer = setInterval(tick, 250);
  cleanup.push(() => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); wake?.release?.(); figure?.destroy(); });

  root.innerHTML = `
    <header class="page-head session-head"><div class="stack-sm">
      <span class="eyebrow" data-progress></span>
      <h1 class="display-32" data-title></h1>
      <div class="row" style="justify-content:space-between">
        <span><span class="eyebrow muted">${esc(t('session.elapsed'))}</span> <span class="big-num session-clock" data-elapsed>0:00</span></span>
        <button class="btn btn--secondary" data-end>${esc(t('session.end'))}</button>
      </div>
    </div></header>
    <div class="page stack session-page">
      <nav aria-label="${esc(t('plan.exercises'))}"><ul role="list" class="chip-group" data-items></ul></nav>
      <div data-body class="stack"></div>
    </div>
    <div class="rest-bar" data-rest hidden role="region" aria-label="${esc(t('session.rest'))}">
      <div class="rest-ring" data-ring>${ringMarkup('0:00')}</div>
      <div class="stack-sm"><span class="eyebrow">${esc(t('session.rest'))}</span><p class="small" data-rest-msg aria-live="polite"></p>
        <div class="row"><button class="btn btn--secondary" data-plus>${esc(t('session.plus30'))}</button><button class="btn btn--ghost" data-skiprest>${esc(t('session.skipRest'))}</button></div></div>
    </div>`;

  function tick() {
    const a = A();
    if (!a) return;
    const now = Date.now();
    root.querySelector('[data-elapsed]').textContent = hms(S.elapsedSec(a, now));
    const bar = root.querySelector('[data-rest]');
    if (!a.rest) { bar.hidden = true; return; }
    bar.hidden = false;
    const left = S.restRemaining(a, now);
    setRing(root.querySelector('[data-ring] .ring'), left / a.rest.total, mmss(left));
    root.querySelector('[data-rest-msg]').textContent = left ? '' : t('session.restOver');
    if (!left && !a.rest.alerted) {
      const set = getState().settings;
      if (set.sound) beep();
      if (set.vibration) navigator.vibrate?.([200, 100, 200]);
      mutate(x => { x.rest.alerted = true; });
    }
  }

  function draw() {
    const a = A();
    if (!a) return;
    const it = a.items[a.index];
    const ex = exById[it.exerciseId];
    const name = tx(ex.name);
    root.querySelector('[data-progress]').textContent = `${t(`plan.sessions.${a.templateId}.name`)} · ${t('session.exerciseOf', { n: a.index + 1, total: a.items.length })}`;
    root.querySelector('[data-title]').textContent = name;
    root.querySelector('[data-items]').innerHTML = a.items.map((x, i) => {
      const done = x.sets.filter(s => s.done).length;
      return `<li><button class="chip" data-goto="${i}" aria-pressed="${i === a.index}" ${i === a.index ? 'aria-current="step"' : ''}>${i + 1}. ${esc(tx(exById[x.exerciseId].name))} ${x.skipped ? `· ${esc(t('session.skipped'))}` : `· ${done}/${x.sets.length}`}</button></li>`;
    }).join('');

    const key = `${a.index}:${it.exerciseId}`;
    const body = root.querySelector('[data-body]');
    if (key !== shownKey) {
      figure?.destroy();
      shownKey = key;
      body.innerHTML = `
        <section class="card stack-sm"><div class="session-figure" data-figure></div>
          <p class="num" data-target></p><div data-advice></div></section>
        <section class="stack-sm" data-ramp></section>
        <section class="stack-sm"><h2 class="display-32">${esc(t('session.sets'))}</h2><ol role="list" class="stack-sm" data-sets></ol>
          <button class="btn btn--ghost" data-addset>${icon('plus')}${esc(t('session.addSet'))}</button></section>
        <div class="session-actions" data-actions></div>`;
      figure = mountFigure(body.querySelector('[data-figure]'), ex, { label: t('exercise.figureLabel', { name }), startLabel: t('exercise.start'), endLabel: t('exercise.end') });
    }
    const tg = it.target;
    const unit = tg.unit === 'seconds';
    body.querySelector('[data-target]').textContent = `${t('session.target')}: ${unit ? t('plan.setsSecs', { sets: tg.sets, lo: tg.reps[0], hi: tg.reps[1] }) : t('plan.setsReps', { sets: tg.sets, lo: tg.reps[0], hi: tg.reps[1] })} · ${t('plan.rir', { lo: tg.rir[0], hi: tg.rir[1] })} · ${t('plan.rest', { rest: mmss(S.restSeconds(tg)) })}`;

    // Advice: first time, progression, harder variation, swapped note.
    const sg = it.suggestion;
    const adv = [];
    if (it.swappedFrom) adv.push(`<p class="small muted">${esc(t('session.swappedFrom', { name: tx(exById[it.swappedFrom].name) }))}</p>`);
    if (sg.firstTime) adv.push(`<div class="notice">${icon('info')}<div>${esc(t(usesLoad(ex) ? 'session.firstTime' : 'session.firstTimeBw'))}</div></div>`);
    else if (sg.action === 'increase-load') adv.push(`<p class="small">${esc(t('session.increase', { kg: fmtKg(it.sets[0].kg || 0) }))}</p>`);
    else if (sg.action === 'extend-range') adv.push(`<p class="small">${esc(t('session.extend', { hi: tg.reps[1] }))}</p>`);
    else if (sg.action === 'add-reps') adv.push(`<p class="small">${esc(t('session.addReps'))}</p>`);
    else if (sg.action === 'slow-eccentric') adv.push(`<p class="small">${esc(t('session.slow'))}</p>`);
    else if (sg.action === 'harder' && sg.harder) adv.push(`<div class="notice">${icon('trophy')}<div class="stack-sm"><p>${esc(t('session.harder', { name: tx(exById[sg.harder].name) }))}</p>
      <button class="btn btn--secondary" data-harder="${sg.harder}">${esc(t('session.useHarder', { name: tx(exById[sg.harder].name) }))}</button></div></div>`);
    if (a.deload) adv.push(`<p class="small muted">${esc(t('session.deload'))}</p>`);
    body.querySelector('[data-advice]').innerHTML = adv.join('');

    // Ramp-up sets
    const work = it.sets.find(s => s.kg)?.kg;
    body.querySelector('[data-ramp]').innerHTML = it.ramp.length ? `<h2 class="display-32">${esc(t('session.rampTitle'))}</h2>
      <p class="small muted">${esc(t('session.rampNote'))}</p>
      <ul role="list" class="stack-sm">${it.ramp.map((r, k) => `<li><label class="check"><input type="checkbox" data-ramp="${k}" ${r.done ? 'checked' : ''}><span>${esc(work
        ? t('session.rampKg', { reps: r.reps, kg: fmtKg(Math.round((work * r.pct) / 100 / 2.5) * 2.5), pct: r.pct })
        : t('session.rampItem', { reps: r.reps, pct: r.pct }))}</span></label></li>`).join('')}</ul>` : '';

    // Working sets
    const step = S.loadStep(ex);
    const load = usesLoad(ex);
    body.querySelector('[data-sets]').innerHTML = it.sets.map((s, j) => {
      const n = j + 1;
      if (s.done) {
        return `<li class="set-row set-row--done"><span class="eyebrow">${esc(t('session.setN', { n }))}</span>
          <span class="num set-done">${icon('check')} ${s.reps}${unit ? ' s' : ''}${load && s.kg ? ` × ${fmtKg(s.kg)} kg` : ''}${s.rir != null ? ` · RIR ${s.rir}` : ''}</span>
          <button class="btn btn--ghost" data-unlog="${j}">${esc(t('session.edit'))}</button></li>`;
      }
      return `<li class="set-row" data-row="${j}"><span class="eyebrow">${esc(t('session.setN', { n }))}</span>
        <div class="stepper" data-step="${unit ? 5 : 1}" data-min="0" role="group" aria-label="${esc(t(unit ? 'session.labelSeconds' : 'session.labelReps', { n }))}">
          <button type="button" data-dec aria-label="−">−</button><input type="number" inputmode="numeric" data-reps value="${s.reps ?? ''}" aria-label="${esc(t(unit ? 'session.labelSeconds' : 'session.labelReps', { n }))}"><span class="suffix">${esc(t(unit ? 'session.seconds' : 'session.reps'))}</span><button type="button" data-inc aria-label="+">+</button></div>
        ${load ? `<div class="stepper" data-step="${step}" data-min="0" role="group" aria-label="${esc(t('session.labelKg', { n }))}">
          <button type="button" data-dec aria-label="−">−</button><input type="number" inputmode="decimal" step="${step}" data-kg value="${s.kg ?? ''}" aria-label="${esc(t('session.labelKg', { n }))}"><span class="suffix">kg</span><button type="button" data-inc aria-label="+">+</button></div>`
          : `<span class="small muted">${esc(t('session.bodyweight'))}</span>`}
        <div class="input-wrap set-rir"><select data-rir aria-label="${esc(t('session.labelRir', { n }))}"><option value="">${esc(t('session.rir'))}</option>${[0, 1, 2, 3, 4, 5].map(v => `<option value="${v}">RIR ${v}</option>`).join('')}</select></div>
        <button class="btn btn--primary" data-log="${j}">${esc(t('session.done'))}</button></li>`;
    }).join('');

    const last = a.index === a.items.length - 1;
    body.querySelector('[data-actions]').innerHTML = `
      <div class="row">
        <button class="btn btn--secondary" data-prev ${a.index === 0 ? 'disabled' : ''}>${icon('back')}${esc(t('session.prev'))}</button>
        ${last ? `<button class="btn btn--primary" data-finish>${esc(t('session.finish'))}</button>` : `<button class="btn btn--primary" data-next>${esc(t('session.next'))}</button>`}
      </div>
      <div class="row">
        <button class="btn btn--ghost" data-skip>${esc(t(it.skipped ? 'session.unskip' : 'session.skip'))}</button>
        <button class="btn btn--ghost" data-swap>${esc(t('session.swap'))}</button>
      </div>`;
    tick();
  }

  // One delegated listener for the whole screen.
  root.addEventListener('click', async e => {
    const b = e.target.closest('button, input[data-ramp]');
    if (!b) return;
    const a = A();
    if (!a) return;
    const i = a.index;
    if (b.dataset.goto != null) { mutate(x => S.goTo(x, Number(b.dataset.goto))); draw(); }
    else if (b.dataset.log != null) {
      const j = Number(b.dataset.log);
      const row = root.querySelector(`[data-row="${j}"]`);
      const reps = Number(row.querySelector('[data-reps]').value);
      if (!(reps > 0)) { row.querySelector('[data-reps]').focus(); return; }
      const kgEl = row.querySelector('[data-kg]');
      const rirEl = row.querySelector('[data-rir]');
      mutate(x => {
        S.logSet(x, i, j, { reps, kg: kgEl && kgEl.value !== '' ? Number(kgEl.value) : null, rir: rirEl.value === '' ? null : Number(rirEl.value) });
        // Carry today's load forward to the sets not logged yet.
        if (kgEl && kgEl.value !== '') x.items[i].sets.forEach(s => { if (!s.done) s.kg = Number(kgEl.value); });
      });
      draw();
      const done = root.querySelectorAll('.set-done')[j];
      if (done) checkPop(done);
    }
    else if (b.dataset.unlog != null) { mutate(x => S.unlogSet(x, i, Number(b.dataset.unlog))); draw(); }
    else if (b.dataset.ramp != null) { mutate(x => { x.items[i].ramp[Number(b.dataset.ramp)].done = b.checked; }); }
    else if (b.matches('[data-addset]')) { mutate(x => S.addSet(x, i)); draw(); }
    else if (b.matches('[data-prev]')) { mutate(x => S.goTo(x, i - 1)); draw(); }
    else if (b.matches('[data-next]')) { mutate(x => S.goTo(x, i + 1)); draw(); }
    else if (b.matches('[data-skip]')) { mutate(x => (x.items[i].skipped ? S.unskipItem(x, i) : S.skipItem(x, i))); draw(); }
    else if (b.matches('[data-plus]')) { mutate(x => S.addRest(x, 30)); tick(); }
    else if (b.matches('[data-skiprest]')) { mutate(x => S.skipRest(x)); tick(); }
    else if (b.dataset.harder) {
      const st = getState();
      const ses = st.plan.sessions.find(x => x.templateId === a.templateId);
      setSwap(data, ses.templateId, a.items[i].slotId, b.dataset.harder);
      mutate((x, s2) => S.swapItem(x, i, b.dataset.harder, data, s2.workouts, s2.profile));
      toast(t('exercise.swapped'));
      draw();
    }
    else if (b.matches('[data-swap]')) swapSheet(i);
    else if (b.matches('[data-finish]')) finish();
    else if (b.matches('[data-end]')) endSheet();
  });

  async function swapSheet(i) {
    const st = getState();
    const a = st.activeSession;
    const it = a.items[i];
    const ids = swapOptions(data, { exercises: a.items.map(x => ({ exerciseId: x.exerciseId })) }, { exerciseId: it.exerciseId, slotId: it.slotId }, st.profile, SLOTS);
    const bodyEl = document.createElement('div');
    bodyEl.className = 'stack';
    bodyEl.innerHTML = `<p class="muted">${esc(t('session.swapIntro'))}</p>` + (ids.length
      ? `<div class="options--list">${ids.map(id => `<button class="btn btn--secondary btn--block" data-pick="${id}">${esc(tx(exById[id].name))}</button>`).join('')}</div>`
      : `<p>${esc(t('plan.swapNone'))}</p>`);
    bodyEl.addEventListener('click', ev => { const p = ev.target.closest('[data-pick]'); if (!p) return; const dlg = bodyEl.closest('dialog'); dlg.returnValue = p.dataset.pick; dlg.close(); });
    const pick = await openSheet({ title: t('session.swapTitle', { name: tx(exById[it.exerciseId].name) }), body: bodyEl, closeLabel: t('common.close'), actions: [{ label: t('common.cancel'), value: '', variant: 'ghost' }] });
    if (!pick) return;
    mutate((x, s2) => S.swapItem(x, i, pick, data, s2.workouts, s2.profile));
    draw();
  }

  async function endSheet() {
    const v = await openSheet({ title: t('session.endTitle'), body: `<p>${esc(t('session.endBody'))}</p>`, closeLabel: t('common.close'),
      actions: [{ label: t('session.keepGoing'), value: '', variant: 'ghost' }, { label: t('session.discard'), value: 'discard', variant: 'danger' }, { label: t('session.save'), value: 'save', variant: 'primary' }] });
    if (v === 'save') finish();
    else if (v === 'discard') { update(st => S.discardSession(st)); location.hash = '#/'; }
  }

  function finish() {
    let rec;
    update(st => { rec = S.finishSession(st, data); });
    location.hash = `#/session/summary/${rec.id}`;
  }

  draw();
}

function summary(root, id) {
  const s = getState();
  const w = s.workouts.find(x => x.id === id);
  if (!w) { root.innerHTML = `<div class="page"><p>${esc(t('summary.notFound'))}</p></div>`; return; }
  import('../plans.js').then(({ planData }) => planData()).then(data => {
    const name = id2 => tx(data.exById[id2].name);
    const prText = p => p.type === 'heaviest' ? t('summary.prHeaviest', { name: name(p.exerciseId), kg: fmtKg(p.kg), prev: fmtKg(p.previous) })
      : p.type === 'reps-at-load' ? t('summary.prRepsAtLoad', { name: name(p.exerciseId), reps: p.reps, kg: fmtKg(p.kg), prev: p.previous })
        : p.type === 'e1rm' ? t('summary.prE1rm', { name: name(p.exerciseId), kg: fmtKg(p.kg), prev: fmtKg(p.previous) })
          : t('summary.prReps', { name: name(p.exerciseId), reps: p.reps, prev: p.previous });
    const sets = w.exercises.reduce((n, x) => n + x.sets.length, 0);
    const skipped = w.exercises.filter(x => x.skipped).map(x => name(x.exerciseId));
    const plan = s.plan;
    const next = plan ? plan.sessions[(s.queueIndex ?? 0) % plan.sessions.length] : null;
    root.innerHTML = `
      <header class="brand page-head"><div class="stack">
        <span class="eyebrow eyebrow--rule">${esc(t(`plan.sessions.${w.templateId}.name`))}</span>
        <h1 class="display-72">${esc(t('summary.title'))} <span class="key">${esc(t('summary.key'))}</span></h1>
      </div></header>
      <div class="page stack-lg">
        <div class="stat-grid">
          <div class="stat"><span class="eyebrow">${esc(t('summary.duration'))}</span><span class="big-num stat-value">${hms(w.durationSec)}</span></div>
          <div class="stat"><span class="eyebrow">${esc(t('summary.volume'))}</span><span class="big-num stat-value">${fmtKg(w.volumeKg)} <span class="stat-unit">kg</span></span></div>
          <div class="stat"><span class="eyebrow">${esc(t('summary.sets'))}</span><span class="big-num stat-value">${sets}</span></div>
          <div class="stat"><span class="eyebrow">${esc(t('summary.reps'))}</span><span class="big-num stat-value">${w.totalReps}</span></div>
        </div>
        <section class="stack-sm"><h2>${esc(t('summary.prs'))}</h2>
          ${w.prs.length ? `<ul role="list" class="stack-sm">${w.prs.map(p => `<li class="pr-item">${icon('trophy')}<span>${esc(prText(p))}</span></li>`).join('')}</ul>` : `<p class="muted">${esc(t('summary.noPrs'))}</p>`}
        </section>
        ${skipped.length ? `<p class="small muted">${esc(t('summary.skippedList', { list: skipped.join(', ') }))}</p>` : ''}
        ${next ? `<p>${esc(t('summary.next', { name: t(`plan.sessions.${next.templateId}.name`) }))}</p>` : ''}
        <a class="btn btn--primary" href="#/">${esc(t('summary.home'))}</a>
      </div>`;
    root.querySelectorAll('.pr-item').forEach((el, k) => setTimeout(() => checkPop(el), 120 * k));
  });
}
