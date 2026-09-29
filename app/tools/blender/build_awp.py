"""Regenerates assets-source/blender/awp.blend, public/assets/weapons/awp.glb + awp.anim.json and the review renders.
Run: python3 tools/blender/build_awp.py [--quick|--no-render|--pose-only]  (headless bpy 4.5). See PIPELINE.md / BUILD_LOG.md.
AWP: 1.20 m bolt-action sniper rifle, dark green polymer thumbhole stock + forend, fluted barrel, large scope, box mag."""
import sys, math, time, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

WID = 'awp'
B = 0.040                        # bore axis height above the weapon origin (rear of pistol grip / trigger area)
CLIPS = {'idle': (0, 60), 'equip': (60, 90), 'fire': (90, 104), 'rechamber': (104, 140), 'reload': (140, 230), 'inspect': (230, 330)}
EVENTS = {'rechamber_open': 121, 'rechamber_close': 133, 'reload_mag_out': 160, 'reload_mag_in': 195, 'reload_end': 230}
T0 = time.time()
POSE_ONLY = '--pose-only' in sys.argv

reset_scene(frame_end=330)
weapon = empty('weapon', (0, 0, 0), None, 0.05)
MB, MD, SB, PG, RB, GL = 'metal_blued', 'metal_dark', 'steel_bright', 'polymer_green', 'rubber', 'glass'

def tube_along(name, pts, radii, mat=None, parent=None, segs=14):
    """Round tube through 3D points (radius per point), capped."""
    P = [Vector(p) for p in pts]; rings = []
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        u = t.cross(Vector((0, 1, 0))); u = u.normalized() if u.length > 1e-6 else Vector((1, 0, 0)); v = t.cross(u).normalized()
        rings.append(place(ellipse2d(2 * radii[i], 2 * radii[i], segs), p, u, v))
    return loft(name, rings, True, True, mat, parent)

def annulus(name, r_out, r_in, y0, y1, center, mat=None, segs=32):
    c = Vector(center); ro = ellipse2d(2 * r_out, 2 * r_out, segs); ri = ellipse2d(2 * r_in, 2 * r_in, segs)
    rings = [place(ri, (c.x, y0, c.z), (1, 0, 0), (0, 0, 1)), place(ro, (c.x, y0, c.z), (1, 0, 0), (0, 0, 1)),
             place(ro, (c.x, y1, c.z), (1, 0, 0), (0, 0, 1)), place(ri, (c.x, y1, c.z), (1, 0, 0), (0, 0, 1)), place(ri, (c.x, y0 + 1e-5, c.z), (1, 0, 0), (0, 0, 1))]
    return loft(name, rings, False, False, mat)

def loop(name, center, r, thick, mat=None, segs=12):
    """Small sling-swivel loop (torus with square section) in the YZ plane."""
    c = Vector(center); rings = []
    for i in range(segs + 1):
        a = 2 * math.pi * (i % segs) / segs; p = c + Vector((0, r * math.cos(a), r * math.sin(a)))
        rad = Vector((0, math.cos(a), math.sin(a)))
        rings.append(place(rounded_rect2d(thick, thick, 0, 1), p, (1, 0, 0), rad))
    return loft(name, rings, False, False, mat)

# ------------------------------------------------------------------------------------------------- receiver (steel action)
parts = []
sec = lambda w, h: ellipse2d(w, h, 24, k=1.8)
parts.append(loft('action', [ring_y(sec(0.036, 0.038), -0.030, dz=B), ring_y(sec(0.038, 0.040), -0.020, dz=B), ring_y(sec(0.038, 0.040), 0.215, dz=B), ring_y(sec(0.034, 0.036), 0.222, dz=B)], True, True, MB))
rail = box('rail', (0, 0.095, B + 0.025), (0.021, 0.232, 0.011), MB); add_bevel(rail, 0.0025, 2); parts.append(rail)
for i in range(9):                                                        # rail slots (thin dark strips)
    parts.append(box(f'slot{i}', (0, -0.005 + i * 0.024, B + 0.0305), (0.0215, 0.005, 0.0016), RB))
parts.append(cyl('trunnion', 0.0205, 0.030, (0, 0.215, B), 'Y', 24, mat=MB))
parts.append(box('tang', (0, -0.040, B - 0.008), (0.030, 0.030, 0.022), MB))
receiver = join(parts, 'receiver', weapon)
boolean_cut(receiver, box('cut_port', (0.019, 0.105, B + 0.010), (0.024, 0.080, 0.026)))       # ejection port (right/top)
shade_smooth(receiver, 30)
muzzle = empty('muzzle', (0, 0.892, B), receiver, 0.01); eject = empty('eject', (0.024, 0.105, B + 0.008), receiver, 0.01)

# ------------------------------------------------------------------------------------------------- bolt (handle + body + shroud)
BOLT_ORIGIN = Vector((0, 0.075, B)); KNOB_LOCAL = Vector((0.056, 0.0, -0.030))
bp = [cyl('bolt_body', 0.0125, 0.175, (0, 0.065, B), 'Y', 20, mat=SB),
      cyl('bolt_shroud', 0.0140, 0.036, (0, -0.040, B), 'Y', 20, mat=MD),
      cyl('bolt_cap', 0.0140, 0.010, (0, -0.062, B), 'Y', 20, r2=0.010, mat=MD),
      tube_along('bolt_handle', [(0.012, 0.075, B), (0.030, 0.075, B), (0.043, 0.075, B - 0.006), (0.052, 0.075, B - 0.020)], [0.0055, 0.0055, 0.0050, 0.0048], MD)]
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.0115, matrix=Matrix.Translation((BOLT_ORIGIN + KNOB_LOCAL)) @ Matrix.Diagonal((1.0, 1.0, 1.15, 1.0)))
bp.append(mesh_from_bm('bolt_knob', bm, get_mat(MD)))
bolt = join(bp, 'bolt', weapon); bolt.location = BOLT_ORIGIN
for v in bolt.data.vertices: v.co -= BOLT_ORIGIN
shade_smooth(bolt, 35)

# ------------------------------------------------------------------------------------------------- barrel (fluted) + muzzle brake
bparts = [cyl('shank', 0.0165, 0.090, (0, 0.262, B), 'Y', 28, r2=0.0145, mat=MB),
          fluted_cyl('fluted', 0.0135, 0.0024, 0.540, (0, 0.575, B), 6, 48, MB, y_flute0=0.345, y_flute1=0.790),
          cyl('brake_neck', 0.0125, 0.020, (0, 0.850, B), 'Y', 24, mat=MB)]
brake = cyl('brake', 0.0170, 0.055, (0, 0.8645, B), 'Y', 24, mat=MB); add_bevel(brake, 0.002, 2); apply_mods(brake)
for yy in (0.851, 0.864, 0.877):
    boolean_cut(brake, box('cut', (0, yy, B + 0.004), (0.060, 0.007, 0.016)))
bparts.append(brake)
bparts.append(cyl('bore', 0.0062, 0.010, (0, 0.888, B), 'Y', 12, mat=RB))
barrel = join(bparts, 'barrel', weapon); shade_smooth(barrel, 30)

# ------------------------------------------------------------------------------------------------- forend (handguard), bipod studs, swivels
def fe_ring(y, w, h, k=2.3): return ring_y(ellipse2d(w, h, 24, k=k), y, dz=B - 0.037)
handguard = loft('handguard', [fe_ring(-0.010, 0.050, 0.058), fe_ring(0.120, 0.052, 0.060), fe_ring(0.300, 0.048, 0.054), fe_ring(0.450, 0.043, 0.048), fe_ring(0.520, 0.040, 0.044), fe_ring(0.532, 0.034, 0.038)], True, True, PG, weapon)
add_bevel(handguard, 0.003, 2, 40); apply_mods(handguard); shade_smooth(handguard, 40)
fparts = [cyl('stud1', 0.0045, 0.010, (0, 0.400, B - 0.070), 'Z', 12, mat=SB), cyl('stud2', 0.0045, 0.010, (0, 0.440, B - 0.070), 'Z', 12, mat=SB),
          loop('swivel_f', (0, 0.480, B - 0.076), 0.008, 0.0025, SB), cyl('swivel_f_base', 0.004, 0.008, (0, 0.480, B - 0.068), 'Z', 10, mat=SB)]
fittings = join(fparts, 'fittings', handguard); shade_smooth(fittings, 30)

# ------------------------------------------------------------------------------------------------- stock (thumbhole / skeleton), cheek riser, butt pad, grip
prof = [(0.070, -0.012), (0.070, 0.022), (-0.045, 0.022), (-0.062, 0.032), (-0.078, 0.048), (-0.300, 0.052), (-0.300, -0.100), (-0.190, -0.080), (-0.110, -0.068),
        (-0.088, -0.118), (-0.050, -0.128), (-0.014, -0.060), (-0.004, -0.012)]
stock = profile_extrude('stock', prof, -0.024, 0.024, PG, weapon)
add_bevel(stock, 0.006, 3, 40); apply_mods(stock)                     # bevel first, then the cut-outs keep clean sharp rims
boolean_cut(stock, loft('cut_thumb', [place(ellipse2d(0.058, 0.040, 24), (-0.03, -0.088, -0.030), (0, 1, 0), (0, 0, 1)), place(ellipse2d(0.058, 0.040, 24), (0.03, -0.088, -0.030), (0, 1, 0), (0, 0, 1))]))
boolean_cut(stock, loft('cut_skel', [place(rounded_rect2d(0.105, 0.042, 0.014, 4), (-0.03, -0.205, -0.030), (0, 1, 0), (0, 0, 1)), place(rounded_rect2d(0.105, 0.042, 0.014, 4), (0.03, -0.205, -0.030), (0, 1, 0), (0, 0, 1))]))
gaxis = Vector((0, -0.40, -0.92)).normalized(); gv = Vector((0, 0.92, -0.40)).normalized(); gtop = Vector((0, -0.040, -0.010))
def grip_ring(s, w, d, fwd=0.0):
    c = gtop + gaxis * (0.108 * s) + gv * fwd
    return place(ellipse2d(w, d, 18, k=1.7), c, (1, 0, 0), gv)
grip = loft('grip', [grip_ring(0.0, 0.034, 0.044), grip_ring(0.3, 0.035, 0.046, 0.001), grip_ring(0.6, 0.038, 0.050, 0.003), grip_ring(0.85, 0.040, 0.054, 0.005), grip_ring(1.0, 0.034, 0.046, 0.004)], True, True, PG)
add_bevel(grip, 0.004, 2, 40)
riser = box('cheek', (0, -0.205, 0.060), (0.040, 0.170, 0.034), PG); add_bevel(riser, 0.008, 3)
stock = join([stock, grip, riser], 'stock', weapon); shade_smooth(stock, 40)
butt = box('butt_pad', (0, -0.311, -0.025), (0.044, 0.022, 0.156), RB, weapon); add_bevel(butt, 0.005, 2); apply_mods(butt); shade_smooth(butt, 30)
sw = join([loop('swivel_r', (0, -0.250, -0.104), 0.008, 0.0025, SB), cyl('swivel_r_base', 0.004, 0.010, (0, -0.250, -0.094), 'Z', 10, mat=SB)], 'stock_swivel', stock); shade_smooth(sw, 30)

# ------------------------------------------------------------------------------------------------- magazine (box, forward of the trigger guard)
MAG_ORIGIN = Vector((0, 0.108, 0.022))
def mring(z, w, d): return place(rounded_rect2d(w, d, 0.004, 3), (0, 0, z), (1, 0, 0), (0, 1, 0))
mag_body = loft('mag_body', [mring(0.000, 0.030, 0.088), mring(-0.060, 0.030, 0.088), mring(-0.088, 0.029, 0.086), mring(-0.089, 0.033, 0.092), mring(-0.098, 0.033, 0.092)], True, True, MB)
add_bevel(mag_body, 0.0015, 2, 35)
mag = join([mag_body, box('mag_lip', (0, 0, 0.006), (0.024, 0.060, 0.012), MB)], 'mag', weapon); mag.location = MAG_ORIGIN; shade_smooth(mag, 35)

# ------------------------------------------------------------------------------------------------- trigger + guard
guard = sweep('trigger_guard', [(0.064, -0.010), (0.062, -0.040), (0.050, -0.054), (0.030, -0.058), (-0.012, -0.058), (-0.028, -0.050), (-0.036, -0.032), (-0.038, -0.010)], 0.011, 0.004, MD, weapon)
add_bevel(guard, 0.0008, 1)
magrel = box('mag_release', (0, 0.070, -0.022), (0.010, 0.010, 0.022), MD); add_bevel(magrel, 0.002, 2)
guard = join([guard, magrel], 'trigger_guard', weapon); shade_smooth(guard, 30)
TRIG_ORIGIN = Vector((0, 0.020, -0.012))
trigger = sweep('trigger', [(0.0, 0.002), (0.001, -0.012), (0.000, -0.022), (-0.004, -0.030), (-0.010, -0.036)], 0.007, 0.004, SB, weapon)
add_bevel(trigger, 0.0008, 1); apply_mods(trigger); trigger.location = TRIG_ORIGIN; shade_smooth(trigger, 30)

# ------------------------------------------------------------------------------------------------- scope (tube, saddle, turrets, bell, ocular, lenses, shade, rings)
SZ = B + 0.064
sp = [cyl('tube', 0.0150, 0.170, (0, 0.025, SZ), 'Y', 28, mat=MD),
      cyl('saddle', 0.0215, 0.052, (0, 0.045, SZ), 'Y', 28, mat=MD),
      cyl('turret_e', 0.0115, 0.026, (0, 0.045, SZ + 0.028), 'Z', 20, mat=MD), cyl('turret_e_cap', 0.0090, 0.006, (0, 0.045, SZ + 0.043), 'Z', 20, mat=SB),
      cyl('turret_w', 0.0115, 0.022, (0.026, 0.045, SZ), 'X', 20, mat=MD), cyl('turret_w_cap', 0.0090, 0.005, (0.039, 0.045, SZ), 'X', 20, mat=SB),
      cyl('paralax', 0.0115, 0.012, (-0.021, 0.045, SZ), 'X', 20, mat=MD),
      cyl('bell', 0.0150, 0.060, (0, 0.140, SZ), 'Y', 28, r2=0.0280, mat=MD), cyl('objective', 0.0280, 0.070, (0, 0.205, SZ), 'Y', 28, mat=MD),
      annulus('shade', 0.0295, 0.0265, 0.240, 0.292, (0, 0, SZ), MD), cyl('shade_ring', 0.0305, 0.006, (0, 0.243, SZ), 'Y', 28, mat=MD),
      cyl('lens_f', 0.0262, 0.004, (0, 0.238, SZ), 'Y', 28, mat=GL),
      cyl('ocular_cone', 0.0150, 0.040, (0, -0.080, SZ), 'Y', 28, r2=0.0210, mat=MD), cyl('ocular', 0.0210, 0.040, (0, -0.120, SZ), 'Y', 28, mat=MD),
      cyl('eyecup', 0.0225, 0.010, (0, -0.135, SZ), 'Y', 28, mat=RB), cyl('lens_r', 0.0190, 0.004, (0, -0.139, SZ), 'Y', 28, mat=GL),
      cyl('mag_ring', 0.0180, 0.018, (0, -0.052, SZ), 'Y', 28, mat=MD)]
for yy in (0.000, 0.098):                                                    # scope rings + clamp bases on the rail
    sp.append(annulus(f'ring{yy}', 0.0185, 0.0148, yy - 0.010, yy + 0.010, (0, 0, SZ), MD))
    base = box(f'ringbase{yy}', (0, yy, B + 0.040), (0.030, 0.020, 0.022), MD); add_bevel(base, 0.002, 2); sp.append(base)
    sp.append(cyl(f'ringbolt{yy}', 0.003, 0.034, (0, yy, B + 0.036), 'X', 10, mat=SB))
scope = join(sp, 'scope', weapon); shade_smooth(scope, 30)

GUN_MESHES = [receiver, bolt, barrel, handguard, fittings, stock, butt, sw, mag, guard, trigger, scope]
log(f'[{time.time() - T0:.0f}s] geometry built: ' + ', '.join(f'{o.name}={tri_count(o)}' for o in GUN_MESHES))

# ------------------------------------------------------------------------------------------------- bake + world copy
t = time.time(); world = None
if not POSE_ONLY:
    bake_object(receiver, 'metal', MB, prefix=f'{WID}_'); bake_object(mag, 'metal', MB, prefix=f'{WID}_')
    bake_object(stock, 'polymer', PG, prefix=f'{WID}_'); bake_object(handguard, 'polymer', PG, prefix=f'{WID}_')
    log(f'[{time.time() - T0:.0f}s] bakes done in {time.time() - t:.1f}s')
    world = decimate_copy(GUN_MESHES, 'world', weapon, 1500); log(f'world copy: {tri_count(world)} tris')

# ------------------------------------------------------------------------------------------------- arms + poses
A = build_arms(weapon); R, Lh = A['R'], A['L']
R_ELBOW = (0.14, -0.42, -0.24)
R_GRIP_M = hand_matrix_at((-0.029, 0.092, 0.001), (0.024, -0.036, -0.046), (-0.25, 0.86, -0.44), (-1, 0, 0))
R_GRIP_CURL = {'f1': (22, 30), 'f2': (85, 95), 'f3': (88, 98), 'f4': (90, 100), 'thumb': (45, 50)}
set_local_matrix(R['hand'], R_GRIP_M); curl_fingers(R, R_GRIP_CURL, spread=1, lift={'f1': 35}); aim_arm(R['hand'], R['arm'], R_ELBOW)
L_FWD = (0.90, 0.22, -0.30); L_NRM = (0.30, 0, 0.95); L_ELBOW = (-0.12, -0.10, -0.32)
L_REST_CURL = {'f1': (60, 48), 'f2': (64, 52), 'f3': (64, 52), 'f4': (66, 56), 'thumb': (10, 25)}
L_REST_M = hand_matrix_at((0, 0.046, -0.014), (-0.008, 0.300, -0.024), L_FWD, L_NRM)
set_local_matrix(Lh['hand'], L_REST_M); curl_fingers(Lh, L_REST_CURL, spread=3); aim_arm(Lh['hand'], Lh['arm'], L_ELBOW)
log(f'arms tris: {sum(tri_report(A["arms"]).values())}')

# bolt-knob grab pose for the right hand: palm cups the knob from the right/above, fingers hook under it
KNOB_CURL = {'f1': (70, 62), 'f2': (74, 66), 'f3': (76, 68), 'f4': (78, 70), 'thumb': (25, 40)}
OPEN_CURL = {'f1': (15, 10), 'f2': (20, 15), 'f3': (20, 15), 'f4': (22, 18), 'thumb': (0, 10)}
R_BOLT_ELBOW = (0.22, -0.30, -0.12)
def bolt_matrix(dy=0.0, lift_deg=0.0):
    return Matrix.Translation(BOLT_ORIGIN + Vector((0, dy, 0))) @ Matrix.Rotation(math.radians(-lift_deg), 4, 'Y')
def knob_hand_matrix(Mb):
    kw = Mb @ KNOB_LOCAL                                       # knob centre in weapon space
    fwd = (Mb.to_3x3() @ Vector((0.35, 0.0, -0.94))).normalized()   # fingers point along the handle's bend (down at rest, forward-up when lifted)
    nrm = (Mb.to_3x3() @ Vector((-0.80, 0.0, -0.60))).normalized()  # palm faces the knob (inward / down)
    return hand_matrix_at((0.0, 0.062, -0.014), kw + Vector((0.006, 0.0, 0.0)), fwd, (nrm.x, nrm.y + 0.15, nrm.z))
def key_bolt(f, dy=0.0, lift=0.0):
    key(bolt, f, loc=BOLT_ORIGIN + Vector((0, dy, 0)), rot=(0, -lift, 0)); return bolt_matrix(dy, lift)
def bolt_cycle(f0, hand_frames=True):
    """Right hand leaves the grip, lifts / pulls / pushes / locks the bolt and returns. ~36 frames from f0."""
    key_hand(R, f0, R_GRIP_M, R_GRIP_CURL, R_ELBOW, spread=1, lift={'f1': 35}); key_bolt(f0)
    Mb = bolt_matrix()
    key_hand(R, f0 + 3, R_GRIP_M @ Matrix.Translation((0.02, 0.0, 0.05)), OPEN_CURL, R_BOLT_ELBOW, spread=1)
    key_hand(R, f0 + 6, knob_hand_matrix(Mb), KNOB_CURL, R_BOLT_ELBOW, spread=1); key_bolt(f0 + 6)
    Mb = key_bolt(f0 + 11, 0.0, 70); key_hand(R, f0 + 11, knob_hand_matrix(Mb), KNOB_CURL, R_BOLT_ELBOW, spread=1)        # lift
    Mb = key_bolt(f0 + 17, -0.090, 70); key_hand(R, f0 + 17, knob_hand_matrix(Mb), KNOB_CURL, R_BOLT_ELBOW, spread=1)     # pull back (eject)
    key_bolt(f0 + 19, -0.090, 70); key_hand(R, f0 + 19, knob_hand_matrix(Mb), KNOB_CURL, R_BOLT_ELBOW, spread=1)
    Mb = key_bolt(f0 + 25, 0.0, 70); key_hand(R, f0 + 25, knob_hand_matrix(Mb), KNOB_CURL, R_BOLT_ELBOW, spread=1)        # push forward
    Mb = key_bolt(f0 + 29, 0.0, 0.0); key_hand(R, f0 + 29, knob_hand_matrix(Mb), KNOB_CURL, R_BOLT_ELBOW, spread=1)       # lock down
    key_hand(R, f0 + 32, knob_hand_matrix(Mb) @ Matrix.Translation((0.0, 0.0, -0.03)), OPEN_CURL, R_BOLT_ELBOW, spread=1)
    key_hand(R, f0 + 36, R_GRIP_M, R_GRIP_CURL, R_ELBOW, spread=1, lift={'f1': 35}); key_bolt(f0 + 36)

# left hand on the magazine (weapon space, mag at rest): palm on the mag's left face, fingers wrapping the front-bottom edge
L_MAG_M = hand_matrix((-0.034, 0.058, -0.028), (0.0, 0.80, -0.60), (1, 0, 0))
MAG_CURL = {'f1': (58, 48), 'f2': (62, 52), 'f3': (62, 52), 'f4': (64, 54), 'thumb': (15, 30)}
def mag_matrix(loc=(0, 0, 0), rot_x=0.0): return Matrix.Translation(MAG_ORIGIN + Vector(loc)) @ Matrix.Rotation(math.radians(rot_x), 4, 'X')
def key_mag(f, loc=(0, 0, 0), rot_x=0.0):
    key(mag, f, loc=MAG_ORIGIN + Vector(loc), rot=(rot_x, 0, 0)); return mag_matrix(loc, rot_x)
H_REL = mag_matrix().inverted() @ L_MAG_M
def key_left_rest(f): key_hand(Lh, f, L_REST_M, L_REST_CURL, L_ELBOW)
def key_right_grip(f): key_hand(R, f, R_GRIP_M, R_GRIP_CURL, R_ELBOW, spread=1, lift={'f1': 35})
def key_weapon(f, loc=(0, 0, 0), rot=(0, 0, 0)): key(weapon, f, loc=loc, rot=rot)

# ------------------------------------------------------------------------------------------------- animation (single 30 fps timeline)
# idle 0-60 (loops)
for f, (dz, rx) in ((0, (0, 0)), (15, (0.0018, 0.25)), (30, (0.0, 0.0)), (45, (-0.0016, -0.22)), (59, (0, 0))):
    key_weapon(f, (0, 0, dz), (rx, 0.4 * dz / 0.0018 if dz else 0, 0))
key_left_rest(0); key_right_grip(0); key_mag(0); key_bolt(0); key(trigger, 0, rot=(0, 0, 0))
# equip 60-90: rises from below-right, muzzle down, settles
key_weapon(60, (0.14, -0.04, -0.32), (-40, 10, -30)); key_weapon(74, (0.04, 0.0, -0.09), (-11, 3, -8)); key_weapon(83, (-0.004, 0.004, 0.006), (2.5, -0.5, 1.5)); key_weapon(89)
key_left_rest(59); key_left_rest(89); key_right_grip(59); key_right_grip(89)
# fire 90-104: heavy kick back/up + muzzle rise, slow settle; trigger pull
key_weapon(90); key_weapon(92, (0.004, -0.040, 0.012), (7.5, -2.5, 1.5)); key_weapon(96, (0.002, -0.022, 0.006), (4.0, 1.0, -0.6)); key_weapon(100, (0.0, -0.006, 0.001), (0.8, -0.3, 0.2)); key_weapon(103)
key(trigger, 90, rot=(0, 0, 0)); key(trigger, 92, rot=(-14, 0, 0)); key(trigger, 100, rot=(0, 0, 0))
key_left_rest(90); key_left_rest(103); key_right_grip(90); key_right_grip(103)
# rechamber 104-140: bolt lift / pull / push / lock by the right hand (rechamber_open 121, rechamber_close 133)
key_weapon(104); key_weapon(118, (0.01, -0.01, 0.03), (4, 12, 3)); key_weapon(133, (0.01, -0.01, 0.03), (4, 12, 3)); key_weapon(139)
bolt_cycle(104); key_left_rest(104); key_left_rest(139)
# reload 140-230: mag out (160) / in (195) with the left hand, then bolt cycle; gun lifts + rolls toward the camera
key_weapon(140); key_weapon(150, (-0.03, -0.02, 0.10), (14, 30, 8)); key_weapon(196, (-0.03, -0.02, 0.10), (14, 30, 8)); key_weapon(204, (-0.02, -0.02, 0.06), (8, 10, 4)); key_weapon(222, (-0.02, -0.02, 0.06), (8, 10, 4)); key_weapon(229)
key_right_grip(140); key_left_rest(140); key_hand(Lh, 146, L_REST_M @ Matrix.Translation((0.02, -0.08, -0.04)), OPEN_CURL, L_ELBOW)
Mm = key_mag(140); key_mag(152); key_hand(Lh, 152, Mm @ H_REL, MAG_CURL, L_ELBOW)                 # grab the mag
Mm = key_mag(160, (0, 0, -0.030)); key_hand(Lh, 160, Mm @ H_REL, MAG_CURL, L_ELBOW)               # released, sliding out (event reload_mag_out)
Mm = key_mag(168, (-0.02, 0.02, -0.16), 15); key_hand(Lh, 168, Mm @ H_REL, MAG_CURL, L_ELBOW)     # pulled down
key_mag(172, (-0.02, 0.04, -0.42), 30); key_hand(Lh, 173, Mm @ H_REL @ Matrix.Translation((0, -0.06, -0.14)), OPEN_CURL, L_ELBOW)   # dropped away
Mm = key_mag(173, (-0.05, 0.02, -0.44), 12); key_mag(177, (-0.05, 0.02, -0.44), 12); key_hand(Lh, 177, Mm @ H_REL, MAG_CURL, L_ELBOW)  # fresh mag taken (out of view)
Mm = key_mag(188, (0, 0.0, -0.06), 4); key_hand(Lh, 188, Mm @ H_REL, MAG_CURL, L_ELBOW)           # lined up with the well
Mm = key_mag(195); key_hand(Lh, 195, Mm @ H_REL, MAG_CURL, L_ELBOW)                                # seated (event reload_mag_in)
key_hand(Lh, 198, Mm @ H_REL @ Matrix.Translation((0, -0.02, -0.03)), OPEN_CURL, L_ELBOW); key_left_rest(206); key_left_rest(229)
key_mag(229); bolt_cycle(192)                                                                       # bolt cycle 192-228 (hand keys at 192 are the grip pose)
key_right_grip(229)
# inspect 230-330: show the left side, roll to show the right side and the scope, return
key_weapon(230); key_weapon(258, (-0.06, -0.06, 0.05), (-4, -25, 58)); key_weapon(276, (-0.03, -0.03, 0.03), (-1, -15, 25))
key_weapon(302, (-0.01, -0.06, 0.05), (6, -115, -28)); key_weapon(318, (-0.01, -0.01, 0.01), (1, -20, -4)); key_weapon(329)
key_left_rest(230); key_left_rest(329); key_right_grip(230); key_right_grip(329); key_mag(329); key_bolt(329)
set_bezier([weapon, mag, bolt, trigger] + [H[k] for H in (R, Lh) for k in H if k in ('hand', 'arm') or k.startswith('f') or k.startswith('thumb')])
bpy.context.scene.frame_set(0)

if POSE_ONLY:
    from common import _studio
    _studio((0, 0.2, 0))
    render_closeups(WID, [('handR_right', (0.42, -0.34, -0.10), (0.02, -0.06, -0.05), 60), ('handL_below', (0.02, 0.32, -0.55), (0, 0.30, 0), 45), ('handL_left', (-0.48, 0.16, -0.12), (-0.02, 0.30, 0.0), 60)], 0)
    render_closeups(WID, [('bolt_lift', (0.55, -0.25, 0.35), (0.03, 0.05, 0.04), 45)], 115)
    render_closeups(WID, [('bolt_back', (0.55, -0.25, 0.35), (0.03, 0.05, 0.04), 45)], 121)
    render_closeups(WID, [('bolt_rest', (0.55, -0.25, 0.35), (0.03, 0.05, 0.04), 45)], 110)
    def wv(frame, views):   # closeup views given in weapon space -> world space at `frame`
        bpy.context.scene.frame_set(frame); M = weapon.matrix_world.copy()
        return [(n, M @ Vector(l), M @ Vector(t), lens) for n, l, t, lens in views]
    render_closeups(WID, wv(158, [('mag_grab', (-0.50, 0.00, -0.30), (-0.01, 0.10, -0.06), 45)]), 158)
    render_closeups(WID, wv(190, [('mag_in', (-0.50, 0.00, -0.30), (-0.01, 0.10, -0.06), 45)]), 190)
    render_closeups(WID, [('side_ref', (-1.6, 0.28, 0.05), (0, 0.28, 0.0), 50)], 0)
    log(f'[{time.time() - T0:.0f}s] pose-only closeups done'); sys.exit(0)

# ------------------------------------------------------------------------------------------------- export, json, save
tris = tri_report(weapon); gun_names = {o.name for o in GUN_MESHES}
gun_tris = sum(v for k, v in tris.items() if k in gun_names); arms_tris = sum(tri_report(A['arms']).values())
log(f'[{time.time() - T0:.0f}s] tri counts: gun(viewmodel)={gun_tris}, arms={arms_tris}, world={tris["world"]}, total={sum(tris.values())}')
log('  per object: ' + ', '.join(f'{k}={v}' for k, v in tris.items() if v))
log(f'  materials: {[m.name for m in bpy.data.materials]}; images: {[(i.name, i.size[0]) for i in bpy.data.images if i.name != "Render Result"]}')
glb = PUBLIC_WEAPONS / f'{WID}.glb'; export_glb(glb)
write_anim_json(PUBLIC_WEAPONS / f'{WID}.anim.json', CLIPS, EVENTS)
blend = ASSETS_SRC / f'{WID}.blend'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True); log(f'  saved {blend} ({os.path.getsize(blend) / 1e6:.2f} MB)')
if '--no-render' not in sys.argv:
    render_review(WID, CLIPS, arms=A['arms'], world=world, gun_center=(0, 0.29, 0.02), gun_len=1.42, turntable='--quick' not in sys.argv)
verify_glb(glb)
log(f'[{time.time() - T0:.0f}s] done')
Path(EVIDENCE / f'{WID}_build_log.txt').write_text('\n'.join(LOG))
