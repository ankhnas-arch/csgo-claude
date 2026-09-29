"""Shared helpers for the headless Blender (bpy 4.5) weapon pipeline. See PIPELINE.md.

Conventions: metres, muzzle +Y, up +Z, weapon right side +X. Root empty `weapon` at origin.
Everything here is deterministic and re-runnable (no randomness outside seeded noise textures).
"""
import math, json, os, struct, time
from pathlib import Path
import bpy, bmesh
from mathutils import Vector, Matrix, Euler

ROOT = Path(__file__).resolve().parents[2]            # .../app
ASSETS_SRC = ROOT / 'assets-source' / 'blender'
PUBLIC_WEAPONS = ROOT / 'public' / 'assets' / 'weapons'
EVIDENCE = ROOT / 'evidence' / 'blender'
for _d in (ASSETS_SRC, PUBLIC_WEAPONS, EVIDENCE):
    _d.mkdir(parents=True, exist_ok=True)

FPS = 30
LOG = []
def log(*a):
    s = ' '.join(str(x) for x in a); LOG.append(s); print(s, flush=True)

# --------------------------------------------------------------------------------------- scene
def reset_scene(frame_end=280):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS; sc.frame_start = 0; sc.frame_end = frame_end
    sc.unit_settings.system = 'METRIC'; sc.unit_settings.scale_length = 1.0
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 16; sc.cycles.seed = 1
    return sc

def ctx_override(obj):
    return bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj], selected_editable_objects=[obj])

def select_only(obj):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active = obj

# --------------------------------------------------------------------------------------- materials
# name: (base rgb, metallic, roughness, emission strength)
MATERIAL_SPECS = {
    'metal_blued':  ((0.085, 0.095, 0.115), 1.0, 0.45, 0.0),
    'polymer':      ((0.13, 0.05, 0.025), 0.0, 0.70, 0.0),     # bakelite-ish grip
    'wood':         ((0.42, 0.22, 0.09), 0.0, 0.50, 0.0),
    'steel_bright': ((0.62, 0.62, 0.64), 1.0, 0.30, 0.0),
    'rubber':       ((0.02, 0.02, 0.02), 0.0, 0.90, 0.0),
    'glove':        ((0.03, 0.03, 0.035), 0.0, 0.60, 0.0),
    'sleeve':       ((0.16, 0.17, 0.13), 0.0, 0.90, 0.0),
    'glass':        ((0.02, 0.03, 0.05), 0.0, 0.10, 0.4),
}

def get_mat(name):
    m = bpy.data.materials.get(name)
    if m: return m
    rgb, met, rough, emis = MATERIAL_SPECS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Metallic'].default_value = met
    bsdf.inputs['Roughness'].default_value = rough
    if emis > 0:
        bsdf.inputs['Emission Color'].default_value = (0.2, 0.3, 0.5, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emis
    m.diffuse_color = (*rgb, 1.0); m.metallic = met; m.roughness = rough   # workbench preview
    return m

# --------------------------------------------------------------------------------------- geometry
def mesh_from_bm(name, bm, mat=None, parent=None, loc=(0, 0, 0)):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    if mat is not None: me.materials.append(mat if isinstance(mat, bpy.types.Material) else get_mat(mat))
    if parent is not None: set_parent(ob, parent)
    return ob

def set_parent(child, parent):
    """Parent keeping the child's current local transform values (parent inverse = identity)."""
    child.parent = parent; child.matrix_parent_inverse = Matrix.Identity(4)

def empty(name, loc=(0, 0, 0), parent=None, size=0.02):
    e = bpy.data.objects.new(name, None); e.empty_display_size = size; e.empty_display_type = 'PLAIN_AXES'
    bpy.context.scene.collection.objects.link(e); e.location = loc
    if parent is not None: set_parent(e, parent)
    return e

def loft(name, rings, cap_start=True, cap_end=True, mat=None, parent=None, loc=(0, 0, 0), closed=True):
    """Skin a list of rings (each a list of N 3D points, same N) into a tube; caps as n-gons."""
    bm = bmesh.new(); n = len(rings[0]); vs = []
    for r in rings:
        assert len(r) == n
        vs.append([bm.verts.new(Vector(p)) for p in r])
    for i in range(len(rings) - 1):
        m = n if closed else n - 1
        for j in range(m):
            a, b = vs[i][j], vs[i][(j + 1) % n]; c, d = vs[i + 1][(j + 1) % n], vs[i + 1][j]
            if a.co != b.co and c.co != d.co: bm.faces.new((a, b, c, d))
            elif a.co == b.co: bm.faces.new((a, c, d))
            else: bm.faces.new((a, b, c))
    if closed and cap_start: bm.faces.new(list(reversed(vs[0])))
    if closed and cap_end: bm.faces.new(vs[-1])
    return mesh_from_bm(name, bm, mat, parent, loc)

def rounded_rect2d(w, h, r=0.0, seg=3, cx=0.0, cy=0.0):
    """Rounded rectangle (counter-clockwise) in 2D; returns list of (u, v). r=0 -> plain rectangle with `seg` verts per corner collapsed."""
    hw, hh = w / 2, h / 2; r = min(r, hw, hh); pts = []
    corners = [(hw - r, hh - r, 0), (-hw + r, hh - r, 90), (-hw + r, -hh + r, 180), (hw - r, -hh + r, 270)]
    for cxo, cyo, a0 in corners:
        for k in range(seg + 1):
            if r <= 0 and k > 0: break
            a = math.radians(a0 + 90 * k / seg)
            pts.append((cx + cxo + r * math.cos(a), cy + cyo + r * math.sin(a)))
    return pts

def ellipse2d(w, h, n=16, cx=0.0, cy=0.0, k=1.0):
    """Ellipse / superellipse (k>1 -> squarer)."""
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n; c, s = math.cos(a), math.sin(a)
        cs = math.copysign(abs(c) ** (2 / k), c); ss = math.copysign(abs(s) ** (2 / k), s)
        out.append((cx + w / 2 * cs, cy + h / 2 * ss))
    return out

def place(shape, origin, u, v):
    o, u, v = Vector(origin), Vector(u), Vector(v)
    return [o + u * a + v * b for a, b in shape]

def ring_y(shape, y, sx=1.0, sz=1.0, dx=0.0, dz=0.0):
    """Shape in XZ plane at height y (used for lofts along +Y). shape u->X, v->Z."""
    return place(shape, (dx, y, dz), (sx, 0, 0), (0, 0, sz))

def profile_extrude(name, pts_yz, x0, x1, mat=None, parent=None, loc=(0, 0, 0)):
    """Side profile (list of (y,z), CCW when seen from +X) extruded along X from x0 to x1."""
    bm = bmesh.new()
    a = [bm.verts.new(Vector((x0, y, z))) for y, z in pts_yz]
    b = [bm.verts.new(Vector((x1, y, z))) for y, z in pts_yz]
    bm.faces.new(a); bm.faces.new(list(reversed(b)))
    n = len(a)
    for i in range(n): bm.faces.new((a[i], b[i], b[(i + 1) % n], a[(i + 1) % n]))
    return mesh_from_bm(name, bm, mat, parent, loc)

def box(name, center, size, mat=None, parent=None):
    cx, cy, cz = center; sx, sy, sz = [s / 2 for s in size]
    pts = [(cy - sy, cz - sz), (cy + sy, cz - sz), (cy + sy, cz + sz), (cy - sy, cz + sz)]
    return profile_extrude(name, pts, cx - sx, cx + sx, mat, parent)

def cyl(name, r, length, center, axis='Y', segs=24, r2=None, mat=None, parent=None, cap=True):
    """Cylinder (or cone if r2) along axis, centred at `center`."""
    r2 = r if r2 is None else r2; rings = []
    for t, rr in ((-0.5, r), (0.5, r2)):
        shape = ellipse2d(2 * rr, 2 * rr, segs)
        if axis == 'Y': rings.append(place(shape, (center[0], center[1] + t * length, center[2]), (1, 0, 0), (0, 0, 1)))
        elif axis == 'X': rings.append(place(shape, (center[0] + t * length, center[1], center[2]), (0, 1, 0), (0, 0, 1)))
        else: rings.append(place(shape, (center[0], center[1], center[2] + t * length), (1, 0, 0), (0, 1, 0)))
    return loft(name, rings, cap, cap, mat, parent)

def sweep(name, path, width, thick, mat=None, parent=None, seg_corner=1):
    """Sweep a rectangular section (width along X, `thick` in the path plane) along a YZ path (list of (y,z)) - open path."""
    rings = []; P = [Vector((0, y, z)) for y, z in path]
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        nrm = Vector((0, -t.z, t.y))          # in-plane normal
        rings.append(place(rounded_rect2d(width, thick, 0, 1), p, (1, 0, 0), nrm))
    return loft(name, rings, True, True, mat, parent)

def add_bevel(obj, width=0.002, segments=2, angle=30.0, profile=0.5):
    m = obj.modifiers.new('bevel', 'BEVEL'); m.width = width; m.segments = segments
    m.limit_method = 'ANGLE'; m.angle_limit = math.radians(angle); m.profile = profile; m.miter_outer = 'MITER_ARC'
    return m

def apply_mods(obj):
    with ctx_override(obj):
        for m in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)

def boolean_cut(obj, cutter, op='DIFFERENCE'):
    m = obj.modifiers.new('bool', 'BOOLEAN'); m.object = cutter; m.operation = op; m.solver = 'EXACT'
    apply_mods(obj)
    bpy.data.objects.remove(cutter, do_unlink=True)

def join(objs, name, parent=None):
    """Join objects (modifiers applied first) into one named object; parent kept as given."""
    for o in objs: apply_mods(o)
    base = objs[0]
    with bpy.context.temp_override(object=base, active_object=base, selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    base.name = name; base.data.name = name
    if parent is not None: set_parent(base, parent)
    return base

def shade_smooth(obj, angle=30.0):
    """Smooth shading with sharp edges where the face angle exceeds `angle` (like shade_smooth_by_angle)."""
    me = obj.data
    for p in me.polygons: p.use_smooth = True
    bm = bmesh.new(); bm.from_mesh(me); thr = math.radians(angle)
    for e in bm.edges:
        e.smooth = (len(e.link_faces) != 2) or (e.calc_face_angle(0.0) <= thr)
    bm.to_mesh(me); bm.free()

def tri_count(obj):
    if obj.type != 'MESH': return 0
    dg = bpy.context.evaluated_depsgraph_get(); ev = obj.evaluated_get(dg); me = ev.to_mesh()
    n = sum(len(p.vertices) - 2 for p in me.polygons); ev.to_mesh_clear(); return n

def tri_report(root):
    """Return {name: tris} for root and all descendants, plus total."""
    out = {}
    def rec(o):
        if o.type == 'MESH': out[o.name] = tri_count(o)
        for c in o.children: rec(c)
    rec(root); return out

def decimate_copy(objs, name, parent, target_tris=1400):
    """Single-mesh decimated copy of the given mesh objects (world-space), named `name`."""
    copies = []
    for o in objs:
        c = o.copy(); c.data = o.data.copy(); c.animation_data_clear(); bpy.context.scene.collection.objects.link(c)
        c.matrix_world = o.matrix_world.copy(); c.parent = None; copies.append(c)
    w = join(copies, name)
    w.matrix_world = Matrix.Identity(4)
    tris = tri_count(w)
    m = w.modifiers.new('dec', 'DECIMATE'); m.ratio = min(1.0, target_tris / max(1, tris)); m.use_collapse_triangulate = True
    apply_mods(w); shade_smooth(w, 40)
    set_parent(w, parent); return w

def smart_uv(obj, margin=0.02):
    select_only(obj)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')

# --------------------------------------------------------------------------------------- baking
def _surface_nodes(nt, kind, base_rgb, base_rough):
    """Build procedural Color + Roughness sockets for `kind` in node tree nt. Returns (color_socket, rough_socket)."""
    N = nt.nodes; L = nt.links
    tc = N.new('ShaderNodeTexCoord')
    geo = N.new('ShaderNodeNewGeometry')
    # edge wear: compare the true normal with a bevelled normal (per shading point, so flat faces stay clean)
    bev = N.new('ShaderNodeBevel'); bev.samples = 2; bev.inputs['Radius'].default_value = 0.0035
    dotn = N.new('ShaderNodeVectorMath'); dotn.operation = 'DOT_PRODUCT'
    L.new(geo.outputs['True Normal'], dotn.inputs[0]); L.new(bev.outputs['Normal'], dotn.inputs[1])
    ramp_e = N.new('ShaderNodeValToRGB'); ramp_e.color_ramp.elements[0].position = 0.80; ramp_e.color_ramp.elements[1].position = 0.985
    ramp_e.color_ramp.elements[0].color = (1, 1, 1, 1); ramp_e.color_ramp.elements[1].color = (0, 0, 0, 1)
    L.new(dotn.outputs['Value'], ramp_e.inputs['Fac'])
    wear_noise = N.new('ShaderNodeTexNoise'); wear_noise.inputs['Scale'].default_value = 90; wear_noise.inputs['Detail'].default_value = 3
    L.new(tc.outputs['Object'], wear_noise.inputs['Vector'])
    wear_mul = N.new('ShaderNodeMath'); wear_mul.operation = 'MULTIPLY'
    L.new(ramp_e.outputs['Color'], wear_mul.inputs[0]); L.new(wear_noise.outputs['Fac'], wear_mul.inputs[1])
    wear_gain = N.new('ShaderNodeMath'); wear_gain.operation = 'MULTIPLY'; wear_gain.inputs[1].default_value = 1.4 if kind == 'metal' else 0.9
    L.new(wear_mul.outputs[0], wear_gain.inputs[0])
    wear_clamp = N.new('ShaderNodeClamp'); L.new(wear_gain.outputs[0], wear_clamp.inputs['Value'])
    # scratches: stretched high-frequency noise thresholded
    map_s = N.new('ShaderNodeMapping'); map_s.inputs['Scale'].default_value = (1.0, 0.06, 1.0) if kind != 'wood' else (1.0, 0.04, 1.0)
    L.new(tc.outputs['Object'], map_s.inputs['Vector'])
    scr = N.new('ShaderNodeTexNoise'); scr.inputs['Scale'].default_value = 260 if kind == 'metal' else 180; scr.inputs['Detail'].default_value = 1
    L.new(map_s.outputs['Vector'], scr.inputs['Vector'])
    scr_ramp = N.new('ShaderNodeValToRGB'); scr_ramp.color_ramp.elements[0].position = 0.70; scr_ramp.color_ramp.elements[1].position = 0.74
    L.new(scr.outputs['Fac'], scr_ramp.inputs['Fac'])
    scr_gain = N.new('ShaderNodeMath'); scr_gain.operation = 'MULTIPLY'; scr_gain.inputs[1].default_value = 0.35 if kind == 'metal' else 0.25
    L.new(scr_ramp.outputs['Color'], scr_gain.inputs[0])
    wear_total = N.new('ShaderNodeMath'); wear_total.operation = 'ADD'; wear_total.use_clamp = True
    L.new(wear_clamp.outputs[0], wear_total.inputs[0]); L.new(scr_gain.outputs[0], wear_total.inputs[1])
    # base colour variation
    var = N.new('ShaderNodeTexNoise'); var.inputs['Scale'].default_value = 25 if kind != 'wood' else 8; var.inputs['Detail'].default_value = 4
    L.new(tc.outputs['Object'], var.inputs['Vector'])
    if kind == 'wood':
        mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1.0, 0.09, 1.0)
        L.new(tc.outputs['Object'], mp.inputs['Vector'])
        grain = N.new('ShaderNodeTexNoise'); grain.inputs['Scale'].default_value = 120; grain.inputs['Detail'].default_value = 5; grain.inputs['Roughness'].default_value = 0.6
        L.new(mp.outputs['Vector'], grain.inputs['Vector'])
        gramp = N.new('ShaderNodeValToRGB'); cr = gramp.color_ramp
        cr.elements[0].position = 0.30; cr.elements[0].color = (0.11, 0.040, 0.014, 1)
        cr.elements[1].position = 0.72; cr.elements[1].color = (0.40, 0.185, 0.060, 1)
        e2 = cr.elements.new(0.50); e2.color = (0.25, 0.105, 0.035, 1)
        L.new(grain.outputs['Fac'], gramp.inputs['Fac'])
        # large-scale tone variation
        tone = N.new('ShaderNodeMixRGB'); tone.blend_type = 'MULTIPLY'; tone.inputs['Fac'].default_value = 0.5
        L.new(gramp.outputs['Color'], tone.inputs['Color1'])
        vr = N.new('ShaderNodeValToRGB'); vr.color_ramp.elements[0].color = (0.72, 0.62, 0.55, 1); vr.color_ramp.elements[1].color = (1.10, 1.04, 0.98, 1)
        L.new(var.outputs['Fac'], vr.inputs['Fac']); L.new(vr.outputs['Color'], tone.inputs['Color2'])
        base_col = tone.outputs['Color']
        wear_col = (0.50, 0.34, 0.18, 1)       # worn paler wood at edges
        rough_base, rough_span = 0.42, 0.22
    else:
        vr = N.new('ShaderNodeValToRGB'); vr.color_ramp.elements[0].color = tuple(c * 0.75 for c in base_rgb) + (1,); vr.color_ramp.elements[1].color = tuple(c * 1.35 for c in base_rgb) + (1,)
        L.new(var.outputs['Fac'], vr.inputs['Fac'])
        base_col = vr.outputs['Color']
        wear_col = (0.42, 0.42, 0.44, 1)       # bare steel showing through the bluing
        rough_base, rough_span = base_rough - 0.08, 0.20
    mixc = N.new('ShaderNodeMixRGB'); mixc.inputs['Color2'].default_value = wear_col
    L.new(wear_total.outputs[0], mixc.inputs['Fac']); L.new(base_col, mixc.inputs['Color1'])
    # roughness = base + variation*span - wear*0.25
    r1 = N.new('ShaderNodeMath'); r1.operation = 'MULTIPLY_ADD'; r1.inputs[1].default_value = rough_span; r1.inputs[2].default_value = rough_base
    L.new(var.outputs['Fac'], r1.inputs[0])
    r2 = N.new('ShaderNodeMath'); r2.operation = 'MULTIPLY'; r2.inputs[1].default_value = -0.25 if kind == 'metal' else 0.15
    L.new(wear_total.outputs[0], r2.inputs[0])
    r3 = N.new('ShaderNodeMath'); r3.operation = 'ADD'; r3.use_clamp = True
    L.new(r1.outputs[0], r3.inputs[0]); L.new(r2.outputs[0], r3.inputs[1])
    return mixc.outputs['Color'], r3.outputs[0]

def bake_object(obj, kind, mat_name, size=1024, samples=16, margin=0.02, prefix=''):
    """Smart-UV `obj`, bake procedural base colour + roughness (Cycles CPU, EMIT bakes) into size² images and
    assign a new image-textured Principled material `<mat_name>_<obj.name>`. kind: 'metal' | 'wood' | 'polymer'."""
    t0 = time.time(); sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    sc.render.bake.margin = 6; sc.render.bake.use_clear = True; sc.render.bake.use_selected_to_active = False
    base_rgb, met, base_rough, _ = MATERIAL_SPECS[mat_name]
    smart_uv(obj, margin)
    bm_ = bpy.data.materials.new(f'_bake_{obj.name}'); bm_.use_nodes = True; nt = bm_.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); emit = nt.nodes.new('ShaderNodeEmission'); nt.links.new(emit.outputs[0], out.inputs['Surface'])
    col_sock, rough_sock = _surface_nodes(nt, kind, base_rgb, base_rough)
    obj.data.materials.clear(); obj.data.materials.append(bm_)
    imgs = {}
    for tag, sock, cs in (('basecolor', col_sock, 'sRGB'), ('roughness', rough_sock, 'Non-Color')):
        img = bpy.data.images.new(f'{obj.name}_{tag}', size, size, alpha=False); img.colorspace_settings.name = cs
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nt.nodes.active = tex
        for l in list(emit.inputs['Color'].links): nt.links.remove(l)
        nt.links.new(sock, emit.inputs['Color'])
        select_only(obj)
        bpy.ops.object.bake(type='EMIT', margin=6, use_clear=True)
        tex_dir = ASSETS_SRC / 'textures'; tex_dir.mkdir(exist_ok=True)
        jpg = tex_dir / f"{prefix}{obj.name}_{tag}.jpg"
        sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 88; sc.render.image_settings.color_mode = 'RGB'
        img.save_render(str(jpg)); nt.nodes.remove(tex); bpy.data.images.remove(img)
        img = bpy.data.images.load(str(jpg)); img.colorspace_settings.name = cs; img.pack(); imgs[tag] = img
    # final material
    fm = bpy.data.materials.new(f'{mat_name}_{obj.name}'); fm.use_nodes = True; nt2 = fm.node_tree
    bsdf = nt2.nodes['Principled BSDF']; bsdf.inputs['Metallic'].default_value = met
    tc = nt2.nodes.new('ShaderNodeTexImage'); tc.image = imgs['basecolor']; nt2.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
    tr = nt2.nodes.new('ShaderNodeTexImage'); tr.image = imgs['roughness']; nt2.links.new(tr.outputs['Color'], bsdf.inputs['Roughness'])
    fm.diffuse_color = (*base_rgb, 1.0); fm.metallic = met; fm.roughness = base_rough
    obj.data.materials.clear(); obj.data.materials.append(fm)
    bpy.data.materials.remove(bm_)
    log(f'  baked {obj.name}: {kind} {size}x{size} basecolor+roughness in {time.time() - t0:.1f}s')
    return fm

# --------------------------------------------------------------------------------------- arms / hands
def _finger_segment(name, length, r0, r1, parent, mat, tip=False, segs=10):
    """Tapered rounded finger segment along local +Y from y=-r0*0.6 (rounded root) to y=length (rounded tip)."""
    rings = []
    # rounded root (so the joint looks continuous when bent)
    for a in (-0.6, -0.3):
        f = math.sqrt(max(0.0, 1 - (a / 0.6) ** 2)) if a < 0 else 1
        rings.append(ring_y(ellipse2d(2 * r0 * max(f, 0.35), 2 * r0 * 0.9 * max(f, 0.35), segs, k=1.3), a * r0 * 0.6 + 0.0 if False else a * r0))
    rings.append(ring_y(ellipse2d(2 * r0, 2 * r0 * 0.9, segs, k=1.3), 0.0))
    rings.append(ring_y(ellipse2d(2 * (r0 * 0.5 + r1 * 0.5), 2 * (r0 * 0.5 + r1 * 0.5) * 0.9, segs, k=1.3), length * 0.5))
    if tip:
        rings.append(ring_y(ellipse2d(2 * r1, 2 * r1 * 0.9, segs, k=1.3), length - r1 * 0.9))
        rings.append(ring_y(ellipse2d(2 * r1 * 0.75, 2 * r1 * 0.72, segs), length - r1 * 0.35, dz=-r1 * 0.05))
        rings.append(ring_y(ellipse2d(2 * r1 * 0.3, 2 * r1 * 0.3, segs), length, dz=-r1 * 0.12))
    else:
        rings.append(ring_y(ellipse2d(2 * r1, 2 * r1 * 0.9, segs, k=1.3), length - r1 * 0.3))
        rings.append(ring_y(ellipse2d(2 * r1 * 0.8, 2 * r1 * 0.75, segs), length + r1 * 0.25))
    ob = loft(name, rings, True, True, mat, parent); shade_smooth(ob, 50); return ob

def _hand(side, parent):
    """Gloved hand in canonical frame: origin at wrist, palm normal -Z, fingers +Y, thumb at -X (R) / +X (L).
    Returns dict of created objects."""
    s = -1.0 if side == 'R' else 1.0      # thumb side sign
    glove = get_mat('glove')
    hand = empty(f'hand_{side}', (0, 0, 0), parent); hand.rotation_mode = 'QUATERNION'
    objs = {'hand': hand}
    # palm: loft along +Y with superellipse sections (soft box), domed back, tapered at the wrist, widest at the knuckles
    sh = lambda w, h: ellipse2d(w, h, 20, k=1.7)
    palm_rings = [
        ring_y(sh(0.056, 0.026), 0.000),
        ring_y(sh(0.070, 0.030), 0.020, dz=0.0015),
        ring_y(sh(0.079, 0.032), 0.046, dz=0.0030),
        ring_y(sh(0.084, 0.030), 0.072, dz=0.0025),
        ring_y(sh(0.083, 0.026), 0.090, dz=0.0010),
    ]
    palm = loft(f'palm_{side}', palm_rings, True, True, glove, hand)
    add_bevel(palm, 0.006, 2, 40); apply_mods(palm); shade_smooth(palm, 40); objs['palm'] = palm
    # knuckle bumps: small squashed spheres at the finger bases
    bm = bmesh.new()
    finger_x = [-0.029, -0.010, 0.010, 0.029]  # index .. pinky for R (thumb at -X); mirrored for L
    finger_len = [(0.044, 0.038), (0.049, 0.042), (0.046, 0.040), (0.036, 0.032)]
    finger_r = [0.0092, 0.0095, 0.0090, 0.0080]
    for i, fx in enumerate(finger_x):
        bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=finger_r[i] * 0.95, matrix=Matrix.Translation((s * -fx, 0.089, 0.004)) @ Matrix.Diagonal((1.0, 1.0, 0.75, 1.0)))
    kn = mesh_from_bm(f'knuckles_{side}', bm, glove, hand); shade_smooth(kn, 60); objs['knuckles'] = kn
    # fingers: empty at knuckle -> seg1 mesh + empty k2 at joint -> seg2 mesh
    for i, fx in enumerate(finger_x):
        L1, L2 = finger_len[i]; r = finger_r[i]
        base = empty(f'f{side}_{i + 1}', (s * -fx, 0.092, 0.001), hand, 0.01); base.rotation_mode = 'XYZ'
        seg1 = _finger_segment(f'f{side}_{i + 1}_s1', L1, r, r * 0.9, base, glove)
        k2 = empty(f'f{side}_{i + 1}_k2', (0, L1, 0), base, 0.008); k2.rotation_mode = 'XYZ'
        seg2 = _finger_segment(f'f{side}_{i + 1}_s2', L2, r * 0.9, r * 0.7, k2, glove, tip=True)
        objs[f'f{i + 1}'] = base; objs[f'f{i + 1}_k2'] = k2
    # thumb: base at the palm side near the wrist, opposed (pointing forward-out and slightly below the palm)
    tb = empty(f'thumb_{side}', (s * 0.028, 0.024, -0.007), hand, 0.01); tb.rotation_mode = 'XYZ'
    tb.rotation_euler = Euler((math.radians(-25), math.radians(s * 20), math.radians(s * 50)), 'XYZ')
    tseg1 = _finger_segment(f'thumb_{side}_s1', 0.040, 0.0125, 0.0105, tb, glove)
    tk2 = empty(f'thumb_{side}_k2', (0, 0.040, 0), tb, 0.008); tk2.rotation_mode = 'XYZ'
    tseg2 = _finger_segment(f'thumb_{side}_s2', 0.034, 0.0105, 0.0085, tk2, glove, tip=True)
    objs['thumb'] = tb; objs['thumb_k2'] = tk2
    # thumb muscle pad (thenar) bridging palm and thumb base
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.015, matrix=Matrix.Translation((s * 0.027, 0.034, -0.005)) @ Matrix.Diagonal((1.0, 1.5, 0.75, 1.0)))
    th = mesh_from_bm(f'thenar_{side}', bm, glove, hand); shade_smooth(th, 60); objs['thenar'] = th
    # forearm: glove cuff then sleeve, along -Y from the wrist. Child of the hand so posing the hand carries it.
    arm = empty(f'arm_{side}', (0, 0, 0), hand, 0.02); arm.rotation_mode = 'QUATERNION'; objs['arm'] = arm
    cuff_rings = [ring_y(ellipse2d(0.064, 0.042, 16, k=1.6), 0.004), ring_y(ellipse2d(0.066, 0.046, 16, k=1.6), -0.030),
                  ring_y(ellipse2d(0.070, 0.050, 16, k=1.6), -0.060), ring_y(ellipse2d(0.074, 0.056, 16, k=1.6), -0.075)]
    cuff = loft(f'cuff_{side}', cuff_rings, True, True, glove, arm); shade_smooth(cuff, 40); objs['cuff'] = cuff
    sleeve_rings = [ring_y(ellipse2d(0.082, 0.064, 16, k=1.5), -0.062), ring_y(ellipse2d(0.094, 0.076, 16, k=1.5), -0.070),   # rolled cuff
                    ring_y(ellipse2d(0.096, 0.080, 16, k=1.5), -0.085), ring_y(ellipse2d(0.092, 0.078, 16, k=1.5), -0.100),
                    ring_y(ellipse2d(0.100, 0.088, 16, k=1.5), -0.190), ring_y(ellipse2d(0.112, 0.100, 16, k=1.5), -0.290),
                    ring_y(ellipse2d(0.118, 0.106, 16, k=1.5), -0.360)]
    sleeve = loft(f'sleeve_{side}', sleeve_rings, True, True, get_mat('sleeve'), arm); shade_smooth(sleeve, 40); objs['sleeve'] = sleeve
    return objs

def build_arms(parent=None):
    """Build the gloved arms hierarchy: arms -> hand_R/hand_L (empties) -> palm, fR_1..4, thumb_R, arm_R (forearm+sleeve)...
    Hands are in a canonical frame (see _hand); pose them with pose_hand()/aim_arm(). Returns dict with 'arms', 'R', 'L'."""
    arms = empty('arms', (0, 0, 0), parent, 0.05)
    R = _hand('R', arms); Lh = _hand('L', arms)
    return {'arms': arms, 'R': R, 'L': Lh}

def hand_matrix(loc, fwd, palm_normal):
    """World/parent-space matrix placing a canonical hand: wrist at loc, fingers along `fwd`, palm facing `palm_normal`."""
    f = Vector(fwd).normalized(); n = Vector(palm_normal); n = (n - f * n.dot(f)).normalized()
    z = -n; x = f.cross(z).normalized()
    M = Matrix((( x.x, f.x, z.x, loc[0]), (x.y, f.y, z.y, loc[1]), (x.z, f.z, z.z, loc[2]), (0, 0, 0, 1)))
    return M

def hand_matrix_at(local_pt, world_pt, fwd, palm_normal):
    """Like hand_matrix, but positions the hand so that hand-local `local_pt` lands on `world_pt`."""
    M = hand_matrix((0, 0, 0), fwd, palm_normal); M.translation = Vector(world_pt) - M.to_3x3() @ Vector(local_pt); return M

def set_local_matrix(obj, M):
    """Set an object's local (parent-relative) transform from a 4x4 matrix (rotation stored per obj.rotation_mode)."""
    obj.location = M.to_translation()
    if obj.rotation_mode == 'QUATERNION': obj.rotation_quaternion = M.to_quaternion()
    else: obj.rotation_euler = M.to_euler(obj.rotation_mode)

def pose_hand(hand, loc, fwd, palm_normal):
    set_local_matrix(hand, hand_matrix(loc, fwd, palm_normal))

def aim_arm(hand, arm, elbow_local, roll=0.0):
    """Rotate `arm` (child of `hand`) so its -Y axis points from the wrist to `elbow_local` (given in the hand's parent space)."""
    Mh = Matrix.Translation(hand.location) @ (hand.rotation_quaternion.to_matrix().to_4x4() if hand.rotation_mode == 'QUATERNION' else hand.rotation_euler.to_matrix().to_4x4())
    d = (Mh.inverted() @ Vector(elbow_local)).normalized()        # direction in hand space
    q = Vector((0, -1, 0)).rotation_difference(d)
    R = q.to_matrix().to_4x4() @ Matrix.Rotation(roll, 4, 'Y')
    arm.rotation_quaternion = R.to_quaternion(); arm.location = (0, 0, 0)

def curl_fingers(objs, curls, spread=0.0, lift=None):
    """curls: dict name -> (a1_deg, a2_deg) for f1..f4/thumb; negative X rotation curls toward the palm.
    spread: per-finger Z fan in degrees (index/pinky outward). lift: dict name -> deg rotation about local Z (index pointing)."""
    for i in range(1, 5):
        a1, a2 = curls.get(f'f{i}', (0, 0))
        fan = {1: 1.5, 2: 0.5, 3: -0.5, 4: -1.5}[i] * spread
        objs[f'f{i}'].rotation_euler = Euler((math.radians(-a1), 0, math.radians(fan + (lift or {}).get(f'f{i}', 0))), 'XYZ')
        objs[f'f{i}_k2'].rotation_euler = Euler((math.radians(-a2), 0, 0), 'XYZ')
    if 'thumb' in curls:
        a1, a2 = curls['thumb']; base = objs['thumb'].rotation_euler.copy()
        objs['thumb'].rotation_euler = Euler((base.x + math.radians(-a1), base.y, base.z), 'XYZ')
        objs['thumb_k2'].rotation_euler = Euler((math.radians(-a2), 0, 0), 'XYZ')

# --------------------------------------------------------------------------------------- animation
def key(obj, frame, loc=None, rot=None, quat=None):
    """Insert location / rotation keyframes at `frame`. rot in degrees (euler XYZ)."""
    if loc is not None:
        obj.location = loc; obj.keyframe_insert('location', frame=frame)
    if rot is not None:
        obj.rotation_mode = 'XYZ'; obj.rotation_euler = Euler([math.radians(a) for a in rot], 'XYZ'); obj.keyframe_insert('rotation_euler', frame=frame)
    if quat is not None:
        obj.rotation_mode = 'QUATERNION'; obj.rotation_quaternion = quat; obj.keyframe_insert('rotation_quaternion', frame=frame)

def key_current(obj, frame):
    """Key the object's current location + rotation (whatever mode) at frame."""
    obj.keyframe_insert('location', frame=frame)
    obj.keyframe_insert('rotation_quaternion' if obj.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=frame)

def write_anim_json(path, clips, events, fps=FPS):
    data = {'fps': fps, 'clips': {k: [int(v[0]), int(v[1])] for k, v in clips.items()}, 'events': {k: int(v) for k, v in events.items()}}
    Path(path).write_text(json.dumps(data, indent=1)); log(f'  wrote {path}')

# --------------------------------------------------------------------------------------- export / verify
def export_glb(path):
    path = str(path); sc = bpy.context.scene; sc.frame_set(0)
    for o in bpy.context.view_layer.objects: o.select_set(False)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_animations=True,
                              export_animation_mode='SCENE', export_yup=True, export_image_format='AUTO',
                              export_texcoords=True, export_normals=True, export_materials='EXPORT',
                              export_cameras=False, export_lights=False, export_frame_range=True, export_force_sampling=True,
                              export_extras=False, use_selection=False, use_visible=False, export_anim_scene_split_object=False)
    log(f'  exported {path} ({os.path.getsize(path) / 1e6:.2f} MB)')

def glb_header(path):
    """Parse the GLB JSON chunk (no bpy) -> dict."""
    with open(path, 'rb') as f:
        magic, ver, length = struct.unpack('<III', f.read(12)); assert magic == 0x46546C67
        clen, ctype = struct.unpack('<II', f.read(8)); return json.loads(f.read(clen).decode('utf-8'))

def verify_glb(path):
    """Print animation names / frame ranges, node names, triangle counts and material names by parsing the GLB and
    by re-importing it with bpy into a fresh scene (destroys the current scene - call last)."""
    g = glb_header(path); acc = g['accessors']
    log('VERIFY GLB', path)
    for a in g.get('animations', []):
        tmax = max(acc[s['input']]['max'][0] for s in a['samplers']); tmin = min(acc[s['input']]['min'][0] for s in a['samplers'])
        log(f"  animation '{a['name']}': {len(a['channels'])} channels, time {tmin:.3f}..{tmax:.3f}s = frames {round(tmin * FPS)}..{round(tmax * FPS)}")
    log(f"  nodes ({len(g['nodes'])}): " + ', '.join(n.get('name', '?') for n in g['nodes']))
    log(f"  materials: " + ', '.join(m.get('name', '?') for m in g.get('materials', [])))
    tot = 0; per = []
    for n in g['nodes']:
        if 'mesh' in n:
            t = 0
            for p in g['meshes'][n['mesh']]['primitives']:
                t += acc[p['indices']]['count'] // 3 if 'indices' in p else acc[p['attributes']['POSITION']]['count'] // 3
            per.append(f"{n['name']}={t}"); tot += t
    log(f"  triangles total {tot}: " + ', '.join(per))
    log(f"  images: {len(g.get('images', []))}, size {os.path.getsize(path) / 1e6:.2f} MB")
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=str(path))
    names = sorted({a.name.split('.')[0] for a in bpy.data.actions}); lo = min((a.frame_range[0] for a in bpy.data.actions), default=0); hi = max((a.frame_range[1] for a in bpy.data.actions), default=0)
    log(f"  bpy re-import: {len(bpy.data.actions)} actions, names {names}, frame range {lo:.0f}..{hi:.0f}; objects {len(bpy.data.objects)}")
    return g

# --------------------------------------------------------------------------------------- review renders
def _studio(target=(0, 0.15, 0)):
    sc = bpy.context.scene
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0.0
    sc.display.shading.background_type = 'VIEWPORT'; sc.display.shading.background_color = (0.30, 0.30, 0.31)
    w = sc.world or bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
    w.color = (0.42, 0.42, 0.43)     # workbench backdrop (workbench ignores lights / world nodes)
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.32, 0.32, 0.33, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    floor = bpy.data.objects.new('_floor', bpy.data.meshes.new('_floor')); bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=4.0); bm.to_mesh(floor.data); bm.free()
    fm = bpy.data.materials.new('_floor'); fm.use_nodes = True; fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.42, 0.43, 1); fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    fm.diffuse_color = (0.42, 0.42, 0.43, 1); floor.data.materials.append(fm); floor.location = (0, 0.2, -0.45)
    sc.collection.objects.link(floor)
    def light(name, loc, energy, size, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = size; ld.color = color
        lo = bpy.data.objects.new(name, ld); sc.collection.objects.link(lo); lo.location = loc
        d = Vector(target) - Vector(loc); lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); return lo
    light('_key', (-1.2, -0.6, 1.4), 180, 1.2, (1, 0.97, 0.92)); light('_fill', (1.6, -0.8, 0.6), 70, 2.0, (0.9, 0.95, 1)); light('_rim', (0.4, 1.8, 1.0), 140, 0.8)
    cam = bpy.data.objects.new('_cam', bpy.data.cameras.new('_cam')); sc.collection.objects.link(cam); sc.camera = cam
    return cam

def _look_at(cam, loc, target, lens=50, fov_y=None):
    cam.location = loc; d = Vector(target) - Vector(loc); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    if fov_y: cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(fov_y)
    else: cam.data.sensor_fit = 'AUTO'; cam.data.lens = lens

def _render(path, engine, samples=32):
    sc = bpy.context.scene; sc.render.resolution_x = 1280; sc.render.resolution_y = 720; sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = str(path)
    if engine == 'CYCLES':
        sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True; sc.cycles.use_adaptive_sampling = True
    else:
        sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'
        sh.show_cavity = True; sh.show_specular_highlight = True; sh.show_shadows = True; sc.display.render_aa = '8'
    bg = sc.world.node_tree.nodes['Background'].inputs['Color'] if sc.world and sc.world.use_nodes else None
    old = tuple(bg.default_value) if bg else None
    if bg and engine != 'CYCLES': bg.default_value = (0.62, 0.62, 0.63, 1)     # workbench ignores lights; brighter backdrop for review
    t = time.time(); bpy.ops.render.render(write_still=True)
    if bg: bg.default_value = old
    return time.time() - t

def render_review(wid, clips=None, arms=None, world=None, gun_center=(0, 0.15, 0.0), gun_len=0.9, turntable=True, hero_engine='CYCLES', hero_samples=24):
    """Review renders into evidence/blender/<wid>_*.png. Hides `world`; hides `arms` for side/front silhouettes."""
    sc = bpy.context.scene; times = {}
    for o in bpy.context.view_layer.objects: o.hide_render = False
    if world is not None: world.hide_render = True
    cam = _studio(gun_center); c = Vector(gun_center); dist = gun_len * 1.35
    def arms_visible(v):
        if arms is None: return
        def rec(o):
            o.hide_render = not v
            for ch in o.children: rec(ch)
        rec(arms)
    sc.frame_set(0)
    arms_visible(False)
    _look_at(cam, c + Vector((-dist, 0, 0.02)), c, 50); times['side'] = _render(EVIDENCE / f'{wid}_side.png', hero_engine, hero_samples)
    _look_at(cam, c + Vector((0, dist * 1.05, 0.10)), c, 50); times['front'] = _render(EVIDENCE / f'{wid}_front.png', hero_engine, hero_samples)
    arms_visible(True)
    _look_at(cam, c + Vector((-dist * 0.75, -dist * 0.7, dist * 0.45)), c + Vector((0, 0, -0.05)), 50); times['threequarter'] = _render(EVIDENCE / f'{wid}_threequarter.png', hero_engine, hero_samples)
    # first-person: camera at viewmodel pose relative to `weapon` (camera behind the weapon, looking along +Y)
    cam.location = (-0.14, -0.33, 0.16); cam.rotation_euler = Euler((math.radians(90), 0, 0), 'XYZ'); cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(62)
    times['fp'] = _render(EVIDENCE / f'{wid}_fp.png', hero_engine, hero_samples)
    if turntable:
        t0 = time.time()
        for i in range(24):
            a = 2 * math.pi * i / 24
            _look_at(cam, c + Vector((-dist * math.cos(a), -dist * math.sin(a), 0.25)), c, 50)
            _render(EVIDENCE / f'{wid}_turntable_{i:02d}.png', 'WORKBENCH')
        times['turntable(24, workbench)'] = time.time() - t0
    if clips:
        t0 = time.time()
        cam.location = (-0.14, -0.33, 0.16); cam.rotation_euler = Euler((math.radians(90), 0, 0), 'XYZ'); cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(62)
        for name, (s0, s1) in clips.items():
            for i in range(4):
                sc.frame_set(int(round(s0 + (s1 - s0) * (i + 0.5) / 4)))
                _render(EVIDENCE / f'{wid}_anim_{name}_{i:02d}.png', 'WORKBENCH')
        times['anim strips (workbench)'] = time.time() - t0
    sc.frame_set(0)
    log('  render times: ' + ', '.join(f'{k} {v:.1f}s' for k, v in times.items()))
    return times

def render_closeups(wid, views, frame=0, tag=''):
    """Quick Workbench closeups for posing checks: views = [(name, cam_loc, target, lens)] -> evidence/blender/<wid>_closeup_<name>.png"""
    sc = bpy.context.scene; cam = sc.camera or _studio((0, 0.15, 0)); sc.frame_set(frame)
    for name, loc, target, lens in views:
        _look_at(cam, loc, target, lens); _render(EVIDENCE / f'{wid}_closeup_{name}{tag}.png', 'WORKBENCH')
