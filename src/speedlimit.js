// Limites de vitesse : lecture des valeurs OpenStreetMap et choix de la limite applicable.

// Limites légales au Kazakhstan quand aucun panneau n'est connu (spec 6.2).
export const DEFAULT_LIMITS = { urban: 60, living: 20, rural: 110, motorway: 110 };

// Codes OSM du type « KZ:urban ». On applique les règles du Kazakhstan quel que soit le pays indiqué.
const ZONE_CODES = {
  urban: DEFAULT_LIMITS.urban,
  rural: DEFAULT_LIMITS.rural,
  living_street: DEFAULT_LIMITS.living,
  motorway: DEFAULT_LIMITS.motorway,
};

// Lit une valeur OSM « maxspeed » et renvoie des km/h, ou null si on ne peut pas la comprendre.
export function parseMaxspeed(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const values = raw.split(';').map(parseOne).filter((v) => v !== null);
  // Plusieurs valeurs (« 60;40 ») : on garde la plus basse, par prudence.
  return values.length ? Math.min(...values) : null;
}

function parseOne(part) {
  const text = part.trim();
  const zone = text.match(/^[A-Za-z]{2}:(\w+)$/);
  if (zone) return ZONE_CODES[zone[1]] ?? null;
  const num = text.match(/^(\d+(?:\.\d+)?)\s*(mph)?$/);
  if (!num) return null;
  const value = Number(num[1]);
  return num[2] ? Math.round(value * 1.609) : value;
}

// Limite à afficher : éditeur > OSM > limite légale par défaut.
export function effectiveLimit({ editorLimit = null, osmLimit = null, highway = null, isUrban }) {
  if (editorLimit != null) return { kmh: editorLimit, source: 'editor' };
  if (osmLimit != null) return { kmh: osmLimit, source: 'osm' };
  if (highway === 'living_street') return { kmh: DEFAULT_LIMITS.living, source: 'default' };
  if (isUrban) return { kmh: DEFAULT_LIMITS.urban, source: 'default' };
  if (highway === 'motorway') return { kmh: DEFAULT_LIMITS.motorway, source: 'default' };
  return { kmh: DEFAULT_LIMITS.rural, source: 'default' };
}

// Excès de vitesse : rouge dès qu'on dépasse la limite, mais un seul bip tant qu'on n'est pas
// redescendu nettement en dessous (évite de biper à chaque oscillation 59 / 61).
export const BEEP_REARM_MARGIN_KMH = 3;

export function createOverspeedTracker() {
  let armed = true;
  return {
    update(speedKmh, limitKmh) {
      const over = speedKmh > limitKmh;
      const beep = over && armed;
      if (beep) armed = false;
      if (speedKmh <= limitKmh - BEEP_REARM_MARGIN_KMH) armed = true;
      return { over, beep };
    },
  };
}
