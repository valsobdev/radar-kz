import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRemaining, barState } from '../src/zonebar.js';

test('temps et distance', () => assert.equal(formatRemaining(750, 60), '45 s · 750 m'));
test('distance arrondie à 10 m', () => assert.equal(formatRemaining(744, 60), '45 s · 740 m'));
test('au-delà d’1 km', () => assert.equal(formatRemaining(2400, 60), '2 min · 2,4 km'));
test('lent : distance seule', () => assert.equal(formatRemaining(750, 9), '750 m'));
test('arrêt : distance seule', () => assert.equal(formatRemaining(750, 0), '750 m'));
test('zone prioritaire', () => assert.deepEqual(
  barState({ zone: { remainingM: 600, totalM: 2400 }, approach: { distanceM: 100, startM: 500 }, speedKmh: 60 }),
  { fraction: 0.25, label: '36 s · 600 m' }));
test('approche radar', () => assert.equal(barState({ zone: null, approach: { distanceM: 250, startM: 500 }, speedKmh: 60 }).fraction, 0.5));
test('rien → null', () => assert.equal(barState({ zone: null, approach: null, speedKmh: 60 }), null));
test('fraction bornée', () => assert.equal(barState({ zone: null, approach: { distanceM: 520, startM: 500 }, speedKmh: 60 }).fraction, 1));
