// Conversion des réponses Overpass (OpenStreetMap) vers nos propres formats.
// Fonctions « pures » : elles ne téléchargent rien, ce qui permet de les tester.
import { bearingDeg } from '../src/geo.js';
import { parseMaxspeed } from '../src/speedlimit.js';
import { parseDirection } from '../src/cameras.js';

const ROAD_TYPES = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$/;
const SKIP_WITHOUT_LIMIT = new Set(['residential', 'unclassified']);
const round5 = (x) => Math.round(x * 1e5) / 1e5;

// Radars fixes (nœuds highway=speed_camera) et caméras de feu rouge (relations enforcement).
export function toCameras(json) {
  const elements = json.elements ?? [];
  // Pour « direction=forward/backward », il faut l'orientation de la route au niveau du radar.
  const wayBearingAt = new Map();
  for (const el of elements) {
    if (el.type !== 'way' || !el.nodes || !el.geometry) continue;
    el.nodes.forEach((nodeId, k) => {
      const g = el.geometry;
      if (g.length < 2 || wayBearingAt.has(nodeId)) return;
      const [a, b] = k < g.length - 1 ? [g[k], g[k + 1]] : [g[k - 1], g[k]];
      wayBearingAt.set(nodeId, bearingDeg(a, b));
    });
  }

  const cameras = [];
  const seen = new Set();
  for (const el of elements) {
    if (el.type === 'node' && el.tags?.highway === 'speed_camera') {
      seen.add(el.id);
      cameras.push({
        id: `osm-n${el.id}`,
        type: 'speed',
        lat: el.lat,
        lon: el.lon,
        directions: parseDirection(el.tags.direction ?? el.tags['camera:direction'], wayBearingAt.get(el.id) ?? null),
        maxspeed: parseMaxspeed(el.tags.maxspeed),
      });
    }
  }
  for (const el of elements) {
    if (el.type !== 'relation' || el.tags?.enforcement !== 'traffic_signals') continue;
    for (const m of el.members ?? []) {
      // Un nœud déjà importé comme radar de vitesse n'est pas ajouté une seconde fois.
      if (m.role !== 'device' || m.type !== 'node' || m.lat == null || seen.has(m.ref)) continue;
      seen.add(m.ref);
      cameras.push({ id: `osm-r${el.id}-n${m.ref}`, type: 'red_light', lat: m.lat, lon: m.lon, directions: [], maxspeed: null });
    }
  }
  return cameras;
}

// Routes carrossables avec leur limite (ou null) et leur tracé compact.
export function toRoads(json) {
  const roads = [];
  for (const el of json.elements ?? []) {
    if (el.type !== 'way' || !ROAD_TYPES.test(el.tags?.highway ?? '') || !el.geometry || el.geometry.length < 2) continue;
    const maxspeed = parseMaxspeed(el.tags.maxspeed);
    // Petites rues sans limite connue : la limite par défaut s'appliquerait de toute façon.
    // Les ignorer divise la taille du fichier par 4.
    if (maxspeed === null && SKIP_WITHOUT_LIMIT.has(el.tags.highway)) continue;
    let geometry = el.geometry;
    const ow = el.tags.oneway;
    if (ow === '-1') geometry = [...geometry].reverse(); // sens unique dans le sens inverse du tracé
    roads.push({
      id: `osm-w${el.id}`,
      highway: el.tags.highway,
      maxspeed,
      oneway: ow === 'yes' || ow === '1' || ow === '-1' || el.tags.highway === 'motorway',
      c: geometry.flatMap((p) => [round5(p.lat), round5(p.lon)]),
    });
  }
  return roads;
}

const samePoint = (p, q) => Math.abs(p[0] - q[0]) < 1e-7 && Math.abs(p[1] - q[1]) < 1e-7;

// Assemble des morceaux de contour ([[lat, lon], ...]) en anneaux fermés.
export function joinWays(ways) {
  const remaining = ways.filter((w) => w.length >= 2).map((w) => [...w]);
  const rings = [];
  while (remaining.length) {
    const ring = remaining.shift();
    let progress = true;
    while (!samePoint(ring[0], ring[ring.length - 1]) && progress) {
      progress = false;
      const end = ring[ring.length - 1];
      for (let i = 0; i < remaining.length; i++) {
        const w = remaining[i];
        if (samePoint(w[0], end)) ring.push(...w.slice(1));
        else if (samePoint(w[w.length - 1], end)) ring.push(...[...w].reverse().slice(1));
        else continue;
        remaining.splice(i, 1);
        progress = true;
        break;
      }
    }
    if (ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

// Villes et villages : contours fermés (routes OSM « place=… ») ou relations (membres « outer »).
export function toUrban(json) {
  const areas = [];
  const toPts = (geometry) => geometry.map((p) => [p.lat, p.lon]);
  for (const el of json.elements ?? []) {
    const name = el.tags?.name ?? '';
    if (el.type === 'way' && el.geometry) {
      const ring = toPts(el.geometry);
      if (ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1])) areas.push({ name, rings: [ring] });
    } else if (el.type === 'relation') {
      const outers = (el.members ?? []).filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry).map((m) => toPts(m.geometry));
      const rings = joinWays(outers);
      if (rings.length) areas.push({ name, rings });
    }
  }
  return areas;
}
