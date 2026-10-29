import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { FRAME_STUDIO_SOURCE } from '../frameParameters.js';

/** Same source-disk wall projection, spatially integrated before compositing.
 * Binary rays alone leave visible horizontal terraces below the long frame.
 * Bake only their visibility into a floating-point target, then use Three's
 * separable contact-shadow filter. The model/print never enter the blur pass.
 * This remains an outer-silhouette approximation, not Cycles self-shadow/GI.
 */
export function createFrameContactShadow(studio) {
  const size = new THREE.Vector2(1.8, 1.1);
  const wallZ = FRAME_STUDIO_SOURCE.studioSurfaces.find(surface => surface.name === 'Studio_Backdrop').position[2];
  const target = new THREE.WebGLRenderTarget(1024, 626, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
  });
  const scratch = target.clone();
  const bakeScene = new THREE.Scene();
  const bakeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uFrameInverse: { value: new THREE.Matrix4() },
    uSoftness: { value: 1 },
    uWallSize: { value: size }, uWallZ: { value: wallZ },
    uLightPosition: { value: studio.lights.map(() => new THREE.Vector3()) },
    uLightRight: { value: studio.lights.map(() => new THREE.Vector3()) },
    uLightUp: { value: studio.lights.map(() => new THREE.Vector3()) },
    uLightWeight: { value: new THREE.Vector3() },
    uLightDirection: { value: studio.lights.map(() => new THREE.Vector3()) },
  };
  const visibility = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false, uniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform mat4 uFrameInverse;
      uniform float uSoftness, uWallZ;
      uniform vec3 uLightPosition[3], uLightRight[3], uLightUp[3];
      uniform vec3 uLightDirection[3];
      uniform vec3 uLightWeight;
      uniform vec2 uWallSize;
      varying vec2 vUv;
      float blocked(vec3 p, vec3 light) {
        vec3 d = light - p;
        vec3 invD = (step(vec3(0.0),d)*2.0-1.0) / max(abs(d), vec3(1e-6));
        vec3 a = (vec3(-.5,-.25,-.015) - p) * invD;
        vec3 b = (vec3(.5,.25,.015) - p) * invD;
        vec3 lo = min(a,b), hi = max(a,b);
        float nearT = max(max(lo.x,lo.y),lo.z);
        float farT = min(min(hi.x,hi.y),hi.z);
        return float(farT >= max(0.0,nearT) && nearT < 1.0 && farT > 0.0);
      }
      void main() {
        vec3 vWall = vec3((vUv-.5)*uWallSize, uWallZ);
        vec3 p = (uFrameInverse * vec4(vWall,1.0)).xyz;
        float occluded = 0.0, total = 0.0;
        for (int light = 0; light < 3; light++) {
          for (int i = 0; i < 128; i++) {
            // Fixed sunflower samples: no temporal noise or frame-dependent seed.
            float radius = sqrt((float(i)+.5)/128.0) * uSoftness;
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
        // Keep sub-8-bit visibility differences through both blur passes.
        gl_FragColor = vec4(vec3(amount),1.0);
      }`,
  });
  const horizontal = new THREE.ShaderMaterial({ ...HorizontalBlurShader,
    uniforms: THREE.UniformsUtils.clone(HorizontalBlurShader.uniforms),
    depthTest: false, depthWrite: false, toneMapped: false });
  const vertical = new THREE.ShaderMaterial({ ...VerticalBlurShader,
    uniforms: THREE.UniformsUtils.clone(VerticalBlurShader.uniforms),
    depthTest: false, depthWrite: false, toneMapped: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), visibility);
  bakeScene.add(quad);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uShadow: { value: target.texture }, uOpacity: { value: .3 },
      uBounds: { value: new THREE.Vector2(.68, .43) } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec2 vWall;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWall = world.xy;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uShadow;
      uniform float uOpacity;
      uniform vec2 uBounds;
      varying vec2 vUv;
      varying vec2 vWall;
      void main() {
        vec2 fade = 1.0-smoothstep(uBounds-vec2(.055),uBounds,abs(vWall));
        gl_FragColor = vec4(.24,.20,.15, texture2D(uShadow,vUv).r*uOpacity*fade.x*fade.y);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), material);
  mesh.name = 'Frame_SourceDisk_WallShadow';
  mesh.position.z = wallZ;
  let filterStep = 0, renders = 0, dirty = true, lastSignature = [];
  function update(root, parameters, camera) {
    root.updateMatrixWorld(true);
    uniforms.uFrameInverse.value.copy(root.matrixWorld).invert();
    material.uniforms.uOpacity.value = parameters.shadowOpacity;
    uniforms.uSoftness.value = parameters.shadowSoftness;
    material.uniforms.uBounds.value.set(camera.userData.frameHalfSize.x*.97,camera.userData.frameHalfSize.y*.97);
    // World-space filtering stays consistent at every desktop resolution/DPR.
    filterStep = .0016 * Math.sqrt(parameters.shadowSoftness);
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
    const signature = [parameters.shadowSoftness, ...root.matrixWorld.elements,
      ...uniforms.uLightWeight.value.toArray(),
      ...['uLightPosition', 'uLightRight', 'uLightUp', 'uLightDirection']
        .flatMap(key => uniforms[key].value.flatMap(vector => vector.toArray()))];
    if (signature.some((value, index) => value !== lastSignature[index])) dirty = true;
    lastSignature = signature;
  }
  function render(renderer) {
    if (!dirty || material.uniforms.uOpacity.value === 0) return;
    const previous = renderer.getRenderTarget();
    renderer.setScissorTest(false);
    try {
      quad.material = visibility;
      renderer.setRenderTarget(target);
      renderer.render(bakeScene, bakeCamera);
      // Same two-pass + small cleanup pass as Three's contact-shadow example.
      for (const scale of [1, .4]) {
        quad.material = horizontal;
        horizontal.uniforms.tDiffuse.value = target.texture;
        horizontal.uniforms.h.value = filterStep*scale/size.x;
        renderer.setRenderTarget(scratch);
        renderer.render(bakeScene, bakeCamera);
        quad.material = vertical;
        vertical.uniforms.tDiffuse.value = scratch.texture;
        vertical.uniforms.v.value = filterStep*scale/size.y;
        renderer.setRenderTarget(target);
        renderer.render(bakeScene, bakeCamera);
      }
      renders++; dirty = false;
    } finally { renderer.setRenderTarget(previous); }
  }
  return { mesh, update, render,
    getDiagnostics() { return { method: 'Source-disk visibility with separable spatial filtering',
      samplesPerDisk: 128, targetSize: [target.width, target.height], targetType: 'half-float',
      filterStepM: filterStep, filterPasses: 4, renders, cached: !dirty, temporalNoise: false }; },
    dispose() {
      target.dispose(); scratch.dispose();
      visibility.dispose(); horizontal.dispose(); vertical.dispose();
      quad.geometry.dispose(); bakeScene.clear();
      mesh.geometry.dispose(); material.dispose();
    },
  };
}
