// tests/contrast.test.js
// Every token pair in contrast.js PAIRS meets its minimum in light and dark, plus the orange-usage
// rules of the Utility design (orange fill vs orange text, button outline, number font), and the
// rendered contrast of onboarding-style controls on the dark panel (computed styles, both themes).

import { suite, test, assert, noErrors } from './harness.js';
import { checkPairs, ratio, auditContrast } from '../contrast.js';

suite('Contrast (WCAG 2.2 AA)', () => {
  for (const theme of ['light', 'dark']) {
    test(`every token pair in use passes in the ${theme} theme`, () => {
      const el = document.createElement('div');
      el.dataset.theme = theme;
      document.body.append(el);
      const rows = checkPairs(el);
      el.remove();
      assert(rows.length > 25, 'pair list loaded');
      noErrors(rows.filter(r => !r.pass).map(r => `${r.fg} on ${r.bg}: ${r.ratio.toFixed(2)} < ${r.min} (${r.use})`));
    });
  }
  test('orange as a fill: the button orange fails as small text on the page, so text uses --accent', () => {
    const fill = ratio('#F0601F', '#ECECE8'), text = ratio('#B13F0E', '#ECECE8');
    assert(fill < 4.5, `fill orange as text ${fill.toFixed(2)}`);
    assert(text >= 4.5, `accent text ${text.toFixed(2)}`);
  });
  test('orange button has a black outline on the light page (fill alone is under 3:1)', () => {
    assert(ratio('#F0601F', '#ECECE8') < 3, 'fill vs page');
    assert(ratio('#121212', '#ECECE8') >= 3, 'outline vs page');
  });
  test('the display font has no tabular figures, so numbers never use it', () => {
    const css = getComputedStyle(document.documentElement);
    assert(!css.getPropertyValue('--font-num').includes('Anton'), '--font-num must not be Anton');
  });
  // Controls as onboarding renders them on the dark brand panel: field labels, a segmented control
  // (one option checked), an input with a unit, a check box, answer options and a chip.
  const BRAND_SAMPLE = `<div class="onboarding brand" style="padding:16px">
    <div class="field"><span class="label">Sex</span><fieldset class="segmented"><legend>Sex</legend>
      <label><input type="radio" name="cs-s">Male</label><label><input type="radio" name="cs-s" checked>Female</label></fieldset></div>
    <div class="field"><label for="cs-age">Age</label><div class="input-wrap"><input id="cs-age" value="30"><span class="suffix">years</span></div></div>
    <div class="field"><label class="check"><input type="checkbox"><span>I have read this</span></label></div>
    <div class="options"><label class="option"><input class="visually-hidden" type="radio" name="cs-g" checked><span>Build muscle</span><small>More size</small></label>
      <label class="option"><input class="visually-hidden" type="radio" name="cs-g"><span>Lose fat</span><small>Less fat</small></label></div>
    <div class="chip-group"><label class="chip"><input type="checkbox">Knee</label><label class="chip"><input type="checkbox" checked>Shoulder</label></div>
  </div>`;
  for (const theme of ['light', 'dark']) {
    test(`rendered contrast: onboarding controls on the dark panel (${theme} theme)`, () => {
      const host = document.createElement('div');
      host.dataset.theme = theme;
      host.innerHTML = BRAND_SAMPLE;
      document.body.append(host);
      const fails = auditContrast(host);
      host.remove();
      noErrors(fails.map(f => `"${f.text}": ${f.ratio} < ${f.min} (${f.fg} on ${f.bg})`));
    });
  }
  test('the rendered-contrast audit catches light text on a light control', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div style="background:#141414;color:#F2F2EE;padding:8px"><span style="background:#F8F8F5">Male</span></div>';
    document.body.append(host);
    const fails = auditContrast(host);
    host.remove();
    assert(fails.some(f => f.text === 'Male'), JSON.stringify(fails));
  });
});
