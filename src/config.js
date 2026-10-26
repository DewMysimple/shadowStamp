export const EXHIBITION = Object.freeze({
  enterDuration: 0.46,
  returnDuration: 0.56,
  reducedDuration: 0.1,
  hoverResponse: 0.085,
  blur: 11,
  mobileBlur: 6,
  maxDpr: 1.75,
  paper: '#fbf7f1',
  dark: '#22201c',
});

// Screen-normalized centers; angles are clockwise degrees. All eight prints have
// an exposed part of the paper on both layouts; draw order remains explicit.
export const STAMPS = Object.freeze([
  { id: 'joy', name: '醒狮八态 · 喜', label: '喜', english: 'JOY', number: '01', ratio: 0.8, foil: 1,
    image: '/assets/lion-states/lion-joy.png',
    desktop: { x: 0.49, y: 0.39, width: 0.138, angle: 10, z: 4 },
    mobile: { x: 0.5, y: 0.325, width: 0.27, angle: 8, z: 4 } },
  { id: 'anger', name: '醒狮八态 · 怒', label: '怒', english: 'ANGER', number: '02', ratio: 0.8, foil: 1,
    image: '/assets/lion-states/lion-anger.png',
    desktop: { x: 0.365, y: 0.6, width: 0.132, angle: -18, z: 3 },
    mobile: { x: 0.18, y: 0.55, width: 0.27, angle: -10, z: 3 } },
  { id: 'sorrow', name: '醒狮八态 · 哀', label: '哀', english: 'SORROW', number: '03', ratio: 0.8, foil: 1,
    image: '/assets/lion-states/lion-sorrow.png',
    desktop: { x: 0.532, y: 0.72, width: 0.135, angle: 6, z: 2 },
    mobile: { x: 0.34, y: 0.78, width: 0.27, angle: -9, z: 2 } },
  { id: 'delight', name: '醒狮八态 · 乐', label: '乐', english: 'DELIGHT', number: '04', ratio: 0.8, foil: 1,
    image: '/assets/lion-states/lion-delight.png',
    desktop: { x: 0.67, y: 0.33, width: 0.134, angle: -10, z: 3 },
    mobile: { x: 0.82, y: 0.35, width: 0.26, angle: -9, z: 2 } },
  { id: 'motion', name: '醒狮八态 · 动', label: '动', english: 'MOTION', number: '05', ratio: 0.8, foil: 1,
    image: '/assets/lion-states/lion-motion.png',
    desktop: { x: 0.71, y: 0.62, width: 0.138, angle: 19, z: 4 },
    mobile: { x: 0.5, y: 0.56, width: 0.28, angle: 12, z: 4 } },
  { id: 'stillness', name: '醒狮八态 · 静', label: '静', english: 'STILLNESS', number: '06', ratio: 0.8, foil: 1,
    image: '/assets/lion-states/lion-stillness.png',
    desktop: { x: 0.85, y: 0.47, width: 0.129, angle: -14, z: 2 },
    mobile: { x: 0.18, y: 0.33, width: 0.26, angle: -8, z: 1 } },
  { id: 'surprise', name: '醒狮八态 · 惊', label: '惊', english: 'SURPRISE', number: '07', ratio: 0.8, foil: 1,
    image: '/assets/lion-states/lion-surprise.png',
    desktop: { x: 0.87, y: 0.75, width: 0.13, angle: 7, z: 3 },
    mobile: { x: 0.82, y: 0.57, width: 0.26, angle: -12, z: 3 } },
  { id: 'doubt', name: '醒狮八态 · 疑', label: '疑', english: 'DOUBT', number: '08', ratio: 0.8, foil: 1,
    image: '/assets/lion-states/lion-doubt.png',
    desktop: { x: 0.34, y: 0.33, width: 0.13, angle: -7, z: 1 },
    mobile: { x: 0.67, y: 0.78, width: 0.27, angle: 10, z: 3 } },
]);

export function getHome(stamp, width, height) {
  const mobile = width < 700;
  const layout = mobile ? stamp.mobile : stamp.desktop;
  // Preserve composition on wide displays without creating giant or tiny paper.
  const unit = mobile ? Math.min(width, 520) : Math.min(width, height * 1.6);
  const w = unit * layout.width;
  return { x: layout.x * width, y: layout.y * height, width: w, height: w / stamp.ratio, angle: layout.angle, z: layout.z };
}

export function getFocus(stamp, width, height, parameters = {}) {
  const mobile = width < 700;
  const focusHeight = parameters.focusHeight ?? 0.565;
  const w = Math.min(width * (mobile ? 0.72 : (parameters.focusWidth ?? 0.295)), height * (mobile ? Math.min(0.8, focusHeight * 0.64 / 0.565) : focusHeight) * stamp.ratio, 650);
  const halfWidth = w / 2 + 18, halfHeight = w / stamp.ratio / 2 + 55;
  const safe = (value, min, max) => Math.min(max, Math.max(min, value));
  return { x: safe(width * (mobile ? 0.5 : (parameters.focusX ?? 0.479)), halfWidth, width - halfWidth), y: safe(height * (parameters.focusY ?? 0.5), halfHeight, height - halfHeight), width: w, height: w / stamp.ratio, angle: 0 };
}
