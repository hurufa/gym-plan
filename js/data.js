// data.js
// loadData(name): the single entry point for JSON content (exercises, enums, i18n/en, ...).
// In the single-file build each file is inlined as <script type="application/json" id="data-NAME">;
// otherwise it is fetched from ./data/NAME.json. Results are cached per name.

const cache = new Map();

export function loadData(name) {
  if (!cache.has(name)) {
    const inline = document.getElementById(`data-${name}`);
    const p = inline
      ? Promise.resolve(JSON.parse(inline.textContent))
      : fetch(`./data/${name}.json`).then(r => {
          if (!r.ok) throw new Error(`Could not load data/${name}.json (${r.status})`);
          return r.json();
        });
    p.catch(() => cache.delete(name)); // allow a retry after a failed load
    cache.set(name, p);
  }
  return cache.get(name);
}

export function clearDataCache() { cache.clear(); }
