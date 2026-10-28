import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

/** Source Blender softboxes, converted from X/Z/-Y into glTF's X/Y/+Z.
 * Emissive radiance = power / (disk area * PI). Unlike a hemisphere light,
 * RectAreaLight supplies distance-aware diffuse + broad specular illumination;
 * The user-supplied full-range EXR supplies the frame's environment reflections.
 */
export function createFrameStudio(renderer) {
  const softboxes = [
    { name: 'Source_Key', position: [-.65, 1.05, .95], watts: 18, diameter: .85, color: [1, .96, .90] },
    { name: 'Source_Fill', position: [.75, .35, .65], watts: 8, diameter: .80, color: [.90, .95, 1] },
    { name: 'Source_Rim', position: [.55, .75, -.025], watts: 8.5, diameter: .50, color: [1, .96, .89] },
  ];
  RectAreaLightUniformsLib.init();
  const lights = softboxes.map(box => {
    const radiance = box.watts / (Math.PI * (box.diameter / 2) ** 2 * Math.PI);
    // Equal-area square: the official rectangular emitter approximates a disk.
    const side = box.diameter * Math.sqrt(Math.PI) / 2;
    const light = new THREE.RectAreaLight(new THREE.Color().setRGB(...box.color), radiance, side, side);
    light.name = box.name;
    light.position.fromArray(box.position);
    light.lookAt(0, 0, 0);
    return light;
  });
  let environment = null, disposed = false;
  const source = { url: '/environments/citrus-orchard-road-4k.exr', loaded: false, width: 0, height: 0, colorSpace: 'srgb-linear' };
  const ready = new EXRLoader().setDataType(THREE.HalfFloatType).loadAsync(source.url).then(texture => {
    if (disposed) { texture.dispose(); return null; }
    source.width = texture.image.width; source.height = texture.image.height;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    try { environment = pmrem.fromEquirectangular(texture); }
    finally { texture.dispose(); pmrem.dispose(); }
    source.loaded = true;
    return environment.texture;
  });
  return { ready, source, lights, softboxes, dispose() { disposed = true; environment?.dispose(); } };
}
