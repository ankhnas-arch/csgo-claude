# GAMEPLAY_SPEC — Counter-Strike 2 bomb-defusal rules as implemented in this recreation

**Edition / mode / era pinned:** Counter-Strike 2 (Source 2), Competitive bomb-defusal (5v5), game data as of the
SteamDatabase `GameTracking-CS2` mirror commit `3fc98e763328f7d1627405b389d1b6b69c5b0e38` (2026-09-25), fetched 2026-09-28.
Visual references are older (limited test March 2023, release September 2023, April 2024); where visuals and current data
disagree, **current data wins for rules and the reference images win for looks**.

## Evidence classes used in this document
| Class | Meaning |
|---|---|
| **S (verified source fact)** | Read directly from an official game data file opened in this session (`scripts/weapons.vdata`, `cfg/gamemode_competitive.cfg`, `scripts/items/items_game.txt`). Extracts are saved in `research/weapons_vdata_extract.md` and `research/gamemode_competitive.cfg`. |
| **V (version-sensitive evidence)** | Community documentation retrieved through web search summaries (the search tool returned page excerpts; the pages themselves could not be opened because the sandbox egress proxy blocks those hosts). Numbers may lag the current patch. |
| **A (intentional adaptation)** | A deliberate demo/prototype choice, labelled in the UI ("Shortened prototype rules") and never presented as official. |
| **U (unresolved)** | Could not be established; a configurable value is used and labelled. |

Direct access limitations (recorded honestly): `counterstrike.fandom.com`, `liquipedia.net`, `developer.valvesoftware.com`,
`totalcsgo.com`, `steamcommunity.com`, `csdb.gg`, `cs2apps.com`, YouTube and Steam CDNs were all blocked by the egress
policy. `raw.githubusercontent.com` and `git clone` of GitHub worked, which is how the official game files were obtained.
**No gameplay footage could be viewed**; animation timings are therefore adaptations (class A/U), not observed facts.

## 1. Match structure
| Rule | Observed | Source | Implementation | Class | Acceptance test |
|---|---|---|---|---|---|
| Round time | `mp_roundtime_defuse 1.92` min = 115 s | gamemode_competitive.cfg | Demo 90 s (`DEMO_RULES.roundTime`) | S→A | HUD clock starts at 1:30 in live; timeout at 0:00 gives CT the round (`rules.test.ts`) |
| Freeze time | `mp_freezetime 15` | cfg | Demo 12 s | S→A | Players cannot translate during freeze; clock counts 0:12→0:00 |
| Buy time | `mp_buytime 20` (includes freeze) | cfg | Freeze + 8 s of live, in own spawn rect only (`mp_buy_anywhere 0`) | S→A | Buying after 8 s live is refused with "Buy time has expired" |
| C4 timer | 40 s (convar default `mp_c4timer`, not overridden in cfg) | V (community, multiple guides) | Demo 35 s | V→A | Planted → explodes after 35 s unless defused |
| Plant time | 3.2 s | V | 3.2 s | V | Holding E in site for 3.2 s plants; releasing resets |
| Defuse time | 10 s / 5 s with kit | V | 10 s / 5 s | V | Measured in `Defuse` acceptance case |
| Kit price | 400 | items_game.txt `item_defuser` | 400, CT only | S | Buy test |
| Rounds / halftime | MR12 (`mp_maxrounds 24`, `mp_halftime 1`) | cfg | Demo first-to-4, switch after 3 completed rounds | S→A | `rules.test.ts` side switch |
| Win-panel time | `mp_win_panel_display_time 3` | cfg | Demo 5 s result | S→A | Round result band visible ≈5 s |
| Respawn | `mp_respawn_on_death_t/ct 0` | cfg | No mid-round respawn; dead players spectate teammates | S | Death test |
| Friendly fire | `mp_friendlyfire 1` | cfg | Enabled at 33 % damage (adaptation; official uses full damage with penalties) | S→A | — |
| Start money | `mp_startmoney 800`, `mp_maxmoney 16000` | cfg | Standard preset 800; **Showcase preset 3000 (demo)** selectable in setup | S / A | Setup screen labels both |
| Default weapons | `mp_t_default_secondary weapon_glock`, `mp_ct_default_secondary weapon_hkp2000` (the USP-S is the `weapon_usp_silencer` loadout replacement of the P2000) | cfg + items_game | T Glock-18, CT USP-S, knife | S / A (USP-S chosen over P2000 for recognisability) | — |

## 2. Round-end resolution (ordered, single winner)
Implemented in `src/sim/match.ts::resolveRound`, executed once per tick after damage and objective progress:
1. Bomb planted: defused → **CT**; timer ≤ 0 → explode → **T**; all CT dead → **T (elimination)**; all T dead → *round continues* (CT must defuse).
2. Not planted: all T dead → **CT**; all CT dead → **T**; round clock expired → **CT (timeout)**.
3. A plant attempt that completes in the same tick as the last elimination is rejected (`plantComplete` returns false once `roundEnded`). Exactly one score and one payout per round (tested).
Class: V for the rules (community-documented, consistent across sources), S for `mp_default_team_winner_no_objective -1` (no default winner without objective: CT wins on time because the T objective failed — this is the standard bomb-mode reading).

## 3. Economy
| Rule | Value | Source | Class |
|---|---|---|---|
| Win by elimination / time | $3250 | V (Refrag, CSDB, ProSettings) | V |
| Win by defuse / explosion | $3500 | V | V |
| Loss bonus ladder | 1400 + 500×losses, max 3400; `mp_starting_losses 1` ⇒ first loss pays $1900 | cfg (starting losses) + V (ladder) | S+V |
| Loss counter after a win | decrements by one (does not reset) | V (2019+ economy change) | V |
| T bomb plant | +$300 each T; +$800 each T on a lost round with a plant | V | V |
| T survivors on time-out loss | $0 loss bonus | V | V |
| Defuse award | +$300 to the defuser | V (kill-reward style award) | V |
| Kill rewards | rifle 300, AWP 100, knife 1500 (`m_nKillAward`) | weapons.vdata | S |
| Armor | Kevlar 650, Kevlar+helmet 1000, helmet upgrade 350 | items_game.txt | S |
Data-driven in `src/data/economy.ts`. Tests: `rules.test.ts` (ladder, cap, negative money, plant bonus, kill award).

## 4. Weapons (source constants, `src/data/weapons.ts`)
All from `weapons.vdata` (class **S**) unless noted. `m_nPrimaryReserveAmmoMax` is a **number of reserve magazines** in the
2026 ammunition system (AK-47 = 3 mags → 90 rounds, matching community reporting of the "reload update").
| Weapon | Price | Dmg | Armor ratio | RPM (cycle) | Mag / reserve | Speed u/s | Notes |
|---|---|---|---|---|---|---|---|
| AK-47 | 2700 | 36 | 1.55 | 600 (0.10) | 30 / 3 mags | 215 | full auto, range mod 0.98 |
| M4A4 (`weapon_m4a1_prefab`) | 2900 | 33 | 1.40 | 666 (0.09) | 30 / 4 mags | 225 | chosen M4 variant (30-round, no suppressor) |
| AWP | 4750 | 115 | 1.95 | 41 (1.455) | 5 / 2 mags | 200 / **100 scoped** | zoom levels 2, FOV **40 / 10**, zoom time 0.05, `unzoom after shot` |
| USP-S (`weapon_usp_silencer_prefab`) | 200 | 35 | 1.01 | 353 (0.17) | 12 / 2 mags | 240 | range 4096, mod 0.91 |
| Glock-18 | 200 | 30 | 0.94 | 400 (0.15) | 20 / 3 mags | 240 | burst mode not implemented (A) |
| Knife | 0 | 40 slash / 65 stab, backstab kill | vdata melee base 50 + V for slash/stab/backstab | 0.4 / 1.0 s | — | 250 | |
Damage model (class V, standard community formula): `dmg = base × hitgroup × rangeModifier^(distance_units/500)`; hitgroups
head ×4 (`m_flHeadshotMultiplier 4.0`, S), stomach ×1.25, legs ×0.75 (V); armour: `dmg × armorRatio × 0.5`, armour loses
`(dmg − armoured)/2`, helmet required for head. Reserve ammo is pooled per weapon (A: the exact magazine-discard behaviour of
the 2026 reload update was not verifiable).
Inaccuracy/recoil: vdata `m_flInaccuracy*` values are used as cone radii (radians) with a 0.85 demo factor; `m_flRecoilMagnitude`
is mapped to degrees by 0.055 (A). Recovery uses `m_flRecoveryTimeStand`. Acceptance: spray at a wall shows a widening group
and a climbing kick that recovers within ~0.4 s.
Reload / draw / inspect durations are **animation-driven in CS2 and not present in vdata**: AK reload ≈2.43 s (V: ~2.47 s
reported), M4A4 3.07 s, AWP 3.67 s (V), USP-S 2.17 s, Glock 2.2 s; draw 0.7–1.25 s (A); inspect 2.8–4 s (A). Marked `demo:` in data.

## 5. AWP scope baseline (implemented as a subsystem)
| Behaviour | Baseline | Class |
|---|---|---|
| RMB cycles unscoped → 40° → 10° → unscoped | `m_nZoomLevels 2`, `m_nZoomFOV1 40`, `m_nZoomFOV2 10` | S |
| Scoped sensitivity | scaled by `zoomFov/90 × zoom_sensitivity_ratio` (default 1.0; community-recommended 0.818933 available in settings) | V |
| Scoped accuracy | `m_flInaccuracyStandAlt 0.002` vs unscoped 0.0808 — hip fire is deliberately useless | S |
| Scoped movement | 100 u/s (`m_flMaxSpeed alt`) | S |
| After a shot | unzoom (`m_bUnzoomAfterShot`), bolt rechamber, then automatic re-scope to the previous level | S + V ("game automatically un-scopes… rescope") |
| Shot cooldown | 1.455 s cycle; rechamber animation occupies it; switching weapons cancels the animation but the cycle time still applies | S + V |
| Delayed-unscope option | not implemented (A) | A |
Transitions covered by code: zoom/shoot/rechamber/reload/switch/drop/death/pause/blur/round reset/menu return all restore FOV,
sensitivity scaling and overlay (see `src/sim/game.ts` `scope` events and `SceneView.update`).

## 6. Grenades (`src/data/grenades.ts`)
| Grenade | Source | Implementation | Class |
|---|---|---|---|
| HE | price 300, dmg 99, range 350 u, armour ratio 1.2, throw 750 u/s | linear falloff to 350 u, ×0.35 through cover (LOS test), armour mitigation | S + A (falloff shape) |
| Flashbang | price 200; V: full blind up to ~3–4.5 s when within ~53° of view, shorter to the side/back, distance and occlusion reduce it | full 4.5 s within 53°, 1.5 s side, 0.6 s behind, ×(1−0.6·d/R), ×0.15 occluded, ×0.2 through smoke; reduced-intensity accessibility option | V + A |
| Smoke | price 300; V: ~18 s | 18 s, radius 3 m sphere cluster, grows 1.2 s, fades 1 s; blocks bot LOS; extinguishes fire it lands in | V + A (shape) |
| Molotov / Incendiary | price 400 / 500 (S); V: ~7 s, up to ~40 dps ramping | 7 s, radius 2.6 m, 40 dps ramping over 1 s, bots path around and flee | S + V + A |
All grenades use Rapier dynamic bodies (restitution 0.42) and are consumed on throw; detonations are cleaned up.

## 7. Movement (`src/sim/actor.ts`)
Run speed per weapon from vdata (knife 250 u/s); walk ×0.52, crouch ×0.34 (V); jump 301 u/s ⇒ 7.65 m/s, gravity 800 u/s²
(V), step height 18 u, player 72 u / crouch 54 u / eye 64 u / 46 u (V). Acceleration/friction are simplified (A).

## 8. Bots (A throughout)
Reaction time, aim error, tracking speed, burst length, memory, hearing and vision range per difficulty in `src/data/match.ts`.
Bots cannot see through walls (Rapier ray) or through dense smoke (segment/sphere test) and are blind while flashed (>0.75).

## 9. Map (A)
Compressed original layout documented in `src/data/map/layout.ts` header and `research/MAP_LAYOUT.md`.
