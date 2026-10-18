import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../src/queue.js';

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } };
}
const okSend = (log) => async (op) => { log.push(op); };

test('put puis flush envoie un upsert', async () => {
  const q = createQueue(fakeStorage());
  q.put({ id: 'a', lat: 1 });
  assert.equal(q.pending(), 1);
  const log = [];
  assert.equal(await q.flush(okSend(log)), 1);
  assert.deepEqual(log, [{ op: 'upsert', row: { id: 'a', lat: 1 } }]);
  assert.equal(q.pending(), 0);
});

test('deux put même id → un seul envoi (le dernier)', async () => {
  const q = createQueue(fakeStorage());
  q.put({ id: 'a', lat: 1 });
  q.put({ id: 'a', lat: 2 });
  assert.equal(q.pending(), 1);
  const log = [];
  await q.flush(okSend(log));
  assert.deepEqual(log, [{ op: 'upsert', row: { id: 'a', lat: 2 } }]);
});

test('échec d’envoi → reste en file', async () => {
  const q = createQueue(fakeStorage());
  q.put({ id: 'a' });
  q.put({ id: 'b' });
  const n = await q.flush(async () => { throw new Error('hors réseau'); });
  assert.equal(n, 0);
  assert.equal(q.pending(), 2);
});

test('remove après put → un seul delete', async () => {
  const q = createQueue(fakeStorage());
  q.put({ id: 'a' });
  q.remove('a');
  assert.equal(q.pending(), 1);
  const log = [];
  await q.flush(okSend(log));
  assert.deepEqual(log, [{ op: 'delete', id: 'a' }]);
});

test('put après remove → upsert', async () => {
  const q = createQueue(fakeStorage());
  q.remove('a');
  q.put({ id: 'a', lat: 3 });
  const log = [];
  await q.flush(okSend(log));
  assert.deepEqual(log, [{ op: 'upsert', row: { id: 'a', lat: 3 } }]);
});

test('relu depuis le stockage après rechargement', () => {
  const st = fakeStorage();
  createQueue(st).put({ id: 'a', lat: 1 });
  const q2 = createQueue(st);
  assert.equal(q2.pending(), 1);
});

test('stockage corrompu → file vide', () => {
  const q = createQueue(fakeStorage({ 'radar-kz:queue': '{pas du json' }));
  assert.equal(q.pending(), 0);
});

test('flush deux fois → aucun doublon', async () => {
  const q = createQueue(fakeStorage());
  q.put({ id: 'a' });
  const log = [];
  const send = async (op) => { await Promise.resolve(); log.push(op); };
  const [n1, n2] = await Promise.all([q.flush(send), q.flush(send)]);
  assert.equal(log.length, 1);
  assert.equal(n1, 1);
  assert.equal(n2, 1);
  assert.equal(await q.flush(send), 0);
  assert.equal(log.length, 1);
});

test('premier échec arrête l’envoi et garde la suite', async () => {
  const q = createQueue(fakeStorage());
  q.put({ id: 'a' });
  q.put({ id: 'b' });
  q.put({ id: 'c' });
  const seen = [];
  const n = await q.flush(async (op) => { seen.push(op.row.id); if (op.row.id === 'b') throw new Error('x'); });
  assert.equal(n, 1);
  assert.deepEqual(seen, ['a', 'b']);
  assert.equal(q.pending(), 2);
});
