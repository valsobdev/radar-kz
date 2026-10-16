import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { resolveRequestPath } from '../tools/serve.mjs';

const ROOT = join('C:', 'projet', 'x').slice(0, -1); // dossier terminé par le séparateur, comme dans serve.mjs
test('revue: page d\'accueil', () => assert.equal(resolveRequestPath(ROOT, '/?sim=1'), join(ROOT, 'index.html')));
test('revue: fichier normal', () => assert.equal(resolveRequestPath(ROOT, '/src/main.js'), join(ROOT, 'src', 'main.js')));
test('revue: adresse mal encodée -> refus sans planter', () => assert.equal(resolveRequestPath(ROOT, '/%'), null));
test('revue: sortie du dossier refusée', () => assert.equal(resolveRequestPath(ROOT, '/..%2F..%2Fsecret.txt'), null));
test('revue: dossiers internes refusés', () => {
  assert.equal(resolveRequestPath(ROOT, '/.git/config'), null);
  assert.equal(resolveRequestPath(ROOT, '/.superpowers/x'), null);
  assert.equal(resolveRequestPath(ROOT, '/.claude/settings.local.json'), null);
});
