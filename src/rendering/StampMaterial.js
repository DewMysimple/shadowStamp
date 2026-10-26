import * as THREE from 'three';

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
  uniform vec2 uArtworkResolution;
  uniform float uActivity;
  uniform float uFoil;
  uniform float uOpacity;
  uniform float uBlur;
  uniform float uTime;
  uniform sampler2D uDappled;
  uniform vec3 uLightColor;
  uniform vec3 uShadowColor;
  uniform float uLightStrength;
  uniform float uLightContrast;
  uniform float uLightGrain;
  uniform float uSurfaceRelief;
  uniform float uSurfaceShine;

  vec4 printSample(vec2 uv) {
    if (min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) > 1.0) return vec4(0.0);
    return texture2D(uArtwork, uv);
  }

  float inkHeight(vec2 uv) {
    vec4 ink = printSample(uv);
    // The existing print is the height source: there is no second invented
    // contour texture. Transparent perforations have no raised ink.
    return (1.0 - dot(ink.rgb, vec3(0.2126, 0.7152, 0.0722))) * ink.a;
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

  void main() {
    vec4 paper = artwork(vUv);
    if (paper.a < 0.003) discard;
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
    vec3 litInk = paper.rgb * illumination + sun * uLightColor * vec3(0.075, 0.048, 0.015);
    // Values above one deliberately strengthen the same light/shadow delta;
    // an intensity slider up to two must not flatten out at its midpoint.
    vec3 color = mix(paper.rgb, litInk, clamp(uActivity, 0.0, 1.0) * clamp(uLightStrength, 0.0, 2.0));
    color += vec3(1.0, 0.88, 0.64) * lightBand * finish * 0.012;
    // A separate surface response makes fine printed contours catch the light.
    // Four neighbors are sufficient for a central-difference normal; this path
    // is skipped for inactive and blurred stamps. It contains no time input.
    float surfaceActivity = clamp(uActivity * uLightStrength, 0.0, 1.0) * interior;
    if (surfaceActivity > 0.001 && uSurfaceRelief > 0.0 && uBlur < 0.02) {
      vec2 texel = 1.0 / max(uArtworkResolution, vec2(1.0));
      vec2 gradient = vec2(
        inkHeight(vUv + vec2(texel.x, 0.0)) - inkHeight(vUv - vec2(texel.x, 0.0)),
        inkHeight(vUv + vec2(0.0, texel.y)) - inkHeight(vUv - vec2(0.0, texel.y))
      );
      float contourMask = smoothstep(0.015, 0.09, length(gradient));
      vec3 normal = normalize(vec3(-clamp(gradient, -0.25, 0.25) * uSurfaceRelief * 5.0, 1.0));
      vec3 direction = normalize(vec3((uPointer - 0.5) * vec2(1.6, 2.0), 0.75));
      float diffuseDelta = dot(normal, direction) - direction.z;
      vec3 halfDirection = normalize(direction + vec3(0.0, 0.0, 1.0));
      float flatSpecular = pow(max(halfDirection.z, 0.0), 48.0);
      float raisedSpecular = pow(max(dot(normal, halfDirection), 0.0), 48.0);
      float glint = max(raisedSpecular - flatSpecular, 0.0) * uSurfaceShine;
      float materialWeight = 0.65 + 0.35 * clamp(uFoil, 0.0, 1.0);
      float response = surfaceActivity * contourMask * materialWeight;
      color *= 1.0 + diffuseDelta * response * 0.24;
      color += mix(vec3(1.0, 0.84, 0.68), uLightColor, 0.5) * glint * response * 0.32;
    }
    // The optical grain is local and static, so adjusting it never animates the
    // background or introduces temporal sparkle. Artwork alpha clips the edge.
    float grain = fract(52.9829189 * fract(dot(vUv * vec2(720.0, 900.0), vec2(0.06711056, 0.00583715)))) - 0.5;
    color += grain * uLightGrain / 255.0 * clamp(uActivity * uLightStrength, 0.0, 1.0);
    // Display-referred artwork and background share an explicit sRGB pipeline.
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), paper.a * uOpacity);
  }
`;

export function createStampMaterial(texture, foil, lightTexture) {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uArtwork: { value: texture }, uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uSize: { value: new THREE.Vector2(200, 250) }, uActivity: { value: 0 },
      uArtworkResolution: { value: new THREE.Vector2(texture.image?.width || 720, texture.image?.height || 900) },
      uFoil: { value: foil }, uOpacity: { value: 1 }, uBlur: { value: 0 }, uTime: { value: 0 },
      uDappled: { value: lightTexture },
      uLightColor: { value: new THREE.Vector3(1, 0.945, 0.812) },
      uShadowColor: { value: new THREE.Vector3(0.565, 0.518, 0.439) }, uLightStrength: { value: 1 },
      uLightContrast: { value: 0.26 }, uLightGrain: { value: 0.65 },
      uSurfaceRelief: { value: 0.22 }, uSurfaceShine: { value: 0.25 },
    },
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
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
