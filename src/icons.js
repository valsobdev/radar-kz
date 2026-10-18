// Icônes SVG fines (24×24, trait 2.2, couleur du texte) pour le bandeau et les marqueurs.
const svg = (inner) =>
  `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  // Caméra de radar de vitesse
  speed: svg('<rect x="3" y="7" width="14" height="11" rx="2.5"/><path d="M17 11l4-2.5v8L17 14"/><circle cx="10" cy="12.5" r="2.6"/>'),
  // Feu tricolore
  red_light: svg('<rect x="8" y="2.5" width="8" height="19" rx="3"/><circle cx="12" cy="7.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="16.5" r="1.3"/>'),
  // Contrôle de police : bouclier
  police: svg('<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8-7.5 9.5-4.4-1.5-7.5-4.9-7.5-9.5V6z"/>'),
  // Radar mobile : cible
  mobile: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01"/>'),
  // Autre danger : triangle
  other: svg('<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.4h.01"/>'),
  // Zone de contrôle : deux traits parallèles
  zone: svg('<path d="M7 3.5v17M17 3.5v17"/><path d="M12 6v3M12 11v3M12 16v3"/>'),
};
