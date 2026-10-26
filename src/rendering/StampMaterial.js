import * as THREE from 'three';
import { createSurfaceNormalTexture } from './SurfaceTexture.js';

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    // Extra transparent gutter lets out-of-focus alpha soften beyond the paper.
    vUv = (uv - 0.5) * 1.34 + 0.5;
    vec3 expanded = position;
    expanded.xy *= 1.34;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(expanded, 1.0);
  }
`;

// Original paper-light adapter. No pre-existing stamp shader was in the input.
// All state lives in uniforms: transitions never replace the material or texture.
const fragmentShader = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D uArtwork;
  uniform vec2 uPointer;
  uniform vec2 uSize;
  uniform float uActivity;
  uniform float uFoil;
  uniform float uOpacity;
  uniform float uBlur;
  uniform float uTime;
  uniform sampler2D uDappled;
  uniform sampler2D uSurfaceNormal;
  uniform float uLightModel;
  uniform vec3 uLightColor;
  uniform vec3 uShadowColor;
  uniform float uLightStrength;
  uniform float uLightContrast;
  uniform float uLightGrain;
  uniform float uSurfaceRelief;
  uniform float uSurfaceShine;
  uniform float uSurfaceRoughness;
  uniform float uSurfaceCoat;

  vec4 printSample(vec2 uv) {
    if (min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) > 1.0) return vec4(0.0);
    return texture2D(uArtwork, uv);
  }

  // Cook-Torrance reflection of the clear paper coating, without changing ink.
  vec3 ggxSpecular(vec3 normal, vec3 view, vec3 light, float roughness, vec3 f0) {
    vec3 halfDirection = normalize(view + light);
    float nv = max(dot(normal, view), 0.001);
    float nl = max(dot(normal, light), 0.001);
    float nh = max(dot(normal, halfDirection), 0.0);
    float vh = max(dot(view, halfDirection), 0.0);
    float alpha = max(roughness * roughness, 0.025);
    float alpha2 = alpha * alpha;
    float denominator = nh * nh * (alpha2 - 1.0) + 1.0;
    float distribution = alpha2 / max(3.14159265 * denominator * denominator, 0.00001);
    float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
    float geometry = nv / (nv * (1.0 - k) + k) * nl / (nl * (1.0 - k) + k);
    vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
    return fresnel * distribution * geometry / max(4.0 * nv * nl, 0.001);
  }

  vec4 artwork(vec2 uv) {
    vec4 outputColor = printSample(uv);
    if (uBlur >= 0.02) {
    vec4 result = vec4(0.0);
    float weights = 0.0;
    for (int i = 0; i < 48; i++) {
      float f = float(i);
      float angle = f * 2.39996323;
      float radius = sqrt((f + 0.5) / 48.0);
      vec2 offset = vec2(cos(angle), sin(angle)) * radius * uBlur * 2.1 / uSize;
      vec4 sampleColor = printSample(uv + offset);
      float weight = exp(-radius * radius * 3.5);
      result += vec4(sampleColor.rgb * sampleColor.a, sampleColor.a) * weight;
      weights += weight;
    }
    result /= weights;
      outputColor = vec4(result.rgb / max(result.a, 0.0001), result.a);
    }
    return outputColor;
  }

  vec3 projectedLight(vec3 ink) {
    vec2 p = (vUv - 0.5) * vec2(1.0, 1.27);
    vec2 light = (uPointer - 0.5) * vec2(1.0, 1.27);
    float lightBand = exp(-pow((p.x * 0.65 + p.y * 0.45 - light.x * 0.55 + light.y * 0.4) * 2.9, 2.0));
    float interior = smoothstep(0.065, 0.11, vUv.x) * smoothstep(0.065, 0.11, 1.0 - vUv.x);
    interior *= smoothstep(0.055, 0.095, vUv.y) * smoothstep(0.055, 0.095, 1.0 - vUv.y);
    float finish = uFoil * uActivity * interior;
    // Local stamp UV is essential: the optical pattern is printed onto the
    // hovered object and remains attached while it rotates, moves and scales.
    float field = texture2D(uDappled, clamp(vUv, 0.0, 1.0)).a;
    float shade = clamp((smoothstep(0.06, 0.94, field) - 0.5) * (uLightContrast / 0.26) + 0.5, 0.0, 1.0);
    float sun = 1.0 - shade;
    vec3 illumination = mix(uLightColor * vec3(1.075, 1.095, 1.183), 0.35 + uShadowColor * 0.65, shade);
    vec3 litInk = ink * illumination + sun * uLightColor * vec3(0.075, 0.048, 0.015);
    // Values above one deliberately strengthen the same light/shadow delta;
    // an intensity slider up to two must not flatten out at its midpoint.
    vec3 color = mix(ink, litInk, clamp(uActivity, 0.0, 1.0) * clamp(uLightStrength, 0.0, 2.0));
    color += vec3(1.0, 0.88, 0.64) * lightBand * finish * 0.012;
    return color;
  }

  vec3 reflectedLight(vec3 ink) {
    float activity = clamp(uActivity, 0.0, 1.0) * clamp(uLightStrength, 0.0, 2.0);
    vec3 color = ink;
    if (activity > 0.001 && uBlur < 0.02) {
      vec2 local = (vUv - 0.5) * vec2(1.0, 1.27);
      float lightDistance = length(local - (uPointer - 0.5) * vec2(0.8, 1.0));
      float softLight = exp(-lightDistance * lightDistance * 3.6);
      vec2 microNormal = texture2D(uSurfaceNormal, vUv).rg * 2.0 - 1.0;
      // This normal is independent of the artwork. Text, the C and printed
      // islands remain flat ink; only shallow paper texture catches the light.
      float localEtchWeight = 0.35 + 0.65 * softLight;
      vec3 normal = normalize(vec3(microNormal * uSurfaceRelief * 7.3 * localEtchWeight, 1.0));
      vec3 viewDirection = normalize(vec3(-local * 0.4, 1.65));
      vec3 lightDirection = normalize(vec3((uPointer - 0.5) * vec2(1.5, 1.9) + vec2(-0.18, 0.22), 0.85));
      float roughness = clamp(uSurfaceRoughness, 0.2, 1.0);
      float diffuseDelta = dot(normal, lightDirection) - lightDirection.z;
      vec3 baseSpecular = ggxSpecular(normal, viewDirection, lightDirection, roughness, vec3(0.04));
      vec3 flatBaseSpecular = ggxSpecular(vec3(0.0, 0.0, 1.0), viewDirection, lightDirection, roughness, vec3(0.04));
      float texelFootprint = max(length(dFdx(vUv * vec2(512.0, 640.0))), length(dFdy(vUv * vec2(512.0, 640.0))));
      float coatRoughness = clamp(0.2 + max(texelFootprint - 1.0, 0.0) * 0.075, 0.2, 0.42);
      vec3 coatSpecular = ggxSpecular(normal, viewDirection, lightDirection, coatRoughness, vec3(0.04));
      vec3 flatCoatSpecular = ggxSpecular(vec3(0.0, 0.0, 1.0), viewDirection, lightDirection, coatRoughness, vec3(0.04));
      float luminance = dot(ink, vec3(0.2126, 0.7152, 0.0722));
      // Neutral black ink stays black; the clear paper coating catches a warm
      // reflection. This avoids the previous whole-card grey/brown multiply.
      float paperReflectance = smoothstep(0.15, 0.50, luminance);
      float coat = clamp(uSurfaceCoat, 0.0, 1.0);
      float contrast = clamp(uLightContrast / 0.26, 0.0, 3.85);
      float printWeight = 0.62 + 0.38 * clamp(uFoil, 0.0, 1.0);
      vec3 shadeTint = mix(vec3(1.0), uShadowColor, 0.18);
      color += ink * diffuseDelta * shadeTint * activity * contrast * 0.32;
      color -= ink * smoothstep(0.16, 0.55, length(microNormal)) * localEtchWeight * activity * contrast * uSurfaceRelief * 0.08;
      vec3 warmReflection = mix(vec3(1.0, 0.87, 0.72), uLightColor, 0.65);
      vec3 glaze = clamp((baseSpecular - flatBaseSpecular) + (coatSpecular - flatCoatSpecular * 0.85) * coat, vec3(-0.075), vec3(0.3));
      color += warmReflection * glaze * uSurfaceShine * paperReflectance * activity * printWeight * contrast;
      // A broad light follows the pointer, not moving shadow bands. Its small
      // chromatic delta retains the original image's luminance and white paper.
      color += (uLightColor - vec3(dot(uLightColor, vec3(0.2126, 0.7152, 0.0722)))) * softLight * paperReflectance * activity * uSurfaceShine * 0.045;
      // The visible interaction is a soft lamp moving across the paper. A
      // weaker lobe on the opposite side supplies depth without a cast pattern.
      vec2 lampPosition = (uPointer - 0.5) * vec2(0.85, 1.08);
      vec2 fromLamp = local - lampPosition;
      vec2 fromShade = local + lampPosition * 0.75;
      float warmLobe = exp(-dot(fromLamp, fromLamp) * 8.0);
      float softShade = exp(-dot(fromShade, fromShade) * 5.5);
      vec3 lampColor = mix(vec3(1.0, 0.91, 0.80), uLightColor, 0.6);
      float lightBalance = 0.75 + 0.25 * min(contrast, 2.0);
      color += lampColor * warmLobe * paperReflectance * activity * lightBalance * 0.08;
      color -= ink * softShade * paperReflectance * activity * contrast * 0.025;
      // Keep the factory lighting in the range of a gentle paper reflection;
      // intensity still scales the range, while ink remains the same print.
      color = ink + clamp(color - ink, vec3(-0.055 * activity), vec3(0.1 * activity));
    }
    return color;
  }

  void main() {
    vec4 paper = artwork(vUv);
    if (paper.a < 0.003) discard;
    vec3 color = paper.rgb;
    if (uLightModel > 0.5) color = projectedLight(paper.rgb);
    else color = reflectedLight(paper.rgb);
    // Optical grain is local and static. The unlit artwork is exactly unchanged.
    float grain = fract(52.9829189 * fract(dot(vUv * vec2(720.0, 900.0), vec2(0.06711056, 0.00583715)))) - 0.5;
    color += grain * uLightGrain / 255.0 * clamp(uActivity * uLightStrength, 0.0, 1.0);
    // Display-referred artwork and background share an explicit sRGB pipeline.
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), paper.a * uOpacity);
  }
`;

export function createStampMaterial(texture, foil, lightTexture) {
  const surfaceNormal = createSurfaceNormalTexture(17041 + Math.round(foil * 10000));
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uArtwork: { value: texture }, uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uSize: { value: new THREE.Vector2(200, 250) }, uActivity: { value: 0 },
      uFoil: { value: foil }, uOpacity: { value: 1 }, uBlur: { value: 0 }, uTime: { value: 0 },
      uDappled: { value: lightTexture },
      uSurfaceNormal: { value: surfaceNormal }, uLightModel: { value: 0 },
      uLightColor: { value: new THREE.Vector3(1, 0.945, 0.812) },
      uShadowColor: { value: new THREE.Vector3(0.565, 0.518, 0.439) }, uLightStrength: { value: 1 },
      uLightContrast: { value: 0.26 }, uLightGrain: { value: 0.65 },
      uSurfaceRelief: { value: 0.22 }, uSurfaceShine: { value: 0.25 },
      uSurfaceRoughness: { value: 0.62 }, uSurfaceCoat: { value: 0.55 },
    },
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  material.addEventListener('dispose', () => surfaceNormal.dispose());
  return material;
}

export function createShadowTexture(artwork) {
  const padding = 100;
  const canvas = document.createElement('canvas');
  canvas.width = artwork.width + padding * 2;
  canvas.height = artwork.height + padding * 2;
  const ctx = canvas.getContext('2d');
  ctx.shadowColor = 'rgba(47, 39, 24, 0.14)';
  ctx.shadowBlur = 85;
  ctx.shadowOffsetY = 42;
  ctx.drawImage(artwork, padding, padding);
  ctx.shadowColor = 'rgba(47, 39, 24, 0.38)';
  ctx.shadowBlur = 38;
  ctx.shadowOffsetY = 24;
  ctx.drawImage(artwork, padding, padding);
  ctx.shadowColor = 'transparent';
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#302a20';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return { texture, scaleX: canvas.width / artwork.width, scaleY: canvas.height / artwork.height };
}
