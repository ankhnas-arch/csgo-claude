# Blender weapon build log

Tool route: `python3` + PyPI `bpy` **4.5.14 LTS** (headless, no GUI, no BlenderMCP). Cycles CPU for bakes and hero renders,
Workbench for turntables / animation strips (EEVEE on this box runs on software GL and takes ~25 s even at 320×180, so it is not used).
Machine: 4 CPU cores. Regenerate everything with `python3 tools/blender/build_ak47.py` (flags: `--quick` skips the
turntable, `--pose-only` renders hand-pose closeups only, `--no-render` skips review renders).

Files:
- `tools/blender/common.py` – shared helpers: scene reset, Principled material library, loft/profile/sweep/box/cylinder
  mesh builders, bevel/boolean/join/smooth-by-angle, Cycles EMIT bake of procedural noise to 1024² base colour + roughness
  (Smart UV Project, margin 0.02, 16 samples, bevel-node edge wear, stretched-noise scratches, wood grain), `build_arms()`,
  posing helpers (`hand_matrix_at`, `curl_fingers`, `aim_arm`), keyframe helpers, `write_anim_json`, `export_glb`,
  `verify_glb` (GLB header parse + bpy re-import), `render_review`, `render_closeups`.
- `tools/blender/build_ak47.py` – full AK-47 build (geometry → bake → world copy → arms pose → animation → GLB/JSON/.blend → renders → verification).

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
