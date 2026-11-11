# dice-roller-bd — TEST RESULTS

Factory run #307 (15:00 slot, 2026-11-11). All tests run for real on this VM;
nothing here is invented.

## Node unit tests — 52/52 green

Command: `node tests/logic.test.js`

- Parsing (valid): 2d6+3, d20 (count defaults 1), 4d6dl1, 2d20kh1, 2d20kl1,
  d% = d100, 3d8-2 modifier, spaces + uppercase ` 2D6 + 3 `, 1d4, 20d6 max.
- Parsing (rejected): empty, 2d7 / 2d5 bad sides, 0d6, 21d6 over max,
  2d6kh2 keep-all, 2d6dl2 drop-all, 2d6+100 modifier, `hello`, `2d6+3+4`.
- Deterministic rolls (injected RNG): 2d6+3 with [0, 0.5] = 8, min/max 5-15;
  4d6dl1 with [0, 0.2, 0.5, 0.9] = 12 with exactly one dropped face;
  2d20kh1 = 19, 2d20kl1 = 3; d% with 0.99 = 100; 3d8-2 all ones = 1.
- Pool rolls: 2d6+3 = 8; advantage single d20 keeps 19; disadvantage keeps 3;
  advantage ignored (modeIgnored) on a mixed d6+d20 pool.
- Crits: natural 20 = crit, natural 1 = fumble, no crit on 2d20 or d6.
- formatNotation round-trips: 2d6+3, 4d6dl1, d20 -> 1d20.
- historyStats: count 3, avg 12, most common total 8, bySides d6=3 d20=1;
  empty history safe.
- Import validation: good payload accepted; wrong app, bad version, bad
  preset notation, out-of-range history face, null, and 51 presets rejected.

Repairs: none needed — all 52 passed on the first run.

## Headless-Chrome smoke tests — 69/69 green

Command: `node tests/smoke.js` (raw CDP, headless_shell-1187, file://)

- Load: title mentions Dice Roller, 7 quick-dice cards, pool empty message,
  Roll pool disabled when empty, 4 built-in presets, 7 guide items, empty
  result state.
- Quick dice: +2d6, chip shows 2d6, count reads x 2; deterministic pool roll
  2d6+3 = 8, range 5 - 15, 2 faces, history length 1.
- Notation: 4d6dl1 = 12 with one dropped face; crit badge on natural 20,
  fumble badge on natural 1.
- Advantage/disadvantage: single d20 advantage keeps 19, disadvantage keeps
  3; ignored note shown on a mixed pool.
- Validation: 2d7 error names sides; `hello` error; valid roll clears error.
- Presets: save "Test Fire" from last roll (5 cards), built-in badges (4),
  Fireball preset rolls from the presets tab (switches tab, fills 8d6, shows
  result); delete removes the saved preset (back to 4).
- History: stats rolls/avg/cards match recorded history (8+ rolls); clear
  history empties list and shows messages.
- Export/import: payload is dice-roller-bd v1, carries the preset; eraseAll
  empties presets+history; valid import restores; wrong-app import rejected
  with data intact; bad UI import shows error; good UI import succeeds.
- Erase: wrong word rejected with data intact; DELETE erases, success shown.
- Language: Bengali title, total in Bengali digits (8 -> 8 in Bengali digits),
  tab label in Bengali; persists after reload; back to EN.
- Footer mentions Math.random; 390px no horizontal overflow on all 4 tabs;
  zero non-file network requests; 0 console/page errors.

Repairs: 2 real app bugs found by the smoke test and fixed before publish —
(1) the page title had no data-i18n attribute so it never translated;
(2) switching language did not re-render the last result, so the total
stayed in Latin digits. Both fixed in app.js/index.html; re-run 69/69 green.

## Hand-verified spot checks (via deterministic test hooks)

- 2d6+3 with rng [0, 0.5] = 1 + 4 + 3 = 8 (unit + smoke agree).
- 4d6dl1 with rng [0, 0.2, 0.5, 0.9] = 1, 2, 4, 6, drop 1 = 12.
- Advantage d20 [0.1, 0.9] = 3 vs 19, keeps 19; disadvantage keeps 3.

## ASCII check

`grep -P '[^\x00-\x7F]'` over *.js/*.html/*.css returns zero matches outside
js/i18n.js (escaped) and tools/gen_i18n.py (the Bengali source of truth).
Bengali text in the UI comes only from escaped i18n strings.
