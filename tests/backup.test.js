import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBackup, fetchAll } from '../tools/backup-elements.mjs';

const a = { id: 2, type: 'camera', lat: 43.2, lng: 76.9 };
const b = { id: 1, lng: 76.8, lat: 43.1, type: 'zone' };

test('ordre stable', () => {
  const lines = toBackup([a, b]).trim().split('\n');
  assert.equal(JSON.parse(lines[1].replace(/,$/, '')).id, 1);
  assert.equal(JSON.parse(lines[2].replace(/,$/, '')).id, 2);
});

test('même contenu → même texte', () => {
  const b2 = { type: 'zone', lat: 43.1, id: 1, lng: 76.8 };
  assert.equal(toBackup([a, b]), toBackup([b2, a]));
});

test('liste vide', () => assert.equal(toBackup([]), '[]\n'));

test('clés triées dans une ligne', () => {
  const line = toBackup([b]).split('\n')[1];
  assert.equal(line, '{"id":1,"lat":43.1,"lng":76.8,"type":"zone"}');
});

const page = (from, n) => Array.from({ length: n }, (_, i) => ({ id: from + i }));

test('pagination : 2 pages pleines + une courte', async () => {
  const offsets = [];
  const data = { 0: page(0, 1000), 1000: page(1000, 1000), 2000: page(2000, 5) };
  const rows = await fetchAll(async (o) => { offsets.push(o); return data[o]; });
  assert.equal(rows.length, 2005);
  assert.deepEqual(offsets, [0, 1000, 2000]);
});

test('pagination : première page vide → []', async () => {
  assert.deepEqual(await fetchAll(async () => []), []);
});
