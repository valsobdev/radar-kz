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
  assert.deepEqual(m.update(fix(43.30, 1000, { accuracy: 200 })), { ...a, fresh: false });
});
test('premier point : cap null', () => assert.equal(createMotionTracker().update(fix(43.24, 0)).heading, null));

test("revue: cap conservé à l'arrêt malgré une dérive GPS de 12 m", () => {
  const m = createMotionTracker();
  m.update(fix(43.2400, 0, { speed: 10 }));
  m.update(fix(43.2402, 2000, { speed: 10 })); // cap nord
  // arrêt (speed 0), le GPS dérive de ~12 m vers l'est
  const r = m.update(fix(43.2402, 3000, { speed: 0, lon: 76.94515, accuracy: 15 }));
  assert.ok(r.heading < 1);
});
test('revue: un saut GPS isolé ne fait pas croire à un excès de vitesse', () => {
  const m = createMotionTracker();
  m.update(fix(43.24000, 0));
  m.update(fix(43.24000, 1000));
  const r = m.update(fix(43.24027, 2000)); // saut de ~30 m en 1 s (≈108 km/h)
  assert.ok(r.speedKmh < 20, `vitesse ${r.speedKmh}`);
});
test('revue: un point en double (même heure) ne remet pas la vitesse à 0', () => {
  const m = createMotionTracker();
  m.update(fix(43.2400, 0)); m.update(fix(43.2401, 1000)); m.update(fix(43.2402, 2000));
  assert.ok(m.update(fix(43.2402, 2000)).speedKmh > 30);
});
test('revue: vitesse GPS invalide (-1 ou NaN) traitée comme absente', () => {
  const m = createMotionTracker(); m.update(fix(43.2400, 0, { speed: -1 }));
  assert.equal(m.update(fix(43.2401, 1000, { speed: NaN })).speedKmh, 40);
});

test('fresh: vrai pour un point accepté, faux pour un point imprécis ou en double', () => {
  const m = createMotionTracker();
  assert.equal(m.update(fix(43.2400, 1000)).fresh, true);
  assert.equal(m.update(fix(43.2401, 2000, { accuracy: 200 })).fresh, false);
  assert.equal(m.update(fix(43.2400, 1000)).fresh, false); // doublon
  assert.equal(m.update(fix(43.2401, 3000)).fresh, true);
});
test('fresh: faux même si le premier point est imprécis', () => {
  assert.equal(createMotionTracker().update(fix(43.24, 0, { accuracy: 200 })).fresh, false);
});
