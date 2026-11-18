# Build log

Per-phase record: files created or changed, decisions where CLAUDE.md was silent, and anything not working.

CLAUDE.md, mentioned throughout, is the build specification the app was made from. It is kept private and is
not in this repository.

## Environment (before phase 1)

- Node.js was not installed. Installed with `brew install node` (Node 26.13.1, npm 11.20.0) after the user approved it.
- Network available. Dependencies installed from npm: `gsap@3.15.1`, `@fontsource/montserrat@5.3.x`, `@fontsource/inter@5.3.x` (dev dependencies only). `esbuild` and `sharp` are added in phase 11, when they are needed.
- Local testing server: `python3 -m http.server 8417` (`.claude/launch.json`). Python's server lets the browser cache files, so after editing data files the browser sometimes served the old copy. Reload with the cache bypassed when that happens. The README will recommend `npx serve`.

## Phase 1: tokens, base CSS, components, styleguide, contrast, vendoring

Files: `package.json`, `scripts/vendor.js`, `vendor/gsap.min.js`, `fonts/*.woff2` (6 files), `css/tokens.css`, `css/base.css`, `css/components.css`, `css/animations.css`, `js/contrast.js`, `js/ui.js`, `styleguide.html`.

Decisions:
- **Extra tokens.** The spec's dark accent (#E0574D) and dark danger (#F97066) are too light for white text, so I added `--on-accent` and `--on-danger` (white in light, #111111 in dark). I also added `--scrim`, `--tap`, `--icon`, `--indicator`, `--focus-w`, `--rule-w/h`, `--grid-cell`, `--grid-dot`, `--content-max`, `--sidebar-w` and `--nav-h`.
- **Tabular figures.** I measured them in the browser (styleguide.html). Montserrat and Inter both honour `tnum`: "1111" and "8888" render at 112.0 px each with `tabular-nums`, against 64.8 and 107.0 px proportional. So `--font-num` is Montserrat. My first attempt, a byte-level check in Node, did not work and was discarded.
- **Contrast pairs.** The pairs in use are listed once in `js/contrast.js` (`PAIRS`, 31 pairs) and checked live for each theme in styleguide.html and tests.html.
- **Brand grid.** Built from CSS background layers: 1 px lines at 30% white plus dots at the intersections.
- **GSAP ease.** The motion token `cubic-bezier(0.2, 0, 0, 1)` has no exact GSAP equivalent without the CustomEase plugin. GSAP tweens use `expo.out`, the closest built-in curve. CSS transitions use the token directly.
- **Hard-coded sizes.** Some component geometry is still in px inside components.css: toggle 48×28, timer ring 200 px, sheet max-width 640 px, popover max-width 300 px, the checkmark stroke, and stat-tile minimum width 140 px. Moving each into a token seemed like noise. Say so if you want them as tokens.
- **Body map.** Only the fill-state styles and swatches exist so far (solid / hatch / idle + outline). The SVG body map itself is `bodymap.js` in phase 4.

## Phase 2: shell, routing, i18n, data, state, onboarding, tests skeleton

Files: `index.html`, `js/app.js`, `js/router.js`, `js/data.js`, `js/i18n.js`, `js/state.js`, `js/animations.js` (UI motion only), `js/views/onboarding.js`, `js/views/home.js`, `js/views/settings.js`, `js/views/pending.js`, `data/i18n/en.json`, `data/i18n/id.json`, `tests.html`, `js/tests/harness.js`, `js/tests/core.test.js`, `js/tests/contrast.test.js`.

Decisions:
- **Default language.** Indonesian if `navigator.language` starts with "id", otherwise English. You can switch on the welcome screen and in Settings.
- **Onboarding order:**
  1. Welcome (with a language toggle)
  2. Goal
  3. Days
  4. Experience
  5. Equipment
  6. Pull-up bar (skipped for full gym)
  7. Bands (skipped for full gym)
  8. Session length
  9. About you (sex, age, height, weight on one screen)
  10. Daily life
  11. Daily steps
  12. Areas to avoid
  13. Health check
- **Daily steps.** The steps step is optional. The spec's steps target ("current daily average + 2,000") needs the current average, but the onboarding field list had no such field.
- **Validation ranges.** Age 13 to 90 (under 18 is allowed; the nutrition guardrail handles it in phase 8), height 120 to 230 cm, weight 30 to 300 kg, steps 0 to 50,000.
- **Health check.** One yes/no answer per condition. Any "yes" shows the doctor notice and a required tick box.
- **Full gym.** Choosing it sets `pullupBar` and `bands` to true.
- **Draft.** The onboarding draft is kept in sessionStorage, so it survives a reload.
- **Profile edits.** Settings → Edit profile reopens onboarding prefilled (without the welcome screen). It ends with a confirmation sheet that names the changed fields and says whether the plan will be regenerated or only nutrition recalculated. It saves `state.profileChanged = {fields, at}` for the planner to act on. The regeneration itself arrives with `planner.js` in phase 4.
- **Storage.** Everything lives under one localStorage key `gym-app`, with `schemaVersion: 1`. Migration v0→v1 covers data saved before the version field existed.
- **Collections.** `workouts`, `bodyweights`, `measurements`, `meals`, `notes`, `swaps`, `deloads`. Each record has `id` (uuid) and `updatedAt` (ms).
- **Import and merge.** Import validates the file, then previews both Merge and Replace all as per-collection counts (new / changed / same / removed). Merge matches records by id and keeps the newer `updatedAt`; for profile and settings, the newer `updatedAt` wins.
- **Persistent storage.** `navigator.storage.persist()` is called once when onboarding finishes.
- **Pages not built yet.** Plan, Exercises, Nutrition, Progress and Learn show "This section is built in phase N" (`views/pending.js`), so every nav link works.
- **Home.** Shows the streak as 0 until logging exists (phase 6). The next-session card arrives in phase 4.
- **Animation fallback.** GSAP needs animation frames, and a hidden tab gets none. In the hidden test pane, an onboarding step stayed at opacity 0. `animations.js` now snaps to the end state if a tween has not finished 250 ms after its duration, so content is never left invisible.

## Phase 3: enums.json, exercises.json, schema validator

Files: `data/enums.json`, `data/exercises.json`, `js/schema.js`, `js/equipment.js`, `js/tests/data.test.js`.

Decisions:
- **Muscles.** 21 muscles mapped to the ten groups, each with a one-line daily-life description in both languages for the tappable body map. I added a `heart-lungs` entry with `group: null` as the primary target for cardio. Cardio sets never count toward the ten groups.
- **Major groups.** Chest, back, shoulders, quads, hamstrings and glutes are marked `major: true`, following the spec's priority list. Biceps, triceps, calves and core are not.
- **Pattern parameters.** `implement`, `position`, `grip`, `gait` and `tempo` (`dynamic` / `isometric`).
- **Library contents.** 59 exercises across all 19 patterns:
  - Full gym can use all 59, dumbbell setups 40, bodyweight setups 30.
  - 3 need a pull-up bar and 4 need bands.
  - 2 are cardio (jogging, brisk walk). Both use the jog/walk gait cycle, because the spec's cardio animation is a gait cycle; a bike would need a different pattern.
- **Wall Sit (added after a failed test).** With the knee filter on, no quad exercise was left at all, so the planner could not give quads (a major group) 4 weekly sets. I added Wall Sit (`squat` pattern, `tempo: isometric`, no stress tag). **Phase 5 needs:** the squat timeline must support a static hold when `tempo` is isometric.
- **Shoulder filter.** It removes every exercise with shoulders as primary. Shoulders still get sets as a secondary muscle from rows (rear delts, 0.5 per set), which the counting rule allows. **Phase 4 needs:** the planner must check whether that reaches 4 weekly sets in short sessions.
- **Band exercises.** They are `bodyweight: false`, because resistance comes from the band, and they have no load to double-progress. **Phase 4 needs:** the spec is silent on band progression; my proposal is to treat them like bodyweight exercises (rep range, then `harder`).
- **`harder` links can cross setups** (for example band lat pulldown → negative chin-up, which needs a bar). **Phase 4 needs:** the planner must check that the `harder` exercise is available before suggesting it.
- **Validator rules** (`js/schema.js`):
  - All ids exist in enums.json.
  - Exactly 3 cues; steps and mistakes have the same count in both languages.
  - `builds` is 2-3 sentences and at least 120 characters, with no hype words and no "in N days/weeks" promises.
  - No exercise shares a `builds` text, or a single `builds` sentence, with another.
  - Every alternative shares a primary group with the exercise.
  - Every group has a primary exercise in every setup (with and without the extras), every setup has cardio, and every pattern is used.
  - Negative tests confirm that it rejects broken entries.

Not verified / for human review:
- **Translation.** The Indonesian text (UI and exercises) was written by me, not reviewed by a native speaker.
- **Exercise content.** Exercise steps and stress tags have not been reviewed by a coach or physiotherapist.

## Test runs at the end of phases 1-3

- `tests.html`: **53 passed, 0 failed**, run in the in-app browser (Asia/Jakarta, UTC+7, so the 06:00 date test ran in the UTC+7 branch).
- `styleguide.html`: **62/62 contrast pairs pass** (31 pairs × 2 themes); tabular figures confirmed for both fonts.
- Onboarding was driven end to end in the browser:
  - Missing choices and out-of-range body data block Next.
  - A "yes" in the health check requires the tick box.
  - The profile saves and routes to Home.
  - Profile edit shows the confirmation with the changed field; language and theme switches apply.
- At 375 px width: no horizontal scroll, and every interactive element is at least 44 px tall (measured).
- Console errors: none from the app. The only 404 is the deliberate `does-not-exist.json` request in the loadData test.
- Not exercised through the UI:
  - The export download button and the import file picker (export/import logic is covered by unit tests).
  - The iOS install hint (needs an iOS device).
  - The reduced-motion path (verified by reading the code only).
  - GSAP tweens running visibly (the test pane was hidden, so animation frames were paused).

## Phase 4: planner, body map, plan views, coverage, planner tests

Files created: `js/planner.js`, `js/plans.js`, `js/bodymap.js`, `js/views/plan.js`, `data/warmups.json`, `js/tests/plan-checks.js`, `js/tests/planner.test.js`, `scripts/dev-server.mjs`.

Files changed:
- `js/app.js` (plan route), `js/views/home.js` (next-session card), `tests.html`.
- `css/components.css` (body map, tabs, calendar, session cards).
- `data/i18n/en.json` and `id.json` (plan, coverage and "why" text).
- `data/exercises.json` (Sliding Leg Curl is now beginner level, with a hips-down version in its steps).
- `.claude/launch.json` now uses the no-cache dev server.

How the planner works (`js/planner.js`, pure function `generatePlan(profile, data, opts)`):
- **Sessions are made of slots.** Each slot is an ordered list of exercises, and the first one the user can do is used. A user can do an exercise if it fits their equipment and level and carries no selected injury tag.
  - **Main-lift slots** fall back across movement patterns, so every session keeps a main lift.
  - **Accessory slots** stay empty with a stated reason when nothing fits. The reason comes from the options that fit the equipment (injury, then level, then already used); "equipment" is used only when no option fits the equipment at all.
- **Set allocation runs in four passes:**
  1. Fit every session in the time limit, cutting accessories from the lowest priority up. Priority, highest first: chest, back, quads, hamstrings, glutes, shoulders, then biceps, triceps, calves, core.
  2. Bring every group to or under the top of the goal range.
  3. Grow toward the level target (beginner = bottom of the range, intermediate = middle, advanced = 75% of the way up).
  4. Lift every major group to at least 4 weekly sets. This pass may trim lower-priority work, including main lifts down to 2 sets, but never pushes another major group below 4. If an attempt fails, it puts back what it trimmed.
- **Set limits per exercise:** main lift 3 sets to start (2 to 5); accessories 2 to start (2 to 4).
- **Time estimate:** 40 s plus the midpoint of the rest per working set, 6 min warm-up, 5 min cool-down, and 90 s per ramp-up set.

Decisions where CLAUDE.md was silent:
- **Counting rule.** A set counts once per muscle group: two primary muscles in the same group (lats and upper back) give 1 back set, not 2.
- **Major groups** (4+ weekly sets): chest, back, shoulders, quads, hamstrings, glutes.
- **Ramp-up sets.** Only on weighted main lifts: 2 sets for beginners (50%, 75%), 3 for others (50%, 70%, 85%). Bodyweight and band main lifts get none.
- **RIR.** Beginners 2-3 on every set. Others 2-3 on main lifts and 1-2 on accessories.
- **Get stronger, accessory rest:** 90-120 s (the spec only gives main-lift rest).
- **Rep ranges for other exercise types.** Band exercises use 8-20 reps, like bodyweight (the proposal from phase 3). Holds are in seconds: plank and side plank 20-45 s, wall sit 30-60 s.
- **Beginners on 5 or 6 days** get the plan they asked for, a warning, and a "Switch to the 4-day plan" button.
- **3-day split.** Push/Pull/Legs is offered only to intermediate and advanced lifters, with the once-a-week note.
- **Cardio.**
  - How many sessions: build muscle 1 (optional), lose fat 3, recomposition 2, get stronger 1 (optional), general fitness 3.
  - Each session is 20-30 min. It goes on non-lifting days first, then after the last lifting sessions.
  - Jogging for moderate cardio from intermediate up without the knee filter; brisk walk otherwise.
- **Steps target** is shown for Lose fat only: average + 2,000, capped at 10,000, and never below the current average. Without an average, the rule is shown instead of a number.
- **Default training days** (Monday = 0):
  - 2 days: Monday and Thursday.
  - 3 days: Monday, Wednesday, Friday.
  - 4 days: Monday, Tuesday, Thursday, Friday.
  - 5 days: Monday, Tuesday, Wednesday, Friday, Saturday.
  - 6 days: Monday to Saturday.

  You can edit them; sessions still run as a queue.
- **Why a group is under its range.** The Coverage view gives one of three reasons:
  - **time limit:** a session that could hold another set for that group is full.
  - **limited by available exercises:** its exercises are at their set limit, or more sets would push another group past the top of the range.
  - **no exercise available:** nothing the user can do trains it.

  For "time limit", the claim that one more day or 15 more minutes would close the gap is checked by generating those plans, not assumed.
- **Hamstring slot fallback.** The hamstring slot in full-body and lower days falls back to leg curls when every hinge is filtered. Without this, 2-day full-body plans with the lower-back filter left hamstrings under 4 sets.
- **Main-lift fallback text.** When a main lift falls back to another pattern, "Today builds" describes the session from the muscles it actually trains and says why the main lift changed (a filtered area, or equipment and level), instead of the template sentence.
- **Swaps.** Stored per session template and slot. When the profile changes, swaps that no longer fit are removed and a notice says so; valid swaps are kept. Swap options are the slot's own list plus the exercise's `alternatives`, filtered the same way.
- **Deload.**
  - `deloadSession`: same exercises and loads, half the sets (rounded up), RIR 4-5.
  - `deloadSuggestion`: an e1RM drop in 2 consecutive sessions for anyone. Intermediate and advanced users also get an offer 8 weeks after the first plan or last deload; beginners never do.
  - The Plan page shows the offer and an active deload week, which halves the sets shown. The e1RM signal has no logged data until phase 6.
- **`progression()` is ready for phase 6.** It returns +2.5 kg upper / +5 kg lower, the dumbbell "extend the range by 3 when the jump is over 10%" rule (dumbbell jump 1 kg under 10 kg, 2 kg otherwise), and for bodyweight the `harder` exercise if the user can do it, else a 3 s lowering phase.
- **Home** shows the next session in the queue (`state.queueIndex`, advanced by session mode in phase 6).
- **Body map.** Geometric front/back figure; 21 muscles drawn, mirrored left/right. Exercise mode: solid / hatched / idle. Coverage mode: hatched / solid ink / solid accent, with a labelled table. An interactive mode (focusable buttons with the daily-life line) is ready for exercise pages in phase 5.
- **Dev server.** Python's server let the browser serve stale modules (seen twice). `scripts/dev-server.mjs` sends `Cache-Control: no-store`.

Bugs the matrix found and fixed while building:
- When freeing time, the floor pass checked only primary groups; it now checks secondary contributions too.
- The floor pass did not trim main lifts, could not trade a weaker contributor for a stronger one, and did not restore trimmed sets after a failed attempt.
- No beginner home exercise trained hamstrings directly with the lower-back filter (fixed with the Sliding Leg Curl level change).

Test runs (phase 4):
- **Node:** `generatePlan` over all 3,600 profiles plus the Push/Pull/Legs variant for 3-day profiles: **0 failing plans**, about 2.6 s.
- **tests.html: 91 passed, 0 failed**, run in the in-app browser. Includes:
  - Acceptance criterion 1 over 3,600+ plans.
  - 7 negative tests proving the plan checker catches each broken rule.
  - Splits, rep ranges, RIR, ramp-ups, the counting rule, duration math, filters and empty-slot reasons, main-lift fallback, swaps, under-target reasons, cardio placement, steps, deload, e1RM, progression, and the body map.
- **styleguide.html:** 62/62 contrast pairs still pass.
- **Browser, driven by hand:**
  - Home next-session card; Plan Week, Coverage and Why in English and Indonesian.
  - Swap through the sheet (kept after a session-length change; removed with a notice after switching to bodyweight).
  - Edit days through the sheet (cardio moved to the new rest days).
  - At 375 px: no horizontal scroll and no tap target under 44 px on any plan page.
- **Console:** no app errors; the only 404 is the deliberate missing-file test.

Not verified / open:
- Start and end of a deload week through the UI: the 8-week offer can't appear yet on a fresh plan. The transform and the offer rule are unit-tested.
- "Switch to the 4-day plan": the button exists, but the beginner 5/6-day warning case was not driven in the UI. The warning itself is unit-tested.
- Exercise links in session cards go to the phase-5 placeholder page.
- Text quality of the new Indonesian strings (no native-speaker review).

### Follow-up after phase 4 review

- **Problem.** Opening `tests.html` by double-clicking it (`file://`) left the header on "Running…". Browsers block ES modules and `fetch` for files opened from disk, so no script ran.
- **Fix.** Added `js/file-notice.js`, a classic script included in index.html, tests.html and styleguide.html. On `file://` it replaces the page with the command to start the local server and the link to open. Over http it does nothing.
- **README** run instructions now use `node scripts/dev-server.mjs` and list the three review URLs.
- **Verified:**
  - The notice logic, by running the script in Node with a simulated `file:` page (notice shown, correct command and link) and an `http:` page (no notice).
  - tests.html over the server: 91 passed, 0 failed. styleguide.html: 62/62.
- **Not verified:** the notice in a real browser opened from disk. The in-app browser renders local files as static snapshots without running scripts.

## Redesign exploration (before phase 5)

You asked to drop the grid lines, move from red to a calmer but sporty colour, and fix dark-mode readability. No app styles are changed yet; this is a comparison page.

- **Dark-mode problems measured in the current design:**
  - Black key word on red: 3.98:1, reads like a hole in the block.
  - Untrained muscles vs the body-map figure: 1.26:1.
  - Cards vs page: 1.09:1, with borders at 1.43:1.
  - Selected onboarding answers turn into a dark box on the coloured block.
- **New files:**
  - `design-options.html` and `js/design-options.js`.
  - Four palettes: Petrol and lime, Track navy and sky, Indigo and mint, and the current red cleaned up.
  - Each is shown as phone previews (onboarding question, Home header and next-session card, a session row) in light and dark.
- **Changes shared by every option:**
  - No grid.
  - A light key word (new token `--key`) instead of black.
  - A new `--figure-base` token, with re-tuned untrained-muscle colours for the body map.
  - Visible card borders.
  - Selected answers in white with text in the block colour.
- **Checks:**
  - Every option passes all 31 WCAG pairs from `js/contrast.js` (with the key word checked at 4.5:1 instead of the black key word's 3:1).
  - It also passes 5 readability targets of mine: untrained muscle vs figure ≥ 1.6, untrained muscle vs card ≥ 2, trained vs untrained ≥ 3, card border ≥ 1.4, and block-colour text on white ≥ 4.5.
  - Verified in Node and live in the browser: 36/36 for all 8 theme variants, no console errors, no horizontal scroll at 375 px.
- **Dev server:** my preview server now uses port 8427 (`.claude/launch.json`), so it no longer blocks the user's server on 8417.
- **Next step:** after you choose, apply the palette to `css/tokens.css` and the brand styles, update the Design system section of CLAUDE.md, rerun styleguide.html and tests.html, then delete the comparison files.

### Redesign round 2: two directions from your references

You picked two of the four reference images in `references/`: Voran and Built To Move (the others were Build in Bits and Write it). You also asked to drop Inter. They became two directions on `design-options.html`:

- **Forge** (from Voran): dark-first charcoal with molten orange; the light theme keeps dark header blocks.
- **Utility** (from Built To Move): light-first warm grey, black and safety orange, with outlined panels and a thin hazard stripe on header blocks.

The first-round palettes moved to `js/design-options-earlier.js` and sit collapsed at the bottom of the page.

- **Fonts:**
  - Installed as dev dependencies (all OFL-1.1): `@fontsource/big-shoulders-stencil-display`, `big-shoulders-display`, `barlow`, `barlow-condensed`, `anton` and `jetbrains-mono`. Big Shoulders Display is installed but no longer used, after the tabular-figures check below.
  - **Forge:** Big Shoulders Stencil Display for headlines, Barlow Condensed for labels and numbers, Barlow for body text.
  - **Utility:** Anton for headlines, JetBrains Mono for labels and numbers, Barlow for body text.
  - The preview loads the fonts from `node_modules`; the chosen set will be copied into `/fonts` by `scripts/vendor.js` when the design is applied.
- **Tabular-figures check (run in the browser):** Big Shoulders Display and Anton have **no** tabular figures, so a ticking timer or a column of weights would shift sideways. Numbers therefore use Barlow Condensed (Forge) and JetBrains Mono (Utility), which do. The display faces are for headlines only.
- **New tokens:** `--on-key` (text on a key-coloured button), `--btn-border`, `--font-label`, `--display-weight`, `--label-weight`, `--label-tracking` and `--card-border-w`, on top of round 1's `--key` and `--figure-base`.
- **Two contrast changes:**
  - On header blocks the main button is orange with dark text. A black button would be invisible on Forge's dark block.
  - The button's page boundary is now checked through `--btn-border`. Utility's light theme uses a black outline because orange alone was 2.8:1 against the page.
- **Checks:** 37/37 contrast pairs pass for both directions in light and dark, in Node and live in the browser. The earlier palettes still pass 36/36. No horizontal scroll at 375 px.
- **Bugs fixed on the comparison page:**
  - Font names in double quotes inside a `style=""` attribute cut the attribute short, so no direction fonts were applied.
  - The body font was set one level too high, so previews kept Inter.
  - The tabular-figures check measured fallback fonts before the real ones had loaded.
- **When a direction is chosen:**
  - Replace Montserrat and Inter in `tokens.css`, `base.css` and `scripts/vendor.js`.
  - Add the new tokens and drop the grid.
  - Update the Design system and Typography sections of CLAUDE.md, since its rule about Montserrat's tabular figures changes.
  - Rerun styleguide.html and tests.html, then delete the comparison files.

## Redesign applied: Utility (before phase 5)

You chose the Utility direction (from the Built To Move reference) and asked to drop Inter.

- **Fonts:**
  - Bundled now: Anton 400 (headlines), JetBrains Mono 500/700 (labels, buttons, badges and all numbers) and Barlow 400/500/600 (body).
  - `scripts/vendor.js` copies them into `/fonts`. Montserrat and Inter are removed from `/fonts` and from `package.json`, along with the fonts that were only used for comparing designs.
  - Dev dependencies are now gsap, `@fontsource/anton`, `@fontsource/jetbrains-mono` and `@fontsource/barlow`.
- **`css/tokens.css`:**
  - New light and dark colour values.
  - New tokens: `--key`, `--on-key`, `--btn-border`, `--figure-base`, `--font-label`, `--display-weight`, `--label-weight`, `--card-border-w`, `--stripe-h` and `--stripe-w`.
  - Removed: `--on-brand-strong`, `--brand-grid`, `--grid-cell` and `--grid-dot`.
  - Radius is 2 px, and there are no shadows (outlined, flat panels).
- **`css/base.css`:**
  - New font faces.
  - Headlines are uppercase Anton; labels use the label font.
  - Big numbers use JetBrains Mono, because Anton has no tabular figures.
  - Header blocks lose the grid and gain the hazard stripe, and their padding makes room for it.
- **`css/components.css`:**
  - Buttons: monospace uppercase; main buttons are orange with a black outline; on header blocks they are orange with dark text.
  - Cards and stat tiles have 2 px outlines.
  - Selected onboarding answers are a light fill with a check mark, in both themes.
  - The onboarding progress bar is orange.
  - The body map uses `--figure-base`.
- **`js/contrast.js`:**
  - Black key-word pair replaced by: key word on block (4.5:1), dark text on the orange button, the selected answer, and the button outline on the page.
  - Added four readability targets: untrained muscle vs figure, untrained muscle vs card, trained vs untrained muscle, and panel outline vs card.
  - 37 pairs per theme in total.
- **`js/tests/contrast.test.js`:** red-specific checks replaced by three Utility rules: the button orange is a fill and fails as text (text uses `--accent`), main buttons need the black outline in light, and `--font-num` is never Anton.
- **Other updated files:**
  - `styleguide.html`: tokens list, typography labels, and a tabular-figures probe for the new fonts that waits for them to load.
  - `index.html`: theme colour is #141414.
- **CLAUDE.md** is updated to match:
  - The font line in Technical constraints.
  - The Design system section: visual direction, colour table, chart series, contrast rules (with ratios) and body map states.
  - Typography, and radius/shadow.
- **Removed:** the comparison page and its data files. `references/` stays, as your inspiration folder.
- **Verified in the browser:**
  - tests.html: 92 passed, 0 failed.
  - styleguide.html: 74/74 contrast checks (37 per theme). Tabular figures: JetBrains Mono yes, Barlow yes, Anton no (expected; never used for numbers).
  - The app (onboarding, Home, Plan week, coverage and why, Settings): new fonts and colours in light and dark, no horizontal scroll and no tap target under 44 px at 375 px, no console errors.

## Phase 5: figure, IK, timelines, figures.html, exercise pages, animation tests

Files created:
- `js/figure-patterns.js`, `figures.html`, `js/views/exercises.js`, `js/views/exercise.js`.
- `js/tests/figure-checks.js` and `js/tests/animation.test.js`.

Files changed:
- `js/animations.js` (IK, solver, renderer, timeline) and `js/app.js` (routes, page title).
- `css/components.css` (figure, library, exercise page) and `tests.html` (loads GSAP and the new suite).
- `data/exercises.json` and `data/enums.json` (new `prop` parameter).
- `data/i18n/en.json` and `id.json`, `README.md`.

How the figure works:
- **Skeleton.** Head, neck, torso, pelvis, upper and lower arms, thighs, shins and feet are drawn as separate round-capped segments between computed joints. Near limbs are solid; far limbs are faded.
- **Colours.** Flat two-tone: `--ink` for the body, `--accent` for the segments that carry the exercise's primary muscles.
- **Views.** Side view faces right. Lateral raise and chest fly use a front view.
- **Pose generation.** `figure-patterns.js` has one generator per movement pattern, with variants chosen from `patternParams` (54 variants for 59 exercises). Each returns controls for phase p: 0 = start/top, 1 = end of the lowering phase.
- **IK.** A two-bone IK (`ik()` in `animations.js`) places knees and elbows from the targeted hand and ankle positions. Because a fixed contact is a fixed target, feet and hands do not slide.
- **Equipment** is drawn as simple shapes: barbell plate, dumbbell, bench, incline bench, pull-up bar, machine seats and pads, cable and pulley, band, door frame, step, counter, wall, chair and towel.
- **Timeline.** `buildTimeline()` is the one GSAP timeline per pattern: p 0 → 1 over 2 s (lowering), 1 → 0 over 1 s, then a 0.5 s pause, looping. `TEMPO` is defined once in `animations.js`.
- **Holds** (plank, side plank, wall sit) show a still pose.
- **Playback.** Play/pause and 0.5×/1× speed controls are on the exercise page.
- **Reduced motion** (or GSAP missing): the start and end poses are shown side by side, with a note and the step list.

Decisions where CLAUDE.md was silent:
- **New `prop` parameter.** Added to `patternParams` in `enums.json` (floor, bench, chair, step, wall, door-frame, counter, bars, towel) and set on 17 exercises. Exercises sharing a pattern then get the right equipment: bench dip vs parallel-bar dip, reverse lunge vs Bulgarian split squat, and so on. Single-Leg Glute Bridge's position changed from `lying` to `single-leg`.
- **Cardio.** It loops a continuous gait cycle (walk 1.1 s, jog 0.8 s per stride) instead of the 2/1/0.5 s tempo, which only fits lifts.
- **Elbow side.** The bending side is declared per pattern (`elbowSign`) from my visual review of the contact sheet, then guarded by the tests. Knees use an independent rule: the knee stays on the toe side of the hip-ankle line.
- **Fixed contacts.** These are declared per pattern (feet, hands, back, or a machine pivot). The sliding leg curl's heel is a floor contact fixed in height only.
- **Exercise page.**
  - Alternatives can be swapped into every plan slot that uses the current exercise, after a confirmation that names those sessions. Only allowed alternatives get the button.
  - History reads `state.workouts[].exercises[] = { exerciseId, sets: [{ reps, kg }] }`. **Phase 6 needs:** session mode must write that shape.
  - "How muscles grow" is a short in-page summary until the Learn section exists (phase 10).
- **Library.** Search covers names and muscle names in both languages. Filters are muscle group (primary muscles only), equipment and movement, plus "only exercises I can do" (on by default when there is a profile). Filters are kept for the browser session.

Fixes found by the checks and the visual review:
- **Deadlift and Romanian deadlift:** the bar path was a straight line while the shoulders swing, so mid-movement the arms could not reach the bar. The bar now hangs from the shoulders.
- **Leg curl machine:** the knee bent the wrong way, leaving the machine pivot.
- **Straight-body moves** (push-ups, planks, doorway row and similar) had bent knees. They now use nearly the full leg length.
- **Bench and incline press:** the elbows pointed up at the bottom; they now drop below the bench line. The incline bench was also tilted the wrong way.
- **Dips:** the legs stuck forward (looked like sitting); they now hang down.
- **Side plank:** the free arm was hidden behind the body; it is now drawn on the near side with the hand on the hip.
- **Doorframe curl:** the body barely leaned back; it now leans further.

Test runs (phase 5):
- **Node:** `checkFigure` over all 59 exercises gives **0 problems**. Each exercise is sampled at 20 points for reach, knee and elbow flexion 0–150°, knee over toes, elbow side, fixed contacts under 2 px and grips within 2 px.
- **tests.html: 116 passed, 0 failed** (in-app browser). New tests cover:
  - Acceptance criterion 2 for every exercise.
  - 6 negative cases (sliding foot, hand off bar, out-of-reach target, wrong elbow side, knee away from toes, flexion over 150°).
  - The IK helper.
  - Timeline timing: p = 0 / 0.5 / 1 / 0.5 / 0 / 0 at 0 / 1 / 2 / 2.5 / 3 / 3.4 s, total 3.5 s.
  - Hold and cycle durations, the speed and pause controls, and the reduced-motion static poses.
  - The library filter.
- **figures.html:** 54 variants, 0 check failures. I reviewed all 54 rows (light theme) by eye and fixed the problems listed above.
- **styleguide.html:** still 74/74 contrast checks.
- **Browser:**
  - Exercise pages for squat, bench press, lateral raise, plank, walk and pull-up render the animated figure, alternatives and muscles.
  - Library search and filters return the expected counts.
  - At 375 px: no horizontal scroll and no control under 44 px.
  - No failed resources on a clean load.

Not verified / known limits:
- **The animation itself** has not been watched in motion here. The test pane is hidden, so animation frames are paused. Timing is checked by seeking the timeline, and every pose along the path by the 20-point sampling.
- **Reduced motion** was tested by passing the option directly; I could not switch the OS setting.
- **Side plank and doorframe curl** are compromises of a 2D side view. The side plank still looks close to a plank in profile.
- **Body map tap targets:** some muscles (for example brachialis) are smaller than 44 px. The muscle list under the map is the full-size, keyboard-accessible alternative.
- **The dark theme** of `figures.html` was rendered but not reviewed row by row; only the light theme was.

## Phase 6: session mode, rest timer, logging, PR detection

Files created:
- `js/session.js` (session logic as plain functions) and `js/tracker.js` (history, PRs, e1RM history, volume, streak).
- `js/views/session.js` (session screen and summary) and `js/tests/session.test.js`.

Files changed:
- `js/app.js` (session route and title), `js/views/home.js` (Start/Resume session button, real streak), `js/views/plan.js` (the deload offer now uses the logged e1RM history).
- `css/components.css` (set rows, rest bar, PR items, scrolling exercise strip).
- `data/i18n/en.json` and `id.json`, `tests.html`, `README.md`.

How it works:
- **Queue.** Home shows the next session in the queue with "Start session", or "Resume session" while one is open. `state.queueIndex` advances only when a session is finished (saved), so a missed day never skips a session. Discarding a session leaves the queue where it was.
- **One exercise at a time.** Each exercise shows:
  - the animated figure, the target (sets × reps, RIR, rest), and advice;
  - ramp-up sets with their weights once a working load is known;
  - working sets with reps (or seconds), load (weighted exercises only) and RIR.

  An exercise strip (scrolling on phones) lets you jump between exercises. Previous, Next, Skip (with undo) and "Swap for today" are available; a swap does not change the plan.
- **Prefill:**
  - First time on an exercise: no load and the "Start light" message. The logged sets become the baseline.
  - Afterwards: the progression rule (`planner.progression`) applied to the last logged sets. That means +2.5 kg upper / +5 kg lower, the dumbbell "extend the range by 3" rule, or more reps at the same load.
  - Bodyweight exercises at the top of the range offer "Use {harder} from now on" (a plan swap) or a 3-second lowering phase.
  - The load entered on one set carries forward to the sets not logged yet.
- **Rest timer.** It starts automatically after each logged set, at the middle of the prescribed rest range rounded to 15 s, with +30 s and Skip rest buttons. Remaining rest and elapsed time are always computed from timestamps (`rest.endsAt`, `startedAt`), so they stay correct when the phone locks or the page reloads. At zero it beeps (Web Audio, no sound file) if Sound is on, and vibrates if Vibration is on (both in Settings).
- **Wake lock.** The screen wake lock is requested while the session screen is open and re-requested when the page becomes visible again, where the browser supports it.
- **Persistence.** The active session is saved to state after every change, so a reload resumes the same exercise, logged sets and rest timer.
- **Finishing.**
  - Finish (or End → Save) writes a workout record and shows the summary: duration, volume (kg × reps), sets, reps, PRs, skipped exercises and the next session.
  - The record shape is documented at the top of `tracker.js`; the exercise page's history reads it.
  - Exercises with no logged set are stored as skipped.
- **PRs:**
  - Weighted exercises: heaviest load, most reps at a load used before, and best estimated 1RM (Epley, 1–10 reps only).
  - Bodyweight, band and timed exercises: most reps (or seconds).
  - The first time an exercise is logged sets the baseline and is not a PR.
  - The summary lists the PRs with a brief, non-blocking pop animation.
- **Streak.** Consecutive Monday-to-Sunday weeks in which the planned number of sessions was logged. The current week counts once it is complete, and it never breaks the streak while it is in progress.
- **Deload.** The two-consecutive-drop e1RM signal now uses real data (`tracker.e1rmHistory`).

Decisions where CLAUDE.md was silent:
- The rest timer uses the middle of the rest range.
- No PR on the first log of an exercise.
- "Swap for today" only changes the session; "Use {harder}" changes the plan.
- The session date is the local date at the start (`localDate`), so a 06:00 session in UTC+7 lands on its own day.

Test runs (phase 6):
- **Node walk-through:** two Upper A sessions. The 06:00 local start is dated 2026-11-17; after 4 × 10 at 60 kg the next prefill is 62.5 kg; a heavier set is flagged as a "heaviest" PR; an 8-rep set with a lower e1RM is correctly not an e1RM PR; the queue advances.
- **tests.html: 139 passed, 0 failed** (in-app browser). 23 new tests cover:
  - Session creation from the queue, first-time prefill and the 06:00 UTC+7 date.
  - The rest timer and elapsed time from timestamps.
  - Surviving a reload (active session and saved workout read back from storage).
  - Skip and swap (plan unchanged), finish (record, queue, volume, skipped), the record shape read by the exercise page, and progression to +2.5 kg / add reps.
  - Discard keeping the queue, and deload halving sets with RIR 4+.
  - PR rules (baseline, heaviest, reps at load, e1RM 1–10 only, bodyweight reps only).
  - The e1RM history triggering the deload rule, Monday week starts, and the streak.

  One failure on the first run was a wrong date in my test (23 November 2026 is a Monday); the test was corrected and the code was unchanged.
- **Browser session through the real UI:**
  - Start → log a set → the rest timer starts at 2:30 and ramp-up weights appear (20 kg = 50% of 40 kg).
  - **Reload → same exercise, the logged set kept, rest continuing at 2:22, elapsed time continuing.**
  - Skip rest → log the remaining sets → Next → swap the row for today (the plan's swaps stay empty) → skip an exercise → jump to the last one → Finish.
  - The summary shows duration, volume 1,120 kg, sets, skipped exercises and "Next: Lower A"; the queue moved to 1.
  - The bench press page's history shows "17 November 2026 · 40 kg × 10 · 4 sets".
- **Phone width (375 px):** no horizontal scroll, every control at least 44 px, every input labelled. The page title is "Session".

Not verified / known limits:
- **The beep, the vibration and the wake lock** were not heard, felt or observed here: there is no audio output, no vibration motor and the pane was hidden. The code paths ran without errors.
- **Progress views** (acceptance 5's "open Progress") come in phase 9. For now the logged data is visible on Home (streak), the exercise pages and the summary.
- **On a phone, the working sets** start just below the first screen (after the figure and the ramp-up sets); you scroll to them.
- **Manual workout entry** (logging without session mode) is part of the tracker in phase 9.


## Phase 7: foods and meal templates

Files created:
- `data/foods.json`: 81 foods, 53 with values from TKPI and 28 estimates.
- `data/meal-templates.json`: 10 daily menus.
- `js/tests/food.test.js`: 23 tests.

Files changed:
- `data/enums.json`: added `foodStates`, `foodTags`, `foodSlots` and `mealTypes`.
- `js/schema.js`: added `validateFoods`, `validateMealTemplates`, `menuTotals` and `kcalDeviation`.
- `tests.html`: loads the new suite.
- `README.md`: status and the food data schema.

Where the values come from:
- **TKPI** (Tabel Komposisi Pangan Indonesia) at panganku.org. I downloaded the list of all 5,288 entries and read the detail page of each food I chose. `source` holds the TKPI code, for example `"TKPI FP0122"` for boiled chicken breast. I did not fill in any TKPI values from memory.
- **Estimates** (`source: "estimate"`, each with a `note` saying why):
  - 3 foods have no TKPI entry: whey protein, peanut butter, and fried catfish (TKPI only has raw and smoked catfish).
  - 25 low-calorie foods have TKPI entries whose macros are rounded to whole grams, so they fail the kcal check. Cucumber, for example, is listed as 8 kcal with 0 g protein and 1 g carbohydrate. These are most vegetables, five fruits, skim milk, yoghurt, soy milk, plain tofu, egg white, shrimp, squid and sweet corn.
  - For these I used typical published values with one decimal, and computed kcal from the macros. Each note gives the TKPI code and its kcal so a reviewer can compare. The difference is a few kcal per 100 g.

Decisions where CLAUDE.md was silent or conflicted:
- **Cooked rice is 180 kcal per 100 g**, the TKPI AP0001 value. CLAUDE.md says "about 130 kcal". TKPI's entry lists 56% water, drier than typical cooked rice (about 68% water, about 130 kcal). I followed the instruction to use TKPI. Decision (user, 17 November 2026): keep the TKPI value of 180 kcal. Brown rice (TKPI AP0005) is 149 kcal.
- **Boiled beef** uses TKPI FP0402, "daging sapi rendah lemak, rebus" (209 kcal, 41 g protein). The generic "Daging sapi, rebus" entry (FP0446) is 482 kcal with 39 g fat, which reads like a fatty cut.
- **Tempeh, steamed** uses the values for unfried tempeh (CP0077, listed as raw).
- `carbs` is total carbohydrate with fiber included, as in TKPI. The kcal check is 4P + 4C + 9F, exactly as CLAUDE.md writes it.
- **Extra fields:**
  - `slots`: which template slots a food can fill, used for swaps and filters.
  - `portion.unit`: counted in whole pieces (eggs, bread slices, fruit) for the rounding rule.
  - `note`.
- `price_idr` is a rough market estimate per 100 g as eaten (2026, Java city prices). It is only used to sort foods in budget mode.
- **Peanuts are tagged `nuts`**, so the no-nuts filter removes them. Oats are tagged `gluten`, because most brands are processed alongside wheat.
- **Meal templates:**
  - 10 menus: 8 with 3 meals and 2 with 4 meals.
  - The menus cover 6 to 10 goals each way: lose fat 7, recomposition 9, build muscle 9, get stronger 9, general fitness 10.
  - Default portions give 1,400–2,200 kcal. Phase 8 scales them to each user's targets.
  - Each day has at least 300 g of vegetables and 2 fruit portions at the default portions.
  - A fourth meal type, "afternoon", was added for 4-meal days.

Test runs (phase 7):
- **Generator check (Python):** all 81 foods within 10% of 4P + 4C + 9F. In the TKPI download, 26 of the candidate entries failed that check, all low-calorie foods with macros rounded to whole grams. 25 of them became estimates; for fresh milk (JR0006) I used UHT milk (JP0056) instead, which passes.
- **tests.html: 162 passed, 0 failed** (in-app browser). The 23 new tests cover:
  - The schema and enums.
  - Acceptance criterion 4 (kcal vs macros).
  - TKPI codes on rice and chicken.
  - That more than 60% of foods come from TKPI and every estimate has a note.
  - That every filter leaves foods for every slot.
  - That every menu validates (slots, 3–4 meals plus 1–2 snacks, prep notes, 300 g of vegetables, 2 fruit, 5+ menus per goal).
  - Sensible default day totals.
  - 15 negative cases, one per rule (kcal mismatch, pork, alcohol, unknown tag, vegetarian beef, bad source, estimate without a note, fewer than 60 foods, unknown food, wrong slot, too few vegetables, one fruit, no snack, under 5 menus per goal, missing prep note).
- The first run had 1 failure: my own "macros over 100 g" rule added fiber on top of carbs, which already include it, so peanut butter was flagged. I fixed the rule; the data was unchanged.
- The console shows only the expected 404 from the loader test (`data/does-not-exist.json`) and the vibrate notice from the session tests.

Not verified / known limits:
- **No person has checked the food values against TKPI yet.** CLAUDE.md requires this before release.
- **Prices** are my estimates and have not been checked against a market.
- **Indonesian names and preparation notes** have not been reviewed by a native speaker.
- **Nothing shows food in the app yet.** The nutrition pages come in phase 8.

## Phase 8: nutrition

Files created:
- `js/nutrition.js`: BMR, TDEE, calorie target and guardrails, macros, weight-trend checks, and meal-plan assembly (filters, substitutes, swaps, scaling, rounding, protein fallback).
- `js/views/nutrition.js`: the nutrition pages.
- `js/tests/nutrition.test.js`: 28 tests.

Files changed:
- `js/app.js`: the Nutrition route now opens the real page.
- `js/state.js`: `nutrition` preferences in the default state; Merge import keeps the newer copy.
- `data/i18n/en.json`, `data/i18n/id.json`: all nutrition strings.
- `css/components.css`: formula text, swap list, meal and week tables.
- `tests.html`, `README.md`.

What the pages do:
- **Disclaimer:** shown once before the first nutrition screen, with a tick box. Every nutrition page links back to it.
- **Day tab:**
  - Targets against the day's totals, with a "within range" or "outside range" label and icon (never colour alone).
  - Each meal shows foods in grams, whole pieces where they apply, kcal and protein, plus the preparation note.
  - A Swap button on every food lists similar foods; "Never show" hides a food everywhere.
  - A weigh-in form and the trend offers (fast loss, calibration, profile weight). `?date=` shows any day.
- **Week tab:** seven days, Monday to Sunday. Menus rotate by date, so two days in a row never repeat.
- **Targets tab:** every formula with the user's own numbers (BMR, activity factor, TDEE ±10% range, target, protein, fat, carbs). It also has the calorie slider, limited to the goal's range, which is the only manual control.
- **Filters tab:** vegetarian, no beef, dairy, seafood, egg or nuts, budget mode, hidden foods, and clearing swaps.

Decisions where CLAUDE.md was silent:
- **Slider range for General fitness:** CLAUDE.md lists four slider ranges for five goals. General fitness shares Get stronger's 0 to +5%.
- **Under-18 guardrail:** applies only to a deficit. An under-18 user on Build muscle keeps the surplus; any deficit goal gets maintenance with the slider locked.
- **"Deficit"** means the target is more than 1% under TDEE. Without that margin, rounding to 10 kcal made maintenance count as a deficit and switched protein to 2.2 g/kg; the first Node run caught this.
- **Accepted weight-check changes** are stored as a separate kcal offset, shown on the Targets tab with a "Remove that change" button. The slider stays the only manual control.
- **Calibration rules:**
  - The trend is a least-squares slope over the last 14 days; 1 kg is counted as 7,700 kcal.
  - It offers a change only when the gap is 100 kcal a day or more; the change is that gap rounded to 50 kcal, between 100 and 200.
  - It is not offered again within 14 days of the last answer.
- **Scaling** (CLAUDE.md gives the order but not the limits):
  - Vegetables and fruit keep their template portions.
  - Protein foods scale between 0.3× and 300 g; dry foods such as whey go up to 2× their portion.
  - Carb foods scale between 0.25× and 4×. Fat foods move only when carbs reach a limit.
  - Then portions are rounded (5 g, or whole pieces) and nudged in 5 g steps back inside the tolerances.
- **Leaner swap (my addition):** when a day is over its calories at the protein target, the protein food with the least protein per kcal is replaced by a leaner one of the same kind first. For example fried tempeh becomes steamed tempeh, and scrambled egg becomes boiled egg. These items show a "Leaner" badge. Without this, the 1,300–1,590 kcal profiles failed 209 of 808 days.
- **Protein fallback has two triggers:**
  - The CLAUDE.md case, where the target needs more than 300 g of a protein food in a meal.
  - A second case I added, where the filters only leave foods too fatty to fit the protein target in the calories.
  - Both lower protein to 1.6 g/kg for that day and say why.
- **Substitutes** prefer a food not already used that day. In the first browser check, vegetarian mode turned both beef and milkfish into boiled soybeans.
- **Budget mode:** a default food is replaced only by a similar food (distance under 4) that costs at least 20% less per gram of protein (protein slot) or per kcal. Swap lists put the cheapest of the 5 most similar foods first.
- **The Day tab also has a weigh-in form**, because calibration and the fast-loss check need weigh-ins. The full weight log with charts, editing and deleting is phase 9.

Test runs (phase 8):
- **Node walk-through (acceptance 3), before writing the browser tests:** 12 profiles from 1,300 to 3,500 kcal × 8 filters (none, each of the 5 tags, vegetarian, budget) × every menu for the goal. That is **808 days: 0 failures, 28 using the protein fallback**.
  - The first runs failed 250 and then 209 days, all at low calories, which led to the leaner swap.
- **Combined filters (extra stress test, beyond acceptance 3):** vegan-like, vegetarian plus budget, no nuts plus no seafood plus budget, and five exclusions at once. **9 of 404 days miss.** Eight are a plant-only diet at 1,300 or 1,590 kcal (tofu and tempeh carry too much fat for the protein target even at 1.6 g/kg); one is no nuts plus no seafood plus budget at 1,870 kcal. The Day and Week tabs mark those days with a warning and say why.
- **tests.html: 190 passed, 0 failed** (in-app browser). The 28 new tests cover:
  - BMR, the activity factor and TDEE.
  - Goal defaults and clamping the slider to its range.
  - All three guardrails: under 18, low BMI (and not on Build muscle), the BMR floor with the smaller deficit reported, and fast loss (detected, slow loss ignored, Lose fat only).
  - Macros: deficit protein, BMI over 30, and carbs under 100 g (fat lowered first, then protein, both listed).
  - Calibration: waits for 14 days and 10 weigh-ins, lowers when the weight stays flat, on track, raises, no repeat within 14 days. Also the 2 kg profile-weight check.
  - **Acceptance 3:** the profiles span exactly 1,300 and 3,500 kcal; every day is within 5% of calories and 10 g of protein, or reports the fallback with the right numbers.
  - Meal counts and preparation notes; rounding and the 300 g cap; filters never leak a tagged food; never-show, swaps, alternatives and budget cost.
  - Menu rotation and Monday weeks; and the nutrition preferences surviving a Merge import.
- **Browser, through the real UI:**
  - The disclaimer blocks until ticked.
  - The day was 2,045 / 2,050 kcal and 104 / 104 g protein. I checked the Targets numbers by hand (BMR 1,286.5 × 1.45 = 1,865; × 1.1 = 2,052, rounded to 2,050).
  - Swapping oats for white bread was saved and re-scaled.
  - Vegetarian stayed within range.
  - A weigh-in of 57.4 kg was saved and shown.
  - In Indonesian at 375 px: no horizontal scroll, every input labelled, every control at least 44 px (week links fixed to 44 px), "kkal" localised, no missing-string warnings.
  - The only console error was the loader test's deliberate 404.

Not verified / known limits:
- **Combined filters** at low calorie targets can leave a day outside the tolerances; the page shows a warning and suggests a swap or a looser filter.
- **Low-calorie, high-protein days** can look unusual, for example 300 g of steamed tofu twice a day or several egg whites, because 2.2 g/kg in a deficit is a lot of protein for 1,300 kcal.
- **Fat** is not a target in the meal plan (CLAUDE.md sets tolerances for calories and protein only), so a day's fat can be 10–15 g under the macro target.
- **Phone navigation:** the Indonesian labels make the bottom navigation wider than 375 px. It scrolls sideways (as designed in phase 2), but "Pengaturan" starts off-screen.
- **Not reviewed by people:** the nutrition wording in Indonesian (native speaker) and the formulas and guardrail wording (dietitian).
- **Glossary popovers** for TDEE, BMR and macros come in phase 10.

## Phase 9: progress and charts

You told me to run phases 9 to 11 without stopping for review between them.

Files created:
- `js/charts.js`: hand-written SVG line, bar and heatmap charts, and a figure wrapper with a data-table toggle.
- `js/views/progress.js`: the Progress pages.
- `js/tests/progress.test.js`: 16 tests.

Files changed:
- `js/tracker.js`: weekly sets from logs, training days, adherence, weight trend, e1RM series, all PRs, manual workouts.
- `js/app.js`: the Progress route now opens the real page.
- i18n (en and id): all Progress strings.
- `css/components.css`: chart styles. Also a shared rule that gives bare inputs, selects and textareas inside a `.field` the same 44 px, bordered look as `.input-wrap`.
- `js/views/nutrition.js`: the disclaimer link is now a 44 px button.
- `tests.html`, `README.md`.

What the pages do:
- **Overview:**
  - Streak, sessions this week and total workouts.
  - Sessions per week for the last 8 weeks, with weeks below the plan hatched and a mark at the planned count.
  - A training-day heatmap for the last 16 weeks: filled square = trained, outlined = not, today outlined in orange.
  - Every PR, newest first.
- **Body:** a weight chart (daily points and a 7-day average line), measurements (waist, chest, upper arm) on one chart with different markers and dashes, and forms plus lists to add, edit and delete both.
- **Lifts:** an estimated-1RM trend for any weighted lift, and weekly sets per muscle group against the plan's sets, with previous and next week. It uses the same counting rule as the planner.
- **Log:** all workouts (edit, delete, "Log a workout" by hand), the meal-plan check-off (followed, partly or not) for today with the last 14 days, and notes.
- **Workout editor** (`#/progress/workout/<id|new>`): date, duration, exercises with sets (reps, load, RIR), add and remove sets or exercises, and a note.
- **Charts:** every chart has `role="img"` with a title and description, a legend, and a "Show data table" button. Series differ by marker shape and dash pattern, and bars by hatching, never by colour alone.

Decisions where CLAUDE.md was silent:
- **PRs are recomputed from the full history** when the list is shown, not read from the PRs saved at the end of a session. Editing or deleting an old workout therefore updates the list. The record's own `prs` field is kept for the session summary.
- **Editing a session workout** keeps its session fields (template, start time, targets) and replaces the date, sets and note. Manual workouts start at 12:00 on their date.
- **One weigh-in per date:** saving a date that already has one replaces it (the same rule as the Nutrition weigh-in).
- **Weekly sets vs the plan** marks the plan's sets for each group. The goal range is given in the note under the chart.
- **Measurements** are optional individually, but at least one is required per entry.

Test runs (phase 9):
- **tests.html: 205 passed, 0 failed** before the marker fix below, 206 after (in-app browser). The 16 new tests cover:
  - Logged weekly sets equal the planner's `countSets`, and skipped exercises are left out.
  - Training days, adherence and the 7-day average (checked against hand-computed values).
  - The e1RM series (116.7 and 121 kg).
  - PRs change when an earlier workout is edited, and the lift list order.
  - The manual workout shape and volume.
  - **Acceptance 5:** a 06:00 local workout keeps its date after a storage reload.
  - Edit and delete for weights, measurements, meal check-offs and notes.
  - Chart markup: title and description references, marker counts, dashes, hatch pattern, target marks, heatmap cells, the table toggle with `aria-expanded`, and rounded axes.
- **Browser, through the real UI (acceptance 5):**
  - I logged a back squat by hand (8 × 60 kg, then 7 × 60 kg). "Add a set" copied the previous set.
  - After a reload, Progress showed it in the Log, in this week's count (2 / 4), on the heatmap and in weekly sets (quads 2), and the squat appeared in the e1RM lift list.
  - With 22 sample weigh-ins added to my preview browser, the weight chart drew points, the average line and axis labels correctly.
  - The first screenshot showed an under-plan bar drawn solid: the CSS fill overrode the hatch pattern. I fixed it (inline style) and checked it again in a zoomed screenshot.
  - Delete went through the real confirm dialog, and editing a note updated it in place.
- **Phone width (375 px), all Progress pages including the editor:**
  - No horizontal scroll, and every input labelled.
  - The first audit found date fields, selects and the reps/RIR inputs under 44 px. The shared `.field` rule fixed them, and the re-audit found none.
  - The same audit caught the Nutrition disclaimer link; it is now a 44 px button.
- **Console:**
  - The first check found a real bug: the diamond marker on the measurement chart produced invalid path data, because coordinates arrived as text and `x + 4.5` joined them ("52.0" + 4.5 = "52.04.5"). I fixed it and added a regression test.
  - tests.html then showed **206 passed, 0 failed**.
  - A fresh tab across Body, Overview, Lifts, Log, Nutrition, Plan, Exercises and Home showed **no console messages**.

Not verified / known limits:
- **Dialogs in the hidden preview pane:** a dialog's `close` event only fired once the browser drew a frame (I forced one with a screenshot). Real browsers draw frames, so users are not affected, but anyone automating the app in a hidden window will see dialogs that seem not to answer.
- **Chart look:** I checked the weight chart, the adherence bars and the heatmap by screenshot, and the measurement and e1RM charts only by their markup, not by eye.
- **Logging a cardio exercise** in the manual editor needs a "reps" value (use minutes). There is no separate duration field per exercise.

## Phase 10: glossary, Learn and term popovers

Files created:
- `data/glossary.json`: 21 entries.
- `js/glossary.js`: term linking and popovers.
- `js/views/learn.js`: the Learn pages.
- `js/tests/glossary.test.js`: 12 tests.

Files changed:
- `js/app.js`: loads the glossary, routes Learn, links terms after every render (and, via a debounced MutationObserver, after content a view adds later).
- `js/schema.js`: `validateGlossary`.
- `js/views/exercise.js`, `plan.js`, `home.js`: a "How muscles grow" link in every "What this builds" / "Today builds" section.
- i18n (en and id): the `learn` strings and a new growth note; the unused `pending` strings removed.
- `css/components.css`: Learn list styles.
- `tests.html`, `README.md`.

Files removed:
- `js/views/pending.js`: every section is now built.

Content:
- **The 19 terms CLAUDE.md lists** (some combined, as CLAUDE.md groups them: sets/reps, compound vs isolation, deficit/surplus, the split types):
  - **Training and plan:** progressive overload, sets and reps, RIR, RPE, ramp-up sets, rest periods, deload, compound vs isolation, training volume and set counting, warm-up, training splits, why the plan changes with days per week.
  - **Nutrition:** TDEE, BMR, calorie deficit and surplus, macros, protein timing.
  - **Recovery:** sleep and recovery, DOMS.
- **Two more entries:**
  - "How muscles grow", the growth mechanism Section 2 of CLAUDE.md asks for, featured first in Learn.
  - "Estimated 1RM", used on the Progress pages.
- **Each entry has** a short answer (used in the popover), 2–4 paragraphs, a worked example with numbers, and related entries, in both languages.
- **Indonesian keeps the technical term in English** with an explanation in brackets on first use, for example "RIR (reps in reserve, sisa repetisi)".
- **The worked examples match the app's own rules and data.** I checked the arithmetic (BMR, TDEE, e1RM, the macro split) and the set counting against exercises.json. Two examples were wrong in my first draft and were fixed: the push-up also counts 0.5 for core, and 80 × 8 vs 90 × 4 estimate 101 vs 102 kg.

How linking works:
- After each render, the first mention of each term on the page (aliases per language, longest first, whole words only, all-caps acronyms case-sensitive) becomes a `<button class="term">`.
- It never links inside links, buttons, form controls, headings, header blocks, charts, dialogs or `[data-no-terms]`. The Learn pages themselves are excluded.
- Tapping a term opens a popover with the summary and "Read more in Learn". Escape or an outside tap closes it.

Decisions where CLAUDE.md was silent:
- **Only the first mention per page is linked**, so pages do not fill up with underlines.
- **Two aliases were dropped** because they would link the wrong thing: "volume" (the session summary's "total volume" is kg lifted, not sets) and "training days" / "hari latihan" (too generic).
- **Header blocks are skipped**, but small labels inside cards are not. This is why "TDEE" and "BMR" on the Targets page link; the first version skipped every label and missed them.
- **Term buttons are inline in sentences**, so they are shorter than 44 px. WCAG 2.2 (2.5.8) exempts inline targets in text; every other control stays at 44 px.

Test runs (phase 10):
- **tests.html: 218 passed, 0 failed** (in-app browser). The 12 new tests cover:
  - The glossary schema, the required terms, English terms kept in Indonesian, and the validator catching a duplicate alias and a dangling link.
  - **Linking:** first mention only; whole words ("XRIR", "RIRs", lowercase "rir" and "TDEEs" are not linked, "BMR" is); never inside a link, button, label, h1, header or `[data-no-terms]`; Indonesian aliases; a second run adds nothing; the button's attributes and the popover's Learn link.
  - Learn index and every entry page in both languages (title, paragraphs, example, related links).
  - The growth links in the exercise, plan and home views.
- **Browser:**
  - Terms linked on Plan (warm-up, reps, RIR, ramp-up sets, weekly sets), Why this plan, Session, the exercise page, Progress → Lifts (estimated 1RM, weekly sets) and Nutrition → Targets (BMR, TDEE, macros), in English and in Indonesian (pemanasan, repetisi, RIR, ramp-up, Makro, tidur, pemulihan).
  - The RIR popover showed its summary and Learn link with `aria-expanded` and `aria-controls` set; Escape closed it.
  - Learn search for "rir" found RIR, RPE and Deload.
  - At 375 px no horizontal scroll and no controls under 44 px on Learn and the exercise page. No console errors besides the loader test's deliberate 404.

Not verified / known limits:
- **Focus return after Escape** could not be checked: the test tab never had window focus (`document.hasFocus()` was false, and even a direct `focus()` did nothing). The code returns focus to the term (ui.js, from phase 1). Check by hand: tab to a term, press Enter, then Escape.
- **Review by people:** the glossary text in Indonesian needs a native speaker, and the training and nutrition explanations a qualified coach.

## Phase 11: offline, icons, single-file build, README, acceptance run

Files created:
- `manifest.webmanifest`.
- `sw.js`: service worker.
- `scripts/precache.js`: writes the service worker's file list and a content-hash version; `--check` fails when sw.js is stale.
- `icons/icon.svg`: hand-written source.
- `icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`: generated by `scripts/make-icons.js` with sharp.
- `build-single.js`: esbuild bundle, fonts as base64, all data inlined.
- `dist/gym-app.html`: generated, 778 KB.
- `js/tests/pwa.test.js`: 7 tests.
- `.gitignore`: node_modules and dist.

Files changed:
- `index.html`: manifest, icons, `mobile-web-app-capable` and Apple meta tags.
- `js/app.js`:
  - Registers the service worker, except in the single-file build and on `file://`.
  - Term linking is now throttled instead of debounced and ignores SVG changes (see below).
- `tests.html`, `styleguide.html`, `figures.html`: icon link.
- `package.json`: esbuild and sharp dev dependencies, and scripts (vendor, icons, precache, build, dev).
- `README.md`: rewritten in full (setup, running locally, deploying to GitHub Pages, the single-file build and phones, your data, the full data schema, extra files, before-release checks).

Decisions:
- **Service worker strategy:**
  - **Hosted:** cache first, so pages are fast and work offline.
  - **On localhost:** network first with the cache as fallback, so development never shows stale files and offline still works.
  - **Updates:** the cache name is a hash of every precached file, so any change installs a new cache and deletes the old one.
- **The precache list is generated**, not hand-kept: 56 files (index, manifest, css, js without tests, data, fonts, vendor, icons). `tests.html` checks that every module reachable from `js/app.js` is on it.
- **Maskable icon:** the artwork without the bottom hazard stripe. A launcher's crop would leave the stripe floating as a band (seen in the first render). The barbell sits inside the safe circle: its farthest corner is 184 px from the centre, against a 205 px radius.
- **Single-file build:**
  - It is an IIFE bundle, and every `data/**/*.json` file becomes `<script type="application/json" id="data-NAME">`, which `loadData()` already reads.
  - In JSON every `<` is escaped as `<`; in JS and CSS `</script` and `</style` are escaped.
  - `file-notice.js` is left out, since this version is meant to open from disk.
- **`/assets/figures/` does not exist.** The CLAUDE.md tree lists it, but since phase 5 the exercise figure is drawn in code (`figure-patterns.js` and `animations.js`). I did not add unused SVG files to fill the folder. This was not recorded in phase 5; the README now says so.
- **No git repository exists**, so the README's GitHub Pages steps start with `git init`. Nothing was pushed or published.

Bugs found by running things in this phase:
- **The single-file build broke the glossary.** I first inserted the bundle with `String.replace(target, string)`, which expands `$&` inside the replacement. The bundled glossary code contains `'\\$&'`, so every `$&` became `</body>` and the term matcher threw a SyntaxError. The headless run caught it. Function replacers now insert the content literally, and the build checks the inlined scripts are unchanged.
- **Term popovers never appeared on exercise pages in a real browser.** The animated figure redraws its SVG every frame, which kept restarting the 60 ms debounce. In the hidden preview pane nothing animates, so phase 10's checks passed; the headless run showed 0 terms on the push-up page. Linking now runs at most every 60 ms and ignores SVG changes, and the push-up page shows its terms (2).
- **Two small console items:** a `favicon.ico` 404 on the test pages (fixed with icon links), and Chrome's warning that the Apple meta tag needs the standard `mobile-web-app-capable` tag (added).

### Full acceptance run (18 November 2026)

How it was run:
- **tests.html: 225 passed, 0 failed**, in headless Chrome with a fresh profile, and the same in the in-app browser.
- **A headless Chrome sweep** driven over the DevTools protocol against the dev server, with a fresh profile:
  - Onboarding through the real buttons, then all 21 routes (Home, the 3 Plan tabs, the library, 2 exercise pages, session, the 5 Nutrition pages, the 5 Progress pages, the workout editor, 2 Learn pages, Settings).
  - **Zero console errors or warnings**, no unlabelled inputs, selects or textareas, no SVG image or button without a name, and no horizontal scroll.
- **A second headless run** opened `dist/gym-app.html` from disk.
- **Offline** was checked in the in-app browser with the server stopped.

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Plans for all 900 combinations, plus each single injury flag | Verified by running | tests.html: "3,600 profiles (900 combinations x no injury + each single injury), plus Push/Pull/Legs for 3 days: every rule holds" PASS. |
| 2 | Every exercise validates; its pattern passes the joint and contact checks | Verified by running | tests.html: exercises.json schema suites and "every exercise passes the joint and contact checks at 20 sample points" PASS (59 exercises). |
| 3 | 12 profiles from 1,300 to 3,500 kcal × every filter within tolerance or the fallback reported; guardrails trigger | Verified by running | tests.html: profiles span exactly 1,300 and 3,500 kcal; 808 days within 5% kcal and 10 g protein (28 with the fallback, reported with the right numbers); under-18, low-BMI and below-BMR guardrails PASS. |
| 4 | Every food passes the kcal vs macros check | Verified by running | tests.html: "acceptance 4: every food kcal is within 10% of 4P + 4C + 9F" PASS (81 foods). |
| 5 | Logged workout survives a reload and shows in Progress; 06:00 local (UTC+7) on the right date | Verified by running | tests.html: three acceptance 5 tests PASS. In-app browser (phase 9): hand-logged squat visible in Progress after a reload. |
| 6 | Export then Replace all restores identical data; Merge keeps the newer record | Verified by running | tests.html: "Replace all on a cleared app restores identical data" and "Merge keeps the newer record…" PASS. |
| 7 | Works offline after the first load | Verified by running | In-app browser, server stopped: localhost (network-first) loaded Home, Plan, an exercise with GSAP, Nutrition, Progress, Learn and Settings with fonts. `gym.localhost` (cache-first, a fresh origin) generated a plan, nutrition targets, Learn and the animated figure from the cache alone. tests.html precache tests PASS. |
| 8 | `node build-single.js` makes `dist/gym-app.html`, which runs from disk on desktop | Verified by running | `node build-single.js` printed "778 KB, 8 data files inlined". Headless Chrome from `file://`: onboarding through the UI, the profile kept after a reload, 11 pages including the figure and charts, a weigh-in saved; zero console errors, no service worker. |
| 9 | No console errors, labels on all inputs, reduced motion respected | Verified by running | Sweep above: zero console messages, every control labelled. Reduced motion emulated: two static poses ("Start", "End") with an explanatory note, controls hidden, no timeline running. Normal: one animated figure, controls visible, timelines running. |
| 10 | Non-generic `builds` and `role` in both languages; no shared `builds` sentence | Verified by running (rules) and by reading (quality) | tests.html: "no two exercises share the same builds text (en or id)", the shared-sentence and hype-word validators PASS. Whether each text is specific was judged by reading in phase 3; it still needs a coach and a native speaker. |
| 11 | Styleguide shows all tokens and components in both themes; every text/background pair passes | Verified by running | styleguide.html: "74/74 pairs pass across both themes". |

Not verified / known limits (whole project):
- **Physical devices:** not tested on a real phone. Installing to the home screen, iOS Safari storage behaviour, the rest-timer sound and vibration, and the screen wake lock all need a person with a phone. The code paths ran without errors in desktop Chrome.
- **Browsers:** only Chromium-based browsers were used (the in-app browser and headless Chrome). Firefox and Safari were not run.
- **The GitHub Pages deployment** itself was not done (no repository; nothing is published without your go-ahead). Offline behaviour of the hosted strategy was checked on `gym.localhost` instead.
- **Review by people:** food values against TKPI, prices, all Indonesian text, exercise and glossary content (coach), and nutrition wording (dietitian). See the README's "Before release" list.
- **Focus return** after closing a popover or dialog with Escape could not be observed (the test window never had focus); the code is in `ui.js`.

## Fix after review: invisible Sex options in onboarding (18 November 2026)

You reported that on the "About you" step the Male / Female options could not be read until you tapped one.

- **Cause:** `.brand .field label { color: var(--on-brand) }` was meant for a field's own label on the dark onboarding panel. It also matched the option labels inside the segmented control, which has a light background. The result was light text on a light control: "Male" measured 1.05:1. The Yes/No switches on the health-check step had the same problem.
- **Fix** (`css/components.css`): the rule now only targets a field's own label and hint (`.brand .field > label`, `> .label`, `> .hint`). The options inherit the control's dark text again.
- **Why the earlier checks missed it:** the contrast suite checks token pairs (for example `--ink` on `--surface`), not the colours the cascade actually gives each element.
- **New check:**
  - `auditContrast(root)` in `js/contrast.js` measures every visible text against the background it actually sits on, using computed styles.
  - `tests.html` now renders onboarding-style controls on the dark panel in both themes and audits them.
  - A further test feeds the audit light text on a light control and confirms it is reported.
  - With the old rule injected, the audit reports "Male 1.05:1"; with the fix, nothing.
- **Runs:**
  - tests.html: **228 passed, 0 failed**.
  - A headless Chrome audit of all 12 onboarding states (including the health-check warning) and 21 app pages, in light and dark: **0 failures**, no console messages.
  - A screenshot of "About you" shows both options readable.
- `sw.js` was refreshed and `dist/gym-app.html` rebuilt.
