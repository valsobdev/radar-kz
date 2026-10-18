// Radars : dans quel sens ils contrôlent, et quand prévenir le conducteur.
import { isActive } from './elements.js';
import { distanceMeters, bearingDeg, angleDiff } from './geo.js';

// Dans OSM, « direction=90 » veut-il dire « contrôle les voitures qui roulent vers l'est »
// (true) ou « la caméra regarde vers l'est », donc les voitures qui arrivent de l'est (false) ?
// À vérifier sur la route devant 2 ou 3 radars connus (voir docs/essai-route.md).
export const OSM_DIRECTION_IS_TRAVEL = true;

export const ALERT_DISTANCE_M = 500; // on prévient à 500 m
export const REARM_DISTANCE_M = 600; // au-delà de 600 m, le radar pourra de nouveau déclencher une alerte
export const AHEAD_CONE_DEG = 30; // le radar doit être devant soi, à ±30° du cap
const SAME_DIRECTION_DEG = 45; // tolérance entre le sens contrôlé et notre cap
// OSM enregistre souvent un même radar plusieurs fois (un point par voie, à quelques mètres) :
// les points à moins de 50 m de celui annoncé sont considérés comme le même radar.
export const SAME_SITE_M = 50;

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

// Transforme la valeur OSM « direction » en liste de caps (degrés). [] = sens inconnu.
// wayBearing : orientation de la route au niveau du radar, utile pour « forward » / « backward ».
export function parseDirection(raw, wayBearing = null) {
  if (typeof raw !== 'string') return [];
  const result = [];
  for (const part of raw.split(';').map((p) => p.trim().toUpperCase())) {
    if (part === 'FORWARD' || part === 'BACKWARD') {
      if (wayBearing == null) return [];
      result.push(part === 'FORWARD' ? wayBearing : (wayBearing + 180) % 360);
      continue;
    }
    let deg = null;
    if (CARDINALS.includes(part)) deg = CARDINALS.indexOf(part) * 22.5;
    else if (/^\d+(\.\d+)?$/.test(part) && Number(part) <= 360) deg = Number(part) % 360;
    if (deg === null) return []; // une seule partie illisible : on considère le sens inconnu
    result.push(OSM_DIRECTION_IS_TRAVEL ? deg : (deg + 180) % 360);
  }
  return result;
}

// Le radar contrôle-t-il les voitures qui roulent avec ce cap ?
export function monitorsHeading(camera, heading) {
  if (camera.directions.length === 0) return true; // sens inconnu : on prévient par prudence
  return camera.directions.some((d) => angleDiff(d, heading) <= SAME_DIRECTION_DEG);
}

// Suit les radars déjà annoncés pour ne prévenir qu'une fois par passage.
// options.announced : ids déjà annoncés par un ancien suivi (reconstruction après un relevé de l'éditeur).
export function createAlertTracker(cameras, { announced: previous = [] } = {}) {
  const ids = new Set(cameras.map((c) => c.id));
  const announced = new Set([...previous].filter((id) => ids.has(id))); // ids absents : ignorés
  return {
    announcedIds() { return [...announced]; },
    update(pos, heading, nowMs = null) { // nowMs : ignore les éléments expirés
      for (const cam of cameras) {
        if (announced.has(cam.id) && distanceMeters(pos, cam) > REARM_DISTANCE_M) announced.delete(cam.id);
      }
      if (heading == null) return null;
      let best = null;
      for (const cam of cameras) {
        if (announced.has(cam.id) || (nowMs != null && !isActive(cam, nowMs))) continue;
        const d = distanceMeters(pos, cam);
        if (d > ALERT_DISTANCE_M) continue;
        if (angleDiff(bearingDeg(pos, cam), heading) > AHEAD_CONE_DEG) continue;
        if (!monitorsHeading(cam, heading)) continue;
        if (!best || d < best.distanceM) best = { camera: cam, distanceM: d };
      }
      if (best) {
        for (const cam of cameras) {
          if (distanceMeters(cam, best.camera) <= SAME_SITE_M) announced.add(cam.id);
        }
      }
      return best;
    },
  };
}
