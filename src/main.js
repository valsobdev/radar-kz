// Relie les modules au navigateur : carte, GPS, voix et affichage de l'écran de conduite.
import { distanceMeters, bearingDeg, angleDiff } from './geo.js';
import { effectiveLimit, createOverspeedTracker } from './speedlimit.js';
import { createAlertTracker, REARM_DISTANCE_M, ALERT_DISTANCE_M } from './cameras.js';
import { buildRoadIndex, createRoadTracker, isUrban } from './roads.js';
import { createMotionTracker } from './motion.js';
import { startSimulation, SIM_ZONES } from './sim.js';
import { ICONS } from './icons.js';
import { barState, formatDistance as formatApproach } from './zonebar.js';
import { createZoneTracker, LOST_MS } from './zones.js';
import { mergeElements } from './elements.js';
import { loadRows } from './store.js';

const $ = (id) => document.getElementById(id);
const ui = {
  start: $('start'), startButton: $('start-button'), message: $('message'),
  alert: $('alert'), alertIcon: document.querySelector('#alert .alert-icon'), alertTitle: document.querySelector('#alert .alert-title'),
  alertSub: document.querySelector('#alert .alert-sub'), alertDist: document.querySelector('#alert .alert-dist'), gpsLost: $('gps-lost'), limit: $('limit'), speed: $('speed'), speedValue: $('speed-value'),
  zonebar: $('zonebar'), zonebarFill: $('zonebar-fill'), zonebarLabel: $('zonebar-label'),
};
const simulate = new URLSearchParams(location.search).has('sim');

// 1. Carte. Si la bibliothèque de carte n'a pas pu se charger (réseau mobile faible),
// les alertes et la limite fonctionnent quand même, sans carte.
let map = null;
try {
  map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [76.945, 43.238],
    zoom: 16,
    pitch: 0,
    dragRotate: false,
    attributionControl: false, // mention courte maison (#attribution)
  });
} catch {
  map = null;
}

// 2. Données : téléchargées au premier « Démarrer ». En cas d'échec, un nouveau toucher réessaie.
let dataPromise = null;
async function loadJson(name) {
  const res = await fetch(`data/${name}.json`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}
function loadData() {
  dataPromise ??= Promise.all([loadJson('cameras'), loadJson('roads'), loadJson('urban'), loadJson('zones')]).then(async ([osmCameras, roads, urban, osmZones]) => {
    // Radars et zones OSM + relevés de l'éditeur (jamais d'exception : au pire, OSM seul).
    const merged = mergeElements(osmCameras, osmZones, await loadRows(), Date.now());
    const cameras = merged.cameras;
    if (map) {
      for (const cam of cameras) {
        const el = document.createElement('div');
        el.className = 'cam-marker';
        el.innerHTML = ICONS[cam.type] ?? ICONS.speed;
        new maplibregl.Marker({ element: el }).setLngLat([cam.lon, cam.lat]).addTo(map);
      }
    }
    // Zones de vitesse moyenne : OSM + éditeur ; la simulation ajoute ses zones d'essai.
    const zonesList = simulate ? [...merged.zones, ...SIM_ZONES] : merged.zones;
    return { roads: createRoadTracker(buildRoadIndex(roads)), urban, alerts: createAlertTracker(cameras), zones: createZoneTracker(zonesList) };
  });
  dataPromise.catch(() => { dataPromise = null; });
  return dataPromise;
}

// 3. Voix et bip
let audio = null;
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  // Pas de cancel() : une nouvelle annonce attend la fin de la précédente au lieu de la couper.
  speechSynthesis.speak(u);
}
function beep() {
  if (!audio) return;
  const osc = audio.createOscillator();
  osc.frequency.value = 880;
  osc.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.15);
}

// 4. Écran allumé : le navigateur le relâche quand la page passe en arrière-plan
// (appel, autre appli). On le redemande quand la page redevient visible.
async function keepScreenOn() {
  try { await navigator.wakeLock?.request('screen'); } catch { /* refusé : on continue sans */ }
}
document.addEventListener('visibilitychange', () => {
  if (started && document.visibilityState === 'visible') keepScreenOn();
});

// 5. Traitement de chaque position GPS
const motion = createMotionTracker();
const overspeed = createOverspeedTracker();
let data = null;
let activeCamera = null; // radar affiché dans le bandeau
let started = false;
let zoneBannerTimer = null; // masque le bandeau d'entrée de zone après 6 s
let zoneBanner = false; // le bandeau affiche l'annonce de zone

function formatDistance(d) {
  return d >= 1000 ? `${(d / 1000).toFixed(1).replace('.', ',')} km` : `${d} m`;
}

// zoneLimit : limite de la zone en cours (elle prime sur celle du radar, comme sur le panneau).
function alertText(cam, distanceM, zoneLimit = null) {
  const d = Math.max(50, Math.round(distanceM / 50) * 50); // arrondi pour la voix
  const distance = formatApproach(distanceM); // même arrondi que la barre
  const limit = zoneLimit ?? cam.maxspeed;
  if (cam.type === 'red_light') return { title: 'Feu rouge', sub: 'Caméra au feu', distance, voice: "Caméra au feu, ne franchissez pas la ligne d'arrêt" };
  if (cam.type === 'police' || cam.type === 'mobile') return { title: 'Contrôle de police', sub: 'Ralentissez', distance, voice: `Contrôle de police dans ${d} mètres` };
  if (cam.type === 'other') return { title: 'Attention', sub: cam.note ?? '', distance, voice: `Attention dans ${d} mètres` };
  return {
    title: 'Radar',
    sub: limit ? `Limite ${limit} km/h` : 'Contrôle de vitesse',
    distance,
    voice: `Radar dans ${d} mètres${limit ? `, limite ${limit}` : ''}`,
  };
}

// Barre verticale : null la cache, sinon hauteur du remplissage et texte.
function renderBar(state) {
  ui.zonebar.classList.toggle('hidden', !state);
  if (!state) return;
  ui.zonebarFill.style.height = `${state.fraction * 100}%`;
  ui.zonebarLabel.textContent = state.label;
}

// Annonce d'entrée dans une zone : bandeau 6 s + voix.
function announceZone(zone, totalM) {
  const km = (totalM / 1000).toFixed(1).replace('.', ',');
  if (!activeCamera) { // un radar en cours garde le bandeau : seule la voix annonce la zone
    ui.alertIcon.innerHTML = ICONS.zone;
    ui.alertTitle.textContent = 'Zone de vitesse moyenne';
    ui.alertSub.textContent = `Limite ${zone.maxspeed} km/h`;
    ui.alertDist.textContent = formatDistance(totalM >= 1000 ? Math.round(totalM / 100) * 100 : Math.round(totalM / 50) * 50);
    ui.alert.classList.remove('hidden');
    zoneBanner = true;
    clearTimeout(zoneBannerTimer);
    zoneBannerTimer = setTimeout(() => {
      if (!zoneBanner) return; // un radar a pris le bandeau entre-temps
      zoneBanner = false;
      ui.alert.classList.add('hidden');
    }, 6000);
  }
  speak(`Zone de vitesse moyenne, ${zone.maxspeed}, sur ${km} km`);
}

// Chien de garde : sans point GPS accepté pendant LOST_MS, la barre disparaît (jamais de valeur périmée).
let lostTimer = null;

function onFix(fix) {
  ui.gpsLost.classList.add('hidden');
  const { pos, speedKmh, heading, fresh } = motion.update(fix);
  if (!fresh) { // point ignoré (imprécis ou en double) : on n'affiche rien de périmé
    renderBar(null);
    return;
  }
  clearTimeout(lostTimer);
  lostTimer = setTimeout(() => renderBar(null), LOST_MS);

  map?.easeTo({ center: [pos.lon, pos.lat], bearing: heading ?? map.getBearing(), duration: 900 });

  // Zone de vitesse moyenne ?
  const progress = data.zones.update(pos, heading, speedKmh, fix.timestamp);

  // Limite applicable
  const road = data.roads.update(pos, heading, fix.timestamp);
  const limit = effectiveLimit({ editorLimit: progress?.zone.maxspeed ?? null, osmLimit: road?.maxspeed ?? null, highway: road?.highway ?? null, isUrban: isUrban(data.urban, pos) });
  ui.limit.textContent = limit.kmh;

  // Vitesse, rouge en cas d'excès, un bip par dépassement
  ui.speedValue.textContent = speedKmh;
  const { over, beep: shouldBeep } = overspeed.update(speedKmh, limit.kmh);
  ui.speed.classList.toggle('over', over || !!progress?.averageOver);
  if (shouldBeep) beep();

  if (progress?.entered) announceZone(progress.zone, progress.totalM);
  if (progress?.warnAverage) speak('Moyenne trop haute, ralentissez');

  // Nouvelle alerte radar ?
  const alert = data.alerts.update(pos, heading);
  if (alert) {
    activeCamera = alert.camera;
    zoneBanner = false; // le radar reprend le bandeau
    speak(alertText(alert.camera, alert.distanceM, progress?.zone.maxspeed).voice);
  }
  // Mise à jour ou disparition du bandeau
  let approach = null;
  if (activeCamera) {
    const d = distanceMeters(pos, activeCamera);
    const behind = heading != null && angleDiff(bearingDeg(pos, activeCamera), heading) > 90;
    if (d > REARM_DISTANCE_M || behind) {
      activeCamera = null;
      if (!zoneBanner) ui.alert.classList.add('hidden');
    } else {
      const text = alertText(activeCamera, d, progress?.zone.maxspeed);
      ui.alertIcon.innerHTML = ICONS[activeCamera.type] ?? ICONS.speed;
      ui.alertTitle.textContent = text.title;
      ui.alertSub.textContent = text.sub;
      ui.alertDist.textContent = text.distance;
      ui.alert.classList.remove('hidden');
      approach = activeCamera.type === 'speed' || activeCamera.type === 'mobile'
        ? { distanceM: d, startM: ALERT_DISTANCE_M } : null;
    }
  }
  // Barre : la zone passe avant l'approche radar (pas de barre pour un feu rouge).
  renderBar(barState({ zone: progress, approach, speedKmh }));
}

function onGpsError(err) {
  if (err.code === err.PERMISSION_DENIED) {
    ui.start.classList.remove('hidden');
    ui.message.textContent = "L'accès à la position a été refusé. Autorisez-le dans les réglages du navigateur, puis rechargez la page.";
    return;
  }
  // Tunnel, parking… : on ne cache pas la carte, on affiche juste un petit bandeau.
  // Le GPS continue d'être surveillé et le bandeau disparaît au prochain point.
  if (started) {
    ui.gpsLost.classList.remove('hidden');
    renderBar(null); // position incertaine : la barre disparaît
    clearTimeout(lostTimer);
  } else ui.message.textContent = 'Recherche du GPS… Vérifiez que la localisation est activée.';
}

// Mention des sources de la carte : visible quelques secondes, puis repliée en icône « i »
// (un toucher la réaffiche). La licence OpenStreetMap oblige à la montrer.
const CREDITS_VISIBLE_MS = 5000;
const credits = $('attribution');
let creditsTimer = null;
function showCredits() {
  credits.classList.remove('collapsed');
  clearTimeout(creditsTimer);
  creditsTimer = setTimeout(() => credits.classList.add('collapsed'), CREDITS_VISIBLE_MS);
}
$('attribution-toggle').addEventListener('click', showCredits);

// 6. Bouton « Démarrer » : il faut un geste de l'utilisateur pour la voix, le son et l'écran allumé.
ui.startButton.addEventListener('click', async () => {
  if (started) return;
  ui.message.textContent = 'Chargement des radars…';
  keepScreenOn();
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance('')); // débloque la voix sur iPhone
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (AudioCtx && !audio) audio = new AudioCtx();

  try {
    data = await loadData();
  } catch {
    ui.message.textContent = 'Impossible de charger les données des radars. Vérifiez la connexion Internet, puis touchez de nouveau « Démarrer ».';
    return;
  }

  if (simulate) {
    started = true;
    ui.start.classList.add('hidden');
    showCredits();
    startSimulation(onFix);
    return;
  }
  if (!('geolocation' in navigator)) {
    ui.message.textContent = 'Ce navigateur ne donne pas accès au GPS.';
    return;
  }
  started = true;
  showCredits();
  ui.message.textContent = 'Recherche du GPS…';
  navigator.geolocation.watchPosition(
    (p) => {
      ui.start.classList.add('hidden');
      onFix({
        lat: p.coords.latitude, lon: p.coords.longitude,
        speed: p.coords.speed, heading: p.coords.heading,
        accuracy: p.coords.accuracy, timestamp: p.timestamp,
      });
    },
    onGpsError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
});
