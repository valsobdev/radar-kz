import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZoneTracker, snapZonePath, ENTRY_RADIUS_M } from '../src/zones.js';
import { buildRoadIndex } from '../src/roads.js';

// Ligne droite plein nord de 2 km, limite 60
const zone = { id: 'z1', maxspeed: 60, path: [[43.200, 76.900], [43.218, 76.900]] };
const M_PER_DEG = (Math.PI / 180) * 6371000;
const at = (m) => ({ lat: 43.200 + m / M_PER_DEG, lon: 76.900 }); // m mètres après le début
// Envoie des points GPS toutes les 2,5 s de fromM à toM (en ms: t0 → t0 + durée), renvoie le dernier résultat
function drive(t, fromM, toM, t0, t1) {
  let r = null, warned = false;
  const n = Math.ceil((t1 - t0) / 2500);
  for (let i = 1; i <= n; i++) {
    r = t.update(at(fromM + ((toM - fromM) * i) / n), 0, 50, t0 + ((t1 - t0) * i) / n);
    if (r?.warnAverage) warned = true;
  }
  return r && { ...r, warnAverage: warned }; // warnAverage = vrai si un des points a averti
}
const near = (actual, expected, tol) => assert.ok(Math.abs(actual - expected) <= tol, `${actual} vs ${expected} ±${tol}`);

test('entrée au début, bon sens', () => {
  const r = createZoneTracker([zone]).update({ lat: 43.2002, lon: 76.900 }, 0, 50, 0);
  assert.equal(r.entered, true);
  assert.equal(r.zone.id, 'z1');
  near(r.totalM, 2000, 5);
  assert.ok(ENTRY_RADIUS_M === 50);
});

test('pas d’entrée en sens inverse', () => {
  assert.equal(createZoneTracker([zone]).update({ lat: 43.2002, lon: 76.900 }, 180, 50, 0), null);
});

test('cap inconnu : pas d’entrée', () => {
  assert.equal(createZoneTracker([zone]).update({ lat: 43.2002, lon: 76.900 }, null, 50, 0), null);
});

test('zone rejointe par le milieu ignorée', () => {
  const t = createZoneTracker([zone]);
  assert.equal(t.update({ lat: 43.209, lon: 76.900 }, 0, 50, 0), null);
  assert.equal(t.update({ lat: 43.2091, lon: 76.900 }, 0, 50, 1000), null);
});

test('distance restante', () => {
  const t = createZoneTracker([zone]);
  t.update({ lat: 43.2002, lon: 76.900 }, 0, 50, 0);
  const r = drive(t, 22, 1000, 0, 50000);
  near(r.remainingM, 1000, 10);
  assert.equal(r.entered, false);
});

test('moyenne depuis l’entrée', () => {
  const t = createZoneTracker([zone]);
  t.update(at(0), 0, 50, 0);
  const r = drive(t, 0, 1000, 0, 50000);
  near(r.averageKmh, 72, 0.01); // 1000 m en 50 s
  assert.equal(r.averageOver, true);
  assert.equal(r.warnAverage, true);
});

test('avertissement une seule fois', () => {
  const t = createZoneTracker([zone]);
  t.update(at(0), 0, 50, 0);
  drive(t, 0, 1000, 0, 50000);
  const r = t.update(at(1100), 0, 50, 51000);
  assert.equal(r.averageOver, true);
  assert.equal(r.warnAverage, false);
});

test('réarmé après redescente de 5 km/h', () => {
  const t = createZoneTracker([zone]);
  t.update(at(0), 0, 50, 0);
  assert.equal(drive(t, 0, 1000, 0, 50000).warnAverage, true); // 72
  let r;
  for (let s = 54; s <= 70; s += 4) r = t.update(at(1000), 0, 0, s * 1000); // à l'arrêt
  assert.ok(r.averageKmh <= 55 && !r.averageOver);
  r = drive(t, 1000, 1600, 70000, 75000); // 76,8 km/h de moyenne
  assert.equal(r.warnAverage, true);
});

test('sortie du tracé', () => {
  const t = createZoneTracker([zone]);
  t.update(at(0), 0, 50, 0);
  const east = { lat: 43.209, lon: 76.900 + 60 / (M_PER_DEG * Math.cos((43.209 * Math.PI) / 180)) };
  assert.equal(t.update(east, 0, 50, 1000), null);
});

test('trou GPS', () => {
  const t = createZoneTracker([zone]);
  t.update(at(0), 0, 50, 0);
  assert.ok(t.update(at(100), 0, 50, 4000));
  assert.equal(t.update(at(200), 0, 50, 10000), null); // 6 s sans point
  assert.equal(t.update(at(300), 0, 50, 11000), null); // plus suivi
});

test('fin de zone', () => {
  const t = createZoneTracker([zone]);
  t.update({ lat: 43.2002, lon: 76.900 }, 0, 50, 0);
  assert.equal(t.update({ lat: 43.2181, lon: 76.900 }, 0, 50, 1000), null);
});

test('après une sortie, pas de reprise au milieu', () => {
  const t = createZoneTracker([zone]);
  t.update(at(0), 0, 50, 0);
  t.update(at(100), 0, 50, 10000); // trou GPS : fin
  assert.equal(t.update(at(150), 0, 50, 11000), null);
  assert.equal(t.update(at(200), 0, 50, 12000), null);
});

test('plusieurs zones : la plus proche du début', () => {
  const far = { id: 'far', maxspeed: 60, path: [[43.2003, 76.9], [43.218, 76.9]] };
  const r = createZoneTracker([far, zone]).update(at(10), 0, 50, 0);
  assert.equal(r.zone.id, 'z1');
});

// Route de test : 3 sommets, puis une route sans lien
const road = { id: 'r', highway: 'primary', maxspeed: 60, oneway: false, c: [43.200, 76.900, 43.205, 76.900, 43.205, 76.905, 43.210, 76.905] };
const other = { id: 'o', highway: 'primary', maxspeed: 60, oneway: false, c: [43.200, 76.910, 43.210, 76.910] };
const idx = buildRoadIndex([road, other]);

test('snap: même route', () => {
  const path = snapZonePath(idx, { lat: 43.201, lon: 76.9001 }, { lat: 43.2095, lon: 76.905 });
  assert.deepEqual(path, [[43.201, 76.9001], [43.205, 76.900], [43.205, 76.905], [43.2095, 76.905]]);
});

test('snap: sens inverse, sommets dans l’ordre du trajet', () => {
  const path = snapZonePath(idx, { lat: 43.2095, lon: 76.905 }, { lat: 43.201, lon: 76.9001 });
  assert.deepEqual(path, [[43.2095, 76.905], [43.205, 76.905], [43.205, 76.900], [43.201, 76.9001]]);
});

test('snap: routes différentes → ligne droite', () => {
  const s = { lat: 43.201, lon: 76.900 }, e = { lat: 43.209, lon: 76.910 };
  assert.deepEqual(snapZonePath(idx, s, e), [[43.201, 76.900], [43.209, 76.910]]);
});

test('snap: point hors route → ligne droite', () => {
  const s = { lat: 43.201, lon: 76.900 }, e = { lat: 43.209, lon: 76.920 };
  assert.deepEqual(snapZonePath(idx, s, e), [[43.201, 76.900], [43.209, 76.920]]);
});

test('revue: approche lente à 49 m du début, une seule entrée et jamais de trou', () => {
  const t = createZoneTracker([zone]);
  const results = [];
  // 20 km/h = 5,5 m/s ; un point par seconde depuis 49 m avant le début
  for (let i = 0; i < 12; i++) results.push(t.update(at(-49 + i * 5.5), 0, 20, i * 1000));
  assert.equal(results.filter((r) => r?.entered).length, 1);
  assert.ok(results.every((r) => r !== null), 'la zone ne doit jamais être quittée');
});
