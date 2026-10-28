
import bpy,json,sys
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1])
scene=bpy.context.scene
scene.render.resolution_x=1200;scene.render.resolution_y=700;scene.render.resolution_percentage=100
scene.cycles.samples=32
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences
 prefs.compute_device_type='OPTIX';prefs.get_devices()
 for d in prefs.devices:d.use=d.type=='OPTIX'
 scene.cycles.device='GPU'
except:scene.cycles.device='CPU'
scene.camera=bpy.data.objects['Camera_Front_Ortho']
scene.render.filepath=str(out/'blender-source-materials.png')
bpy.ops.render.render(write_still=True)
originals=list(bpy.data.objects)
for o in originals:
 if o.parent and o.parent.name=='ArtFrame_2to1':o.hide_render=True
bpy.ops.import_scene.gltf(filepath='C:/Users/Administrator/Desktop/Modeling/相框/Models/ArtFrame_2to1/ArtFrame_2to1.glb')
scene.render.filepath=str(out/'blender-glb-materials.png')
bpy.ops.render.render(write_still=True)
print('SOURCE_GLB_RENDER_COMPARE_DONE')
