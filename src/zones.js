// Suivi d'une zone de vitesse moyenne : entrée au début, progression le long du tracé,
// vitesse moyenne depuis l'entrée. Module pur, sans accès au navigateur.
import { distanceMeters, bearingDeg, angleDiff } from './geo.js';
import { MATCH_MAX_M } from './roads.js';

export const ENTRY_RADIUS_M = 50; // on entre dans la zone à moins de 50 m de son début
export const OFF_PATH_M = 40; // plus loin que ça du tracé : on a quitté la zone
export const LOST_MS = 5000; // trou GPS plus long : on arrête le suivi
export const AVERAGE_REARM_KMH = 5; // l'avertissement revient après une baisse de 5 km/h
const ENTRY_ANGLE = 45;
const END_M = 10; // à moins de 10 m de la fin, la zone est terminée
const M_PER_DEG = (Math.PI / 180) * 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

// Tracé en { lat, lon } avec longueurs cumulées (cum[i] = mètres depuis le début jusqu'au point i).
export function prepareZone(zone) {
  const pts = zone.path.map(([lat, lon]) => ({ lat, lon }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distanceMeters(pts[i - 1], pts[i]));
  return { zone, pts, cum, totalM: cum[cum.length - 1] };
}

// Projette p sur le segment [a, b] : distance (m) et position t (0 à 1), plan local autour de p.
function projectOnSegment(p, a, b) {
  const kLon = M_PER_DEG * Math.cos(toRad(p.lat));
  const ax = (a.lon - p.lon) * kLon, ay = (a.lat - p.lat) * M_PER_DEG;
  const bx = (b.lon - p.lon) * kLon, by = (b.lat - p.lat) * M_PER_DEG;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return { dist: Math.hypot(ax + t * dx, ay + t * dy), t };
}

// Point du tracé le plus proche de pos : distance au tracé et mètres parcourus depuis le début.
function projectOnZone(pz, pos) {
  let best = { dist: Infinity, along: 0 };
  for (let i = 0; i + 1 < pz.pts.length; i++) {
    const { dist, t } = projectOnSegment(pos, pz.pts[i], pz.pts[i + 1]);
    if (dist < best.dist) best = { dist, along: pz.cum[i] + t * (pz.cum[i + 1] - pz.cum[i]) };
  }
  return best;
}

export function createZoneTracker(zones) {
  const prepared = zones.filter((z) => z.path?.length >= 2).map(prepareZone);
  let cur = null; // zone en cours : { pz, entryAlong, entryTime, lastTime, armed }

  const progress = (extra) => ({ zone: cur.pz.zone, totalM: cur.pz.totalM, entered: false, warnAverage: false, ...extra });

  function tryEnter(pos, heading, speedKmh, timestamp) {
    if (heading == null) return null; // sans cap, impossible de vérifier le sens
    let best = null, bestDist = Infinity;
    for (const pz of prepared) {
      const d = distanceMeters(pos, pz.pts[0]);
      if (d > ENTRY_RADIUS_M || d >= bestDist) continue;
      if (angleDiff(bearingDeg(pz.pts[0], pz.pts[1]), heading) > ENTRY_ANGLE) continue;
      best = pz;
      bestDist = d;
    }
    if (!best) return null;
    const { along } = projectOnZone(best, pos);
    cur = { pz: best, entryAlong: along, entryTime: timestamp, lastTime: timestamp, armed: true };
    return progress({
      remainingM: best.totalM - along,
      averageKmh: speedKmh, // pas encore de temps écoulé : on prend la vitesse du moment
      averageOver: speedKmh > best.zone.maxspeed,
      entered: true,
    });
  }

  return {
    update(pos, heading, speedKmh, timestamp) {
      if (!cur) return tryEnter(pos, heading, speedKmh, timestamp);
      const { pz } = cur;
      const { dist, along } = projectOnZone(pz, pos);
      const remainingM = pz.totalM - along;
      // Avant le début du tracé (along 0), on tolère le rayon d'entrée : sinon une entrée à 49 m ressortirait aussitôt.
      if (timestamp - cur.lastTime > LOST_MS || dist > (along === 0 ? ENTRY_RADIUS_M : OFF_PATH_M) || remainingM <= END_M) {
        cur = null; // fin : on ne pourra rentrer que par le début
        return null;
      }
      cur.lastTime = timestamp;
      const elapsedS = (timestamp - cur.entryTime) / 1000;
      const travelledM = Math.max(0, along - cur.entryAlong);
      const averageKmh = elapsedS > 0 ? (travelledM / elapsedS) * 3.6 : speedKmh;
      const max = pz.zone.maxspeed;
      const averageOver = averageKmh > max;
      let warnAverage = false;
      if (averageOver && cur.armed) {
        warnAverage = true;
        cur.armed = false;
      } else if (averageKmh <= max - AVERAGE_REARM_KMH) {
        cur.armed = true;
      }
      return progress({ remainingM, averageKmh, averageOver, warnAverage });
    },
  };
}

// Position le long d'une route : numéro du segment + t (0 à 1), pour ordonner deux points.
function nearestOnRoad(index, pos) {
  const CELL = 0.005;
  const i0 = Math.floor(pos.lat / CELL), j0 = Math.floor(pos.lon / CELL);
  let best = null;
  for (let i = i0 - 1; i <= i0 + 1; i++) {
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      for (const seg of index.cells.get(`${i}:${j}`) ?? []) {
        const { dist, t } = projectOnSegment(pos, seg.a, seg.b);
        if (dist <= MATCH_MAX_M && (!best || dist < best.dist)) best = { seg, dist, t };
      }
    }
  }
  if (!best) return null;
  const c = best.seg.road.c, { a, b } = best.seg;
  let k = 0;
  while (k + 3 < c.length && !(c[k] === a.lat && c[k + 1] === a.lon && c[k + 2] === b.lat && c[k + 3] === b.lon)) k += 2;
  return { road: best.seg.road, pos: k / 2 + best.t };
}

// Tracé d'une zone dessinée entre deux points : suit la route si les deux points sont sur la
// même, sinon ligne droite. Renvoie [[lat, lon], ...].
export function snapZonePath(roadIndex, start, end) {
  const straight = [[start.lat, start.lon], [end.lat, end.lon]];
  const s = nearestOnRoad(roadIndex, start);
  const e = nearestOnRoad(roadIndex, end);
  if (!s || !e || s.road !== e.road) return straight;
  const c = s.road.c;
  const mid = [];
  if (s.pos <= e.pos) {
    for (let m = Math.floor(s.pos) + 1; m < e.pos; m++) mid.push([c[2 * m], c[2 * m + 1]]);
  } else {
    for (let m = Math.ceil(s.pos) - 1; m > e.pos; m--) mid.push([c[2 * m], c[2 * m + 1]]);
  }
  return [[start.lat, start.lon], ...mid, [end.lat, end.lon]];
}
