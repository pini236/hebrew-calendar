"""
The Chanukah card's scene, built and rendered with Blender (bpy 4.5, Cycles on the CPU).

A deep window in an old Jerusalem stone house, at night, seen from inside the room. The wall is half a metre
of hewn stone; on the sill (one slab of pale limestone) stands a brass oil chanukiah: eight glass cups of
olive oil with floating wicks in one straight row at one height, and the shamash apart on the right, a wax
taper raised on its own turned post (it is the one that is carried to light the others). Behind it the
window's iron casement and its small panes, and outside, across the alley, the house opposite, lit warm from
a street lamp below, one window of it lit, and over the roofs a dome, a solar water heater, and the sky.

It renders layers, not a picture; the app composites them live (src/components/seasons/chanukahPaint.ts):
  night_full / night_empty   the night, nothing lit in the room: the cups with oil (and the shamash candle)
                             / without
  day_full / day_empty       the same in the late afternoon (before lighting, under a daylight sky)
  light_0 … light_7          the light ONE flame lays on everything (that flame's light only, the flame itself
                             not drawn): slot 0 is the leftmost cup
  light_s                    the shamash's flame, at home
  window                     the lit window across the alley (it comes on in the evening)
  shamash                    the shamash candle alone (alpha), to draw it while it is carried
  beauty                     everything lit, flames visible: a reference only, never shipped
The sky is transparent (alpha) in every layer: the app paints the real sky of the place behind it.

The whole way, from the repository's root (bpy 4.5 needs Python 3.11; CPU rendering takes about an hour):
  python3.11 -m venv /tmp/bvenv && /tmp/bvenv/bin/pip install bpy==4.5.*
  /tmp/bvenv/bin/python scripts/chanukah-scene/build.py --out /tmp/ch --samples 128 --light-samples 80
  /tmp/bvenv/bin/python scripts/chanukah-scene/exr.py /tmp/ch
  python3 scripts/chanukah-scene/compose.py --src /tmp/ch --assets src/assets/chanukah \
      --ts src/components/seasons/chanukahScene.ts --stills design/chanukah          (numpy, Pillow)
  build.py also takes --only night_full,light_3 (some passes), --scale, --preview (a quick look at the beauty
  pass), --closeup (the chanukiah from near), --only info (just scene.json).

Writes DIR/<pass>.exr (linear) and DIR/scene.json (where each flame is in the picture, in pixels).
"""
import argparse
import json
import math
import os
import random
import sys

import bpy  # noqa: I001 (bpy first: it provides bmesh and mathutils)
import bmesh
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument('--out', required=True)
ap.add_argument('--scale', type=float, default=1.0, help='resolution scale of the base (1.0 = 960x800)')
ap.add_argument('--light-scale', type=float, default=0.5, help='resolution of the light passes, relative to the base')
ap.add_argument('--samples', type=int, default=128)
ap.add_argument('--light-samples', type=int, default=80)
ap.add_argument('--only', default='')
ap.add_argument('--preview', action='store_true', help='a quick look: few samples, beauty only unless --only')
ap.add_argument('--closeup', action='store_true', help='look at the chanukiah from near (to check its making)')
ap.add_argument('--blend', default='', help='also save the .blend here')
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)

W0, H0 = 960, 800  # 6:5, the card's stage
rnd = random.Random(5787)

# ---------------------------------------------------------------- the scene's numbers (metres)

# the room's wall is the plane y = 0 (the room is y < 0); the window goes through it, the sill's top is z = 0
WALL_T = 0.56
OPEN_X = 0.37  # half the opening's width
SPRING = 0.80  # where the arch begins
GLASS_Y = 0.43  # the casement's glass
SILL_FRONT = -0.055

CH_Y = 0.19  # the chanukiah's row, on the sill
SP = 0.044  # between cups
SHAMASH_GAP = 0.085
ROW_W = 7 * SP + SHAMASH_GAP
X0 = -ROW_W / 2 - 0.004  # slot 0, the leftmost
SLOT_X = [X0 + i * SP for i in range(8)]
SHAMASH_X = SLOT_X[7] + SHAMASH_GAP
CUP_Y = CH_Y
FLOOR = 0.0
BENCH_TOP = 0.046
CUP_Z0 = BENCH_TOP + 0.002  # the cup's foot
CUP_H = 0.048
OIL_Z = CUP_Z0 + 0.040
FLAME_Z = OIL_Z + 0.006  # the flame's foot (the wick's top)
OIL_FLAME_H = 0.028
SH_SOCKET = 0.142  # the shamash's socket rim
SH_LEN = 0.078  # the taper
SH_WICK = SH_SOCKET - 0.008 + SH_LEN + 0.004
SH_FLAME_H = 0.028

OPP_Y = 4.6  # the house across the alley
STREET_Z = -4.2
# ---------------------------------------------------------------- reset

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
cy = scene.cycles
cy.device = 'CPU'
cy.use_light_tree = True
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.blur_glossy = 1.0
cy.max_bounces = 8
cy.diffuse_bounces = 3
cy.glossy_bounces = 4
cy.transmission_bounces = 10
cy.transparent_max_bounces = 12
cy.sample_clamp_indirect = 6.0
cy.use_denoising = True
cy.denoiser = 'OPENIMAGEDENOISE'
cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
scene.view_settings.view_transform = 'Standard'
scene.render.film_transparent = True

scene.render.image_settings.file_format = 'OPEN_EXR'
scene.render.image_settings.color_depth = '16'
scene.render.image_settings.exr_codec = 'ZIP'
scene.render.image_settings.color_mode = 'RGBA'

# ---------------------------------------------------------------- materials


def nodes_of(m):
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return nt, out


def link(nt, a, b):
    nt.links.new(a, b)


def principled(nt, **kw):
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    for k, v in kw.items():
        p.inputs[k].default_value = v
    return p


def tex_coord(nt):
    return nt.nodes.new('ShaderNodeTexCoord')


def noise(nt, scale, detail=6.0, rough=0.55, coord=None):
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    if coord is not None:
        link(nt, coord, n.inputs['Vector'])
    return n


def ramp(nt, src, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    els = r.color_ramp.elements
    while len(els) > len(stops):
        els.remove(els[-1])
    while len(els) < len(stops):
        els.new(0.5)
    for e, (pos, col) in zip(els, stops):
        e.position = pos
        e.color = (*col, 1.0) if len(col) == 3 else col
    link(nt, src, r.inputs['Fac'])
    return r


def math_node(nt, op, a=None, b=None, va=0.0, vb=0.0):
    m = nt.nodes.new('ShaderNodeMath')
    m.operation = op
    if a is not None:
        link(nt, a, m.inputs[0])
    else:
        m.inputs[0].default_value = va
    if b is not None:
        link(nt, b, m.inputs[1])
    else:
        m.inputs[1].default_value = vb
    return m


def bump(nt, height, strength, distance, normal=None):
    b = nt.nodes.new('ShaderNodeBump')
    b.inputs['Strength'].default_value = strength
    b.inputs['Distance'].default_value = distance
    link(nt, height, b.inputs['Height'])
    if normal is not None:
        link(nt, normal, b.inputs['Normal'])
    return b


def mat_stone(name, palette, rough=0.92, bump_k=1.0, polish=None):
    """Hewn Jerusalem stone: a colour per block (attribute 'blk'), weathering, chisel marks (tubza)"""
    m = bpy.data.materials.new(name)
    nt, out = nodes_of(m)
    tc = tex_coord(nt)
    attr = nt.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'blk'
    col = ramp(nt, attr.outputs['Fac'], palette)
    # weathering: large soft stains and a darker foot
    stain = noise(nt, 2.2, 4, 0.5, tc.outputs['Object'])
    st = ramp(nt, stain.outputs['Fac'], [(0.3, (0.78, 0.74, 0.68)), (0.62, (1.0, 1.0, 1.0))])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    link(nt, col.outputs['Color'], mix.inputs[6])
    link(nt, st.outputs['Color'], mix.inputs[7])
    # fine grain in the colour
    grain = noise(nt, 140, 3, 0.6, tc.outputs['Object'])
    gr = ramp(nt, grain.outputs['Fac'], [(0.35, (0.86, 0.85, 0.83)), (0.65, (1.04, 1.03, 1.0))])
    mix2 = nt.nodes.new('ShaderNodeMix')
    mix2.data_type = 'RGBA'
    mix2.blend_type = 'MULTIPLY'
    mix2.inputs['Factor'].default_value = 1.0
    link(nt, mix.outputs[2], mix2.inputs[6])
    link(nt, gr.outputs['Color'], mix2.inputs[7])
    # chisel marks: a field of small pits and a rough undulation
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.feature = 'SMOOTH_F1'
    vor.inputs['Scale'].default_value = 110.0
    link(nt, tc.outputs['Object'], vor.inputs['Vector'])
    und = noise(nt, 14.0, 8, 0.66, tc.outputs['Object'])
    fine = noise(nt, 45.0, 6, 0.6, tc.outputs['Object'])
    h1 = math_node(nt, 'MULTIPLY', vor.outputs['Distance'], None, vb=0.6)
    h2 = math_node(nt, 'MULTIPLY', und.outputs['Fac'], None, vb=0.8)
    h3 = math_node(nt, 'MULTIPLY', fine.outputs['Fac'], None, vb=0.45)
    # the strokes of the toothed chisel, in diagonal bands
    wv = nt.nodes.new('ShaderNodeTexWave')
    wv.wave_type = 'BANDS'
    wv.bands_direction = 'DIAGONAL'
    wv.inputs['Scale'].default_value = 26.0
    wv.inputs['Distortion'].default_value = 6.0
    wv.inputs['Detail'].default_value = 3.0
    wv.inputs['Detail Scale'].default_value = 2.0
    link(nt, tc.outputs['Object'], wv.inputs['Vector'])
    h4 = math_node(nt, 'MULTIPLY', wv.outputs['Fac'], None, vb=0.22)
    hs = math_node(nt, 'ADD', math_node(nt, 'ADD', h1.outputs[0], h2.outputs[0]).outputs[0], h3.outputs[0])
    hs = math_node(nt, 'ADD', hs.outputs[0], h4.outputs[0])
    b = bump(nt, hs.outputs[0], 0.7 * bump_k, 0.02)
    r = rough
    p = principled(nt, Roughness=r)
    if polish is not None:
        # worn smooth by feet: shinier in patches
        pn = noise(nt, 1.6, 3, 0.5, tc.outputs['Object'])
        pr = ramp(nt, pn.outputs['Fac'], [(0.35, (polish, polish, polish)), (0.7, (rough, rough, rough))])
        link(nt, pr.outputs['Color'], p.inputs['Roughness'])
    link(nt, mix2.outputs[2], p.inputs['Base Color'])
    link(nt, b.outputs['Normal'], p.inputs['Normal'])
    link(nt, p.outputs[0], out.inputs['Surface'])
    return m


def mat_simple(name, color, rough=0.5, metal=0.0, bump_scale=0.0, bump_k=0.2, coat=0.0):
    m = bpy.data.materials.new(name)
    nt, out = nodes_of(m)
    p = principled(nt, **{'Base Color': (*color, 1), 'Roughness': rough, 'Metallic': metal, 'Coat Weight': coat})
    if bump_scale:
        tc = tex_coord(nt)
        n = noise(nt, bump_scale, 6, 0.6, tc.outputs['Object'])
        b = bump(nt, n.outputs['Fac'], bump_k, 0.004)
        link(nt, b.outputs['Normal'], p.inputs['Normal'])
    link(nt, p.outputs[0], out.inputs['Surface'])
    return m


def mat_paint(name, paint, rust, rough=0.55, rust_amt=0.45, scale=6.0):
    """Painted iron, the paint worn through to rust here and there"""
    m = bpy.data.materials.new(name)
    nt, out = nodes_of(m)
    tc = tex_coord(nt)
    n = noise(nt, scale, 10, 0.7, tc.outputs['Object'])
    mask = ramp(nt, n.outputs['Fac'], [(rust_amt, (0, 0, 0)), (rust_amt + 0.06, (1, 1, 1))])
    a = principled(nt, **{'Base Color': (*paint, 1), 'Roughness': rough, 'Coat Weight': 0.15, 'Coat Roughness': 0.3})
    b = principled(nt, **{'Base Color': (*rust, 1), 'Roughness': 0.9})
    mx = nt.nodes.new('ShaderNodeMixShader')
    link(nt, mask.outputs['Color'], mx.inputs['Fac'])
    link(nt, a.outputs[0], mx.inputs[1])
    link(nt, b.outputs[0], mx.inputs[2])
    fine = noise(nt, 90, 4, 0.6, tc.outputs['Object'])
    bb = bump(nt, fine.outputs['Fac'], 0.12, 0.002)
    link(nt, bb.outputs['Normal'], a.inputs['Normal'])
    link(nt, bb.outputs['Normal'], b.inputs['Normal'])
    link(nt, mx.outputs[0], out.inputs['Surface'])
    return m


def mat_brass(name, hammered=False):
    m = bpy.data.materials.new(name)
    nt, out = nodes_of(m)
    tc = tex_coord(nt)
    n = noise(nt, 18, 6, 0.6, tc.outputs['Object'])
    # aged brass: polished where hands touch, darker in the hollows
    col = ramp(nt, n.outputs['Fac'], [(0.3, (0.70, 0.48, 0.20)), (0.7, (0.95, 0.74, 0.38))])
    rr = ramp(nt, n.outputs['Fac'], [(0.3, (0.26, 0.26, 0.26)), (0.7, (0.12, 0.12, 0.12))])
    p = principled(nt, Metallic=1.0)
    link(nt, col.outputs['Color'], p.inputs['Base Color'])
    link(nt, rr.outputs['Color'], p.inputs['Roughness'])
    if hammered:
        v = nt.nodes.new('ShaderNodeTexVoronoi')
        v.feature = 'SMOOTH_F1'
        v.inputs['Scale'].default_value = 70.0
        link(nt, tc.outputs['Object'], v.inputs['Vector'])
        b = bump(nt, v.outputs['Distance'], 0.35, 0.004)
        link(nt, b.outputs['Normal'], p.inputs['Normal'])
    link(nt, p.outputs[0], out.inputs['Surface'])
    return m


def mat_glass(name, color=(1, 1, 1), ior=1.5, rough=0.0, shadow=(0.92, 0.92, 0.92), glow=0.0):
    """Glass that also lets light through to what is behind it (no caustics: shadow rays pass, tinted).
    `glow`: a share of diffuse translucency, so the oil itself catches the flame's light as real oil does"""
    m = bpy.data.materials.new(name)
    nt, out = nodes_of(m)
    g = nt.nodes.new('ShaderNodeBsdfGlass')
    g.inputs['Color'].default_value = (*color, 1)
    g.inputs['IOR'].default_value = ior
    g.inputs['Roughness'].default_value = rough
    t = nt.nodes.new('ShaderNodeBsdfTransparent')
    t.inputs['Color'].default_value = (*shadow, 1)
    lp = nt.nodes.new('ShaderNodeLightPath')
    mx = nt.nodes.new('ShaderNodeMixShader')
    link(nt, lp.outputs['Is Shadow Ray'], mx.inputs['Fac'])
    if glow:
        tl = nt.nodes.new('ShaderNodeBsdfTranslucent')
        tl.inputs['Color'].default_value = (*color, 1)
        m2 = nt.nodes.new('ShaderNodeMixShader')
        m2.inputs['Fac'].default_value = glow
        link(nt, g.outputs[0], m2.inputs[1])
        link(nt, tl.outputs[0], m2.inputs[2])
        g = m2
    link(nt, g.outputs[0], mx.inputs[1])
    link(nt, t.outputs[0], mx.inputs[2])
    link(nt, mx.outputs[0], out.inputs['Surface'])
    return m


def mat_emit(name, color, strength):
    m = bpy.data.materials.new(name)
    nt, out = nodes_of(m)
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (*color, 1)
    e.inputs['Strength'].default_value = strength
    link(nt, e.outputs[0], out.inputs['Surface'])
    return m


def mat_flame(name):
    """The flame as a light shape: seen only in reflections (glass, brass); a gradient from foot to tip"""
    m = bpy.data.materials.new(name)
    nt, out = nodes_of(m)
    tc = tex_coord(nt)
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    link(nt, tc.outputs['Generated'], sep.inputs[0])
    col = ramp(nt, sep.outputs['Z'], [(0.0, (1.0, 0.45, 0.12)), (0.3, (1.0, 0.86, 0.6)), (1.0, (1.0, 0.55, 0.18))])
    e = nt.nodes.new('ShaderNodeEmission')
    link(nt, col.outputs['Color'], e.inputs['Color'])
    # seen up close only (the brass and the cups round it, and the camera in the beauty pass): its reflection
    # in the window's glass, a quarter metre behind, is drawn live by the card instead, so it moves with it
    lp = nt.nodes.new('ShaderNodeLightPath')
    near = math_node(nt, 'LESS_THAN', lp.outputs['Ray Length'], None, vb=0.2)
    seen = math_node(nt, 'MAXIMUM', near.outputs[0], lp.outputs['Is Camera Ray'])
    k = math_node(nt, 'MULTIPLY', seen.outputs[0], None, vb=45.0)
    link(nt, k.outputs[0], e.inputs['Strength'])
    link(nt, e.outputs[0], out.inputs['Surface'])
    return m


def mat_curtain(name, color, strength):
    """A curtain lit from the room behind: soft folds, brighter where the lamp is"""
    m = bpy.data.materials.new(name)
    nt, out = nodes_of(m)
    tc = tex_coord(nt)
    wv = nt.nodes.new('ShaderNodeTexWave')
    wv.wave_type = 'BANDS'
    wv.bands_direction = 'X'
    wv.inputs['Scale'].default_value = 7.0
    wv.inputs['Distortion'].default_value = 2.0
    wv.inputs['Detail'].default_value = 2.0
    link(nt, tc.outputs['Object'], wv.inputs['Vector'])
    folds = ramp(nt, wv.outputs['Fac'], [(0.0, (0.55, 0.55, 0.55)), (1.0, (1.0, 1.0, 1.0))])
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    link(nt, tc.outputs['Generated'], sep.inputs[0])
    lamp = ramp(nt, sep.outputs['Z'], [(0.0, (0.55, 0.55, 0.55)), (0.85, (1.0, 1.0, 1.0))])
    mx = nt.nodes.new('ShaderNodeMix')
    mx.data_type = 'RGBA'
    mx.blend_type = 'MULTIPLY'
    mx.inputs['Factor'].default_value = 1.0
    link(nt, folds.outputs['Color'], mx.inputs[6])
    link(nt, lamp.outputs['Color'], mx.inputs[7])
    mx2 = nt.nodes.new('ShaderNodeMix')
    mx2.data_type = 'RGBA'
    mx2.blend_type = 'MULTIPLY'
    mx2.inputs['Factor'].default_value = 1.0
    mx2.inputs[6].default_value = (*color, 1)
    link(nt, mx.outputs[2], mx2.inputs[7])
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Strength'].default_value = strength
    link(nt, mx2.outputs[2], e.inputs['Color'])
    link(nt, e.outputs[0], out.inputs['Surface'])
    return m


def mat_wax(name):
    m = bpy.data.materials.new(name)
    nt, out = nodes_of(m)
    p = principled(
        nt,
        **{
            'Base Color': (0.86, 0.80, 0.66, 1),
            'Roughness': 0.38,
            'Subsurface Weight': 0.85,
            'Subsurface Radius': (1.0, 0.55, 0.25),
            'Subsurface Scale': 0.012,
        },
    )
    tc = tex_coord(nt)
    n = noise(nt, 120, 4, 0.5, tc.outputs['Object'])
    b = bump(nt, n.outputs['Fac'], 0.08, 0.001)
    link(nt, b.outputs['Normal'], p.inputs['Normal'])
    link(nt, p.outputs[0], out.inputs['Surface'])
    return m


STONE = [
    (0.0, (0.60, 0.50, 0.36)),
    (0.3, (0.70, 0.60, 0.44)),
    (0.55, (0.66, 0.53, 0.40)),
    (0.8, (0.74, 0.65, 0.50)),
    (1.0, (0.58, 0.52, 0.42)),
]
SILL = [
    (0.0, (0.74, 0.66, 0.52)),
    (1.0, (0.80, 0.73, 0.60)),
]
M = {
    'stone': mat_stone('stone', STONE, bump_k=0.7),
    'stone_out': mat_stone('stone_out', STONE, bump_k=1.0),
    'sill': mat_stone('sill', SILL, rough=0.55, bump_k=0.18, polish=0.3),
    'mortar': mat_simple('mortar', (0.40, 0.35, 0.28), 0.98, bump_scale=60, bump_k=0.4),
    'casement': mat_paint('casement', (0.10, 0.12, 0.10), (0.12, 0.06, 0.03), rough=0.45, rust_amt=0.7, scale=20),
    'iron': mat_paint('iron', (0.015, 0.015, 0.015), (0.10, 0.05, 0.025), rough=0.5, rust_amt=0.6, scale=12),
    'cupglass': mat_glass('cupglass', color=(0.97, 0.99, 0.98)),
    'oil': mat_glass('oil', color=(0.95, 0.70, 0.24), ior=1.47, shadow=(0.98, 0.82, 0.42), glow=0.3),
    'brass': mat_brass('brass'),
    'wax': mat_wax('wax'),
    'wick': mat_simple('wick', (0.85, 0.82, 0.74), 0.9),
    'cork': mat_simple('cork', (0.38, 0.24, 0.13), 0.85, bump_scale=200, bump_k=0.5),
    'char': mat_simple('char', (0.02, 0.018, 0.016), 0.8),
    'tin': mat_simple('tin', (0.55, 0.55, 0.52), 0.35, metal=1.0),
    'flame': mat_flame('flame'),
    'window': mat_curtain('window', (1.0, 0.62, 0.32), 0.7),
    'dark_window': mat_simple('dark_window', (0.01, 0.01, 0.012), 0.3),
    'wood': mat_paint('wood', (0.05, 0.13, 0.12), (0.09, 0.06, 0.04), rough=0.7, rust_amt=0.5, scale=9),
    'roof': mat_simple('roof', (0.22, 0.21, 0.2), 0.8, bump_scale=20, bump_k=0.2),
    'solar': mat_simple('solar', (0.02, 0.025, 0.04), 0.25, metal=0.2),
    'tank': mat_simple('tank', (0.35, 0.36, 0.36), 0.45, metal=0.5),
    'far_win': mat_emit('far_win', (1.0, 0.66, 0.36), 1.2),
}

# ---------------------------------------------------------------- mesh building


class Builder:
    """Cuboids (and other parts) gathered into one mesh, with a per-part random 'blk' attribute"""

    def __init__(self):
        self.bm = bmesh.new()
        self.layer = self.bm.faces.layers.float.new('blk')

    def cuboid(self, x0, x1, y0, y1, z0, z1, bevel=0.0, segs=2, val=None):
        bm = self.bm
        vs = [bm.verts.new(v) for v in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        idx = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        fs = [bm.faces.new([vs[i] for i in f]) for f in idx]
        if bevel > 0:
            edges = list({e for f in fs for e in f.edges})
            res = bmesh.ops.bevel(bm, geom=edges + vs, offset=bevel, segments=segs, profile=0.6, affect='EDGES', clamp_overlap=True)
            fs = fs + list(res['faces'])
        v = rnd.random() if val is None else val
        for f in fs:
            if f.is_valid:
                f[self.layer] = v
        return fs

    def obj(self, name, mat, smooth=False):
        me = bpy.data.meshes.new(name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        o = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(o)
        o.data.materials.append(mat)
        if smooth:
            for p in me.polygons:
                p.use_smooth = True
        return o


def new_obj(name, me, mat, smooth=True):
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if mat:
        o.data.materials.append(mat)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return o


def lathe(name, profile, mat, segs=48, loc=(0, 0, 0), smooth=True, cap=True):
    """A surface of revolution about z from (r, z) points"""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segs):
            a, b = rings[i][k], rings[i][(k + 1) % segs]
            c, d = rings[i + 1][(k + 1) % segs], rings[i + 1][k]
            try:
                bm.faces.new([a, b, c, d])
            except ValueError:
                pass
    if cap:
        for ring in (rings[0], rings[-1]):
            if profile[rings.index(ring)][0] > 1e-5:
                try:
                    bm.faces.new(ring)
                except ValueError:
                    pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = new_obj(name, me, mat, smooth)
    o.location = loc
    return o


def ellipsoid(name, rx, ry, rz, loc, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1.0, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (rx, ry, rz)
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def cylinder(name, r, z0, z1, loc_xy, mat, segs=32, rot=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=r, depth=z1 - z0, location=(loc_xy[0], loc_xy[1], (z0 + z1) / 2))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    if rot:
        o.rotation_euler = rot
    return o


def ashlar(b, a0, a1, z0, z1, face, dirn, course=(0.27, 0.36), length=(0.36, 0.86), depth=0.14, skip=None, bevel=0.012, jitter=0.004, along='x', joint=0.007):
    """Hewn blocks in courses, gathered into builder b. The wall runs along `along` ('x' or 'y') from a0 to a1;
    its visible face is at `face` on the other horizontal axis and looks toward `dirn` (+1 or -1) along it.
    `skip(a, c, z0, z1)` leaves a block out (an opening)."""
    z = z0
    row = 0
    while z < z1:
        h = rnd.uniform(*course)
        a = a0 - rnd.uniform(0, length[1]) * (row % 2)
        while a < a1:
            L = rnd.uniform(*length)
            p, q = max(a, a0), min(a + L, a1)
            if q - p > 0.05 and not (skip and skip(p, q, z, z + h)):
                out = rnd.uniform(-jitter, jitter)
                f = face + dirn * out
                k = face - dirn * depth
                lo, hi = min(f, k), max(f, k)
                if along == 'x':
                    b.cuboid(p + joint, q - joint, lo, hi, z + joint, z + h - joint, bevel=bevel)
                else:
                    b.cuboid(lo, hi, p + joint, q - joint, z + joint, z + h - joint, bevel=bevel)
            a += L
        z += h
        row += 1


def wall_plane(name, x0, x1, z0, z1, y, holes, mat):
    """A flat backing (the mortar behind the joints) from x0..x1, z0..z1 at y, leaving rectangular holes"""
    xs = sorted({x0, x1, *[h[0] for h in holes], *[h[1] for h in holes]})
    zs = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes]})
    bm = bmesh.new()
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            cx, cz = (xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
            if any(h[0] < cx < h[1] and h[2] < cz < h[3] for h in holes):
                continue
            vs = [bm.verts.new(v) for v in [(xs[i], y, zs[j]), (xs[i + 1], y, zs[j]), (xs[i + 1], y, zs[j + 1]), (xs[i], y, zs[j + 1])]]
            bm.faces.new(vs)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return new_obj(name, me, mat, smooth=False)


def mat_pane(name):
    """A window pane: clear (the sky shows through it as transparency), with a faint reflection"""
    m = bpy.data.materials.new(name)
    nt, out = nodes_of(m)
    fr = nt.nodes.new('ShaderNodeFresnel')
    fr.inputs['IOR'].default_value = 1.52
    t = nt.nodes.new('ShaderNodeBsdfTransparent')
    t.inputs['Color'].default_value = (0.94, 0.95, 0.94, 1)
    g = nt.nodes.new('ShaderNodeBsdfGlossy')
    g.inputs['Roughness'].default_value = 0.015
    mx = nt.nodes.new('ShaderNodeMixShader')
    f2 = math_node(nt, 'MULTIPLY', fr.outputs[0], None, vb=0.5)
    link(nt, f2.outputs[0], mx.inputs['Fac'])
    link(nt, t.outputs[0], mx.inputs[1])
    link(nt, g.outputs[0], mx.inputs[2])
    link(nt, mx.outputs[0], out.inputs['Surface'])
    return m


M['glass'] = mat_pane('pane')


def plane(name, corners, mat):
    bm = bmesh.new()
    vs = [bm.verts.new(c) for c in corners]
    bm.faces.new(vs)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return new_obj(name, me, mat, smooth=False)

# ---------------------------------------------------------------- the room's wall and the window

ARCH_TOP = SPRING + OPEN_X
JAMB = 0.24  # the dressed stones round the opening


def skip_opening(a, c, z0, z1):
    return c > -OPEN_X - JAMB and a < OPEN_X + JAMB and z1 > -0.36 and z0 < ARCH_TOP + 0.3


wall = Builder()
# the room's face of the wall: hewn stone, dressed smoother than outside
ashlar(wall, -2.2, 2.2, -1.2, 2.2, 0.0, -1, skip=skip_opening, depth=0.12, bevel=0.01)
# the jambs: through-stones, their sides are the window's reveal
for sgn in (-1, 1):
    z = -0.075
    while z < SPRING - 0.01:
        h = min(rnd.uniform(0.26, 0.34), SPRING - z)
        if SPRING - z - h < 0.12:
            h = SPRING - z
        x_in, x_out = sgn * OPEN_X, sgn * (OPEN_X + JAMB + rnd.uniform(-0.04, 0.04))
        wall.cuboid(min(x_in, x_out), max(x_in, x_out), -0.004 + rnd.uniform(-0.003, 0.003), WALL_T, z + 0.006, z + h - 0.006, bevel=0.01)
        z += h
# the arch: voussoirs through the wall, and the stones that fill out its shoulders
n = 9
for k in range(n):
    a0, a1 = math.pi * k / n, math.pi * (k + 1) / n
    pts = []
    for a in (a0 + 0.008, a1 - 0.008):
        for r in (OPEN_X, OPEN_X + JAMB):
            pts.append((math.cos(a) * r, SPRING + math.sin(a) * r))
    ring = [pts[0], pts[1], pts[3], pts[2]]
    vs = []
    for yy in (-0.004, WALL_T):
        for (x, z) in ring:
            vs.append(wall.bm.verts.new((x, yy, z)))
    v = rnd.random()
    for f in [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]:
        ff = wall.bm.faces.new([vs[i] for i in f])
        ff[wall.layer] = v
for sgn in (-1, 1):
    x0, x1 = sgn * (OPEN_X + JAMB * 0.55), sgn * (OPEN_X + JAMB + 0.02)
    wall.cuboid(min(x0, x1), max(x0, x1), -0.004, 0.12, SPRING + 0.006, ARCH_TOP + 0.3, bevel=0.01)
wall.cuboid(-OPEN_X - JAMB, OPEN_X + JAMB, -0.004, 0.12, ARCH_TOP + JAMB + 0.006, ARCH_TOP + 0.3, bevel=0.01)
# under the sill: a long stone
wall.cuboid(-OPEN_X - JAMB, OPEN_X + JAMB, -0.004, 0.12, -0.36, -0.081, bevel=0.01)
wall.obj('wall', M['stone'])
wall_plane('wall_mortar', -2.2, 2.2, -1.2, 2.2, 0.012, [(-OPEN_X - JAMB + 0.02, OPEN_X + JAMB - 0.02, -0.34, ARCH_TOP + 0.28)], M['mortar'])

# the sill: one slab of pale limestone with a rounded nose into the room
sill = Builder()
sill.cuboid(-OPEN_X - 0.13, OPEN_X + 0.13, SILL_FRONT, 0.03, -0.075, 0.0, bevel=0.016, segs=4, val=0.3)
sill.cuboid(-OPEN_X + 0.002, OPEN_X - 0.002, 0.02, GLASS_Y + 0.03, -0.075, 0.0, bevel=0.006, val=0.6)
# outside the glass: the outer sill, a little lower
sill.cuboid(-OPEN_X + 0.002, OPEN_X - 0.002, GLASS_Y + 0.03, WALL_T + 0.05, -0.12, -0.035, bevel=0.008, val=0.8)
sill.obj('sill', M['sill'])

# the casement: an iron frame in the opening, two leaves of small panes, the glass
FR = 0.034  # the frame's face
cas = Builder()
gy0, gy1 = GLASS_Y - 0.012, GLASS_Y + 0.022
top = SPRING + 0.02
cas.cuboid(-OPEN_X, -OPEN_X + FR, gy0, gy1, 0.0, top, bevel=0.002)
cas.cuboid(OPEN_X - FR, OPEN_X, gy0, gy1, 0.0, top, bevel=0.002)
cas.cuboid(-OPEN_X, OPEN_X, gy0, gy1, 0.0, 0.03, bevel=0.002)
cas.cuboid(-OPEN_X, OPEN_X, gy0, gy1, top - FR, top, bevel=0.002)
cas.cuboid(-0.022, 0.022, gy0 - 0.006, gy1, 0.0, top, bevel=0.002)  # the leaves meet here
GLAZ = [0.47]
for z in GLAZ:
    cas.cuboid(-OPEN_X, OPEN_X, GLASS_Y - 0.006, GLASS_Y + 0.012, z - 0.009, z + 0.009, bevel=0.0015)
# the handle on the right leaf
cas.cuboid(0.03, 0.042, gy0 - 0.03, gy0 - 0.006, 0.36, 0.40, bevel=0.002)
cas.cuboid(0.028, 0.044, gy0 - 0.028, gy0 - 0.018, 0.30, 0.40, bevel=0.002)
cas.obj('casement', M['casement'])
# the arch above the casement: a fixed fanlight of plain glass in an iron band
fan = Builder()
for k in range(24):
    a0, a1 = math.pi * k / 24, math.pi * (k + 1) / 24
    r0, r1 = OPEN_X - FR, OPEN_X
    vs = []
    for yy in (gy0, gy1):
        for (a, r) in ((a0, r0), (a0, r1), (a1, r1), (a1, r0)):
            vs.append(fan.bm.verts.new((math.cos(a) * r, yy, top + math.sin(a) * r)))
    for f in [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]:
        fan.bm.faces.new([vs[i] for i in f])
fan.obj('fan_iron', M['casement'])
glass_parts = []
for x0, x1 in ((-OPEN_X + FR, -0.022), (0.022, OPEN_X - FR)):
    glass_parts.append(plane('glass', [(x0, GLASS_Y + 0.003, 0.03), (x1, GLASS_Y + 0.003, 0.03), (x1, GLASS_Y + 0.003, top - FR), (x0, GLASS_Y + 0.003, top - FR)], M['glass']))
fl = bmesh.new()
cverts = [fl.verts.new((0, GLASS_Y + 0.003, top))]
for k in range(25):
    a = math.pi * k / 24
    cverts.append(fl.verts.new((math.cos(a) * (OPEN_X - FR), GLASS_Y + 0.003, top + math.sin(a) * (OPEN_X - FR))))
for k in range(24):
    fl.faces.new([cverts[0], cverts[k + 1], cverts[k + 2]])
me = bpy.data.meshes.new('fan_glass')
fl.to_mesh(me)
fl.free()
glass_parts.append(new_obj('fan_glass', me, M['glass'], smooth=False))
for g in glass_parts:
    s = g.modifiers.new('thick', 'SOLIDIFY')
    s.thickness = 0.003

# ---------------------------------------------------------------- outside: the alley and the house opposite

OWIN = (-1.22, -0.52, -0.40, 0.70)  # its lit window: x0, x1, z0, z1
OWIN2 = (0.62, 1.32, -0.40, 0.70)  # a shuttered one
OPP_TOP = 1.22


def skip_owin(a, c, z0, z1):
    for w in (OWIN, OWIN2):
        if c > w[0] - 0.13 and a < w[1] + 0.13 and z1 > w[2] - 0.13 and z0 < w[3] + 0.2:
            return True
    return False


opp = Builder()
ashlar(opp, -6, 6, STREET_Z, OPP_TOP, OPP_Y, -1, skip=skip_owin, bevel=0.012, depth=0.2)
# the parapet's coping
opp.cuboid(-6, 6, OPP_Y - 0.04, OPP_Y + 0.4, OPP_TOP + 0.005, OPP_TOP + 0.09, bevel=0.01)
for w in (OWIN, OWIN2):
    x0, x1, z0, z1 = w
    opp.cuboid(x0 - 0.13, x1 + 0.13, OPP_Y - 0.035, OPP_Y + 0.2, z0 - 0.12, z0 - 0.005, bevel=0.01)  # sill
    opp.cuboid(x0 - 0.12, x1 + 0.12, OPP_Y - 0.03, OPP_Y + 0.2, z1 + 0.005, z1 + 0.2, bevel=0.01)  # lintel
    for a, c in ((x0 - 0.12, x0 - 0.005), (x1 + 0.005, x1 + 0.12)):
        opp.cuboid(a, c, OPP_Y - 0.028, OPP_Y + 0.2, z0 - 0.005, z1 + 0.005, bevel=0.008)
    # the reveal
    opp.cuboid(x0, x1, OPP_Y + 0.2, OPP_Y + 0.24, z0 - 0.12, z1 + 0.2)
opp.obj('opposite', M['stone_out'])
wall_plane('opp_mortar', -6, 6, STREET_Z, OPP_TOP, OPP_Y + 0.014, [(w[0] - 0.1, w[1] + 0.1, w[2] - 0.1, w[3] + 0.18) for w in (OWIN, OWIN2)], M['mortar'])
# the lit window: a warm curtain behind the glass, its shutters folded open
win_glow = plane('window_glow', [(OWIN[0], OPP_Y + 0.19, OWIN[2]), (OWIN[1], OPP_Y + 0.19, OWIN[2]), (OWIN[1], OPP_Y + 0.19, OWIN[3]), (OWIN[0], OPP_Y + 0.19, OWIN[3])], M['window'])
plane('owin2_dark', [(OWIN2[0], OPP_Y + 0.19, OWIN2[2]), (OWIN2[1], OPP_Y + 0.19, OWIN2[2]), (OWIN2[1], OPP_Y + 0.19, OWIN2[3]), (OWIN2[0], OPP_Y + 0.19, OWIN2[3])], M['dark_window'])
sh = Builder()
w = (OWIN[1] - OWIN[0]) / 2
for x0, x1 in ((OWIN[0] - 0.12 - w, OWIN[0] - 0.12), (OWIN[1] + 0.12, OWIN[1] + 0.12 + w)):
    sh.cuboid(x0, x1, OPP_Y - 0.06, OPP_Y - 0.035, OWIN[2] + 0.01, OWIN[3] - 0.01, bevel=0.003)
    for k in range(int((OWIN[3] - OWIN[2]) / 0.07)):
        z = OWIN[2] + 0.05 + k * 0.07
        sh.cuboid(x0 + 0.03, x1 - 0.03, OPP_Y - 0.07, OPP_Y - 0.06, z, z + 0.03)
# the other window's shutters, closed
x0, x1, z0, z1 = OWIN2
sh.cuboid(x0, x1, OPP_Y + 0.12, OPP_Y + 0.15, z0, z1, bevel=0.003)
for k in range(int((z1 - z0) / 0.07)):
    z = z0 + 0.05 + k * 0.07
    sh.cuboid(x0 + 0.03, x1 - 0.03, OPP_Y + 0.11, OPP_Y + 0.12, z, z + 0.03)
sh.cuboid((x0 + x1) / 2 - 0.004, (x0 + x1) / 2 + 0.004, OPP_Y + 0.105, OPP_Y + 0.12, z0, z1)
sh.obj('shutters', M['wood'])
# a little iron rail in front of the lit window
rail_b = Builder()
rail_b.cuboid(OWIN[0] - 0.1, OWIN[1] + 0.1, OPP_Y - 0.2, OPP_Y - 0.18, 0.22, 0.24)
for k in range(9):
    x = OWIN[0] - 0.08 + k * (OWIN[1] - OWIN[0] + 0.16) / 8
    rail_b.cuboid(x - 0.006, x + 0.006, OPP_Y - 0.2, OPP_Y - 0.188, -0.3, 0.23)
rail_b.cuboid(OWIN[0] - 0.12, OWIN[1] + 0.12, OPP_Y - 0.22, OPP_Y, -0.33, -0.3)
rail_b.obj('balcony', M['iron'])

# on its roof: a solar water heater (a tank and a tilted panel on a frame), and further back a dome
roof = Builder()
roof.cuboid(-6, 6, OPP_Y, OPP_Y + 6, OPP_TOP - 0.2, OPP_TOP)
roof.obj('roof', M['roof'])
TANK = (-0.55, OPP_Y + 1.3, OPP_TOP + 0.85)
o = cylinder('tank', 0.24, -0.62, 0.62, (0, 0), M['tank'], segs=32)
o.rotation_euler = (0, math.pi / 2, 0)
o.location = TANK
pn = Builder()
pn.cuboid(-1.15, 0.05, -0.02, 0.02, -0.55, 0.55)
pn_o = pn.obj('panel', M['solar'])
pn_o.location = (0.0, OPP_Y + 2.1, OPP_TOP + 0.8)
pn_o.rotation_euler = (math.radians(-50), 0, 0)
fr = Builder()
for x in (-1.1, 0.0):
    fr.cuboid(x - 0.015, x + 0.015, OPP_Y + 1.25, OPP_Y + 1.28, OPP_TOP, OPP_TOP + 0.63)
    fr.cuboid(x - 0.015, x + 0.015, OPP_Y + 2.6, OPP_Y + 2.63, OPP_TOP, OPP_TOP + 0.6)
fr.obj('heater_frame', M['iron'])
# the dome and its drum, behind
DOME = (1.35, OPP_Y + 6.5, 2.9)
cylinder('drum', 1.56, OPP_TOP - 0.2, DOME[2], (DOME[0], DOME[1]), M['stone_out'], segs=64)
bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1.5, location=DOME)
dome = bpy.context.active_object
dome.name = 'dome'
dome.data.materials.append(M['stone_out'])
for p in dome.data.polygons:
    p.use_smooth = True
far_b = Builder()
far_b.cuboid(-1.0, 3.6, OPP_Y + 6.4, OPP_Y + 12, OPP_TOP - 0.2, DOME[2] - 0.05)
far_b.cuboid(-9, -1.4, OPP_Y + 9, OPP_Y + 14, OPP_TOP - 0.2, 3.7)
far_b.cuboid(3.4, 9, OPP_Y + 10, OPP_Y + 15, OPP_TOP - 0.2, 3.9)
far_b.obj('far_houses', M['stone_out'])
# a cypress beyond the roofs
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=24, radius=1.0, location=(-1.75, OPP_Y + 3.6, OPP_TOP + 1.55))
cyp = bpy.context.active_object
cyp.name = 'cypress'
cyp.scale = (0.36, 0.36, 1.9)
cyp.data.materials.append(mat_simple('cypress', (0.02, 0.04, 0.025), 0.9))
tex = bpy.data.textures.new('cyp', 'CLOUDS')
tex.noise_scale = 0.12
dm = cyp.modifiers.new('leaves', 'DISPLACE')
dm.texture = tex
dm.strength = 0.12
sub = cyp.modifiers.new('sub', 'SUBSURF')
sub.levels = 1
sub.render_levels = 2
cyp.modifiers.move(1, 0)
# a few lit windows far off
for (x, y, z) in ((-3.0, OPP_Y + 8.95, 3.15), (-2.2, OPP_Y + 8.95, 3.15), (4.4, OPP_Y + 9.95, 3.3)):
    plane('far_win', [(x - 0.25, y, z - 0.3), (x + 0.25, y, z - 0.3), (x + 0.25, y, z + 0.3), (x - 0.25, y, z + 0.3)], M['far_win'])

# ---------------------------------------------------------------- the chanukiah

# a brass bench on four bun feet: mouldings top and bottom, a little arcade of arches pressed into its long
# sides (one under each cup), and on its top eight collars that hold the glass cups, all at one height
BENCH_X0, BENCH_X1 = SLOT_X[0] - 0.03, SHAMASH_X + 0.024
BENCH_D = 0.058
BZ = (0.013, BENCH_TOP)
bench = Builder()
# the body: a long loaf of brass, its edges rounded so they catch the flames above and the lit sill below
bench.cuboid(BENCH_X0 + 0.003, BENCH_X1 - 0.003, CUP_Y - BENCH_D / 2 + 0.003, CUP_Y + BENCH_D / 2 - 0.003, BZ[0], BZ[1] - 0.005, bevel=0.0105, segs=8, val=0.5)
# the top: a thin plate with a rounded lip
bench.cuboid(BENCH_X0, BENCH_X1, CUP_Y - BENCH_D / 2, CUP_Y + BENCH_D / 2, BZ[1] - 0.0065, BZ[1], bevel=0.0028, segs=4, val=0.5)
bench_o = bench.obj('bench', M['brass'], smooth=True)
for x in (BENCH_X0 + 0.016, BENCH_X1 - 0.016):
    for y in (CUP_Y - BENCH_D / 2 + 0.012, CUP_Y + BENCH_D / 2 - 0.012):
        lathe('foot', [(0.0, 0.0), (0.006, 0.0), (0.0095, 0.004), (0.0105, 0.0075), (0.0085, 0.011), (0.006, 0.013), (0.0, 0.013)], M['brass'], loc=(x, y, FLOOR), segs=32)
for x in SLOT_X:
    lathe('collar', [(0.0, 0.0), (0.0205, 0.0), (0.0205, 0.002), (0.0196, 0.0035), (0.0196, 0.010), (0.0212, 0.0115), (0.0212, 0.0135), (0.0186, 0.0135), (0.0186, 0.002), (0.0, 0.002)], M['brass'], loc=(x, CUP_Y, BENCH_TOP - 0.0005), segs=48, cap=False)

# the shamash: a turned post at the right, raised, with a socket and a wax taper
SH_POST_TOP = SH_SOCKET - 0.016
SH_L = SH_POST_TOP - BENCH_TOP + 0.0005
lathe(
    'shamash_post',
    [(0.0, 0.0), (0.0125, 0.0), (0.0125, 0.003), (0.0075, 0.007), (0.005, 0.014), (0.005, SH_L * 0.45), (0.0082, SH_L * 0.45 + 0.004), (0.005, SH_L * 0.45 + 0.008), (0.0045, SH_L), (0.0, SH_L)],
    M['brass'],
    loc=(SHAMASH_X, CUP_Y, BENCH_TOP - 0.0005),
)
lathe(
    'shamash_socket',
    [(0.0, 0.0), (0.006, 0.0), (0.012, 0.004), (0.016, 0.012), (0.0175, 0.016), (0.0168, 0.0165), (0.0074, 0.006), (0.0074, 0.016), (0.0, 0.016)],
    M['brass'],
    loc=(SHAMASH_X, CUP_Y, SH_POST_TOP),
    cap=False,
)
# the taper: slightly tapered, a few drips, its top melted into a cup round the wick
TAPER_FOOT = SH_SOCKET - 0.008
taper_prof = [(0.0, 0.0), (0.0068, 0.0), (0.0066, SH_LEN * 0.5), (0.0060, SH_LEN - 0.004), (0.0056, SH_LEN - 0.0015), (0.0044, SH_LEN), (0.0022, SH_LEN - 0.0022), (0.0, SH_LEN - 0.0025)]
taper = lathe('shamash_candle', taper_prof, M['wax'], loc=(SHAMASH_X, CUP_Y, TAPER_FOOT))
drips = []
for k, (a, L) in enumerate([(-1.2, 0.024), (-2.5, 0.013), (-0.2, 0.034)]):
    d = ellipsoid('drip', 0.0019, 0.0019, L / 2, (SHAMASH_X + math.cos(a) * 0.0063, CUP_Y + math.sin(a) * 0.0063, TAPER_FOOT + SH_LEN - L / 2 - 0.0015), M['wax'])
    drips.append(d)
sh_wick = cylinder('shamash_wick', 0.0008, TAPER_FOOT + SH_LEN - 0.003, SH_WICK, (SHAMASH_X, CUP_Y), M['char'], segs=8)
SHAMASH_PARTS = [taper, sh_wick] + drips

# the cups: glass tumblers, olive oil, a floating wick on a little tin float
cups, oils = [], []
for i, x in enumerate(SLOT_X):
    c = lathe(
        f'cup_{i}',
        [(0.0, 0.0), (0.0150, 0.0), (0.0158, 0.002), (0.0162, 0.006), (0.0182, CUP_H - 0.001), (0.0178, CUP_H), (0.0164, CUP_H - 0.0008), (0.0145, 0.0085), (0.0125, 0.0065), (0.0, 0.0065)],
        M['cupglass'],
        loc=(x, CUP_Y, CUP_Z0),
        segs=40,
    )
    cups.append(c)
    oz = OIL_Z - CUP_Z0
    o = lathe(f'oil_{i}', [(0.0, 0.0066), (0.0125, 0.0066), (0.0145, 0.0087), (0.0146 + 0.0034 * (oz - 0.009) / (CUP_H - 0.009), oz), (0.0, oz)], M['oil'], loc=(x, CUP_Y, CUP_Z0), segs=40)
    fl_ = cylinder(f'float_{i}', 0.0075, OIL_Z - 0.0004, OIL_Z + 0.0008, (x, CUP_Y), M['tin'], segs=24)
    wk = cylinder(f'wick_{i}', 0.0011, OIL_Z - 0.006, FLAME_Z - 0.0015, (x, CUP_Y), M['wick'], segs=8)
    wt = cylinder(f'wicktip_{i}', 0.0012, FLAME_Z - 0.0015, FLAME_Z, (x, CUP_Y), M['char'], segs=8)
    oils.append([o, fl_, wk, wt])

# the oil, in a small glass cruet with a cork, at the left of the sill
BOTTLE = (-0.312, 0.33)
lathe('bottle', [(0.0, 0.0), (0.024, 0.0), (0.0265, 0.004), (0.0272, 0.012), (0.0268, 0.060), (0.022, 0.078), (0.011, 0.094), (0.0085, 0.104), (0.0085, 0.128), (0.0102, 0.131), (0.0102, 0.134), (0.0072, 0.134), (0.0072, 0.104), (0.0094, 0.094), (0.0205, 0.078), (0.0250, 0.060), (0.0252, 0.012), (0.0225, 0.006), (0.0, 0.006)], M['cupglass'], loc=(BOTTLE[0], BOTTLE[1], 0.0), segs=48)
lathe('bottle_oil', [(0.0, 0.0062), (0.0224, 0.0062), (0.0250, 0.012), (0.0249, 0.052), (0.0, 0.052)], M['oil'], loc=(BOTTLE[0], BOTTLE[1], 0.0), segs=48)
lathe('cork', [(0.0, 0.0), (0.0074, 0.0), (0.0078, 0.024), (0.0, 0.024)], M['cork'], loc=(BOTTLE[0], BOTTLE[1], 0.118), segs=24)

# ---------------------------------------------------------------- the flames: lights, and shapes for reflections

flames = []  # (name, light object, shape object, foot point, height)


def flame(name, x, y, z_foot, h, r):
    ld = bpy.data.lights.new(name, 'POINT')
    ld.energy = 0.22 * (h / OIL_FLAME_H) ** 1.5
    ld.shadow_soft_size = r * 0.9
    ld.color = (1.0, 0.62, 0.30)
    lo = bpy.data.objects.new(name, ld)
    lo.location = (x, y, z_foot + h * 0.38)
    bpy.context.collection.objects.link(lo)
    # the flame's shape: emissive, seen by the camera only in the beauty pass, and in glass and brass always
    sh = ellipsoid(name + '_shape', r, r, h / 2, (x, y, z_foot + h / 2), M['flame'])
    sh.visible_diffuse = False
    sh.visible_shadow = False
    sh.visible_volume_scatter = False
    flames.append((name, lo, sh, Vector((x, y, z_foot)), h))
    return lo, sh


for i, x in enumerate(SLOT_X):
    flame(f'light_{i}', x, CUP_Y, FLAME_Z, OIL_FLAME_H, 0.0042)
flame('light_s', SHAMASH_X, CUP_Y, SH_WICK, SH_FLAME_H, 0.0048)

# the night: a street lamp on the house opposite, just out of sight below, lights its stones from beneath
lamp_d = bpy.data.lights.new('lamp', 'POINT')
lamp_d.energy = 110
lamp_d.shadow_soft_size = 0.06
lamp_d.color = (1.0, 0.74, 0.48)
lamp = bpy.data.objects.new('lamp', lamp_d)
lamp.location = (1.75, OPP_Y - 0.32, -0.95)
bpy.context.collection.objects.link(lamp)

win_d = bpy.data.lights.new('window', 'AREA')
win_d.shape = 'RECTANGLE'
win_d.size = OWIN[1] - OWIN[0]
win_d.size_y = OWIN[3] - OWIN[2]
win_d.energy = 6
win_d.color = (1.0, 0.62, 0.34)
win_l = bpy.data.objects.new('window_light', win_d)
win_l.location = ((OWIN[0] + OWIN[1]) / 2, OPP_Y + 0.15, (OWIN[2] + OWIN[3]) / 2)
win_l.rotation_euler = (math.radians(90), 0, 0)  # facing -y, out into the alley
bpy.context.collection.objects.link(win_l)

# the room's own light, behind us: a lamp turned low (so the oil in the cups shows before the lighting)
room_d = bpy.data.lights.new('room', 'AREA')
room_d.shape = 'DISK'
room_d.size = 0.9
room_d.energy = 8
room_d.color = (1.0, 0.80, 0.60)
room_l = bpy.data.objects.new('room_light', room_d)
room_l.location = (0.35, -1.9, 1.15)
room_l.rotation_euler = (Vector((0.0, 0.25, 0.05)) - room_l.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.collection.objects.link(room_l)
# not seen in the window's glass (a bright disc there would pull the eye)
room_l.visible_glossy = False

sun_d = bpy.data.lights.new('sun', 'SUN')
sun_d.energy = 3.0
sun_d.color = (1.0, 0.78, 0.55)
sun_d.angle = math.radians(1.0)
sun = bpy.data.objects.new('sun', sun_d)
# low in the west, from the right and behind us: it lights the house opposite's upper storey and the dome
sun.rotation_euler = (math.radians(90 - 14), 0, math.radians(150))
bpy.context.collection.objects.link(sun)

world = bpy.data.worlds.new('world')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']

# ---------------------------------------------------------------- the camera

cam_d = bpy.data.cameras.new('cam')
cam_d.lens = 30
cam_d.sensor_width = 36
cam_d.sensor_fit = 'HORIZONTAL'
cam = bpy.data.objects.new('cam', cam_d)
bpy.context.collection.objects.link(cam)
scene.camera = cam
CAM = Vector((0.0, -0.47, 0.21))
TARGET = Vector((0.0, 0.3, 0.19))
if args.closeup:
    CAM, TARGET = Vector((0.12, -0.12, 0.13)), Vector((0.06, CUP_Y, 0.05))
    cam_d.lens = 40
cam.location = CAM
cam.rotation_euler = (TARGET - CAM).to_track_quat('-Z', 'Y').to_euler()
cam_d.dof.use_dof = True
cam_d.dof.focus_distance = (Vector((0, CUP_Y, FLAME_Z)) - CAM).length
cam_d.dof.aperture_fstop = 3.2

# ---------------------------------------------------------------- passes


def set_world(color, strength):
    bg.inputs['Color'].default_value = (*color, 1)
    bg.inputs['Strength'].default_value = strength


def configure(p):
    """Visibility and lights for a pass"""
    full = p not in ('night_empty', 'day_empty')
    # a cup's light pass: only that cup holds oil, and the shamash's candle is not in its socket. The card
    # adds these lights over cups that may be empty tonight and while the shamash is carried away, so what
    # they light must be what is always there (a full cup's own glow comes with its own light)
    one = p.startswith('light_') and p != 'light_s'
    for i, grp in enumerate(oils):
        on = (p == f'light_{i}') if (one or p in ('light_s', 'window')) else full
        for o in grp:
            o.hide_render = not on
    for o in SHAMASH_PARTS:
        o.hide_render = not full or one or p == 'window'
    for name, lo, sh, _, _ in flames:
        on = p == name or p == 'beauty'
        # the shamash alone is lit by all the flames (wax shows its colour only in their light)
        lo.hide_render = not (on or p == 'shamash')
        sh.hide_render = not on
        sh.visible_camera = p == 'beauty'
    lamp.hide_render = p not in ('night_full', 'night_empty', 'beauty', 'shamash')
    win_l.hide_render = p not in ('window', 'beauty')
    room_l.hide_render = p not in ('night_full', 'night_empty', 'beauty', 'shamash')
    win_glow.data.materials[0] = M['window'] if p in ('window', 'beauty') else M['dark_window']
    sun.hide_render = p not in ('day_full', 'day_empty')
    if p.startswith('day'):
        set_world((0.42, 0.55, 0.80), 0.7)
    elif p.startswith('light') or p == 'window':
        set_world((0, 0, 0), 0.0)
    else:
        set_world((0.030, 0.050, 0.110), 1.2)
    # the shamash alone: everything else invisible to the camera (still casting light and shade)
    sprite = p == 'shamash'
    for o in bpy.data.objects:
        if o.type in ('MESH', 'CURVE') and not o.name.endswith('_shape'):
            o.visible_camera = (not sprite) or (o in SHAMASH_PARTS)


PASSES = ['night_full', 'night_empty', 'day_full', 'day_empty'] + [f'light_{i}' for i in range(8)] + ['light_s', 'window', 'shamash', 'beauty']
only = [p for p in args.only.split(',') if p] or (['beauty'] if args.preview else PASSES)

# where things are in the picture (pixels of the base, from the top left)
scene.render.resolution_x = round(W0 * args.scale)
scene.render.resolution_y = round(H0 * args.scale)
scene.render.resolution_percentage = 100
bpy.context.view_layer.update()


def px(p):
    v = world_to_camera_view(scene, cam, Vector(p))
    return [v.x * scene.render.resolution_x, (1 - v.y) * scene.render.resolution_y]


def bbox(pts):
    q = [px(p) for p in pts]
    return [min(p[0] for p in q), min(p[1] for p in q), max(p[0] for p in q), max(p[1] for p in q)]


info = {'size': [scene.render.resolution_x, scene.render.resolution_y], 'slots': []}
for name, lo, sh, foot, h in flames:
    a = px(foot)
    b = px(foot + Vector((0, 0, h)))
    c = px(foot + Vector((0.01, 0, 0)))
    # the flame's mirror image in the window's glass (a faint reflection)
    m = Vector((foot.x, 2 * (GLASS_Y + 0.003) - foot.y, foot.z))
    info['slots'].append({'name': name, 'foot': a, 'tip': b, 'pxPerCm': math.dist(a, c), 'mirror': px(m), 'mirrorTip': px(m + Vector((0, 0, h)))})
# the boxes of the picture each cup (with its oil) and the shamash candle occupy
for i, x in enumerate(SLOT_X):
    info['slots'][i]['box'] = bbox([(x + dx, CUP_Y + dy, z) for dx in (-0.021, 0.021) for dy in (-0.021, 0.021) for z in (CUP_Z0 - 0.002, CUP_Z0 + CUP_H + 0.003)])
info['slots'][8]['box'] = bbox([(SHAMASH_X + dx, CUP_Y + dy, z) for dx in (-0.01, 0.01) for dy in (-0.01, 0.01) for z in (SH_POST_TOP + 0.004, SH_WICK + 0.002)])
info['shamash'] = {'foot': px((SHAMASH_X, CUP_Y, TAPER_FOOT)), 'wick': px((SHAMASH_X, CUP_Y, SH_WICK)), 'rim': px((SHAMASH_X, CUP_Y - 0.0175, SH_SOCKET))}
info['window'] = bbox([(OWIN[0], OPP_Y, OWIN[2]), (OWIN[1], OPP_Y, OWIN[3])])
info['horizon'] = px((0, OPP_Y, OPP_TOP + 0.09))[1]
# the casement's middle stile, where the leaves meet: no reflection shows on it
info['stile'] = [px((-0.022, GLASS_Y, 0.1))[0], px((0.022, GLASS_Y, 0.1))[0]]
# the shamash's socket with its candle (what to cover while it is carried)
info['socket'] = bbox([(SHAMASH_X + dx, CUP_Y + dy, z) for dx in (-0.019, 0.019) for dy in (-0.019, 0.019) for z in (SH_POST_TOP - 0.002, SH_WICK + 0.004)])
with open(os.path.join(args.out, 'scene.json'), 'w') as f:
    json.dump(info, f, indent=1)

if args.blend:
    bpy.ops.wm.save_as_mainfile(filepath=args.blend)
if args.only == 'info':
    sys.exit(0)

for p in only:
    configure(p)
    light = p.startswith('light') or p == 'window'
    k = args.light_scale if light else 1.0
    scene.render.resolution_x = round(W0 * args.scale * k)
    scene.render.resolution_y = round(H0 * args.scale * k)
    cy.samples = (args.light_samples if light else args.samples) if not args.preview else 24
    cy.adaptive_threshold = 0.01 if not args.preview else 0.05
    scene.render.filepath = os.path.join(args.out, p + '.exr')
    bpy.ops.render.render(write_still=True)
    print('rendered', p, flush=True)
