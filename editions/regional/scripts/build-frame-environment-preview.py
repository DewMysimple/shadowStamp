"""Create a small view of the user's unchanged HDRI using the source display.
Run with the original .blend open in background mode; never saves the scene.
"""
import bpy
from pathlib import Path
root = Path(__file__).resolve().parents[1]
image = bpy.data.images.load(str(root / 'public/environments/citrus-orchard-road-4k.exr'), check_existing=False)
image.scale(512, 256)
bpy.context.scene.render.image_settings.file_format = 'PNG'
bpy.context.scene.render.image_settings.color_mode = 'RGB'
image.save_render(str(root / 'public/textures/frame-environment-preview.png'), scene=bpy.context.scene)
print('FRAME_ENVIRONMENT_PREVIEW_BUILT')
