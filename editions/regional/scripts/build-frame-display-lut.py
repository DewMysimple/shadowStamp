"""Bake the supplied Blender AgX display transform, including its contrast look.

Load ArtFrame_2to1.blend read-only, then run this script. RGB samples are stored
as data in a 64^3 LUT (R fastest, G horizontal tiles, B rows). No scene is saved.
"""
import bpy
import json
import numpy as np
from pathlib import Path

root = Path(__file__).resolve().parents[1]
size, low, high = 64, -12, 6
values = np.exp2(np.linspace(low, high, size, dtype=np.float32))
b, g, r = np.meshgrid(values, values, values, indexing='ij')
rgba = np.stack([r, g, b, np.ones_like(r)], axis=-1).reshape(-1)
image = bpy.data.images.new('Frame display transform calibration', width=size*size, height=size,
    alpha=True, float_buffer=True)
image.pixels.foreach_set(rgba)
scene = bpy.context.scene
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
target = root / 'public/textures/frame-agx-medium-high-lut.png'
target.parent.mkdir(parents=True, exist_ok=True)
image.save_render(str(target), scene=scene)
report = dict(size=size, minEV=low, maxEV=high, width=size*size, height=size,
    transform=scene.view_settings.view_transform, look=scene.view_settings.look,
    exposure=scene.view_settings.exposure, gamma=scene.view_settings.gamma,
    input='scene-linear Rec.709, logarithmically indexed', output='display-encoded sRGB; data texture; no second output conversion',
    source=bpy.data.filepath, source_saved=False)
(root/'artifacts/art-frame/display-transform.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('FRAME_DISPLAY_LUT_BUILT', report)
