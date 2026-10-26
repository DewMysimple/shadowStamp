import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PARAMETERS, PARAMETER_FIELDS, PARAMETER_GROUPS, PARAMETER_VERSION, STORAGE_KEY, normalizeParameters, parseParameters, readParameters, serializeParameters } from '../src/parameters.js';

test('user JSON is versioned and whitelisted; unsafe/malformed uniform values cannot reach renderer', () => {
  const result = normalizeParameters({ focusTilt: 999, lightIntensity: 0, lightAngle: -999, lightColor: 'url(javascript:alert(1))', lightAnimation: 'false', perspective: NaN, injected: 12 });
  assert.equal(result.focusTilt, 20);
  assert.equal(result.lightIntensity, 0);
  assert.equal(result.lightAngle, -90);
  assert.equal(result.lightColor, DEFAULT_PARAMETERS.lightColor);
  assert.equal(result.lightAnimation, true);
  assert.equal(result.perspective, DEFAULT_PARAMETERS.perspective);
  assert.equal(result.injected, undefined);
  assert.equal(new Set(PARAMETER_FIELDS.map(field => field.key)).size, PARAMETER_FIELDS.length);
  assert.equal(PARAMETER_GROUPS.length, 4);
  assert.throws(() => parseParameters('{"version":1,"parameters":[]}'));
  assert.throws(() => parseParameters('{"version":9,"parameters":{}}'));
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
