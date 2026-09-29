# ASSET_MANIFEST

All runtime content is original work created for this project. No screenshots, textures, models or sounds from
Counter-Strike 2 or any third party are shipped. Reference screenshots were used for visual study only.

## Runtime assets (public/assets)
| Asset | Type | Provenance | Size | Notes |
|---|---|---|---|---|
| weapons/ak47.glb + ak47.anim.json | Blender 4.5.14 (bpy) → glTF binary | `tools/blender/build_ak47.py` (procedural modelling + Cycles-baked 1024² wear/wood textures, JPEG-packed) | 2.21 MB | 13 106 tris incl. arms and 1 400-tri `world` copy; one animation (idle/equip/fire/reload/inspect subclips) |
| weapons/awp.glb, m4a4.glb, usp.glb, knife.glb (+ anim.json) | same pipeline | `tools/blender/build_*.py` | see BUILD_LOG | filled in when the builds complete (see tools/blender/BUILD_LOG*.md for final numbers) |

## Procedural / generated at runtime (no files)
| Asset | Generator | Notes |
|---|---|---|
| Map geometry | `src/render/mapBuilder.ts` from `src/data/map/layout.ts` | walls/ledges derived from rectangle adjacency; props are parametric meshes; merged per material (≈ 20 draw calls for the static map) |
| Materials & textures | `src/render/textures.ts` (value-noise canvases: plaster, stone, flagstone, wood, timber, metal, ribbed container, sand, asphalt, crate, canvas, tarp) | 512² colour + normal + roughness per material, generated once at load |
| Sky | `src/render/sky.ts` shader | gradient + sun disc |
| Characters | `src/render/characters.ts` + `characterParts.ts` | lathe/capsule based articulated humans, ≤ 3.8k tris, 41–43 meshes each |
| Effects | `src/render/effects.ts` | pooled sprites/meshes; radial canvas textures |
| Sounds | `src/audio/audio.ts` | all synthesised with WebAudio (noise bursts, filtered oscillators); no audio files |
| UI icons | `src/ui/icons.ts` | original SVG silhouettes |
| Signs | `src/render/textures.ts` textTexture | original text only ("BAKERY · فرن", "DUST MOTORS", "TEA · شاي", "LONG DOORS") |

## Source files
- `assets-source/blender/*.blend` (packed textures) and `assets-source/blender/textures/*.jpg` (baked)
- `tools/blender/*.py` regenerate everything from scratch (`python3 tools/blender/build_ak47.py`)

## Third-party code (npm, MIT licensed)
three@0.170, @dimforge/rapier3d-compat@0.14, vite@6, typescript@5.6, vitest@2, playwright@1.49 (dev/evidence only).

## Download size (production build)
Filled from `npm run build` output in PLAYTEST_REPORT.md (JS bundle ≈ 2.9 MB minified / ≈ 1.0 MB gzip incl. three.js + Rapier WASM; weapons GLBs listed above).
