// File d'attente des modifications à envoyer à la base : survit au rechargement, une entrée par id.
const KEY = 'radar-kz:queue';

export function createQueue(storage) {
  let entries = load(); // [{ id, op: 'upsert'|'delete', row? }] dans l'ordre d'insertion
  let inFlight = null;

  function load() {
    try {
      const list = JSON.parse(storage.getItem(KEY));
      return Array.isArray(list) ? list.filter((e) => e && e.id && (e.op === 'upsert' || e.op === 'delete')) : [];
    } catch { return []; }
  }
  function save() {
    try { storage.setItem(KEY, JSON.stringify(entries)); } catch { /* stockage plein ou refusé */ }
  }
  // La dernière opération sur un id remplace la précédente (en gardant sa place dans l'ordre).
  function set(entry) {
    const i = entries.findIndex((e) => e.id === entry.id);
    if (i >= 0) entries[i] = entry; else entries.push(entry);
    save();
  }

  async function run(send) {
    let sent = 0;
    while (entries.length) {
      const entry = entries[0];
      try {
        await send(entry.op === 'delete' ? { op: 'delete', id: entry.id } : { op: 'upsert', row: entry.row });
      } catch { break; }
      // Retrait seulement si l'entrée n'a pas été remplacée pendant l'envoi.
      const i = entries.indexOf(entry);
      if (i >= 0) entries.splice(i, 1);
      save();
      sent++;
    }
    return sent;
  }

  return {
    put(row) { set({ id: row.id, op: 'upsert', row }); },
    remove(id) { set({ id, op: 'delete' }); },
    pending() { return entries.length; },
    // Envoie dans l'ordre ; s'arrête au premier échec. Un seul envoi à la fois.
    flush(send) {
      if (!inFlight) inFlight = run(send).finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
