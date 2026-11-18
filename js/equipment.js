// equipment.js
// Which exercises a user can do with their setup. An exercise's `equipment` lists every setup it
// works with (full-gym, dumbbells, bodyweight) plus extra requirements (pull-up-bar, bands).
// Full-gym users can get any exercise. Used by the planner, the library filters and tests.

export const SETUPS = ['full-gym', 'dumbbells', 'bodyweight'];
export const EXTRAS = ['pull-up-bar', 'bands'];

export function isAvailable(ex, setup, { pullupBar = false, bands = false } = {}) {
  if (setup === 'full-gym') return true;
  if (!ex.equipment.includes(setup)) return false;
  if (ex.equipment.includes('pull-up-bar') && !pullupBar) return false;
  if (ex.equipment.includes('bands') && !bands) return false;
  return true;
}
