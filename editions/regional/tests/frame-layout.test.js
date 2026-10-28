import test from 'node:test';
import assert from 'node:assert/strict';
import { getExhibitionLayout, getHome, STAMPS } from '../src/config.js';

test('desktop gives the frame the dominant marked proportion and a separate right collection', () => {
  for (const [w, h] of [[1024, 768], [1280, 720], [1440, 900], [1920, 1080], [2560, 1440]]) {
    const { frame, collection } = getExhibitionLayout(w, h);
    assert.ok(frame.width / w > .60 && frame.width / w < .63);
    assert.ok(collection.width / w > .32 && collection.width / w < .35);
    assert.ok(frame.x + frame.width < collection.x);
    assert.ok(frame.y > 100 && frame.y + frame.height < h - 65);
    assert.ok(collection.x + collection.width <= w - 20);
  }
});

test('every category preserves all four original ratios, with clear grid gaps even on hover', () => {
  for (const [w, h] of [[1024, 768], [1280, 720], [1440, 900], [1920, 1080], [2560, 1440]]) {
    const { grid } = getExhibitionLayout(w, h);
    for (const id of ['guangdong', 'china', 'world']) {
      const peers = STAMPS.filter(stamp => stamp.series === id);
      const poses = peers.map(stamp => ({ ...getHome(stamp, w, h, id), ratio: stamp.ratio }));
      assert.equal(poses.length, 4);
      for (const p of poses) {
        assert.ok(Math.abs(p.width/p.height - p.ratio) < 1e-10);
        assert.ok(p.x - p.width*.55 > grid.x);
        assert.ok(p.x + p.width*.55 < grid.x + grid.width);
        assert.ok(p.y - p.height*.55 > grid.y);
        assert.ok(p.y + p.height*.55 < grid.y + grid.height);
      }
      for (let a=0; a<poses.length; a++) for (let b=a+1; b<poses.length; b++) {
        const x = poses[a], y = poses[b];
        assert.ok(Math.abs(x.x-y.x) > (x.width+y.width)*.55 || Math.abs(x.y-y.y) > (x.height+y.height)*.55);
      }
    }
  }
});
