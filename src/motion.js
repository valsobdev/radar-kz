// Vitesse et cap à partir des positions GPS successives.
// Beaucoup de téléphones (surtout iPhone, et à l'arrêt) ne donnent pas toujours la vitesse ou le cap,
// et la position « saute » de quelques mètres même quand on est arrêté.
import { distanceMeters, bearingDeg } from './geo.js';

const MAX_ACCURACY_M = 50; // un point GPS moins précis que 50 m est ignoré
const MIN_SPEED_FOR_HEADING_KMH = 5; // en dessous, on considère qu'on est arrêté : le cap ne change plus
const MIN_MOVE_FOR_HEADING_M = 10; // il faut avoir bougé d'au moins 10 m (et plus que l'imprécision du GPS)

const validNumber = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const median3 = (values) => [...values].sort((a, b) => a - b)[1];

export function createMotionTracker() {
  let last = null; // dernier point accepté
  let headingFrom = null; // point de départ pour calculer le prochain cap
  let result = null; // dernier résultat renvoyé
  const recentSpeeds = []; // 3 dernières vitesses calculées (m/s), pour effacer les sauts GPS isolés

  return {
    // fix : { lat, lon, speed (m/s ou null), heading (degrés ou null), accuracy (m), timestamp (ms) }
    update(fix) {
      const pos = { lat: fix.lat, lon: fix.lon };
      if (fix.accuracy > MAX_ACCURACY_M) return result ?? { pos, speedKmh: 0, heading: null };
      if (last && fix.timestamp <= last.timestamp) return result; // point en double ou dans le désordre

      let speedMs;
      if (validNumber(fix.speed)) {
        speedMs = fix.speed;
      } else {
        const instant = last ? distanceMeters(last, pos) / ((fix.timestamp - last.timestamp) / 1000) : 0;
        recentSpeeds.push(instant);
        if (recentSpeeds.length > 3) recentSpeeds.shift();
        // Avec 3 valeurs, on prend celle du milieu : un saut isolé (30 m en 1 s) est ignoré.
        speedMs = recentSpeeds.length === 3 ? median3(recentSpeeds) : instant;
      }
      const speedKmh = Math.round(speedMs * 3.6);

      let heading = result?.heading ?? null;
      if (speedKmh >= MIN_SPEED_FOR_HEADING_KMH) {
        if (validNumber(fix.heading)) {
          heading = fix.heading;
          headingFrom = pos;
        } else if (headingFrom && distanceMeters(headingFrom, pos) >= Math.max(MIN_MOVE_FOR_HEADING_M, fix.accuracy)) {
          heading = bearingDeg(headingFrom, pos);
          headingFrom = pos;
        }
      }
      if (!headingFrom) headingFrom = pos;

      last = { ...pos, timestamp: fix.timestamp };
      result = { pos, speedKmh, heading };
      return result;
    },
  };
}
