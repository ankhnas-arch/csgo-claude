"""Regenerates assets-source/blender/usp.blend, public/assets/weapons/usp.glb + usp.anim.json and the review renders.
Run: python3 tools/blender/build_usp.py [--quick|--no-render|--pose-only]  (headless bpy 4.5). See PIPELINE.md / BUILD_LOG.md.
USP-S: compact polymer-framed pistol (0.195 m, 0.27 m with suppressor). The slide object is named `bolt` (the game looks for
`bolt` for the cycling part); an empty alias `slide` is parented to it."""
import sys, math, time, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

WID = 'usp'
B = 0.031                        # bore axis height above the weapon origin (rear of the grip / trigger area)
CLIPS = {'idle': (0, 60), 'equip': (60, 84), 'fire': (84, 96), 'reload': (96, 170), 'inspect': (170, 260)}
EVENTS = {'reload_mag_out': 112, 'reload_mag_in': 146, 'reload_end': 170}
T0 = time.time()
POSE_ONLY = '--pose-only' in sys.argv

reset_scene(frame_end=260)
weapon = empty('weapon', (0, 0, 0), None, 0.05)
MD, SB, PB, RB = 'metal_dark', 'steel_bright', 'polymer_black', 'rubber'

# ------------------------------------------------------------------------------------------------- frame (polymer) + grip + guard + rail
gaxis = Vector((0, -0.30, -0.954)).normalized(); gv = Vector((0, 0.954, -0.30)).normalized(); gtop = Vector((0, -0.026, 0.000))
def grip_ring(s, w, d, fwd=0.0, k=2.3):
    c = gtop + gaxis * (0.108 * s) + gv * fwd
    return place(ellipse2d(w, d, 20, k=k), c, (1, 0, 0), gv)
fp = [profile_extrude('frame_body', [(-0.052, -0.006), (0.118, -0.006), (0.118, 0.021), (-0.052, 0.021)], -0.0140, 0.0140, PB)]
add_bevel(fp[0], 0.003, 2)
rail = box('acc_rail', (0, 0.078, -0.012), (0.021, 0.060, 0.012), PB); add_bevel(rail, 0.002, 2); fp.append(rail)
for i in range(4): fp.append(box(f'rail_slot{i}', (0, 0.058 + i * 0.012, -0.018), (0.0215, 0.004, 0.0016), RB))
grip = loft('grip', [grip_ring(0.0, 0.031, 0.052), grip_ring(0.25, 0.031, 0.052, 0.0005), grip_ring(0.55, 0.032, 0.054, 0.002), grip_ring(0.85, 0.034, 0.056, 0.003), grip_ring(1.0, 0.030, 0.050, 0.002)], True, True, PB)
add_bevel(grip, 0.004, 2, 40); fp.append(grip)
beaver = box('beavertail', (0, -0.058, 0.008), (0.026, 0.016, 0.014), PB); add_bevel(beaver, 0.004, 2); fp.append(beaver)
guard = sweep('trigger_guard', [(0.060, -0.006), (0.061, -0.022), (0.056, -0.032), (0.044, -0.036), (0.006, -0.036), (-0.006, -0.032), (-0.010, -0.022), (-0.012, -0.006)], 0.012, 0.0045, PB); add_bevel(guard, 0.0012, 1); fp.append(guard)
fp.append(box('slide_release', (-0.0165, -0.012, 0.014), (0.004, 0.030, 0.006), MD))
fp.append(box('mag_release', (-0.0165, -0.028, -0.010), (0.003, 0.012, 0.010), PB))
fp.append(box('takedown', (0.0165, 0.012, 0.010), (0.003, 0.010, 0.006), MD))
hammer = profile_extrude('hammer', [(-0.060, 0.022), (-0.052, 0.022), (-0.052, 0.034), (-0.064, 0.038), (-0.066, 0.030)], -0.004, 0.004, MD); add_bevel(hammer, 0.001, 1); fp.append(hammer)
frame = join(fp, 'frame', weapon); shade_smooth(frame, 35)
muzzle = empty('muzzle', (0, 0.270, B), frame, 0.01); eject = empty('eject', (0.016, 0.040, B + 0.008), frame, 0.01)

# ------------------------------------------------------------------------------------------------- barrel + suppressor (children of frame)
bp = [cyl('barrel_tube', 0.0078, 0.172, (0, 0.040, B), 'Y', 20, mat=SB), cyl('thread', 0.0070, 0.020, (0, 0.135, B), 'Y', 20, mat=SB)]
barrel = join(bp, 'barrel', frame); shade_smooth(barrel, 30)
sp = [fluted_cyl('knurl', 0.0165, 0.0012, 0.016, (0, 0.152, B), 20, 60, MD, y_flute0=0.146, y_flute1=0.158),
      cyl('can', 0.0155, 0.104, (0, 0.212, B), 'Y', 32, mat=MD), cyl('can_tip', 0.0155, 0.006, (0, 0.267, B), 'Y', 32, r2=0.0130, mat=MD),
      cyl('can_bore', 0.0060, 0.004, (0, 0.269, B), 'Y', 12, mat=RB)]
suppressor = join(sp, 'suppressor', frame); shade_smooth(suppressor, 30)

# ------------------------------------------------------------------------------------------------- slide (named `bolt`) with port, serrations, sights
SL_ORIGIN = Vector((0, -0.050, 0.021))
slide = profile_extrude('slide', [(-0.050, 0.021), (0.125, 0.021), (0.125, 0.040), (0.118, 0.049), (-0.050, 0.049)], -0.0148, 0.0148, MD)
add_bevel(slide, 0.0045, 3); apply_mods(slide)
boolean_cut(slide, box('cut_port', (0.014, 0.030, 0.044), (0.016, 0.040, 0.016)))
slp = [slide]
for sx in (-1, 1):
    for i in range(6): slp.append(box(f'serr{sx}{i}', (sx * 0.0146, -0.044 + i * 0.0055, 0.034), (0.0012, 0.0022, 0.020), RB))
rs = box('rear_sight', (0, -0.040, 0.0525), (0.024, 0.008, 0.008), MD); add_bevel(rs, 0.0015, 1); slp.append(rs)
boolean_cut(rs, box('cut_notch', (0, -0.040, 0.056), (0.004, 0.010, 0.006)))
slp.append(box('front_sight', (0, 0.112, 0.0525), (0.004, 0.007, 0.008), MD))
for sx in (-1, 1): slp.append(cyl(f'dot{sx}', 0.0012, 0.002, (sx * 0.006, -0.0445, 0.054), 'Y', 8, mat=SB))
slp.append(cyl('dotf', 0.0012, 0.002, (0, 0.1085, 0.054), 'Y', 8, mat=SB))
bolt = join(slp, 'bolt', weapon); bolt.location = SL_ORIGIN
for v in bolt.data.vertices: v.co -= SL_ORIGIN
shade_smooth(bolt, 30)
slide_alias = empty('slide', (0, 0, 0), bolt, 0.01)

# ------------------------------------------------------------------------------------------------- magazine (origin at the mag well top) + trigger
MAG_ORIGIN = gtop + gaxis * 0.004 + gv * 0.002
def mring(s, w, d): return place(rounded_rect2d(w, d, 0.004, 3), gaxis * (0.118 * s), (1, 0, 0), gv)
mag_body = loft('mag_body', [mring(0.0, 0.021, 0.034), mring(0.92, 0.021, 0.034), mring(0.93, 0.025, 0.042), mring(1.0, 0.025, 0.042)], True, True, MD)
add_bevel(mag_body, 0.0012, 1, 35)
mag = join([mag_body], 'mag', weapon); mag.location = MAG_ORIGIN; shade_smooth(mag, 35)
TRIG_ORIGIN = Vector((0, 0.036, 0.000))
trigger = sweep('trigger', [(0.0, 0.002), (0.002, -0.009), (0.001, -0.016), (-0.003, -0.022), (-0.008, -0.026)], 0.007, 0.004, MD, weapon)
add_bevel(trigger, 0.0008, 1); apply_mods(trigger); trigger.location = TRIG_ORIGIN; shade_smooth(trigger, 30)

GUN_MESHES = [frame, barrel, suppressor, bolt, mag, trigger]
log(f'[{time.time() - T0:.0f}s] geometry built: ' + ', '.join(f'{o.name}={tri_count(o)}' for o in GUN_MESHES))

# ------------------------------------------------------------------------------------------------- bake + world copy
t = time.time(); world = None
if not POSE_ONLY:
    bake_object(bolt, 'metal', MD, prefix=f'{WID}_'); bake_object(frame, 'polymer', PB, prefix=f'{WID}_')
    log(f'[{time.time() - T0:.0f}s] bakes done in {time.time() - t:.1f}s')
    world = decimate_copy(GUN_MESHES, 'world', weapon, 900); log(f'world copy: {tri_count(world)} tris')

# ------------------------------------------------------------------------------------------------- arms + poses
A = build_arms(weapon); R, Lh = A['R'], A['L']
R_ELBOW = (0.10, -0.40, -0.26); L_ELBOW = (-0.14, -0.36, -0.28)
# right hand: high grip, web of the hand under the beavertail, index on the trigger
R_GRIP_M = hand_matrix_at((-0.029, 0.092, 0.001), (0.020, -0.018, -0.030), (-0.22, 0.86, -0.46), (-1, 0, 0))
R_GRIP_CURL = {'f1': (25, 30), 'f2': (88, 96), 'f3': (90, 98), 'f4': (92, 100), 'thumb': (40, 45)}
def point_thumb(H, M, world_dir, k2=15):
    """Aim a hand's thumb (first segment) along `world_dir` (given in the hand's parent space) after curling."""
    d = (M.to_3x3().inverted() @ Vector(world_dir)).normalized()
    H['thumb'].rotation_euler = Vector((0, 1, 0)).rotation_difference(d).to_euler('XYZ'); H['thumb_k2'].rotation_euler = Euler((math.radians(-k2), 0, 0), 'XYZ')
def key_right_grip(f):
    set_local_matrix(R['hand'], R_GRIP_M); curl_fingers(R, R_GRIP_CURL, spread=1, lift={'f1': 35}); point_thumb(R, R_GRIP_M, (-0.30, 1.0, 0.10))
    key_hand(R, f, None, None, R_ELBOW)
# left hand: two-handed cup grip, palm against the left side of the grip / right-hand fingers, fingers over the right fingers
L_CUP_M = hand_matrix_at((0.0, 0.050, -0.014), (-0.028, -0.052, -0.040), (0.70, 0.40, -0.59), (0.90, -0.05, 0.43))
L_CUP_CURL = {'f1': (58, 50), 'f2': (62, 54), 'f3': (64, 56), 'f4': (66, 60), 'thumb': (10, 20)}
def key_left_cup(f):
    set_local_matrix(Lh['hand'], L_CUP_M); curl_fingers(Lh, L_CUP_CURL, spread=2); point_thumb(Lh, L_CUP_M, (0.05, 1.0, 0.25))
    key_hand(Lh, f, None, None, L_ELBOW)
log(f'arms tris: {sum(tri_report(A["arms"]).values())}')
OPEN_CURL = {'f1': (15, 10), 'f2': (20, 15), 'f3': (20, 15), 'f4': (22, 18), 'thumb': (0, 10)}
# fresh-mag hold (relative to the mag): palm under the baseplate, fingers along the front of the mag
MAG_BOTTOM = gaxis * 0.118
L_MAG_M = hand_matrix_at((0.0, 0.050, -0.012), MAG_ORIGIN + MAG_BOTTOM + gaxis * 0.010, gv, -gaxis)
MAG_CURL = {'f1': (55, 45), 'f2': (58, 48), 'f3': (58, 48), 'f4': (60, 50), 'thumb': (15, 30)}
def mag_matrix(d=0.0, extra=(0, 0, 0), rot_x=0.0): return Matrix.Translation(MAG_ORIGIN + gaxis * d + Vector(extra)) @ Matrix.Rotation(math.radians(rot_x), 4, 'X')
def key_mag(f, d=0.0, extra=(0, 0, 0), rot_x=0.0):
    key(mag, f, loc=MAG_ORIGIN + gaxis * d + Vector(extra), rot=(rot_x, 0, 0)); return mag_matrix(d, extra, rot_x)
H_REL = mag_matrix().inverted() @ L_MAG_M
# slide-rack (overhand) pose: palm down over the rear of the slide, fingers over the right side, thumb on the left
L_RACK_M = hand_matrix_at((0.0, 0.050, -0.012), (0.0, -0.028, 0.054), (0.92, -0.10, -0.38), (0.15, 0.0, -0.99))
RACK_CURL = {'f1': (55, 60), 'f2': (58, 62), 'f3': (60, 64), 'f4': (62, 66), 'thumb': (20, 30)}
def key_weapon(f, loc=(0, 0, 0), rot=(0, 0, 0)): key(weapon, f, loc=loc, rot=rot)
def key_slide(f, dy=0.0): key(bolt, f, loc=SL_ORIGIN + Vector((0, dy, 0)))

# ------------------------------------------------------------------------------------------------- animation (single 30 fps timeline)
for f, (dz, rx) in ((0, (0, 0)), (15, (0.0015, 0.25)), (30, (0.0, 0.0)), (45, (-0.0014, -0.22)), (59, (0, 0))):
    key_weapon(f, (0, 0, dz), (rx, 0.4 * dz / 0.0015 if dz else 0, 0))
key_right_grip(0); key_left_cup(0); key_mag(0); key_slide(0); key(trigger, 0, rot=(0, 0, 0))
# equip 60-84
key_weapon(60, (0.12, -0.06, -0.28), (-45, 12, -25)); key_weapon(70, (0.03, -0.01, -0.07), (-10, 3, -6)); key_weapon(78, (-0.003, 0.003, 0.005), (2.5, -0.5, 1.2)); key_weapon(83)
key_right_grip(59); key_right_grip(83); key_left_cup(59); key_left_cup(83)
# fire 84-96: kick + slide cycle (28 mm) + trigger
key_weapon(84); key_weapon(86, (0.001, -0.012, 0.005), (5.0, -1.0, 0.8)); key_weapon(90, (0.0, -0.004, 0.002), (1.5, 0.5, -0.3)); key_weapon(95)
key_slide(84); key_slide(86, -0.028); key_slide(90, 0.0); key_slide(95)
key(trigger, 84, rot=(0, 0, 0)); key(trigger, 86, rot=(-16, 0, 0)); key(trigger, 92, rot=(0, 0, 0))
key_right_grip(84); key_right_grip(95); key_left_cup(84); key_left_cup(95)
# reload 96-170: gun tilts up/rolls toward the camera; mag drops, left hand fetches a fresh one, inserts, racks the slide
key_weapon(96); key_weapon(106, (-0.02, -0.03, 0.08), (22, 30, 6)); key_weapon(150, (-0.02, -0.03, 0.08), (22, 30, 6)); key_weapon(158, (-0.01, -0.03, 0.06), (10, 15, 4)); key_weapon(169)
key_right_grip(96); key_right_grip(169)
key_left_cup(96); key_hand(Lh, 103, L_CUP_M @ Matrix.Translation((-0.04, -0.05, -0.06)), OPEN_CURL, L_ELBOW)
key_mag(104); key_mag(112, 0.11); key_mag(118, 0.30, (0, 0.01, 0), 10)                             # mag drops free (event reload_mag_out 112)
key_hand(Lh, 112, L_CUP_M @ Matrix.Translation((-0.06, -0.10, -0.20)), OPEN_CURL, L_ELBOW)         # hand goes down for the fresh mag
Mm = key_mag(119, 0.36, (-0.04, -0.03, 0)); key_hand(Lh, 119, Mm @ H_REL, MAG_CURL, L_ELBOW)       # fresh mag appears in the hand (below view)
key_mag(124, 0.36, (-0.04, -0.03, 0)); key_hand(Lh, 124, Mm @ H_REL, MAG_CURL, L_ELBOW)
Mm = key_mag(138, 0.06, (0, 0, 0)); key_hand(Lh, 138, Mm @ H_REL, MAG_CURL, L_ELBOW)               # lined up with the well
Mm = key_mag(146); key_hand(Lh, 146, Mm @ H_REL, MAG_CURL, L_ELBOW)                                 # seated (event reload_mag_in 146)
key_hand(Lh, 149, Mm @ H_REL @ Matrix.Translation((0, 0.0, -0.03)), OPEN_CURL, L_ELBOW)
key_hand(Lh, 154, L_RACK_M, RACK_CURL, (-0.10, -0.30, -0.05)); key_slide(154)                       # overhand rack
key_hand(Lh, 158, L_RACK_M @ Matrix.Translation(L_RACK_M.to_3x3().inverted() @ Vector((0, -0.030, 0))), RACK_CURL, (-0.10, -0.32, -0.05)); key_slide(158, -0.030)
key_hand(Lh, 160, L_RACK_M @ Matrix.Translation(L_RACK_M.to_3x3().inverted() @ Vector((-0.02, -0.035, 0.03))), OPEN_CURL, (-0.12, -0.32, -0.05)); key_slide(161, 0.0)
key_left_cup(168); key_mag(169); key_slide(169)
# inspect 170-260: show the left side, then roll to show the right side and the suppressor, return
key_weapon(170); key_weapon(195, (-0.05, -0.05, 0.05), (-4, -25, 55)); key_weapon(212, (-0.03, -0.03, 0.03), (-1, -15, 25))
key_weapon(236, (-0.01, -0.05, 0.05), (6, -110, -28)); key_weapon(250, (-0.01, -0.01, 0.01), (1, -20, -4)); key_weapon(259)
key_right_grip(170); key_right_grip(259); key_left_cup(170); key_left_cup(259); key_mag(259); key_slide(259)
set_bezier([weapon, mag, bolt, trigger] + [H[k] for H in (R, Lh) for k in H if k in ('hand', 'arm') or k.startswith('f') or k.startswith('thumb')])
bpy.context.scene.frame_set(0)

if POSE_ONLY:
    from common import _studio
    _studio((0, 0.08, 0))
    def wv(frame, views):
        bpy.context.scene.frame_set(frame); M = weapon.matrix_world.copy()
        return [(n, M @ Vector(l), M @ Vector(t), lens) for n, l, t, lens in views]
    render_closeups(WID, [('grip_right', (0.40, -0.30, -0.02), (0.0, -0.03, -0.04), 50), ('grip_left', (-0.42, -0.06, 0.06), (0.0, -0.03, -0.03), 55), ('grip_front', (0.02, 0.46, -0.12), (0.0, -0.02, -0.04), 50), ('side_ref', (-0.55, 0.09, 0.0), (0, 0.09, 0.0), 50)], 0)
    render_closeups(WID, wv(130, [('mag_hold', (-0.34, -0.10, -0.24), (-0.02, -0.04, -0.09), 50)]), 130)
    render_closeups(WID, wv(157, [('rack', (-0.30, -0.28, 0.20), (0.0, -0.02, 0.03), 50)]), 157)
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
    render_review(WID, CLIPS, arms=A['arms'], world=world, gun_center=(0, 0.09, -0.01), gun_len=0.44, turntable=False)
verify_glb(glb)
log(f'[{time.time() - T0:.0f}s] done')
Path(EVIDENCE / f'{WID}_build_log.txt').write_text('\n'.join(LOG))
