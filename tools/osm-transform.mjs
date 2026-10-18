// Conversion des réponses Overpass (OpenStreetMap) vers nos propres formats.
// Fonctions « pures » : elles ne téléchargent rien, ce qui permet de les tester.
import { bearingDeg, distanceMeters } from '../src/geo.js';
import { parseMaxspeed } from '../src/speedlimit.js';
import { parseDirection } from '../src/cameras.js';

const ROAD_TYPES = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$/;
const SKIP_WITHOUT_LIMIT = new Set(['residential', 'unclassified']);
const round5 = (x) => Math.round(x * 1e5) / 1e5;

// Radars fixes (nœuds highway=speed_camera, relations enforcement=maxspeed)
// et caméras de feu rouge (relations enforcement=traffic_signals).
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
  const byNode = new Map(); // radars de vitesse par identifiant de nœud
  for (const el of elements) {
    if (el.type === 'node' && el.tags?.highway === 'speed_camera') {
      seen.add(el.id);
      const cam = {
        id: `osm-n${el.id}`,
        type: 'speed',
        lat: el.lat,
        lon: el.lon,
        directions: parseDirection(el.tags.direction ?? el.tags['camera:direction'], wayBearingAt.get(el.id) ?? null),
        maxspeed: parseMaxspeed(el.tags.maxspeed),
      };
      cameras.push(cam);
      byNode.set(el.id, cam);
    }
  }
  addSpeedRelations(elements, cameras, byNode, seen);
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

// Au-delà, la route a pu tourner entre le point « from » et le radar : le cap serait faux.
const MAX_FROM_DISTANCE_M = 300;

// Relations enforcement=maxspeed : le membre « from » est en amont du radar (« device »),
// donc le sens contrôlé va de « from » vers le radar. Complète le sens et la limite
// seulement quand les balises du nœud ne les donnent pas.
function addSpeedRelations(elements, cameras, byNode, seen) {
  const found = new Map(); // nœud du radar → { directions, maxspeeds }
  for (const el of elements) {
    if (el.type !== 'relation' || el.tags?.enforcement !== 'maxspeed') continue;
    const members = el.members ?? [];
    const device = members.find((m) => m.role === 'device' && m.type === 'node' && m.lat != null);
    if (!device) continue;
    if (!byNode.has(device.ref) && !seen.has(device.ref)) {
      const cam = { id: `osm-r${el.id}-n${device.ref}`, type: 'speed', lat: device.lat, lon: device.lon, directions: [], maxspeed: null };
      cameras.push(cam);
      byNode.set(device.ref, cam);
      seen.add(device.ref);
    }
    if (!found.has(device.ref)) found.set(device.ref, { directions: [], maxspeeds: [] });
    const f = found.get(device.ref);
    for (const m of members) {
      if (m.role !== 'from' || m.type !== 'node' || m.lat == null) continue;
      if (distanceMeters(m, device) > MAX_FROM_DISTANCE_M) continue;
      f.directions.push(bearingDeg(m, device));
    }
    const maxspeed = parseMaxspeed(el.tags.maxspeed);
    if (maxspeed !== null) f.maxspeeds.push(maxspeed);
  }
  for (const [nodeId, f] of found) {
    const cam = byNode.get(nodeId);
    if (!cam) continue;
    if (cam.directions.length === 0) cam.directions = f.directions;
    // Plusieurs limites pour un même radar : la plus basse, par prudence.
    if (cam.maxspeed === null && f.maxspeeds.length) cam.maxspeed = Math.min(...f.maxspeeds);
  }
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

// Assemble des morceaux de tracé en une seule ligne (joinWays ne garde que les anneaux fermés).
function chainWays(ways) {
  const rest = ways.filter((w) => w.length >= 2).map((w) => [...w]);
  if (!rest.length) return [];
  const path = rest.shift();
  let progress = true;
  while (rest.length && progress) {
    progress = false;
    for (let i = 0; i < rest.length; i++) {
      const w = rest[i];
      const end = path[path.length - 1];
      const start = path[0];
      if (samePoint(w[0], end)) path.push(...w.slice(1));
      else if (samePoint(w[w.length - 1], end)) path.push(...[...w].reverse().slice(1));
      else if (samePoint(w[w.length - 1], start)) path.unshift(...w.slice(0, -1));
      else if (samePoint(w[0], start)) path.unshift(...[...w].reverse().slice(0, -1));
      else continue;
      rest.splice(i, 1);
      progress = true;
      break;
    }
  }
  return path;
}

// Zones de vitesse moyenne : relations enforcement=average_speed, tracé orienté de « from » vers « to ».
export function toZones(json) {
  const zones = [];
  for (const el of json.elements ?? []) {
    if (el.type !== 'relation' || el.tags?.type !== 'enforcement' || el.tags?.enforcement !== 'average_speed') continue;
    const maxspeed = parseMaxspeed(el.tags.maxspeed);
    const sections = (el.members ?? []).filter((m) => m.type === 'way' && m.role === 'section' && m.geometry)
      .map((m) => m.geometry.map((p) => [p.lat, p.lon]));
    let path = chainWays(sections);
    if (path.length < 2 || !maxspeed) continue;
    const from = (el.members ?? []).find((m) => m.type === 'node' && m.role === 'from' && m.lat != null);
    const to = (el.members ?? []).find((m) => m.type === 'node' && m.role === 'to' && m.lat != null);
    const dist = (p, n) => distanceMeters({ lat: p[0], lon: p[1] }, n);
    const last = path[path.length - 1];
    // Le tracé est retourné si son début est plus proche de la fin (« to ») que de « from ».
    const reversed = from ? dist(last, from) < dist(path[0], from) : to ? dist(path[0], to) < dist(last, to) : false;
    if (reversed) path = [...path].reverse();
    zones.push({ id: `osm-r${el.id}`, path, maxspeed });
  }
  return zones;
}
