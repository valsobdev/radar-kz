// Calculs du menu éditeur (module pur, sans accès au navigateur) : relevés, tracé de zone, heure de fin.
import { distanceMeters } from './geo.js';
import { directionsFromChoice, MOBILE_DEFAULT_MS } from './elements.js';

export const PATH_STEP_M = 20; // un point du tracé tous les 20 m
export const ZONE_MIN_M = 50; // zone plus courte : refusée
const HOUR_MS = 3600 * 1000;
export const NOTE_KINDS = ['police_post', 'mobile_control', 'other']; // types qui gardent une note
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const toPos = ([lat, lon]) => ({ lat, lon });

// Lignes de la base + relevés encore en file : la file remplace ou ajoute, les suppressions retirent.
export function overlayPending(rows, pending) {
  const byId = new Map();
  for (const r of Array.isArray(rows) ? rows : []) if (r && r.id) byId.set(r.id, r);
  for (const r of pending?.upserts ?? []) if (r && r.id) byId.set(r.id, r);
  for (const id of pending?.deletes ?? []) byId.delete(id);
  return [...byId.values()];
}

// Ajoute pos ([lat, lon]) au tracé s'il est à au moins stepM du dernier point. Renvoie un nouveau tracé.
export function appendPathPoint(path, pos, stepM = PATH_STEP_M) {
  if (!pos || !isNum(pos.lat) || !isNum(pos.lon)) return path;
  const last = path[path.length - 1];
  if (last && distanceMeters(toPos(last), pos) < stepM) return path;
  return [...path, [pos.lat, pos.lon]];
}

// Point de fin : toujours ajouté, sauf s'il est au même endroit que le dernier point.
export function finishPath(path, pos) {
  return appendPathPoint(path, pos, 1);
}

export function pathLengthM(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceMeters(toPos(path[i - 1]), toPos(path[i]));
  return total;
}

// Message d'erreur si le tracé ne fait pas une zone valable, sinon null.
export function zoneError(path) {
  if (path.length < 2 || pathLengthM(path) < ZONE_MIN_M) return 'Zone trop courte (au moins 50 m)';
  return null;
}

// 23:59 (heure du téléphone) le jour de nowMs ; si c'est déjà passé, le lendemain.
export function endOfDayMs(nowMs) {
  const d = new Date(nowMs);
  d.setHours(23, 59, 0, 0);
  if (d.getTime() <= nowMs) d.setDate(d.getDate() + 1);
  return d.getTime();
}

// Heure de fin d'un contrôle mobile : '1h' | '2h' | '4h' | 'eod' (fin de journée), 2 h par défaut.
export function expiresAtFor(choice, nowMs) {
  const ms = { '1h': nowMs + HOUR_MS, '4h': nowMs + 4 * HOUR_MS, eod: endOfDayMs(nowMs) }[choice] ?? nowMs + MOBILE_DEFAULT_MS;
  return new Date(ms).toISOString();
}

// Relevé ponctuel placé depuis la route (fix = { pos, heading } capturé au toucher de « Marquer ici »).
export function buildPointRow({ id, kind, fix, choice, maxspeed = null, controls = null, note = null, expiresAt = null }) {
  const text = NOTE_KINDS.includes(kind) && typeof note === 'string' ? note.trim() : '';
  return {
    id, kind, lat: fix.pos.lat, lon: fix.pos.lon,
    directions: directionsFromChoice(choice, fix.heading).map((d) => Math.round(d) % 360), // colonne integer[]
    maxspeed: isNum(maxspeed) ? maxspeed : null,
    controls: kind === 'camera' ? (controls ?? 'speed') : null,
    note: text || null,
    expires_at: expiresAt ?? null,
    overrides: null, hidden: false,
  };
}

// Zone de vitesse moyenne : position = début du tracé, sens donné par l'ordre du tracé.
export function buildZoneRow({ id, path, maxspeed }) {
  return {
    id, kind: 'average_zone', lat: path[0][0], lon: path[0][1], path, maxspeed, directions: [],
    controls: null, note: null, expires_at: null, overrides: null, hidden: false,
  };
}

// --- Édition sur la carte ---

// Radar OSM (préfixe « osm- ») ou relevé de l'éditeur.
export const isEditorRow = (item) => typeof item?.id === 'string' && !item.id.startsWith('osm-');

// Type de marqueur (cameras.json) → type de relevé, pour corriger ou masquer un radar OSM.
export function kindForCamera(type) {
  if (type === 'red_light') return { kind: 'camera', controls: 'red_light' };
  const kind = { police: 'police_post', mobile: 'mobile_control', other: 'other' }[type] ?? 'speed_camera';
  return { kind, controls: null };
}

// Caps enregistrés → choix prérempli ('mine' / 'opposite' / 'both') par rapport au cap de la route.
export function choiceFromDirections(directions, heading) {
  if (!Array.isArray(directions) || directions.length !== 1 || !isNum(heading)) return 'both';
  const d = Math.abs((((directions[0] - heading) % 360) + 360) % 360);
  return (d > 180 ? 360 - d : d) <= 90 ? 'mine' : 'opposite';
}

// Dernière ligne de correction ou de masquage d'un radar OSM, sinon null.
export function findOverride(rows, osmId) {
  const list = Array.isArray(rows) ? rows.filter((r) => r?.overrides === osmId) : [];
  return list[list.length - 1] ?? null;
}

// Correction d'un radar OSM : mêmes champs qu'un relevé, avec overrides = id OSM.
export function buildOverrideRow({ id, osmId, kind, fix, choice, maxspeed = null, controls = null }) {
  return { ...buildPointRow({ id, kind, fix, choice, maxspeed, controls }), overrides: osmId };
}

// Masquage d'un radar OSM qui n'existe plus.
export function buildHiddenRow({ id, osmId, kind, lat, lon, controls = null }) {
  return {
    id, kind, lat, lon, directions: [], maxspeed: null,
    controls: kind === 'camera' ? (controls ?? 'speed') : null, note: null, expires_at: null, overrides: osmId, hidden: true,
  };
}

const CARDINALS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
export function cardinalFr(bearing) {
  const b = ((bearing % 360) + 360) % 360;
  return CARDINALS[Math.round(b / 45) % 8];
}

// Zones de l'éditeur → GeoJSON (coordonnées [lon, lat]) pour les tracer sur la carte.
export function zoneFeatures(rows) {
  const features = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r?.kind !== 'average_zone' || r.hidden || r.overrides) continue;
    if (!Array.isArray(r.path) || r.path.length < 2 || !r.path.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]))) continue;
    features.push({
      type: 'Feature', properties: { id: r.id },
      geometry: { type: 'LineString', coordinates: r.path.map(([lat, lon]) => [lon, lat]) },
    });
  }
  return { type: 'FeatureCollection', features };
}
