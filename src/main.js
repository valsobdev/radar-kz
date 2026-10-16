// Relie les modules au navigateur : carte, GPS, voix et affichage de l'écran de conduite.
import { distanceMeters, bearingDeg, angleDiff } from './geo.js';
import { effectiveLimit } from './speedlimit.js';
import { createAlertTracker, REARM_DISTANCE_M } from './cameras.js';
import { buildRoadIndex, currentRoad, isUrban } from './roads.js';
import { createMotionTracker } from './motion.js';
import { startSimulation } from './sim.js';

const $ = (id) => document.getElementById(id);
const ui = {
  start: $('start'), startButton: $('start-button'), message: $('message'),
  alert: $('alert'), limit: $('limit'), speed: $('speed'), speedValue: $('speed-value'),
};
const simulate = new URLSearchParams(location.search).has('sim');

// 1. Carte
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [76.945, 43.238],
  zoom: 16,
  pitch: 0,
  dragRotate: false,
});

// 2. Données (téléchargées une seule fois au chargement de la page)
const loadJson = (name) => fetch(`data/${name}.json`).then((r) => r.json());
const dataReady = Promise.all([loadJson('cameras'), loadJson('roads'), loadJson('urban')]).then(([cameras, roads, urban]) => {
  for (const cam of cameras) {
    const el = document.createElement('div');
    el.className = 'cam-marker';
    el.textContent = cam.type === 'red_light' ? '🚦' : '📷';
    new maplibregl.Marker({ element: el }).setLngLat([cam.lon, cam.lat]).addTo(map);
  }
  return { cameras, roadIndex: buildRoadIndex(roads), urban, alerts: createAlertTracker(cameras) };
});

// 3. Voix et bip
let audio = null;
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  speechSynthesis.cancel();
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

// 4. Traitement de chaque position GPS
const motion = createMotionTracker();
let data = null;
let activeCamera = null; // radar affiché dans le bandeau
let wasOver = false;

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
  if (!data) return;
  const { pos, speedKmh, heading } = motion.update(fix);

  map.easeTo({ center: [pos.lon, pos.lat], bearing: heading ?? map.getBearing(), duration: 900 });

  // Limite applicable
  const road = currentRoad(data.roadIndex, pos, heading);
  const limit = effectiveLimit({ osmLimit: road?.maxspeed ?? null, highway: road?.highway ?? null, isUrban: isUrban(data.urban, pos) });
  ui.limit.textContent = limit.kmh;

  // Vitesse, rouge en cas d'excès, bip une fois à chaque dépassement
  ui.speedValue.textContent = speedKmh;
  const over = speedKmh > limit.kmh;
  ui.speed.classList.toggle('over', over);
  if (over && !wasOver) beep();
  wasOver = over;

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

// 5. Bouton « Démarrer » : il faut un geste de l'utilisateur pour la voix, le son et l'écran allumé.
ui.startButton.addEventListener('click', async () => {
  ui.message.textContent = '';
  try { await navigator.wakeLock?.request('screen'); } catch { /* écran allumé refusé : on continue sans */ }
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance('')); // débloque la voix sur iPhone
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (AudioCtx) audio = new AudioCtx();

  try {
    data = await dataReady;
  } catch {
    ui.message.textContent = 'Impossible de charger les données des radars. Vérifiez la connexion Internet.';
    return;
  }

  if (simulate) {
    ui.start.classList.add('hidden');
    startSimulation(onFix);
    return;
  }
  if (!('geolocation' in navigator)) {
    ui.message.textContent = 'Ce navigateur ne donne pas accès au GPS.';
    return;
  }
  navigator.geolocation.watchPosition(
    (p) => {
      ui.start.classList.add('hidden');
      onFix({
        lat: p.coords.latitude, lon: p.coords.longitude,
        speed: p.coords.speed, heading: p.coords.heading,
        accuracy: p.coords.accuracy, timestamp: p.timestamp,
      });
    },
    (err) => {
      ui.start.classList.remove('hidden');
      ui.message.textContent = err.code === err.PERMISSION_DENIED
        ? "L'accès à la position a été refusé. Autorisez-le dans les réglages du navigateur, puis réessayez."
        : 'Position GPS indisponible. Vérifiez que la localisation est activée.';
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
  ui.message.textContent = 'Recherche du GPS…';
});
