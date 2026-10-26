// Shared by the controls, persistence and renderer. Values are in CSS px / seconds / degrees.
export const PARAMETER_VERSION = 1;
export const STORAGE_KEY = 'postal-studies:parameters:v1';

const number = (key, label, value, min, max, step, unit = '', hint = '') => ({ key, label, value, min, max, step, unit, hint, type: 'number' });
const toggle = (key, label, value, hint = '') => ({ key, label, value, hint, type: 'boolean' });
const color = (key, label, value) => ({ key, label, value, type: 'color' });

export const PARAMETER_GROUPS = [
  { id: 'interaction', title: '指针与悬停', note: '偏转改变邮票姿态；光斑追踪在下方单独调节。', fields: [
    toggle('tiltEnabled', '指针微偏转', true),
    number('hoverTilt', '悬停偏转', 6, 0, 20, 0.5, '°'),
    number('focusTilt', '聚焦偏转', 6, 0, 20, 0.5, '°'),
    number('tiltResponse', '偏转缓动', 0.085, 0.02, 0.6, 0.005, 's', '原站约 195ms 达到90%偏转；数值越大，追踪越柔缓。'),
    number('hoverPerspective', '悬停透视距离', 1200, 500, 4000, 50, 'px', '原站画廊实测 1200px；距离越小，近大远小越明显。'),
    number('hoverScale', '悬停缩放', 1.05, 1, 1.2, 0.005, '×'),
    number('hoverLift', '悬停抬升', 4, 0, 20, 1, 'px'),
    number('hoverResponse', '悬停缓动', 0.085, 0.02, 0.4, 0.005, 's'),
    number('blur', '其他邮票虚化', 11, 0, 22, 0.5, 'px', '窄屏按 6/11 比例缩小。'),
    number('blurResponse', '虚化缓动', 0.075, 0.02, 0.4, 0.005, 's'),
  ] },
  { id: 'focus', title: '聚焦展示', note: '在聚焦后移动到票面四周，观察方向、位移和透视。', fields: [
    toggle('focusTrackOutside', '票外继续追踪', false, '开启后跟随票外指针，关闭时保持最后一次票内姿态。'),
    toggle('resetTiltOnLeave', '移出后回正', false, '原站聚焦时会保留最后一次偏转；开启可改为平滑回正。'),
    number('perspective', '聚焦透视距离', 1400, 500, 4000, 50, 'px', '原站聚焦实测 1400px。'),
    number('focusShift', '向指针偏移', 0, 0, 20, 0.5, 'px'),
    number('focusRoll', '平面微旋转', 0, 0, 3, 0.1, '°'),
    number('enterDuration', '进入时长', 0.46, 0.15, 1.5, 0.01, 's'),
    number('returnDuration', '返回时长', 0.56, 0.15, 1.5, 0.01, 's'),
    number('focusHeight', '聚焦高度', 0.565, 0.3, 0.8, 0.005, '屏高'),
    number('focusWidth', '聚焦宽度上限', 0.295, 0.2, 0.5, 0.005, '屏宽'),
    number('focusX', '水平位置', 0.479, 0.35, 0.65, 0.005, '屏宽'),
    number('focusY', '垂直位置', 0.5, 0.35, 0.65, 0.005, '屏高'),
    color('backgroundColor', '画廊纸色', '#fbf7f1'),
    color('focusBackground', '聚焦底色', '#22201c'),
  ] },
  { id: 'light', title: '邮票光影', note: '光只作用在邮票上。固定预览可让你离开票面继续调参。', fields: [
    toggle('lightEnabled', '启用票面光影', true),
    toggle('pinLight', '固定预览光影', false, '照亮最近交互的邮票；未选择时使用主邮票。'),
    toggle('lightAnimation', '光影流动', true),
    toggle('lightFollowPointer', '光斑跟随指针', true),
    number('lightIntensity', '光影强度', 0.55, 0, 2, 0.01),
    number('lightContrast', '明暗对比', 0.18, 0, 1, 0.01),
    number('lightSpeed', '流动速度', 0.35, 0, 3, 0.05, '×'),
    number('surfaceRelief', '印刷压纹', 0.22, 0, 1, 0.01, '', '沿实际印刷图案计算细微凹凸，不改变原图。'),
    number('surfaceShine', '纸面高光', 0.25, 0, 1, 0.01),
    number('pointerInfluence', '指针影响', 0.85, 0, 2, 0.05, '×'),
    number('lightResponse', '光斑跟随缓动', 0.16, 0, 0.8, 0.01, 's'),
    number('lightFadeIn', '光影渐入', 0.12, 0.02, 0.8, 0.01, 's'),
    number('lightFadeOut', '光影渐出', 0.16, 0.02, 0.8, 0.01, 's'),
    color('lightColor', '暖光颜色', '#fff1cf'),
    color('shadowColor', '阴影颜色', '#908470'),
  ] },
  { id: 'shape', title: '场景8 · 光斑形态', note: '沿用幽兰场景8的光场与散焦。覆盖范围 = 原场景光照半径 × 2。', fields: [
    number('lightCoverage', '覆盖范围', 0.708, 0.1, 1.6, 0.01),
    number('lightDensity', '光斑密度', 26.7, 2, 50, 0.1),
    number('lightAngle', '倾斜角度', 44, -90, 90, 1, '°'),
    number('lightStretch', '光斑拉伸', 0.84, 0, 1, 0.01),
    number('lightScatter', '斑驳散布', 1, 0, 2, 0.02),
    number('lightWarp', '波纹扭曲', 0.118, 0, 0.5, 0.005),
    number('lightSoftness', '散焦柔化', 1.5, 0, 3, 0.05),
    number('lightGrain', '细微颗粒', 0.65, 0, 1.5, 0.05),
  ] },
];

export const PARAMETER_FIELDS = Object.freeze(PARAMETER_GROUPS.flatMap(group => group.fields));
export const DEFAULT_PARAMETERS = Object.freeze(Object.fromEntries(PARAMETER_FIELDS.map(field => [field.key, field.value])));
export const PRESETS = Object.freeze({
  reference: { name: '参考方向', description: '柔缓追踪，清楚的聚焦微偏转。是复刻起点，并非原站参数原值。', values: DEFAULT_PARAMETERS },
  soft: { name: '柔和日光', description: '更淡、更慢、更柔的票面光影。', values: { ...DEFAULT_PARAMETERS, lightIntensity: 0.35, lightContrast: 0.13, lightSpeed: 0.2, lightSoftness: 1.8, focusTilt: 5, hoverTilt: 5 } },
  scene8: { name: '场景8 形态', description: '使用场景8截图的形态参数，配色仍为邮票暖光。', values: { ...DEFAULT_PARAMETERS, lightSoftness: 1, lightSpeed: 1, lightContrast: 0.26, lightCoverage: 0.708, lightDensity: 26.7, lightAngle: 44, lightStretch: 0.84, lightScatter: 1, lightWarp: 0.118 } },
  previous: { name: '上一版光影', description: '恢复上一版较深、较快的光影参数，便于对比；保留本轮修正的偏转。', values: { ...DEFAULT_PARAMETERS, lightIntensity: 1, lightContrast: 0.26, lightSpeed: 0.65, lightSoftness: 1.15, surfaceRelief: 0, surfaceShine: 0 } },
});

/** Whitelist & clamp persisted/imported values; never pass arbitrary JSON to uniforms. */
export function normalizeParameters(input = {}, base = DEFAULT_PARAMETERS) {
  const safe = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.fromEntries(PARAMETER_FIELDS.map(field => {
    let value = Object.hasOwn(safe, field.key) ? safe[field.key] : base[field.key];
    if (field.type === 'number') value = typeof value === 'number' && Number.isFinite(value) ? Math.min(field.max, Math.max(field.min, value)) : base[field.key];
    if (field.type === 'boolean') value = typeof value === 'boolean' ? value : base[field.key];
    if (field.type === 'color') value = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : base[field.key];
    return [field.key, value];
  }));
}

export function readParameters(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
    return parsed?.version === PARAMETER_VERSION ? normalizeParameters(parsed.parameters) : { ...DEFAULT_PARAMETERS };
  } catch { return { ...DEFAULT_PARAMETERS }; }
}

export function serializeParameters(parameters) {
  return JSON.stringify({ version: PARAMETER_VERSION, parameters: normalizeParameters(parameters) }, null, 2);
}

export function parseParameters(json) {
  const parsed = JSON.parse(json);
  if (parsed?.version !== PARAMETER_VERSION || !parsed.parameters || typeof parsed.parameters !== 'object' || Array.isArray(parsed.parameters)) throw new Error('请选择从本面板导出的 v1 参数 JSON。');
  return normalizeParameters(parsed.parameters);
}
