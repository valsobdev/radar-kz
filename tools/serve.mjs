// Petit serveur local pour tester la page sur le PC : node tools/serve.mjs puis http://localhost:8080
// Il n'écoute que sur ce PC (127.0.0.1) : il n'est pas visible depuis le réseau.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// Chemin du fichier à servir pour une adresse demandée, ou null si on refuse
// (adresse mal encodée, sortie du dossier du projet, dossier interne comme .git).
export function resolveRequestPath(root, rawUrl) {
  let path;
  try {
    path = decodeURIComponent(new URL(rawUrl, 'http://x').pathname);
  } catch {
    return null;
  }
  const file = normalize(join(root, path.endsWith('/') ? path + 'index.html' : path));
  if (!file.startsWith(root)) return null;
  if (file.slice(root.length).split(sep).some((part) => part.startsWith('.'))) return null;
  return file;
}

const runDirectly = process.argv[1] && normalize(process.argv[1]) === fileURLToPath(import.meta.url);
if (runDirectly) {
  createServer(async (req, res) => {
    const file = resolveRequestPath(ROOT, req.url);
    if (!file) { res.writeHead(403).end('Refusé'); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('Introuvable');
    }
  }).listen(PORT, '127.0.0.1', () => console.log(`Radar KZ : http://localhost:${PORT}  (simulation : http://localhost:${PORT}/?sim=1)`));
}
