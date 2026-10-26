import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSurfaceNormalData } from '../src/rendering/SurfaceTexture.js';
import { createStampMaterial } from '../src/rendering/StampMaterial.js';

test('paper micro-normals are deterministic, unbiased between axes and contain no baked ink', () => {
  const first = createSurfaceNormalData(512, 640, 19);
  const second = createSurfaceNormalData(512, 640, 19);
  const different = createSurfaceNormalData(512, 640, 20);
  assert.deepEqual(first.data, second.data);
  assert.notDeepEqual(first.data, different.data);
  const means = [0, 0], squares = [0, 0];
  let minZ = 1;
  for (let i = 0; i < first.data.length; i += 4) {
    for (let axis = 0; axis < 2; axis++) {
      const v = first.data[i + axis] / 255 * 2 - 1;
      means[axis] += v; squares[axis] += v * v;
    }
    minZ = Math.min(minZ, first.data[i + 2] / 255 * 2 - 1);
    assert.equal(first.data[i + 3], 255);
  }
  const pixels = first.width * first.height;
  assert.ok(Math.abs(means[0] / pixels) < .005);
  assert.ok(Math.abs(means[1] / pixels) < .005);
  assert.ok(squares[0] / squares[1] > .85 && squares[0] / squares[1] < 1.15);
  assert.ok(minZ > .55, 'micro normals must remain on the front-facing paper hemisphere');
  assert.throws(() => createSurfaceNormalData(0, 2));
});

test('stamp material owns only its micro-normal and releases it with the persistent material', () => {
  const art = new THREE.Texture({ width: 720, height: 900 });
  const light = new THREE.Texture();
  const material = createStampMaterial(art, .2, light);
  const surface = material.uniforms.uSurfaceNormal.value;
  let surfaceDisposals = 0, externalDisposals = 0;
  surface.addEventListener('dispose', () => surfaceDisposals++);
  art.addEventListener('dispose', () => externalDisposals++);
  light.addEventListener('dispose', () => externalDisposals++);
  assert.equal(material.uniforms.uLightModel.value, 0);
  assert.equal(material.uniforms.uSurfaceMetalness, undefined);
  assert.equal(material.uniforms.uArtworkResolution, undefined);
  assert.equal(material.uniforms.uActivity.value, 0);
  assert.equal(material.uniforms.uArtwork.value, art);
  assert.equal(material.uniforms.uDappled.value, light);
  assert.equal(surface.image.width, 512);
  assert.equal(surface.image.height, 640);
  material.dispose();
  assert.equal(surfaceDisposals, 1);
  assert.equal(externalDisposals, 0, 'gallery still owns art and shared light resources');
  art.dispose(); light.dispose();
});
