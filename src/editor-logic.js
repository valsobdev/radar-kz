// Calculs du menu éditeur (module pur, sans accès au navigateur) : relevés, tracé de zone, heure de fin.
import { distanceMeters } from './geo.js';
import { directionsFromChoice, MOBILE_DEFAULT_MS } from './elements.js';

export const PATH_STEP_M = 20; // un point du tracé tous les 20 m
export const ZONE_MIN_M = 50; // zone plus courte : refusée
const HOUR_MS = 3600 * 1000;
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
  const text = kind === 'other' && typeof note === 'string' ? note.trim() : '';
  return {
    id, kind, lat: fix.pos.lat, lon: fix.pos.lon,
    directions: directionsFromChoice(choice, fix.heading),
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
