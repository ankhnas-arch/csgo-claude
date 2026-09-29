# Blender weapon build log — M4A4 + knife

Tool route: `python3` + PyPI `bpy` **4.5.14 LTS** (headless). Same conventions and helpers as the AK build (`common.py`:
materials, bake, `build_arms()`, posing/keyframe helpers, `export_glb`, `verify_glb`, `render_review`). Neither script
modifies `common.py`; the few extra helpers they need (`curl_abs` absolute-thumb curl, `k_hand`, `bezier`, `shift_origin`,
`rail_teeth`) are local to the scripts. Local material specs are added with `MATERIAL_SPECS.setdefault(...)`
(`polymer_black`, `metal_dark`), and the M4 script overrides `metal_blued` **in its own process only** to a darker
phosphate tone (0.058, 0.063, 0.075, rough 0.48) — the AK build is unaffected.

Regenerate: `python3 tools/blender/build_m4a4.py` / `python3 tools/blender/build_knife.py`
(flags: `--no-render` skips review renders, `--pose-only` renders Workbench hand-pose closeups only, no export).

Machine: 4 CPU cores (shared with a concurrent AK/AWP/USP build while these were made, so render times vary ±50 %).

## M4A4 (`m4a4`)

FILLED_M4

## Knife (`knife`)

FILLED_KNIFE
