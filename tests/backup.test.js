import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBackup } from '../tools/backup-elements.mjs';

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
