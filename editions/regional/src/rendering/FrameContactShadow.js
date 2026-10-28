import * as THREE from 'three';
import { FRAME_STUDIO_SOURCE } from '../frameParameters.js';

/** Deterministic soft wall shadow, sampled from the same three source disks.
 * The opaque frame is a closed 1×.5×.03 m silhouette. Ray/box tests avoid a
 * low-resolution self-shadow map on the print's 20-micron trim clearances.
 * This is a wall projection; it does not pretend to reproduce Cycles GI.
 */
export function createFrameContactShadow(studio) {
  const uniforms = {
    uFrameInverse: { value: new THREE.Matrix4() },
    uOpacity: { value: .3 }, uSoftness: { value: 1 },
    uLightPosition: { value: studio.lights.map(() => new THREE.Vector3()) },
    uLightRight: { value: studio.lights.map(() => new THREE.Vector3()) },
    uLightUp: { value: studio.lights.map(() => new THREE.Vector3()) },
    uLightWeight: { value: new THREE.Vector3() },
    uLightDirection: { value: studio.lights.map(() => new THREE.Vector3()) },
    uBounds: { value: new THREE.Vector2(.68,.43) },
  };
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, uniforms,
    vertexShader: /* glsl */`
      varying vec3 vWall;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWall = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */`
      uniform mat4 uFrameInverse;
      uniform float uOpacity, uSoftness;
      uniform vec3 uLightPosition[3], uLightRight[3], uLightUp[3];
      uniform vec3 uLightDirection[3];
      uniform vec3 uLightWeight;
      uniform vec2 uBounds;
      varying vec3 vWall;
      float blocked(vec3 p, vec3 light) {
        vec3 d = light - p;
        vec3 invD = sign(d) / max(abs(d), vec3(1e-6));
        vec3 a = (vec3(-.5,-.25,-.015) - p) * invD;
        vec3 b = (vec3(.5,.25,.015) - p) * invD;
        vec3 lo = min(a,b), hi = max(a,b);
        float nearT = max(max(lo.x,lo.y),lo.z);
        float farT = min(min(hi.x,hi.y),hi.z);
        return float(farT >= max(0.0,nearT) && nearT < 1.0 && farT > 0.0);
      }
      void main() {
        vec3 p = (uFrameInverse * vec4(vWall,1.0)).xyz;
        float occluded = 0.0, total = 0.0;
        for (int light = 0; light < 3; light++) {
          for (int i = 0; i < 32; i++) {
            // Fixed sunflower samples: no temporal noise or frame-dependent seed.
            float radius = sqrt((float(i)+.5)/32.0) * uSoftness;
            float angle = float(i) * 2.399963229728653;
            vec3 samplePos = uLightPosition[light] + radius * (cos(angle)*uLightRight[light] + sin(angle)*uLightUp[light]);
            vec3 localLight = (uFrameInverse * vec4(samplePos,1.0)).xyz;
            vec3 toLight = samplePos-vWall;
            float distanceSquared = max(dot(toLight,toLight),1e-5);
            vec3 direction = toLight/sqrt(distanceSquared);
            float weight = uLightWeight[light] * max(direction.z,0.0) * max(dot(-direction,uLightDirection[light]),0.0)/distanceSquared;
            occluded += blocked(p,localLight)*weight;
            total += weight;
          }
        }
        float amount = occluded/max(total,1e-5);
        // Fade only the distant edge of the finite view, never a rectangular cut.
        vec2 fade = 1.0-smoothstep(uBounds-vec2(.055),uBounds,abs(vWall.xy));
        gl_FragColor = vec4(.24,.20,.15, amount*uOpacity*fade.x*fade.y);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), material);
  mesh.name = 'Frame_SourceDisk_WallShadow';
  // Behind every permitted tilt, including the 5° maximum on both axes.
  mesh.position.z = FRAME_STUDIO_SOURCE.studioSurfaces.find(surface=>surface.name==='Studio_Backdrop').position[2];
  function update(root, parameters, camera) {
    root.updateMatrixWorld(true);
    uniforms.uFrameInverse.value.copy(root.matrixWorld).invert();
    uniforms.uOpacity.value = parameters.shadowOpacity;
    uniforms.uSoftness.value = parameters.shadowSoftness;
    uniforms.uBounds.value.set(camera.userData.frameHalfSize.x*.97,camera.userData.frameHalfSize.y*.97);
    const weights = [];
    for (const [i, light] of studio.lights.entries()) {
      uniforms.uLightPosition.value[i].copy(light.position);
      uniforms.uLightRight.value[i].set(light.width/2,0,0).applyQuaternion(light.quaternion);
      uniforms.uLightUp.value[i].set(0,light.height/2,0).applyQuaternion(light.quaternion);
      uniforms.uLightDirection.value[i].set(0,0,-1).applyQuaternion(light.quaternion);
      const luminance = light.color.r*.2126 + light.color.g*.7152 + light.color.b*.0722;
      weights[i] = parameters.lights[i].enabled ? parameters.lights[i].watts*luminance : 0;
    }
    const total = Math.max(1e-6, weights.reduce((a,b)=>a+b,0));
    uniforms.uLightWeight.value.fromArray(weights.map(w=>w/total));
  }
  return { mesh, update, dispose() { mesh.geometry.dispose(); material.dispose(); } };
}
