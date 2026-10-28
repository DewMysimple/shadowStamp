// Stable IDs are saved in parameter JSON; indices are the GPU branch contract.
// These are paper-light compositors, all sharing the same organic optical field.
export const DEFAULT_LIGHT_ALGORITHM = 'local-add';
export const LIGHT_PRESETS = Object.freeze([
  { id: 'legacy-multiply', index: 0, name: '林隙旧笺', origin: '旧版留存',
    description: '暖光与苔色暗部交织，保留旧版更浓的明暗与纸纹。',
    values: {} },
  { id: 'local-add', index: 1, name: '晴窗暖笺', origin: '本工程新版',
    description: '光只落在明亮光斑里，保留新版轻盈的橙暖光。',
    values: {} },
  { id: 'screen', index: 2, name: '晨雾透光', origin: '滤色',
    description: '暗色轻轻透亮，亮部渐缓，像薄雾里的晨光。',
    values: { lightContrast: 0.38, shadowStrength: 0.55, surfaceRelief: 0.18, surfaceShine: 0.32 } },
  { id: 'soft-light', index: 3, name: '午后柔映', origin: '柔光',
    description: '柔和压暗与提亮相依，让浓色印刷保有层次。',
    values: { lightContrast: 0.42, shadowStrength: 0.72, surfaceRelief: 0.2, surfaceShine: 0.3 } },
  { id: 'diffuse-transmission', index: 4, name: '琥珀漫照', origin: '指数漫照',
    description: '暖色随光量渐渐浸入纸面，亮部平缓收束。',
    values: { lightContrast: 0.4, shadowStrength: 0.65, surfaceRelief: 0.2, surfaceShine: 0.35 } },
  { id: 'luminance', index: 5, name: '暮色留白', origin: '亮度塑形',
    description: '以明暗雕琢光斑，尽量保留醒狮图稿的原有色相。',
    values: { lightContrast: 0.4, shadowStrength: 0.8, surfaceRelief: 0.18, surfaceShine: 0.28 } },
].map(preset => Object.freeze({ ...preset, values: Object.freeze(preset.values) })));

export const getLightPreset = id => LIGHT_PRESETS.find(preset => preset.id === id)
  ?? LIGHT_PRESETS.find(preset => preset.id === DEFAULT_LIGHT_ALGORITHM);

// A preset never changes the desk, layout, focus, animation or pointer preferences.
export const LIGHT_PRESET_KEYS = Object.freeze([
  'lightAlgorithm', 'lightIntensity', 'lightContrast', 'shadowStrength',
  'lightColor', 'shadowColor', 'contactShadowColor', 'contactShadowOpacity',
  'contactShadowSoftness', 'textureScale', 'surfaceRelief', 'surfaceShine',
  'lightGrain', 'lightCoverage', 'lightScale', 'lightAngle', 'lightStretch',
  'lightScatter', 'lightWarp', 'lightSoftness',
]);
