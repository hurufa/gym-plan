// views/home.js
// Home: next session in the plan queue (missed days never skip a session; the queue position is
// advanced when a session is finished), start/resume button, weekly streak, profile summary, backup reminder and iOS install hint. Backup reminder shows when the last export (or onboarding, if never exported)
// is more than 14 days old.

import { getState } from '../state.js';
import { t, tx } from '../i18n.js';
import { esc, icon } from '../ui.js';
import { downloadExport } from './settings.js';
import { ensurePlan, sessionsForWeek } from '../plans.js';
import { sessionBuilds } from './plan.js';
import { bodyMap, groupStates } from '../bodymap.js';
import { streak as weekStreak } from '../tracker.js';

const DAY = 864e5;

export function needsBackupReminder(s, now = Date.now()) {
  const since = s.lastExportAt ?? s.onboardedAt ?? s.createdAt;
  return !!since && now - since > 14 * DAY;
}

export function isIosBrowser() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return ios && !standalone;
}

export function render(root) {
  const s = getState();
  const p = s.profile;
  const streak = weekStreak(s.workouts, p.days);
  root.innerHTML = `
    <header class="brand page-head"><div class="stack">
      <span class="eyebrow eyebrow--rule">${esc(t('home.eyebrow'))}</span>
      <h1 class="display-48">${esc(t('home.nextTitle'))} <span class="key">${esc(t('home.nextKey'))}</span></h1>
      <p data-next-line></p>
    </div></header>
    <div class="page stack">
      <div data-reminders class="stack-sm"></div>
      <section class="card stack-sm" data-next></section>
      <div class="stat-grid">
        <div class="stat"><span class="eyebrow">${esc(t('home.streak'))}</span>
          <span class="big-num stat-value">${streak} <span class="stat-unit">${esc(t('home.weeks'))}</span></span></div>
      </div>
      <section class="card stack-sm">
        <h3>${esc(t('home.profile'))}</h3>
        <p class="muted">${esc(t('home.profileLine', {
          goal: t(`options.goal.${p.goal}.label`), days: p.days, length: p.sessionLength,
          equipment: t(`options.equipment.${p.equipment}.label`) }))}</p>
        <a class="btn btn--secondary" href="#/settings">${esc(t('settings.editProfile'))}</a>
      </section>
    </div>`;

  const rem = root.querySelector('[data-reminders]');
  if (needsBackupReminder(s)) {
    rem.insertAdjacentHTML('beforeend', `<div class="notice notice--warning">${icon('warning')}<div class="stack-sm">
      <div><strong>${esc(t('home.backupTitle'))}</strong>${esc(t(s.lastExportAt ? 'home.backupBody' : 'home.backupNever'))}</div>
      <button class="btn btn--primary" data-export>${icon('download')}${esc(t('home.backupAction'))}</button></div></div>`);
    rem.querySelector('[data-export]').addEventListener('click', () => { downloadExport(); render(root); });
  }
  if (isIosBrowser()) {
    rem.insertAdjacentHTML('beforeend', `<div class="notice">${icon('info')}<div><strong>${esc(t('home.iosTitle'))}</strong>${esc(t('home.iosBody'))}</div></div>`);
  }

  ensurePlan().then(r => {
    if (!r) return;
    const { plan, data } = r;
    const sessions = sessionsForWeek(plan);
    const active = getState().activeSession;
    const ses = active ? sessions.find(x => x.templateId === active.templateId) || sessions[active.queueIndex % sessions.length] : sessions[(getState().queueIndex ?? 0) % sessions.length];
    const name = t(`plan.sessions.${ses.templateId}.name`);
    const groups = ses.groups.map(g => tx(data.enums.groups.find(x => x.id === g).name));
    root.querySelector('[data-next-line]').textContent = active ? t('home.inProgress', { name }) : t('home.sessionLine', { name, min: ses.durationMin });
    root.querySelector('[data-next]').innerHTML = `
      <span class="eyebrow">${esc(t('plan.todayBuilds'))}</span>
      <h2>${esc(name)}</h2>
      <p>${esc(sessionBuilds(ses, data))}</p>
      ${bodyMap({ enums: data.enums, states: groupStates(data.enums, Object.fromEntries(ses.groups.map(g => [g, 'primary']))), size: 'small',
        label: `${t('plan.todayBuilds')}: ${groups.join(', ')}`, captions: [t('plan.front'), t('plan.back')] })}
      <a class="btn btn--ghost" href="#/learn/growth-mechanism">${icon('book')}${esc(t('learn.growthLink'))}</a>
      <p class="small muted">${esc(t('home.queueNote'))}</p>
      <div class="row"><a class="btn btn--primary" href="#/session">${esc(t(active ? 'home.resumeSession' : 'home.startSession'))}</a>
      <a class="btn btn--secondary" href="#/plan?open=${ses.key}">${esc(t('home.viewSession'))}</a></div>`;
  });
}
