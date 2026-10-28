import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FRAME_DEFAULTS, FRAME_STUDIO_SOURCE, FRAME_STORAGE_KEY, normalizeFrameParameters, readFrameParameters, serializeFrameParameters, parseFrameParameters } from '../src/frameParameters.js';
import { patchFrameLighting } from '../src/rendering/FrameDiskLight.js';

test('frame defaults restore all three source lights, world and display exposure', () => {
  const defaults = normalizeFrameParameters();
  assert.equal(defaults.lights.length, 3);
  for (const [i, light] of defaults.lights.entries()) {
    const source = FRAME_STUDIO_SOURCE.lights[i];
    assert.equal(source.shape, 'DISK');
    assert.equal(light.watts, source.watts);
    assert.equal(light.diameter, source.size);
    assert.deepEqual(light.position, source.sourcePosition);
    assert.deepEqual(light.rotation, source.sourceRotationDegrees);
    assert.deepEqual(light.color, source.color);
    // Independently compare the Euler convention against Blender's exported matrix.
    const converted = new THREE.Quaternion().setFromEuler(new THREE.Euler(...light.rotation.map(THREE.MathUtils.degToRad), 'ZYX'))
      .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI/2));
    assert.ok(1-Math.abs(converted.dot(new THREE.Quaternion().fromArray(source.quaternion))) < 1e-7);
    const direction = new THREE.Vector3(0,0,-1).applyQuaternion(converted);
    assert.ok(direction.distanceTo(new THREE.Vector3().fromArray(source.direction)) < 1e-6);
  }
  assert.equal(defaults.worldStrength, FRAME_STUDIO_SOURCE.world.nodes.find(n=>n.type==='BACKGROUND').inputs.Strength);
  assert.equal(defaults.exposure, FRAME_STUDIO_SOURCE.view.exposure);
});

test('frame JSON and persistence round-trip a full edited rig, independent of stamp parameters', () => {
  const rig=normalizeFrameParameters(); rig.lights[1].position=[.8,-.5,.7];rig.lights[2].watts=15;rig.hdriRotation=-93;rig.tiltDegrees=4;
  const serialized=serializeFrameParameters(rig);
  assert.deepEqual(parseFrameParameters(serialized),rig);
  const store=new Map([[FRAME_STORAGE_KEY,serialized]]);
  assert.deepEqual(readFrameParameters({getItem:key=>store.get(key)}),rig);
  assert.throws(()=>parseFrameParameters('{"schema":"postal-stamp","version":1,"parameters":{}}'));
  assert.deepEqual(FRAME_DEFAULTS.lights[1].position, FRAME_STUDIO_SOURCE.lights[1].sourcePosition);
});

test('corrupt storage and malformed values cannot introduce NaN, missing lights or unsafe tilt bounds', () => {
  const fixed=normalizeFrameParameters({hdriIntensity:NaN,exposure:Infinity,tiltDegrees:999,lights:[{watts:-12,position:[Infinity,999,"0"]}]});
  assert.equal(fixed.tiltDegrees,5);assert.equal(fixed.lights.length,3);assert.equal(fixed.lights[0].watts,0);
  assert.equal(fixed.lights[0].position[1],3);
  assert.deepEqual(readFrameParameters({getItem:()=>'{broken'}),normalizeFrameParameters());
  assert.deepEqual(JSON.parse(JSON.stringify(fixed)),fixed);
});

test('LTC adapter patches the published comment-free shader and preserves the surrounding PBR implementation', () => {
  const input='#include <lights_physical_pars_fragment>\n#include <envmap_physical_pars_fragment>';
  const result=patchFrameLighting(input);
  assert.ok(result.includes('previousPoint'));
  assert.ok(result.includes('dot(tangent, tangent) < 1e-8'));
  assert.equal((result.match(/vec3 LTC_Evaluate\(/g)||[]).length,1);
  assert.ok(result.includes('RE_Direct_RectArea_Physical'));
  assert.ok(result.includes('BRDF_GGX'));
  assert.ok(result.includes('PI * (envMapColor.rgb * envMapIntensity + uFrameWorldRadiance)'));
  assert.ok(result.includes('return envMapColor.rgb * envMapIntensity + uFrameWorldRadiance;'));
  assert.ok(!result.includes('T1 = normalize( V - N * dot( V, N ) );'));
});
