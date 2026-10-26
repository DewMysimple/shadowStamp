import test from 'node:test';
import assert from 'node:assert/strict';
import * as parameters from '../src/parameters.js';
const { DEFAULT_PARAMETERS, PARAMETER_FIELDS, PARAMETER_GROUPS, PARAMETER_VERSION, STORAGE_KEY, LEGACY_STORAGE_KEY, normalizeParameters, parseParameters, readParameters, serializeParameters } = parameters;

test('user JSON is whitelisted and clamped; removed material choices cannot reach the renderer', () => {
  const result = normalizeParameters({ focusTilt: 999, lightIntensity: 0, lightAngle: -999, textureScale: 99, lightScale: 99, lightDensity: 12, shadowStrength: -1, lightColor: 'url(javascript:alert(1))', lightAnimation: 'false', perspective: NaN, injected: 12, lightModel: 'surface', surfaceFinish: 'silver', surfaceRoughness: .2, surfaceCoat: 1 });
  assert.equal(result.focusTilt, 20);
  assert.equal(result.lightIntensity, 0);
  assert.equal(result.lightAngle, -90);
  assert.equal(result.textureScale, 3);
  assert.equal(result.lightScale, 6);
  assert.equal(result.shadowStrength, 0);
  assert.equal(result.lightColor, DEFAULT_PARAMETERS.lightColor);
  assert.equal(result.lightAnimation, true);
  assert.equal(result.perspective, DEFAULT_PARAMETERS.perspective);
  for (const key of ['injected', 'lightModel', 'lightDensity', 'surfaceFinish', 'surfaceRoughness', 'surfaceCoat']) assert.equal(Object.hasOwn(result, key), false);
  assert.equal(Object.hasOwn(parameters, 'PRESETS'), false);
  assert.equal(DEFAULT_PARAMETERS.lightEnabled, true);
  assert.equal(new Set(PARAMETER_FIELDS.map(field => field.key)).size, PARAMETER_FIELDS.length);
  assert.equal(PARAMETER_FIELDS.some(field => field.models || field.type === 'select'), false);
  assert.equal(PARAMETER_GROUPS.length, 4);
  assert.throws(() => parseParameters('{"version":1,"parameters":[]}'));
  assert.throws(() => parseParameters('{"version":9,"parameters":{}}'));
});

test('legacy appearances adopt the one enabled light while preserving gallery preferences', () => {
  const legacy = { version: 1, parameters: { hoverTilt: 12, focusHeight: .7, backgroundColor: '#FFEEDD', lightIntensity: .12, lightEnabled: false, lightColor: '#EEDDBB', lightModel: 'surface', pinLight: true } };
  const values = readParameters({ getItem(key) { return key === LEGACY_STORAGE_KEY ? JSON.stringify(legacy) : null; } });
  assert.equal(values.hoverTilt, 12);
  assert.equal(values.focusHeight, .7);
  assert.equal(values.backgroundColor, '#ffeedd');
  for (const group of PARAMETER_GROUPS.filter(group => ['light', 'shape'].includes(group.id))) {
    for (const field of group.fields) assert.equal(values[field.key], DEFAULT_PARAMETERS[field.key], field.key);
  }
  assert.equal(values.lightEnabled, true);
  assert.equal(Object.hasOwn(values, 'lightModel'), false);
  assert.deepEqual(parseParameters(JSON.stringify(legacy)), values);
  assert.equal(JSON.parse(serializeParameters(values)).version, PARAMETER_VERSION);
});

test('old modes and the previous single light migrate once; current deliberate edits remain exact', () => {
  for (const [appearanceRevision, lightModel] of [[2, 'surface'], [2, 'dappled'], [3, undefined]]) {
    const old = { hoverTilt: 12, lightIntensity: .8, lightColor: '#ffebd0', shadowColor: '#989384', lightContrast: .18, surfaceShine: .25, textureScale: 2, lightEnabled: false, lightModel };
    const migrated = parseParameters(JSON.stringify({ version: 2, appearanceRevision, parameters: old }));
    assert.equal(migrated.hoverTilt, 12);
    assert.equal(migrated.lightIntensity, DEFAULT_PARAMETERS.lightIntensity);
    assert.equal(migrated.lightContrast, DEFAULT_PARAMETERS.lightContrast);
    assert.equal(migrated.surfaceShine, DEFAULT_PARAMETERS.surfaceShine);
    assert.equal(migrated.textureScale, DEFAULT_PARAMETERS.textureScale);
    assert.equal(migrated.lightColor, DEFAULT_PARAMETERS.lightColor);
    assert.equal(migrated.shadowColor, DEFAULT_PARAMETERS.shadowColor);
    assert.equal(migrated.lightEnabled, true);
    const custom = normalizeParameters(old);
    assert.deepEqual(parseParameters(serializeParameters(custom)), custom);
    assert.equal(custom.lightEnabled, false);
    assert.equal(JSON.parse(serializeParameters(custom)).appearanceRevision, 4);
  }
});

test('current saved values round trip exactly, and denied/corrupt storage restores the enabled light', () => {
  const values = normalizeParameters({ lightSpeed: 0, focusTilt: 12, textureScale: 1.75, lightScale: 3.2, shadowStrength: .23, contactShadowColor: '#AABBCC', contactShadowOpacity: .47, contactShadowSoftness: 2.1, lightColor: '#FFDDAA', lightAnimation: false, lightEnabled: false });
  assert.equal(values.lightScale, 3.2);
  assert.equal(values.contactShadowColor, '#aabbcc');
  assert.equal(values.contactShadowOpacity, .47);
  assert.equal(values.contactShadowSoftness, 2.1);
  const json = serializeParameters(values);
  assert.deepEqual(parseParameters(json), values);
  assert.equal(JSON.parse(json).version, PARAMETER_VERSION);
  assert.deepEqual(readParameters({ getItem(key) { assert.equal(key, STORAGE_KEY); return json; } }), values);
  assert.deepEqual(readParameters({ getItem() { return '{'; } }), DEFAULT_PARAMETERS);
  assert.deepEqual(readParameters({ getItem() { throw new Error('blocked'); } }), DEFAULT_PARAMETERS);
});
