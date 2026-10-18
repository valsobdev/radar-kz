// Lecture des relevés de l'éditeur dans Supabase, avec copie locale pour travailler sans réseau.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createQueue } from './queue.js';

const CACHE_KEY = 'radar-kz:rows';
const TIMEOUT_MS = 5000;

// Stockage local ; si le navigateur le bloque, repli sur la mémoire pour ne pas casser le chargement.
const storage = (() => {
  try {
    const ls = window.localStorage;
    ls.getItem('radar-kz:probe');
    return ls;
  } catch {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
  }
})();

let client = null;
// Client Supabase créé à la demande (la bibliothèque est chargée par index.html).
export function getClient() {
  if (!client && window.supabase?.createClient) client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

function readCache() {
  try {
    const rows = JSON.parse(storage.getItem(CACHE_KEY));
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

// Renvoie les lignes de la base ; en cas d'échec, la dernière copie locale, sinon []. Ne lève jamais.
export async function loadRows() {
  try {
    const sb = getClient();
    if (!sb) throw new Error('Supabase indisponible');
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('délai dépassé')), TIMEOUT_MS); });
    // Tri par date : la correction la plus récente d'un même radar passe en dernier et l'emporte.
    const { data, error } = await Promise.race([sb.from('elements').select('*').order('updated_at'), timeout]).finally(() => clearTimeout(timer));
    if (error || !Array.isArray(data)) throw error ?? new Error('réponse invalide');
    try { storage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* stockage plein ou refusé */ }
    return data;
  } catch {
    return readCache();
  }
}

// --- Écriture : file d'attente hors réseau et connexion de l'éditeur ---
const EDITOR_KEY = 'radar-kz:is-editor';
const SERVER_FIELDS = ['created_by', 'created_at', 'updated_at']; // posés par le serveur

const queue = createQueue(storage);
const listeners = new Set();
const notify = () => listeners.forEach((cb) => { try { cb(queue.pending()); } catch { /* écouteur fautif */ } });

export const newId = () => crypto.randomUUID();
export const pendingCount = () => queue.pending();
// Appelle cb(n) à chaque changement de la file ; renvoie la fonction de désinscription.
export function onPendingChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

async function send(item) {
  const sb = getClient();
  if (!sb) throw new Error('Supabase indisponible');
  let res;
  if (item.op === 'delete') {
    res = await sb.from('elements').delete().eq('id', item.id);
  } else {
    const row = { ...item.row };
    for (const f of SERVER_FIELDS) delete row[f];
    res = await sb.from('elements').upsert(row, { onConflict: 'id' });
  }
  if (res.error) throw res.error;
}

let flushing = null;
async function flush() {
  // Un seul flush à la fois ; la copie locale n'est rafraîchie qu'une fois par envoi réel.
  if (!flushing) {
    flushing = (async () => {
      const sent = await queue.flush(send);
      if (sent > 0) await loadRows();
      notify();
      return sent;
    })().finally(() => { flushing = null; });
  }
  return flushing;
}

// Envoi immédiat de la file (ex. après connexion). Ne lève jamais.
export function flushNow() {
  return flush().catch(() => 0);
}

// Message court pour l'interface si le dernier envoi a échoué, sinon null.
export function lastSyncError() {
  const e = queue.lastError();
  if (!e) return null;
  const msg = String(e.message ?? '');
  if (e.code === '42501' || e.status === 401 || e.status === 403 || /jwt|row-level security/i.test(msg)) return 'Connexion éditeur expirée, reconnectez-vous';
  if (e.code) return `Relevé refusé par la base : ${msg}`;
  return 'Pas de réseau';
}

// Relevés en attente d'envoi : lignes à créer/modifier et ids à supprimer.
export function pendingRows() {
  const snap = queue.snapshot();
  return {
    upserts: snap.filter((e) => e.op === 'upsert').map((e) => e.row),
    deletes: snap.filter((e) => e.op === 'delete').map((e) => e.id),
  };
}

export function saveRow(row) {
  queue.put(row);
  notify();
  return navigator.onLine ? flush() : Promise.resolve(0);
}
export function deleteRow(id) {
  queue.remove(id);
  notify();
  return navigator.onLine ? flush() : Promise.resolve(0);
}

window.addEventListener('online', () => { if (queue.pending()) flush(); });
// Au démarrage : envoie ce qui était resté en file lors d'une session précédente.
if (navigator.onLine && queue.pending()) flush();

export async function signIn(email, password) {
  try {
    const sb = getClient();
    if (!sb) return { ok: false, error: 'Pas de réseau' };
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (!error) return { ok: true }; // l'envoi de la file est fait par le menu, une fois le compte vérifié éditeur
    const offline = /fetch|network|failed/i.test(error.message ?? '') || error.status === 0;
    return { ok: false, error: offline ? 'Pas de réseau' : 'Email ou mot de passe incorrect' };
  } catch {
    return { ok: false, error: 'Pas de réseau' };
  }
}

export async function signOut() {
  try { storage.removeItem(EDITOR_KEY); } catch { /* ignoré */ }
  try { await getClient()?.auth.signOut(); } catch { /* hors réseau : la session locale est quand même effacée */ }
}

// Vrai si l'utilisateur connecté est éditeur ; mémorisé pour afficher le bouton hors réseau.
export async function isEditor() {
  try {
    const sb = getClient();
    if (!sb) throw new Error('Supabase indisponible');
    const { data, error } = await sb.rpc('is_editor');
    if (error) throw error;
    const yes = data === true;
    try { storage.setItem(EDITOR_KEY, yes ? '1' : '0'); } catch { /* ignoré */ }
    return yes;
  } catch {
    try { return storage.getItem(EDITOR_KEY) === '1'; } catch { return false; }
  }
}
