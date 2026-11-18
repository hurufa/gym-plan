// router.js
// Parses hash URLs like "#/exercise/barbell-back-squat?edit=1" into { name, params, query }.
// Used by app.js; kept separate so tests can import it without starting the app.

export function parseHash(hash = location.hash) {
  const [path, qs = ''] = hash.replace(/^#\/?/, '').split('?');
  const [name = '', ...params] = path.split('/').filter(Boolean);
  return { name, params: params.map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(qs)) };
}
