"""Concept B: the Israeli tear-off block calendar (לוח תלישה).
The date is cut out of the top page and dawn light glows through the letters.
"""
import math
import random
import sys

sys.path.insert(0, sys.argv[-2])
import bpy  # noqa: E402
import bmesh  # noqa: E402
from lib3d import *  # noqa: E402,F401,F403

OUT = sys.argv[-1]
SAMPLES = int(sys.argv[-3]) if sys.argv[-3].isdigit() else 96
scn = reset()

W, H, D = 1.30, 1.36, 0.30          # pad width / height / thickness
TOP = 0.56                           # y of the pad's top edge (under the binding)
BOT = TOP - H

# ---------- materials ----------
paper = add_noise_bump(mat('paper', srgb('#F3EFE6'), rough=0.66, specular=0.25), scale=180, strength=0.05)
# page edges: thin stacked lines along the thickness
edges = mat('edges', srgb('#EDE8DC'), rough=0.8)
nt = edges.node_tree
tc = nt.nodes.new('ShaderNodeTexCoord')
wv = nt.nodes.new('ShaderNodeTexWave')
wv.wave_type = 'BANDS'
wv.bands_direction = 'Z'
wv.inputs['Scale'].default_value = 140
wv.inputs['Distortion'].default_value = 1.4
wv.inputs['Detail'].default_value = 3
bp = nt.nodes.new('ShaderNodeBump')
bp.inputs['Strength'].default_value = 0.25
nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
nt.links.new(wv.outputs['Fac'], bp.inputs['Height'])
nt.links.new(bp.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])
cr = nt.nodes.new('ShaderNodeValToRGB')
cr.color_ramp.elements[0].color = (*srgb('#D9D2C2'), 1)
cr.color_ramp.elements[1].color = (*srgb('#F6F2E8'), 1)
nt.links.new(wv.outputs['Fac'], cr.inputs['Fac'])
nt.links.new(cr.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])

lacquer = mat('lacquer', srgb('#A8161A'), rough=0.35, coat=1.0, coat_rough=0.05, specular=0.5)
foil = mat('foil', srgb('#F2CF7E'), metallic=1, rough=0.18)
rivet = mat('rivet', srgb('#D9B061'), metallic=1, rough=0.22)
ink = mat('ink', srgb('#7D8496'), rough=0.7)

# glowing dawn behind the cut-out letters
glow = bpy.data.materials.new('glow')
glow.use_nodes = True
g = glow.node_tree
g.nodes.clear()
out = g.nodes.new('ShaderNodeOutputMaterial')
em = g.nodes.new('ShaderNodeEmission')
em.inputs['Strength'].default_value = 1.4
gtc = g.nodes.new('ShaderNodeTexCoord')
sep = g.nodes.new('ShaderNodeSeparateXYZ')
mr = g.nodes.new('ShaderNodeMapRange')
mr.inputs['From Min'].default_value = -0.45
mr.inputs['From Max'].default_value = 0.35
ramp = g.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = (*srgb('#E8341C'), 1)
ramp.color_ramp.elements[1].color = (*srgb('#FFC23A'), 1)
mid = ramp.color_ramp.elements.new(0.5)
mid.color = (*srgb('#FF7A1F'), 1)
g.links.new(gtc.outputs['Object'], sep.inputs[0])
g.links.new(sep.outputs['Y'], mr.inputs['Value'])
g.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
g.links.new(ramp.outputs['Color'], em.inputs['Color'])
g.links.new(em.outputs[0], out.inputs[0])

# ---------- the pad ----------
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, (TOP + BOT) / 2, -D / 2))
pad = bpy.context.active_object
pad.scale = (W, H, D)
bpy.ops.object.transform_apply(scale=True)
link(pad, edges)
bevel(pad, 0.012, 3)

# glow plate just under the top page (only seen through the letters)
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -0.06, 0.001))
gp = bpy.context.active_object
gp.scale = (1.1, 0.9, 1)
link(gp, glow)

# top page with the date cut through it
PT = 0.012
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, (TOP + BOT) / 2 - 0.004, 0.003 + PT / 2))
page = bpy.context.active_object
page.scale = (W - 0.012, H - 0.02, PT)
bpy.ops.object.transform_apply(scale=True)
link(page, paper)

day = text('day', 'כ״ה', 0.78, 0.2)
day.location = (0, -0.07, -0.05)
bpy.context.view_layer.objects.active = day
for o in bpy.context.selected_objects:
    o.select_set(False)
day.select_set(True)
bpy.ops.object.convert(target='MESH')
cut = page.modifiers.new('cut', 'BOOLEAN')
cut.object = day
cut.operation = 'DIFFERENCE'
cut.solver = 'EXACT'
day.hide_render = True

# printed Gregorian day under the date
greg = text('greg', '25', 0.13, 0.0008, font='frank-latin-700', rtl=False)
link(greg, ink)
greg.location = (0, -0.56, 0.003 + PT)

# ---------- torn stubs of earlier pages under the binding ----------
random.seed(3)
for layer, (zo, depth) in enumerate([(0.016, 0.05), (0.009, 0.035)]):
    me = bpy.data.meshes.new(f'stub{layer}')
    bm = bmesh.new()
    xs = [-W / 2 + 0.01 + i * (W - 0.02) / 60 for i in range(61)]
    top_y = TOP - 0.005
    pts = [(x, top_y - depth - random.uniform(0, 0.035), 0) for x in xs]
    poly = [(xs[0], top_y, 0)] + pts + [(xs[-1], top_y, 0)]
    vs_bot = [bm.verts.new((x, y, zo)) for x, y, _ in poly]
    vs_top = [bm.verts.new((x, y, zo + 0.004)) for x, y, _ in poly]
    bm.faces.new(vs_top)
    bm.faces.new(list(reversed(vs_bot)))
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((vs_bot[i], vs_bot[j], vs_top[j], vs_top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(f'stub{layer}', me)
    bpy.context.collection.objects.link(ob)
    link(ob, paper)

# ---------- binding ----------
BH = 0.30
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, TOP + BH / 2 - 0.06, -D / 2 + 0.03))
bind = bpy.context.active_object
bind.scale = (W + 0.06, BH, D + 0.14)
bpy.ops.object.transform_apply(scale=True)
link(bind, lacquer)
bevel(bind, 0.04, 6, angle=30)
smooth(bind)

month = text('month', 'כסלו', 0.19, 0.01, font='frank-900')
link(month, foil)
month.location = (0, TOP + BH / 2 - 0.075, 0.1 + 0.001)

for sx in (-1, 1):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.045, depth=0.02, location=(sx * (W / 2 - 0.12), TOP + BH / 2 - 0.06, 0.1 + 0.005))
    r = bpy.context.active_object
    link(r, rivet)
    bevel(r, 0.012, 4)
    smooth(r)

# ---------- scene ----------
backdrop([srgb('#1B2B78'), (0.38, srgb('#0A1238')), srgb('#02030A')], z=-1.4, radius=2.2, center=(0, 0.05))
area_light('key', (-2.2, -1.4, 3.8), power=210, size=1.8, color=(1.0, 0.9, 0.78))
area_light('fill', (2.6, -0.6, 2.4), power=140, size=2.2, color=(0.7, 0.8, 1.0))
area_light('rim', (1.2, 3.0, 1.4), power=420, size=1.5, color=(0.85, 0.9, 1.0))
softbox('sbref', (-0.4, 2.6, 6.0), (3.0, 2.0), strength=0.9, color=(1.0, 0.95, 0.88))
camera((-0.7, -1.55, 4.6), target=(0, -0.04, -0.1), lens=80)
bloom(threshold=0.55, size=8, strength=0.7)
scn.view_settings.exposure = -0.35
render(OUT, samples=SAMPLES)
