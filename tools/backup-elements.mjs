// Sauvegarde des relevés (table `elements`) dans data/editor-backup.json.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/config.js';

const PAGE = 1000; // plafond de PostgREST par requête

// Clés triées : le texte ne change que si le contenu change.
function sortKeys(row) {
  return Object.fromEntries(Object.keys(row).sort().map((k) => [k, row[k]]));
}

export function toBackup(rows) {
  if (!rows.length) return '[]\n';
  const sorted = [...rows].sort((x, y) => (x.id > y.id) - (x.id < y.id));
  return '[\n' + sorted.map((r) => JSON.stringify(sortKeys(r))).join(',\n') + '\n]\n';
}

// Lit page par page jusqu'à une page incomplète ; fetchPage(offset) renvoie un tableau.
export async function fetchAll(fetchPage) {
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await fetchPage(offset);
    if (!Array.isArray(rows)) throw new Error('réponse inattendue (pas une liste)');
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

async function main() {
  const fetchPage = async (offset) => {
    const url = `${SUPABASE_URL}/rest/v1/elements?select=*&order=id&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
    if (!res.ok) throw new Error(`le serveur a répondu ${res.status}`);
    return res.json();
  };
  try {
    const rows = await fetchAll(fetchPage);
    const out = fileURLToPath(new URL('../data/editor-backup.json', import.meta.url));
    writeFileSync(out, toBackup(rows));
    console.log(`${rows.length} élément(s) sauvegardé(s).`);
  } catch (e) {
    console.error(`Sauvegarde impossible : ${e.message}.`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
