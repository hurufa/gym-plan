# Gym Plan

An offline web app that turns your goal and schedule into a training plan and a meal plan, explains
what it shows, animates every exercise and tracks your progress on the device. Plain HTML, CSS and ES
modules: no framework, no build step to run, no account, no server-side code. Indonesian and English.

All 11 phases are built; `BUILD-LOG.md` records each phase, the decisions taken and what is not verified.

## Setup

Requires Node.js 18 or newer (only for the development tools; the app itself needs none).

```bash
npm install
```

```bash
npm run vendor
```

`npm run vendor` copies GSAP and the fonts (Anton, JetBrains Mono, Barlow) from `node_modules` into
`vendor/` and `fonts/`. These files are already in the folder; run it again only after updating the
packages. `npm run icons` regenerates the PNG icons from `icons/icon.svg`.

## Run locally

The pages load ES modules and JSON, which browsers block on `file://` addresses. Serve the folder:

```bash
npm run dev
```

Then open:

- http://localhost:8417/ — the app
- http://localhost:8417/tests.html — automated checks (the header changes from "Running…" to PASS or FAIL)
- http://localhost:8417/styleguide.html — tokens, components and the contrast table, in both themes
- http://localhost:8417/figures.html — every exercise-figure pose at start, middle and end, for review

Stop the server with Ctrl+C. `npx serve .` also works. Opened from disk, each page shows these
instructions instead of hanging.

On localhost the service worker fetches from the network first, so you always see your latest edits;
it falls back to its cache when the server is down.

## After changing app files

```bash
npm run precache
```

This rewrites the file list and version in `sw.js`, so installed copies pick up the change. `npm run build`
does this and the single-file build in one go. `tests.html` fails if a module the app imports is missing
from the list.

## Deploy to GitHub Pages

All URLs are relative and routing uses `#/...`, so the app works under any sub-path. It is published
from the `hurufA/gym-plan` repository at **https://hurufa.github.io/gym-plan/**.

1. Run `npm run precache` so `sw.js` matches the files you publish.
2. Create a GitHub repository (here `gym-plan`) and push this folder to it (`.gitignore` leaves out
   `node_modules/`, `dist/`, `references/` and `.claude/`; `vendor/`, `fonts/` and `icons/` must be committed):
   ```bash
   git init && git add . && git commit -m "Gym Plan"
   ```
   ```bash
   git branch -M main && git remote add origin https://github.com/hurufA/gym-plan.git && git push -u origin main
   ```
3. On GitHub: Settings → Pages → Build and deployment → Source "Deploy from a branch", branch `main`,
   folder `/ (root)`. Save.
4. After a minute the app is at `https://hurufa.github.io/gym-plan/`. Open it once while online; after
   that it works offline. On a phone, use the browser's "Add to Home Screen" to install it. On iPhone
   this also stops Safari from clearing the data of a site you have not visited for a while.

Updates: commit and push with a fresh `npm run precache`. Users get the new version on their next visit
after the new service worker installs (usually the second load).

## Single-file build

```bash
npm run build
```

This writes `dist/gym-app.html` (about 780 KB): the whole app in one file, with fonts, data and GSAP
inlined. It runs when opened from disk in a desktop browser (Chrome, Edge, Firefox, Safari on macOS).
It has no service worker; it does not need one.

On phones, use the hosted URL instead. iOS previews local HTML files without running them properly,
and Android does not reliably keep the data (localStorage) of local files.

Data is stored per browser and per address: the hosted app, the local server and the single file each
keep their own data. Move it with Settings → Export and Import.

## Your data

Everything stays in the browser's localStorage under one key (`gym-app`), with a `schemaVersion` and a
migration step for future versions. Settings → Export downloads `gym-data-YYYY-MM-DD.json`; Import
validates a file, previews the changes and offers Replace all or Merge (records matched by id, the
newer `updatedAt` wins). Home reminds you to export when the last backup is more than 14 days old.

## Data schema

All content lives in `data/`. Every id is kebab-case; every text field shown to users is `{en, id}`.

**`enums.json`**: the only valid ids for `groups` (the ten muscle groups used for weekly sets, with
`major`), `muscles` (each with its `group` and a daily-life description), `patterns` (movement
patterns), `equipment`, `levels`, `stress` (knee, lower-back, shoulder), `patternParams` (allowed
values for implement, position, grip, gait, tempo and prop), `goals`, `foodStates`, `foodTags`,
`foodSlots` and `mealTypes`. Every other file uses these ids.

**`exercises.json`**: 59 entries. `id`, `name`, `primary` and `secondary` muscles, `equipment` (every
setup it works with, plus `pull-up-bar` / `bands` as extra requirements), `pattern`, `patternParams`
(drive the animation), `level`, `stress` tags (filtered out by the injury setting), `bodyweight`,
`easier` / `harder` (progression links), `builds` and `role` (2-3 specific sentences each), `steps`,
`cues` (exactly 3), `mistakes`, `alternatives`.

**`warmups.json`**: warm-up drills and cool-down stretches: `id`, `kind` (warmup / cooldown),
`general` (used for every session), `groups` (muscle groups it prepares), `name`, `dose`, `how`.

**`foods.json`**: 81 foods **as eaten** (cooked rice, boiled chicken, fried tempeh). `id`, `name`,
`state`, `slots` (which meal slots it can fill), per 100 g `kcal`, `protein`, `carbs` (total
carbohydrate, fiber included, as in TKPI), `fat`, `fiber`, `portion {g, label, unit}` (`unit: true` =
counted in whole pieces), `price_idr` (rough estimate per 100 g, used only for budget mode), `tags`
(vegetarian, dairy, beef, seafood, egg, soy, nuts, gluten), `source` (`"TKPI <code>"` from Tabel
Komposisi Pangan Indonesia at panganku.org, or `"estimate"`) and `note` (why a value is an estimate).
Every food's kcal is within 10% of 4 × protein + 4 × carbs + 9 × fat. No pork or alcohol.

**`meal-templates.json`**: `menus`: each has `id`, `name`, `goals` and `meals`; each meal has a `type`,
a `name`, a one-line `prep` note and `items` `{slot, food, g}` with default grams. `nutrition.js`
scales protein-slot portions to the protein target and carb-slot portions to the calorie target, and
swaps foods a filter removes for the closest allowed food in the same slot.

**`glossary.json`**: 21 entries for the Learn section and the term popovers: `id`, `group`, `term`,
`aliases` per language (the words that get linked), `short` (popover text), `body` (paragraphs),
`example`, `related` ids.

**`i18n/en.json`, `i18n/id.json`**: interface strings, same keys in both files.

**Stored state** (`localStorage["gym-app"]`): `profile`, `settings`, `plan`, `activeSession`,
`queueIndex`, `nutrition` (slider, filters, swaps, hidden foods), and the record collections
`workouts`, `bodyweights`, `measurements`, `meals`, `notes`, `swaps`, `deloads`. Every record has `id`
and `updatedAt`; dates are local `YYYY-MM-DD`. The workout record is documented at the top of
`js/tracker.js`.

## Files beyond the planned structure

The app was built from a private build specification (CLAUDE.md, not in this repository) that lists a
minimum folder structure. These files were added on top of it:

| File | Purpose |
|---|---|
| `js/ui.js` | DOM helpers and shared component behaviour (icons, toast, sheet, confirm, popover, stepper, ring) |
| `js/contrast.js` | WCAG contrast math and the list of token pairs in use |
| `js/router.js` | Hash URL parsing, separate from app.js so tests can import it |
| `js/schema.js` | Validators for exercises.json, foods.json, meal-templates.json and glossary.json |
| `js/glossary.js` | Turns glossary terms on any page into popover buttons (Learn links) |
| `js/equipment.js` | Which exercises a setup (plus pull-up bar / bands) can do |
| `js/plans.js` | Keeps the stored plan in step with the profile; swaps, edited days, deload weeks |
| `js/figure-patterns.js` | Pose generators for the exercise figure, one per movement pattern and variant |
| `js/file-notice.js` | Shows server instructions when a page is opened from disk (file://) |
| `js/tests/*.js` | Test harness and suites loaded by tests.html |
| `data/warmups.json` | Warm-up drills and cool-down stretches, tagged by muscle group |
| `scripts/dev-server.mjs` | No-cache static server for development (`npm run dev`) |
| `scripts/precache.js` | Writes the service worker's file list and version (`npm run precache`) |
| `references/` | Your reference images for the redesign (inspiration only; not published, see `.gitignore`) |
| `.claude/launch.json` | Local preview server config for Claude Code |
| `.gitignore` | Keeps `node_modules/` and `dist/` out of the repository |

`/assets/figures/` from the planned structure does not exist: the exercise figure is drawn in code
(`js/figure-patterns.js` and `js/animations.js`), so there are no separate SVG part files.

## Before release

These need a person; see the "Not verified" lists in `BUILD-LOG.md`:

- Check `foods.json` against TKPI.
- A native speaker reads the Indonesian text.
- A coach reads the exercise and glossary content; a dietitian the nutrition rules and wording.
- Watch the exercise animations in motion (`figures.html` shows the key poses).
- Try the rest-timer sound, vibration and screen wake lock on a real phone.
