// Fusion des radars/zones OpenStreetMap avec les relevés de l'éditeur (base Supabase).
// Fonctions « pures » : aucune lecture réseau, tout est testable.
import { distanceMeters } from './geo.js';

export const MOBILE_DEFAULT_MS = 2 * 3600 * 1000; // un contrôle mobile dure 2 h par défaut
export const ZONE_SAME_START_M = 100; // zone éditeur et zone OSM qui commencent à moins de 100 m : même zone

const KIND_TYPE = { speed_camera: 'speed', police_post: 'police', mobile_control: 'mobile', other: 'other' };

// Choix de l'éditeur → liste de caps (vide = les deux sens).
export function directionsFromChoice(choice, heading) {
  if (heading == null || !Number.isFinite(heading)) return [];
  if (choice === 'mine') return [heading];
  if (choice === 'opposite') return [(heading + 180) % 360];
  return [];
}

// Un élément à durée limitée (contrôle mobile) n'est plus actif une fois son heure de fin passée.
export function isActive(camera, nowMs) {
  return camera.expiresMs == null || camera.expiresMs > nowMs;
}

const cleanDirections = (d) => (Array.isArray(d)
  ? d.filter((x) => typeof x === 'number' && Number.isFinite(x)).map((x) => ((x % 360) + 360) % 360)
  : null);

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function expired(row, nowMs) {
  if (row.expires_at == null) return false;
  const t = Date.parse(row.expires_at);
  return Number.isFinite(t) && t <= nowMs;
}

function rowToCamera(row) {
  const type = row.kind === 'camera' ? (row.controls ?? 'speed') : KIND_TYPE[row.kind];
  if (!type || !isNum(row.lat) || !isNum(row.lon)) return null;
  const cam = {
    id: row.id, type, lat: row.lat, lon: row.lon,
    directions: cleanDirections(row.directions) ?? [],
    maxspeed: isNum(row.maxspeed) ? row.maxspeed : null,
  };
  const end = Date.parse(row.expires_at);
  if (row.expires_at != null && Number.isFinite(end)) cam.expiresMs = end; // pour l'expiration en cours de route
  if (typeof row.note === 'string' && row.note) cam.note = row.note; // texte du bandeau « Attention »
  if (row.kind === 'camera') cam.camera = true; // caméra « autre » : bandeau « Caméra »
  return cam;
}

// Sous-titre du bandeau « Attention » (type 'other') : la note, sinon « Caméra » pour une caméra.
export function otherAlertSub(cam) {
  return cam.note ?? (cam.camera ? 'Caméra' : '');
}

function rowToZone(row) {
  const ok = Array.isArray(row.path) && row.path.length >= 2
    && row.path.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]));
  if (!ok || !isNum(row.maxspeed)) return null;
  return { id: row.id, path: row.path, maxspeed: row.maxspeed };
}

// Renvoie { cameras, zones } prêts pour les alertes. Ne lève jamais d'exception.
export function mergeElements(osmCameras, osmZones, rows, nowMs) {
  const hidden = new Set();
  const fixes = new Map();
  const added = [];
  const editorZones = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    try {
      if (!row || typeof row !== 'object' || expired(row, nowMs)) continue;
      if (row.overrides) {
        if (row.hidden) hidden.add(row.overrides);
        else fixes.set(row.overrides, row);
        continue;
      }
      if (row.hidden) continue;
      if (row.kind === 'average_zone') {
        const zone = rowToZone(row);
        if (zone) editorZones.push(zone);
      } else {
        const cam = rowToCamera(row);
        if (cam) added.push(cam);
      }
    } catch { /* ligne illisible : on l'ignore */ }
  }

  const cameras = [];
  for (const cam of osmCameras) {
    if (hidden.has(cam.id)) continue;
    const fix = fixes.get(cam.id);
    cameras.push(fix ? {
      ...cam,
      lat: isNum(fix.lat) ? fix.lat : cam.lat,
      lon: isNum(fix.lon) ? fix.lon : cam.lon,
      directions: cleanDirections(fix.directions) ?? cam.directions, // [] = les deux sens
      maxspeed: isNum(fix.maxspeed) ? fix.maxspeed : cam.maxspeed,
    } : cam);
  }
  cameras.push(...added);

  const start = (z) => ({ lat: z.path[0][0], lon: z.path[0][1] });
  const zones = osmZones.filter((oz) => !editorZones.some((ez) => distanceMeters(start(oz), start(ez)) < ZONE_SAME_START_M));
  zones.push(...editorZones);
  return { cameras, zones };
}
