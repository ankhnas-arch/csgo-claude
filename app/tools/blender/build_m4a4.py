"""Regenerates assets-source/blender/m4a4.blend, public/assets/weapons/m4a4.glb + m4a4.anim.json and the review renders.
Run: python3 tools/blender/build_m4a4.py [--quick] [--no-render] [--pose-only]   (headless bpy 4.5). Deterministic.
Only calls helpers from common.py (does not modify it); local helpers are defined here."""
import sys, math, time, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

WID = 'm4a4'
B = 0.055                       # bore / buffer-tube axis height above the weapon origin (rear of the pistol grip)
CLIPS = {'idle': (0, 60), 'equip': (60, 90), 'fire': (90, 101), 'reload': (101, 190), 'inspect': (190, 290)}
EVENTS = {'reload_mag_out': 122, 'reload_mag_in': 156, 'reload_end': 190}
T0 = time.time()
POSE_ONLY = '--pose-only' in sys.argv

# local material specs (black polymer / phosphate metal); setdefault so a concurrent common.py edit wins if present
MATERIAL_SPECS.setdefault('polymer_black', ((0.030, 0.031, 0.033), 0.0, 0.66, 0.0))
MATERIAL_SPECS.setdefault('metal_dark', ((0.045, 0.048, 0.055), 1.0, 0.40, 0.0))
MATERIAL_SPECS['metal_blued'] = ((0.058, 0.063, 0.075), 1.0, 0.48, 0.0)     # darker phosphate/anodised tone for the M4 (this process only)
MB, SB, PB, RB, MD = 'metal_blued', 'steel_bright', 'polymer_black', 'rubber', 'metal_dark'

# ----------------------------------------------------------------------------------------------- local helpers
THUMB_BASE = {'R': Euler((math.radians(-25), math.radians(-20), math.radians(-50)), 'XYZ'), 'L': Euler((math.radians(-25), math.radians(20), math.radians(50)), 'XYZ')}
def curl_abs(H, side, curls, spread=0.0, lift=None):
    """curl_fingers with an absolute thumb (curl_fingers accumulates the thumb base rotation on every call)."""
    H['thumb'].rotation_euler = THUMB_BASE[side].copy(); curl_fingers(H, curls, spread=spread, lift=lift)

def k_hand(H, f, M=None, curl=None, elbow=None, spread=3.0, lift=None):
    if M is not None: set_local_matrix(H['hand'], M)
    if curl is not None: curl_abs(H, 'R' if H['hand'].name.endswith('R') else 'L', curl, spread=spread, lift=lift)
    if elbow is not None: aim_arm(H['hand'], H['arm'], elbow)
    key_current(H['hand'], f); key_current(H['arm'], f)
    for i in range(1, 5): key_current(H[f'f{i}'], f); key_current(H[f'f{i}_k2'], f)
    key_current(H['thumb'], f); key_current(H['thumb_k2'], f)

def bezier(objs):
    for o in objs:
        if o.animation_data and o.animation_data.action:
            for fc in o.animation_data.action.fcurves:
                for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'; kp.easing = 'AUTO'

def shift_origin(ob, origin):
    """Move mesh data so that `origin` (weapon space) becomes the object's local origin; sets ob.location."""
    for v in ob.data.vertices: v.co -= Vector(origin)
    ob.location = Vector(origin)

def rail_teeth(parts, axis_dir, y0, y1, pitch=0.010, tooth=0.0055, w=0.021, h=0.0035, mat=MB, off=0.0, cx=0.0, cz=B):
    """Picatinny teeth along +Y. axis_dir: 'top','bottom','left','right' -> which face of the handguard/receiver; `off` = distance from the axis to the tooth centre."""
    n = int((y1 - y0) / pitch)
    for i in range(n):
        y = y0 + pitch * (i + 0.5)
        if axis_dir == 'top': parts.append(box('tooth', (cx, y, cz + off), (w, tooth, h), mat))
        elif axis_dir == 'bottom': parts.append(box('tooth', (cx, y, cz - off), (w, tooth, h), mat))
        elif axis_dir == 'right': parts.append(box('tooth', (cx + off, y, cz), (h, tooth, w), mat))
        else: parts.append(box('tooth', (cx - off, y, cz), (h, tooth, w), mat))

reset_scene(frame_end=290)
weapon = empty('weapon', (0, 0, 0), None, 0.05)

# ----------------------------------------------------------------------------------------------- receiver (upper + lower)
parts = []
# lower receiver: side profile (y,z) extruded in X; magwell leans forward at the bottom
lower_prof = [(-0.046, 0.049), (-0.046, 0.031), (-0.039, 0.017), (-0.030, 0.005), (0.050, 0.003), (0.070, 0.003), (0.079, -0.028),
              (0.158, -0.028), (0.151, 0.018), (0.166, 0.030), (0.166, 0.049)]
lower = profile_extrude('lower', lower_prof, -0.0175, 0.0175, MB); add_bevel(lower, 0.002, 2); parts.append(lower)
# upper receiver: squarish superellipse tube around the bore, flat-top
up_rings = [ring_y(ellipse2d(0.036, 0.036, 20, k=3.0), -0.050, dz=B), ring_y(ellipse2d(0.036, 0.036, 20, k=3.0), 0.174, dz=B)]
upper = loft('upper', up_rings, True, True, MB); add_bevel(upper, 0.002, 2); apply_mods(upper)
# ejection port through the right wall (cut on the standalone upper: EXACT booleans misbehave on the joined multi-shell receiver)
boolean_cut(upper, box('cut_port', (0.019, 0.092, B + 0.001), (0.012, 0.066, 0.022))); parts.append(upper)
# rail base + teeth on the flat top (M1913), from the rear of the upper to the front
railb = box('rail_base', (0, 0.062, B + 0.021), (0.017, 0.222, 0.008), MB); parts.append(railb)
rail_teeth(parts, 'top', -0.047, 0.171, off=0.0265)
# folded flip-up rear sight (flat block on the rail, two ears, aperture nub)
rs = box('rear_sight', (0, -0.015, B + 0.0345), (0.032, 0.040, 0.011), MB); add_bevel(rs, 0.002, 2); parts.append(rs)
for sx in (-1, 1): parts.append(box('rs_ear', (sx * 0.014, -0.030, B + 0.043), (0.004, 0.010, 0.008), MB))
parts.append(box('rs_apert', (0, -0.002, B + 0.042), (0.012, 0.010, 0.005), MB))
# forward assist (right rear), brass deflector wedge, receiver end plate, front pivot / rear takedown pins
fa = cyl('fwd_assist', 0.0075, 0.016, (0.025, 0.022, B + 0.002), 'X', 14, mat=MB); parts.append(fa)
fa2 = cyl('fwd_assist_cap', 0.0060, 0.006, (0.036, 0.022, B + 0.002), 'X', 14, mat=MB); parts.append(fa2)
defl = profile_extrude('deflector', [(0.040, B - 0.006), (0.056, B - 0.006), (0.056, B + 0.014), (0.048, B + 0.016), (0.040, B + 0.010)], 0.017, 0.027, MB)
add_bevel(defl, 0.0015, 1); parts.append(defl)
for (py, pz) in ((0.161, 0.031), (-0.032, 0.033)):
    parts.append(cyl('pin', 0.0042, 0.041, (0, py, pz), 'X', 12, mat=MB))
# barrel nut / delta ring at the front of the upper
parts.append(cyl('delta_ring', 0.0245, 0.016, (0, 0.181, B), 'Y', 24, mat=MB))
parts.append(cyl('delta_ring2', 0.0225, 0.010, (0, 0.193, B), 'Y', 24, mat=MB))
# buffer tube (receiver extension), castle nut, end plate  (part of the receiver; stock slides on it)
parts.append(cyl('buffer_tube', 0.0150, 0.196, (0, -0.146, B), 'Y', 20, mat=MB))
parts.append(cyl('castle_nut', 0.0190, 0.010, (0, -0.054, B), 'Y', 20, mat=MB))
parts.append(box('end_plate', (0, -0.0475, B - 0.004), (0.040, 0.004, 0.046), MB))
# left side: bolt catch + selector lever; right side: magazine release button + fence
bc = box('bolt_catch', (-0.0195, 0.054, 0.038), (0.004, 0.030, 0.015), MB); add_bevel(bc, 0.0012, 1); parts.append(bc)
sel = cyl('sel_pivot', 0.0080, 0.003, (-0.0190, -0.006, 0.034), 'X', 16, mat=MB); parts.append(sel)
sl = box('sel_lever', (-0.0200, -0.020, 0.036), (0.004, 0.030, 0.007), MB); add_bevel(sl, 0.0012, 1); parts.append(sl)
parts.append(cyl('mag_release', 0.0065, 0.008, (0.0215, 0.066, 0.031), 'X', 16, mat=MB))
fence = profile_extrude('mag_fence', [(0.056, 0.020), (0.076, 0.020), (0.076, 0.042), (0.056, 0.042)], 0.0175, 0.0210, MB); parts.append(fence)
boolean_cut(fence, cyl('fence_cut', 0.0095, 0.010, (0.0215, 0.066, 0.031), 'X', 16))
receiver = join(parts, 'receiver', weapon); shade_smooth(receiver, 30)
# ejection-port dust cover, hinged open (hangs down along the right side)
cover = box('dust_cover', (0, 0, -0.012), (0.0015, 0.066, 0.024), MB); add_bevel(cover, 0.0007, 1); apply_mods(cover)
cover.location = (0.0205, 0.092, B - 0.010); cover.rotation_euler = Euler((0, math.radians(-20), 0), 'XYZ')
cover = join([cover], 'dust_cover', receiver); cover.name = 'dust_cover'
muzzle = empty('muzzle', (0, 0.562, B), receiver, 0.01); eject = empty('eject', (0.022, 0.092, B + 0.004), receiver, 0.01)

# ----------------------------------------------------------------------------------------------- bolt = charging handle (+ carrier child)
BOLT_ORIGIN = Vector((0, -0.060, B + 0.0175))
ch = [box('ch_bar', (0, -0.060, B + 0.0175), (0.034, 0.014, 0.008), MD)]; add_bevel(ch[0], 0.002, 2)
ch.append(box('ch_shaft', (0, -0.035, B + 0.016), (0.014, 0.040, 0.006), MD))
lt = box('ch_latch', (-0.021, -0.058, B + 0.0175), (0.010, 0.010, 0.007), MD); add_bevel(lt, 0.0015, 1); ch.append(lt)
bolt = join(ch, 'bolt', weapon); shift_origin(bolt, BOLT_ORIGIN); shade_smooth(bolt, 30)
cp = [box('carrier_body', (0.004, 0.100, B), (0.020, 0.120, 0.021), SB)]; add_bevel(cp[0], 0.002, 2)
cp.append(cyl('cam_pin', 0.0035, 0.006, (0.0145, 0.118, B + 0.004), 'X', 10, mat=SB))
cp.append(box('bolt_face', (0.004, 0.164, B), (0.016, 0.010, 0.016), MD))
carrier = join(cp, 'carrier', bolt); shift_origin(carrier, BOLT_ORIGIN); carrier.location = (0, 0, 0); shade_smooth(carrier, 30)

# ----------------------------------------------------------------------------------------------- barrel group
bp = []
bp.append(cyl('barrel_rear', 0.0120, 0.210, (0, 0.290, B), 'Y', 20, mat=MB))
bp.append(cyl('barrel_front', 0.0095, 0.130, (0, 0.460, B), 'Y', 20, mat=MB))
bp.append(cyl('gas_tube', 0.0030, 0.210, (0, 0.300, B + 0.019), 'Y', 8, mat=SB))
# front sight base over the gas block: collar + tower + ears + post; sling swivel + bayonet lug underneath
bp.append(cyl('fsb_collar', 0.0150, 0.034, (0, 0.404, B), 'Y', 20, mat=MB))
tower = profile_extrude('fsb_tower', [(0.386, B), (0.422, B), (0.416, B + 0.040), (0.392, B + 0.040)], -0.010, 0.010, MB); add_bevel(tower, 0.002, 2); bp.append(tower)
for sx in (-1, 1):
    ear = profile_extrude('fsb_ear', [(0.394, B + 0.036), (0.414, B + 0.036), (0.412, B + 0.066), (0.396, B + 0.066)], sx * 0.006, sx * 0.011, MB)
    add_bevel(ear, 0.0015, 1); bp.append(ear)
bp.append(cyl('fs_post', 0.0017, 0.030, (0, 0.404, B + 0.052), 'Z', 8, mat=SB))
bp.append(box('fs_post_base', (0, 0.404, B + 0.040), (0.008, 0.008, 0.006), MB))
bp.append(box('bayonet_lug', (0, 0.398, B - 0.021), (0.012, 0.030, 0.012), MB))
bp.append(cyl('sling_swivel', 0.0060, 0.003, (0, 0.400, B - 0.031), 'X', 12, mat=SB))
# A2 birdcage flash hider: cylinder with 5 slots cut in the upper 240 degrees, closed bottom, open bore
fh = cyl('flash_hider', 0.0112, 0.042, (0, 0.541, B), 'Y', 24, mat=MB)
for i in range(5):
    a = math.radians(-120 + 60 * i)          # slots around the top/sides, none at the bottom
    cut = box('slot', (0, 0.541, 0.0125), (0.0035, 0.024, 0.015))     # one-sided slot, rotated about the bore
    cut.rotation_euler = Euler((0, a, 0), 'XYZ'); cut.location = (0, 0, B)
    boolean_cut(fh, cut)
bp.append(fh)
bp.append(cyl('fh_ring', 0.0125, 0.006, (0, 0.523, B), 'Y', 24, mat=MB))
bp.append(cyl('bore', 0.0060, 0.020, (0, 0.552, B), 'Y', 12, mat=RB))
barrel = join(bp, 'barrel', weapon); shade_smooth(barrel, 30)

# ----------------------------------------------------------------------------------------------- quad-rail handguard
hp = []
body_rings = [ring_y([(0.025 * math.cos(a), 0.025 * math.sin(a)) for a in [math.radians(22.5 + 45 * i) for i in range(8)]], y, dz=B) for y in (0.200, 0.372)]
hg_body = loft('hg_body', body_rings, True, True, PB); add_bevel(hg_body, 0.002, 2); hp.append(hg_body)
for side, off in (('top', 0.0255), ('bottom', 0.0255), ('left', 0.0255), ('right', 0.0255)):
    if side in ('top', 'bottom'): hp.append(box('rail', (0, 0.286, B + (off if side == 'top' else -off)), (0.017, 0.172, 0.006), PB))
    else: hp.append(box('rail', ((off if side == 'right' else -off), 0.286, B), (0.006, 0.172, 0.017), PB))
    rail_teeth(hp, side, 0.202, 0.370, off=0.0300, mat=PB)
# rail slot lines on the octagon diagonals (thin dark grooves suggested by inset strips)
for a in (45, 135, 225, 315):
    x, z = 0.0235 * math.cos(math.radians(a)), 0.0235 * math.sin(math.radians(a))
    for y in (0.230, 0.262, 0.294, 0.326, 0.358):
        hp.append(box('vent', (x, y, B + z), (0.004, 0.016, 0.004), RB))
hp.append(cyl('hg_cap', 0.0210, 0.010, (0, 0.377, B), 'Y', 16, mat=MB))
handguard = join(hp, 'handguard', weapon); shade_smooth(handguard, 30)

# ----------------------------------------------------------------------------------------------- magazine (30-rd STANAG, slight forward lean)
MAG_ORIGIN = Vector((0, 0.114, 0.020))
mag_axis = Vector((0, math.sin(math.radians(9)), -math.cos(math.radians(9))))
mag_nrm = Vector((0, math.cos(math.radians(9)), math.sin(math.radians(9))))
def mag_ring(s, w=0.0235, d=0.058, r=0.004, extra=(0, 0, 0)):
    return place(rounded_rect2d(w, d, r, 3), Vector((0, 0, 0)) + mag_axis * s + Vector(extra), (1, 0, 0), mag_nrm)
mp = [loft('mag_body', [mag_ring(0.0), mag_ring(0.060), mag_ring(0.120, 0.0235, 0.059), mag_ring(0.176, 0.0235, 0.060), mag_ring(0.180, 0.0250, 0.064), mag_ring(0.190, 0.0250, 0.064)], True, True, MB)]
add_bevel(mp[0], 0.0015, 2, 35)
for sx in (-1, 1):
    for dn in (-0.012, 0.012):
        mp.append(loft('mag_rib', [place(rounded_rect2d(0.002, 0.007, 0, 1), mag_axis * s + Vector((sx * 0.0122, 0, 0)) + mag_nrm * dn, (1, 0, 0), mag_nrm) for s in (0.045, 0.170)], True, True, MB))
mp.append(box('mag_lug', (0, 0.008, 0.012), (0.018, 0.010, 0.010), MB))
mag = join(mp, 'mag', weapon); mag.location = MAG_ORIGIN; shade_smooth(mag, 35)

# ----------------------------------------------------------------------------------------------- grip, trigger, guard
gaxis = Vector((0, -0.42, -0.91)).normalized(); gv = Vector((0, 0.91, -0.42)).normalized(); gtop = Vector((0, -0.016, 0.004))
def grip_ring(s, w, d, fwd=0.0, k=1.8):
    c = gtop + gaxis * (0.112 * s) + gv * fwd
    return place(ellipse2d(w, d, 18, k=k), c, (1, 0, 0), gv)
grip = loft('grip', [grip_ring(0.0, 0.032, 0.046, -0.004), grip_ring(0.15, 0.031, 0.044, -0.002), grip_ring(0.30, 0.031, 0.044, 0.003), grip_ring(0.42, 0.032, 0.046, 0.006),
                     grip_ring(0.55, 0.032, 0.044, 0.003), grip_ring(0.80, 0.033, 0.045, 0.002), grip_ring(0.95, 0.034, 0.046, 0.002), grip_ring(1.0, 0.030, 0.040, 0.002)], True, True, PB, weapon)
add_bevel(grip, 0.004, 2, 40); apply_mods(grip); shade_smooth(grip, 40)
guard = sweep('trigger_guard', [(0.064, 0.005), (0.064, -0.010), (0.054, -0.020), (-0.016, -0.020), (-0.026, -0.012), (-0.028, 0.005)], 0.010, 0.003, MB, weapon)
add_bevel(guard, 0.0008, 1); apply_mods(guard); shade_smooth(guard, 30)
TRIG_ORIGIN = Vector((0, 0.026, 0.004))
trigger = sweep('trigger', [(0.0, 0.002), (0.001, -0.007), (0.000, -0.013), (-0.004, -0.018)], 0.0065, 0.0035, SB, weapon)
add_bevel(trigger, 0.0008, 1); apply_mods(trigger); trigger.location = TRIG_ORIGIN; shade_smooth(trigger, 30)

# ----------------------------------------------------------------------------------------------- telescoping stock (polymer) + butt pad
sp = []
stock_prof = [(-0.132, B + 0.022), (-0.132, B - 0.004), (-0.150, B - 0.014), (-0.178, B - 0.026), (-0.262, -0.006), (-0.275, -0.006), (-0.275, B + 0.022)]
sb = profile_extrude('stock_body', stock_prof, -0.0195, 0.0195, PB); add_bevel(sb, 0.003, 2); apply_mods(sb)
boolean_cut(sb, box('cut_slot', (0, -0.222, 0.030), (0.060, 0.050, 0.018)))      # lightening slot through the toe
sp.append(sb)
# cheek-weld top rounded: a superellipse tube over the buffer tube region on the stock
sp.append(loft('stock_top', [ring_y(ellipse2d(0.040, 0.040, 16, k=2.2), -0.132, dz=B + 0.002), ring_y(ellipse2d(0.040, 0.040, 16, k=2.2), -0.274, dz=B + 0.002)], True, True, PB))
lever = box('stock_lever', (0, -0.156, B - 0.026), (0.016, 0.034, 0.010), PB); add_bevel(lever, 0.002, 1); sp.append(lever)
sp.append(box('stock_sling', (0, -0.262, 0.006), (0.006, 0.014, 0.004), MB))
stock = join(sp, 'stock', weapon); shade_smooth(stock, 30)
butt = box('butt_pad', (0, -0.280, (B + 0.022 - 0.006) / 2), (0.040, 0.010, B + 0.028), RB, weapon); add_bevel(butt, 0.003, 2); apply_mods(butt); shade_smooth(butt, 30)

GUN_MESHES = [receiver, cover, bolt, carrier, barrel, handguard, mag, grip, guard, trigger, stock, butt]
log(f'[{time.time() - T0:.0f}s] geometry built: ' + ', '.join(f'{o.name}={tri_count(o)}' for o in GUN_MESHES))

# ----------------------------------------------------------------------------------------------- bake
t = time.time()
if not POSE_ONLY:
    bake_object(receiver, 'metal', MB, prefix=f'{WID}_'); bake_object(mag, 'metal', MB, prefix=f'{WID}_')
    bake_object(stock, 'polymer', PB, prefix=f'{WID}_'); bake_object(handguard, 'polymer', PB, prefix=f'{WID}_')
    log(f'[{time.time() - T0:.0f}s] bakes done in {time.time() - t:.1f}s')

# ----------------------------------------------------------------------------------------------- world (drop) copy
world = None
if not POSE_ONLY:
    world = decimate_copy(GUN_MESHES, 'world', weapon, 1400); log(f'world copy: {tri_count(world)} tris')

# ----------------------------------------------------------------------------------------------- arms + pose
A = build_arms(weapon); R, Lh = A['R'], A['L']
R_ELBOW = (0.14, -0.42, -0.24)
R_M = hand_matrix_at((-0.029, 0.092, 0.001), (0.031, -0.008, -0.028), (-0.25, 0.86, -0.44), (-1, 0, 0))
R_CURL = {'f1': (30, 40), 'f2': (85, 95), 'f3': (88, 98), 'f4': (90, 100), 'thumb': (45, 50)}
set_local_matrix(R['hand'], R_M); curl_abs(R, 'R', R_CURL, spread=1, lift={'f1': 55}); aim_arm(R['hand'], R['arm'], R_ELBOW)
# left hand under the quad rail: palm up/right cupping the bottom rail, fingers over the right rail, thumb along the left
L_FWD = (0.90, 0.22, -0.30); L_NRM = (0.30, 0, 0.95); L_ELBOW = (-0.12, -0.10, -0.32)
L_REST_CURL = {'f1': (68, 62), 'f2': (72, 66), 'f3': (72, 66), 'f4': (74, 68), 'thumb': (10, 25)}
L_REST_M = hand_matrix_at((0, 0.046, -0.014), (-0.004, 0.290, B - 0.032), L_FWD, L_NRM)
set_local_matrix(Lh['hand'], L_REST_M); curl_abs(Lh, 'L', L_REST_CURL, spread=3); aim_arm(Lh['hand'], Lh['arm'], L_ELBOW)
log(f'arms tris: {sum(tri_report(A["arms"]).values())}')

# ----------------------------------------------------------------------------------------------- animation (single 30 fps timeline)
def key_weapon(f, loc=(0, 0, 0), rot=(0, 0, 0)): key(weapon, f, loc=loc, rot=rot)
def key_left(f, M=None, curl=None, elbow=L_ELBOW): k_hand(Lh, f, M, curl, elbow)
def mag_matrix(loc, rot_x): return Matrix.Translation(MAG_ORIGIN + Vector(loc)) @ Matrix.Rotation(math.radians(rot_x), 4, 'X')
def key_mag(f, loc=(0, 0, 0), rot_x=0.0):
    key(mag, f, loc=MAG_ORIGIN + Vector(loc), rot=(rot_x, 0, 0)); return mag_matrix(loc, rot_x)
def key_bolt(f, back=0.0): key(bolt, f, loc=BOLT_ORIGIN + Vector((0, -back, 0)))
def key_carrier(f, back=0.0): key(carrier, f, loc=(0, -back, 0))
# left hand holding the magazine (weapon space at mag rest): palm on the mag's left face, fingers wrapping the front
L_MAG_M = hand_matrix((-0.031, 0.070, -0.100), (0.0, 0.95, -0.31), (1, 0, 0))
MAG_CURL = {'f1': (55, 45), 'f2': (60, 50), 'f3': (60, 50), 'f4': (62, 52), 'thumb': (15, 30)}
OPEN_CURL = {'f1': (15, 10), 'f2': (20, 15), 'f3': (20, 15), 'f4': (22, 18), 'thumb': (0, 10)}
H_REL = mag_matrix((0, 0, 0), 0).inverted() @ L_MAG_M
# charging-handle grab: hand comes over the top from the left, palm facing down/right, fingers hook the T-handle
L_CH_M = hand_matrix((-0.024, -0.030, B + 0.075), (0.60, -0.30, -0.74), (0.70, 0.0, -0.70))
CH_CURL = {'f1': (70, 60), 'f2': (72, 62), 'f3': (74, 64), 'f4': (76, 66), 'thumb': (20, 35)}
def ch_pull(back, up=0.0): return L_CH_M @ Matrix.Translation(L_CH_M.to_3x3().inverted() @ Vector((0, -back, up)))

# idle 0-60 (loops)
for f, (dz, rx) in ((0, (0, 0)), (15, (0.0018, 0.25)), (30, (0, 0)), (45, (-0.0016, -0.22)), (59, (0, 0))):
    key_weapon(f, (0, 0, dz), (rx, 0.4 * dz / 0.0018 if dz else 0, 0))
key_left(0, L_REST_M, L_REST_CURL); key_mag(0); key_bolt(0); key_carrier(0); key(trigger, 0, rot=(0, 0, 0))
# equip 60-90: rises from below-right, muzzle down, settles with a small overshoot
key_weapon(60, (0.13, -0.03, -0.30), (-42, 8, -28)); key_weapon(72, (0.04, 0, -0.09), (-12, 3, -9)); key_weapon(82, (-0.004, 0.004, 0.006), (2.5, -0.5, 1.5)); key_weapon(89)
key_left(59, L_REST_M, L_REST_CURL); key_left(89, L_REST_M, L_REST_CURL)
# fire 90-101: recoil kick, bolt carrier cycles 7 cm behind the port (charging handle stays), trigger pulls
key_weapon(90); key_weapon(92, (0.001, -0.014, 0.005), (2.4, -1.0, 0.5)); key_weapon(95, (0, -0.007, 0.002), (1.0, 0.3, -0.2)); key_weapon(100)
key_carrier(90); key_carrier(92, 0.070); key_carrier(96, 0.0); key_carrier(100)
key(trigger, 90, rot=(0, 0, 0)); key(trigger, 92, rot=(-14, 0, 0)); key(trigger, 97, rot=(0, 0, 0))
key_left(90, L_REST_M, L_REST_CURL); key_left(100, L_REST_M, L_REST_CURL)
# reload 101-190: gun rolls toward the camera; mag out (122), new mag in (156), charging handle pulled + released
key_weapon(101); key_weapon(112, (-0.03, -0.02, 0.10), (14, 30, 8)); key_weapon(156, (-0.03, -0.02, 0.10), (14, 30, 8))
key_weapon(164, (-0.02, -0.02, 0.06), (8, 8, 4)); key_weapon(178, (-0.02, -0.02, 0.06), (8, 8, 4)); key_weapon(189)
key_left(101, L_REST_M, L_REST_CURL); key_left(107, L_REST_M @ Matrix.Translation((0.03, -0.06, -0.03)), OPEN_CURL)
Mm = key_mag(101); key_mag(113); key_left(113, Mm @ H_REL, MAG_CURL)                       # grab the mag
Mm = key_mag(122, (0, 0.010, -0.060), 0); key_left(122, Mm @ H_REL, MAG_CURL)               # released, drawn straight out (event reload_mag_out)
Mm = key_mag(130, (0.02, 0.03, -0.20), 8); key_left(130, Mm @ H_REL, MAG_CURL)
key_mag(134, (0.04, 0.06, -0.42), 20); key_left(136, Mm @ H_REL @ Matrix.Translation((0, -0.04, -0.15)), OPEN_CURL)   # old mag dropped away
Mm = key_mag(135, (-0.04, 0.02, -0.44), 12)                                                  # fresh mag appears low
key_mag(140, (-0.04, 0.02, -0.44), 12); key_left(140, Mm @ H_REL, MAG_CURL)                 # hand takes the fresh mag
Mm = key_mag(150, (0, 0.012, -0.070), 0); key_left(150, Mm @ H_REL, MAG_CURL)               # aligned under the magwell
Mm = key_mag(156); key_left(156, Mm @ H_REL, MAG_CURL)                                       # slammed home (event reload_mag_in)
key_left(158, Mm @ H_REL @ Matrix.Translation((0, 0, 0.012)), MAG_CURL)                      # tap the base plate
key_left(166, L_CH_M, CH_CURL)                                                                # over the top to the charging handle
key_bolt(160); key_bolt(166); key_bolt(171, 0.080); key_bolt(173, 0.080); key_bolt(176, 0.0)
key_left(171, ch_pull(0.080), CH_CURL); key_left(173, ch_pull(0.080), CH_CURL); key_left(176, ch_pull(0.055, 0.03), OPEN_CURL)
key_left(189, L_REST_M, L_REST_CURL); key_mag(189); key_bolt(189); key_carrier(189)
# inspect 190-290: show the left side, roll to show the right side (port + dust cover), return
key_weapon(190); key_weapon(215, (-0.06, -0.05, 0.05), (-4, -25, 58)); key_weapon(232, (-0.03, -0.03, 0.03), (-1, -15, 25))
key_weapon(258, (-0.01, -0.05, 0.05), (6, -115, -28)); key_weapon(276, (-0.01, -0.01, 0.01), (1, -20, -4)); key_weapon(289)
key_left(190, L_REST_M, L_REST_CURL); key_left(289, L_REST_M, L_REST_CURL)
bezier([weapon, mag, bolt, carrier, trigger, Lh['hand'], Lh['arm']] + [Lh[k] for k in Lh if k.startswith('f') or k.startswith('thumb')])
bpy.context.scene.frame_set(0)
if POSE_ONLY:
    from common import _studio
    _studio((0, 0.15, 0))
    V = [('handR_right', (0.32, -0.28, -0.10), (0.02, -0.03, -0.04), 70), ('handR_left', (-0.32, -0.22, -0.12), (0.0, -0.03, -0.04), 70),
         ('handL_left', (-0.36, 0.16, -0.10), (-0.02, 0.29, 0.02), 70), ('handL_below', (0.02, 0.32, -0.42), (0, 0.29, 0.02), 50)]
    render_closeups(WID, V, 0)
    def at(f, ob, off):        # world position of an object at frame f (+ offset) for closeup targets
        bpy.context.scene.frame_set(f); return tuple(ob.matrix_world.translation + Vector(off))
    render_closeups(WID, [('mag_grab', tuple(Vector(at(118, mag, (0, 0, -0.10))) + Vector((-0.35, -0.08, -0.05))), at(118, mag, (0, 0, -0.10)), 60),
                          ('mag_grab_r', tuple(Vector(at(118, mag, (0, 0, -0.10))) + Vector((0.35, -0.10, -0.05))), at(118, mag, (0, 0, -0.10)), 60)], 118)
    render_closeups(WID, [('charge', tuple(Vector(at(172, bolt, (0, 0, 0))) + Vector((-0.30, -0.12, 0.18))), at(172, bolt, (0, 0.03, 0)), 60),
                          ('charge_r', tuple(Vector(at(172, bolt, (0, 0, 0))) + Vector((0.30, -0.20, 0.16))), at(172, bolt, (0, 0.03, 0)), 60)], 172)
    log(f'[{time.time() - T0:.0f}s] pose-only closeups done'); sys.exit(0)

# ----------------------------------------------------------------------------------------------- export, json, save
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

# ----------------------------------------------------------------------------------------------- review renders + verification
if '--no-render' not in sys.argv:
    render_review(WID, CLIPS, arms=A['arms'], world=world, gun_center=(0, 0.14, 0.02), gun_len=1.0, turntable=False)
verify_glb(glb)
log(f'[{time.time() - T0:.0f}s] done')
Path(EVIDENCE / f'{WID}_build_log.txt').write_text('\n'.join(LOG))
