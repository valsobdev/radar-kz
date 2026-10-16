import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, bearingDeg, angleDiff, distanceToSegmentMeters, pointInRing } from '../src/geo.js';

const A = { lat: 43.238, lon: 76.945 }; // Almaty, place de la République
const B = { lat: 43.248, lon: 76.945 }; // ~1,11 km au nord

test('distance nord', () => assert.ok(Math.abs(distanceMeters(A, B) - 1112) < 5));
test('cap nord', () => assert.ok(angleDiff(bearingDeg(A, B), 0) < 0.5));
test('cap est', () => assert.ok(angleDiff(bearingDeg(A, { lat: 43.238, lon: 76.955 }), 90) < 0.5));
test('angleDiff passe par 0', () => assert.equal(angleDiff(350, 10), 20));
test('angleDiff max 180', () => assert.equal(angleDiff(0, 180), 180));
test('distance au segment', () => {
  const p = { lat: 43.243, lon: 76.946 }; // ~81 m à l'est du segment A-B
  assert.ok(Math.abs(distanceToSegmentMeters(p, A, B) - 81) < 3);
});
test("distance au segment au-delà de l'extrémité", () => {
  assert.ok(Math.abs(distanceToSegmentMeters({ lat: 43.258, lon: 76.945 }, A, B) - 1112) < 5);
});
test('point dans un carré', () => {
  const ring = [[43, 76], [43, 77], [44, 77], [44, 76], [43, 76]];
  assert.equal(pointInRing({ lat: 43.5, lon: 76.5 }, ring), true);
  assert.equal(pointInRing({ lat: 42.5, lon: 76.5 }, ring), false);
});
