import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { FRAME_DEFAULTS, FRAME_ENVIRONMENT_URL, FRAME_STUDIO_SOURCE } from '../frameParameters.js';

/** Three disk emitters with the original Blender transforms and radiometric power.
 * FrameDisplay adapts the official LTC integral to 32 circular boundary segments.
 * Source world radiance and the user's HDRI are separately adjustable.
 */
export function createFrameStudio(renderer) {
  RectAreaLightUniformsLib.init();
  const conversion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  // Blender XYZ Euler convention corresponds to Three's intrinsic ZYX order.
  const euler = new THREE.Euler(0, 0, 0, 'ZYX');
  const lights = FRAME_STUDIO_SOURCE.lights.map(spec => {
    const light = new THREE.RectAreaLight();
    light.name = spec.name;
    light.userData.frameDisk = true;
    return light;
  });
  const sourceWorld = FRAME_STUDIO_SOURCE.world.nodes.find(node => node.type === 'BACKGROUND').inputs.Color;
  const uniforms = { world: { value: new THREE.Vector3() }, exposure: { value: 1 } };
  let settings = FRAME_DEFAULTS, environment = null, disposed = false;
  const softboxes = [];
  function configure(next) {
    settings = next;
    uniforms.world.value.fromArray(sourceWorld).multiplyScalar(next.worldStrength);
    uniforms.exposure.value = 2 ** (next.exposure - FRAME_STUDIO_SOURCE.view.exposure);
    softboxes.length = 0;
    for (const [i, light] of lights.entries()) {
      const p = next.lights[i];
      light.position.set(p.position[0], p.position[2], -p.position[1]);
      euler.set(...p.rotation.map(THREE.MathUtils.degToRad), 'ZYX');
      light.quaternion.setFromEuler(euler).premultiply(conversion);
      light.width = light.height = p.diameter;
      light.color.setRGB(...p.color, THREE.LinearSRGBColorSpace);
      // W/(m²·sr), relative scene-linear radiance, not a lumen conversion.
      light.intensity = p.enabled ? p.watts / (Math.PI * (p.diameter / 2) ** 2 * Math.PI) : 0;
      softboxes.push({ name: light.name, shape: 'DISK', diameter: p.diameter, watts: p.watts,
        enabled: p.enabled, intensity: light.intensity, position: light.position.toArray(),
        quaternion: light.quaternion.toArray(), direction: new THREE.Vector3(0, 0, -1).applyQuaternion(light.quaternion).toArray(),
        color: [...p.color], sourcePosition: [...p.position], sourceRotationDegrees: [...p.rotation] });
    }
  }
  configure(FRAME_DEFAULTS);
  const source = { url: FRAME_ENVIRONMENT_URL, loaded: false, width: 0, height: 0, colorSpace: 'srgb-linear' };
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
  return { ready, source, lights, softboxes, uniforms, configure,
    dispose() { disposed = true; environment?.dispose(); },
    getDiagnostics() { return { environmentIntensity: settings.hdriEnabled ? settings.hdriIntensity : 0,
      worldStrength: settings.worldStrength, worldColor: sourceWorld.slice(0, 3),
      displayExposureEV: settings.exposure, actualLights: lights.length, softboxes,
      source: FRAME_STUDIO_SOURCE.source, diskSegments: 32 }; },
  };
}
