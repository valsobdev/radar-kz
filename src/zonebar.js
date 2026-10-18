// Barre de progression : temps restant et distance, affichés au-dessus du panneau de limite.

// En dessous de cette vitesse, le temps restant n'a pas de sens : on n'affiche que la distance.
export const MIN_SPEED_FOR_TIME_KMH = 10;

// Distance restante et temps estimé, séparés par « · ». Le temps est omis si on roule trop lentement.
export function formatRemaining(distanceM, speedKmh) {
  const distance = formatDistance(distanceM);
  if (speedKmh < MIN_SPEED_FOR_TIME_KMH) return distance;
  return `${formatTime(distanceM, speedKmh)} · ${distance}`;
}

// « 45 s » jusqu'à 60 s, puis « N min ».
function formatTime(distanceM, speedKmh) {
  const seconds = Math.round(distanceM / (speedKmh / 3.6));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
}

// « 740 m » arrondi à 10 m par défaut, puis « 2,4 km ».
export function formatDistance(distanceM) {
  if (distanceM < 1000) return `${Math.floor(distanceM / 10) * 10} m`;
  return `${(distanceM / 1000).toFixed(1).replace('.', ',')} km`;
}

// Fraction restante bornée à [0, 1].
function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

// Zone prioritaire si elle existe, sinon approche du radar. Null s'il n'y a rien à afficher.
export function barState({ zone, approach, speedKmh }) {
  if (zone) {
    return {
      fraction: clamp01(zone.remainingM / zone.totalM),
      label: formatRemaining(zone.remainingM, speedKmh),
    };
  }
  if (approach) {
    return {
      fraction: clamp01(approach.distanceM / approach.startM),
      label: formatRemaining(approach.distanceM, speedKmh),
    };
  }
  return null;
}
