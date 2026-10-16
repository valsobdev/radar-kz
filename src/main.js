// Relie les modules au navigateur : carte, GPS, voix et affichage de l'écran de conduite.
import { distanceMeters, bearingDeg, angleDiff } from './geo.js';
import { effectiveLimit, createOverspeedTracker } from './speedlimit.js';
import { createAlertTracker, REARM_DISTANCE_M } from './cameras.js';
import { buildRoadIndex, createRoadTracker, isUrban } from './roads.js';
import { createMotionTracker } from './motion.js';
import { startSimulation } from './sim.js';

const $ = (id) => document.getElementById(id);
const ui = {
  start: $('start'), startButton: $('start-button'), message: $('message'),
  alert: $('alert'), gpsLost: $('gps-lost'), limit: $('limit'), speed: $('speed'), speedValue: $('speed-value'),
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
  dataPromise ??= Promise.all([loadJson('cameras'), loadJson('roads'), loadJson('urban')]).then(([cameras, roads, urban]) => {
    if (map) {
      for (const cam of cameras) {
        const el = document.createElement('div');
        el.className = 'cam-marker';
        el.textContent = cam.type === 'red_light' ? '🚦' : '📷';
        new maplibregl.Marker({ element: el }).setLngLat([cam.lon, cam.lat]).addTo(map);
      }
    }
    return { roads: createRoadTracker(buildRoadIndex(roads)), urban, alerts: createAlertTracker(cameras) };
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

function alertText(cam, distanceM) {
  const d = Math.max(50, Math.round(distanceM / 50) * 50);
  if (cam.type === 'red_light') return { banner: `🚦 Caméra de feu rouge dans ${d} m`, voice: 'Caméra au feu, ne franchissez pas la ligne d\'arrêt' };
  const limit = cam.maxspeed ? ` · ${cam.maxspeed}` : '';
  return {
    banner: `📷 Radar dans ${d} m${limit}`,
    voice: `Radar dans ${d} mètres${cam.maxspeed ? `, limite ${cam.maxspeed}` : ''}`,
  };
}

function onFix(fix) {
  ui.gpsLost.classList.add('hidden');
  const { pos, speedKmh, heading } = motion.update(fix);

  map?.easeTo({ center: [pos.lon, pos.lat], bearing: heading ?? map.getBearing(), duration: 900 });

  // Limite applicable
  const road = data.roads.update(pos, heading, fix.timestamp);
  const limit = effectiveLimit({ osmLimit: road?.maxspeed ?? null, highway: road?.highway ?? null, isUrban: isUrban(data.urban, pos) });
  ui.limit.textContent = limit.kmh;

  // Vitesse, rouge en cas d'excès, un bip par dépassement
  ui.speedValue.textContent = speedKmh;
  const { over, beep: shouldBeep } = overspeed.update(speedKmh, limit.kmh);
  ui.speed.classList.toggle('over', over);
  if (shouldBeep) beep();

  // Nouvelle alerte radar ?
  const alert = data.alerts.update(pos, heading);
  if (alert) {
    activeCamera = alert.camera;
    speak(alertText(alert.camera, alert.distanceM).voice);
  }
  // Mise à jour ou disparition du bandeau
  if (activeCamera) {
    const d = distanceMeters(pos, activeCamera);
    const behind = heading != null && angleDiff(bearingDeg(pos, activeCamera), heading) > 90;
    if (d > REARM_DISTANCE_M || behind) {
      activeCamera = null;
      ui.alert.classList.add('hidden');
    } else {
      ui.alert.textContent = alertText(activeCamera, d).banner;
      ui.alert.classList.remove('hidden');
    }
  }
}

function onGpsError(err) {
  if (err.code === err.PERMISSION_DENIED) {
    ui.start.classList.remove('hidden');
    ui.message.textContent = "L'accès à la position a été refusé. Autorisez-le dans les réglages du navigateur, puis rechargez la page.";
    return;
  }
  // Tunnel, parking… : on ne cache pas la carte, on affiche juste un petit bandeau.
  // Le GPS continue d'être surveillé et le bandeau disparaît au prochain point.
  if (started) ui.gpsLost.classList.remove('hidden');
  else ui.message.textContent = 'Recherche du GPS… Vérifiez que la localisation est activée.';
}

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
    startSimulation(onFix);
    return;
  }
  if (!('geolocation' in navigator)) {
    ui.message.textContent = 'Ce navigateur ne donne pas accès au GPS.';
    return;
  }
  started = true;
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
