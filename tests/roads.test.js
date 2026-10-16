import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadIndex, currentRoad, isUrban } from '../src/roads.js';

// Route nord-sud à lon 76.945, route est-ouest à lat 43.2402 (~22 m de p)
const ns = { id: 'ns', highway: 'primary', maxspeed: 60, oneway: false, c: [43.238, 76.945, 43.248, 76.945] };
const ew = { id: 'ew', highway: 'secondary', maxspeed: 40, oneway: false, c: [43.2402, 76.940, 43.2402, 76.950] };
const idx = buildRoadIndex([ns, ew]);
const p = { lat: 43.240, lon: 76.9451 }; // ~8 m de ns, ~22 m de ew

test('cap nord -> route nord-sud', () => assert.equal(currentRoad(idx, p, 0).id, 'ns'));
test('cap sud aussi (double sens)', () => assert.equal(currentRoad(idx, p, 180).id, 'ns'));
test('cap est -> route est-ouest malgré la distance', () => assert.equal(currentRoad(idx, p, 90).id, 'ew'));
test('trop loin -> null', () => assert.equal(currentRoad(idx, { lat: 43.240, lon: 76.948 }, 0), null));
test("sens interdit d'un oneway ignoré", () => {
  const ow = { ...ns, id: 'ow', oneway: true };
  assert.equal(currentRoad(buildRoadIndex([ow]), p, 180), null);
});
test('ville', () => {
  const urban = [{ name: 'X', rings: [[[43, 76], [43, 77], [44, 77], [44, 76], [43, 76]]] }];
  assert.equal(isUrban(urban, p), true);
  assert.equal(isUrban(urban, { lat: 42.5, lon: 76.5 }), false);
});

import { createRoadTracker, ROAD_HOLD_MS } from '../src/roads.js';
test('revue: route conservée quelques secondes quand le GPS s\'en écarte', () => {
  const t = createRoadTracker(idx);
  assert.equal(t.update(p, 0, 0).id, 'ns');
  const far = { lat: 43.240, lon: 76.9455 }; // ~40 m : plus de route trouvée
  assert.equal(t.update(far, 0, 2000).id, 'ns');
  assert.equal(t.update(far, 0, 2000 + ROAD_HOLD_MS), null);
});
