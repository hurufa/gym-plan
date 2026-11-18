// tests/harness.js
// Minimal test runner for tests.html: suite(name, fn) registers tests, test(name, fn) adds one,
// assert helpers throw on failure. run() executes everything, prints pass/fail per test into
// #results, and exposes window.__testResults = { passed, failed, failures } for automation.

const suites = [];
let current = null;

export function suite(name, fn) { current = { name, tests: [] }; suites.push(current); fn(); current = null; }
export function test(name, fn) { current.tests.push({ name, fn }); }

export class AssertionError extends Error {}
export function assert(cond, msg = 'assertion failed') { if (!cond) throw new AssertionError(msg); }
export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new AssertionError(`${msg ? msg + ': ' : ''}expected ${e}, got ${a}`);
}
// Collects many problems and fails once with the full list (used for data validation).
export function noErrors(errors, max = 40) {
  if (errors.length) throw new AssertionError(`${errors.length} problem(s):\n- ${errors.slice(0, max).join('\n- ')}${errors.length > max ? `\n… and ${errors.length - max} more` : ''}`);
}

export async function run(out) {
  let passed = 0, failed = 0;
  const failures = [];
  for (const s of suites) {
    const section = document.createElement('section');
    section.innerHTML = `<h2 class="display-32">${s.name}</h2><ol role="list" class="stack-sm"></ol>`;
    out.append(section);
    const list = section.querySelector('ol');
    for (const tc of s.tests) {
      const li = document.createElement('li');
      try {
        await tc.fn();
        passed++;
        li.className = 'pass';
        li.textContent = `PASS  ${tc.name}`;
      } catch (e) {
        failed++;
        failures.push(`${s.name} › ${tc.name}: ${e.message}`);
        li.className = 'fail';
        li.innerHTML = `FAIL  ${tc.name}<pre></pre>`;
        li.querySelector('pre').textContent = e.stack && !(e instanceof AssertionError) ? e.stack : e.message;
      }
      list.append(li);
    }
  }
  window.__testResults = { passed, failed, failures };
  return window.__testResults;
}
