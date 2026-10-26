import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PARAMETERS, PARAMETER_FIELDS, PARAMETER_GROUPS, PARAMETER_VERSION, STORAGE_KEY, LEGACY_STORAGE_KEY, normalizeParameters, parseParameters, readParameters, serializeParameters } from '../src/parameters.js';

test('user JSON is versioned and whitelisted; unsafe/malformed uniform values cannot reach renderer', () => {
  const result = normalizeParameters({ focusTilt: 999, lightIntensity: 0, lightAngle: -999, lightColor: 'url(javascript:alert(1))', lightAnimation: 'false', perspective: NaN, injected: 12 });
  assert.equal(result.focusTilt, 20);
  assert.equal(result.lightIntensity, 0);
  assert.equal(result.lightAngle, -90);
  assert.equal(result.lightColor, DEFAULT_PARAMETERS.lightColor);
  assert.equal(result.lightAnimation, true);
  assert.equal(result.perspective, DEFAULT_PARAMETERS.perspective);
  assert.equal(result.injected, undefined);
  assert.equal(normalizeParameters({ lightModel: 'unknown' }).lightModel, 'surface');
  assert.equal(normalizeParameters({ surfaceFinish: 'silver' }).surfaceFinish, undefined);
  assert.equal(new Set(PARAMETER_FIELDS.map(field => field.key)).size, PARAMETER_FIELDS.length);
  assert.equal(PARAMETER_GROUPS.length, 4);
  assert.throws(() => parseParameters('{"version":1,"parameters":[]}'));
  assert.throws(() => parseParameters('{"version":9,"parameters":{}}'));
});

test('v1 user adjustments migrate without keeping the obsolete projection as the implicit material', () => {
  const legacy = { version: 1, parameters: { hoverTilt: 12, lightIntensity: 0.8, lightEnabled: false, lightColor: '#EEDDBB' } };
  const values = readParameters({ getItem(key) { return key === LEGACY_STORAGE_KEY ? JSON.stringify(legacy) : null; } });
  assert.equal(values.hoverTilt, 12);
  assert.equal(values.lightIntensity, 0.8);
  assert.equal(values.lightEnabled, false);
  assert.equal(values.lightColor, '#eeddbb');
  assert.equal(values.lightModel, 'surface');
  assert.equal(values.surfaceFinish, undefined);
  assert.deepEqual(parseParameters(JSON.stringify(legacy)), values);
  assert.equal(JSON.parse(serializeParameters(values)).version, 2);
});

test('only a known old factory triplet upgrades; current exports preserve deliberate custom settings', () => {
  const old = { hoverTilt: 12, lightIntensity: .55, lightContrast: .18, surfaceShine: .25 };
  const migrated = parseParameters(JSON.stringify({ version: 1, parameters: old }));
  assert.equal(migrated.hoverTilt, 12);
  assert.equal(migrated.lightIntensity, DEFAULT_PARAMETERS.lightIntensity);
  assert.equal(migrated.lightContrast, DEFAULT_PARAMETERS.lightContrast);
  assert.equal(migrated.surfaceShine, DEFAULT_PARAMETERS.surfaceShine);
  const custom = normalizeParameters(old);
  assert.deepEqual(parseParameters(serializeParameters(custom)), custom);
  const projected = parseParameters(JSON.stringify({ version: 2, parameters: { ...old, lightModel: 'dappled' } }));
  assert.equal(projected.lightIntensity, .55);
  assert.equal(projected.lightModel, 'dappled');
});

test('saved parameters round trip exact values, and denied/corrupt storage restores complete defaults', () => {
  const values = normalizeParameters({ lightSpeed: 0, focusTilt: 12, lightColor: '#FFDDAA', lightAnimation: false });
  const json = serializeParameters(values);
  assert.deepEqual(parseParameters(json), values);
  assert.equal(JSON.parse(json).version, PARAMETER_VERSION);
  assert.deepEqual(readParameters({ getItem(key) { assert.equal(key, STORAGE_KEY); return json; } }), values);
  assert.deepEqual(readParameters({ getItem() { return '{'; } }), DEFAULT_PARAMETERS);
  assert.deepEqual(readParameters({ getItem() { throw new Error('blocked'); } }), DEFAULT_PARAMETERS);
});
