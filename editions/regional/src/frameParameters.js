import source from './data/frame-studio-source.json' with { type: 'json' };

export const FRAME_STORAGE_KEY = 'postal-studies:frame-studio:v1';
export const FRAME_ENVIRONMENT_URL = '/environments/citrus-orchard-road-4k.exr';
export const FRAME_LIGHT_LABELS = ['主光 · 大柔光箱', '补光 · 正面反射', '轮廓光 · 木框边缘'];
const world = source.world.nodes.find(node => node.type === 'BACKGROUND').inputs;
export const FRAME_DEFAULTS = Object.freeze({
  hdriEnabled: true, hdriIntensity: .12, hdriRotation: 63,
  worldStrength: world.Strength, exposure: source.view.exposure,
  shadowOpacity: .30, shadowSoftness: 1,
  tiltEnabled: true, tiltDegrees: 2.5, tiltResponse: .16,
  woodNormal: 1, canvasNormal: 1,
  lights: source.lights.map(light => ({
    enabled: true, watts: light.watts, diameter: light.size,
    position: [...light.sourcePosition], rotation: [...light.sourceRotationDegrees],
    color: [...light.color],
  })),
});

const number = (value, fallback, min, max) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const boolean = (value, fallback) => typeof value === 'boolean' ? value : fallback;
const vector = (value, fallback, min, max) => fallback.map((n, i) => number(value?.[i], n, min, max));
export function normalizeFrameParameters(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const d = FRAME_DEFAULTS;
  return {
    hdriEnabled: boolean(value.hdriEnabled, d.hdriEnabled),
    hdriIntensity: number(value.hdriIntensity, d.hdriIntensity, 0, 2),
    hdriRotation: number(value.hdriRotation, d.hdriRotation, -180, 180),
    worldStrength: number(value.worldStrength, d.worldStrength, 0, 1),
    exposure: number(value.exposure, d.exposure, -2, 2),
    shadowOpacity: number(value.shadowOpacity, d.shadowOpacity, 0, .8),
    shadowSoftness: number(value.shadowSoftness, d.shadowSoftness, .25, 2),
    tiltEnabled: boolean(value.tiltEnabled, d.tiltEnabled),
    tiltDegrees: number(value.tiltDegrees, d.tiltDegrees, 0, 5),
    tiltResponse: number(value.tiltResponse, d.tiltResponse, .06, .6),
    woodNormal: number(value.woodNormal, d.woodNormal, 0, 2),
    canvasNormal: number(value.canvasNormal, d.canvasNormal, 0, 2),
    lights: d.lights.map((light, i) => {
      const v = value.lights?.[i] ?? {};
      return {
        enabled: boolean(v.enabled, light.enabled),
        watts: number(v.watts, light.watts, 0, 60),
        diameter: number(v.diameter, light.diameter, .1, 2),
        position: vector(v.position, light.position, -3, 3),
        rotation: vector(v.rotation, light.rotation, -180, 180),
        color: vector(v.color, light.color, 0, 1),
      };
    }),
  };
}
export function readFrameParameters(storage) {
  try { const data = JSON.parse(storage.getItem(FRAME_STORAGE_KEY) || '{}'); return normalizeFrameParameters(data.parameters ?? data); }
  catch { return normalizeFrameParameters(); }
}
export function serializeFrameParameters(parameters) {
  return JSON.stringify({ schema: 'postal-frame-studio', version: 1, parameters: normalizeFrameParameters(parameters) }, null, 2);
}
export function parseFrameParameters(text) {
  const data = JSON.parse(text);
  if (data.schema !== 'postal-frame-studio' || data.version !== 1 || !data.parameters || typeof data.parameters !== 'object' || Array.isArray(data.parameters)) throw new Error('请选择相框面板导出的参数 JSON。');
  return normalizeFrameParameters(data.parameters);
}
export { source as FRAME_STUDIO_SOURCE };
