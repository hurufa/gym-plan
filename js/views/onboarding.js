// views/onboarding.js
// Multi-step profile form, one question per screen, on the brand surface. Steps that do not apply
// (pull-up bar / bands for full-gym users) are skipped. The draft survives a reload (sessionStorage).
// #/onboarding?edit=1 opens it prefilled from the saved profile and asks for confirmation, listing
// what will change, before saving. Profile fields are documented in PROFILE_FIELDS.

import { getState, update } from '../state.js';
import { t, setLang, getLang } from '../i18n.js';
import { esc, icon, confirmDialog, toast } from '../ui.js';
import { slideIn } from '../animations.js';

const DRAFT_KEY = 'gym-app-onboarding';

// Profile shape. TRAINING fields regenerate the plan; BODY fields only recalculate nutrition.
export const TRAINING_FIELDS = ['goal', 'days', 'experience', 'equipment', 'pullupBar', 'bands', 'sessionLength', 'injuries'];
export const BODY_FIELDS = ['sex', 'age', 'heightCm', 'weightKg', 'dailyLife', 'dailySteps'];
export const PROFILE_FIELDS = [...TRAINING_FIELDS, ...BODY_FIELDS, 'health'];
export const HEALTH_ITEMS = ['heart', 'chestPain', 'dizziness', 'joint', 'pregnant'];

const GOALS = ['build-muscle', 'lose-fat', 'recomposition', 'get-stronger', 'general-fitness'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const SETUPS = ['full-gym', 'dumbbells', 'bodyweight'];
const DAILY = ['sitting', 'some-walking', 'on-feet', 'labour'];
const INJURIES = ['knee', 'lower-back', 'shoulder'];

const headline = key =>
  `<span class="eyebrow eyebrow--rule">${esc(t(key + '.eyebrow'))}</span>
   <h1 class="display-48" id="step-title" tabindex="-1">${esc(t(key + '.title'))} <span class="key">${esc(t(key + '.key'))}</span></h1>`;

const radioOptions = (name, values, labelFn, current, grid = false) =>
  `<div class="options ${grid ? 'options--grid' : ''}" role="radiogroup" aria-labelledby="step-title">${values.map(v => {
    const l = labelFn(v);
    return `<label class="option"><input class="visually-hidden" type="radio" name="${name}" value="${esc(v)}" ${String(current) === String(v) ? 'checked' : ''}>
      <span>${esc(l.label)}</span>${l.desc ? `<small>${esc(l.desc)}</small>` : ''}</label>`;
  }).join('')}</div>`;

const opt = (group, v) => ({ label: t(`options.${group}.${v}.label`), desc: t(`options.${group}.${v}.desc`) });
const errorBox = id => `<p class="error-msg" id="${id}" hidden role="alert"></p>`;

function numberField(id, label, unit, value, errKey, attrs = '') {
  return `<div class="field" data-field="${id}">
    <label for="f-${id}">${esc(label)}</label>
    <div class="input-wrap"><input id="f-${id}" name="${id}" type="number" inputmode="decimal" ${attrs} value="${value ?? ''}" aria-describedby="e-${id}"><span class="suffix">${esc(unit)}</span></div>
    <span class="error" id="e-${id}">${icon('error')}${esc(t(errKey))}</span></div>`;
}

const radioValue = (form, name) => form.querySelector(`input[name="${name}"]:checked`)?.value;
const yesNo = v => ({ label: t(`common.${v}`) });

// Each step: id, optional when(draft), render(draft) -> html, read(form, draft) -> true when valid.
const STEPS = [
  {
    id: 'welcome', skipInEdit: true,
    render: () => `
      <span class="eyebrow eyebrow--rule">${esc(t('onboarding.welcome.eyebrow'))}</span>
      <h1 class="display-72" id="step-title" tabindex="-1">${esc(t('onboarding.welcome.title'))} <span class="key">${esc(t('onboarding.welcome.key'))}</span></h1>
      <p>${esc(t('onboarding.welcome.body'))}</p>
      <div class="notice" data-disclaimer>${icon('info')}<div>${esc(t('onboarding.welcome.disclaimer'))}</div></div>
      <fieldset class="segmented"><legend>${esc(t('onboarding.welcome.language'))}</legend>
        ${['id', 'en'].map(l => `<label><input type="radio" name="lang" value="${l}" ${getLang() === l ? 'checked' : ''}>${l === 'id' ? 'Bahasa Indonesia' : 'English'}</label>`).join('')}
      </fieldset>`,
    read: () => true,
    nextLabel: () => t('onboarding.welcome.start'),
  },
  { id: 'goal', render: d => headline('onboarding.goal') + radioOptions('goal', GOALS, v => opt('goal', v), d.goal), read: (f, d) => pick(f, d, 'goal') },
  {
    id: 'days',
    render: d => headline('onboarding.days') + `<p>${esc(t('onboarding.days.hint'))}</p>` + radioOptions('days', [2, 3, 4, 5, 6], v => ({ label: String(v) }), d.days, true),
    read: (f, d) => pick(f, d, 'days', Number),
  },
  { id: 'experience', render: d => headline('onboarding.experience') + radioOptions('experience', LEVELS, v => opt('experience', v), d.experience), read: (f, d) => pick(f, d, 'experience') },
  {
    id: 'equipment',
    render: d => headline('onboarding.equipment') + radioOptions('equipment', SETUPS, v => opt('equipment', v), d.equipment),
    read: (f, d) => {
      const ok = pick(f, d, 'equipment');
      if (ok && d.equipment === 'full-gym') { d.pullupBar = true; d.bands = true; } // a full gym has both
      return ok;
    },
  },
  {
    id: 'pullupBar', when: d => d.equipment !== 'full-gym',
    render: d => headline('onboarding.pullupBar') + radioOptions('pullupBar', ['yes', 'no'], yesNo, d.pullupBar === undefined ? '' : d.pullupBar ? 'yes' : 'no', true),
    read: (f, d) => pick(f, d, 'pullupBar', v => v === 'yes'),
  },
  {
    id: 'bands', when: d => d.equipment !== 'full-gym',
    render: d => headline('onboarding.bands') + radioOptions('bands', ['yes', 'no'], yesNo, d.bands === undefined ? '' : d.bands ? 'yes' : 'no', true),
    read: (f, d) => pick(f, d, 'bands', v => v === 'yes'),
  },
  {
    id: 'sessionLength',
    render: d => headline('onboarding.sessionLength') + `<p>${esc(t('onboarding.sessionLength.hint'))}</p>` +
      radioOptions('sessionLength', [45, 60, 75, 90], v => ({ label: String(v), desc: t('common.min') }), d.sessionLength, true),
    read: (f, d) => pick(f, d, 'sessionLength', Number),
  },
  {
    id: 'about',
    render: d => headline('onboarding.about') + `<p>${esc(t('onboarding.about.hint'))}</p>
      <div class="field" data-field="sex"><span class="label" id="l-sex">${esc(t('onboarding.about.sex'))}</span>
        <fieldset class="segmented" aria-labelledby="l-sex" aria-describedby="e-sex"><legend>${esc(t('onboarding.about.sex'))}</legend>
        ${['male', 'female'].map(v => `<label><input type="radio" name="sex" value="${v}" ${d.sex === v ? 'checked' : ''}>${esc(t('options.sex.' + v))}</label>`).join('')}
        </fieldset><span class="error" id="e-sex">${icon('error')}${esc(t('onboarding.about.errSex'))}</span></div>
      ${numberField('age', t('onboarding.about.age'), t('onboarding.about.ageUnit'), d.age, 'onboarding.about.errAge', 'min="13" max="90" step="1" inputmode="numeric"')}
      ${numberField('heightCm', t('onboarding.about.height'), t('common.cm'), d.heightCm, 'onboarding.about.errHeight', 'min="120" max="230" step="0.5"')}
      ${numberField('weightKg', t('onboarding.about.weight'), t('common.kg'), d.weightKg, 'onboarding.about.errWeight', 'min="30" max="300" step="0.1"')}`,
    read: (f, d) => {
      const checks = [
        ['sex', radioValue(f, 'sex'), v => !!v],
        ['age', num(f, 'age'), v => Number.isInteger(v) && v >= 13 && v <= 90],
        ['heightCm', num(f, 'heightCm'), v => v >= 120 && v <= 230],
        ['weightKg', num(f, 'weightKg'), v => v >= 30 && v <= 300],
      ];
      let ok = true;
      for (const [k, v, valid] of checks) {
        const good = v !== null && v !== undefined && !Number.isNaN(v) && valid(v);
        setInvalid(f, k, !good);
        if (good) d[k] = v; else ok = false;
      }
      return ok;
    },
  },
  { id: 'dailyLife', render: d => headline('onboarding.dailyLife') + radioOptions('dailyLife', DAILY, v => opt('dailyLife', v), d.dailyLife), read: (f, d) => pick(f, d, 'dailyLife') },
  {
    id: 'steps',
    render: d => headline('onboarding.steps') + `<p>${esc(t('onboarding.steps.hint'))}</p>` +
      numberField('dailySteps', `${t('onboarding.steps.label')} (${t('common.optional')})`, t('onboarding.steps.unit'), d.dailySteps, 'onboarding.steps.err', 'min="0" max="50000" step="100" inputmode="numeric"'),
    read: (f, d) => {
      const raw = f.querySelector('[name="dailySteps"]').value.trim();
      const v = raw === '' ? null : Number(raw);
      const ok = v === null || (Number.isFinite(v) && v >= 0 && v <= 50000);
      setInvalid(f, 'dailySteps', !ok);
      if (ok) d.dailySteps = v === null ? null : Math.round(v);
      return ok;
    },
  },
  {
    id: 'injuries',
    render: d => headline('onboarding.injuries') + `<p>${esc(t('onboarding.injuries.hint'))}</p>
      <div class="chip-group" role="group" aria-labelledby="step-title">${INJURIES.map(v =>
        `<label class="chip"><input type="checkbox" name="injuries" value="${v}" ${(d.injuries || []).includes(v) ? 'checked' : ''}>${esc(t('options.injury.' + v))}</label>`).join('')}</div>
      <div class="notice notice--warning">${icon('warning')}<div>${esc(t('onboarding.injuries.disclaimer'))}</div></div>`,
    read: (f, d) => { d.injuries = [...f.querySelectorAll('[name="injuries"]:checked')].map(i => i.value); return true; },
  },
  {
    id: 'health',
    render: d => {
      const h = d.health || { answers: {}, acknowledged: false };
      return headline('onboarding.health') + `<p>${esc(t('onboarding.health.question'))}</p>
      <div class="stack-sm">${HEALTH_ITEMS.map(k => `<div class="field health-item" data-field="h-${k}">
        <span class="label" id="l-${k}">${esc(t('onboarding.health.items.' + k))}</span>
        <fieldset class="segmented" aria-labelledby="l-${k}"><legend>${esc(t('onboarding.health.items.' + k))}</legend>
          ${['yes', 'no'].map(v => `<label><input type="radio" name="h-${k}" value="${v}" ${h.answers[k] === (v === 'yes') ? 'checked' : ''}>${esc(t('common.' + v))}</label>`).join('')}
        </fieldset><span class="error" id="e-h-${k}">${icon('error')}${esc(t('common.pickOne'))}</span></div>`).join('')}</div>
      <div data-health-warning hidden class="stack-sm">
        <div class="notice notice--danger">${icon('warning')}<div><strong>${esc(t('onboarding.health.warnTitle'))}</strong>${esc(t('onboarding.health.warnBody'))}</div></div>
        <div class="field" data-field="ack"><label class="check"><input type="checkbox" name="ack" ${h.acknowledged ? 'checked' : ''} aria-describedby="e-ack"><span>${esc(t('onboarding.health.ack'))}</span></label>
        <span class="error" id="e-ack">${icon('error')}${esc(t('onboarding.health.ackRequired'))}</span></div>
      </div>`;
    },
    mount: form => {
      const sync = () => {
        const anyYes = HEALTH_ITEMS.some(k => radioValue(form, 'h-' + k) === 'yes');
        form.querySelector('[data-health-warning]').hidden = !anyYes;
      };
      form.addEventListener('change', sync);
      sync();
    },
    read: (f, d) => {
      let ok = true;
      const answers = {};
      for (const k of HEALTH_ITEMS) {
        const v = radioValue(f, 'h-' + k);
        setInvalid(f, 'h-' + k, !v);
        if (!v) ok = false; else answers[k] = v === 'yes';
      }
      const anyYes = Object.values(answers).some(Boolean);
      const acknowledged = !!f.querySelector('[name="ack"]')?.checked;
      setInvalid(f, 'ack', ok && anyYes && !acknowledged);
      if (anyYes && !acknowledged) ok = false;
      if (ok) d.health = { answers, anyYes, acknowledged: anyYes && acknowledged };
      return ok;
    },
    nextLabel: () => t('onboarding.health.finish'),
  },
];

function num(form, name) {
  const raw = form.querySelector(`[name="${name}"]`).value.trim();
  return raw === '' ? null : Number(raw);
}
function setInvalid(form, field, invalid) {
  const el = form.querySelector(`[data-field="${field}"]`);
  if (!el) return;
  el.toggleAttribute('data-invalid', invalid);
  el.querySelector('input')?.setAttribute('aria-invalid', String(invalid));
}
function pick(form, d, name, cast = v => v) {
  const v = radioValue(form, name);
  const err = form.querySelector('.error-msg');
  if (!v) {
    err.innerHTML = `${icon('error')} ${esc(t('common.pickOne'))}`;
    err.hidden = false;
    return false;
  }
  d[name] = cast(v);
  return true;
}

function loadDraft(edit) {
  if (edit) return structuredClone(getState().profile);
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; }
}
function saveDraft(d, edit) {
  if (edit) return;
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage unavailable: draft is in memory only */ }
}

// Fields whose value differs between two profiles.
export function changedFields(before, after) {
  return PROFILE_FIELDS.filter(k => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null));
}

export function render(root, ctx) {
  const edit = ctx.query.edit === '1';
  const draft = loadDraft(edit);
  let index = Math.min(Number(draft._step) || 0, STEPS.length - 1);
  delete draft._step;
  const visible = () => STEPS.filter(s => (!s.when || s.when(draft)) && !(edit && s.skipInEdit));

  root.className = 'brand onboarding';
  root.innerHTML = `
    <div class="onb-top">
      <button class="btn btn--ghost" type="button" data-back>${icon('back')}<span>${esc(t('common.back'))}</span></button>
      <span class="eyebrow" data-count aria-live="polite"></span>
    </div>
    <div class="progress" aria-hidden="true"><span></span></div>
    <form class="onb-form" novalidate>
      <div class="onb-step stack"></div>
      <div class="onb-actions"><button class="btn btn--primary btn--block" type="submit" data-next></button></div>
    </form>`;
  const form = root.querySelector('form');
  const stepEl = root.querySelector('.onb-step');

  function show(dir = 0) {
    const steps = visible();
    index = Math.max(0, Math.min(index, steps.length - 1));
    const step = steps[index];
    stepEl.innerHTML = step.render(draft) + errorBox('pick-error');
    step.mount?.(form);
    root.querySelector('[data-count]').textContent = t('common.stepOf', { n: index + 1, total: steps.length });
    root.querySelector('.progress span').style.width = `${((index + 1) / steps.length) * 100}%`;
    root.querySelector('[data-back]').hidden = index === 0 && !edit;
    root.querySelector('[data-next]').textContent = step.nextLabel ? step.nextLabel() : t('common.next');
    if (dir) { slideIn(stepEl, dir); stepEl.querySelector('#step-title')?.focus(); }
    saveDraft({ ...draft, _step: index }, edit);
  }

  root.querySelector('[data-back]').addEventListener('click', () => {
    if (index === 0 && edit) { location.hash = '#/settings'; return; }
    index--; show(-1);
  });

  // Language switch on the welcome step re-renders the whole step in the new language.
  form.addEventListener('change', async e => {
    if (e.target.name === 'lang') {
      await setLang(e.target.value);
      update(s => { s.settings.lang = e.target.value; s.settings.updatedAt = Date.now(); });
      show();
    } else {
      stepEl.querySelector('.error-msg').hidden = true;
    }
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const steps = visible();
    if (!steps[index].read(form, draft)) {
      form.querySelector('[data-invalid] input, .error-msg:not([hidden])')?.focus?.();
      return;
    }
    if (index < visible().length - 1) { index++; show(1); return; }
    await finish();
  });

  async function finish() {
    const profile = { ...draft, updatedAt: Date.now() };
    if (!edit) {
      update(s => { s.profile = profile; s.onboardedAt = Date.now(); });
      sessionStorage.removeItem(DRAFT_KEY);
      // Ask the browser not to evict our storage; result is informational only.
      navigator.storage?.persist?.().catch(() => {});
      location.hash = '#/';
      return;
    }
    const before = getState().profile;
    const changed = changedFields(before, profile);
    if (!changed.length) { toast(t('onboarding.edit.none')); location.hash = '#/settings'; return; }
    const parts = [];
    if (changed.some(k => TRAINING_FIELDS.includes(k))) parts.push(t('onboarding.edit.training'));
    if (changed.some(k => BODY_FIELDS.includes(k))) parts.push(t('onboarding.edit.body'));
    const body = `<p>${esc(t('onboarding.edit.changed', { fields: changed.map(k => t('onboarding.fields.' + k)).join(', ') }))}</p>` +
      parts.map(p => `<p>${esc(p)}</p>`).join('');
    const ok = await confirmDialog({ title: t('onboarding.edit.title'), body: `<div class="stack-sm">${body}</div>`,
      confirm: t('onboarding.edit.confirm'), cancel: t('common.cancel'), closeLabel: t('common.close') });
    if (!ok) return;
    update(s => { s.profile = profile; s.profileChanged = { fields: changed, at: Date.now() }; });
    toast(t('onboarding.edit.saved'));
    location.hash = '#/settings';
  }

  show();
  stepEl.querySelector('#step-title')?.focus({ preventScroll: true });
}
