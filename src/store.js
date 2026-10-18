// Lecture des relevés de l'éditeur dans Supabase, avec copie locale pour travailler sans réseau.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const CACHE_KEY = 'radar-kz:rows';
const TIMEOUT_MS = 5000;

let client = null;
// Client Supabase créé à la demande (la bibliothèque est chargée par index.html).
export function getClient() {
  if (!client && window.supabase?.createClient) client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

function readCache() {
  try {
    const rows = JSON.parse(localStorage.getItem(CACHE_KEY));
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

// Renvoie les lignes de la base ; en cas d'échec, la dernière copie locale, sinon []. Ne lève jamais.
export async function loadRows() {
  try {
    const sb = getClient();
    if (!sb) throw new Error('Supabase indisponible');
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), TIMEOUT_MS));
    const { data, error } = await Promise.race([sb.from('elements').select('*'), timeout]);
    if (error || !Array.isArray(data)) throw error ?? new Error('réponse invalide');
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* stockage plein ou refusé */ }
    return data;
  } catch {
    return readCache();
  }
}
