// views/exercise.js
// Exercise page (#/exercise/<id>): animated figure (play/pause, 0.5x/1x; static start and end poses
// with reduced motion), what it builds and its role, a tappable front/back body map with each
// muscle's daily-life job, steps, form cues, common mistakes, details, alternatives (swap into the
// current plan where the profile allows) and the user's logged history for this exercise.
// History reads state.workouts[].exercises[] = { exerciseId, sets: [{ reps, kg }] } (session mode, phase 6).

import { getState } from '../state.js';
import { t, tx, formatDate, formatNumber } from '../i18n.js';
import { esc, icon, toast, confirmDialog } from '../ui.js';
import { mountFigure } from '../animations.js';
import { bodyMap, exerciseStates, wireBodyMap } from '../bodymap.js';
import { blockReason } from '../planner.js';
import { ensurePlan, planData, setSwap } from '../plans.js';

export function render(root, ctx) {
  root.innerHTML = `<div class="page"><p class="muted">…</p></div>`;
  let figure = null;
  planData().then(data => draw(data)).catch(err => { root.innerHTML = `<div class="page"><p>${esc(err.message)}</p></div>`; });
  return () => figure?.destroy();

  async function draw(data) {
    const { exById, enums } = data;
    const ex = exById[ctx.params[0]];
    if (!ex) {
      root.innerHTML = `<div class="page stack"><p>${esc(t('exercise.notFound'))}</p><a class="btn btn--secondary" href="#/exercises">${esc(t('exercise.back'))}</a></div>`;
      return;
    }
    const s = getState();
    const profile = s.profile;
    const muscle = id => enums.muscles.find(m => m.id === id);
    const name = tx(ex.name);
    const levelName = tx(enums.levels.find(l => l.id === ex.level).name);
    const patName = tx(enums.patterns.find(p => p.id === ex.pattern).name);
    const equipNames = ex.equipment.map(q => tx(enums.equipment.find(x => x.id === q).name)).join(', ');
    const stressNames = ex.stress.map(q => tx(enums.stress.find(x => x.id === q).name)).join(', ');

    // Where this exercise sits in the current plan (for swaps).
    const r = profile ? await ensurePlan() : null;
    const plan = r?.plan;
    const uses = plan ? plan.sessions.flatMap(ses => ses.exercises.filter(e => e.exerciseId === ex.id && e.sets > 0).map(e => ({ ses, e }))) : [];
    const sessionNames = uses.map(u => t(`plan.sessions.${u.ses.templateId}.name`));

    const history = (s.workouts || []).flatMap(w => (w.exercises || []).filter(x => x.exerciseId === ex.id).map(x => ({ date: w.date, sets: x.sets || [] })))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const muscleItem = (id, kind) => `<li><button type="button" class="chip" data-muscle-btn="${id}" aria-pressed="false">
      <span class="swatch ${kind === 'secondary' ? 'swatch--hatch' : ''}" style="${kind === 'primary' ? 'background:var(--muscle-primary)' : ''}" aria-hidden="true"></span>
      ${esc(tx(muscle(id).name))}<span class="visually-hidden"> (${esc(t('exercise.' + kind))})</span></button></li>`;

    const alt = ex.alternatives.map(id => exById[id]).filter(Boolean).map(a => {
      const blocked = profile && blockReason(a, profile);
      const canSwap = uses.length && !blocked && !uses.some(u => u.ses.exercises.some(e => e.exerciseId === a.id && e.sets > 0));
      return `<li class="alt-row"><a href="#/exercise/${a.id}">${esc(tx(a.name))}</a>
        ${canSwap ? `<button type="button" class="btn btn--secondary" data-swap="${a.id}">${esc(t('exercise.swapIn'))}</button>`
          : blocked ? `<span class="small muted">${esc(t('exercise.cannotDo'))}</span>` : ''}</li>`;
    }).join('');

    root.innerHTML = `
      <header class="brand page-head"><div class="stack">
        <a class="eyebrow" href="#/exercises">← ${esc(t('exercise.back'))}</a>
        <span class="eyebrow">${esc(patName)}</span>
        <h1 class="display-48">${esc(name)}</h1>
        ${uses.length ? `<p>${esc(t('exercise.inPlan', { sessions: sessionNames.join(', ') }))}</p>` : ''}
      </div></header>
      <div class="page stack-lg">
        <section class="card stack-sm ex-figure">
          <div data-figure></div>
          <div class="row ex-controls" data-controls hidden>
            <button type="button" class="btn btn--secondary" data-play aria-pressed="true">${esc(t('exercise.pause'))}</button>
            <fieldset class="segmented"><legend>${esc(t('exercise.speed'))}</legend>
              <label><input type="radio" name="speed" value="0.5">0.5×</label><label><input type="radio" name="speed" value="1" checked>1×</label></fieldset>
          </div>
          <p class="small muted" data-figure-note></p>
        </section>

        <section class="stack-sm"><h2>${esc(t('exercise.builds'))}</h2>
          <p>${esc(tx(ex.builds))}</p>
          <h3>${esc(t('exercise.role'))}</h3><p>${esc(tx(ex.role))}</p>
          <div class="card stack-sm"><strong data-no-terms>${esc(t('exercise.growth'))}</strong><p class="small">${esc(t('exercise.growthNote'))}</p><a class="btn btn--ghost" href="#/learn/growth-mechanism">${icon('book')}${esc(t('learn.growthLink'))}</a></div>
        </section>

        <section class="stack-sm"><h2>${esc(t('exercise.muscles'))}</h2>
          <p class="small muted">${esc(t('exercise.tapHint'))}</p>
          <div data-map>${bodyMap({ enums, states: exerciseStates(ex), interactive: true, captions: [t('plan.front'), t('plan.back')] })}</div>
          <p class="eyebrow">${esc(t('exercise.primary'))}</p><ul role="list" class="chip-group">${ex.primary.map(m => muscleItem(m, 'primary')).join('')}</ul>
          ${ex.secondary.length ? `<p class="eyebrow">${esc(t('exercise.secondary'))}</p><ul role="list" class="chip-group">${ex.secondary.map(m => muscleItem(m, 'secondary')).join('')}</ul>` : ''}
          <div class="notice" data-muscle-info aria-live="polite" hidden></div>
        </section>

        <section class="stack-sm"><h2>${esc(t('exercise.steps'))}</h2><ol class="stack-sm ex-steps">${tx(ex.steps).map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>
        <section class="stack-sm"><h2>${esc(t('exercise.cues'))}</h2><ul class="stack-sm">${tx(ex.cues).map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
        <section class="stack-sm"><h2>${esc(t('exercise.mistakes'))}</h2><ul class="stack-sm">${tx(ex.mistakes).map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>

        <section class="stack-sm"><h2>${esc(t('exercise.details'))}</h2>
          <table class="table"><tbody>
            <tr><th scope="row">${esc(t('exercise.level'))}</th><td>${esc(levelName)}</td></tr>
            <tr><th scope="row">${esc(t('exercise.equipment'))}</th><td>${esc(equipNames)}</td></tr>
            <tr><th scope="row">${esc(t('exercise.pattern'))}</th><td>${esc(patName)}</td></tr>
            <tr><th scope="row">${esc(t('exercise.stress'))}</th><td>${esc(stressNames || t('exercise.stressNone'))}</td></tr>
          </tbody></table></section>

        <section class="stack-sm"><h2>${esc(t('exercise.alternatives'))}</h2><ul role="list" class="stack-sm">${alt}</ul></section>

        <section class="stack-sm"><h2>${esc(t('exercise.history'))}</h2>
          ${history.length ? `<table class="table"><thead><tr><th scope="col">${esc(t('exercise.colDate'))}</th><th scope="col" class="num">${esc(t('exercise.colBest'))}</th><th scope="col" class="num">${esc(t('exercise.colSets'))}</th></tr></thead><tbody>
            ${history.map(h => { const best = h.sets.reduce((b, x) => ((x.kg || 0) > (b?.kg || 0) || (!b) ? x : b), null);
              return `<tr><td>${esc(formatDate(h.date))}</td><td class="num">${best ? `${formatNumber(best.kg || 0)} kg × ${best.reps}` : '–'}</td><td class="num">${h.sets.length}</td></tr>`; }).join('')}
            </tbody></table>` : `<p class="muted">${esc(t('exercise.noHistory'))}</p>`}
        </section>
      </div>`;

    // Figure
    figure = mountFigure(root.querySelector('[data-figure]'), ex, { label: t('exercise.figureLabel', { name }), startLabel: t('exercise.start'), endLabel: t('exercise.end') });
    const note = root.querySelector('[data-figure-note]');
    if (figure.animated) {
      root.querySelector('[data-controls]').hidden = false;
      note.textContent = ex.pattern === 'cardio' ? t('exercise.cycleNote') : ex.patternParams.tempo === 'isometric' || ex.pattern === 'core-hold' ? t('exercise.holdNote') : t('exercise.tempo');
      const playBtn = root.querySelector('[data-play]');
      playBtn.addEventListener('click', () => {
        const playing = figure.playing();
        if (playing) figure.pause(); else figure.play();
        playBtn.setAttribute('aria-pressed', String(!playing));
        playBtn.textContent = t(playing ? 'exercise.play' : 'exercise.pause');
      });
      root.querySelectorAll('input[name="speed"]').forEach(i => i.addEventListener('change', () => figure.setSpeed(Number(i.value))));
    } else {
      note.textContent = t('exercise.reduced');
    }

    // Muscles: tap on the map or the list to read what the muscle does.
    const info = root.querySelector('[data-muscle-info]');
    const select = id => {
      const m = muscle(id);
      if (!m) return;
      info.hidden = false;
      info.innerHTML = `<div><strong>${esc(tx(m.name))}</strong>${esc(tx(m.daily))}</div>`;
      root.querySelectorAll('[data-muscle-btn]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.muscleBtn === id)));
    };
    wireBodyMap(root.querySelector('[data-map]'), id => select(id));
    root.querySelectorAll('[data-muscle-btn]').forEach(b => b.addEventListener('click', () => select(b.dataset.muscleBtn)));

    // Swap an alternative into every slot of the plan that uses this exercise.
    root.querySelectorAll('[data-swap]').forEach(b => b.addEventListener('click', async () => {
      const to = exById[b.dataset.swap];
      const ok = await confirmDialog({
        title: t('exercise.swapTitle', { from: name, to: tx(to.name) }),
        body: `<p>${esc(t('exercise.swapBody', { from: name, to: tx(to.name), sessions: sessionNames.join(', ') }))}</p>`,
        confirm: t('exercise.swapConfirm'), cancel: t('common.cancel'), closeLabel: t('common.close'),
      });
      if (!ok) return;
      for (const u of uses) setSwap(data, u.ses.templateId, u.e.slotId, to.id);
      toast(t('exercise.swapped'));
      location.hash = `#/exercise/${to.id}`;
    }));
  }
}
