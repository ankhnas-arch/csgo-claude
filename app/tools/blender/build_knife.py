"""Regenerates assets-source/blender/knife.blend, public/assets/weapons/knife.glb + knife.anim.json and the review renders.
Run: python3 tools/blender/build_knife.py [--no-render] [--pose-only]   (headless bpy 4.5). Deterministic.
Default tactical knife (~0.28 m): clip-point blade with fuller, satin edge bevel, crossguard, ribbed rubber handle with
lanyard hole, pommel. Held in the right hand in a forward (hammer) grip; left hand relaxed at the lower-left of the frame.
Only calls helpers from common.py; local helpers are defined here."""
import sys, math, time, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

WID = 'knife'
CLIPS = {'idle': (0, 60), 'equip': (60, 80), 'fire': (80, 96), 'fire2': (96, 116), 'inspect': (116, 200)}
EVENTS = {}
T0 = time.time(); POSE_ONLY = '--pose-only' in sys.argv
MATERIAL_SPECS.setdefault('metal_dark', ((0.045, 0.048, 0.055), 1.0, 0.40, 0.0))
MD, SB, RB, MB = 'metal_dark', 'steel_bright', 'rubber', 'metal_blued'

def k_hand(H, f, M=None, curl=None, elbow=None, spread=3.0, lift=None):
    if M is not None: set_local_matrix(H['hand'], M)
    if curl is not None: curl_abs(H, 'R' if H['hand'].name.endswith('R') else 'L', curl, spread=spread, lift=lift, thumb_dir=R_THUMB if H is R else None)
    if elbow is not None: aim_arm(H['hand'], H['arm'], elbow)
    key_current(H['hand'], f); key_current(H['arm'], f)
    for i in range(1, 5): key_current(H[f'f{i}'], f); key_current(H[f'f{i}_k2'], f)
    key_current(H['thumb'], f); key_current(H['thumb_k2'], f)

THUMB_BASE = {'R': Euler((math.radians(-25), math.radians(-20), math.radians(-50)), 'XYZ'), 'L': Euler((math.radians(-25), math.radians(20), math.radians(50)), 'XYZ')}
def curl_abs(H, side, curls, spread=0.0, lift=None, thumb_dir=None):
    """curl_fingers with an absolute thumb: reset the canonical thumb base first (curl_fingers accumulates it), optionally aim the
    thumb's first segment along hand-local direction `thumb_dir`."""
    H['thumb'].rotation_euler = THUMB_BASE[side].copy()
    curl_fingers(H, curls, spread=spread, lift=lift)
    if thumb_dir is not None:
        H['thumb'].rotation_euler = Vector((0, 1, 0)).rotation_difference(Vector(thumb_dir).normalized()).to_euler('XYZ')

def bezier(objs):
    for o in objs:
        if o.animation_data and o.animation_data.action:
            for fc in o.animation_data.action.fcurves:
                for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'; kp.easing = 'AUTO'

reset_scene(frame_end=200)
weapon = empty('weapon', (0, 0, 0), None, 0.05)
knife = empty('knife', (0, 0, 0), weapon, 0.03)          # intermediate node so the blade can twirl inside the hand

# ----------------------------------------------------------------------------------------------- blade (clip point, fuller, edge bevel)
Y0, Y1 = 0.066, 0.206                                     # ricasso .. tip  (blade 140 mm)
def blade_section(y):
    """12-point section in XZ for height y along the blade. Returns (points, edge_face_start_index)."""
    u = (y - Y0) / (Y1 - Y0)
    t = 0.0042 * (1 - 0.55 * u ** 2)                       # spine thickness tapers toward the tip (distal taper)
    zt = 0.0145 if u < 0.55 else 0.0145 - 0.0125 * ((u - 0.55) / 0.45) ** 1.6      # clip: spine drops in the last 45%
    zb = -0.0165 if u < 0.85 else -0.0165 + 0.0165 * ((u - 0.85) / 0.15) ** 1.3   # belly sweeps up to the tip
    if u > 0.999: zt, zb = 0.0025, 0.0015
    h = max(zt - zb, 0.001); ricasso = y < Y0 + 0.012
    fz1, fz2, fz3 = zt - 0.0035, zt - 0.0065, zt - 0.0095      # fuller band (only on the middle 60 % of the blade)
    fd = 0.0011 if (0.10 < u < 0.62) else 0.0
    sh = zb + (0.0 if ricasso else min(0.0075, h * 0.4))     # edge-bevel shoulder
    ex = t / 2 if ricasso else 0.0003                        # ricasso is unsharpened (flat bottom)
    R = [(t / 2, zt), (t / 2, fz1), (t / 2 - fd, fz2), (t / 2, fz3), (t / 2, sh), (ex, zb)]
    L = [(-ex, zb), (-t / 2, sh), (-t / 2, fz3), (-t / 2 + fd, fz2), (-t / 2, fz1), (-t / 2, zt)]
    return [(x, y, z) for x, z in R] + [(x, y, z) for x, z in L]
ys = [Y0, Y0 + 0.006, Y0 + 0.012, 0.086, 0.100, 0.116, 0.132, 0.148, 0.160, 0.172, 0.182, 0.190, 0.196, 0.201, 0.2045, Y1]
rings = [blade_section(y) for y in ys]
blade = loft('blade', rings, True, True, MD, knife)
blade.data.materials.append(get_mat(SB))
# faces are created ring by ring, 12 per ring; segments 4 (R shoulder->edge) and 5 (edge->L shoulder) are the edge bevel
n = 12
for i in range(len(rings) - 1):
    for j in (4, 5):
        blade.data.polygons[i * n + j].material_index = 1
shade_smooth(blade, 28)
# tang stub into the guard (so nothing shows through when the blade twirls)
tang = box('tang', (0, 0.060, -0.001), (0.004, 0.014, 0.024), MD, knife)
blade = join([blade, tang], 'blade', knife); shade_smooth(blade, 28)
muzzle = empty('muzzle', (0, Y1, 0.002), blade, 0.01)

# ----------------------------------------------------------------------------------------------- crossguard, handle, pommel
guard = box('guard', (0, 0.061, -0.003), (0.011, 0.010, 0.056), MD, knife)
add_bevel(guard, 0.0025, 2); apply_mods(guard); shade_smooth(guard, 30)
# ribbed rubber handle: superellipse rings along Y, radius pulsing for the ribs, palm swell in the middle
hp = []
def hring(y, w, h, k=1.9): return ring_y(ellipse2d(w, h, 16, k=k), y, dz=-0.002)
hr = []
for i in range(31):
    y = 0.054 - 0.004 * i                                  # 0.054 .. -0.066
    u = (y + 0.006) / 0.060                                # -1 .. 1 across the handle
    swell = 1.0 + 0.10 * (1 - u * u)
    rib = 0.90 if (i % 2 == 1 and 2 <= i <= 28) else 1.0
    hr.append(hring(y, 0.023 * swell * rib, 0.031 * swell * rib))
handle = loft('handle', hr, True, True, RB, knife); shade_smooth(handle, 45)
# lanyard hole through the handle (X axis) near the pommel
boolean_cut(handle, cyl('lanyard_cut', 0.0028, 0.040, (0, -0.058, -0.004), 'X', 10))
shade_smooth(handle, 45)
pommel = box('pommel', (0, -0.071, -0.002), (0.020, 0.010, 0.028), MD, knife)
add_bevel(pommel, 0.003, 2); apply_mods(pommel); shade_smooth(pommel, 30)
for o in (guard, pommel): pass
KNIFE_MESHES = [blade, guard, handle, pommel]
log(f'[{time.time() - T0:.0f}s] geometry built: ' + ', '.join(f'{o.name}={tri_count(o)}' for o in KNIFE_MESHES))

world = None
if not POSE_ONLY:
    world = decimate_copy(KNIFE_MESHES, 'world', weapon, 380); log(f'world copy: {tri_count(world)} tris')

# ----------------------------------------------------------------------------------------------- arms + pose
A = build_arms(weapon); R, Lh = A['R'], A['L']
# right hand: hammer grip. Palm on the handle's right face, fingers down/around, thumb forward against the guard.
R_ELBOW = (0.16, -0.30, -0.30)
# the handle lies across the upper palm (local y 0.070, just below the knuckles); fingers start at the lower-right and wrap under/left
R_M = hand_matrix_at((0, 0.070, -0.014), (0.0135, -0.006, -0.004), (-0.35, 0, -0.94), (-0.94, 0, 0.35))
R_CURL = {'f1': (86, 100), 'f2': (88, 102), 'f3': (90, 104), 'f4': (92, 106), 'thumb': (30, 60)}
R_THUMB = (-0.42, 0.62, -0.45)                            # hand-local: thumb lies forward along the top of the handle toward the guard
set_local_matrix(R['hand'], R_M); curl_abs(R, 'R', R_CURL, spread=0.5, thumb_dir=R_THUMB); aim_arm(R['hand'], R['arm'], R_ELBOW)
# left hand: relaxed, lower-left of the frame (world pose kept fixed while the knife moves; counter-keyed below)
L_WORLD = hand_matrix((-0.30, 0.13, 0.05), (0.15, 0.85, -0.50), (-0.70, 0.10, -0.35))     # back of the hand to the camera, hanging loosely
L_CURL = {'f1': (48, 55), 'f2': (52, 60), 'f3': (55, 62), 'f4': (58, 65), 'thumb': (10, 25)}
L_ELBOW_W = (-0.44, -0.10, -0.30)
log(f'arms tris: {sum(tri_report(A["arms"]).values())}')

# ----------------------------------------------------------------------------------------------- animation (single 30 fps timeline)
sc = bpy.context.scene
def key_weapon(f, loc=(0, 0, 0), rot=(0, 0, 0)): key(weapon, f, loc=IDLE_LOC + Vector(loc), rot=rot)
def key_knife(f, loc=(0, 0, 0), rot=(0, 0, 0)): key(knife, f, loc=loc, rot=rot)
def key_right(f, curl=None): k_hand(R, f, None, curl, R_ELBOW, spread=0.5)
IDLE_ROT = (15, 0, 18)                                     # idle: tip up-left a little so the blade reads in the FP frame
IDLE_LOC = Vector((-0.03, 0.0, 0.07))                      # held higher / more centred than a rifle grip
# idle 0-60 (loops)
for f, (dz, drx) in ((0, (0, 0)), (15, (0.002, 0.4)), (30, (0, 0)), (45, (-0.0018, -0.35)), (59, (0, 0))):
    key_weapon(f, (0, 0, dz), (IDLE_ROT[0] + drx, 0, IDLE_ROT[2]))
key_knife(0); key_right(0, R_CURL)
# equip 60-80: flips in from below-right, the knife spinning once about its own X axis before it lands in the grip
key_weapon(60, (0.12, -0.02, -0.28), (-30, 10, -25)); key_weapon(70, (0.03, 0.01, -0.06), (8, 3, 0)); key_weapon(79, (0, 0, 0), IDLE_ROT)
key_knife(60, (0, 0, 0), (-360, 0, 0)); key_knife(74, (0, 0, 0), (0, 0, 0)); key_knife(79)
key_right(60, {'f1': (30, 30), 'f2': (35, 35), 'f3': (35, 35), 'f4': (35, 35), 'thumb': (5, 10)}); key_right(74, R_CURL); key_right(79, R_CURL)
# fire 80-96: slash, wide horizontal arc right -> left, edge leading, snap back
key_weapon(80, (0, 0, 0), IDLE_ROT); key_weapon(83, (0.10, -0.06, 0.02), (5, 20, -55)); key_weapon(88, (-0.20, 0.10, -0.02), (-5, -35, 65))
key_weapon(92, (-0.06, 0.02, 0.0), (6, -10, 30)); key_weapon(95, (0, 0, 0), IDLE_ROT)
key_knife(80); key_knife(95)
# fire2 96-116: stab, forward thrust with a slight roll (edge sideways), pull back
key_weapon(96, (0, 0, 0), IDLE_ROT); key_weapon(100, (0.03, -0.06, -0.01), (-4, 40, 10)); key_weapon(105, (-0.04, 0.20, 0.02), (-8, 70, 4))
key_weapon(110, (-0.01, 0.06, 0.0), (0, 30, 12)); key_weapon(115, (0, 0, 0), IDLE_ROT)
# inspect 116-200: lift, twirl the knife twice about its axis in a loosened grip, roll to show the other side, regrip
key_weapon(116, (0, 0, 0), IDLE_ROT); key_weapon(130, (-0.05, -0.04, 0.05), (20, -30, 35)); key_weapon(165, (-0.05, -0.04, 0.05), (20, -30, 35))
key_weapon(182, (-0.02, -0.02, 0.02), (35, 150, 10)); key_weapon(199, (0, 0, 0), IDLE_ROT)
key_knife(116); key_knife(130); key_knife(150, (0, 0, 0.01), (720, 0, 0)); key_knife(165, (0, 0, 0), (720, 0, 0)); key_knife(199, (0, 0, 0), (720, 0, 0))
LOOSE = {'f1': (40, 45), 'f2': (45, 50), 'f3': (48, 52), 'f4': (50, 55), 'thumb': (10, 20)}
key_right(116, R_CURL); key_right(128, LOOSE); key_right(152, LOOSE); key_right(162, R_CURL); key_right(199, R_CURL)
bezier([weapon, knife, R['hand'], R['arm']] + [R[k] for k in R if k.startswith('f') or k.startswith('thumb')])
# left hand: keep its world pose fixed while the weapon root moves (it is a child of arms -> weapon): counter-key every 2 frames
curl_abs(Lh, 'L', L_CURL, spread=4)
for f in range(0, 200, 2):
    sc.frame_set(f); Wm = weapon.matrix_world.copy()
    set_local_matrix(Lh['hand'], Wm.inverted() @ L_WORLD)
    aim_arm(Lh['hand'], Lh['arm'], Wm.inverted() @ Vector(L_ELBOW_W))
    key_current(Lh['hand'], f); key_current(Lh['arm'], f)
for i in range(1, 5): key_current(Lh[f'f{i}'], 0); key_current(Lh[f'f{i}_k2'], 0)
key_current(Lh['thumb'], 0); key_current(Lh['thumb_k2'], 0)
for o in (Lh['hand'], Lh['arm']):
    for fc in o.animation_data.action.fcurves:
        for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
sc.frame_set(0)
if POSE_ONLY:
    from common import _studio
    _studio((0, 0.05, 0))
    sc.frame_set(0); c = weapon.matrix_world.translation
    render_closeups(WID, [('grip_right', tuple(c + Vector((0.30, -0.10, 0.10))), tuple(c), 60), ('grip_left', tuple(c + Vector((-0.30, -0.10, 0.06))), tuple(c), 60),
                          ('grip_top', tuple(c + Vector((0.05, -0.05, 0.32))), tuple(c), 60), ('fp', (-0.14, -0.33, 0.16), (-0.14, 1.0, 0.16), 26)], 0)
    log(f'[{time.time() - T0:.0f}s] pose-only closeups done'); sys.exit(0)

# ----------------------------------------------------------------------------------------------- export, json, save
tris = tri_report(weapon); kn = {o.name for o in KNIFE_MESHES}
log(f'[{time.time() - T0:.0f}s] tri counts: knife={sum(v for k, v in tris.items() if k in kn)}, arms={sum(tri_report(A["arms"]).values())}, world={tris["world"]}, total={sum(tris.values())}')
log('  per object: ' + ', '.join(f'{k}={v}' for k, v in tris.items() if v and (k in kn or k == 'world')))
log(f'  materials: {[m.name for m in bpy.data.materials]}')
glb = PUBLIC_WEAPONS / f'{WID}.glb'; export_glb(glb)
write_anim_json(PUBLIC_WEAPONS / f'{WID}.anim.json', CLIPS, EVENTS)
blend = ASSETS_SRC / f'{WID}.blend'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True); log(f'  saved {blend} ({os.path.getsize(blend) / 1e6:.2f} MB)')
if '--no-render' not in sys.argv:
    render_review(WID, CLIPS, arms=A['arms'], world=world, gun_center=(0, 0.07, 0.0), gun_len=0.30, turntable=False)
verify_glb(glb)
log(f'[{time.time() - T0:.0f}s] done')
Path(EVIDENCE / f'{WID}_build_log.txt').write_text('\n'.join(LOG))
