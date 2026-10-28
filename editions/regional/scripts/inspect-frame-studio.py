"""Read the user's original .blend; export authoritative lighting transforms.

Run: blender -b SOURCE.blend --python inspect-frame-studio.py -- OUTPUT.json
Never saves or modifies SOURCE.blend.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Matrix, Vector

output = Path(sys.argv[sys.argv.index('--') + 1])
conversion = Matrix.Rotation(-math.pi / 2, 4, 'X')
scene = bpy.context.scene
lights = []
for obj in scene.objects:
    if obj.type != 'LIGHT':
        continue
    data = obj.data
    matrix = conversion @ obj.matrix_world
    rotation = matrix.to_quaternion()
    lights.append({
        'name': obj.name,
        'type': data.type,
        'shape': getattr(data, 'shape', None),
        'watts': data.energy,
        'exposure': getattr(data, 'exposure', 0),
        'normalize': getattr(data, 'normalize', None),
        'size': getattr(data, 'size', None),
        'sizeY': getattr(data, 'size_y', None),
        'spreadDegrees': math.degrees(getattr(data, 'spread', math.pi)),
        'color': list(data.color),
        'temperature': getattr(data, 'temperature', None),
        'useTemperature': getattr(data, 'use_temperature', None),
        'visible': not obj.hide_render,
        'sourcePosition': list(obj.matrix_world.translation),
        'sourceRotationDegrees': [math.degrees(v) for v in obj.matrix_world.to_euler('XYZ')],
        'position': list(matrix.translation),
        'quaternion': [rotation.x, rotation.y, rotation.z, rotation.w],
        'rotationDegrees': [math.degrees(v) for v in matrix.to_euler('XYZ')],
        'direction': list((matrix.to_3x3() @ Vector((0, 0, -1))).normalized()),
        'matrix': [list(row) for row in obj.matrix_world],
    })
world_nodes = []
if scene.world and scene.world.use_nodes:
    for node in scene.world.node_tree.nodes:
        values = {}
        for socket in node.inputs:
            if hasattr(socket, 'default_value'):
                v = socket.default_value
                values[socket.name] = v if isinstance(v, (str, int, float, bool)) else list(v)
        world_nodes.append({'type': node.type, 'name': node.name, 'inputs': values})
result = {
    'source': bpy.data.filepath,
    'blenderVersion': bpy.app.version_string,
    'unitScale': scene.unit_settings.scale_length,
    'renderEngine': scene.render.engine,
    'view': {'transform': scene.view_settings.view_transform,
             'look': scene.view_settings.look,
             'exposure': scene.view_settings.exposure,
             'gamma': scene.view_settings.gamma},
    'lights': lights,
    'world': {'color': list(scene.world.color), 'nodes': world_nodes},
    'camera': {'name': scene.camera.name, 'clipStart': scene.camera.data.clip_start,
               'clipEnd': scene.camera.data.clip_end, 'type': scene.camera.data.type},
    'studioSurfaces': [
        {'name': obj.name, 'sourcePosition': list(obj.matrix_world.translation),
         'position': list((conversion @ obj.matrix_world).translation)}
        for obj in scene.objects if obj.name in ('Studio_Backdrop', 'Studio_Floor')
    ],
}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print('FRAME_STUDIO_INSPECTED', str(output))
