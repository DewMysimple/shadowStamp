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

// Screen-normalized centers; angles are clockwise degrees. Draw order is explicit.
export const STAMPS = Object.freeze([
  { id: 'specimen', name: 'SPECIMEN', number: '03', ratio: 0.82, foil: 0.06,
    desktop: { x: 0.456, y: 0.737, width: 0.141, angle: -42, z: 1 },
    mobile: { x: 0.235, y: 0.505, width: 0.29, angle: -28, z: 1 } },
  { id: 'kensho', name: 'KENSHO TECHNOLOGIES', number: '02', ratio: 0.83, foil: 0.08,
    desktop: { x: 0.496, y: 0.6, width: 0.139, angle: -18, z: 2 },
    mobile: { x: 0.365, y: 0.414, width: 0.31, angle: -18, z: 2 } },
  { id: 'craft', name: 'NEW CRAFT SOCIETY', number: '01', ratio: 0.786, foil: 1,
    desktop: { x: 0.596, y: 0.533, width: 0.132, angle: 16, z: 4 },
    mobile: { x: 0.575, y: 0.355, width: 0.325, angle: 14, z: 4 } },
  { id: 'mint', name: 'EVERGREEN STUDIO', number: '04', ratio: 0.8, foil: 0.38,
    desktop: { x: 0.935, y: 0.605, width: 0.137, angle: -24, z: 2 },
    mobile: { x: 0.79, y: 0.554, width: 0.29, angle: -19, z: 2 } },
  { id: 'nocturne', name: 'NOCTURNE', number: '06', ratio: 0.76, foil: 0.13,
    desktop: { x: 0.697, y: 0.99, width: 0.14, angle: 5, z: 1 },
    mobile: { x: 0.43, y: 0.736, width: 0.31, angle: 7, z: 1 } },
  { id: 'gaohan', name: 'GAO HAN — DESIGN HERO', number: '05', ratio: 0.8, foil: 0.05,
    desktop: { x: 0.761, y: 0.9, width: 0.139, angle: -16, z: 3 },
    mobile: { x: 0.63, y: 0.714, width: 0.32, angle: -13, z: 3 } },
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
