import * as THREE from 'three';

// Retain Three's official LTC tables, Fresnel, horizon clipping and BRDFs.
// Integrate a circular boundary instead of four rectangle corners. An explicit
// basis handles V parallel to N (normal incidence) without undefined tangents.
const diskEdges = Array.from({ length: 32 }, (_, i) => {
  const angle = (i + 1) * Math.PI * 2 / 32;
  return `{
    vec3 nextPoint = normalize(transform * (center + (${Math.cos(angle).toFixed(10)}) * hw - (${Math.sin(angle).toFixed(10)}) * hh - P));
    formFactor += LTC_EdgeVectorFormFactor(previousPoint, nextPoint);
    previousPoint = nextPoint;
  }`;
}).join('\n');
const diskIntegral = /* glsl */`
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[4] ) {
  vec3 hw = (rectCoords[0] - rectCoords[1]) * 0.5;
  vec3 hh = (rectCoords[3] - rectCoords[0]) * 0.5;
  vec3 center = (rectCoords[0] + rectCoords[2]) * 0.5;
  if (dot(cross(-hw, hh), P - center) < 0.0) return vec3(0.0);
  vec3 tangent = V - N * dot(V, N);
  if (dot(tangent, tangent) < 1e-8) {
    tangent = cross(abs(N.z) < 0.999 ? vec3(0.0,0.0,1.0) : vec3(0.0,1.0,0.0), N);
  }
  vec3 T1 = normalize(tangent);
  vec3 T2 = -cross(N, T1);
  mat3 transform = mInv * transpose(mat3(T1, T2, N));
  vec3 previousPoint = normalize(transform * (center + hw - P));
  vec3 formFactor = vec3(0.0);
  ${diskEdges}
  return vec3(LTC_ClippedSphereFormFactor(formFactor));
}
`;

export function patchFrameLighting(fragmentShader) {
  // Three's published bundle strips shader comments. Find the function by its
  // balanced braces, so the dev/prebundled/production strings all get patched.
  const original = THREE.ShaderChunk.lights_physical_pars_fragment;
  const start = original.indexOf('vec3 LTC_Evaluate(');
  if (start < 0) throw new Error('The installed Three.js LTC function changed.');
  const body = original.indexOf('{', start);
  let depth = 1, end = body + 1;
  for (; depth && end < original.length; end++) {
    if (original[end] === '{') depth++;
    if (original[end] === '}') depth--;
  }
  if (depth) throw new Error('Incomplete Three.js LTC function.');
  const physical = original.slice(0, start) + diskIntegral + original.slice(end);
  const environment = THREE.ShaderChunk.envmap_physical_pars_fragment
    .replace('return PI * envMapColor.rgb * envMapIntensity;', 'return PI * (envMapColor.rgb * envMapIntensity + uFrameWorldRadiance);')
    .replace('return envMapColor.rgb * envMapIntensity;', 'return envMapColor.rgb * envMapIntensity + uFrameWorldRadiance;');
  return fragmentShader.replace('#include <lights_physical_pars_fragment>', physical)
    .replace('#include <envmap_physical_pars_fragment>', environment);
}
