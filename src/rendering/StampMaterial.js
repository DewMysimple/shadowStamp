import * as THREE from 'three';
import { createSurfaceNormalTexture } from './SurfaceTexture.js';
import { NCS_LIGHTING } from './ncsLighting.js';

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
  uniform vec3 uLightColor;
  uniform vec3 uShadowColor;
  uniform float uLightStrength;
  uniform float uLightContrast;
  uniform float uLightGrain;
  uniform float uSurfaceRelief;
  uniform float uSurfaceShine;
  uniform float uTextureScale;
  uniform float uShadowStrength;
  uniform vec3 uMainColor;
  uniform vec3 uLampColor;
  uniform float uMainIntensity;
  uniform float uLampIntensity;
  uniform float uLampHeight;
  uniform float uPaperRoughness;
  uniform float uCoatRoughness;
  uniform float uCoat;
  uniform float uNormalScale;
  uniform float uCoatNormalScale;
  uniform float uSpecularIntensity;
  uniform vec3 uSpecularColor;
  uniform float uExposure;

  vec4 printSample(vec2 uv, float lodBias) {
    if (min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) > 1.0) return vec4(0.0);
    return texture2D(uArtwork, uv, lodBias);
  }

  // Dielectric reflection of shallow paper fibres; the printed artwork stays flat.
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
    vec4 outputColor = printSample(uv, 0.0);
    if (uBlur >= 0.02) {
    vec4 result = vec4(0.0);
    float weights = 0.0;
    // Prefilter each disk sample to its screen-space footprint. Sampling sharp
    // ink 48 times without this left repeated C contours instead of defocus.
    float lodBias = log2(1.0 + uBlur * 0.55);
    for (int i = 0; i < 48; i++) {
      float f = float(i);
      float angle = f * 2.39996323;
      float radius = sqrt((f + 0.5) / 48.0);
      vec2 offset = vec2(cos(angle), sin(angle)) * radius * uBlur * 2.1 / uSize;
      vec4 sampleColor = printSample(uv + offset, lodBias);
      float weight = exp(-radius * radius * 3.5);
      result += vec4(sampleColor.rgb * sampleColor.a, sampleColor.a) * weight;
      weights += weight;
    }
    result /= weights;
      outputColor = vec4(result.rgb / max(result.a, 0.0001), result.a);
    }
    return outputColor;
  }

  vec3 paperLight(vec3 ink) {
    float activity = clamp(uActivity, 0.0, 1.0) * clamp(uLightStrength, 0.0, 2.0);
    vec3 color = ink;
    // Lighting and print defocus have independent transitions. Waiting for blur
    // to reach zero hid the entire light for ~473ms on every card handoff.
    if (activity > 0.001) {
      vec2 local = (vUv - 0.5) * vec2(1.0, 1.27);
      // One optical field and one paper response. Neither alters print UVs,
      // vertices, lettering nor alpha. Enlarging fibres does not enlarge ink.
      vec4 optical = texture2D(uDappled, clamp(vUv, 0.0, 1.0));
      float shade = optical.a;
      vec2 normalUv = (vUv - 0.5) / uTextureScale + 0.5;
      vec2 microNormal = texture2D(uSurfaceNormal, normalUv).rg * 2.0 - 1.0;
      vec3 normal = normalize(vec3(microNormal * uSurfaceRelief * (uNormalScale / 0.22), 1.0));
      vec3 coatNormal = normalize(vec3(microNormal * uSurfaceRelief * (uCoatNormalScale / 0.22), 1.0));
      vec3 viewDirection = normalize(vec3(-local * 0.4, 1.65));
      vec3 lightDirection = normalize(vec3((uPointer - 0.5) + vec2(-0.3, 0.45), 0.4));
      vec3 toLamp = vec3((uPointer - vUv) * vec2(1.0, 1.27), uLampHeight);
      float lampDistance2 = max(dot(toLamp, toLamp), 0.01);
      vec3 lampDirection = normalize(toLamp);
      // Actual source light colours are linear-RGB, independently of the
      // display-RGB optical palette. The orange lamp is not a yellow overlay.
      vec3 lampRadiance = uLampColor * uLampIntensity / lampDistance2;
      float diffuseDelta = dot(normal, lightDirection) - lightDirection.z;
      float texelFootprint = max(length(dFdx(normalUv * vec2(512.0, 640.0))), length(dFdy(normalUv * vec2(512.0, 640.0))));
      float coatRoughness = clamp(uCoatRoughness + max(texelFootprint - 1.0, 0.0) * 0.075, uCoatRoughness, 0.42);
      vec3 specular = ggxSpecular(normal, viewDirection, lightDirection, uPaperRoughness, vec3(0.04)) * uSpecularIntensity * uSpecularColor;
      vec3 flatSpecular = ggxSpecular(vec3(0.0, 0.0, 1.0), viewDirection, lightDirection, uPaperRoughness, vec3(0.04)) * uSpecularIntensity * uSpecularColor;
      specular += ggxSpecular(coatNormal, viewDirection, lampDirection, coatRoughness, vec3(0.04)) * uCoat;
      flatSpecular += ggxSpecular(vec3(0.0, 0.0, 1.0), viewDirection, lampDirection, coatRoughness, vec3(0.04)) * uCoat;
      float luminance = dot(ink, vec3(0.2126, 0.7152, 0.0722));
      float paperReflectance = smoothstep(0.15, 0.50, luminance);
      // Shallow-paper adapter of the original non-metal lighting. Its print
      // remains unchanged at rest; the original displacement/env assets are
      // intentionally absent. Exposure is a light-response gain here, not a
      // claim to reproduce the original complete Neutral/PMREM render.
      color += ink * diffuseDelta * uMainColor * uMainIntensity * uExposure * activity * 0.72;
      color += uMainColor * uMainIntensity * uExposure * paperReflectance * activity * 0.07;
      float lampDiffuse = max(dot(normal, lampDirection), 0.0);
      color += lampRadiance * lampDiffuse * uExposure * paperReflectance * activity * 0.035;
      vec3 fibreGlint = clamp(specular - flatSpecular, vec3(-0.045), vec3(0.12));
      color += (uMainColor + lampRadiance * 0.3) * fibreGlint * uSurfaceShine * paperReflectance * activity;
      // The original draws a full-colour optical map over the physical paper:
      // final map = mix(peach, blurred RGB, blurred alpha), then multiply .26.
      // Sampling alpha alone discarded the orange/coral light entirely.
      vec3 mapColor = mix(uLightColor, optical.rgb, shade);
      mapColor += (vec3(1.0) - uShadowColor) * (1.0 - uShadowStrength) * shade;
      color *= mix(vec3(1.0), clamp(mapColor, 0.0, 1.0), clamp(uLightContrast * activity, 0.0, 1.0));
    }
    return color;
  }

  void main() {
    vec4 paper = artwork(vUv);
    if (paper.a < 0.003) discard;
    vec3 color = paper.rgb;
    color = paperLight(paper.rgb);
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
      uSurfaceNormal: { value: surfaceNormal },
      uLightColor: { value: new THREE.Vector3(1, 0.945, 0.812) },
      uShadowColor: { value: new THREE.Vector3(0.565, 0.518, 0.439) }, uLightStrength: { value: 1 },
      uLightContrast: { value: 0.26 }, uLightGrain: { value: 0.65 },
      uSurfaceRelief: { value: 0.22 }, uSurfaceShine: { value: 0.25 },
      uTextureScale: { value: 1 }, uShadowStrength: { value: 0.32 },
      uMainColor: { value: new THREE.Vector3().fromArray(new THREE.Color(NCS_LIGHTING.mainColor).toArray()) },
      uLampColor: { value: new THREE.Vector3().fromArray(new THREE.Color(NCS_LIGHTING.lampColor).toArray()) },
      uMainIntensity: { value: NCS_LIGHTING.mainIntensity }, uLampIntensity: { value: NCS_LIGHTING.lampIntensity },
      uLampHeight: { value: NCS_LIGHTING.lampHeight },
      uPaperRoughness: { value: NCS_LIGHTING.roughness }, uCoatRoughness: { value: NCS_LIGHTING.coatRoughness },
      uCoat: { value: NCS_LIGHTING.coat }, uNormalScale: { value: NCS_LIGHTING.normalScale },
      uCoatNormalScale: { value: NCS_LIGHTING.coatNormalScale }, uSpecularIntensity: { value: NCS_LIGHTING.specularIntensity },
      uSpecularColor: { value: new THREE.Vector3().fromArray(new THREE.Color(NCS_LIGHTING.specularColor).toArray()) },
      uExposure: { value: NCS_LIGHTING.exposure },
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

/** Persistent alpha shadow; tint/softness edits never redraw or allocate a texture. */
export function createShadowMaterial(texture) {
  return new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D uShadow;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSoftness;
      float alphaAt(vec2 uv) {
        if (min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) > 1.0) return 0.0;
        return texture2D(uShadow, uv).a;
      }
      void main() {
        float alpha = alphaAt(vUv);
        if (uSoftness > 0.001) {
          alpha = 0.0;
          float weights = 0.0;
          for (int i = 0; i < 24; i++) {
            float radius = sqrt((float(i) + 0.5) / 24.0);
            float angle = float(i) * 2.39996323;
            float weight = exp(-radius * radius * 2.5);
            vec2 offset = vec2(cos(angle), sin(angle)) * radius * uSoftness * vec2(0.022, 0.018);
            alpha += alphaAt(vUv + offset) * weight;
            weights += weight;
          }
          alpha /= weights;
        }
        gl_FragColor = vec4(uColor, alpha * uOpacity);
      }`,
    uniforms: {
      uShadow: { value: texture }, uColor: { value: new THREE.Vector3(0.337, 0.357, 0.314) },
      uOpacity: { value: 0.32 }, uSoftness: { value: 1.4 },
    },
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
}
