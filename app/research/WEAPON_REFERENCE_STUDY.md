# WEAPON_REFERENCE_STUDY — what was actually viewed and what was inferred

## Access reality
- **Viewed in this session (attached images):** CS12 (official AK-47 viewmodel while firing, Inferno), CS14 (official M4A4
  viewmodel with smoke/fire, Inferno), CS13 was NOT attached, CS15 (loadout grid with weapon icons), CS16 (agent lineup),
  CS11 (Dust II mid doors). Five files were attached in total; CS01–CS10 and CS13 were **not** attached and could not be
  fetched (steamstatic / editorial hosts blocked by the egress proxy). Their content is known only from the prompt's captions.
- **Not viewable:** any video (YouTube blocked). No equip/fire/reload/inspect footage was observed. Every animation timing
  below is therefore an *adaptation* (labelled A) and no motion claim is made from stills.
- **Text sources reachable:** the official `weapons.vdata` and `items_game.txt` (model paths, magazine model names, inventory
  camera angles, muzzle-flash effect names, ammo types) and web-search summaries of community guides.

## Per-weapon study
### AK-47 (T rifle) — viewed in CS12
Observed (still): long slanted muzzle brake, gas tube above the barrel, wooden handguard and stock (orange-brown), curved
30-round magazine, black stamped receiver, front sight with ears, viewmodel occupies the lower-right quadrant with the muzzle
near screen centre-right; the left glove wraps the handguard; large orange muzzle flash with sparks; brass ejecting right.
Data: `weapon_rif_ak47.vmdl`, magazine model `weapon_rif_ak47_mag.vmdl`, `weapon_muzzle_flash_assaultrifle`,
`weapon_shell_casing_rifle`, ammo `BULLET_PLAYER_762MM`, inventory camera angles (-2, -135, 0) (items_game.txt).
Inferred (A): receiver top cover, safety lever and rear sight leaf shapes from general knowledge of the real rifle;
reload = mag rock-out, new mag rock-in, charging handle pull (standard CS2 ordering per community descriptions).

### M4A4 (CT rifle) — viewed in CS14
Observed (still): flat-top receiver with folded rear sight, quad-rail handguard, straight 30-round magazine, muzzle at lower
right with a visible front sight post; grey/black polymer materials; left hand on the rail forward.
Data: `weapon_m4a1_prefab` (M4A4) is the default `weapon_m4a1` class; reserve 4 magazines. Chosen variant: **M4A4** (30-round,
no suppressor) — labelled in the spec.

### AWP (sniper) — NOT viewed; silhouette from CS15 loadout icon captions only
Data: two zoom levels (40°/10°), 5-round magazine, 2 reserve magazines, 1.455 s cycle, 100 u/s scoped speed, unzoom after
shot (vdata). Community (V): bolt-action rechamber after every shot; scope reticle is a thin cross with a circular mask.
Inferred (A): long fluted barrel, large scope with lens shade, skeleton-style stock cheek riser, box magazine forward of the
trigger guard, bolt handle on the right. Rechamber ≈1.2 s inside the 1.455 s cycle.

### USP-S (CT sidearm) — icon only (CS15 shows pistol icons)
Data: `weapon_usp_silencer` prefab, 12-round magazine, 2 reserve, 0.17 s cycle, range 4096. Inferred (A): squared slide,
suppressor attached, polymer frame; reload = mag out, mag in, slide rack.

### Knife — no reference viewed
Data: melee prefab, kill award 1500; community (V): slash 40, stab 65, backstab instant kill. Inferred (A): default CT/T
knife shape (clip-point blade, rubber handle).

### Hands / gloves
CS12/CS14 show dark tactical gloves with knuckle padding and sleeve cuffs; used as the material target for the arms.

## Weapon-to-feature mapping
| Feature | Reference | Notes |
|---|---|---|
| Viewmodel placement | CS12, CS14, CS06/07 captions | lower-right, muzzle right of centre, crosshair unobstructed |
| Muzzle flash / brass | CS12, CS13 caption | short additive flash, brass to the right |
| Weapon icons (HUD, buy, killfeed) | CS15 | original SVG silhouettes |
| Scope overlay | V (community) | circular mask + thin cross, opaque exterior |

## Clip durations (authored, class A) — see `public/assets/weapons/*.anim.json`
Natural-timing clips are scaled at runtime to the rule durations (`demo.reloadTime`, `demo.drawTime`, `demo.inspectTime`,
AWP `rechamberTime`). Ammo is granted by the rules at `ammoInsertAt × reloadTime` (0.55–0.62 of the reload), independent of
the animation, so an interrupted clip can never duplicate ammunition.
