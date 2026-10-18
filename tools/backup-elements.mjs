// Sauvegarde des relevés (table `elements`) dans data/editor-backup.json.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/config.js';

// Clés triées : le texte ne change que si le contenu change.
function sortKeys(row) {
  return Object.fromEntries(Object.keys(row).sort().map((k) => [k, row[k]]));
}

export function toBackup(rows) {
  if (!rows.length) return '[]\n';
  const sorted = [...rows].sort((x, y) => (x.id > y.id) - (x.id < y.id));
  return '[\n' + sorted.map((r) => JSON.stringify(sortKeys(r))).join(',\n') + '\n]\n';
}

async function main() {
  const url = `${SUPABASE_URL}/rest/v1/elements?select=*&order=id`;
  let res;
  try {
    res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  } catch (e) {
    console.error(`Sauvegarde impossible : réseau indisponible (${e.message}).`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`Sauvegarde impossible : le serveur a répondu ${res.status}.`);
    process.exit(1);
  }
  const rows = await res.json();
  const out = fileURLToPath(new URL('../data/editor-backup.json', import.meta.url));
  writeFileSync(out, toBackup(rows));
  console.log(`${rows.length} élément(s) sauvegardé(s).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
