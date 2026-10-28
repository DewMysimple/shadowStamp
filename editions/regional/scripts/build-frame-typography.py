"""Run with F:/Blender/blender.exe -b --factory-startup --python this.py.

Imports the supplied GLB unchanged as the registration reference. The new editable
Text objects and their exported mesh copies share its meter-based coordinates.
The supplied Modeling directory is strictly read-only.
"""
import bpy
import hashlib
import json
import math
import shutil
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('C:/Users/Administrator/Desktop/Modeling/相框/Models/ArtFrame_2to1')
MODELS = ROOT / 'public/models'
EDITABLE = ROOT / 'assets/blender'
EVIDENCE = ROOT / 'artifacts/art-frame'
for directory in (MODELS, EDITABLE, EVIDENCE):
    directory.mkdir(parents=True, exist_ok=True)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

source_hashes = {name: digest(SOURCE / name) for name in ('ArtFrame_2to1.glb', 'ArtFrame_2to1.blend')}
shutil.copy2(SOURCE / 'ArtFrame_2to1.glb', MODELS / 'art-frame-original.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(MODELS / 'art-frame-original.glb'))
reference_objects = list(bpy.context.scene.objects)
old_text = []
for obj in reference_objects:
    if obj.name.startswith('Text_'):
        obj.hide_render = True
        obj.hide_set(True)
        old_text.append(obj.name)

cn_font = bpy.data.fonts.load('C:/Windows/Fonts/simhei.ttf')
en_font = bpy.data.fonts.load('C:/Windows/Fonts/arial.ttf')

def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    # Hex values are converted to scene-linear, as in the supplied PBR model.
    def linear(v):
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    rgb = [int(color[i:i+2], 16)/255 for i in (1, 3, 5)]
    bsdf.inputs['Base Color'].default_value = (*map(linear, rgb), 1)
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Roughness'].default_value = 0.78
    mat.diffuse_color = (*map(linear, rgb), 1)
    return mat

title_mat = material('Typography_WarmUmber', '#4f483e')
category_mat = material('Typography_WarmLimestone', '#453e34')
text_collection = bpy.data.collections.new('05_Interactive_Typography_EDITABLE')
bpy.context.scene.collection.children.link(text_collection)
specs = [
    # name, body, world-X center/right, world-Z center, target glyph height, max width, alignment
    ('Title_Chinese', '狮行万里·从岭南到世界', .435, .200, .0105, .30, 'RIGHT'),
    ('Title_English', 'FROM LINGNAN TO THE WORLD', .435, .181, .0065, .28, 'RIGHT'),
    ('Category_Guangdong', '广东', -.285, -.170, .018, .10, 'CENTER'),
    ('Category_China', '中国', 0, -.170, .018, .10, 'CENTER'),
    ('Category_World', '世界', .285, -.170, .018, .10, 'CENTER'),
]
texts = []
for name, body, x, z, target_height, max_width, align in specs:
    curve = bpy.data.curves.new(name + '_EditableText', 'FONT')
    curve.body = body
    curve.font = en_font if name == 'Title_English' else cn_font
    curve.align_x = align
    curve.size = .05
    curve.space_character = 1.12 if name.startswith('Category') else 1.04
    curve.resolution_u = 10
    # Scale glyph size first, preserving a physically meaningful extrusion.
    obj = bpy.data.objects.new(name, curve)
    text_collection.objects.link(obj)
    obj.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.view_layer.update()
    initial_bounds = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    glyph_height = max(p.z for p in initial_bounds) - min(p.z for p in initial_bounds)
    glyph_width = max(p.x for p in initial_bounds) - min(p.x for p in initial_bounds)
    scale = min(target_height/max(glyph_height, 1e-6), max_width/max(glyph_width, 1e-6))
    curve.size *= scale
    curve.extrude = .0006 if name.startswith('Category') else .00012
    curve.bevel_depth = .00012 if name.startswith('Category') else .00004
    curve.bevel_resolution = 3
    obj.location = (x, -.0118 if name.startswith('Category') else -.0112, z)
    bpy.context.view_layer.update()
    bounds = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    obj.location.z += z - (min(p.z for p in bounds) + max(p.z for p in bounds))/2
    curve.materials.append(category_mat if name.startswith('Category') else title_mat)
    obj['label'] = body
    obj['category'] = {'Category_Guangdong':'guangdong','Category_China':'china','Category_World':'world'}.get(name, '')
    obj['front_normal_blender'] = '-Y'
    obj['front_normal_gltf'] = '+Z'
    texts.append(obj)

# Validate each requested character produces nontrivial, different outline geometry.
glyphs = []
for char in sorted(set(''.join(s[1] for s in specs).replace(' ', ''))):
    curve = bpy.data.curves.new('GlyphCheck', 'FONT')
    curve.body = char
    curve.font = cn_font if ord(char) > 127 else en_font
    curve.extrude = .01
    obj = bpy.data.objects.new('GlyphCheck', curve)
    text_collection.objects.link(obj)
    bpy.context.view_layer.update()
    mesh = obj.to_mesh()
    glyphs.append(dict(character=char, vertices=len(mesh.vertices), faces=len(mesh.polygons)))
    assert len(mesh.vertices) > 0 and len(mesh.polygons) > 0, f'Missing glyph: {char}'
    obj.to_mesh_clear()
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.curves.remove(curve)

bpy.ops.object.select_all(action='DESELECT')
exports = []
objects_report = []
for obj in texts:
    bpy.context.view_layer.update()
    bounds = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    objects_report.append(dict(name=obj.name, body=obj.data.body, font=obj.data.font.filepath,
        dimensions=list(obj.dimensions), bounds_blender=[list(map(lambda i:min(v[i] for v in bounds),range(3))),list(map(lambda i:max(v[i] for v in bounds),range(3)))],
        world_dimensions_m=[max(p[i] for p in bounds)-min(p[i] for p in bounds) for i in range(3)],
        extrusion=obj.data.extrude, bevel=obj.data.bevel_depth, category=obj.get('category')))
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    export = bpy.data.objects.new(obj.name + '_Export', mesh)
    text_collection.objects.link(export)
    export.matrix_world = obj.matrix_world.copy()
    original_name = obj.name
    obj.name = original_name + '_Editable'
    export.name = original_name
    export['label'] = obj['label']
    export['category'] = obj['category']
    export.select_set(True)
    exports.append(export)

bpy.ops.export_scene.gltf(filepath=str(MODELS / 'frame-typography.glb'), export_format='GLB',
    use_selection=True, export_extras=True, export_yup=True, export_apply=True)
for export in exports:
    original_name = export.name
    bpy.data.objects.remove(export, do_unlink=True)
    bpy.data.objects[original_name + '_Editable'].name = original_name

# Pack baked source maps and both fonts; retain the original frame as reference.
bpy.ops.file.pack_all()
# A reusable editable studio, with the same user HDRI and source camera/look.
# Leave this large EXR linked to the project's local public asset, not re-packed.
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = .4
world = bpy.data.worlds.new('Frame | user orchard HDRI')
world.use_nodes = True
nt = world.node_tree
env = nt.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(str(ROOT / 'public/environments/citrus-orchard-road-4k.exr'))
env.image.filepath = '//../../public/environments/citrus-orchard-road-4k.exr'
nt.links.new(env.outputs['Color'], nt.nodes.get('Background').inputs['Color'])
nt.nodes.get('Background').inputs['Strength'].default_value = .2
scene.world = world
for name, loc, energy, size, color in [
    ('Studio_Key', (-.65, -.95, 1.05), 18, .85, (1, .96, .90)),
    ('Studio_Fill', (.75, -.65, .35), 8, .80, (.90, .95, 1)),
    ('Studio_Rim', (.55, .025, .75), 8.5, .50, (1, .96, .89)),
]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy; data.shape = 'DISK'; data.size = size; data.color = color
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector((0, 0, 0))-obj.location).to_track_quat('-Z', 'Y').to_euler()
camera_data = bpy.data.cameras.new('Frame_Camera')
camera_data.type = 'ORTHO'; camera_data.ortho_scale = 1.14
camera = bpy.data.objects.new('Frame_Camera', camera_data); scene.collection.objects.link(camera)
camera.location = (0, -2, 0)
camera.rotation_euler = (Vector((0, 0, 0))-camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = camera
scene.render.resolution_x = 1200; scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(EDITABLE / 'FrameTypography.blend'), compress=True, relative_remap=False)
assert source_hashes == {name: digest(SOURCE / name) for name in source_hashes}, 'Source was modified'
report = dict(blender=bpy.app.version_string, executable=bpy.app.binary_path,
    source_hashes=source_hashes, source_unchanged=True,
    original_glb_sha256=digest(MODELS / 'art-frame-original.glb'),
    coordinates='Blender X right / Z up / front -Y; glTF X right / Y up / front +Z; meters; common origin, no transform offsets',
    hidden_original_text=old_text, objects=objects_report, glyphs=glyphs,
    output_blend=str(EDITABLE / 'FrameTypography.blend'), output_glb=str(MODELS / 'frame-typography.glb'))
(EVIDENCE / 'model-build.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print('FRAME_TYPOGRAPHY_BUILT', len(texts), 'objects;', len(glyphs), 'glyphs verified')
