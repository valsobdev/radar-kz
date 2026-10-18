// Trouver la route sur laquelle on roule, et savoir si on est en agglomération.
import { distanceToSegmentMeters, segmentBearingDeg, angleDiff, pointInRing } from './geo.js';

export const MATCH_MAX_M = 25; // une route à plus de 25 m n'est pas la nôtre
export const MATCH_MAX_ANGLE = 45; // la route doit aller à peu près dans notre direction

const CELL_DEG = 0.005; // la carte est découpée en cases d'environ 400-550 m
const cellKey = (i, j) => `${i}:${j}`;
const cellOf = (deg) => Math.floor(deg / CELL_DEG);

// Range chaque morceau de route dans les cases qu'il traverse, pour ne chercher
// que parmi les routes proches au lieu de toutes les routes d'Almaty.
export function buildRoadIndex(roads) {
  const cells = new Map();
  for (const road of roads) {
    const c = road.c;
    for (let k = 0; k + 3 < c.length; k += 2) {
      const a = { lat: c[k], lon: c[k + 1] };
      const b = { lat: c[k + 2], lon: c[k + 3] };
      const seg = { road, a, b, bearing: segmentBearingDeg(a, b) };
      for (let i = cellOf(Math.min(a.lat, b.lat)); i <= cellOf(Math.max(a.lat, b.lat)); i++) {
        for (let j = cellOf(Math.min(a.lon, b.lon)); j <= cellOf(Math.max(a.lon, b.lon)); j++) {
          const key = cellKey(i, j);
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(seg);
        }
      }
    }
  }
  return { cells };
}

// Route la plus proche (≤ 25 m) dont l'orientation correspond au cap. null si aucune.
export function currentRoad(index, pos, heading) {
  const i0 = cellOf(pos.lat), j0 = cellOf(pos.lon);
  let best = null, bestDist = Infinity;
  for (let i = i0 - 1; i <= i0 + 1; i++) {
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      for (const seg of index.cells.get(cellKey(i, j)) ?? []) {
        const d = distanceToSegmentMeters(pos, seg.a, seg.b);
        if (d > MATCH_MAX_M || d >= bestDist) continue;
        if (heading != null) {
          const diff = angleDiff(seg.bearing, heading);
          // Route à double sens : rouler dans un sens ou dans l'autre convient.
          const gap = seg.road.oneway ? diff : Math.min(diff, 180 - diff);
          if (gap > MATCH_MAX_ANGLE) continue;
        }
        best = seg.road;
        bestDist = d;
      }
    }
  }
  return best;
}

// Orientation du segment de route le plus proche (≤ 25 m) d'un point touché sur la carte, sinon null.
export function roadBearingAt(index, pos) {
  if (!index?.cells || !pos) return null;
  const i0 = cellOf(pos.lat), j0 = cellOf(pos.lon);
  let best = null, bestDist = Infinity;
  for (let i = i0 - 1; i <= i0 + 1; i++) {
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      for (const seg of index.cells.get(cellKey(i, j)) ?? []) {
        const d = distanceToSegmentMeters(pos, seg.a, seg.b);
        if (d <= MATCH_MAX_M && d < bestDist) { best = seg; bestDist = d; }
      }
    }
  }
  return best ? best.bearing : null;
}

// Est-on à l'intérieur d'une ville ou d'un village ?
export function isUrban(urbanAreas, pos) {
  return urbanAreas.some((area) => area.rings.some((ring) => pointInRing(pos, ring)));
}

// Garde la dernière route trouvée pendant quelques secondes quand le GPS s'en écarte
// (avenue entre de hauts immeubles), pour ne pas afficher une fausse limite par défaut.
export const ROAD_HOLD_MS = 5000;

export function createRoadTracker(index) {
  let lastRoad = null;
  let lastSeen = -Infinity;
  return {
    update(pos, heading, timestamp) {
      const road = currentRoad(index, pos, heading);
      if (road) {
        lastRoad = road;
        lastSeen = timestamp;
        return road;
      }
      return timestamp - lastSeen < ROAD_HOLD_MS ? lastRoad : null;
    },
  };
}
