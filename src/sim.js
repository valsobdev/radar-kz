// Faux GPS pour tester sur le PC (adresse avec ?sim=1).
// Il roule à 60 km/h le long de la route Al-Farabi / VOAD (OSM w207810594), qui passe devant 3 radars.
import { distanceMeters } from './geo.js';

const ROUTE = [
  [43.23147, 76.96868], // 300 m d'approche avant le premier radar
  [43.23407, 76.96958], [43.23441, 76.96969], [43.23489, 76.96984], [43.23563, 76.97008],
  [43.23634, 76.97032], [43.23674, 76.97051], [43.23748, 76.97094], [43.23837, 76.97161],
  [43.23862, 76.97183], [43.23938, 76.97249], [43.24222, 76.97496], [43.24273, 76.97541],
  [43.24332, 76.97592], [43.24376, 76.9763], [43.24584, 76.97815], [43.24664, 76.97885],
  [43.24751, 76.97959], [43.24819, 76.9802], [43.24866, 76.98059], [43.24912, 76.98095],
  [43.24964, 76.98123], [43.25009, 76.98142], [43.2506, 76.98157], [43.25109, 76.98167],
  [43.25218, 76.98181], [43.25269, 76.9819], [43.25338, 76.98205], [43.25415, 76.98236],
  [43.25502, 76.98279], [43.25555, 76.98302], [43.25604, 76.98315], [43.25694, 76.98322],
].map(([lat, lon]) => ({ lat, lon }));

const SPEED_MS = 60 / 3.6;

// Appelle onFix une fois par seconde, comme le ferait le vrai GPS (sans vitesse ni cap, pour tester les calculs).
export function startSimulation(onFix) {
  let segment = 0, along = 0; // segment en cours et distance parcourue dessus
  const tick = () => {
    let step = SPEED_MS;
    while (segment < ROUTE.length - 1) {
      const len = distanceMeters(ROUTE[segment], ROUTE[segment + 1]);
      if (along + step <= len) { along += step; break; }
      step -= len - along; along = 0; segment++;
    }
    if (segment >= ROUTE.length - 1) { clearInterval(timer); return; }
    const a = ROUTE[segment], b = ROUTE[segment + 1];
    const t = along / distanceMeters(a, b);
    onFix({
      lat: a.lat + (b.lat - a.lat) * t,
      lon: a.lon + (b.lon - a.lon) * t,
      speed: null, heading: null, accuracy: 5, timestamp: Date.now(),
    });
  };
  const timer = setInterval(tick, 1000);
  tick();
}
