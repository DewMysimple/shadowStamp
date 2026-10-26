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
    lightDensity: -10, lightContrast: 0, unknown: 'ignored',
  });
  assert.equal(p.enabled, false);
  assert.equal(p.animate, false);
  assert.equal(p.coverage, 1.6);
  assert.equal(p.intensity, DAPPLED_DEFAULTS.intensity);
  assert.equal(p.pointerInfluence, 0);
  assert.equal(p.responseTime, 0);
  assert.equal(p.light, '#ab12ef');
  assert.equal(p.color, DAPPLED_DEFAULTS.color);
  assert.equal(p.density, 2);
  assert.equal(p.contrast, 0);
  assert.equal('unknown' in p, false);
});

test('the complete public light-slider range reaches the optical adapter without hidden clipping', () => {
  const nativeKeys = {
    lightIntensity: 'intensity', lightContrast: 'contrast', lightSpeed: 'speed',
    pointerInfluence: 'pointerInfluence', lightResponse: 'responseTime',
    lightCoverage: 'coverage', lightDensity: 'density', lightAngle: 'angle',
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
  light.configure({ lightEnabled: true, lightDensity: 32 });
  light.render(3, 0, false, true);
  assert.equal(light.parameters, reference);
  assert.equal(light.stats.texture, original.texture);
  assert.equal(light.stats.fieldUpdates, original.fieldUpdates + 1);
  assert.equal(renderer.draws.at(-3).uniforms.uDensity.value, 32);
  assert.equal(renderer.getRenderTarget(), null);
  assert.equal(renderer.autoClear, false);
  light.dispose();
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
