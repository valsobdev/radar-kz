import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeElements, directionsFromChoice, MOBILE_DEFAULT_MS } from '../src/elements.js';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const osm = [
  { id: 'osm-n1', type: 'speed', lat: 43.24, lon: 76.94, directions: [90], maxspeed: 60 },
  { id: 'osm-n2', type: 'speed', lat: 43.25, lon: 76.95, directions: [], maxspeed: null },
];
const row = (o) => ({ id: 'u1', kind: 'speed_camera', lat: 43.3, lon: 76.9, directions: [], maxspeed: null, controls: null, path: null, note: null, expires_at: null, overrides: null, hidden: false, ...o });

test('fusion sans relevés', () => {
  assert.deepEqual(mergeElements(osm, [], [], NOW), { cameras: osm, zones: [] });
});

test('masquage OSM', () => {
  const { cameras } = mergeElements(osm, [], [row({ hidden: true, overrides: 'osm-n1' })], NOW);
  assert.deepEqual(cameras.map((c) => c.id), ['osm-n2']);
});

test('ligne masquée sans correction ignorée', () => {
  const { cameras } = mergeElements(osm, [], [row({ hidden: true })], NOW);
  assert.equal(cameras.length, 2);
});

test('correction OSM : position et limite remplacées, id gardé', () => {
  const { cameras } = mergeElements(osm, [], [row({ overrides: 'osm-n1', lat: 43.241, lon: 76.941, maxspeed: 50 })], NOW);
  assert.equal(cameras.length, 2);
  assert.deepEqual(cameras.find((c) => c.id === 'osm-n1'), { id: 'osm-n1', type: 'speed', lat: 43.241, lon: 76.941, directions: [90], maxspeed: 50 });
});

test('contrôle mobile expiré ignoré', () => {
  const r = row({ id: 'm1', kind: 'mobile_control', expires_at: new Date(NOW - 1000).toISOString() });
  assert.equal(mergeElements([], [], [r], NOW).cameras.length, 0);
});

test('contrôle mobile actif', () => {
  const r = row({ id: 'm1', kind: 'mobile_control', directions: [45], expires_at: new Date(NOW + MOBILE_DEFAULT_MS).toISOString() });
  assert.deepEqual(mergeElements([], [], [r], NOW).cameras, [{ id: 'm1', type: 'mobile', lat: 43.3, lon: 76.9, directions: [45], maxspeed: null }]);
});

test('conversion des types', () => {
  const rows = [
    row({ id: 'a', kind: 'camera', controls: 'red_light' }),
    row({ id: 'b', kind: 'camera' }),
    row({ id: 'c', kind: 'police_post' }),
    row({ id: 'd', kind: 'other' }),
  ];
  assert.deepEqual(mergeElements([], [], rows, NOW).cameras.map((c) => c.type), ['red_light', 'speed', 'police', 'other']);
});

test('zone convertie', () => {
  const path = [[43.2, 76.9], [43.21, 76.9]];
  const r = row({ id: 'z1', kind: 'average_zone', path, maxspeed: 60 });
  assert.deepEqual(mergeElements([], [], [r], NOW).zones, [{ id: 'z1', path, maxspeed: 60 }]);
});

test('zone éditeur remplace zone OSM proche', () => {
  const osmZone = { id: 'osm-r1', path: [[43.2, 76.9], [43.21, 76.9]], maxspeed: 60 };
  const far = { id: 'osm-r2', path: [[43.5, 76.9], [43.51, 76.9]], maxspeed: 60 };
  const r = row({ id: 'z1', kind: 'average_zone', path: [[43.2002, 76.9], [43.21, 76.9]], maxspeed: 50 });
  const { zones } = mergeElements([], [osmZone, far], [r], NOW);
  assert.deepEqual(zones.map((z) => z.id), ['osm-r2', 'z1']);
});

test('ligne malformée ignorée sans exception', () => {
  const rows = [null, 5, row({ kind: 'average_zone', path: 'x', maxspeed: 60 }), row({ kind: 'average_zone', path: [[1, 1]], maxspeed: 60 }), row({ lat: null })];
  assert.deepEqual(mergeElements(osm, [], rows, NOW), { cameras: osm, zones: [] });
});

test('directionsFromChoice', () => {
  assert.deepEqual(directionsFromChoice('mine', 90), [90]);
  assert.deepEqual(directionsFromChoice('opposite', 90), [270]);
  assert.deepEqual(directionsFromChoice('both', 90), []);
  assert.deepEqual(directionsFromChoice('mine', null), []);
});
