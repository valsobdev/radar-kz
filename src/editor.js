// Menu éditeur : connexion, « Marquer ici », zones de vitesse moyenne, relevés en attente,
// et mode « Carte » (placer, déplacer, modifier, supprimer, corriger ou masquer un radar OSM).
import { signIn, signOut, isEditor, saveRow, deleteRow, newId, pendingCount, onPendingChange, lastSyncError, flushNow } from './store.js';
import { ICONS } from './icons.js';
import {
  appendPathPoint, finishPath, pathLengthM, zoneError, expiresAtFor, buildPointRow, buildZoneRow, NOTE_KINDS,
  isEditorRow, kindForCamera, choiceFromDirections, findOverride, buildOverrideRow, buildHiddenRow, cardinalFr, zoneFeatures,
} from './editor-logic.js';
import { roadBearingAt } from './roads.js';
import { snapZonePath } from './zones.js';

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
const CAM_LABELS = { speed: 'Radar fixe', red_light: 'Caméra feu rouge', police: 'Poste de police', mobile: 'Contrôle mobile', other: 'Autre' };
const VIOLET = '#6c5cff';
const ZONES_SRC = 'editor-zones'; // zones de l'éditeur tracées en mode carte
const DRAFT_SRC = 'editor-draft'; // zone en cours de dessin ou choisie
const toward = (bearing) => {
  const c = cardinalFr(bearing);
  return /^[eo]/.test(c) ? `vers l'${c}` : `vers le ${c}`;
};

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

export function initEditor({ map, getFix, onChange, getRoadIndex = () => null }) {
  const ui = {
    link: $('editor-link'), button: $('editor-button'), badge: $('editor-badge'),
    panel: $('editor-panel'), close: $('editor-close'), body: $('editor-body'),
    pending: $('editor-pending'), syncError: $('editor-sync-error'),
    login: $('login'), email: $('login-email'), password: $('login-password'),
    loginError: $('login-error'), loginSubmit: $('login-submit'), loginCancel: $('login-cancel'),
  };
  ui.button.querySelector('.editor-icon').innerHTML = ICONS.edit;

  let editor = false; // éditeur connecté (mémorisé hors réseau par le store)
  // Relevé en cours : { source: 'route' | 'map', fix, kind, controls, note, temporary, choice, maxspeed, end,
  //   id (modification), base (ligne modifiée), osmId (correction d'un radar OSM), path (zone) }
  let draft = null;
  let zone = null; // zone en cours d'enregistrement : { path, ended }
  let status = ''; // message de l'accueil du menu (ou de la barre du mode carte)
  let onHome = false;

  // Mode carte
  let mapMode = false;
  let tap = null; // dessin de zone : { step: 'zone-start' } | { step: 'zone-end', start, marker }
  let rows = []; // relevés de l'éditeur (base + file), donnés par main.js
  let entries = []; // [{ marker, cam }] marqueurs de la carte
  let loaded = false; // données chargées (« Démarrer » touché)
  let draftMarker = null; // point touché pendant le choix du type
  let draggedAt = 0; // un glisser se termine par un « click » à ignorer

  // --- Bouton, compteur et ligne d'erreur ---
  function setEditor(yes) {
    editor = yes;
    ui.button.classList.toggle('hidden', !yes);
    ui.link.textContent = yes ? 'Éditeur connecté' : 'Éditeur';
    if (!yes) { exitMapMode(); closePanel(); }
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
  function showPanel() {
    refreshPending();
    ui.panel.classList.remove('hidden');
  }
  function closePanel() {
    ui.panel.classList.add('hidden');
    clearDraftMarks();
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
  const cancel = () => btn('Annuler', () => { draft = null; if (zone) zone.ended = false; back(); }, 'ghost');
  // Fin d'une étape : accueil du menu, ou retour à la carte en mode carte.
  function back() {
    if (mapMode) { closePanel(); renderBar(); } else home();
  }

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
    if (map && loaded) nodes.push(mapMode ? btn('Quitter le mode carte', exitMapMode) : btn('Carte', enterMapMode));
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
    draft = { source: 'route', fix: { pos: { lat: fix.pos.lat, lon: fix.pos.lon }, heading: fix.heading ?? null } };
    status = '';
    chooseType();
  }
  // Valeur préremplie (modification, correction) : bouton entouré.
  const sel = (yes) => (yes ? 'selected' : '');
  function chooseType() {
    const types = draft.id ? TYPES.filter((t) => t.kind !== 'average_zone') : TYPES; // modification : pas de zone
    const items = types.map((t) => {
      const b = btn('', () => {
        if (t.kind === 'average_zone') {
          if (draft.source === 'map') startMapZone();
          else startZone(draft.fix);
          return;
        }
        draft.kind = t.kind;
        if (t.kind === 'camera') chooseControls();
        else if (t.kind === 'other') chooseOther();
        else chooseSens();
      }, `type ${sel(draft.id && t.kind === draft.kind)}`);
      const icon = el('span', 'ed-icon');
      icon.innerHTML = ICONS[t.icon];
      b.append(icon, el('span', null, t.label));
      return b;
    });
    show('Quel élément ?', [grid(items), cancel()]);
  }
  function chooseControls() {
    show('La caméra contrôle :', [
      grid(CONTROLS.map(([k, l]) => btn(l, () => { draft.controls = k; chooseSens(); }, sel(draft.id && k === draft.controls)))),
      cancel(),
    ]);
  }
  function chooseOther() {
    const note = noteInput();
    const pick = (temporary) => () => { draft.note = note.value; draft.temporary = temporary; chooseSens(); };
    const pre = (t) => sel(draft.id && draft.base?.kind === 'other' && !!draft.temporary === t);
    show('Autre', [note, grid([btn('Temporaire (2 h)', pick(true), pre(true)), btn('Permanent', pick(false), pre(false))]), cancel()]);
  }
  // Sens proposés : par rapport au cap (route) ou à la route sous le doigt (carte).
  function sensChoices() {
    if (draft.source !== 'map') return SENS;
    const h = draft.fix.heading;
    return [['mine', `Sens de la route (${toward(h)})`], ['opposite', `Sens inverse (${toward(h + 180)})`], ['both', 'Les deux']];
  }
  function chooseSens() {
    if (draft.fix.heading == null) { // cap inconnu ou pas de route sous le doigt : les deux sens
      draft.choice = 'both';
      chooseLimit(false);
      return;
    }
    const prefilled = draft.id || draft.osmId;
    show('Sens contrôlé', [
      grid(sensChoices().map(([k, l]) => {
        const cls = prefilled ? sel(k === draft.choice) : (k === 'mine' && draft.source !== 'map' ? 'primary' : '');
        return btn(l, () => { draft.choice = k; chooseLimit(false); }, cls);
      }), draft.source === 'map' ? 'one' : ''),
      cancel(),
    ]);
  }
  // required : limite obligatoire (zone), sinon bouton « Aucune ».
  function chooseLimit(required) {
    const next = (v) => () => {
      draft.maxspeed = v;
      if (draft.kind === 'mobile_control' && !draft.osmId) chooseEnd();
      else confirm();
    };
    const pre = (v) => sel((draft.id || draft.osmId) && draft.maxspeed === v);
    const items = LIMITS.map((v) => btn(String(v), next(v), `limit ${pre(v)}`));
    if (!required) items.push(btn('Aucune', next(null), `limit ${pre(null)}`));
    show(required ? 'Limite de la zone (km/h)' : 'Limite (km/h, facultative)', [grid(items, 'limits'), cancel()]);
  }
  function chooseEnd() {
    // Modification d'un contrôle mobile : on peut garder son heure de fin.
    const keep = draft.base?.kind === 'mobile_control' && !!draft.base.expires_at;
    const ends = keep ? [['keep', 'Inchangée'], ...ENDS] : ENDS;
    show('Fin du contrôle', [
      grid(ends.map(([k, l]) => btn(l, () => { draft.end = k; confirm(); }, k === (keep ? 'keep' : '2h') ? 'primary' : ''))),
      cancel(),
    ]);
  }

  function summary() {
    const type = TYPES.find((t) => t.kind === draft.kind)?.label ?? '';
    const lines = [draft.kind === 'camera' ? `${type} (${label(CONTROLS, draft.controls ?? 'speed')})` : type];
    if (draft.osmId) lines.push('Correction du radar OpenStreetMap');
    else if (draft.id) lines.push('Modification');
    if (draft.kind === 'average_zone') {
      lines.push(`${Math.round(pathLengthM(draft.path))} m, ${draft.path.length} points`);
    } else if (draft.fix.heading == null) {
      lines.push(draft.source === 'map' ? 'Les deux sens (pas de route proche)' : 'Les deux sens (cap inconnu)');
    } else {
      lines.push(label(sensChoices(), draft.choice));
    }
    lines.push(draft.maxspeed ? `Limite ${draft.maxspeed} km/h` : 'Sans limite');
    if (draft.kind === 'mobile_control' && !draft.osmId) {
      lines.push(`Fin : ${draft.end === 'keep' ? 'inchangée' : label(ENDS, draft.end ?? '2h')}`);
    }
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

  // Heure de fin (contrôle mobile, « Autre » temporaire) ; une modification peut garder l'ancienne.
  function expiresFor(now) {
    const base = draft.base;
    if (draft.kind === 'mobile_control') {
      if (draft.end === 'keep' && base?.expires_at) return base.expires_at;
      return expiresAtFor(draft.end ?? '2h', now);
    }
    if (draft.kind === 'other' && draft.temporary) {
      return base?.kind === 'other' && base.expires_at ? base.expires_at : expiresAtFor('2h', now);
    }
    return null;
  }
  function save() {
    const id = draft.id ?? newId(); // modification : même ligne
    let row;
    if (draft.kind === 'average_zone') {
      row = buildZoneRow({ id, path: draft.path, maxspeed: draft.maxspeed });
      if (draft.source === 'route') { zone = null; updateRecording(); }
    } else if (draft.osmId) {
      row = buildOverrideRow({
        id, osmId: draft.osmId, kind: draft.kind, fix: draft.fix, choice: draft.choice,
        maxspeed: draft.maxspeed, controls: draft.controls,
      });
    } else {
      row = buildPointRow({
        id, kind: draft.kind, fix: draft.fix, choice: draft.choice,
        maxspeed: draft.maxspeed, controls: draft.controls, note: draft.note, expiresAt: expiresFor(Date.now()),
      });
    }
    draft = null;
    status = 'Relevé enregistré';
    persist(row);
    back();
  }
  // Mise à jour immédiate (relevé en file), puis une seconde fois après l'envoi réel.
  function persist(row) {
    saveRow(row).then((sent) => { if (sent) onChange(); }).catch(() => {});
    onChange();
  }
  function remove(id) {
    deleteRow(id).then((sent) => { if (sent) onChange(); }).catch(() => {});
    onChange();
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
    draft = { source: 'route', kind: 'average_zone', path };
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
    exitMapMode();
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

  // ===== Mode carte =====
  const bar = el('div', 'ed-mapbar hidden');
  bar.setAttribute('role', 'status');
  const barMsg = el('div', 'ed-mapbar-msg');
  const barText = el('p', 'ed-mapbar-text');
  const barStatus = el('p', 'ed-mapbar-status');
  barMsg.append(barText, barStatus);
  const barCancel = btn('Annuler la zone', () => { clearTap(); status = ''; renderBar(); }, 'small');
  const barDone = btn('Terminé', () => exitMapMode(), 'small primary');
  bar.append(barMsg, barCancel, barDone);
  ui.panel.before(bar);

  function renderBar() {
    bar.classList.toggle('hidden', !mapMode);
    if (!mapMode) return;
    let text = 'Mode carte — touchez la carte pour placer';
    if (tap?.step === 'zone-start') text = 'Touchez le début de la zone';
    else if (tap?.step === 'zone-end') text = 'Touchez la fin de la zone';
    barText.textContent = text;
    barStatus.textContent = status;
    barStatus.classList.toggle('hidden', !status);
    barCancel.classList.toggle('hidden', !tap);
  }

  function tempMarker(pos) {
    return new maplibregl.Marker({ color: VIOLET }).setLngLat([pos.lon, pos.lat]).addTo(map);
  }
  function clearDraftMarks() {
    draftMarker?.remove();
    draftMarker = null;
    removeLine(DRAFT_SRC);
  }
  function clearTap() {
    tap?.marker?.remove();
    tap = null;
  }

  // Tracés violets (sources et couches préfixées « editor- ») : jamais ajoutés deux fois.
  function setLine(src, data) {
    if (!map) return;
    try {
      const source = map.getSource(src);
      if (source) { source.setData(data); return; }
      map.addSource(src, { type: 'geojson', data });
      map.addLayer({
        id: `${src}-line`, type: 'line', source: src,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: src === DRAFT_SRC
          ? { 'line-color': VIOLET, 'line-width': 7, 'line-dasharray': [1.5, 1] }
          : { 'line-color': VIOLET, 'line-width': 6, 'line-opacity': 0.75 },
      });
    } catch {
      // Style pas encore prêt : nouvel essai quand la carte est au repos.
      map.once('idle', () => { if (mapMode) setLine(src, data); });
    }
  }
  function removeLine(src) {
    if (!map) return;
    try {
      if (map.getLayer(`${src}-line`)) map.removeLayer(`${src}-line`);
      if (map.getSource(src)) map.removeSource(src);
    } catch { /* style indisponible */ }
  }
  const line = (path) => ({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.map(([lat, lon]) => [lon, lat]) } }],
  });
  const drawZones = () => setLine(ZONES_SRC, zoneFeatures(rows));

  // Mode carte : marqueurs agrandis ; ceux de l'éditeur sont entourés et déplaçables (pas ceux d'OSM).
  function applyMarkerMode() {
    document.body.classList.toggle('map-edit', mapMode);
    for (const { marker, cam } of entries) {
      const mine = mapMode && isEditorRow(cam);
      marker.setDraggable(mine);
      const elm = marker.getElement();
      elm.classList.toggle('editable', mapMode);
      elm.classList.toggle('mine', mine);
    }
  }

  // Appelé par main.js à chaque reconstruction des marqueurs.
  function setElements(newRows, newEntries) {
    rows = Array.isArray(newRows) ? newRows : [];
    entries = Array.isArray(newEntries) ? newEntries : [];
    const first = !loaded;
    loaded = true;
    for (const { marker, cam } of entries) {
      marker.getElement().addEventListener('click', (e) => {
        if (!mapMode) return;
        e.stopPropagation();
        if (Date.now() - draggedAt < 400) return; // fin d'un glisser, pas un toucher
        openSheet(cam);
      });
      marker.on('dragend', () => onDragEnd(cam, marker));
    }
    applyMarkerMode();
    if (mapMode) drawZones();
    if (first && onHome) home(); // le bouton « Carte » apparaît
  }

  function enterMapMode() {
    if (!map || mapMode) return;
    mapMode = true;
    status = '';
    clearTap();
    closePanel();
    try { map.touchZoomRotate.disableRotation(); } catch { /* ignoré */ }
    map.stop();
    map.easeTo({ bearing: 0, duration: 400 }); // nord en haut pour placer et choisir le sens
    map.on('click', onMapClick);
    applyMarkerMode();
    drawZones();
    renderBar();
  }
  function exitMapMode() {
    if (!mapMode) return;
    mapMode = false;
    status = '';
    clearTap();
    closePanel();
    map.off('click', onMapClick);
    applyMarkerMode();
    removeLine(ZONES_SRC);
    removeLine(DRAFT_SRC);
    renderBar();
    // La carte reprend le suivi de la voiture.
    const fix = getFix();
    if (fix) map.easeTo({ center: [fix.pos.lon, fix.pos.lat], bearing: fix.heading ?? 0, duration: 600 });
  }

  function onMapClick(e) {
    if (!mapMode) return;
    if (e.originalEvent?.target?.closest?.('.maplibregl-marker')) return; // toucher sur un marqueur
    const pos = { lat: e.lngLat.lat, lon: e.lngLat.lng };
    status = '';
    if (tap?.step === 'zone-start') {
      tap = { step: 'zone-end', start: pos, marker: tempMarker(pos) };
      renderBar();
      return;
    }
    if (tap?.step === 'zone-end') { finishMapZone(pos); return; }
    if (!ui.panel.classList.contains('hidden')) { closePanel(); renderBar(); return; } // toucher hors du menu : il se ferme
    // Zone de l'éditeur sous le doigt ?
    const { x, y } = e.point;
    let hit = [];
    try {
      if (map.getLayer(`${ZONES_SRC}-line`)) hit = map.queryRenderedFeatures([[x - 12, y - 12], [x + 12, y + 12]], { layers: [`${ZONES_SRC}-line`] });
    } catch { hit = []; }
    const zoneRow = hit.length ? rows.find((r) => r.id === hit[0].properties?.id) : null;
    if (zoneRow) { openZoneSheet(zoneRow); return; }
    // Nouvel élément au point touché ; sens donné par la route sous le doigt.
    draft = { source: 'map', fix: { pos, heading: roadBearingAt(getRoadIndex(), pos) } };
    draftMarker = tempMarker(pos);
    showPanel();
    chooseType();
  }

  // Zone sur la carte : toucher le début, puis la fin ; le tracé suit la route.
  function startMapZone() {
    closePanel();
    clearTap();
    tap = { step: 'zone-start' };
    renderBar();
  }
  function finishMapZone(end) {
    const idx = getRoadIndex();
    const { start } = tap;
    const path = idx ? snapZonePath(idx, start, end) : [[start.lat, start.lon], [end.lat, end.lon]];
    const err = zoneError(path);
    if (err) { status = err; renderBar(); return; } // le début reste : toucher une autre fin
    clearTap();
    renderBar();
    draft = { source: 'map', kind: 'average_zone', path };
    setLine(DRAFT_SRC, line(path));
    showPanel();
    chooseLimit(true);
  }

  // Glisser un marqueur de l'éditeur : même relevé (même id), nouvelle position.
  function onDragEnd(cam, marker) {
    draggedAt = Date.now();
    const own = isEditorRow(cam) ? rows.find((r) => r.id === cam.id) : null;
    if (!own) return;
    const { lng, lat } = marker.getLngLat();
    status = 'Élément déplacé';
    persist({ ...own, lat, lon: lng });
    renderBar();
  }

  // Fiche d'un marqueur touché.
  function sheetTitle(cam, row) {
    if (row) return TYPES.find((t) => t.kind === row.kind)?.label ?? 'Élément';
    return CAM_LABELS[cam.type] ?? 'Radar';
  }
  function camInfo(cam) {
    const limit = cam.maxspeed ? `Limite ${cam.maxspeed} km/h` : 'Sans limite';
    const sens = cam.directions?.length ? `sens ${cam.directions.map((d) => toward(d)).join(', ')}` : 'les deux sens';
    return `${limit}, ${sens}`;
  }
  function closeSheet() { closePanel(); renderBar(); }
  function openSheet(cam) {
    clearDraftMarks();
    draft = null;
    showPanel();
    if (isEditorRow(cam)) {
      const row = rows.find((r) => r.id === cam.id);
      if (!row) { closeSheet(); return; }
      const title = sheetTitle(cam, row);
      show(title, [
        el('p', 'ed-info', camInfo(cam)),
        ...(row.note ? [el('p', 'ed-info', `« ${row.note} »`)] : []),
        btn('Modifier', () => editRow(row), 'big primary'),
        btn('Supprimer', () => askDelete(title, row.id)),
        btn('Fermer', closeSheet, 'ghost'),
      ]);
    } else {
      show(`${sheetTitle(cam)} (OpenStreetMap)`, [
        el('p', 'ed-info', camInfo(cam)),
        btn('Corriger', () => correctOsm(cam), 'big primary'),
        btn('Masquer', () => askHide(cam)),
        btn('Fermer', closeSheet, 'ghost'),
      ]);
    }
  }
  function openZoneSheet(row) {
    clearDraftMarks();
    draft = null;
    setLine(DRAFT_SRC, line(row.path)); // zone choisie mise en avant
    showPanel();
    show('Zone de vitesse moyenne', [
      el('p', 'ed-info', `${Math.round(pathLengthM(row.path))} m, ${row.maxspeed ? `limite ${row.maxspeed} km/h` : 'sans limite'}`),
      btn('Modifier la limite', () => {
        draft = { source: 'map', id: row.id, base: row, kind: 'average_zone', path: row.path, maxspeed: row.maxspeed };
        chooseLimit(true);
      }, 'big primary'),
      btn('Supprimer', () => askDelete('Zone de vitesse moyenne', row.id)),
      btn('Fermer', closeSheet, 'ghost'),
    ]);
  }
  // Suppression en deux touchers, sans fenêtre du navigateur.
  function askDelete(title, id) {
    show(title, [
      btn('Confirmer la suppression', () => { remove(id); status = 'Élément supprimé'; back(); }, 'big danger'),
      btn('Annuler', closeSheet, 'ghost'),
    ]);
  }
  function askHide(cam) {
    show(`${sheetTitle(cam)} (OpenStreetMap)`, [
      el('p', 'ed-info', "Le radar n'existe plus : il ne sera plus annoncé."),
      btn('Confirmer le masquage', () => {
        const existing = findOverride(rows, cam.id); // une seule ligne par radar OSM
        const { kind, controls } = kindForCamera(cam.type);
        persist(buildHiddenRow({ id: existing?.id ?? newId(), osmId: cam.id, kind, controls, lat: cam.lat, lon: cam.lon }));
        status = 'Radar masqué';
        back();
      }, 'big danger'),
      btn('Annuler', closeSheet, 'ghost'),
    ]);
  }

  // Modifier un relevé : mêmes étapes, préremplies, même id.
  function editRow(row) {
    const pos = { lat: row.lat, lon: row.lon };
    const dirs = Array.isArray(row.directions) ? row.directions : [];
    const heading = roadBearingAt(getRoadIndex(), pos) ?? (dirs.length === 1 ? dirs[0] : null);
    draft = {
      source: 'map', id: row.id, base: row, fix: { pos, heading }, kind: row.kind,
      controls: row.controls ?? null, note: row.note ?? '', temporary: !!row.expires_at,
      maxspeed: row.maxspeed ?? null, choice: choiceFromDirections(dirs, heading),
    };
    chooseType();
  }
  // Corriger un radar OSM : sens et limite, enregistrés à part (overrides).
  function correctOsm(cam) {
    const existing = findOverride(rows, cam.id); // une correction existe : on la modifie
    const pos = { lat: cam.lat, lon: cam.lon };
    const dirs = cam.directions ?? [];
    const heading = roadBearingAt(getRoadIndex(), pos) ?? (dirs.length === 1 ? dirs[0] : null);
    const { kind, controls } = kindForCamera(cam.type);
    draft = {
      source: 'map', osmId: cam.id, id: existing?.id, fix: { pos, heading }, kind, controls,
      maxspeed: cam.maxspeed ?? null, choice: choiceFromDirections(dirs, heading),
    };
    chooseSens();
  }

  return { onFix, setElements, isMapMode: () => mapMode };
}

