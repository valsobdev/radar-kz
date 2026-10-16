// Vitesse et cap à partir des positions GPS successives.
// Beaucoup de téléphones (surtout iPhone, et à l'arrêt) ne donnent pas toujours la vitesse ou le cap.
import { distanceMeters, bearingDeg } from './geo.js';

const MAX_ACCURACY_M = 50; // un point GPS moins précis que 50 m est ignoré
const MIN_SPEED_FOR_GPS_HEADING_KMH = 5; // en dessous, le cap du GPS n'est pas fiable
const MIN_MOVE_FOR_HEADING_M = 10; // il faut avoir bougé de 10 m pour calculer un cap

export function createMotionTracker() {
  let last = null; // dernier point accepté
  let headingFrom = null; // point de départ pour calculer le prochain cap
  let result = null; // dernier résultat renvoyé

  return {
    // fix : { lat, lon, speed (m/s ou null), heading (degrés ou null), accuracy (m), timestamp (ms) }
    update(fix) {
      const pos = { lat: fix.lat, lon: fix.lon };
      if (fix.accuracy > MAX_ACCURACY_M) return result ?? { pos, speedKmh: 0, heading: null };

      let speedMs = fix.speed;
      if (speedMs == null) {
        const dt = last ? (fix.timestamp - last.timestamp) / 1000 : 0;
        speedMs = dt > 0 ? distanceMeters(last, pos) / dt : 0;
      }
      const speedKmh = Math.round(speedMs * 3.6);

      let heading = result?.heading ?? null;
      const gpsHeadingOk = fix.heading != null && !Number.isNaN(fix.heading);
      if (gpsHeadingOk && speedKmh >= MIN_SPEED_FOR_GPS_HEADING_KMH) {
        heading = fix.heading;
        headingFrom = pos;
      } else if (headingFrom && distanceMeters(headingFrom, pos) >= MIN_MOVE_FOR_HEADING_M) {
        heading = bearingDeg(headingFrom, pos);
        headingFrom = pos;
      } else if (!headingFrom) {
        headingFrom = pos;
      }

      last = { ...pos, timestamp: fix.timestamp };
      result = { pos, speedKmh, heading };
      return result;
    },
  };
}
