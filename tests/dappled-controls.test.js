import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDappledLight, DAPPLED_DEFAULTS, normalizeDappledParameters } from '../src/rendering/DappledLight.js';
import { PARAMETER_FIELDS } from '../src/parameters.js';

function fakeRenderer() {
  let target = null;
  const viewport = new THREE.Vector4(0, 0, 1440, 900);
  const scissor = viewport.clone();
  return {
    autoClear: false, draws: [],
    getRenderTarget: () => target,
    setRenderTarget: value => { target = value; },
    getScissorTest: () => false,
    setScissorTest() {},
    getViewport: value => value.copy(viewport),
    setViewport() {},
    getScissor: value => value.copy(scissor),
    setScissor() {},
    getSize: value => value.set(1440, 900),
    render(scene) { this.draws.push({ target, uniforms: scene.children[0].material.uniforms }); },
  };
}

test('panel inputs preserve zero, clamp optical extremes and reject malformed imported values', () => {
  const p = normalizeDappledParameters({
    lightEnabled: false, lightAnimation: false, lightCoverage: 99, lightIntensity: NaN,
    pointerInfluence: 0, lightResponse: 0, lightColor: '#AB12EF', shadowColor: 'invalid',
    lightScale: -10, lightContrast: 0, unknown: 'ignored',
  });
  assert.equal(p.enabled, false);
  assert.equal(p.animate, false);
  assert.equal(p.coverage, 1.6);
  assert.equal(p.intensity, DAPPLED_DEFAULTS.intensity);
  assert.equal(p.pointerInfluence, 0);
  assert.equal(p.responseTime, 0);
  assert.equal(p.light, '#ab12ef');
  assert.equal(p.color, DAPPLED_DEFAULTS.color);
  assert.equal(p.scale, 0.2);
  assert.equal(p.contrast, 0);
  assert.equal('unknown' in p, false);
});

test('the complete public light-slider range reaches the optical adapter without hidden clipping', () => {
  const nativeKeys = {
    lightIntensity: 'intensity', lightContrast: 'contrast', lightSpeed: 'speed',
    pointerInfluence: 'pointerInfluence', lightResponse: 'responseTime',
    lightCoverage: 'coverage', lightScale: 'scale', lightAngle: 'angle',
    lightStretch: 'stretch', lightScatter: 'scatter', lightWarp: 'wave',
    lightSoftness: 'softness', lightGrain: 'grain',
  };
  for (const field of PARAMETER_FIELDS.filter(field => nativeKeys[field.key])) {
    for (const value of [field.min, field.max]) {
      assert.equal(normalizeDappledParameters({ [field.key]: value })[nativeKeys[field.key]], value, `${field.key}=${value}`);
    }
  }
  assert.equal(normalizeDappledParameters({ lightAngle: -90 }).angle, -90);
  assert.equal(normalizeDappledParameters({ angle: -90 }).angle, -90);
  assert.deepEqual(normalizeDappledParameters(null), { ...DAPPLED_DEFAULTS });
});

test('disabling light stops optical passes and time; re-enabling reuses the same resources', () => {
  const renderer = fakeRenderer();
  const light = createDappledLight(renderer);
  light.resize(1440, 900);
  light.render(0, 0, false, true);
  light.render(0.1, 0, false, true);
  const original = light.stats;
  const reference = light.parameters;
  light.configure({ lightEnabled: false });
  light.render(1, 0, false, true);
  light.render(2, 0, false, true);
  assert.equal(light.stats.fieldUpdates, original.fieldUpdates);
  assert.equal(light.stats.time, original.time);
  assert.equal(light.needsFrame, false);
  light.configure({ lightEnabled: true, density: 32 });
  light.render(3, 0, false, true);
  assert.equal(light.parameters, reference);
  assert.equal(light.stats.texture, original.texture);
  assert.equal(light.stats.fieldUpdates, original.fieldUpdates + 1);
  assert.equal(renderer.draws.at(-3).uniforms.uDensity.value, 32 / 3);
  assert.equal(renderer.getRenderTarget(), null);
  assert.equal(renderer.autoClear, false);
  light.dispose();
  light.dispose();
});

test('source light-map scale follows original NCS half-resolution and DPR rules', () => {
  const renderer = fakeRenderer(), light = createDappledLight(renderer, { lightAnimation: false });
  light.resize(1440, 900);
  for (const [height, dpr, expected] of [[238, 1, 8.9], [540, 1, 12.873214285714285], [238, 2, 11.3475], [540, 2, 25.74642857142857]]) {
    light.setStampSize(190, height, dpr);
    light.render(dpr + height, 0, false, true);
    assert.ok(Math.abs(light.stats.density - expected) < 1e-10);
  }
  light.configure({ lightScale: 2 }); light.render(1000, 0, false, true);
  assert.ok(Math.abs(light.stats.density - 25.74642857142857 / 2) < 1e-10);
  light.dispose();
});

test('pausing flow retains pointer response, then settles fully; reduced motion and follow toggle center it', () => {
  const renderer = fakeRenderer();
  const light = createDappledLight(renderer, { lightAnimation: false });
  light.resize(1440, 900);
  light.render(0, 0, false, true);
  const time = light.stats.time;
  light.setPointer(0.9, 0.2);
  for (let i = 1; i < 200; i++) light.render(i / 60, 0, false, true);
  assert.equal(light.stats.time, time);
  assert.ok(light.stats.pointer[0] > 0.8);
  assert.ok(light.stats.pointer[1] < 0.3);
  assert.deepEqual(light.stats.pointer, light.stats.target);
  assert.equal(light.needsFrame, false);
  light.configure({ lightFollowPointer: false });
  for (let i = 200; i < 400; i++) light.render(i / 60, 0, false, true);
  assert.deepEqual(light.stats.pointer, [0.5, 0.5]);
  assert.equal(light.needsFrame, false);
  light.configure({ lightFollowPointer: true });
  light.setPointer(0.9, 0.2);
  light.render(7, 0, true, true);
  assert.deepEqual(light.stats.pointer, [0.5, 0.5]);
  assert.equal(light.needsFrame, false);
  light.dispose();
});

test('the stamp-local light field follows vertical, horizontal and extra-tall stamp ratios', () => {
  const renderer = fakeRenderer();
  const light = createDappledLight(renderer, { lightAnimation: false });
  light.resize(1440, 900);
  for (const [id, width, height] of [['foshan', 45, 65], ['beijing', 60, 45], ['singapore', 40, 75]]) {
    light.setActiveStamp(id);
    light.setStampSize(width, height, 1);
    light.render(0.001 * (width + height), 0, false, true);
    assert.ok(Math.abs(light.stats.aspect - width / height) < 1e-8, id);
  }
  light.resize(390, 844);
  assert.ok(Math.abs(light.stats.aspect - 40 / 75) < 1e-8, 'viewport resize preserves the active stamp ratio');
  light.dispose();
});

test('card handoffs refresh the shared field immediately without waiting for the flow budget', () => {
  const renderer = fakeRenderer();
  const light = createDappledLight(renderer, { lightAnimation: false });
  light.resize(1440, 900);
  light.setActiveStamp('foshan');
  light.setPointer(0.1, 0.9);
  light.render(0, 0, false, true);
  const original = light.stats;
  assert.deepEqual(original.pointer, original.target);

  light.setActiveStamp('guangzhou');
  light.setPointer(0.9, 0.1);
  light.render(0.001, 0, false, true);
  assert.equal(light.stats.fieldUpdates, original.fieldUpdates + 1);
  assert.equal(light.stats.texture, original.texture);
  assert.equal(light.stats.owner, 'guangzhou');
  assert.deepEqual(light.stats.pointer, light.stats.target);

  // Same-card movement still obeys the user's response and 24fps flow budget.
  light.setActiveStamp('guangzhou');
  light.setPointer(0.1, 0.9);
  light.render(0.002, 0, false, true);
  assert.equal(light.stats.fieldUpdates, original.fieldUpdates + 1);
  assert.notDeepEqual(light.stats.pointer, light.stats.target);
  light.setActiveStamp(null);
  light.render(0.003, 0, false, false);
  assert.equal(light.needsFrame, false);
  light.setActiveStamp('guangzhou');
  light.render(0.004, 0, false, true);
  assert.equal(light.stats.fieldUpdates, original.fieldUpdates + 2);
  assert.deepEqual(light.stats.pointer, light.stats.target);
  light.configure({ lightEnabled: false });
  light.setActiveStamp('foshan');
  light.render(0.005, 0, false, true);
  assert.equal(light.stats.fieldUpdates, original.fieldUpdates + 2);
  light.dispose();
});

test('legacy optical proportions return without replacing targets or losing the active stamp aspect', () => {
  const renderer = fakeRenderer(), light = createDappledLight(renderer, { lightAnimation: false });
  light.resize(1440, 900);
  light.setStampSize(60, 45);
  light.render(0, 0, false, true);
  const original = light.stats;
  light.configure({ lightAlgorithm: 'legacy-multiply' });
  light.render(.01, 0, false, true);
  assert.equal(light.stats.aspect, .786);
  assert.equal(light.stats.fieldUpdates, original.fieldUpdates + 1);
  assert.equal(light.stats.texture, original.texture);
  light.setStampSize(40, 75);
  light.resize(390, 844);
  assert.equal(light.stats.aspect, .786);
  light.configure({ lightAlgorithm: 'screen' });
  light.render(.02, 0, false, true);
  assert.equal(light.stats.aspect, 40 / 75);
  assert.equal(light.stats.texture, original.texture);
  assert.equal(normalizeDappledParameters({ lightAlgorithm: 'unknown' }).lightAlgorithm, 'local-add');
  light.dispose();
});
