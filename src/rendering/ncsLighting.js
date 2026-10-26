// Facts audited in the original public bundles AND live NCS WebGL uploads.
// See docs/ncs-light-source-audit.md and docs/ncs-environment-source.md.
// The paper adapter keeps shallow original normals; no original height asset,
// displacement, metallic preset or environment image is imported.
export const NCS_LIGHTING = Object.freeze({
  fieldBackground: '#ffaaa5', fieldLight: '#ffd198', fieldShadow: '#4e5c3c', fieldTint: 0.26,
  mainColor: '#fff4e6', mainIntensity: 1.6,
  lampColor: '#ffe0b0', lampIntensity: 0.65, lampHeight: 0.45,
  roughness: 0.62, specularIntensity: 0.6, specularColor: '#fff6ea',
  coat: 0.55, coatRoughness: 0.2, normalScale: 1.6, coatNormalScale: 1.1,
  exposure: 0.57, fillIntensity: 0.32,
  // The original half-resolution light canvas changes cell size with paper size.
  patternReferenceHeight: 560, maximumSizeNorm: 3,
  patternCellAmount: 0.534, patternCoordinateMultiplier: 50,
});
