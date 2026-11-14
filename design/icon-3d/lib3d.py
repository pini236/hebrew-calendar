"""Small helpers for building the icon scenes in Blender (bpy as a module)."""
import math
import bmesh
import bpy
from mathutils import Vector

FONT_DIR = __import__('os').environ.get('ICON_FONT_DIR', 'fonts')


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'
    scn.cycles.device = 'CPU'
    scn.render.resolution_x = scn.render.resolution_y = 1024
    scn.render.film_transparent = False
    scn.view_settings.view_transform = 'AgX'
    try:
        scn.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    world = bpy.data.worlds.new('W')
    scn.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.004, 0.006, 0.02, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    return scn


def mat(name, color, metallic=0.0, rough=0.4, coat=0.0, coat_rough=0.05, emission=None, emit_strength=0.0, aniso=0.0, specular=0.5, transmission=0.0, ior=1.45):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = coat_rough
    b.inputs['Anisotropic'].default_value = aniso
    b.inputs['Specular IOR Level'].default_value = specular
    b.inputs['Transmission Weight'].default_value = transmission
    b.inputs['IOR'].default_value = ior
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = emit_strength
    return m


def add_noise_bump(m, scale=60.0, strength=0.08, stretch=(1, 1, 1)):
    """Fine surface texture (brushed / hammered metal, paper grain)."""
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = stretch
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 8
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def link(obj, m):
    obj.data.materials.clear()
    obj.data.materials.append(m)
    return obj


def bevel(obj, width=0.01, segments=4, angle=40):
    mod = obj.modifiers.new('bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    mod.harden_normals = False
    return mod


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True
    try:
        obj.data.set_sharp_from_angle(angle=math.radians(35))
    except Exception:
        pass


def annulus(name, r_in, r_out, z0, z1, seg=256):
    """A flat ring (washer) between two radii and two heights."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for r, z in ((r_out, z0), (r_out, z1), (r_in, z1), (r_in, z0)):
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)])
    for a in range(4):
        A, B = rings[a], rings[(a + 1) % 4]
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((A[i], A[j], B[j], B[i]))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.mesh.select_all(action='DESELECT') if bpy.context.mode == 'EDIT_MESH' else None
    me.update()
    recalc(ob)
    return ob


def recalc(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()


def disc(name, r, z0, z1, seg=256):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=z1 - z0, location=(0, 0, (z0 + z1) / 2))
    ob = bpy.context.active_object
    ob.name = name
    return ob


def text(name, body, size, extrude, font='frank-900', align='CENTER', bevel_depth=0.0, rtl=True, valign='CENTER'):
    """Hebrew text as a curve object. Blender has no RTL shaping, so the string is reversed."""
    fnt = bpy.data.fonts.load(f'{FONT_DIR}/{font}.ttf', check_existing=True)
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body[::-1] if rtl else body
    cu.font = fnt
    cu.size = size
    cu.extrude = extrude
    cu.bevel_depth = bevel_depth
    cu.bevel_resolution = 4
    cu.align_x = align
    cu.align_y = valign
    cu.resolution_u = 24
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    return ob


def area_light(name, loc, target=(0, 0, 0), power=500, size=2.0, color=(1, 1, 1), shape='DISK'):
    li = bpy.data.lights.new(name, 'AREA')
    li.energy = power
    li.size = size
    li.shape = shape
    li.color = color
    ob = bpy.data.objects.new(name, li)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    look_at(ob, target)
    return ob


def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def camera(loc, target=(0, 0, 0), lens=85, ortho=None):
    cam = bpy.data.cameras.new('cam')
    cam.lens = lens
    if ortho:
        cam.type = 'ORTHO'
        cam.ortho_scale = ortho
    ob = bpy.data.objects.new('cam', cam)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    look_at(ob, target)
    bpy.context.scene.camera = ob
    return ob


def softbox(name, loc, size, strength=4.0, color=(1, 1, 1), target=(0, 0, 0)):
    """A glowing plane only seen in reflections: gives metals their highlights."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (size[0], size[1], 1)
    look_at(ob, target)
    ob.rotation_euler.rotate_axis('X', math.pi)  # face the target
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs[0].default_value = (*color, 1)
    em.inputs[1].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])
    link(ob, m)
    ob.visible_camera = False
    ob.visible_shadow = False
    ob.visible_diffuse = False
    return ob


def backdrop(colors, z=-0.5, size=12, radius=3.2, center=(0, 0.3)):
    """Large plane behind everything with a radial colour gradient (receives shadows)."""
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    ob = bpy.context.active_object
    ob.name = 'backdrop'
    m = bpy.data.materials.new('backdrop')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.9
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Location'].default_value = (-center[0] / radius, -center[1] / radius, 0)
    mp.inputs['Scale'].default_value = (1 / radius, 1 / radius, 1)
    gr = nt.nodes.new('ShaderNodeTexGradient')
    gr.gradient_type = 'SPHERICAL'
    cr = nt.nodes.new('ShaderNodeValToRGB')
    els = cr.color_ramp.elements
    els[0].position = 0.0
    els[0].color = (*colors[0], 1)
    els[1].position = 1.0
    els[1].color = (*colors[-1], 1)
    for pos, col in colors[1:-1]:
        e = els.new(pos)
        e.color = (*col, 1)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], gr.inputs['Vector'])
    nt.links.new(gr.outputs['Fac'], cr.inputs['Fac'])
    nt.links.new(cr.outputs['Color'], b.inputs['Base Color'])
    link(ob, m)
    return ob


def srgb(h):
    """'#rrggbb' -> linear RGB tuple."""
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def render(path, samples=128):
    scn = bpy.context.scene
    scn.cycles.samples = samples
    scn.cycles.use_denoising = True
    scn.render.filepath = path
    scn.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)


def bloom(threshold=0.9, size=7, mix=0.0, strength=1.0):
    """Lens bloom on bright areas (compositor Glare / Fog Glow)."""
    scn = bpy.context.scene
    scn.use_nodes = True
    tree = scn.node_tree
    tree.nodes.clear()
    rl = tree.nodes.new('CompositorNodeRLayers')
    gl = tree.nodes.new('CompositorNodeGlare')
    comp = tree.nodes.new('CompositorNodeComposite')
    for attr, val in (('glare_type', 'FOG_GLOW'), ('threshold', threshold), ('size', size), ('mix', mix), ('quality', 'HIGH')):
        try:
            setattr(gl, attr, val)
        except Exception:
            pass
    for name, val in (('Threshold', threshold), ('Size', size / 9), ('Strength', strength)):
        if name in gl.inputs:
            try:
                gl.inputs[name].default_value = val
            except Exception:
                pass
    tree.links.new(rl.outputs['Image'], gl.inputs['Image'])
    tree.links.new(gl.outputs['Image'], comp.inputs['Image'])


def camera_up(loc, target=(0, 0, 0), lens=85, up=(0, 1, 0)):
    """Camera that keeps world `up` pointing up in the frame (no roll)."""
    from mathutils import Matrix
    cam = bpy.data.cameras.new('cam')
    cam.lens = lens
    ob = bpy.data.objects.new('cam', cam)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    f = (Vector(target) - Vector(loc)).normalized()
    r = f.cross(Vector(up)).normalized()
    u = r.cross(f).normalized()
    m = Matrix((r, u, -f)).transposed()
    ob.rotation_euler = m.to_euler()
    bpy.context.scene.camera = ob
    return ob
