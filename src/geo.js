// Calculs géographiques de base. Une position est un objet { lat, lon } en degrés.

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

// Distance en mètres entre deux positions (formule de haversine).
export function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Cap pour aller de a vers b, en degrés de 0 à 360 (0 = nord, 90 = est).
export function bearingDeg(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Écart entre deux caps, toujours entre 0 et 180 degrés (350 et 10 → 20).
export function angleDiff(a, b) {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

// Distance en mètres entre le point p et le segment [a, b].
// Sur quelques kilomètres, on peut « aplatir » la Terre autour de p (projection équirectangulaire).
export function distanceToSegmentMeters(p, a, b) {
  const mPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M;
  const mPerDegLon = mPerDegLat * Math.cos(toRad(p.lat));
  const ax = (a.lon - p.lon) * mPerDegLon, ay = (a.lat - p.lat) * mPerDegLat;
  const bx = (b.lon - p.lon) * mPerDegLon, by = (b.lat - p.lat) * mPerDegLat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  // t = position du point le plus proche sur le segment (0 = a, 1 = b)
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

// Orientation d'un segment de route (même calcul que le cap).
export const segmentBearingDeg = bearingDeg;

// Le point p est-il à l'intérieur du contour ring ([[lat, lon], ...]) ?
// Méthode du « lancer de rayon » : on compte combien de bords on traverse.
export function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lonI] = ring[i];
    const [latJ, lonJ] = ring[j];
    const crosses =
      latI > p.lat !== latJ > p.lat &&
      p.lon < ((lonJ - lonI) * (p.lat - latI)) / (latJ - latI) + lonI;
    if (crosses) inside = !inside;
  }
  return inside;
}
