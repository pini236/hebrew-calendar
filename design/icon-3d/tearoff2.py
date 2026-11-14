"""Tear-off block calendar (לוח תלישה), detailed and dignified.
Page: Shabbat 25 Kislev 5788 (25 Dec 2027), Parashat Vayeshev, first day of Chanukah.
usage: python tearoff2.py SAMPLES LIBDIR OUT BG   (BG = stone | walnut | charcoal)
"""
import math
import random
import sys

sys.path.insert(0, sys.argv[-3])
import bpy  # noqa: E402
import bmesh  # noqa: E402
from lib3d import *  # noqa: E402,F401,F403
from mathutils import Vector  # noqa: E402

BG = sys.argv[-1]
OUT = sys.argv[-2]
SAMPLES = int(sys.argv[-4]) if sys.argv[-4].isdigit() else 96
scn = reset()

W, H, D = 1.24, 1.30, 0.26
TOP = 0.50
BOT = TOP - H
PZ = 0.0  # top surface of the pad block


# ---------------- materials ----------------
def paper_mat(name, col):
    m = mat(name, srgb(col), rough=0.72, specular=0.22)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 260
    nz.inputs['Detail'].default_value = 10
    fib = nt.nodes.new('ShaderNodeTexNoise')  # long paper fibres
    fib.inputs['Scale'].default_value = 40
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1, 18, 1)
    mix = nt.nodes.new('ShaderNodeMath')
    mix.operation = 'ADD'
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = 0.035
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], fib.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], mix.inputs[0])
    nt.links.new(fib.outputs['Fac'], mix.inputs[1])
    nt.links.new(mix.outputs[0], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Subsurface Weight'].default_value = 0.08
    return m


paper = paper_mat('paper', '#F2EAD7')
paper2 = paper_mat('paper2', '#EFE7D4')

edges = mat('edges', srgb('#E9E0CC'), rough=0.85)
nt = edges.node_tree
tc = nt.nodes.new('ShaderNodeTexCoord')
wv = nt.nodes.new('ShaderNodeTexWave')
wv.wave_type = 'BANDS'
wv.bands_direction = 'Z'
wv.inputs['Scale'].default_value = 170
wv.inputs['Distortion'].default_value = 1.8
wv.inputs['Detail'].default_value = 4
bp = nt.nodes.new('ShaderNodeBump')
bp.inputs['Strength'].default_value = 0.3
nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
nt.links.new(wv.outputs['Fac'], bp.inputs['Height'])
nt.links.new(bp.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])
cr = nt.nodes.new('ShaderNodeValToRGB')
cr.color_ramp.elements[0].color = (*srgb('#CFC4AC'), 1)
cr.color_ramp.elements[1].color = (*srgb('#F3ECDC'), 1)
nt.links.new(wv.outputs['Fac'], cr.inputs['Fac'])
nt.links.new(cr.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])

# leather: voronoi grain
leather = mat('leather', srgb('#4C0D14'), rough=0.52, coat=0.25, coat_rough=0.3, specular=0.45)
nt = leather.node_tree
tc = nt.nodes.new('ShaderNodeTexCoord')
vo = nt.nodes.new('ShaderNodeTexVoronoi')
vo.feature = 'DISTANCE_TO_EDGE'
vo.inputs['Scale'].default_value = 330
bp = nt.nodes.new('ShaderNodeBump')
bp.inputs['Strength'].default_value = 0.32
bp.invert = True
nt.links.new(tc.outputs['Object'], vo.inputs['Vector'])
nt.links.new(vo.outputs['Distance'], bp.inputs['Height'])
nt.links.new(bp.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])
_ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); _ao.inputs['Distance'].default_value = 0.06
_mx = nt.nodes.new('ShaderNodeMix'); _mx.data_type = 'RGBA'
_mx.inputs['A'].default_value = (*srgb('#1C0407'), 1); _mx.inputs['B'].default_value = (*srgb('#430B12'), 1)
nt.links.new(_ao.outputs['AO'], _mx.inputs['Factor'])
nt.links.new(_mx.outputs['Result'], nt.nodes['Principled BSDF'].inputs['Base Color'])

foil = add_noise_bump(mat('foil', srgb('#E8C373'), metallic=1, rough=0.24), scale=500, strength=0.15)
brass = mat('brass', srgb('#C9A35A'), metallic=1, rough=0.28)
thread = mat('thread', srgb('#E8D9B5'), rough=0.8)
red_ink = mat('red_ink', srgb('#8A0C14'), rough=0.5, specular=0.35)
dark_ink = mat('dark_ink', srgb('#2B2623'), rough=0.6)
grey_ink = mat('grey_ink', srgb('#6E6658'), rough=0.65)

# ---------------- pad block ----------------
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, (TOP + BOT) / 2, PZ - D / 2))
pad = bpy.context.active_object
pad.scale = (W, H, D)
bpy.ops.object.transform_apply(scale=True)
link(pad, edges)
bevel(pad, 0.01, 3)

# second page (seen under the lifted corner)
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, (TOP + BOT) / 2, PZ + 0.0008))
p2 = bpy.context.active_object
p2.scale = (W - 0.01, H - 0.012, 1)
link(p2, paper2)

# a few loose sheets so the stack edges look uneven, like a real pad
random.seed(11)
for k in range(1, 9):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(random.uniform(-0.004, 0.004), (TOP + BOT) / 2 - random.uniform(0.0, 0.007), PZ - 0.012 * k))
    sh = bpy.context.active_object
    sh.scale = (W + random.uniform(-0.002, 0.008), H - 0.006 + random.uniform(-0.004, 0.004), 1)
    so = sh.modifiers.new('t', 'SOLIDIFY'); so.thickness = 0.003
    link(sh, paper2)

# ---------------- top page: a grid so the corner can curl ----------------
PW, PH = W - 0.008, H - 0.016
cx, cy = 0.0, (TOP + BOT) / 2 - 0.004
me = bpy.data.meshes.new('page')
bm = bmesh.new()
N = 90
grid = [[bm.verts.new((cx - PW / 2 + PW * i / N, cy - PH / 2 + PH * j / N, 0)) for i in range(N + 1)] for j in range(N + 1)]
for j in range(N):
    for i in range(N):
        bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
# lift the bottom-left corner like a page about to be turned
x0, y0 = cx - PW / 2, cy - PH / 2
R = 0.42
for v in bm.verts:
    u = ((v.co.x - x0) + (v.co.y - y0)) / math.sqrt(2)
    if u < R:
        t = (R - u) / R
        v.co.z += 0.16 * t ** 2.2
        # pull the lifted part slightly back toward the diagonal, like real paper
        k = 0.05 * t ** 2
        v.co.x += k
        v.co.y += k
bm.to_mesh(me)
bm.free()
page = bpy.data.objects.new('page', me)
bpy.context.collection.objects.link(page)
page.location.z = PZ + 0.002
sol = page.modifiers.new('thick', 'SOLIDIFY')
sol.thickness = 0.004
sol.offset = -1
link(page, paper)
smooth(page)

# ---------------- printing on the page ----------------
Z = PZ + 0.0023


def ink(name, body, size, y, m, font='frank-900', x=0.0, rtl=True):
    t = text(name, body, size, 0.0003, font=font, rtl=rtl)
    t.location = (x, y, Z)
    link(t, m)
    return t


# double-rule frame (red)
def frame(inset, w):
    for (x, y, sx, sy) in [
        (0, TOP - 0.06 - inset, PW - 2 * inset - 0.06, w),
        (0, BOT + 0.03 + inset, PW - 2 * inset - 0.06, w),
        (-(PW / 2 - 0.03 - inset), (TOP - 0.06 + BOT + 0.03) / 2, w, (TOP - 0.06) - (BOT + 0.03) - 2 * inset),
        ((PW / 2 - 0.03 - inset), (TOP - 0.06 + BOT + 0.03) / 2, w, (TOP - 0.06) - (BOT + 0.03) - 2 * inset),
    ]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, Z))
        c = bpy.context.active_object
        c.scale = (sx, sy, 0.0004)
        link(c, red_ink)


frame(0.0, 0.007)
frame(0.022, 0.0028)

ink('weekday', 'שבת קודש', 0.098, TOP - 0.175, red_ink, font='frank-700')
# thin rules beside the weekday
for sx in (-1, 1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(sx * 0.37, TOP - 0.175, Z))
    c = bpy.context.active_object
    c.scale = (0.2, 0.0035, 0.0004)
    link(c, red_ink)
ink('day', 'כ״ה', 0.60, -0.10, red_ink)
ink('month', 'כסלו תשפ״ח', 0.092, -0.41, dark_ink, font='frank-700')
ink('event1', 'פרשת וישב', 0.066, -0.52, grey_ink, font='frank-700', x=0.17)
ink('event2', 'חנוכה', 0.066, -0.52, red_ink, font='frank-700', x=-0.2)
bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.035, -0.505, Z))
_d = bpy.context.active_object; _d.scale = (0.016, 0.016, 0.0004); _d.rotation_euler = (0, 0, math.pi / 4); link(_d, grey_ink)
ink('greg', '25 · 12 · 2027', 0.056, -0.62, grey_ink, font='frank-latin-700', rtl=False)

# ---------------- torn stubs ----------------
random.seed(5)
for layer, (zo, depth) in enumerate([(0.012, 0.045), (0.007, 0.03)]):
    me = bpy.data.meshes.new(f'stub{layer}')
    bm = bmesh.new()
    xs = [-W / 2 + 0.008 + i * (W - 0.016) / 70 for i in range(71)]
    top_y = TOP - 0.01
    pts = [(x, top_y - depth - random.uniform(0, 0.03)) for x in xs]
    poly = [(xs[0], top_y)] + pts + [(xs[-1], top_y)]
    vb = [bm.verts.new((x, y, PZ + zo)) for x, y in poly]
    vt = [bm.verts.new((x, y, PZ + zo + 0.003)) for x, y in poly]
    bm.faces.new(vt)
    bm.faces.new(list(reversed(vb)))
    for i in range(len(poly)):
        j = (i + 1) % len(poly)
        bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(f'stub{layer}', me)
    bpy.context.collection.objects.link(ob)
    link(ob, paper)

# ---------------- leather binding ----------------
BH = 0.30
BY = TOP + BH / 2 - 0.06
BZ0, BZ1 = PZ - D - 0.02, PZ + 0.085
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, BY, (BZ0 + BZ1) / 2))
bind = bpy.context.active_object
bind.scale = (W + 0.05, BH, BZ1 - BZ0)
bpy.ops.object.transform_apply(scale=True)
link(bind, leather)
bevel(bind, 0.035, 6, angle=30)
smooth(bind)

FZ = BZ1 + 0.0006
# stitching along the front face
for row_y in (BY + BH / 2 - 0.035, BY - BH / 2 + 0.035):
    n = 46
    for i in range(n):
        x = -W / 2 + 0.03 + i * (W - 0.06) / (n - 1)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, row_y, FZ))
        s = bpy.context.active_object
        s.scale = (0.016, 0.005, 0.004)
        link(s, thread)

# gold-foil border + title
for (x, y, sx, sy) in [(0, BY + 0.088, W - 0.16, 0.004), (0, BY - 0.088, W - 0.16, 0.004)]:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, FZ))
    c = bpy.context.active_object
    c.scale = (sx, sy, 0.0012)
    link(c, foil)
t = text('title', 'כסלו תשפ״ח', 0.115, 0.0008, font='frank-900')
t.location = (0, BY - 0.005, FZ - 0.0004)
link(t, foil)
for sx in (-1, 1):  # small diamonds beside the title
    bpy.ops.mesh.primitive_cube_add(size=1, location=(sx * 0.33, BY, FZ))
    dmd = bpy.context.active_object
    dmd.scale = (0.022, 0.022, 0.002)
    dmd.rotation_euler = (0, 0, math.pi / 4)
    link(dmd, foil)

# brass eyelets
for sx in (-1, 1):
    ex = sx * (W / 2 - 0.1)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.034, minor_radius=0.012, location=(ex, BY, FZ + 0.004))
    e = bpy.context.active_object
    link(e, brass)
    smooth(e)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.024, depth=0.004, location=(ex, BY, FZ - 0.0005))
    link(bpy.context.active_object, mat('hole', (0.01, 0.006, 0.004), rough=0.9))

# ---------------- background ----------------
WALL_Z = -0.34
if BG == 'stone':
    # Jerusalem stone wall: ashlar blocks
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, WALL_Z))
    wall = bpy.context.active_object
    m = mat('stone', srgb('#D9C6A2'), rough=0.85)
    nt = m.node_tree
    tc = nt.nodes.new('ShaderNodeTexCoord')
    br = nt.nodes.new('ShaderNodeTexBrick')
    br.inputs['Scale'].default_value = 0.95
    br.inputs['Mortar Size'].default_value = 0.012
    br.inputs['Mortar Smooth'].default_value = 0.6
    br.inputs['Bias'].default_value = 0.0
    br.inputs['Brick Width'].default_value = 1.9
    br.inputs['Row Height'].default_value = 0.7
    br.offset = 0.42
    br.inputs['Color1'].default_value = (*srgb('#E9D3AE'), 1)
    br.inputs['Color2'].default_value = (*srgb('#D7B98F'), 1)
    br.inputs['Mortar'].default_value = (*srgb('#A68D6C'), 1)
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 6
    nz.inputs['Detail'].default_value = 15
    nz.inputs['Roughness'].default_value = 0.65
    mixc = nt.nodes.new('ShaderNodeMix')
    mixc.data_type = 'RGBA'
    mixc.blend_type = 'MULTIPLY'
    mixc.inputs['Factor'].default_value = 0.55
    bpn = nt.nodes.new('ShaderNodeBump')
    bpn.inputs['Strength'].default_value = 1.0
    nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    nt.links.new(br.outputs['Color'], mixc.inputs['A'])
    nt.links.new(nz.outputs['Color'], mixc.inputs['B'])
    nt.links.new(mixc.outputs['Result'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.inputs['Scale'].default_value = 150
    nz2 = nt.nodes.new('ShaderNodeTexNoise')
    nz2.inputs['Scale'].default_value = 320
    nz2.inputs['Detail'].default_value = 8
    nt.links.new(tc.outputs['Object'], vor.inputs['Vector'])
    nt.links.new(tc.outputs['Object'], nz2.inputs['Vector'])
    # height = chisel texture - recessed joints
    h1 = nt.nodes.new('ShaderNodeMath'); h1.operation = 'MULTIPLY_ADD'; h1.inputs[1].default_value = 0.6
    nt.links.new(nz.outputs['Fac'], h1.inputs[0]); nt.links.new(vor.outputs['Distance'], h1.inputs[2])
    h2 = nt.nodes.new('ShaderNodeMath'); h2.operation = 'MULTIPLY_ADD'; h2.inputs[1].default_value = 0.25
    nt.links.new(nz2.outputs['Fac'], h2.inputs[0]); nt.links.new(h1.outputs[0], h2.inputs[2])
    h3 = nt.nodes.new('ShaderNodeMath'); h3.operation = 'MULTIPLY_ADD'; h3.inputs[1].default_value = -1.4
    nt.links.new(br.outputs['Fac'], h3.inputs[0]); nt.links.new(h2.outputs[0], h3.inputs[2])
    bpn.inputs['Distance'].default_value = 0.012
    nt.links.new(h3.outputs[0], bpn.inputs['Height'])
    nt.links.new(bpn.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])
    link(wall, m)
    key_col, key_pow = (1.0, 0.84, 0.64), 420
    scn.view_settings.exposure = -0.55
elif BG == 'walnut':
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, WALL_Z))
    wall = bpy.context.active_object
    m = mat('walnut', srgb('#4A2C1A'), rough=0.38, coat=0.4, coat_rough=0.2)
    nt = m.node_tree
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1, 6, 1)
    wv = nt.nodes.new('ShaderNodeTexWave')
    wv.wave_type = 'RINGS'
    wv.inputs['Scale'].default_value = 1.6
    wv.inputs['Distortion'].default_value = 9
    wv.inputs['Detail'].default_value = 6
    crr = nt.nodes.new('ShaderNodeValToRGB')
    crr.color_ramp.elements[0].color = (*srgb('#2A160C'), 1)
    crr.color_ramp.elements[1].color = (*srgb('#6A4024'), 1)
    bpn = nt.nodes.new('ShaderNodeBump')
    bpn.inputs['Strength'].default_value = 0.08
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], wv.inputs['Vector'])
    nt.links.new(wv.outputs['Fac'], crr.inputs['Fac'])
    nt.links.new(crr.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    nt.links.new(wv.outputs['Fac'], bpn.inputs['Height'])
    nt.links.new(bpn.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])
    link(wall, m)
    key_col, key_pow = (1.0, 0.84, 0.62), 520
else:  # charcoal
    bd = backdrop([srgb('#3A2F27'), (0.45, srgb('#17120F')), srgb('#050403')], z=WALL_Z, radius=2.2, center=(-0.2, 0.2))
    add_noise_bump(bd.data.materials[0], scale=90, strength=0.25)
    key_col, key_pow = (1.0, 0.85, 0.66), 520

# warm window light from the upper left casts the calendar's shadow on the wall
area_light('key', (-3.2, 1.5, 1.1), target=(0, -0.1, -0.34), power=key_pow * 1.5, size=0.8, color=key_col)
area_light('fill', (2.4, -1.4, 2.6), power=110, size=2.5, color=(0.9, 0.92, 1.0))
area_light('front', (-0.4, -2.6, 3.4), power=70, size=2.2, color=(1.0, 0.95, 0.88))
softbox('sbref', (1.7, 0.4, 4.2), (2.4, 1.6), strength=1.6, color=(1.0, 0.93, 0.82), target=(0, 0.3, 0))

cam = camera_up((-1.55, -0.55, 3.75), target=(-0.16, -0.1, -0.12), lens=64)
cam.data.dof.use_dof = True
cam.data.dof.focus_distance = (cam.location - Vector((0, -0.12, 0.0))).length
cam.data.dof.aperture_fstop = 1.4
bloom(threshold=1.2, size=6, strength=0.25)
render(OUT, samples=SAMPLES)
