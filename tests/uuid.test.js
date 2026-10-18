import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uuidV4 } from '../src/uuid.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('uuid : randomUUID quand il existe', () => {
  assert.equal(uuidV4({ randomUUID: () => 'x' }), 'x');
});

test('uuid : repli RFC 4122 v4 avec getRandomValues', () => {
  const fake = { getRandomValues: (a) => { a.fill(0xff); return a; } };
  assert.equal(uuidV4(fake), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  const zero = { getRandomValues: (a) => a };
  assert.equal(uuidV4(zero), '00000000-0000-4000-8000-000000000000');
  assert.match(uuidV4({ getRandomValues: (a) => globalThis.crypto.getRandomValues(a) }), V4);
});
