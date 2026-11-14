"""Concept A: a Hebrew astrolabe-calendar in brass and blue enamel.
Medieval Hebrew astrolabes are real Judaica; the Hebrew calendar itself is astronomy.
"""
import math
import sys

sys.path.insert(0, sys.argv[-2])
import bpy  # noqa: E402
from lib3d import *  # noqa: E402,F401,F403

OUT = sys.argv[-1]
scn = reset()

# ---------- materials ----------
brass = add_noise_bump(mat('brass', srgb('#D2A658'), metallic=1, rough=0.24, aniso=0.5), scale=220, strength=0.05, stretch=(1, 30, 1))
gold = mat('gold', srgb('#F0CF86'), metallic=1, rough=0.12)
engraving = mat('engr', srgb('#5A3C14'), metallic=1, rough=0.55)
enamel = mat('enamel', srgb('#0A2273'), metallic=0, rough=0.28, coat=1.0, coat_rough=0.14, specular=0.4)
_nt = enamel.node_tree
_w = _nt.nodes.new('ShaderNodeTexWave'); _w.wave_type = 'RINGS'; _w.rings_direction = 'SPHERICAL'
_w.inputs['Scale'].default_value = 34.0; _w.inputs['Distortion'].default_value = 0.6; _w.inputs['Detail'].default_value = 0.0
_tc = _nt.nodes.new('ShaderNodeTexCoord'); _nt.links.new(_tc.outputs['Object'], _w.inputs['Vector'])
_bp = _nt.nodes.new('ShaderNodeBump'); _bp.inputs['Strength'].default_value = 0.06; _bp.inputs['Distance'].default_value = 0.004
_nt.links.new(_w.outputs['Fac'], _bp.inputs['Height'])
_nt.links.new(_bp.outputs['Normal'], _nt.nodes['Principled BSDF'].inputs['Normal'])
_cr = _nt.nodes.new('ShaderNodeValToRGB'); _cr.color_ramp.elements[0].color = (*srgb('#061450'), 1); _cr.color_ramp.elements[1].color = (*srgb('#0F2678'), 1)
_nt.links.new(_w.outputs['Fac'], _cr.inputs['Fac']); _nt.links.new(_cr.outputs['Color'], _nt.nodes['Principled BSDF'].inputs['Base Color'])
starm = mat('star', srgb('#FFE7A8'), metallic=1, rough=0.2, emission=srgb('#FFD27A'), emit_strength=0.6)

T = 0.0  # disc tilt handled by camera

# ---------- body ----------
body = link(disc('mater', 1.0, -0.10, 0.06), brass)
bevel(body, 0.035, 6)
smooth(body)

limb = link(annulus('limb', 0.80, 0.985, 0.06, 0.115), brass)
bevel(limb, 0.012, 4)

# inner enamel plate (slightly recessed)
plate = link(disc('plate', 0.80, 0.0, 0.075), enamel)
bevel(plate, 0.004, 2)

# fine bead at the inner edge of the limb
bead = link(annulus('bead', 0.785, 0.80, 0.075, 0.1), gold)
bevel(bead, 0.006, 3)

# ---------- engraved month names on the limb (Kislev at the top) ----------
months = ['כסלו', 'טבת', 'שבט', 'אדר', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול', 'תשרי', 'חשון']
for i, m in enumerate(months):
    ang = math.pi / 2 - i * (2 * math.pi / 12)  # clockwise from the top (RTL reading direction)
    t = text(f'm{i}', m, 0.088, 0.006, font='frank-700')
    link(t, gold if i == 0 else engraving)
    r = 0.892
    t.location = (r * math.cos(ang), r * math.sin(ang), 0.115)
    t.rotation_euler = (0, 0, ang - math.pi / 2)

# degree ticks between the months
for k in range(120):
    a = 2 * math.pi * k / 120
    long = k % 10 == 0
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.968 * math.cos(a), 0.968 * math.sin(a), 0.117))
    tk = bpy.context.active_object
    tk.scale = (0.004 if not long else 0.006, 0.022 if long else 0.012, 0.004)
    tk.rotation_euler = (0, 0, a - math.pi / 2)
    tk.location = ((0.972 if not long else 0.965) * math.cos(a), (0.972 if not long else 0.965) * math.sin(a), 0.117)
    link(tk, engraving)

# ---------- rete: the offset ecliptic ring + star pointers, like a real astrolabe ----------
ecl = link(annulus('ecliptic', 0.585, 0.605, 0.078, 0.094), gold)
ecl.location = (0, 0.10, 0)
bevel(ecl, 0.004, 2)
for k, (a, r) in enumerate([(25, 0.74), (95, 0.70), (150, 0.73), (210, 0.69), (300, 0.72), (340, 0.75)]):
    ar = math.radians(a)
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.022, radius2=0.0, depth=0.12, location=(r * math.cos(ar), r * math.sin(ar), 0.09))
    c = bpy.context.active_object
    c.rotation_euler = (math.pi / 2, 0, ar + math.pi / 2)
    c.scale = (1, 1, 1)
    link(c, gold)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.016, location=((r - 0.06) * math.cos(ar), (r - 0.06) * math.sin(ar), 0.09))
    link(bpy.context.active_object, starm)

# tiny stars set into the enamel
import random  # noqa: E402
random.seed(7)
for k in range(60):
    rr = 0.78 * math.sqrt(random.random())
    a = random.random() * 2 * math.pi
    x, y = rr * math.cos(a), rr * math.sin(a)
    if abs(x) < 0.5 and -0.42 < y < 0.36:  # keep the date area clean
        continue
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=0.004 + random.random() * 0.005, location=(x, y, 0.077))
    link(bpy.context.active_object, starm)

# ---------- the date ----------
day = text('day', 'כ״ה', 0.80, 0.04, bevel_depth=0.007)
link(day, gold)
day.location = (0, -0.07, 0.078)

# crescent moon over the date
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.07, depth=0.03, location=(0, 0.47, 0.09))
moon = bpy.context.active_object
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.062, depth=0.06, location=(0.03, 0.49, 0.09))
cut = bpy.context.active_object
bmod = moon.modifiers.new('cut', 'BOOLEAN')
bmod.object = cut
bmod.operation = 'DIFFERENCE'
cut.hide_render = True
link(moon, gold)
bevel(moon, 0.006, 3)

# small Gregorian date


# ---------- throne (kursi) and suspension ring ----------
bpy.ops.mesh.primitive_torus_add(major_radius=0.07, minor_radius=0.02, location=(0, 1.13, 0.0), rotation=(0, math.pi / 2, 0))
link(bpy.context.active_object, gold)
bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.12, depth=0.1, location=(0, 1.0, -0.02))
th = bpy.context.active_object
link(th, brass)
bevel(th, 0.02, 4)

# ---------- backdrop, lights, camera ----------
backdrop([srgb('#1B2B78'), (0.38, srgb('#0A1238')), srgb('#02030A')], z=-1.4, radius=2.2, center=(0, 0.05))
area_light('key', (-2.0, -1.6, 3.6), target=(0, 0, 0), power=520, size=1.6, color=(1.0, 0.86, 0.68))
area_light('fill', (2.6, -0.8, 2.2), power=120, size=2.0, color=(0.65, 0.75, 1.0))
area_light('rim', (0.5, 3.2, 2.2), power=500, size=1.6, color=(1.0, 0.9, 0.8))
softbox('sb1', (-1.6, -2.4, 3.4), (2.6, 1.2), strength=6)
softbox('sb2', (2.2, 1.8, 3.0), (1.2, 2.4), strength=3, color=(0.8, 0.88, 1.0))
softbox('sbref', (-0.5, 2.6, 6.2), (3.0, 2.2), strength=2.6, color=(1.0, 0.93, 0.8))

# dawn halo rising behind the dial (the app's living-sky colours)
bpy.ops.mesh.primitive_circle_add(vertices=128, radius=1.5, fill_type='NGON', location=(0.35, -0.55, -1.3))
halo = bpy.context.active_object
hm = bpy.data.materials.new('halo'); hm.use_nodes = True; hn = hm.node_tree; hn.nodes.clear()
ho = hn.nodes.new('ShaderNodeOutputMaterial'); he = hn.nodes.new('ShaderNodeEmission')
htc = hn.nodes.new('ShaderNodeTexCoord'); hg = hn.nodes.new('ShaderNodeTexGradient'); hg.gradient_type = 'SPHERICAL'
hmp = hn.nodes.new('ShaderNodeMapping'); hmp.inputs['Scale'].default_value = (0.667, 0.667, 1)
hr = hn.nodes.new('ShaderNodeValToRGB')
hr.color_ramp.elements[0].color = (0, 0, 0, 1); hr.color_ramp.elements[1].position = 0.75; hr.color_ramp.elements[1].color = (*srgb('#FF8A4C'), 1)
hn.links.new(htc.outputs['Object'], hmp.inputs['Vector']); hn.links.new(hmp.outputs['Vector'], hg.inputs['Vector'])
hn.links.new(hg.outputs['Fac'], hr.inputs['Fac']); hn.links.new(hr.outputs['Color'], he.inputs['Color'])
he.inputs['Strength'].default_value = 1.1
hadd = hn.nodes.new('ShaderNodeAddShader'); htr = hn.nodes.new('ShaderNodeBsdfTransparent')
hmix = hn.nodes.new('ShaderNodeMixShader')
hn.links.new(hg.outputs['Fac'], hmix.inputs['Fac']); hn.links.new(htr.outputs[0], hmix.inputs[1]); hn.links.new(he.outputs[0], hmix.inputs[2])
hn.links.new(hmix.outputs[0], ho.inputs[0])
halo.data.materials.append(hm)
halo.visible_shadow = False
camera((0.45, -1.9, 5.2), target=(0, 0.08, 0), lens=82)
bloom(threshold=0.8, size=7, strength=0.45)
render(OUT, samples=int(sys.argv[-3]) if sys.argv[-3].isdigit() else 96)
