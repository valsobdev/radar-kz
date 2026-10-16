import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDirection, createAlertTracker } from '../src/cameras.js';

test('degrés', () => assert.deepEqual(parseDirection('90'), [90]));
test('cardinal', () => assert.deepEqual(parseDirection('NE'), [45]));
test('multiple', () => assert.deepEqual(parseDirection('0;180'), [0, 180]));
test('forward', () => assert.deepEqual(parseDirection('forward', 30), [30]));
test('backward', () => assert.deepEqual(parseDirection('backward', 30), [210]));
test('forward sans route', () => assert.deepEqual(parseDirection('forward', null), []));
for (const bad of ['both', 'abc', '', undefined, '999'])
  test(`inconnu: ${bad}`, () => assert.deepEqual(parseDirection(bad), []));

const cam = { id: 'c1', type: 'speed', lat: 43.248, lon: 76.945, directions: [0], maxspeed: 60 };
const south = { lat: 43.244, lon: 76.945 }; // ~445 m au sud du radar
test('alerte en approche, bon sens', () => {
  const t = createAlertTracker([cam]);
  assert.equal(t.update(south, 0).camera.id, 'c1');
});
test('une seule alerte par passage', () => {
  const t = createAlertTracker([cam]);
  t.update(south, 0);
  assert.equal(t.update({ lat: 43.245, lon: 76.945 }, 0), null);
});
test('réarmée après éloignement', () => {
  const t = createAlertTracker([cam]);
  t.update(south, 0);
  t.update({ lat: 43.240, lon: 76.945 }, 180); // ~890 m
  assert.equal(t.update(south, 0).camera.id, 'c1');
});
test("pas d'alerte en sens inverse", () => assert.equal(createAlertTracker([cam]).update({ lat: 43.252, lon: 76.945 }, 180), null));
test("pas d'alerte radar derrière", () => assert.equal(createAlertTracker([cam]).update({ lat: 43.250, lon: 76.945 }, 0), null));
test('trop loin', () => assert.equal(createAlertTracker([cam]).update({ lat: 43.240, lon: 76.945 }, 0), null));
test('direction inconnue -> alerte', () => {
  assert.ok(createAlertTracker([{ ...cam, directions: [] }]).update({ lat: 43.252, lon: 76.945 }, 180));
});
test('cap inconnu -> rien', () => assert.equal(createAlertTracker([cam]).update(south, null), null));
