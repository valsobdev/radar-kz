import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  overlayPending, appendPathPoint, finishPath, pathLengthM, zoneError,
  expiresAtFor, endOfDayMs, buildPointRow, buildZoneRow, PATH_STEP_M, ZONE_MIN_M,
} from '../src/editor-logic.js';
import { MOBILE_DEFAULT_MS } from '../src/elements.js';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const H = 3600 * 1000;
// Décalage vers le nord d'environ m mètres (1° de latitude ≈ 111 195 m).
const north = (m, lat = 43.2) => lat + m / 111195;

test('superposition : la file remplace, ajoute et supprime', () => {
  const rows = [{ id: 'a', maxspeed: 60 }, { id: 'b', maxspeed: 40 }, { id: 'c' }];
  const out = overlayPending(rows, { upserts: [{ id: 'a', maxspeed: 80 }, { id: 'd' }], deletes: ['b'] });
  assert.deepEqual(out, [{ id: 'a', maxspeed: 80 }, { id: 'c' }, { id: 'd' }]);
  assert.deepEqual(rows[0], { id: 'a', maxspeed: 60 }); // l'entrée n'est pas modifiée
});

test('superposition : file vide ou invalide', () => {
  assert.deepEqual(overlayPending([{ id: 'a' }], { upserts: [], deletes: [] }), [{ id: 'a' }]);
  assert.deepEqual(overlayPending(null, null), []);
});

test('tracé : un point tous les 20 m', () => {
  let path = [];
  path = appendPathPoint(path, { lat: 43.2, lon: 76.9 });
  assert.equal(path.length, 1);
  path = appendPathPoint(path, { lat: north(10), lon: 76.9 }); // trop près
  assert.equal(path.length, 1);
  path = appendPathPoint(path, { lat: north(PATH_STEP_M + 1), lon: 76.9 });
  assert.equal(path.length, 2);
  assert.deepEqual(path[0], [43.2, 76.9]);
});

test('tracé : point invalide ignoré', () => {
  assert.deepEqual(appendPathPoint([], null), []);
  assert.deepEqual(appendPathPoint([], { lat: NaN, lon: 1 }), []);
});

test('fin de zone : le point de fin est toujours ajouté sauf doublon', () => {
  const start = [[43.2, 76.9]];
  assert.equal(finishPath(start, { lat: north(5), lon: 76.9 }).length, 2);
  assert.equal(finishPath(start, { lat: 43.2, lon: 76.9 }).length, 1);
});

test('zone : longueur et contrôle', () => {
  const short = [[43.2, 76.9], [north(30), 76.9]];
  const ok = [[43.2, 76.9], [north(30), 76.9], [north(60), 76.9]];
  assert.ok(Math.abs(pathLengthM(ok) - 60) < 1);
  assert.equal(zoneError([[43.2, 76.9]]), 'Zone trop courte (au moins 50 m)');
  assert.equal(zoneError(short), 'Zone trop courte (au moins 50 m)');
  assert.equal(zoneError(ok), null);
  assert.equal(ZONE_MIN_M, 50);
});

test('fin de journée : 23:59 heure locale', () => {
  const d = new Date(NOW);
  const end = new Date(endOfDayMs(NOW));
  assert.equal(end.getDate(), d.getDate());
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMinutes(), 59);
});

test('fin de journée déjà passée : le lendemain', () => {
  const late = new Date(2026, 9, 18, 23, 59, 30).getTime();
  assert.ok(endOfDayMs(late) > late);
});

test('heure de fin : 1 h, 2 h, 4 h, fin de journée', () => {
  assert.equal(expiresAtFor('1h', NOW), new Date(NOW + H).toISOString());
  assert.equal(expiresAtFor('2h', NOW), new Date(NOW + MOBILE_DEFAULT_MS).toISOString());
  assert.equal(expiresAtFor('4h', NOW), new Date(NOW + 4 * H).toISOString());
  assert.equal(expiresAtFor('eod', NOW), new Date(endOfDayMs(NOW)).toISOString());
  assert.equal(expiresAtFor('inconnu', NOW), new Date(NOW + MOBILE_DEFAULT_MS).toISOString()); // défaut 2 h
});

const fix = { pos: { lat: 43.24, lon: 76.94 }, heading: 90 };

test('relevé radar fixe : mon sens', () => {
  assert.deepEqual(buildPointRow({ id: 'x', kind: 'speed_camera', fix, choice: 'mine', maxspeed: 60 }), {
    id: 'x', kind: 'speed_camera', lat: 43.24, lon: 76.94, directions: [90], maxspeed: 60,
    controls: null, note: null, expires_at: null, overrides: null, hidden: false,
  });
});

test('relevé caméra feu rouge : les deux sens, sans limite', () => {
  const row = buildPointRow({ id: 'x', kind: 'camera', fix, choice: 'both', controls: 'red_light' });
  assert.deepEqual(row.directions, []);
  assert.equal(row.controls, 'red_light');
  assert.equal(row.maxspeed, null);
});

test('relevé : controls seulement pour une caméra, note pour police, contrôle mobile et autre', () => {
  const p = buildPointRow({ id: 'x', kind: 'police_post', fix, choice: 'opposite', controls: 'speed', note: ' Poste KPP ' });
  assert.equal(p.controls, null);
  assert.equal(p.note, 'Poste KPP');
  assert.equal(buildPointRow({ id: 'm', kind: 'mobile_control', fix, choice: 'mine', note: 'Trépied' }).note, 'Trépied');
  assert.equal(buildPointRow({ id: 'r', kind: 'speed_camera', fix, choice: 'mine', note: 'n' }).note, null);
  assert.equal(buildPointRow({ id: 'c', kind: 'camera', fix, choice: 'mine', note: 'n' }).note, null);
  assert.deepEqual(p.directions, [270]);
  const o = buildPointRow({ id: 'y', kind: 'other', fix, choice: 'mine', note: '  Travaux  ', expiresAt: '2026-10-18T14:00:00.000Z' });
  assert.equal(o.note, 'Travaux');
  assert.equal(o.expires_at, '2026-10-18T14:00:00.000Z');
  assert.equal(buildPointRow({ id: 'z', kind: 'other', fix, choice: 'mine', note: '   ' }).note, null);
});

test('relevé caméra sans choix : vitesse par défaut', () => {
  assert.equal(buildPointRow({ id: 'x', kind: 'camera', fix, choice: 'mine' }).controls, 'speed');
});

test('relevé zone : début, tracé, limite, sens vide', () => {
  const path = [[43.2, 76.9], [north(60), 76.9]];
  assert.deepEqual(buildZoneRow({ id: 'z', path, maxspeed: 60 }), {
    id: 'z', kind: 'average_zone', lat: 43.2, lon: 76.9, path, maxspeed: 60, directions: [],
    controls: null, note: null, expires_at: null, overrides: null, hidden: false,
  });
});

import {
  kindForCamera, choiceFromDirections, findOverride, buildOverrideRow, buildHiddenRow,
  cardinalFr, zoneFeatures, isEditorRow,
} from '../src/editor-logic.js';

test('type OSM -> type de relevé', () => {
  assert.deepEqual(kindForCamera('speed'), { kind: 'speed_camera', controls: null });
  assert.deepEqual(kindForCamera('red_light'), { kind: 'camera', controls: 'red_light' });
  assert.deepEqual(kindForCamera('police'), { kind: 'police_post', controls: null });
  assert.deepEqual(kindForCamera('mobile'), { kind: 'mobile_control', controls: null });
  assert.deepEqual(kindForCamera('bizarre'), { kind: 'speed_camera', controls: null });
});

test('sens prérempli depuis les caps enregistrés', () => {
  assert.equal(choiceFromDirections([], 90), 'both');
  assert.equal(choiceFromDirections([10, 190], 90), 'both');
  assert.equal(choiceFromDirections([80], 90), 'mine');
  assert.equal(choiceFromDirections([265], 90), 'opposite');
  assert.equal(choiceFromDirections([80], null), 'both');
});

test('correction existante pour un radar OSM : la plus récente', () => {
  const rows = [{ id: 'a', overrides: 'osm-1' }, { id: 'b', overrides: null }, { id: 'c', overrides: 'osm-1' }];
  assert.equal(findOverride(rows, 'osm-1').id, 'c');
  assert.equal(findOverride(rows, 'osm-2'), null);
  assert.equal(findOverride(null, 'osm-1'), null);
});

test('ligne de correction OSM', () => {
  const row = buildOverrideRow({
    id: 'x', osmId: 'osm-1', kind: 'speed_camera', fix: { pos: { lat: 43.2, lon: 76.9 }, heading: 90 },
    choice: 'opposite', maxspeed: 60,
  });
  assert.deepEqual(row, {
    id: 'x', kind: 'speed_camera', lat: 43.2, lon: 76.9, directions: [270], maxspeed: 60,
    controls: null, note: null, expires_at: null, overrides: 'osm-1', hidden: false,
  });
});

test('ligne de masquage OSM', () => {
  const row = buildHiddenRow({ id: 'y', osmId: 'osm-1', kind: 'speed_camera', lat: 43.2, lon: 76.9 });
  assert.equal(row.hidden, true);
  assert.equal(row.overrides, 'osm-1');
  assert.equal(row.id, 'y');
  assert.deepEqual(row.directions, []);
  assert.equal(row.lat, 43.2);
});

test('points cardinaux', () => {
  assert.equal(cardinalFr(0), 'nord');
  assert.equal(cardinalFr(44), 'nord-est');
  assert.equal(cardinalFr(90), 'est');
  assert.equal(cardinalFr(200), 'sud');
  assert.equal(cardinalFr(350), 'nord');
  assert.equal(cardinalFr(-90), 'ouest');
});

test('tracés des zones de l\'éditeur en GeoJSON (lon, lat)', () => {
  const rows = [
    { id: 'z1', kind: 'average_zone', path: [[43.2, 76.9], [43.21, 76.91]], maxspeed: 60 },
    { id: 'z2', kind: 'average_zone', path: [[43.2, 76.9]], maxspeed: 60 }, // tracé invalide
    { id: 'z3', kind: 'average_zone', path: [[43.2, 76.9], [43.21, 76.91]], hidden: true },
    { id: 'p', kind: 'speed_camera', lat: 43.2, lon: 76.9 },
  ];
  const fc = zoneFeatures(rows);
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 1);
  assert.deepEqual(fc.features[0].geometry, { type: 'LineString', coordinates: [[76.9, 43.2], [76.91, 43.21]] });
  assert.equal(fc.features[0].properties.id, 'z1');
  assert.deepEqual(zoneFeatures(null).features, []);
});

test('élément de l\'éditeur ou radar OSM', () => {
  assert.equal(isEditorRow({ id: 'osm-n1' }), false);
  assert.equal(isEditorRow({ id: '3f2a-uuid' }), true);
});

test('caps arrondis en degrés entiers (colonne integer[] de la base)', () => {
  const fix = { pos: { lat: 43.2, lon: 76.9 }, heading: 245.6 };
  assert.deepEqual(buildPointRow({ id: 'a', kind: 'speed_camera', fix, choice: 'mine' }).directions, [246]);
  assert.deepEqual(buildPointRow({ id: 'a', kind: 'speed_camera', fix: { ...fix, heading: 359.7 }, choice: 'mine' }).directions, [0]);
  assert.deepEqual(buildPointRow({ id: 'a', kind: 'speed_camera', fix, choice: 'opposite' }).directions, [66]);
});
