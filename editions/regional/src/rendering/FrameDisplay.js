import * as THREE from 'three';
import { patchFrameLighting } from './FrameDiskLight.js';

/** Original Blender AgX + Medium High Contrast + exposure 0.4.
 * The display transform is baked from the actual .blend, not approximated by
 * recoloring materials. Only frame PBR materials use it; gallery shaders do not.
 */
export function createFrameDisplay(studioUniforms) {
  let texture = null, disposed = false;
  const ready = new THREE.TextureLoader().loadAsync('/textures/frame-agx-medium-high-lut.png').then(lut => {
    if (disposed) { lut.dispose(); return null; }
    texture = lut;
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  });
  return {
    ready,
    apply(material) {
      if (!material.isMeshStandardMaterial || material.userData.frameDisplay) return;
      material.userData.frameDisplay = true;
      material.onBeforeCompile = shader => {
        shader.uniforms.uFrameDisplayLut = { value: texture };
        shader.uniforms.uFrameWorldRadiance = studioUniforms.world;
        shader.uniforms.uFrameExposure = studioUniforms.exposure;
        shader.fragmentShader = `uniform sampler2D uFrameDisplayLut;
          uniform vec3 uFrameWorldRadiance;
          uniform float uFrameExposure;
          vec3 frameDisplay(vec3 radiance) {
            vec3 p = clamp((log2(max(radiance, vec3(0.000244140625))) + 12.0) / 18.0, 0.0, 1.0) * 63.0;
            float g = floor(p.g);
            float gNext = min(g + 1.0, 63.0);
            vec2 uv0 = vec2((p.r + 0.5 + g * 64.0) / 4096.0, (p.b + 0.5) / 64.0);
            vec2 uv1 = vec2((p.r + 0.5 + gNext * 64.0) / 4096.0, (p.b + 0.5) / 64.0);
            return mix(texture2D(uFrameDisplayLut, uv0).rgb, texture2D(uFrameDisplayLut, uv1).rgb, fract(p.g));
          }
        ` + patchFrameLighting(shader.fragmentShader)
          .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = frameDisplay(gl_FragColor.rgb * uFrameExposure);')
          .replace('#include <colorspace_fragment>', '');
      };
      material.customProgramCacheKey = () => 'frame-source-agx-disk32-stable-v2';
      material.needsUpdate = true;
    },
    dispose() { disposed = true; texture?.dispose(); },
  };
}
