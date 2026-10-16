import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMaxspeed, effectiveLimit } from '../src/speedlimit.js';

test('nombre', () => assert.equal(parseMaxspeed('60'), 60));
test('mph', () => assert.equal(parseMaxspeed('30 mph'), 48));
test('urbain', () => assert.equal(parseMaxspeed('RU:urban'), 60));
test('urbain KZ', () => assert.equal(parseMaxspeed('KZ:urban'), 60));
test('rural', () => assert.equal(parseMaxspeed('KZ:rural'), 110));
test('living', () => assert.equal(parseMaxspeed('RU:living_street'), 20));
test('plusieurs valeurs -> la plus basse', () => assert.equal(parseMaxspeed('60;40'), 40));
for (const bad of ['none', 'signals', 'walk', '', undefined, 'abc'])
  test(`illisible: ${bad}`, () => assert.equal(parseMaxspeed(bad), null));
test('éditeur prioritaire', () => assert.deepEqual(effectiveLimit({ editorLimit: 70, osmLimit: 60, isUrban: true }), { kmh: 70, source: 'editor' }));
test('osm ensuite', () => assert.deepEqual(effectiveLimit({ osmLimit: 80, isUrban: true }), { kmh: 80, source: 'osm' }));
test('défaut ville', () => assert.deepEqual(effectiveLimit({ isUrban: true }), { kmh: 60, source: 'default' }));
test('défaut hors ville', () => assert.deepEqual(effectiveLimit({ isUrban: false }), { kmh: 110, source: 'default' }));
test('autoroute sans info', () => assert.deepEqual(effectiveLimit({ highway: 'motorway', isUrban: false }), { kmh: 110, source: 'default' }));
test('zone résidentielle', () => assert.deepEqual(effectiveLimit({ highway: 'living_street', isUrban: true }), { kmh: 20, source: 'default' }));
