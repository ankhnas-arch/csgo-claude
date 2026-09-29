# Blender weapon build log

Tool route: `python3` + PyPI `bpy` **4.5.14 LTS** (headless, no GUI, no BlenderMCP). Cycles CPU for bakes and hero renders,
Workbench for turntables / animation strips (EEVEE on this box runs on software GL and takes ~25 s even at 320×180, so it is not used).
Machine: 4 CPU cores. Regenerate with `python3 tools/blender/build_ak47.py`, `build_awp.py`, `build_usp.py` (flags: `--quick`
skips the turntable, `--pose-only` renders hand-pose closeups only, `--no-render` skips review renders).

Files:
- `tools/blender/common.py` – shared helpers: scene reset, Principled material library, loft/profile/sweep/box/cylinder
  mesh builders, bevel/boolean/join/smooth-by-angle, Cycles EMIT bake of procedural noise to 1024² base colour + roughness
  (Smart UV Project, margin 0.02, 16 samples, bevel-node edge wear, stretched-noise scratches, wood grain), `build_arms()`,
  posing helpers (`hand_matrix_at`, `curl_fingers`, `aim_arm`), keyframe helpers, `write_anim_json`, `export_glb`,
  `verify_glb` (GLB header parse + bpy re-import), `render_review`, `render_closeups`.
- `tools/blender/build_ak47.py` – full AK-47 build (geometry → bake → world copy → arms pose → animation → GLB/JSON/.blend → renders → verification).
- `tools/blender/build_awp.py` – AWP (same stages; adds `fluted_cyl`, `tube_along`, `annulus`, `loop` builders, right-hand bolt cycling).
- `tools/blender/build_usp.py` – USP-S (same stages; slide object named `bolt` with a `slide` alias empty, two-handed cup grip).

## AK-47 (`ak47`)

| item | value |
|---|---|
| Blender | 4.5.14 LTS (bpy module) |
| Overall length | 0.885 m (butt plate y=-0.294 … muzzle brake y=+0.602), bore axis z=0.035 |
| Viewmodel gun tris | **6 962** (receiver 1218, barrel group 1716, mag 1152, handguard 632, grip 428, stock 436, bolt 420, hg_retainers 304, trigger_guard 272, safety 140, butt_plate 108, trigger 92, sling_loop 44) |
| Arms tris | **4 744** (per hand: palm 412, knuckles 256, thenar 100, 5 fingers × 2 segments 116/136, cuff 124, sleeve 220) |
| `world` drop copy | **1 400** tris (decimated single mesh, child of `weapon`) |
| Total in GLB | 13 106 tris, 72 nodes |
| Materials (10 exported) | metal_blued, metal_blued_receiver (baked), metal_blued_mag (baked), wood_stock (baked), wood_handguard (baked), steel_bright, polymer, rubber, glove, sleeve (`wood`/`glass` exist in the library; glass unused on the AK) |
| Textures | 8 × 1024×1024 (base colour + roughness for receiver, mag, stock, handguard), baked with Cycles CPU 16 spp, saved as JPEG q88 in `assets-source/blender/textures/` and packed into the .blend; the glTF exporter embeds them (AUTO → JPEG) |
| GLB | `public/assets/weapons/ak47.glb` **2.21 MB** (images ≈ 1.6 MB, animation ≈ 0.08 MB) |
| .blend | `assets-source/blender/ak47.blend` 1.02 MB (compressed, textures packed) |
| anim.json | `public/assets/weapons/ak47.anim.json` – fps 30, clips idle 0–60, equip 60–90, fire 90–102, reload 102–180, inspect 180–280; events reload_mag_out 120, reload_mag_in 150, reload_end 180 |
| Verified animation | ONE glTF animation `Scene`, 19 channels, 0.000–9.333 s = frames 0..280; bpy re-import → 1 action `Scene`, frame range 0..280 |
| Named nodes | weapon, receiver (+ muzzle, eject empties), barrel, handguard, mag, bolt, trigger, stock, grip, trigger_guard, safety, hg_retainers, butt_plate, sling_loop, world, arms → hand_R/hand_L → palm, fR_1..4/fL_1..4 (+`_k2` second joint), thumb_R/L, arm_R/L (cuff + sleeve) |
| Build time | ≈ 60 s geometry+bake+export, ≈ 4–5 min with all review renders (varies with machine load) |
| Render times (final run) | see bottom of this file |

Hierarchy note: `arms` is a child of `weapon`, so the hands ride with the gun during equip / fire / inspect; the left
hand is keyed explicitly during reload (follows the `mag` matrix while holding it, then grabs the `bolt` charging handle).
The FP review camera uses (-0.14, **-0.33**, 0.16) relative to `weapon` (PIPELINE.md prints +0.33, but the camera must be
behind the weapon to look along +Y; the viewmodel code places the weapon at camera-relative (0.14, -0.16, -0.33)).

### Modelling notes
Stamped receiver: profile-extruded body with bevelled edges, rounded dust cover, ejection-port boolean cut through
cover + right wall, AKM lightening dimples both sides, 14 rivets, rear cover button, rear-sight block with barrel collar,
tangent leaf + slider + ears. Selector lever with pivot on the right. Barrel in three diameters, gas block (collar + block
+ angled port + rod guide), gas tube, cleaning rod, front sight (collar, block, rounded ears, post) and a hollow slanted
muzzle brake (open bore, longer at lower-left). Wooden upper/lower handguards lofted with superellipse sections, metal
retainer plate and ferrules. Banana magazine: rounded-rect section swept along a 6°→44° curve, four ribs, floor plate,
locking lug; origin at the top/insertion point. Pistol grip lofted with rake and finger swell. Trigger and guard swept
along paths, magazine release. Wooden stock lofted (drop + widening to the butt), butt plate, sling loop. Bolt carrier
bar visible through the port + charging handle stem/knob (origin at the handle).

### Correction pass 1 (silhouette / proportions / export)
Reviewed `ak47_side/front/threequarter/fp.png` of build 1. Wrong → changed:
- Receiver + cover 86 mm tall (real ≈ 65) → body z −14…+34 mm, cover to 57 mm; sight block, leaf, rivets, port, safety,
  bolt, trigger, guard, mag origin all moved with it. Grip rake 20° → 25°.
- Handguards looked like bulbous pills → longer (198–308 mm), squarer sections (k 2.2), bevel 3 → 1.5 mm.
- Magazine too thin front-to-back (58 mm) → 68 mm, ribs moved out; stock slimmed (butt 118 → 110 mm), sling loop was
  floating 25 mm below the stock → attached to the underside.
- Metals rendered as bright silver: the edge-wear mask used per-vertex Pointiness, which on low-poly bevelled faces
  interpolates "edge" across whole faces → replaced with a Bevel-node vs true-normal dot product (per shading point).
- Colours washed/pinkish → view transform AgX → Standard for review renders; "front" camera was behind the gun → moved to +Y.
- GLB had 16 per-object animations → `export_anim_scene_split_object=False` (SCENE mode) gives one `Scene` animation.
- GLB 3.68 MB (PNG bakes) → bakes saved as JPEG and packed; exporter AUTO mode embeds them as JPEG → 2.2 MB.
- Re-import verification reported frames 0..224 because the fresh scene was 24 fps → set 30 fps before importing.
- Hands floated off the grip/handguard → added `hand_matrix_at()` (anchor a hand-local point to a world point), palm
  changed from slab-like rounded rectangles to superellipse sections with a domed back, thumb base moved into the palm.

### Correction pass 2 (shading / materials / hand contact / animation)
Reviewed hero renders, hand closeups (`--pose-only`) and animation strips of build 2. Wrong → changed:
- Wood pale pine-yellow → deeper laminate red-brown ramp; grip polymer salmon → dark bakelite brown.
- Muzzle was a flat bright cap → hollow brake with recessed dark bore.
- Bevel-node bake took 55 s per object → bevel samples 6 → 2 (≈ 12 s per object); hero renders 24 spp + denoise.
- Right thumb hooked the back strap at mid height → grip anchor raised 8 mm and hand pitched down (high grip, thumb over
  the top-left); thumb curl 25/30 → 45/50. Left hand verified from below/front/left: palm cups the guard, fingers wrap the
  right side, thumb along the left side. Mag-grab (frame 118) and charging-handle grab (frame 163) verified in closeups.
- Reload happened below the FP frame edge (viewmodel origin is 0.16 m under the camera) → the gun now lifts 10 cm and
  rolls 30° toward the camera during the mag change (CS-style), 6 cm while charging; inspect also lifts slightly.
- Workbench strips too dark → `world.color` used for the Workbench backdrop.

### Known weaknesses
- Hands are rigid parts (no skinning): finger joints show a slight crease when strongly curled; palm is a simple lofted
  volume.
- Edge wear is restrained and mostly reads as scratches; no normal map (base colour + roughness only).
- Mag ribs are geometry strips, not the real pressed ribs; the ejection-port interior is a plain bar.
- The right hand/grip sits below the FP frame at the game's viewmodel offset, so most of the right-hand work is only
  visible in the three-quarter render and in the inspect clip.
- Review renders are the slowest part of the build (Cycles CPU on 4 cores); use `--quick` / `--no-render` when iterating.

### Final run timings (build 4, `--quick`, 4-core CPU under varying load)
geometry 0.5 s · bakes 133 s (4 objects × 2 maps; 60 s on an idle machine) · export + save 3 s ·
hero renders (Cycles 24 spp, denoised, 1280×720): side 47 s, front 43 s, three-quarter 61 s, FP 26 s ·
animation strips (20 Workbench frames) 30 s · turntable (24 Workbench frames, build 3) 90 s · total 341 s.
Evidence: `evidence/blender/ak47_{side,front,threequarter,fp}.png`, `ak47_turntable_00..23.png`,
`ak47_anim_{idle,equip,fire,reload,inspect}_00..03.png`, `ak47_build_log.txt` (script output).


## Round 2 changes to `common.py` (backward compatible; AK re-run afterwards)
- **Bug fix `ellipse2d`**: the default superellipse exponent was `k=1`, which is a *diamond* (|x|+|y|=1), so every `cyl()`
  (barrels, gas tube, rivets, scope tubes, lenses), the finger tips and the AWP thumbhole cutter were rhombic prisms.
  Default is now `k=2` (true circle); fingers `k=1.3→2.0`, palm `1.7→2.2`, cuffs/sleeves `1.5/1.6→2.0/2.1`. Explicit `k`
  values in build scripts keep their meaning (k = superellipse exponent: 2 circle, >2 squarer, <2 pointier).
- New material specs: `polymer_green` (AWP body), `polymer_black` (USP frame), `metal_dark` (phosphate slide / scope),
  `glove_pad` (knuckle padding). Wood / glove / sleeve specs changed (AK pass 3, below).
- Bake: `kind='polymer'` now uses a lighter/greyer version of the base colour as the scuff colour (was bare-steel grey),
  wear gain 0.55, scuffs lower roughness slightly.
- Helpers: `key_hand(H, f, M, curl, elbow, spread, lift)` (keys one hand dict incl. fingers + forearm), `set_bezier(objs)`,
  `fluted_cyl(...)` (cylinder with cosine flutes / knurling).
- Studio lights reduced to ~40 % (key 180→75 W, fill 70→30 W, rim 140→70 W), world 0.32→0.24, floor albedo 0.42→0.30:
  the previous renders were over-exposed (floor read white, wood read bright orange, near-black gloves read mid grey).
  Game lighting is unaffected (materials only carry base colour / roughness / metallic).

## AK-47 correction pass 3 (materials only; full re-run = build 5)
Wrong → changed:
- Wood read as flat saturated orange → laminate ramp re-based on #6b4223: dark line (0.060,0.024,0.010), body
  (0.125,0.056,0.026), light grain (0.185,0.092,0.046) linear; edge-wear colour darker (0.30,0.19,0.10); roughness base
  0.42→0.28, span 0.16 (light varnish gloss). `wood` plain spec (0.147,0.054,0.018), roughness 0.34.
- Gloves read mid grey → `glove` (0.022,0.022,0.025) roughness 0.55 (near-black tactical), knuckle bumps use the new
  `glove_pad` (0.045 grey, roughness 0.80) so the padding reads as a subtle lighter patch. (Part of the "grey" was the
  over-exposed studio, see above.)
- Sleeves pale green → `sleeve` (0.075,0.085,0.045) roughness 0.90 (olive drab).
- Fingers a little slimmer: radii 9.2/9.5/9.0/8.0 → 8.3/8.6/8.1/7.2 mm, thumb 12.5→11.5 mm; finger sections round
  (k=2) instead of creased (k=1.3). Arms now 4 688 tris (was 4 744).
- All cylinders became round (ellipse2d fix) – muzzle brake, gas tube, barrel, rivets.
Build 5 numbers: gun 6 882 tris (bolt 356, rest unchanged), arms 4 688, world 1 400, GLB **2.16 MB**, .blend 0.99 MB,
one animation `Scene` frames 0..280 verified by re-import. Render times: side 26 s, front 24 s, three-quarter 44 s,
FP 24 s, turntable 48 s (24 Workbench frames), strips 28 s; total 267 s.

## AWP (`awp`)

| item | value |
|---|---|
| Blender | 4.5.14 LTS (bpy module) |
| Overall length | 1.21 m (butt pad y=-0.322 … muzzle y=+0.892), bore axis z=0.040, scope axis z=0.104 |
| Viewmodel gun tris | **8 008** (scope 2624, barrel 1232, stock 1228 incl. grip + cheek riser, bolt 624, receiver 564, handguard 476, mag 424, trigger_guard 284, fittings 220, stock_swivel 132, butt_pad 108, trigger 92) |
| Arms tris | 4 688 |
| `world` drop copy | 1 499 tris in Blender / 1 490 in the GLB (decimated single mesh; exporter drops 9 degenerate tris and warns "mesh not valid" – harmless) |
| Total in GLB | 14 186 tris, 71 nodes |
| Materials (12 exported) | metal_blued, metal_blued_receiver (baked), metal_blued_mag (baked), polymer_green_stock (baked), polymer_green_handguard (baked), metal_dark (scope, bolt shroud/handle, guard), steel_bright (bolt body, studs, swivels, turret caps), rubber (butt pad, eyecup, bore, rail slots), glass (both lenses), glove, glove_pad, sleeve |
| Textures | 8 × 1024² JPEG q88 (`assets-source/blender/textures/awp_*`), packed; embedded by the exporter |
| GLB | `public/assets/weapons/awp.glb` **2.28 MB** |
| .blend | `assets-source/blender/awp.blend` 0.91 MB |
| anim.json | fps 30; clips idle 0–60, equip 60–90, fire 90–104, rechamber 104–140, reload 140–230, inspect 230–330; events rechamber_open 121, rechamber_close 133, reload_mag_out 160, reload_mag_in 195, reload_end 230 |
| Verified animation | ONE glTF animation `Scene`, 33 channels, 0.000–11.000 s = frames 0..330; bpy re-import → 1 action, frame range 0..330 |
| Named nodes | weapon, receiver (+ muzzle, eject), bolt, barrel, handguard (+ fittings: bipod studs, front swivel), stock (+ stock_swivel), butt_pad, mag, trigger, trigger_guard, scope, world, arms → hand_R/L … |
| Build time | 65 s geometry+bake+export; 265 s with all renders |
| Render times | side 24 s, front 23 s, three-quarter 43 s, FP 25 s (Cycles 24 spp denoised), turntable 45 s (24 Workbench frames), 24 strip frames 38 s |

### Modelling notes
Steel action: superellipse loft (flat-bottomed), integral top rail with 9 recessed slots, trunnion collar, rear tang,
ejection port cut through the right/top wall. Bolt (`bolt`, origin on the bore axis at the handle) = bolt body visible
through the port + rear shroud/cap + bent tube handle + ball knob on the right; lifts by rotating about Y (70°) and
travels 90 mm back. Barrel: tapered shank, 6-flute section (cosine grooves 345–790 mm), neck and a muzzle brake with
three through-slots (boolean) and a dark bore plug. Forend (`handguard`): long tapering superellipse loft under the
free-floating barrel with two bipod studs and a front sling swivel loop. Stock: side profile extruded 48 mm wide,
bevelled, then thumbhole (ellipse) and skeleton cut-out (rounded rectangle) cut through; lofted pistol grip with
finger swell; adjustable cheek riser block; rubber butt pad; rear sling swivel. Box magazine (rounded-rect loft with a
wider floor plate, feed-lip block) forward of a swept trigger guard with mag-release paddle. Scope: 30 mm tube, turret
saddle with elevation/windage turrets + parallax knob, objective bell + 56 mm objective + lens shade (annulus) with a
glass lens disc, ocular cone + eyepiece + rubber eyecup + rear lens, magnification ring, two rings with clamp bases
and cross bolts on the rail.

### Animation notes
The right hand is keyed (not static as on the AK): `bolt_cycle(f0)` moves it from the grip to the knob (6 f), lifts
(5 f), pulls back (6 f, `rechamber_open`), pushes forward (6 f), locks down (4 f, `rechamber_close`), returns to the
grip (7 f). The hand matrix is derived from the animated bolt matrix (`knob_hand_matrix(bolt_matrix(dy, lift))`) so the
palm stays on the knob through lift/travel. Reload: the gun lifts 10 cm and rolls 30° toward the camera; the left hand
leaves the forend, grabs the mag from the left (palm on the left face, fingers round the front-bottom edge), pulls it
down out of view, a fresh mag rides back up in the hand and seats at 195, then the right hand cycles the bolt
(192–228) while the left returns to the forend. Fire: 40 mm kick + 7.5° muzzle rise, 13-frame settle. Inspect: show
left side, roll to the right side/scope, return.

### Correction pass 1 (reviewed build 1 side / FP / closeups)
- Body read as pale grey-green → `polymer_green` (0.055,0.095,0.045) → (0.038,0.072,0.030), polymer wear gain 0.9→0.55.
- Thumbhole rendered as a diamond → first suspected the post-boolean bevel (stock is now bevelled *before* the cuts,
  hole 50×34 → 58×40 mm, 24 segments); the real cause was the `ellipse2d` k=1 diamond bug, fixed in pass 2.
- Step between forend rear (56 mm wide) and the 40 mm stock front → stock 48 mm wide, forend 50–52 mm and starting
  at y=-0.01 inside the stock.
- Cheek riser looked like a thin floating slab → 170 × 34 mm block sunk into the comb.
- Side render was cropped (1.2 m gun, 50 mm lens at 1.62 m) → camera distance from gun_len 1.42.
- Mag-grab closeup was empty: the closeup cameras were in world space while the gun is rolled during reload → closeup
  views are now transformed by the weapon matrix at that frame (`wv()`); left mag hand moved 18 mm forward / 12 mm up.
- Bolt-hand closeups too close to judge → wider cameras; hand verified on the knob at rest (110), lifted (115) and
  pulled back (121).

### Correction pass 2 (reviewed build 2 side / three-quarter / strips)
- Scope tube/bell/ocular, muzzle brake, bolt shroud and all lenses were rhombic (`ellipse2d` default k=1) → fixed in
  common.py (k=2); receiver section k 1.8→2.2, grip k 1.7→2.1. Barrel tris 1374→1232 (fewer degenerate flute faces).
- Studio exposure lowered (see common.py notes) so the green reads dark green instead of washed out.
- Stock tris 1440→1228 after reordering bevel/boolean.

### Known weaknesses
- Rechamber/reload right-hand work happens on the right side while the gun is rolled left for the mag change, so in
  the FP frame the bolt cycle mostly reads as the arm moving; the knob is hidden under the palm.
- No bipod (only studs); rail slots are dark inlay strips rather than cuts; scope reticle not modelled (dark glass with
  slight emission only).
- World copy at 1 490 tris loses the rail slots and swivel loops.
- Same rigid-hand limitations as the AK.

## USP-S (`usp`)

| item | value |
|---|---|
| Blender | 4.5.14 LTS (bpy module) |
| Overall length | 0.202 m frame/slide (beavertail y=-0.066 … slide front y=+0.125), 0.270 m with suppressor; bore axis z=0.031 |
| Viewmodel gun tris | **3 072** (frame 988 incl. grip, guard, rail, levers, hammer; suppressor 1008; bolt/slide 580; mag 252; barrel 152; trigger 92) |
| Arms tris | 4 688 |
| `world` drop copy | 900 tris |
| Total in GLB | 8 660 tris, 66 nodes |
| Materials (10 exported) | metal_dark_bolt (baked slide), polymer_black_frame (baked frame), metal_dark (suppressor, sights, levers, hammer, trigger, mag), steel_bright (barrel, thread, sight dots), rubber (serration inlays, rail slots, bore), polymer_black, glove, glove_pad, sleeve |
| Textures | 4 × 1024² JPEG q88 (`usp_bolt_*`, `usp_frame_*`), packed |
| GLB | `public/assets/weapons/usp.glb` **1.30 MB** |
| .blend | `assets-source/blender/usp.blend` 0.62 MB |
| anim.json | fps 30; clips idle 0–60, equip 60–84, fire 84–96, reload 96–170, inspect 170–260; events reload_mag_out 112, reload_mag_in 146, reload_end 170 |
| Verified animation | ONE glTF animation `Scene`, 19 channels, 0.000–8.667 s = frames 0..260; bpy re-import → 1 action, frame range 0..260 |
| Named nodes | weapon, frame (+ muzzle, eject, barrel, suppressor), bolt (= slide; child empty `slide` as alias), mag (origin at the mag-well top), trigger, world, arms → … |
| Build time | 35 s geometry+bake+export; 181 s with renders (no turntable for pistols) |
| Render times | side 27 s, front 28 s, three-quarter 45 s, FP 22 s, 20 strip frames 24 s |

### Modelling notes
Polymer frame: bevelled dust-cover block, accessory rail with 4 slots, lofted grip (superellipse k=2.3, raked 17.5°),
beavertail, squared trigger guard (swept), slide release, mag release, takedown lever, hammer. Slide (`bolt`): profile
extrude with chamfered nose, 4.5 mm bevel, ejection port cut right/top, 6 cocking serrations each side (recessed dark
inlays), rear sight with notch + two white dots, front sight with dot. Barrel + thread visible through the port and in
front of the slide; suppressor with knurled ring (`fluted_cyl` 20 flutes), can and chamfered tip. Magazine: rounded
box along the grip axis with a wider baseplate, origin at the well. Both hands: right high grip with the thumb aimed
along the left side of the frame (`point_thumb`), left hand cupping the left side of the grip / right fingers, left
thumb along the frame under the slide release.

### Animation notes
Fire: 12 mm kick, 5° rise, slide cycles 28 mm (2 f back, 4 f forward), trigger pull. Reload: gun tilts up 22° and
rolls 30° toward the camera, left hand releases, mag drops 300 mm along the grip axis (out of view), the left hand
drops away and comes back holding a fresh mag (palm under the baseplate), seats it at 146, then racks the slide
over-hand (slide back 30 mm 154–158, released 160) and returns to the cup at 168. Inspect: left side, then roll to
show the right side / suppressor.

### Correction pass 1 (reviewed pose closeups + build 1 hero renders)
- Trigger guard hung 40 mm below the frame and stuck out in front → 30 mm deep, squared, front at y=0.060; trigger
  shortened to match.
- Suppressor fatter than the slide (34 mm) → 31 mm can, 33 mm knurl ring, smaller tip chamfer.
- Both thumbs curled up/back around the back strap (canonical opposed thumb) → new `point_thumb()` aims the first
  thumb segment along a given direction; right thumb along the left frame side, left thumb forward.
- Left hand sat too far forward/low (thumb crossed in front of the trigger guard) → anchor moved 22 mm back / 20 mm
  up, thumb aimed forward-up along the frame under the slide release.

### Correction pass 2 (reviewed build 2)
- Suppressor, knurl, barrel and mag corners were rhombic (`ellipse2d` k=1) → round after the common.py fix; grip loft
  k 1.9→2.3.
- Left-hand cup verified in the three-quarter render (fingers over the right-hand fingers, thumb along the frame).

### Known weaknesses
- Slide does not lock back on the last round; no extractor/loaded-chamber detail; serrations are inlays, not cuts.
- Left thumb intersects the frame side slightly during idle sway (rigid parts).
- The mag change happens mostly below the FP frame edge (viewmodel origin is 0.16 m under the camera), as with the
  rifles; the gun tilt helps but the fresh mag is only visible for a few frames.
