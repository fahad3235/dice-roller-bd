# Dice Roller BD

Offline bilingual (English / Bangla) tabletop dice roller for board-game nights,
Ludo, and Dungeons & Dragons. Quick dice, full dice notation, advantage /
disadvantage, saved presets, roll history with session stats, and JSON
export / import. No account, no network, no data leaves the device.

## Problem

Game nights in Bangladesh run on Ludo boards, carrom-adjacent tabletop games,
and a growing D&D scene — but the dice rollers people reach for are ad-filled
apps or websites that need the internet. Dice Roller BD is a tiny offline
tool that does the job properly: real notation (`2d6+3`, `4d6dl1`,
`2d20kh1`), honest advantage rules, and presets for the rolls you repeat
every session.

## Features

- **Quick dice** — d4 / d6 / d8 / d10 / d12 / d20 / d100 with + / - steppers
  into a roll pool, plus a -99..+99 modifier.
- **Dice notation** — parse and roll `2d6+3`, `4d6dl1` (drop lowest),
  `2d20kh1` / `2d20kl1` (keep highest / lowest), `d%` (percentile d100),
  `3d8-2`, with inline errors for bad notation, bad sides, or bad keep/drop.
- **Advantage / disadvantage** — for a single d20 roll, rolls twice and keeps
  the higher / lower. Ignored (with a visible note) for any other pool.
- **Result display** — every die face shown, dropped dice struck through,
  total, min-max range, and Critical Hit (natural 20) / Critical Fail
  (natural 1) badges.
- **Presets** — 4 built-in presets (Attack Roll d20+5, Fireball 8d6, Ability
  Score 4d6dl1, Initiative d20+2) plus your own saved presets; one tap rolls
  any preset.
- **Roll history + session stats** — last 30 rolls with faces and timestamps;
  roll count, average total, most common total, dice rolled by type.
- **Data portability** — JSON export / import with strict validation
  (wrong app, bad version, bad notation, out-of-range faces all rejected),
  typed-DELETE erase-all, localStorage persistence.
- **Bilingual** — English / Bangla toggle, persisted across reloads, with
  Bengali digits when Bangla is active.
- **Offline & responsive** — zero network requests; works at 390px mobile
  width with no horizontal overflow.

## Stack

- Plain HTML + CSS + JavaScript (no framework, no build step).
- `js/logic.js` — pure dice logic (parse / roll / stats / import validation),
  injectable RNG so tests are deterministic.
- `js/app.js` — UI, tabs, localStorage, i18n wiring.
- `js/i18n.js` — generated from `tools/gen_i18n.py` (Bengali as `\uXXXX`
  escapes so every shipped file stays pure ASCII).
- Tests: `node tests/logic.test.js` (unit) and `node tests/smoke.js`
  (headless-Chrome CDP smoke test).

## Prerequisites

Any modern browser. For the tests: Node.js 18+ and the cached headless
Chromium shell used by the smoke harness
(`~/.cache/ms-playwright/chromium_headless_shell-1187/`), or set
`CHROME_BIN` to another Chromium binary.

## Install / run

```sh
# Just open it — no install, no server needed:
open index.html
# or serve locally:
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Testing

```sh
node tests/logic.test.js   # 52 unit checks (parsing, rolls, crits, stats, import validation)
node tests/smoke.js        # 69 headless-Chrome checks (UI flows, presets, history,
                           # export/import, erase, Bangla toggle, 390px, zero network requests)
```

## Deployment

GitHub Pages (main branch, root). Live at
https://fahad3235.github.io/dice-roller-bd/

## Limitations

- Random numbers come from the device's `Math.random` — random enough for
  games, not for cryptography or gambling.
- Notation supports one dice group per roll (e.g. `2d6+3`), not mixed
  expressions like `2d6+1d4`.
- History keeps the last 30 rolls; presets are capped at 50.
- No multiplayer / shared rolls — everything is local to one device.

## Status

Factory run #307 (15:00 slot, 2026-11-11). 52/52 node unit checks and 69/69
headless-Chrome smoke checks green, 0 console/page errors. Published and
verified live.
