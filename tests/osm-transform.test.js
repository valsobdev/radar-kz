import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCameras, toRoads, joinWays, toUrban, toZones } from '../tools/osm-transform.mjs';

test('radar avec direction en degrés et limite', () => {
  const json = { elements: [{ type: 'node', id: 1, lat: 43.24, lon: 76.94, tags: { highway: 'speed_camera', direction: '90', maxspeed: '60' } }] };
  assert.deepEqual(toCameras(json), [{ id: 'osm-n1', type: 'speed', lat: 43.24, lon: 76.94, directions: [90], maxspeed: 60 }]);
});

test('radar forward sur une route vers le nord', () => {
  const json = { elements: [
    { type: 'node', id: 2, lat: 43.24, lon: 76.94, tags: { highway: 'speed_camera', direction: 'forward' } },
    { type: 'way', id: 10, nodes: [2, 3], geometry: [{ lat: 43.24, lon: 76.94 }, { lat: 43.25, lon: 76.94 }], tags: { highway: 'primary' } },
  ] };
  const [cam] = toCameras(json);
  assert.equal(cam.directions.length, 1);
  assert.ok(Math.min(cam.directions[0], 360 - cam.directions[0]) < 1);
});

test('caméra de feu rouge depuis une relation', () => {
  const json = { elements: [{ type: 'relation', id: 5, tags: { type: 'enforcement', enforcement: 'traffic_signals' },
    members: [{ type: 'node', ref: 7, role: 'device', lat: 43.25, lon: 76.95 }, { type: 'node', ref: 8, role: 'from', lat: 43.249, lon: 76.95 }] }] };
  const cams = toCameras(json);
  assert.equal(cams.length, 1);
  assert.equal(cams[0].type, 'red_light');
  assert.equal(cams[0].lat, 43.25);
});

// Relation de contrôle de vitesse : « from » est en amont du radar, à l'ouest ici (sens vers l'est).
const speedRelation = (id, device, from, tags = {}) => ({ type: 'relation', id, tags: { type: 'enforcement', enforcement: 'maxspeed', ...tags },
  members: [{ type: 'node', ref: device.id, role: 'device', lat: device.lat, lon: device.lon }, ...from.map((f) => ({ type: 'node', ref: f.id, role: 'from', lat: f.lat, lon: f.lon }))] });
const radar = (id, tags = {}) => ({ type: 'node', id, lat: 43.25, lon: 76.95, tags: { highway: 'speed_camera', ...tags } });
const west = { id: 50, lat: 43.25, lon: 76.949 }; // ~80 m à l'ouest
const east = { id: 51, lat: 43.25, lon: 76.951 };
const near = (deg, target) => Math.min(Math.abs(deg - target), 360 - Math.abs(deg - target)) < 1;

test('relation maxspeed : sens déduit du membre from et limite si absente', () => {
  const [cam] = toCameras({ elements: [radar(1), speedRelation(9, radar(1), [west], { maxspeed: '60' })] });
  assert.equal(cam.directions.length, 1);
  assert.ok(near(cam.directions[0], 90));
  assert.equal(cam.maxspeed, 60);
});

test('relation maxspeed : les balises du radar restent prioritaires', () => {
  const [cam] = toCameras({ elements: [radar(1, { direction: '180', maxspeed: '80' }), speedRelation(9, radar(1), [west], { maxspeed: '60' })] });
  assert.deepEqual(cam.directions, [180]);
  assert.equal(cam.maxspeed, 80);
});

test('relation maxspeed : deux relations sur un radar donnent les deux sens et la limite la plus basse', () => {
  const cams = toCameras({ elements: [radar(1),
    speedRelation(9, radar(1), [west], { maxspeed: '60' }),
    speedRelation(10, radar(1), [east], { maxspeed: '50' })] });
  assert.equal(cams.length, 1);
  assert.equal(cams[0].directions.length, 2);
  assert.ok(near(cams[0].directions[0], 90) && near(cams[0].directions[1], 270));
  assert.equal(cams[0].maxspeed, 50);
});

test('relation maxspeed : membre from trop loin ignoré (route qui peut tourner)', () => {
  const far = { id: 52, lat: 43.25, lon: 76.93 }; // ~1,6 km
  const [cam] = toCameras({ elements: [radar(1), speedRelation(9, radar(1), [far])] });
  assert.deepEqual(cam.directions, []);
});

test('relation maxspeed : radar absent des nœuds speed_camera ajouté', () => {
  const cams = toCameras({ elements: [speedRelation(9, { id: 7, lat: 43.25, lon: 76.95 }, [west], { maxspeed: '70' })] });
  assert.equal(cams.length, 1);
  assert.equal(cams[0].id, 'osm-r9-n7');
  assert.equal(cams[0].type, 'speed');
  assert.ok(near(cams[0].directions[0], 90));
  assert.equal(cams[0].maxspeed, 70);
});

test('routes : maxspeed converti, footway exclu', () => {
  const geometry = [{ lat: 43.123456789, lon: 76.987654321 }, { lat: 43.2, lon: 76.9 }];
  const roads = toRoads({ elements: [
    { type: 'way', id: 20, tags: { highway: 'primary', maxspeed: 'RU:urban' }, geometry },
    { type: 'way', id: 21, tags: { highway: 'footway' }, geometry },
  ] });
  assert.deepEqual(roads, [{ id: 'osm-w20', highway: 'primary', maxspeed: 60, oneway: false, c: [43.12346, 76.98765, 43.2, 76.9] }]);
});

test('joinWays : 3 morceaux dans le désordre dont un à l\'envers', () => {
  const rings = joinWays([
    [[0, 0], [0, 1]],
    [[1, 1], [1, 0], [0, 0]],
    [[1, 1], [0, 1]], // à l'envers
  ]);
  assert.equal(rings.length, 1);
  assert.equal(rings[0].length, 5);
  assert.deepEqual(rings[0][0], rings[0][4]);
});

test('joinWays : morceau isolé abandonné', () => assert.deepEqual(joinWays([[[0, 0], [0, 1]]]), []));

test('zone urbaine depuis une relation', () => {
  const g = (pts) => pts.map(([lat, lon]) => ({ lat, lon }));
  const urban = toUrban({ elements: [{ type: 'relation', id: 9, tags: { boundary: 'administrative', name: 'Алматы' }, members: [
    { type: 'way', ref: 1, role: 'outer', geometry: g([[43, 76], [43, 77], [44, 77]]) },
    { type: 'way', ref: 2, role: 'outer', geometry: g([[44, 77], [44, 76], [43, 76]]) },
  ] }] });
  assert.equal(urban.length, 1);
  assert.equal(urban[0].name, 'Алматы');
  assert.equal(urban[0].rings.length, 1);
});

test('petites rues sans limite exclues (même résultat que la limite par défaut)', () => {
  const geometry = [{ lat: 43.1, lon: 76.9 }, { lat: 43.2, lon: 76.9 }];
  const roads = toRoads({ elements: [
    { type: 'way', id: 30, tags: { highway: 'residential' }, geometry },
    { type: 'way', id: 31, tags: { highway: 'unclassified' }, geometry },
    { type: 'way', id: 32, tags: { highway: 'residential', maxspeed: '40' }, geometry },
    { type: 'way', id: 33, tags: { highway: 'living_street' }, geometry },
  ] });
  assert.deepEqual(roads.map((r) => r.id), ['osm-w32', 'osm-w33']);
});

test('toZones: relation average_speed → tracé from→to', () => {
  const json = { elements: [{
    type: 'relation', id: 77, tags: { type: 'enforcement', enforcement: 'average_speed', maxspeed: '60' },
    members: [
      { type: 'node', ref: 1, role: 'to', lat: 43.22, lon: 76.9 },
      { type: 'node', ref: 2, role: 'from', lat: 43.2, lon: 76.9 },
      // tracés donnés dans le désordre et à l'envers
      { type: 'way', ref: 10, role: 'section', geometry: [{ lat: 43.22, lon: 76.9 }, { lat: 43.21, lon: 76.9 }] },
      { type: 'way', ref: 11, role: 'section', geometry: [{ lat: 43.21, lon: 76.9 }, { lat: 43.2, lon: 76.9 }] },
    ],
  }, {
    type: 'relation', id: 78, tags: { type: 'enforcement', enforcement: 'average_speed' }, members: [],
  }] };
  assert.deepEqual(toZones(json), [{ id: 'osm-r77', path: [[43.2, 76.9], [43.21, 76.9], [43.22, 76.9]], maxspeed: 60 }]);
});
