import * as THREE from 'three';
import { PARAMETER_FIELDS, DEFAULT_PARAMETERS } from '../parameters.js';
import { LIGHT_PRESETS } from '../lightPresets.js';
import { NCS_LIGHTING } from './ncsLighting.js';
import { SCREEN_VERTEX, DAPPLED_FIELD_FRAGMENT, DAPPLED_BLUR_FRAGMENT, DAPPLED_OUTPUT_FRAGMENT } from './dappledShaders.js';

// Core optical field/blur migrated from the user's 幽兰 scene 8, never modified there.
// This adapter owns no renderer, RAF, or DOM events; the gallery supplies all three.
export const DAPPLED_DEFAULTS = Object.freeze({
  lightAlgorithm: DEFAULT_PARAMETERS.lightAlgorithm,
  enabled: true,
  intensity: DEFAULT_PARAMETERS.lightIntensity,
  speed: DEFAULT_PARAMETERS.lightSpeed,
  color: DEFAULT_PARAMETERS.shadowColor,
  light: DEFAULT_PARAMETERS.lightColor,
  background: '#fbf7f1',
  focusColor: '#24231f',
  softness: DEFAULT_PARAMETERS.lightSoftness,
  coverage: 0.708,
  animate: true,
  density: 26.7,
  scale: DEFAULT_PARAMETERS.lightScale,
  angle: 44,
  stretch: 0.84,
  scatter: 1,
  wave: 0.118,
  grain: 0.65,
  contrast: 0.26,
  study: 0,
  followPointer: true,
  responseTime: 0.16,
  pointerInfluence: 0.85,
  stampRatio: 0.786,
});

// Public panel names map to the existing Scene 8 parameter vocabulary. Keeping
// the original names means research tools and existing callers keep working.
const PANEL_KEYS = Object.freeze({
  lightEnabled: 'enabled', lightAnimation: 'animate', lightFollowPointer: 'followPointer',
  lightIntensity: 'intensity', lightSpeed: 'speed', lightCoverage: 'coverage',
  lightScale: 'scale', lightAngle: 'angle', lightStretch: 'stretch',
  lightScatter: 'scatter', lightWarp: 'wave', lightSoftness: 'softness',
  lightContrast: 'contrast', lightGrain: 'grain', lightColor: 'light',
  shadowColor: 'color', lightResponse: 'responseTime',
});
const LIMITS = Object.freeze({
  // Only internal, non-panel parameters need local bounds. Every public light
  // slider uses the same contract as the UI, import and persistence layer.
  stampRatio: [0.1, 5], study: [0, 1], density: [2, 50],
  ...Object.fromEntries(PARAMETER_FIELDS
    .filter(field => field.type === 'number' && (PANEL_KEYS[field.key] || Object.hasOwn(DAPPLED_DEFAULTS, field.key)))
    .map(field => [PANEL_KEYS[field.key] ?? field.key, [field.min, field.max]])),
});
const COLOR_KEYS = new Set(['light', 'color', 'background', 'focusColor']);
const BOOLEAN_KEYS = new Set(['enabled', 'animate', 'followPointer']);

export function normalizeDappledParameters(options = {}, previous = DAPPLED_DEFAULTS) {
  const result = { ...previous };
  const safe = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  for (const [publicKey, value] of Object.entries(safe)) {
    const key = PANEL_KEYS[publicKey] ?? publicKey;
    if (key === 'lightAlgorithm' && LIGHT_PRESETS.some(preset => preset.id === value)) result[key] = value;
    else if (BOOLEAN_KEYS.has(key) && typeof value === 'boolean') result[key] = value;
    else if (COLOR_KEYS.has(key) && typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) result[key] = value.toLowerCase();
    else if (LIMITS[key] && Number.isFinite(value)) {
      const [min, max] = LIMITS[key];
      result[key] = THREE.MathUtils.clamp(value, min, max);
    }
  }
  return result;
}

function displayColor(hex, result = new THREE.Vector3()) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return result.set((value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255);
}

export function createDappledLight(renderer, options = {}) {
  const parameters = normalizeDappledParameters(options);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const fieldTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  const blurTarget = fieldTarget.clone();
  fieldTarget.texture.name = 'Exhibition dappled field';
  blurTarget.texture.name = 'Exhibition dappled lens';
  const pointer = new THREE.Vector2(0.5, 0.5);
  const pointerTarget = pointer.clone();
  const uniforms = {
    uField: { value: fieldTarget.texture }, uBlurred: { value: blurTarget.texture },
    uBlurTexel: { value: new THREE.Vector2(1, 1) }, uAspect: { value: parameters.stampRatio },
    uTime: { value: 3 }, uPointer: { value: pointer },
    uRadius: { value: parameters.coverage * 0.5 }, uDensity: { value: parameters.density },
    uAngle: { value: THREE.MathUtils.degToRad(parameters.angle) }, uStretch: { value: parameters.stretch },
    uScatter: { value: parameters.scatter }, uWave: { value: parameters.wave },
    uSoftness: { value: parameters.softness }, uIntensity: { value: parameters.intensity },
    // Paper grain is fixed. The panel's lightGrain only affects the stamp,
    // where the gallery synchronizes it to StampMaterial's uLightGrain.
    uPaperGrain: { value: DAPPLED_DEFAULTS.grain }, uFocus: { value: 0 },
    // NCS's coral/peach/moss field is separate from the desk palette. RGB is
    // colour-weighted by the lens, then composited by the stamp material.
    uBackground: { value: displayColor(NCS_LIGHTING.fieldBackground) },
    uShadow: { value: displayColor(parameters.color) }, uLight: { value: displayColor(parameters.light) },
    uPaper: { value: displayColor(parameters.background) },
    uPaperShadow: { value: displayColor(parameters.color) }, uPaperLight: { value: displayColor(parameters.light) },
    uStudy: { value: parameters.study },
    uFocusColor: { value: displayColor(parameters.focusColor) },
  };
  const material = fragmentShader => new THREE.ShaderMaterial({
    vertexShader: SCREEN_VERTEX, fragmentShader, uniforms,
    depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
  });
  const fieldMaterial = material(DAPPLED_FIELD_FRAGMENT);
  const blurMaterial = material(DAPPLED_BLUR_FRAGMENT);
  const outputMaterial = material(DAPPLED_OUTPUT_FRAGMENT);
  const fieldScene = new THREE.Scene();
  const outputScene = new THREE.Scene();
  const fieldPlane = new THREE.Mesh(geometry, fieldMaterial);
  const outputPlane = new THREE.Mesh(geometry, outputMaterial);
  fieldPlane.frustumCulled = outputPlane.frustumCulled = false;
  fieldScene.add(fieldPlane); outputScene.add(outputPlane);
  let disposed = false, dirty = true, lastFieldTime = -Infinity, active = false, fieldUpdates = 0;
  let pendingField = false, reduced = false;
  let activeStamp = null, snapPointer = false;
  let previousTime = null, fieldClock = 3, previousReducedMotion = null, parameterKey = '', opticalKey = '';
  let patternSizeNorm = NCS_LIGHTING.maximumSizeNorm;
  let activeAspect = parameters.stampRatio;
  const oldViewport = new THREE.Vector4();
  const oldScissor = new THREE.Vector4();
  const outputSize = new THREE.Vector2();

  function configure(values = {}) {
    if (disposed) return;
    const wasEnabled = parameters.enabled;
    Object.assign(parameters, normalizeDappledParameters(values, parameters));
    if (!wasEnabled && parameters.enabled) dirty = true;
    // A control edit is a fresh input event, not time spent running a hidden
    // animation. Parameter invalidation happens in render without allocating.
    previousTime = null;
  }

  function resize(_w, _h) {
    if (disposed) return;
    // The field is a stamp-local light study, independent of viewport shape/DPR.
    uniforms.uAspect.value = parameters.lightAlgorithm === 'legacy-multiply' ? parameters.stampRatio : activeAspect;
    const rw = 384, rh = 480;
    if (fieldTarget.width !== rw || fieldTarget.height !== rh) {
      fieldTarget.setSize(rw, rh); blurTarget.setSize(rw, rh);
      uniforms.uBlurTexel.value.set(1 / rw, 1 / rh); dirty = true;
    }
  }

  function render(timeSeconds, focusProgress = 0, reducedMotion = false, lightActive = false) {
    if (disposed) return;
    const dt = previousTime === null ? 0 : Math.min(0.1, Math.max(0, timeSeconds - previousTime));
    previousTime = timeSeconds;
    active = Boolean(lightActive && parameters.enabled && parameters.intensity > 0);
    reduced = reducedMotion;
    const focus = THREE.MathUtils.clamp(focusProgress, 0, 1);
    if (reducedMotion !== previousReducedMotion) { dirty = true; previousReducedMotion = reducedMotion; }
    const key = JSON.stringify(parameters);
    if (key !== parameterKey) {
      parameterKey = key;
      // Light-map colours affect the lens weights and invalidate it once.
      // Desk/focus colours still touch only the inexpensive background output.
      const nextOpticalKey = JSON.stringify([parameters.coverage, parameters.density, parameters.angle,
        parameters.stretch, parameters.scatter, parameters.wave, parameters.softness, parameters.stampRatio,
        parameters.color, parameters.light, parameters.scale, parameters.lightAlgorithm]);
      if (nextOpticalKey !== opticalKey) { opticalKey = nextOpticalKey; dirty = true; }
      uniforms.uRadius.value = Math.max(0.05, parameters.coverage * 0.5);
      uniforms.uDensity.value = parameters.density;
      uniforms.uAngle.value = THREE.MathUtils.degToRad(parameters.angle);
      uniforms.uStretch.value = parameters.stretch;
      uniforms.uScatter.value = parameters.scatter;
      uniforms.uWave.value = parameters.wave;
      uniforms.uSoftness.value = parameters.softness;
      // Preserve the old optical-map proportions in its archived algorithm.
      // All newer compositors fit the current portrait/landscape/tall artwork.
      uniforms.uAspect.value = parameters.lightAlgorithm === 'legacy-multiply' ? parameters.stampRatio : activeAspect;
      uniforms.uIntensity.value = parameters.intensity;
      uniforms.uStudy.value = THREE.MathUtils.clamp(parameters.study, 0, 1);
      displayColor(parameters.background, uniforms.uPaper.value);
      displayColor(parameters.color, uniforms.uPaperShadow.value);
      displayColor(parameters.light, uniforms.uPaperLight.value);
      displayColor(parameters.color, uniforms.uShadow.value);
      displayColor(parameters.light, uniforms.uLight.value);
      displayColor(parameters.focusColor, uniforms.uFocusColor.value);
    }
    uniforms.uDensity.value = parameters.density / (parameters.scale * patternSizeNorm);
    if (!parameters.followPointer) pointerTarget.set(0.5, 0.5);
    // A new paper owns a new local UV space. Hand the existing cache to its
    // target immediately; normal movement within that paper retains damping.
    if (active && snapPointer) { pointer.copy(pointerTarget); snapPointer = false; }
    const moving = active && !reducedMotion && pointer.distanceToSquared(pointerTarget) > 0.000001;
    if (moving) {
      pointer.lerp(pointerTarget, parameters.responseTime <= 0 ? 1 : -Math.expm1(-dt / parameters.responseTime));
      if (pointer.distanceToSquared(pointerTarget) <= 0.000001) pointer.copy(pointerTarget);
    }
    if (reducedMotion) pointer.set(0.5, 0.5);
    const flowing = active && parameters.animate && parameters.speed > 0 && !reducedMotion;
    if (flowing) fieldClock += dt * 2 * parameters.speed;
    pendingField ||= moving || flowing;
    uniforms.uTime.value = fieldClock;
    uniforms.uFocus.value = focus;
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousScissorTest = renderer.getScissorTest();
    renderer.getViewport(oldViewport); renderer.getScissor(oldScissor);
    try {
      renderer.autoClear = true; renderer.setScissorTest(false);
      if (active && (dirty || (pendingField && timeSeconds - lastFieldTime >= 1 / 24))) {
        fieldPlane.material = fieldMaterial;
        renderer.setRenderTarget(fieldTarget); renderer.render(fieldScene, camera);
        fieldPlane.material = blurMaterial;
        renderer.setRenderTarget(blurTarget); renderer.render(fieldScene, camera);
        lastFieldTime = timeSeconds; dirty = false; pendingField = false; fieldUpdates++;
      }
      renderer.setRenderTarget(null);
      renderer.getSize(outputSize); renderer.setViewport(0, 0, outputSize.x, outputSize.y);
      renderer.render(outputScene, camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(oldViewport); renderer.setScissor(oldScissor);
      renderer.setScissorTest(previousScissorTest); renderer.autoClear = previousAutoClear;
    }
    if (!active) { previousTime = null; pendingField = false; }
  }

  return {
    parameters, configure, resize, render, texture: blurTarget.texture,
    get needsFrame() {
      return !disposed && active && parameters.enabled && parameters.intensity > 0 && !reduced && (dirty || pendingField ||
        (parameters.animate && parameters.speed > 0) || pointer.distanceToSquared(pointerTarget) > 0.000001);
    },
    get stats() {
      return { active, time: fieldClock, fieldUpdates, pointer: pointer.toArray(), target: pointerTarget.toArray(),
        owner: activeStamp,
        aspect: uniforms.uAspect.value, width: blurTarget.width, height: blurTarget.height, texture: blurTarget.texture.uuid,
        enabled: parameters.enabled, animate: parameters.animate, followPointer: parameters.followPointer,
        sizeNorm: patternSizeNorm, density: uniforms.uDensity.value,
        parameters: { ...parameters } };
    },
    setActiveStamp(id) {
      if (disposed || id === activeStamp) return;
      activeStamp = id;
      if (id !== null) { dirty = true; snapPointer = true; }
    },
    setPointer(x, y) {
      if (disposed) return;
      if (!parameters.followPointer) return;
      pointerTarget.set(0.5 + (THREE.MathUtils.clamp(x, 0, 1) - 0.5) * parameters.pointerInfluence,
        0.5 + (THREE.MathUtils.clamp(y, 0, 1) - 0.5) * parameters.pointerInfluence);
    },
    setStampSize(stampWidth, stampHeight, pixelRatio = 1) {
      const nextAspect = stampWidth / Math.max(1, stampHeight);
      if (Number.isFinite(nextAspect) && Math.abs(nextAspect - activeAspect) > 0.0001) {
        activeAspect = nextAspect;
        uniforms.uAspect.value = parameters.lightAlgorithm === 'legacy-multiply' ? parameters.stampRatio : nextAspect;
        dirty = true;
      }
      const lightHeight = Math.max(1, Math.floor(stampHeight * Math.min(pixelRatio, 2)) >> 1);
      const next = THREE.MathUtils.clamp(NCS_LIGHTING.patternReferenceHeight / lightHeight, 1, NCS_LIGHTING.maximumSizeNorm);
      if (Math.abs(next - patternSizeNorm) > 0.0001) { patternSizeNorm = next; pendingField = true; }
    },
    dispose() {
      if (disposed) return; disposed = true;
      fieldScene.clear(); outputScene.clear(); geometry.dispose();
      fieldMaterial.dispose(); blurMaterial.dispose(); outputMaterial.dispose();
      fieldTarget.dispose(); blurTarget.dispose();
    },
  };
}
