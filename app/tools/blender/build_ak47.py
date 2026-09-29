"""Regenerates assets-source/blender/ak47.blend, public/assets/weapons/ak47.glb + ak47.anim.json and the review renders.
Run: python3 tools/blender/build_ak47.py   (headless bpy 4.5). Deterministic; see PIPELINE.md and BUILD_LOG.md."""
import sys, math, time, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *
from common import _finger_segment

WID = 'ak47'
B = 0.035                       # bore axis height above the weapon origin (rear of pistol grip / trigger area)
CLIPS = {'idle': (0, 60), 'equip': (60, 90), 'fire': (90, 102), 'reload': (102, 180), 'inspect': (180, 280)}
EVENTS = {'reload_mag_out': 120, 'reload_mag_in': 150, 'reload_end': 180}
T0 = time.time()
POSE_ONLY = '--pose-only' in sys.argv        # fast hand-pose iteration: no bake / export / save, closeup renders only

reset_scene(frame_end=280)
weapon = empty('weapon', (0, 0, 0), None, 0.05)
MB, SB, WD, PL, RB = 'metal_blued', 'steel_bright', 'wood', 'polymer', 'rubber'

# ------------------------------------------------------------------------------------------------- receiver
def rect(y0, y1, z0, z1): return [(y0, z0), (y1, z0), (y1, z1), (y0, z1)]
parts = []
body = profile_extrude('body', [(-0.095, 0.034), (-0.095, 0.000), (-0.082, -0.014), (0.165, -0.014), (0.165, 0.034)], -0.0165, 0.0165, MB)
add_bevel(body, 0.0025, 2); parts.append(body)
# dust cover: rounded top (profile arc) + bevelled corners
arc = [(y, z) for y, z in rect(-0.088, 0.150, 0.036, 0.040)][:2]
cover_prof = [(-0.088, 0.034), (0.150, 0.034), (0.150, 0.057), (-0.088, 0.057)]
cover = profile_extrude('cover', cover_prof, -0.0158, 0.0158, MB); add_bevel(cover, 0.009, 3); parts.append(cover)
# rear sight block with barrel collar, leaf sight, slider, ears
rsb = box('rsb', (0, 0.172, 0.046), (0.028, 0.045, 0.046), MB); add_bevel(rsb, 0.003, 2); parts.append(rsb)
parts.append(cyl('rsb_collar', 0.0165, 0.050, (0, 0.172, B), 'Y', 24, mat=MB))
leaf = box('leaf', (0, 0.160, 0.0715), (0.020, 0.070, 0.005), MB); add_bevel(leaf, 0.0012, 1); parts.append(leaf)
slider = box('slider', (0, 0.150, 0.0775), (0.022, 0.012, 0.009), MB); add_bevel(slider, 0.0015, 1); parts.append(slider)
for sx in (-1, 1):
    ear = box(f'rs_ear{sx}', (sx * 0.0125, 0.190, 0.0755), (0.004, 0.012, 0.018), MB); add_bevel(ear, 0.0018, 2); parts.append(ear)
# rear cover button (recoil spring guide) and front trunnion block
btn = box('btn', (0, -0.092, 0.045), (0.012, 0.010, 0.016), MB); add_bevel(btn, 0.002, 2); parts.append(btn)
# rivets (stamped receiver)
for sx in (-1, 1):
    for (ry, rz) in ((-0.074, 0.018), (-0.074, -0.004), (0.138, 0.022), (0.150, -0.003), (0.128, -0.003), (0.022, -0.006), (-0.020, -0.006)):
        parts.append(cyl(f'rivet', 0.003, 0.0022, (sx * 0.0168, ry, rz), 'X', 10, mat=MB))
receiver = join(parts, 'receiver', weapon)
# ejection port (right side, through receiver wall + cover) and AKM-style dimple above the mag well (both sides)
boolean_cut(receiver, box('cut_port', (0.020, 0.072, 0.040), (0.020, 0.070, 0.024)))
for sx in (-1, 1):
    rings = [place(ellipse2d(0.036, 0.015, 16), (sx * (0.0165 - 0.0012), 0.084, 0.011), (0, 1, 0), (0, 0, 1)),
             place(ellipse2d(0.040, 0.019, 16), (sx * 0.026, 0.084, 0.011), (0, 1, 0), (0, 0, 1))]
    boolean_cut(receiver, loft('cut_dimple', rings))
shade_smooth(receiver, 30)
muzzle = empty('muzzle', (0, 0.600, B), receiver, 0.01); eject = empty('eject', (0.022, 0.072, B + 0.006), receiver, 0.01)

# safety / selector lever on the right side (separate part, child of receiver)
safety = profile_extrude('safety', [(-0.012, 0.004), (0.080, 0.004), (0.090, 0.008), (0.092, 0.028), (0.084, 0.030), (0.080, 0.018), (-0.012, 0.018)], 0.0166, 0.0184, MB, receiver)
add_bevel(safety, 0.0008, 1)
piv = cyl('safety_pivot', 0.0085, 0.003, (0.0181, -0.004, 0.011), 'X', 16, mat=MB)
safety = join([safety, piv], 'safety', receiver); shade_smooth(safety, 30)

# ------------------------------------------------------------------------------------------------- barrel group
bparts = []
bparts.append(cyl('barrel_rear', 0.0125, 0.165, (0, 0.2425, B), 'Y', 24, mat=MB))
bparts.append(cyl('barrel_mid', 0.0098, 0.215, (0, 0.4275, B), 'Y', 24, mat=MB))
bparts.append(cyl('barrel_front', 0.0092, 0.060, (0, 0.5525, B), 'Y', 24, mat=MB))
bparts.append(cyl('bore', 0.0046, 0.014, (0, 0.575, B), 'Y', 12, mat=RB))       # dark bore plug inside the brake
# gas block: collar + upper block with angled gas port, cleaning-rod guide below
gb = cyl('gas_collar', 0.0165, 0.036, (0, 0.333, B), 'Y', 24, mat=MB); bparts.append(gb)
gbb = box('gas_block', (0, 0.333, B + 0.022), (0.024, 0.036, 0.034), MB); add_bevel(gbb, 0.003, 2); bparts.append(gbb)
gbp = profile_extrude('gas_port', [(0.318, B + 0.030), (0.352, B + 0.030), (0.340, B + 0.050), (0.322, B + 0.050)], -0.010, 0.010, MB); add_bevel(gbp, 0.002, 2); bparts.append(gbp)
lug = box('rod_guide', (0, 0.333, B - 0.020), (0.012, 0.030, 0.012), MB); add_bevel(lug, 0.002, 2); bparts.append(lug)
bparts.append(cyl('gas_tube', 0.0100, 0.150, (0, 0.265, B + 0.031), 'Y', 20, mat=MB))
bparts.append(cyl('clean_rod', 0.0020, 0.250, (0, 0.435, B - 0.0175), 'Y', 8, mat=SB))
# front sight: base collar, upper block, protective ears (rounded), post with base
bparts.append(cyl('fs_collar', 0.0160, 0.032, (0, 0.536, B), 'Y', 24, mat=MB))
fsb = box('fs_block', (0, 0.536, B + 0.016), (0.022, 0.030, 0.026), MB); add_bevel(fsb, 0.003, 2); bparts.append(fsb)
for sx in (-1, 1):
    ear = profile_extrude(f'fs_ear{sx}', [(0.526, B + 0.020), (0.546, B + 0.020), (0.546, B + 0.046), (0.542, B + 0.056), (0.530, B + 0.056), (0.526, B + 0.046)], sx * 0.0075, sx * 0.0115, MB)
    add_bevel(ear, 0.0025, 2); bparts.append(ear)
bparts.append(cyl('fs_postbase', 0.0040, 0.010, (0, 0.536, B + 0.032), 'Z', 12, mat=SB))
bparts.append(cyl('fs_post', 0.0016, 0.022, (0, 0.536, B + 0.043), 'Z', 8, mat=SB))
bparts.append(cyl('fs_pin', 0.0022, 0.026, (0, 0.536, B + 0.009), 'X', 8, mat=SB))
# slanted muzzle brake (open face cut so it faces up-right, longer at lower-left)
rings = []
for y, r in ((0.560, 0.0110), (0.564, 0.0125), (0.582, 0.0125)):
    rings.append(place(ellipse2d(2 * r, 2 * r, 24), (0, y, B), (1, 0, 0), (0, 0, 1)))
last = []
for i in range(24):
    a = 2 * math.pi * i / 24; x, z = math.cos(a), math.sin(a)
    d = (x * 0.707 + z * 0.707)               # +1 at upper-right
    last.append(Vector((0.0125 * x, 0.602 - 0.011 * (d + 1) / 2 - 0.002, B + 0.0125 * z)))
rings.append(last)
inner_face = [Vector((0.0085 * math.cos(2 * math.pi * i / 24), last[i].y - 0.0005, B + 0.0085 * math.sin(2 * math.pi * i / 24))) for i in range(24)]
rings.append(inner_face)
rings.append(place(ellipse2d(0.017, 0.017, 24), (0, 0.572, B), (1, 0, 0), (0, 0, 1)))
brake = loft('brake', rings, True, True, MB); bparts.append(brake)
bparts.append(cyl('brake_pin', 0.0025, 0.030, (0, 0.567, B - 0.008), 'X', 8, mat=SB))
barrel = join(bparts, 'barrel', weapon); shade_smooth(barrel, 30)

# ------------------------------------------------------------------------------------------------- handguards (wood)
def hg_ring(y, w, h, zc, k=1.9): return ring_y(ellipse2d(w, h, 20, k=k), y, dz=zc)
lower = loft('hg_lower', [hg_ring(0.198, 0.040, 0.034, B - 0.012, 2.2), hg_ring(0.212, 0.044, 0.038, B - 0.013, 2.2), hg_ring(0.250, 0.047, 0.040, B - 0.014, 2.2),
                           hg_ring(0.290, 0.044, 0.038, B - 0.013, 2.2), hg_ring(0.308, 0.040, 0.034, B - 0.012, 2.2)], True, True, WD)
upper = loft('hg_upper', [hg_ring(0.205, 0.032, 0.026, B + 0.033, 2.0), hg_ring(0.250, 0.034, 0.028, B + 0.034, 2.0), hg_ring(0.300, 0.032, 0.026, B + 0.033, 2.0)], True, True, WD)
# finger grooves on the lower guard sides are suggested by the bake; add a subtle ridge line (two thin strips)
handguard = join([lower, upper], 'handguard', weapon); add_bevel(handguard, 0.0015, 2, 40); apply_mods(handguard); shade_smooth(handguard, 40)
# metal retainers: rear plate + front ferrule (child parts of barrel group, plain material)
ret_parts = [box('hg_retainer', (0, 0.195, B - 0.010), (0.040, 0.008, 0.040), MB), cyl('hg_ferrule', 0.0195, 0.010, (0, 0.312, B - 0.011), 'Y', 20, mat=MB),
             cyl('uhg_ferrule', 0.0160, 0.008, (0, 0.302, B + 0.032), 'Y', 16, mat=MB), cyl('uhg_ferrule_r', 0.0150, 0.008, (0, 0.203, B + 0.032), 'Y', 16, mat=MB)]
for p in ret_parts[:1]: add_bevel(p, 0.002, 2)
retainers = join(ret_parts, 'hg_retainers', barrel); shade_smooth(retainers, 30)

# ------------------------------------------------------------------------------------------------- magazine (banana)
MAG_ORIGIN = Vector((0, 0.082, -0.014))
def mag_path(n=11, length=0.190, phi0=6.0, phi1=44.0):
    pts, tans = [], []; p = Vector((0, 0, 0.014)); ds = length / (n - 1)
    for i in range(n):
        phi = math.radians(phi0 + (phi1 - phi0) * (i / (n - 1)) ** 1.15)
        t = Vector((0, math.sin(phi), -math.cos(phi)))
        pts.append(p.copy()); tans.append(t); p = p + t * ds
    return pts, tans
def mag_rings(offset_x=0.0, offset_n=0.0, w=0.025, d=0.068, r=0.004):
    pts, tans = mag_path(); rings = []
    for p, t in zip(pts, tans):
        nrm = Vector((0, t.z, -t.y)) * -1     # forward-ish in-plane normal
        rings.append(place(rounded_rect2d(w, d, r, 4), p + Vector((offset_x, 0, 0)) + nrm * offset_n, (1, 0, 0), nrm))
    return rings, pts, tans
rings, pts, tans = mag_rings()
# floor plate: last two rings slightly larger
nrm_end = Vector((0, tans[-1].z, -tans[-1].y)) * -1
rings.append(place(rounded_rect2d(0.028, 0.072, 0.003, 4), pts[-1] + tans[-1] * 0.001, (1, 0, 0), nrm_end))
rings.append(place(rounded_rect2d(0.028, 0.072, 0.003, 4), pts[-1] + tans[-1] * 0.012, (1, 0, 0), nrm_end))
mag_body = loft('mag_body', rings, True, True, MB); add_bevel(mag_body, 0.0015, 2, 35)
mparts = [mag_body]
for sx in (-1, 1):
    for on in (-0.016, 0.016):
        rr, _, _ = mag_rings(sx * 0.0127, on, 0.0022, 0.006, 0.0)
        mparts.append(loft(f'mag_rib', rr[:-1], True, True, MB))
# feed lips / locking lug at the top (mostly inside the receiver)
mparts.append(box('mag_lug', (0, 0.030, 0.020), (0.020, 0.010, 0.012), MB))
mag = join(mparts, 'mag', weapon); mag.location = MAG_ORIGIN; shade_smooth(mag, 35)

# ------------------------------------------------------------------------------------------------- grip, trigger, guard
gaxis = Vector((0, -0.42, -0.91)).normalized(); gv = Vector((0, 0.91, -0.42)).normalized(); gtop = Vector((0, -0.034, -0.006))
def grip_ring(s, w, d, fwd=0.0, k=1.7):
    c = gtop + gaxis * (0.114 * s) + gv * fwd
    return place(ellipse2d(w, d, 18, k=k), c, (1, 0, 0), gv)
grip = loft('grip', [grip_ring(0.0, 0.030, 0.040), grip_ring(0.2, 0.030, 0.040, 0.0), grip_ring(0.45, 0.031, 0.041, 0.001), grip_ring(0.7, 0.033, 0.044, 0.003),
                     grip_ring(0.88, 0.035, 0.048, 0.004), grip_ring(0.97, 0.034, 0.047, 0.004), grip_ring(1.0, 0.028, 0.040, 0.003)], True, True, PL, weapon)
add_bevel(grip, 0.004, 2, 40); apply_mods(grip); shade_smooth(grip, 40)
guard = sweep('trigger_guard', [(0.052, -0.008), (0.050, -0.038), (0.042, -0.051), (0.030, -0.055), (-0.020, -0.055), (-0.032, -0.049), (-0.038, -0.033), (-0.040, -0.008)], 0.010, 0.0035, MB, weapon)
add_bevel(guard, 0.0008, 1)
magrel = box('mag_release', (0, 0.058, -0.027), (0.008, 0.008, 0.028), MB); add_bevel(magrel, 0.002, 2)
guard = join([guard, magrel], 'trigger_guard', weapon); shade_smooth(guard, 30)
TRIG_ORIGIN = Vector((0, 0.014, -0.012))
trigger = sweep('trigger', [(0.0, 0.002), (0.001, -0.010), (0.000, -0.020), (-0.004, -0.028), (-0.010, -0.033)], 0.0065, 0.0035, SB, weapon)
add_bevel(trigger, 0.0008, 1); apply_mods(trigger); trigger.location = TRIG_ORIGIN; shade_smooth(trigger, 30)

# ------------------------------------------------------------------------------------------------- stock (wood) + butt plate
def stock_ring(y, zc, h, w): return ring_y(ellipse2d(w, h, 20, k=2.4), y, dz=zc)
stock = loft('stock', [stock_ring(-0.085, 0.010, 0.046, 0.028), stock_ring(-0.100, 0.008, 0.048, 0.030), stock_ring(-0.125, 0.003, 0.054, 0.032), stock_ring(-0.170, -0.006, 0.066, 0.034),
                       stock_ring(-0.215, -0.016, 0.082, 0.036), stock_ring(-0.255, -0.026, 0.098, 0.038), stock_ring(-0.284, -0.032, 0.110, 0.039)], True, True, WD, weapon)
add_bevel(stock, 0.004, 2, 40); apply_mods(stock); shade_smooth(stock, 40)
butt = box('butt_plate', (0, -0.289, -0.032), (0.040, 0.010, 0.113), RB, weapon); add_bevel(butt, 0.003, 2); apply_mods(butt); shade_smooth(butt, 30)
sling = box('sling_loop', (0.0, -0.240, -0.069), (0.006, 0.016, 0.006), MB, stock); add_bevel(sling, 0.0015, 1); apply_mods(sling)

# ------------------------------------------------------------------------------------------------- bolt carrier + charging handle
BOLT_ORIGIN = Vector((0.018, 0.070, 0.040))
bp = [box('carrier', (0.008, 0.070, 0.038), (0.016, 0.100, 0.020), SB)]
add_bevel(bp[0], 0.002, 2)
bp.append(cyl('ch_stem', 0.0055, 0.020, (0.024, 0.070, 0.040), 'X', 16, mat=SB))
knob = cyl('ch_knob', 0.0085, 0.014, (0.040, 0.070, 0.040), 'X', 16, mat=SB); add_bevel(knob, 0.003, 2); bp.append(knob)
bolt = join(bp, 'bolt', weapon); bolt.location = BOLT_ORIGIN
for v in bolt.data.vertices: v.co -= BOLT_ORIGIN
shade_smooth(bolt, 30)

# gun parts list (for the world copy and reports)
GUN_MESHES = [receiver, safety, barrel, retainers, handguard, mag, grip, guard, trigger, stock, butt, sling, bolt]
log(f'[{time.time() - T0:.0f}s] geometry built: ' + ', '.join(f'{o.name}={tri_count(o)}' for o in GUN_MESHES))

# ------------------------------------------------------------------------------------------------- bake
t = time.time()
if not POSE_ONLY:
    bake_object(receiver, 'metal', MB, prefix=f'{WID}_'); bake_object(mag, 'metal', MB, prefix=f'{WID}_')
    bake_object(stock, 'wood', WD, prefix=f'{WID}_'); bake_object(handguard, 'wood', WD, prefix=f'{WID}_')
    log(f'[{time.time() - T0:.0f}s] bakes done in {time.time() - t:.1f}s')

# ------------------------------------------------------------------------------------------------- world (drop) copy
world = None
if not POSE_ONLY:
    world = decimate_copy(GUN_MESHES, 'world', weapon, 1400)
    log(f'world copy: {tri_count(world)} tris')

# ------------------------------------------------------------------------------------------------- arms + pose
A = build_arms(weapon); R, Lh = A['R'], A['L']
# right hand on the pistol grip: palm against the grip's right/rear face, fingers wrapping the front, index on the trigger
R_M = hand_matrix_at((-0.029, 0.092, 0.001), (0.023, -0.029, -0.042), (-0.25, 0.86, -0.44), (-1, 0, 0))
set_local_matrix(R['hand'], R_M)
curl_fingers(R, {'f1': (22, 30), 'f2': (85, 95), 'f3': (88, 98), 'f4': (90, 100), 'thumb': (45, 50)}, spread=1, lift={'f1': 35})
aim_arm(R['hand'], R['arm'], (0.14, -0.42, -0.24))
# left hand under the handguard: palm up/right cupping the guard, fingers wrapping over the right side
L_FWD = (0.90, 0.22, -0.30); L_NRM = (0.30, 0, 0.95)
L_ELBOW = (-0.12, -0.10, -0.32)
L_REST_CURL = {'f1': (62, 50), 'f2': (66, 55), 'f3': (66, 55), 'f4': (68, 58), 'thumb': (10, 25)}
L_REST_M = hand_matrix_at((0, 0.046, -0.014), (-0.006, 0.245, 0.003), L_FWD, L_NRM)
set_local_matrix(Lh['hand'], L_REST_M); curl_fingers(Lh, L_REST_CURL, spread=3)
aim_arm(Lh['hand'], Lh['arm'], L_ELBOW)
log(f'arms tris: {sum(tri_report(A["arms"]).values())}')

# ------------------------------------------------------------------------------------------------- animation (single 30 fps timeline)
def key_weapon(f, loc=(0, 0, 0), rot=(0, 0, 0)): key(weapon, f, loc=loc, rot=rot)
def key_left(f, M=None, curl=None, elbow=L_ELBOW):
    """Key the left hand (matrix in weapon space), its finger empties and forearm aim."""
    if M is not None: set_local_matrix(Lh['hand'], M)
    if curl is not None: curl_fingers(Lh, curl, spread=3)
    aim_arm(Lh['hand'], Lh['arm'], elbow)
    key_current(Lh['hand'], f); key_current(Lh['arm'], f)
    for i in range(1, 5): key_current(Lh[f'f{i}'], f); key_current(Lh[f'f{i}_k2'], f)
    key_current(Lh['thumb'], f); key_current(Lh['thumb_k2'], f)
def mag_matrix(loc, rot_x_deg):
    return Matrix.Translation(MAG_ORIGIN + Vector(loc)) @ Matrix.Rotation(math.radians(rot_x_deg), 4, 'X')
def key_mag(f, loc=(0, 0, 0), rot_x=0.0):
    key(mag, f, loc=MAG_ORIGIN + Vector(loc), rot=(rot_x, 0, 0)); return mag_matrix(loc, rot_x)
# hand pose on the magazine (weapon space, at mag rest): palm on the mag's left face, fingers around the front, thumb behind
L_MAG_M = hand_matrix((-0.062, 0.050, -0.085), (0.92, 0.30, -0.25), (0.35, -0.10, 0.93))
L_MAG_M = hand_matrix((-0.030, 0.006, -0.108), (0.0, 0.94, -0.34), (1, 0, 0))
MAG_CURL = {'f1': (55, 45), 'f2': (60, 50), 'f3': (60, 50), 'f4': (62, 52), 'thumb': (15, 30)}
OPEN_CURL = {'f1': (15, 10), 'f2': (20, 15), 'f3': (20, 15), 'f4': (22, 18), 'thumb': (0, 10)}
H_REL = mag_matrix((0, 0, 0), 0).inverted() @ L_MAG_M       # hand relative to the mag while holding it
# charging-handle grab pose: hand over the top of the receiver, palm facing down/right, fingers hooked on the handle
L_CH_M = hand_matrix((-0.010, 0.095, 0.085), (0.55, -0.15, -0.82), (0.70, 0.0, -0.70))
CH_CURL = {'f1': (70, 60), 'f2': (72, 62), 'f3': (74, 64), 'f4': (76, 66), 'thumb': (20, 35)}

# idle 0-60: subtle breathing sway (loops: frame 59 ~ frame 0)
for f, (dz, rx) in ((0, (0, 0)), (15, (0.0018, 0.25)), (30, (0.0, 0.0)), (45, (-0.0016, -0.22)), (59, (0, 0))):
    key_weapon(f, (0, 0, dz), (rx, 0.4 * dz / 0.0018 if dz else 0, 0))
key_left(0, L_REST_M, L_REST_CURL); key_mag(0); key(bolt, 0, loc=BOLT_ORIGIN); key(trigger, 0, rot=(0, 0, 0))
# equip 60-90: rises from below-right, muzzle down, settles with a small overshoot
key_weapon(60, (0.13, -0.03, -0.30), (-42, 8, -28)); key_weapon(72, (0.04, 0.0, -0.09), (-12, 3, -9)); key_weapon(82, (-0.004, 0.004, 0.006), (2.5, -0.5, 1.5)); key_weapon(89, (0, 0, 0), (0, 0, 0))
key_left(59, L_REST_M, L_REST_CURL); key_left(89, L_REST_M, L_REST_CURL)
# fire 90-102: recoil kick back/up, bolt carrier cycles 6 cm, trigger pulls
key_weapon(90); key_weapon(92, (0.001, -0.015, 0.006), (2.6, -1.2, 0.6)); key_weapon(95, (0.0, -0.008, 0.003), (1.2, 0.4, -0.2)); key_weapon(101)
key(bolt, 90, loc=BOLT_ORIGIN); key(bolt, 93, loc=BOLT_ORIGIN + Vector((0, -0.060, 0))); key(bolt, 97, loc=BOLT_ORIGIN); key(bolt, 101, loc=BOLT_ORIGIN)
key(trigger, 90, rot=(0, 0, 0)); key(trigger, 92, rot=(-14, 0, 0)); key(trigger, 98, rot=(0, 0, 0))
key_left(90, L_REST_M, L_REST_CURL); key_left(101, L_REST_M, L_REST_CURL)
# reload 102-180
key_weapon(102); key_weapon(112, (-0.03, -0.02, 0.10), (14, 30, 8)); key_weapon(150, (-0.03, -0.02, 0.10), (14, 30, 8)); key_weapon(158, (-0.02, -0.02, 0.06), (8, 10, 4)); key_weapon(168, (-0.02, -0.02, 0.06), (8, 10, 4)); key_weapon(179)
key_left(102, L_REST_M, L_REST_CURL); key_left(107, L_REST_M @ Matrix.Translation((0.03, -0.06, -0.03)), OPEN_CURL)
Mm = key_mag(102); key_mag(111); key_left(111, Mm @ H_REL, MAG_CURL)                     # grab the mag
Mm = key_mag(120, (0, 0.004, -0.010), 26); key_left(120, Mm @ H_REL, MAG_CURL)              # rocked forward, unlatched (event reload_mag_out)
Mm = key_mag(128, (0, 0.05, -0.16), 40); key_left(128, Mm @ H_REL, MAG_CURL)                # pulled down/forward
key_mag(131, (0.02, 0.10, -0.40), 55); key_left(133, Mm @ H_REL @ Matrix.Translation((0, -0.05, -0.16)), OPEN_CURL)   # old mag dropped away
Mm = key_mag(132, (-0.04, 0.02, -0.42), 30)                                                  # fresh mag appears low
key_mag(136, (-0.04, 0.02, -0.42), 30); key_left(136, Mm @ H_REL, MAG_CURL)                 # hand takes fresh mag (out of view)
Mm = key_mag(145, (0, 0.03, -0.045), 24); key_left(145, Mm @ H_REL, MAG_CURL)               # front lug hooked
Mm = key_mag(150); key_left(150, Mm @ H_REL, MAG_CURL)                                       # rocked back & latched (event reload_mag_in)
key_left(152, Mm @ H_REL, MAG_CURL)
key_left(158, L_CH_M, CH_CURL)                                                                # over the top to the charging handle
key(bolt, 158, loc=BOLT_ORIGIN); key(bolt, 163, loc=BOLT_ORIGIN + Vector((0, -0.060, 0))); key(bolt, 165, loc=BOLT_ORIGIN + Vector((0, -0.060, 0))); key(bolt, 168, loc=BOLT_ORIGIN)
key_left(163, L_CH_M @ Matrix.Translation(L_CH_M.to_3x3().inverted() @ Vector((0, -0.060, 0))), CH_CURL)
key_left(165, L_CH_M @ Matrix.Translation(L_CH_M.to_3x3().inverted() @ Vector((0, -0.060, 0))), CH_CURL)
key_left(168, L_CH_M @ Matrix.Translation(L_CH_M.to_3x3().inverted() @ Vector((0.0, -0.045, 0.03))), OPEN_CURL)   # released
key_left(179, L_REST_M, L_REST_CURL); key_mag(179); key(bolt, 179, loc=BOLT_ORIGIN)
# inspect 180-280: show the left side, then roll to show the right side, return
key_weapon(180); key_weapon(205, (-0.06, -0.05, 0.05), (-4, -25, 58)); key_weapon(222, (-0.03, -0.03, 0.03), (-1, -15, 25))
key_weapon(250, (-0.01, -0.05, 0.05), (6, -115, -28)); key_weapon(268, (-0.01, -0.01, 0.01), (1, -20, -4)); key_weapon(279)
key_left(180, L_REST_M, L_REST_CURL); key_left(279, L_REST_M, L_REST_CURL)
for o in [weapon, mag, bolt, trigger, Lh['hand'], Lh['arm']] + [Lh[k] for k in Lh if k.startswith('f') or k.startswith('thumb')]:
    if o.animation_data and o.animation_data.action:
        for fc in o.animation_data.action.fcurves:
            for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'; kp.easing = 'AUTO'
bpy.context.scene.frame_set(0)
if POSE_ONLY:
    from common import _studio
    _studio((0, 0.15, 0))
    V = [('handR_right', (0.32, -0.28, -0.12), (0.02, -0.05, -0.05), 70), ('handR_left', (-0.32, -0.22, -0.14), (0.0, -0.04, -0.05), 70),
         ('handL_left', (-0.36, 0.12, -0.14), (-0.02, 0.24, 0.0), 70), ('handL_front', (0.06, 0.62, -0.18), (0, 0.24, 0), 70), ('handL_below', (0.02, 0.28, -0.42), (0, 0.24, 0), 50), ('handR_rear', (-0.16, -0.30, 0.12), (0.0, -0.05, -0.04), 60)]
    render_closeups(WID, V, 0)
    render_closeups(WID, [('mag_grab', (-0.36, 0.00, -0.22), (-0.01, 0.08, -0.10), 60), ('mag_grab_r', (0.34, -0.05, -0.20), (0.0, 0.08, -0.10), 60)], 118)
    render_closeups(WID, [('charge', (-0.30, -0.05, 0.22), (0.0, 0.07, 0.05), 60), ('charge_r', (0.30, -0.15, 0.20), (0.0, 0.07, 0.05), 60)], 163)
    render_closeups(WID, [('fp_rest', (-0.14, -0.33, 0.16), (-0.14, 1.0, 0.16), 26)], 0)
    log(f'[{time.time() - T0:.0f}s] pose-only closeups done'); sys.exit(0)

# ------------------------------------------------------------------------------------------------- export, json, save
tris = tri_report(weapon); gun_tris = sum(v for k, v in tris.items() if k in {o.name for o in GUN_MESHES}); arms_tris = sum(tri_report(A['arms']).values())
log(f'[{time.time() - T0:.0f}s] tri counts: gun(viewmodel)={gun_tris}, arms={arms_tris}, world={tris["world"]}, total={sum(tris.values())}')
log('  per object: ' + ', '.join(f'{k}={v}' for k, v in tris.items() if v))
log(f'  materials: {[m.name for m in bpy.data.materials]}; images: {[(i.name, i.size[0]) for i in bpy.data.images if i.name != "Render Result"]}')
glb = PUBLIC_WEAPONS / f'{WID}.glb'; export_glb(glb)
write_anim_json(PUBLIC_WEAPONS / f'{WID}.anim.json', CLIPS, EVENTS)
blend = ASSETS_SRC / f'{WID}.blend'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True); log(f'  saved {blend} ({os.path.getsize(blend) / 1e6:.2f} MB)')

# ------------------------------------------------------------------------------------------------- review renders + verification
if '--no-render' not in sys.argv:
    render_review(WID, CLIPS, arms=A['arms'], world=world, gun_center=(0, 0.16, 0.0), gun_len=0.9, turntable='--quick' not in sys.argv)
verify_glb(glb)
log(f'[{time.time() - T0:.0f}s] done')
Path(EVIDENCE / f'{WID}_build_log.txt').write_text('\n'.join(LOG))
