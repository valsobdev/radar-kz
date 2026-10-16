import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMotionTracker } from '../src/motion.js';

const fix = (lat, t, extra = {}) => ({ lat, lon: 76.945, speed: null, heading: null, accuracy: 5, timestamp: t, ...extra });

test('vitesse fournie', () => assert.equal(createMotionTracker().update(fix(43.24, 0, { speed: 10 })).speedKmh, 36));
test('vitesse calculée', () => {
  const m = createMotionTracker(); m.update(fix(43.2400, 0));
  assert.equal(m.update(fix(43.2401, 1000)).speedKmh, 40); // ~11,1 m en 1 s
});
test('cap calculé', () => {
  const m = createMotionTracker(); m.update(fix(43.2400, 0));
  assert.ok(m.update(fix(43.2402, 2000)).heading < 1);
});
test("cap conservé à l'arrêt", () => {
  const m = createMotionTracker(); m.update(fix(43.2400, 0)); m.update(fix(43.2402, 2000));
  assert.ok(m.update(fix(43.24021, 3000, { speed: 0 })).heading < 1);
});
test('point imprécis ignoré', () => {
  const m = createMotionTracker(); const a = m.update(fix(43.2400, 0, { speed: 10 }));
  assert.deepEqual(m.update(fix(43.30, 1000, { accuracy: 200 })), a);
});
test('premier point : cap null', () => assert.equal(createMotionTracker().update(fix(43.24, 0)).heading, null));
