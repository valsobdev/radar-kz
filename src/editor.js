// Menu éditeur sur la route : connexion, « Marquer ici », zones de vitesse moyenne, relevés en attente.
import { signIn, signOut, isEditor, saveRow, newId, pendingCount, onPendingChange, lastSyncError, flushNow } from './store.js';
import { ICONS } from './icons.js';
import { appendPathPoint, finishPath, pathLengthM, zoneError, expiresAtFor, buildPointRow, buildZoneRow, NOTE_KINDS } from './editor-logic.js';

const LIMITS = [20, 40, 50, 60, 70, 80, 90, 100, 110];
const TYPES = [
  { kind: 'speed_camera', label: 'Radar fixe', icon: 'speed' },
  { kind: 'camera', label: 'Caméra', icon: 'red_light' },
  { kind: 'police_post', label: 'Poste de police', icon: 'police' },
  { kind: 'mobile_control', label: 'Contrôle mobile', icon: 'mobile' },
  { kind: 'other', label: 'Autre', icon: 'other' },
  { kind: 'average_zone', label: 'Zone', icon: 'zone' },
];
const CONTROLS = [['speed', 'Vitesse'], ['red_light', 'Feu rouge'], ['other', 'Autre']];
const SENS = [['mine', 'Mon sens'], ['opposite', 'Sens opposé'], ['both', 'Les deux']];
const ENDS = [['1h', '1 h'], ['2h', '2 h'], ['4h', '4 h'], ['eod', 'Fin de journée']];
const label = (list, key) => list.find(([k]) => k === key)?.[1] ?? '';

const $ = (id) => document.getElementById(id);

// Petits constructeurs d'éléments (textContent : jamais de HTML injecté).
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function btn(text, onClick, cls = '') {
  const b = el('button', `ed-btn ${cls}`.trim(), text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function initEditor({ map, getFix, onChange }) {
  void map; // réservé à l'édition sur la carte (tâche suivante)
  const ui = {
    link: $('editor-link'), button: $('editor-button'), badge: $('editor-badge'),
    panel: $('editor-panel'), close: $('editor-close'), body: $('editor-body'),
    pending: $('editor-pending'), syncError: $('editor-sync-error'),
    login: $('login'), email: $('login-email'), password: $('login-password'),
    loginError: $('login-error'), loginSubmit: $('login-submit'), loginCancel: $('login-cancel'),
  };
  ui.button.querySelector('.editor-icon').innerHTML = ICONS.edit;

  let editor = false; // éditeur connecté (mémorisé hors réseau par le store)
  let draft = null; // relevé en cours : { fix, kind, controls, note, temporary, choice, maxspeed, end }
  let zone = null; // zone en cours d'enregistrement : { path, ended }
  let status = ''; // message affiché sur l'écran d'accueil du menu
  let onHome = false;

  // --- Bouton, compteur et ligne d'erreur ---
  function setEditor(yes) {
    editor = yes;
    ui.button.classList.toggle('hidden', !yes);
    ui.link.textContent = yes ? 'Éditeur connecté' : 'Éditeur';
    if (!yes) closePanel();
  }
  function refreshPending() {
    const n = pendingCount();
    ui.badge.textContent = String(n);
    ui.badge.classList.toggle('hidden', n === 0);
    ui.pending.textContent = `${n} en attente`;
    ui.pending.classList.toggle('hidden', n === 0);
    const err = lastSyncError();
    ui.syncError.textContent = err ?? '';
    ui.syncError.classList.toggle('hidden', !err);
  }
  onPendingChange(refreshPending);
  refreshPending();
  isEditor().then(setEditor);

  // --- Fenêtre du menu ---
  function openPanel() {
    refreshPending();
    ui.panel.classList.remove('hidden');
    home();
  }
  function closePanel() {
    ui.panel.classList.add('hidden');
    draft = null;
    if (zone) zone.ended = false; // une zone en cours continue d'enregistrer
    onHome = false;
  }
  ui.button.addEventListener('click', () => (ui.panel.classList.contains('hidden') ? openPanel() : closePanel()));
  ui.close.addEventListener('click', closePanel);

  function show(title, nodes) {
    onHome = false;
    ui.body.replaceChildren(...(title ? [el('p', 'ed-title', title)] : []), ...nodes);
  }
  function grid(items, cls = '') {
    const g = el('div', `ed-grid ${cls}`.trim());
    g.append(...items);
    return g;
  }
  const cancel = () => btn('Annuler', () => { draft = null; if (zone) zone.ended = false; home(); }, 'ghost');

  function zoneInfo() {
    return `Zone en cours : ${zone.path.length} point${zone.path.length > 1 ? 's' : ''}, ${Math.round(pathLengthM(zone.path))} m`;
  }
  function home() {
    const nodes = [];
    if (zone) {
      nodes.push(el('p', 'ed-info ed-zone-info', zoneInfo()));
      nodes.push(btn('Fin de zone ici', endZone, 'big primary'));
      nodes.push(btn('Annuler la zone', () => { zone = null; status = 'Zone annulée'; updateRecording(); home(); }, 'ghost'));
    } else {
      nodes.push(btn('Marquer ici', markHere, 'big primary'));
      nodes.push(btn('Début de zone ici', () => {
        const fix = getFix();
        if (!fix) { status = 'Position GPS inconnue'; home(); return; }
        startZone(fix);
      }));
    }
    if (status) nodes.push(el('p', 'ed-status', status));
    nodes.push(btn('Se déconnecter', logout, 'ghost small'));
    show(null, nodes);
    onHome = true;
  }

  // --- « Marquer ici » ---
  function markHere() {
    const fix = getFix();
    if (!fix) { status = 'Position GPS inconnue'; home(); return; }
    // Position et cap figés au moment du toucher.
    draft = { fix: { pos: { lat: fix.pos.lat, lon: fix.pos.lon }, heading: fix.heading ?? null } };
    status = '';
    chooseType();
  }
  function chooseType() {
    const items = TYPES.map((t) => {
      const b = btn('', () => {
        if (t.kind === 'average_zone') { startZone(draft.fix); return; }
        draft.kind = t.kind;
        if (t.kind === 'camera') chooseControls();
        else if (t.kind === 'other') chooseOther();
        else chooseSens();
      }, 'type');
      const icon = el('span', 'ed-icon');
      icon.innerHTML = ICONS[t.icon];
      b.append(icon, el('span', null, t.label));
      return b;
    });
    show('Quel élément ?', [grid(items), cancel()]);
  }
  function chooseControls() {
    show('La caméra contrôle :', [
      grid(CONTROLS.map(([k, l]) => btn(l, () => { draft.controls = k; chooseSens(); }))),
      cancel(),
    ]);
  }
  function chooseOther() {
    const note = noteInput();
    const pick = (temporary) => () => { draft.note = note.value; draft.temporary = temporary; chooseSens(); };
    show('Autre', [note, grid([btn('Temporaire (2 h)', pick(true)), btn('Permanent', pick(false))]), cancel()]);
  }
  function chooseSens() {
    if (draft.fix.heading == null) { // cap inconnu : les deux sens
      draft.choice = 'both';
      chooseLimit(false);
      return;
    }
    show('Sens contrôlé', [
      grid(SENS.map(([k, l]) => btn(l, () => { draft.choice = k; chooseLimit(false); }, k === 'mine' ? 'primary' : ''))),
      cancel(),
    ]);
  }
  // required : limite obligatoire (zone), sinon bouton « Aucune ».
  function chooseLimit(required) {
    const next = (v) => () => {
      draft.maxspeed = v;
      if (draft.kind === 'mobile_control') chooseEnd();
      else confirm();
    };
    const items = LIMITS.map((v) => btn(String(v), next(v), 'limit'));
    if (!required) items.push(btn('Aucune', next(null), 'limit'));
    show(required ? 'Limite de la zone (km/h)' : 'Limite (km/h, facultative)', [grid(items, 'limits'), cancel()]);
  }
  function chooseEnd() {
    show('Fin du contrôle', [
      grid(ENDS.map(([k, l]) => btn(l, () => { draft.end = k; confirm(); }, k === '2h' ? 'primary' : ''))),
      cancel(),
    ]);
  }

  function summary() {
    const type = TYPES.find((t) => t.kind === draft.kind)?.label ?? '';
    const lines = [draft.kind === 'camera' ? `${type} (${label(CONTROLS, draft.controls ?? 'speed')})` : type];
    if (draft.kind === 'average_zone') {
      lines.push(`${Math.round(pathLengthM(draft.path))} m, ${draft.path.length} points`);
    } else {
      lines.push(draft.fix.heading == null ? 'Les deux sens (cap inconnu)' : label(SENS, draft.choice));
    }
    lines.push(draft.maxspeed ? `Limite ${draft.maxspeed} km/h` : 'Sans limite');
    if (draft.kind === 'mobile_control') lines.push(`Fin : ${label(ENDS, draft.end ?? '2h')}`);
    if (draft.kind === 'other') {
      if (draft.note?.trim()) lines.push(`« ${draft.note.trim()} »`);
      lines.push(draft.temporary ? 'Temporaire (2 h)' : 'Permanent');
    }
    return lines;
  }
  function noteInput() {
    const note = el('input', 'ed-input');
    note.type = 'text';
    note.placeholder = 'Note (facultative)';
    note.maxLength = 120;
    note.value = draft.note ?? '';
    return note;
  }
  function confirm() {
    const box = el('div', 'ed-summary');
    for (const line of summary()) box.append(el('p', null, line));
    // Poste de police, contrôle mobile : note facultative ici (« Autre » l'a déjà saisie).
    const note = NOTE_KINDS.includes(draft.kind) && draft.kind !== 'other' ? noteInput() : null;
    const onSave = () => { if (note) draft.note = note.value; save(); };
    show('Enregistrer ?', [box, ...(note ? [note] : []), btn('Enregistrer', onSave, 'big primary'), cancel()]);
  }

  function save() {
    const now = Date.now();
    let row;
    if (draft.kind === 'average_zone') {
      row = buildZoneRow({ id: newId(), path: draft.path, maxspeed: draft.maxspeed });
      zone = null;
      updateRecording();
    } else {
      let expiresAt = null;
      if (draft.kind === 'mobile_control') expiresAt = expiresAtFor(draft.end ?? '2h', now);
      else if (draft.kind === 'other' && draft.temporary) expiresAt = expiresAtFor('2h', now);
      row = buildPointRow({
        id: newId(), kind: draft.kind, fix: draft.fix, choice: draft.choice,
        maxspeed: draft.maxspeed, controls: draft.controls, note: draft.note, expiresAt,
      });
    }
    draft = null;
    status = 'Relevé enregistré';
    // Mise à jour immédiate (relevé en file), puis une seconde fois après l'envoi réel.
    saveRow(row).then((sent) => { if (sent) onChange(); }).catch(() => {});
    onChange();
    home();
  }

  // --- Zone : « Début de zone ici » / « Fin de zone ici » ---
  function updateRecording() {
    ui.button.classList.toggle('recording', !!zone);
  }
  function startZone(fix) {
    zone = { path: appendPathPoint([], fix.pos), ended: false };
    draft = null;
    status = 'Zone commencée : touchez « Fin de zone ici » à la fin';
    updateRecording();
    home();
  }
  function endZone() {
    const fix = getFix();
    const path = fix ? finishPath(zone.path, fix.pos) : zone.path;
    const err = zoneError(path);
    if (err) { status = err; home(); return; } // la zone continue d'enregistrer
    zone.ended = true; // tracé figé pendant le choix de la limite
    draft = { kind: 'average_zone', path };
    status = '';
    chooseLimit(true);
  }

  // --- Connexion / déconnexion ---
  function showLogin() {
    ui.loginError.textContent = '';
    ui.password.value = '';
    ui.login.classList.remove('hidden');
    ui.email.focus();
  }
  function hideLogin() {
    ui.login.classList.add('hidden');
    ui.password.value = '';
  }
  ui.link.addEventListener('click', () => (editor ? openPanel() : showLogin()));
  ui.loginCancel.addEventListener('click', hideLogin);
  ui.login.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = ui.email.value.trim();
    const password = ui.password.value;
    if (!email || !password) { ui.loginError.textContent = 'Email et mot de passe requis'; return; }
    ui.loginSubmit.disabled = true;
    ui.loginSubmit.textContent = 'Connexion…';
    ui.loginError.textContent = '';
    try {
      const res = await signIn(email, password);
      if (!res.ok) { ui.loginError.textContent = res.error; return; }
      const yes = await isEditor();
      if (!yes) {
        ui.loginError.textContent = "Ce compte n'est pas éditeur";
        await signOut(); // pas de session ouverte pour un compte sans droit d'écriture
        return;
      }
      setEditor(true);
      flushNow(); // relevés faits hors connexion (ou refusés pour session expirée) : envoi maintenant
      hideLogin();
      refreshPending();
    } finally {
      ui.loginSubmit.disabled = false;
      ui.loginSubmit.textContent = 'Se connecter';
    }
  });
  async function logout() {
    zone = null;
    draft = null;
    status = '';
    updateRecording();
    await signOut();
    setEditor(false);
  }

  // Appelé par main.js à chaque point GPS accepté : échantillonne le tracé de la zone en cours.
  function onFix(fix) {
    if (!zone || zone.ended || !fix?.pos) return;
    const before = zone.path.length;
    zone.path = appendPathPoint(zone.path, fix.pos);
    if (onHome && zone.path.length !== before) {
      const info = ui.body.querySelector('.ed-zone-info');
      if (info) info.textContent = zoneInfo();
    }
  }

  return { onFix };
}
