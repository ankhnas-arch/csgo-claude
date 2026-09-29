# Counter-Strike 2 — unofficial browser recreation (YouTube comparison demo)

A desktop-browser tactical FPS recreation of Counter-Strike 2's bomb-defusal mode on a compact, original Dust II-inspired map:
local 5v5 (you + 4 allied bots vs 5 enemy bots), buy phase and economy, four grenade types, bomb plant/defuse, round and
match scoring, defeat/victory and restart. Built with TypeScript, Vite, plain Three.js, DOM/CSS UI and Rapier physics.
Weapons and hands are authored in Blender (bpy scripts). **Not affiliated with Valve.** All assets are original.

## Run
```bash
cd app
npm install
npm run dev          # http://127.0.0.1:5173/  (desktop browser, mouse + keyboard)
npm run build        # production build to dist/
npm run preview      # serve dist/ at http://127.0.0.1:4173/
npm run typecheck    # tsc --noEmit
npm test             # vitest rules tests + headless bots-only integration match
```
Evidence harness (real keyboard/mouse input through Playwright against the preview build):
```bash
npm run build && npm run preview &                 # in one terminal
node tools/evidence/run.mjs --out=evidence/run-x   # all cases; or --cases=firing,scope_melee
node tools/evidence/matrix.mjs evidence/run-x      # regenerates ACCEPTANCE_MATRIX.md
```
URL parameters for testing: `?quality=low|medium|high` and `?scale=0.5` (render scale) override the saved settings.

## Controls
| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Look (pointer lock; click the canvas to capture) |
| Left click | Fire / knife slash |
| Right click | AWP scope (unscoped → 40° → 10° → unscoped) / knife stab |
| Space / Ctrl / Shift | Jump / crouch / walk |
| R / F | Reload / inspect |
| 1–5, wheel, Q | Select weapon (1 primary, 2 pistol, 3 knife, 4 grenades cycle, 5 bomb), previous weapon |
| G | Drop weapon / bomb |
| B | Buy menu (own spawn zone, freeze + 8 s) |
| E | Plant (attackers, in site) / defuse (defenders) / swap a weapon on the ground |
| Tab | Scoreboard (hold) |
| Esc | Pause / release the mouse |

## Match rules (shortened prototype rules — chosen demo values, not official)
First to 4 rounds, sides switch after 3 completed rounds; 12 s freeze/buy, 90 s round, 35 s bomb, 5 s result; plant 3.2 s,
defuse 10 s / 5 s with kit. Economy presets: Showcase ($3000 start) or Standard ($800 start). Source constants for
weapons/economy come from the public CS2 game files; see `research/GAMEPLAY_SPEC.md` for every rule, its source and its class.

## Project layout
- `src/sim` — rules, actors, weapons, combat, grenades, bomb, bots (no rendering)
- `src/physics` — Rapier world, colliders from the map data, raycasts
- `src/data` — weapons/economy/match/grenade constants and the map layout (`data/map/layout.ts`)
- `src/render` — Three.js scene, procedural materials, map builder, characters, effects, viewmodel
- `src/ui` — menu, buy grid, HUD, scoreboard, pause/settings, results (DOM/CSS)
- `src/audio` — procedural WebAudio sound design
- `tools/blender` — bpy scripts that regenerate the weapon .blend sources and GLBs; `assets-source/blender` — .blend files
- `tools/evidence` — Playwright acceptance harness and cases; `evidence/` — runs, screenshots, logs
- `research/` — GAMEPLAY_SPEC, WEAPON_REFERENCE_STUDY, MAP_LAYOUT, extracted source data

## Reports
`ACCEPTANCE_MATRIX.md`, `PLAYTEST_REPORT.md`, `VISUAL_COMPARISON.md`, `ASSET_MANIFEST.md`.
