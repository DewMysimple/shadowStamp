import test from 'node:test';
import assert from 'node:assert/strict';
import { FocusMotion } from '../src/motion.js';
import { SERIES, STAMPS, getHome, getFocus } from '../src/config.js';

test('Escape during entry reverses from the actual current pose without a jump', () => {
  const motion = new FocusMotion();
  motion.retarget(1, 0.46);
  motion.update(0.12);
  const interrupted = motion.value;
  assert.ok(interrupted > 0 && interrupted < 1);
  motion.retarget(0, 0.56);
  assert.equal(motion.value, interrupted);
  motion.update(0.01);
  assert.ok(motion.value < interrupted);
  motion.update(1);
  assert.equal(motion.value, 0);
  assert.equal(motion.settled, true);
});

test('reselecting during return moves continuously toward the same focus', () => {
  const motion = new FocusMotion();
  motion.retarget(1, 0.46);
  motion.update(1);
  motion.retarget(0, 0.56);
  motion.update(0.1);
  const interrupted = motion.value;
  motion.retarget(1, 0.46);
  assert.equal(motion.value, interrupted);
  motion.update(0.02);
  assert.ok(motion.value > interrupted);
  motion.update(1);
  assert.equal(motion.value, 1);
});

test('all twelve stamp proportions fit on mobile, each series filter, and focused view', () => {
  for (const [width, height] of [[390, 844], [320, 568], [1440, 900], [1920, 1080]]) {
    for (const stamp of STAMPS) {
      const focus = getFocus(stamp, width, height);
      assert.ok(focus.x - focus.width / 2 > 15);
      assert.ok(focus.x + focus.width / 2 < width - 15);
      assert.ok(focus.y - focus.height / 2 > 45);
      assert.ok(focus.y + focus.height / 2 < height - 45);
      for (const series of ['all', ...SERIES.filter(item => item.id !== 'all').map(item => item.id)]) {
        const home = getHome(stamp, width, height, series);
        const angle = Math.abs(home.angle) * Math.PI / 180;
        const halfX = (home.width * Math.cos(angle) + home.height * Math.sin(angle)) / 2;
        const halfY = (home.width * Math.sin(angle) + home.height * Math.cos(angle)) / 2;
        assert.ok(home.x > halfX, `${width}x${height} ${series} ${stamp.id} left`);
        assert.ok(home.x + halfX < width, `${width}x${height} ${series} ${stamp.id} right`);
        if (width < 700) {
          assert.ok(home.y - halfY > 75, `${width}x${height} ${series} ${stamp.id} top`);
          assert.ok(home.y + halfY < height - 60, `${width}x${height} ${series} ${stamp.id} bottom`);
        }
      }
    }
  }
});
