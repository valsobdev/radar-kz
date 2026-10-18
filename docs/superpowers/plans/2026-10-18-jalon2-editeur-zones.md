# Jalon 2 — Mode éditeur, zones et barre de zone : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Nouveau style « verre dépoli » avec vitesse et limite inversées, une barre
temps · distance autour des radars et dans les zones de vitesse moyenne, et un mode
éditeur réservé au porteur pour relever radars, caméras, contrôles et zones sur le
terrain, partagés avec tous les conducteurs.

**Architecture :** On garde le site statique sans compilation. La nouvelle logique
(barre, zones, fusion des données, file d'attente hors réseau) va dans des modules
« purs » testés avec `node --test`. `main.js`, `store.js` et `editor.js` font le lien
avec le navigateur. Les relevés de l'éditeur sont dans Supabase (lecture publique,
écriture réservée aux éditeurs), avec une copie sur le téléphone et une sauvegarde
quotidienne dans le dépôt.

**Tech Stack :** JavaScript (modules ES), MapLibre GL JS 4.7.1 (unpkg), Supabase
(offre gratuite) via `@supabase/supabase-js@2.45.4` (UMD, jsdelivr), Node 24
(`node --test`, aucune dépendance npm), GitHub Pages, GitHub Actions.

**Spec :** `docs/superpowers/specs/2026-10-18-jalon2-editeur-zones-design.md`
(complète `docs/specs/2026-10-16-prototype-web-design.md`)

**Deux parties.** Partie A (tâches 1 à 5) : aucun compte nécessaire, livrable seule.
Partie B (tâches 6 à 11) : commence par la création du projet Supabase **par le porteur**.

## Global Constraints

- Aucune dépendance npm. Bibliothèques navigateur chargées avec une **version exacte**.
- Code (noms) en anglais, commentaires et textes affichés en **français**.
- Le porteur débute : chaque tâche se termine par une explication simple en français.
- Disposition : **vitesse actuelle en bas à gauche**, **panneau de limite en bas à droite**.
- Barre de zone : fine barre **verticale**, **au-dessus du panneau de limite**, étiquette
  « temps · distance » au-dessus (ex. « 45 s · 750 m »), dégradé orange → rouge,
  pleine à l'entrée, descend, disparaît à la sortie.
- La barre n'apparaît **que** dans une zone de vitesse moyenne, ou à l'approche d'un
  radar/caméra de vitesse annoncé (~500 m) jusqu'à son passage. Jamais ailleurs.
- Temps restant = distance restante ÷ vitesse actuelle ; **sous 10 km/h : distance seule**.
- Style « verre dépoli » : encadrés transparents floutés (`backdrop-filter`), repli en blanc
  presque opaque si le flou n'est pas pris en charge ; vitesse dans un bloc foncé ;
  panneau blanc bord rouge + halo blanc ; position et trajet en violet ; icônes SVG
  fines (plus d'emoji). Même style pour l'écran de démarrage et le menu éditeur.
- Zone de vitesse moyenne : voix + bandeau à l'entrée (« Zone de vitesse moyenne, 60,
  sur 2,4 km ») ; avertissement « Moyenne trop haute, ralentissez » une fois, réarmé
  après redescente d'**au moins 5 km/h** sous la limite ; dans une zone, le panneau
  affiche la **limite de la zone** ; l'excès instantané garde rouge + bip.
- Si l'appli n'est pas sûre d'être dans la zone (GPS perdu, hors du tracé), la barre
  **disparaît**.
- Types d'éléments : radar fixe, caméra (vitesse / feu rouge / autre), zone de vitesse
  moyenne, poste de police fixe, contrôle mobile (**fin par défaut : 2 h après
  création**), autre. Sens : « mon sens », « sens opposé », « les deux ».
- Un seul éditeur aujourd'hui, mais une **table des éditeurs**.
- Modifications de l'éditeur possibles **sans réseau**, envoyées au retour du réseau ;
  conflit : **la dernière modification gagne** ; compteur des relevés en attente.
- Éléments OSM : jamais modifiés à la source ; corrections et masquages enregistrés à part,
  prioritaires.
- Sauvegarde **quotidienne** dans le dépôt par GitHub Actions.
- Rappel de sécurité à l'ouverture du menu éditeur (passager, ou conducteur à l'arrêt).
- Mention « © contributeurs OpenStreetMap (ODbL) » conservée.

## Review Focus

1. **GPS perdu ou sortie de la route au milieu d'une zone** : la barre doit disparaître,
   pas rester figée sur une ancienne valeur. Test dans la tâche 4 (`sortie du tracé`,
   `trou GPS`).
2. **Vitesse nulle ou très basse dans une zone ou à l'approche d'un radar** (bouchon, feu) :
   jamais « Infinity s » ni « NaN » ; distance seule sous 10 km/h. Test dans la tâche 2.
3. **Même relevé envoyé deux fois** (réseau qui revient, page rechargée pendant l'envoi) :
   pas de doublon dans la base. Test dans la tâche 8 (identifiant créé sur le téléphone + upsert).
4. **Base inaccessible au démarrage** (pas de réseau, projet Supabase en pause) : « Démarrer »
   fonctionne quand même avec OSM + la dernière copie locale. Test dans la tâche 7
   (`fusion sans relevés`) et vérification manuelle tâche 7.
5. **Contrôle mobile expiré ou zone rejointe par le milieu** : pas d'alerte pour un contrôle
   dont l'heure de fin est passée ; une zone rejointe ailleurs qu'à son début n'est pas
   suivie (aucune caméra d'entrée ne nous a vus). Tests dans les tâches 7 et 4.

## Format commun des données (utilisé par toutes les tâches)

Radars pour les alertes (format actuel de `data/cameras.json`, étendu) :
`{ id, type, lat, lon, directions: number[], maxspeed: number|null }` avec
`type ∈ 'speed' | 'red_light' | 'police' | 'mobile' | 'other'`.

Zone : `{ id, path: [[lat, lon], ...] (du début à la fin, dans le sens contrôlé), maxspeed: number }`.

Ligne de la base (`elements`) : `{ id: uuid, kind, lat, lon, directions: int[], maxspeed,
controls, path, note, expires_at, overrides, hidden, created_by, created_at, updated_at }`
avec `kind ∈ 'speed_camera' | 'camera' | 'average_zone' | 'police_post' | 'mobile_control' | 'other'`,
`controls ∈ 'speed' | 'red_light' | 'other' | null`, `overrides` = id OSM corrigé ou masqué.

---

## Partie A — Écran, barre et zones (sans compte)

### Task 1: Style « verre dépoli » et disposition inversée

**Files:**
- Modify: `index.html` (bandeau d'alerte structuré, conteneur de barre, écran de démarrage)
- Modify: `style.css` (réécriture du style)
- Modify: `src/main.js:40-48` (marqueurs SVG), `src/main.js:89-97` et `:123-133` (bandeau structuré)
- Create: `src/icons.js`

**Interfaces:**
- Produces: `icons.js` exporte `ICONS` : `{ speed, red_light, police, mobile, other, zone }`, chaînes SVG
  (24×24, trait 2.2, `currentColor`). `index.html` contient `#alert` avec `.alert-icon`,
  `.alert-title`, `.alert-sub`, `.alert-dist` ; `#zonebar` (caché par défaut) avec `#zonebar-label`
  et `#zonebar-fill`.
- `alertText(cam, distanceM)` renvoie désormais `{ title, sub, distance, voice }` (ex.
  `{ title: 'Radar', sub: 'Limite 60 km/h', distance: '300 m', voice: … }`).

- [ ] **Step 1:** Réécrire `style.css` selon les Global Constraints : jetons de couleur sur `:root`
  (`--glass: #ffffffb8`, `--ink: #11131a`, `--red: #e5484d`, `--violet: #6c5cff`, `--dark: #11131ae6`),
  `#speed` en bas à gauche (bloc foncé 84×84, rayon 26 px), `.sign` en bas à droite (76×76, bord 8 px
  rouge, halo `0 0 0 4px #ffffff99`), `#alert` en verre (rayon 22 px), `@supports not (backdrop-filter: blur(1px))`
  → fond `#fffffff0`. Garder `.maplibregl-ctrl-bottom-*` au-dessus des blocs du bas.
- [ ] **Step 2:** Adapter `index.html` (structure ci-dessus) et `src/main.js` (marqueurs et bandeau
  avec `ICONS`, flèche de position violette). Garder la mention OSM sur l'écran de démarrage.
- [ ] **Step 3:** Vérifier : `npm test` → 79 tests passent. Lancer `node tools/serve.mjs`, ouvrir
  `http://localhost:8080/?sim=1`, Démarrer : vitesse à gauche, limite à droite, bandeau en verre
  à l'approche du premier radar, aucune erreur dans la console. Capture d'écran pour le porteur.
- [ ] **Step 4:** Commit `feat: style verre dépoli et disposition vitesse/limite inversée`.

### Task 2: Calcul de la barre (module pur)

**Files:**
- Create: `src/zonebar.js`
- Test: `tests/zonebar.test.js`

**Interfaces:**
- Produces:
  - `formatRemaining(distanceM: number, speedKmh: number) → string`
  - `barState({ zone: ZoneProgress|null, approach: { distanceM, startM }|null, speedKmh }) → { fraction: number, label: string } | null`
  - `MIN_SPEED_FOR_TIME_KMH = 10`
  - `ZoneProgress` est défini en tâche 4 (`{ remainingM, totalM, … }`).

- [ ] **Step 1: Tests**

```js
test('temps et distance', () => assert.equal(formatRemaining(750, 60), '45 s · 750 m'));
test('distance arrondie à 10 m', () => assert.equal(formatRemaining(744, 60), '45 s · 740 m'));
test('au-delà d’1 km', () => assert.equal(formatRemaining(2400, 60), '2 min · 2,4 km'));
test('lent : distance seule', () => assert.equal(formatRemaining(750, 9), '750 m'));
test('arrêt : distance seule', () => assert.equal(formatRemaining(750, 0), '750 m'));
test('zone prioritaire', () => assert.deepEqual(
  barState({ zone: { remainingM: 600, totalM: 2400 }, approach: { distanceM: 100, startM: 500 }, speedKmh: 60 }),
  { fraction: 0.25, label: '36 s · 600 m' }));
test('approche radar', () => assert.equal(barState({ zone: null, approach: { distanceM: 250, startM: 500 }, speedKmh: 60 }).fraction, 0.5));
test('rien → null', () => assert.equal(barState({ zone: null, approach: null, speedKmh: 60 }), null));
test('fraction bornée', () => assert.equal(barState({ zone: null, approach: { distanceM: 520, startM: 500 }, speedKmh: 60 }).fraction, 1));
```

- [ ] **Step 2:** `node --test tests/zonebar.test.js` → FAIL (module absent).
- [ ] **Step 3:** Implémenter. Secondes arrondies ; `< 60 s` → « N s », sinon « N min » arrondi ;
  `< 1000 m` → arrondi inférieur à 10 m ; sinon km avec une décimale et virgule.
- [ ] **Step 4:** `npm test` → tout passe.
- [ ] **Step 5:** Commit `feat: calcul de la barre temps · distance`.

### Task 3: Barre à l'approche d'un radar

**Files:**
- Modify: `src/main.js` (`onFix`), `style.css` (`#zonebar`)

**Interfaces:**
- Consumes: `barState`, `formatRemaining` (tâche 2) ; `activeCamera`, `ALERT_DISTANCE_M` (`src/cameras.js`).
- Produces: `renderBar(state)` dans `main.js` : `null` → `#zonebar` caché ; sinon hauteur de
  `#zonebar-fill` = `fraction × 100 %` et texte de `#zonebar-label`.

- [ ] **Step 1:** Dans `onFix`, quand `activeCamera` est de type `speed` (ou `mobile`), appeler
  `renderBar(barState({ zone: null, approach: { distanceM: d, startM: ALERT_DISTANCE_M }, speedKmh }))` ;
  quand le bandeau disparaît, `renderBar(null)`. Pas de barre pour `red_light`.
- [ ] **Step 2:** Vérifier avec `?sim=1` : la barre apparaît avec l'alerte du premier radar,
  descend, disparaît après le passage. `npm test` passe.
- [ ] **Step 3:** Commit `feat: barre de zone à l'approche des radars`.

### Task 4: Suivi d'une zone de vitesse moyenne (module pur)

**Files:**
- Create: `src/zones.js`
- Test: `tests/zones.test.js`

**Interfaces:**
- Consumes: `distanceMeters`, `bearingDeg`, `angleDiff`, `distanceToSegmentMeters` (`src/geo.js`).
- Produces:
  - `ENTRY_RADIUS_M = 50`, `OFF_PATH_M = 40`, `LOST_MS = 5000`, `AVERAGE_REARM_KMH = 5`
  - `prepareZone(zone) → PreparedZone` (longueurs cumulées du tracé)
  - `createZoneTracker(zones: Zone[]) → { update(pos, heading, speedKmh, timestamp) → ZoneProgress | null }`
  - `ZoneProgress = { zone, totalM, remainingM, averageKmh, entered: boolean, warnAverage: boolean, averageOver: boolean }`
    — `entered` vrai seulement au point d'entrée ; `warnAverage` vrai une seule fois par dépassement.
  - `snapZonePath(roadIndex, start, end) → [[lat, lon], ...]` (utilisé en tâche 10) : portion de la
    même route entre les deux points, sinon `[[start.lat, start.lon], [end.lat, end.lon]]`.

- [ ] **Step 1: Tests** (zone de test : ligne droite plein nord de 2 km, limite 60)

```js
const zone = { id: 'z1', maxspeed: 60, path: [[43.200, 76.900], [43.218, 76.900]] };
test('entrée au début, bon sens', …) // update à 43.2002 cap 0 → entered === true, totalM ≈ 2000 (±5)
test('pas d’entrée en sens inverse', …) // cap 180 → null
test('zone rejointe par le milieu ignorée', …) // premier point à 43.209 cap 0 → null
test('distance restante', …) // après entrée, point 43.209 → remainingM ≈ 1000 (±10)
test('moyenne depuis l’entrée', …) // 1000 m en 50 s → averageKmh === 72, averageOver === true, warnAverage === true
test('avertissement une seule fois', …) // point suivant toujours > 60 → warnAverage === false
test('réarmé après redescente de 5 km/h', …) // moyenne ≤ 55 puis > 60 → warnAverage === true de nouveau
test('sortie du tracé', …) // point à 60 m à l’est du tracé → null
test('trou GPS', …) // timestamp + 6000 ms sans point → null au point suivant
test('fin de zone', …) // point à 43.2181 → null
test('snap: même route', …) // deux points sur une route de test → tracé = sommets de la route entre eux
test('snap: routes différentes → ligne droite', …)
```

- [ ] **Step 2:** `node --test tests/zones.test.js` → FAIL.
- [ ] **Step 3:** Implémenter. Progression = projection sur le segment le plus proche du tracé +
  longueurs cumulées. Entrée : à ≤ `ENTRY_RADIUS_M` du début et cap à ±45° du premier segment.
  Moyenne = distance parcourue sur le tracé ÷ temps depuis l'entrée.
- [ ] **Step 4:** `npm test` → tout passe.
- [ ] **Step 5:** Commit `feat: suivi des zones de vitesse moyenne`.

### Task 5: Zones à l'écran, simulation et fiche d'essai

**Files:**
- Modify: `src/main.js`, `src/sim.js`, `docs/essai-route.md`

**Interfaces:**
- Consumes: `createZoneTracker` (tâche 4), `barState`/`renderBar` (tâches 2-3), `effectiveLimit({ editorLimit })`.
- Produces: `SIM_ZONES` exporté par `sim.js` (une zone sur ~1,5 km de la route simulée, limite 60).
  `loadData()` renvoie aussi `zones: createZoneTracker(zonesList)` (au jalon A : `SIM_ZONES` en `?sim`, sinon `[]`).

- [ ] **Step 1:** Dans `onFix` : `progress = data.zones.update(...)`. Si `progress` : `editorLimit = zone.maxspeed`
  pour `effectiveLimit` ; à `entered`, voix + bandeau « Zone de vitesse moyenne, 60, sur 2,4 km » pendant 6 s ;
  à `warnAverage`, voix « Moyenne trop haute, ralentissez » et vitesse en rouge tant que `averageOver` ;
  barre via `barState({ zone: progress, … })` (prioritaire sur l'approche radar).
- [ ] **Step 2:** Vérifier avec `?sim=1` : annonce d'entrée, panneau 60, barre qui descend, disparition en fin de zone.
- [ ] **Step 3:** Ajouter à `docs/essai-route.md` une section « Barre et zones » (la barre apparaît-elle
  avec l'alerte, temps cohérent, disparaît-elle après le radar).
- [ ] **Step 4:** `npm test` passe. Commit `feat: zones de vitesse moyenne à l'écran`. Pousser et vérifier
  le site en ligne (fin de la partie A).

---

## Partie B — Base de données et mode éditeur

### Task 6: Projet Supabase, schéma et configuration (guidé)

**Files:**
- Create: `supabase/schema.sql`, `src/config.js`, `docs/supabase-setup.md`
- Modify: `index.html` (script `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js`)

**Interfaces:**
- Produces: `config.js` exporte `SUPABASE_URL`, `SUPABASE_ANON_KEY` (clé publique, sans danger dans le
  dépôt). Tables `editors(user_id uuid primary key references auth.users)` et `elements` (format commun),
  `id uuid primary key` **fourni par le client**, `updated_at` mis à jour par trigger.
  Règles (RLS) : `select` pour tous ; `insert/update/delete` seulement si `auth.uid()` est dans `editors`.

- [ ] **Step 1:** Écrire `docs/supabase-setup.md`, pas à pas en français avec captures attendues : créer le
  compte et le projet (région la plus proche), coller `schema.sql` dans l'éditeur SQL, créer l'utilisateur
  éditeur (email + mot de passe), l'ajouter à `editors`, copier l'URL et la clé `anon` dans `config.js`.
  **Le porteur fait ces étapes lui-même** ; l'implémenteur l'accompagne et attend.
- [ ] **Step 2:** Vérifier depuis le terminal : `curl "$URL/rest/v1/elements?select=id" -H "apikey: $ANON"` → `[]` ;
  un `POST` avec la seule clé `anon` → refusé (401/403).
- [ ] **Step 3:** Commit `feat: schéma Supabase et configuration`.

### Task 7: Fusion OSM + relevés, zones automatiques, lecture et copie locale

**Files:**
- Create: `src/elements.js`, `src/store.js`, `data/zones.json`
- Test: `tests/elements.test.js`, `tests/osm-transform.test.js` (ajout)
- Modify: `src/main.js` (`loadData`, `alertText`), `tools/osm-transform.mjs`, `tools/import-osm.mjs`

**Interfaces:**
- Produces:
  - `MOBILE_DEFAULT_MS = 2 * 3600 * 1000`
  - `directionsFromChoice(choice: 'mine'|'opposite'|'both', heading: number|null) → number[]`
    (`mine` → `[h]`, `opposite` → `[(h+180)%360]`, `both` ou cap inconnu → `[]`)
  - `mergeElements(osmCameras, osmZones, rows, nowMs) → { cameras: Camera[], zones: Zone[] }` : applique
    `hidden` et corrections (`overrides`), ignore tout élément dont `expires_at` est passé, convertit
    `kind` → `type` (`speed_camera`→`speed`, `camera`→`controls`, `police_post`→`police`,
    `mobile_control`→`mobile`, `other`→`other`), `average_zone` → `zones`. Une zone automatique (OSM)
    est retirée si une zone de l'éditeur commence à moins de `ZONE_SAME_START_M = 100` m de son début.
  - `tools/osm-transform.mjs` : `toZones(json) → Zone[]` à partir des relations
    `type=enforcement` + `enforcement=average_speed` (membres `from`/`to` et chemins `section`) ;
    `import-osm.mjs` écrit `data/zones.json` (aujourd'hui `[]` : aucune zone dans OSM à Almaty).
  - `store.js` : `loadRows() → Promise<Row[]>` (Supabase ; en cas d'échec, dernière copie `localStorage`
    clé `radar-kz:rows`, sinon `[]` ; jamais d'exception).
- `alertText` : `police`/`mobile` → titre « Contrôle de police », voix « Contrôle de police dans X mètres » ;
  `other` → titre « Attention », sous-titre = `note`, voix « Attention dans X mètres ».

- [ ] **Step 1: Tests** : `fusion sans relevés` (= caméras OSM inchangées, zones `[]`), `masquage OSM`,
  `correction OSM` (position/limite remplacées), `contrôle mobile expiré ignoré`, `contrôle mobile actif`,
  `zone convertie`, `zone éditeur remplace zone OSM proche`, `directionsFromChoice` (4 cas dont cap `null`),
  `toZones: relation average_speed → tracé from→to` (dans `tests/osm-transform.test.js`).
- [ ] **Step 2:** FAIL, puis implémenter, puis `npm test` passe.
- [ ] **Step 3:** Brancher `loadData()` : charge aussi `zones.json`, puis
  `mergeElements(cameras, zones, await loadRows(), Date.now())` ; les zones remplacent `SIM_ZONES` hors simulation.
- [ ] **Step 4:** Vérifier : réseau coupé dans les outils du navigateur → « Démarrer » marche (OSM seul).
- [ ] **Step 5:** Commit `feat: fusion des relevés de l'éditeur`.

### Task 8: File d'attente hors réseau et connexion de l'éditeur

**Files:**
- Create: `src/queue.js`
- Test: `tests/queue.test.js`
- Modify: `src/store.js`

**Interfaces:**
- Produces:
  - `createQueue(storage: { getItem, setItem }) → { put(row), remove(id), pending(): number, flush(send) → Promise<number> }`
    — une seule entrée par `id` (la dernière gagne) ; `send({ op: 'upsert'|'delete', row|id })` ; une
    entrée n'est retirée qu'après succès ; clé de stockage `radar-kz:queue`.
  - `store.js` : `signIn(email, password)`, `signOut()`, `isEditor() → Promise<boolean>`,
    `saveRow(row)`, `deleteRow(id)` (passent par la file, puis `flush` immédiat si en ligne et à
    l'événement `online`), `newId()` = `crypto.randomUUID()`.

- [ ] **Step 1: Tests** : `put puis flush envoie un upsert`, `deux put même id → un seul envoi (le dernier)`,
  `échec d’envoi → reste en file`, `remove après put → un seul delete`, `relu depuis le stockage après rechargement`,
  `flush deux fois → aucun doublon` (même `id`, upsert).
- [ ] **Step 2:** FAIL, implémenter, `npm test` passe.
- [ ] **Step 3:** Commit `feat: relevés hors réseau et connexion éditeur`.

### Task 9: Menu éditeur sur la route (« Marquer ici »)

**Files:**
- Create: `src/editor.js`
- Modify: `index.html` (bouton éditeur, panneau, fenêtre de connexion), `style.css`, `src/main.js`

**Interfaces:**
- Consumes: `store.*` (tâche 8), `directionsFromChoice`, `MOBILE_DEFAULT_MS` (tâche 7), `ICONS` (tâche 1).
- Produces: `initEditor({ map, getFix: () => { pos, heading }, onChange: () => void })`.
  `onChange` recharge les éléments fusionnés (alertes et marqueurs à jour sans recharger la page).

- [ ] **Step 1:** Connexion : lien discret « Éditeur » sur l'écran de démarrage → fenêtre email + mot de passe.
  Bouton éditeur (style verre) visible seulement si `isEditor()`. À l'ouverture du menu : rappel « Passager,
  ou conducteur à l'arrêt ».
- [ ] **Step 2:** « Marquer ici » : enregistre position + cap, puis gros boutons de type (6 types), puis sens
  (mon sens par défaut) et limite (facultative). Contrôle mobile : `expires_at = maintenant + 2 h`, modifiable
  (boutons 1 h / 2 h / 4 h / fin de journée). « Autre » : note libre, temporaire ou permanent au choix.
- [ ] **Step 3:** « Début de zone ici » / « Fin de zone ici » : enregistre les positions GPS entre les deux
  (un point tous les 20 m) comme `path`, puis demande la limite.
- [ ] **Step 4:** Compteur « N en attente » sur le bouton quand la file n'est pas vide.
- [ ] **Step 5:** Vérifier avec `?sim=1` et le compte éditeur : marquer un radar, il apparaît et déclenche
  une alerte au passage suivant ; réseau coupé → compteur 1 → réseau rétabli → 0 et ligne présente dans Supabase.
- [ ] **Step 6:** Commit `feat: menu éditeur sur la route`.

### Task 10: Édition sur la carte (téléphone et PC)

**Files:**
- Modify: `src/editor.js`, `style.css`

**Interfaces:**
- Consumes: `snapZonePath` (tâche 4), `buildRoadIndex` (`src/roads.js`), `store.*`.

- [ ] **Step 1:** Mode « Carte » du menu : toucher la carte → placer (même choix de type/sens/limite, sens
  choisi parmi « mon sens / opposé / les deux » par rapport à la route sous le doigt) ; marqueurs de l'éditeur
  déplaçables (`draggable`) ; toucher un élément → fiche Modifier / Supprimer ; élément OSM → Corriger / Masquer
  (ligne avec `overrides`).
- [ ] **Step 2:** Zone : toucher le début puis la fin → `snapZonePath` → tracé violet affiché → limite → enregistrer.
- [ ] **Step 3:** Vérifier sur PC (`http://localhost:8080`) : placer, déplacer, supprimer, masquer un radar OSM,
  dessiner une zone ; tout est relu après rechargement.
- [ ] **Step 4:** Commit `feat: édition sur la carte`.

### Task 11: Sauvegarde quotidienne et fiche d'essai

**Files:**
- Create: `tools/backup-elements.mjs`, `.github/workflows/backup.yml`
- Test: `tests/backup.test.js`
- Modify: `docs/essai-route.md`, `README.md`

**Interfaces:**
- Produces: `toBackup(rows) → string` (JSON trié par `id`, une ligne par élément, stable d'un jour à l'autre).
  Le script lit `elements` avec la clé `anon` de `src/config.js` (lecture publique : **aucun secret à ajouter**,
  ce qui simplifie l'étape prévue dans la conception) et écrit `data/editor-backup.json`.
  Workflow : `cron: '0 3 * * *'` + lancement manuel, commit seulement si le fichier change.

- [ ] **Step 1: Tests** : `ordre stable`, `même contenu → même texte`.
- [ ] **Step 2:** FAIL, implémenter, `npm test` passe.
- [ ] **Step 3:** Pousser, lancer le workflow à la main (`gh workflow run backup.yml`), vérifier le commit
  de sauvegarde.
- [ ] **Step 4:** `docs/essai-route.md` : section « Mode éditeur » (marquer, zone début/fin, hors réseau).
  `README.md` : une ligne sur le mode éditeur et la sauvegarde.
- [ ] **Step 5:** Commit `feat: sauvegarde quotidienne des relevés`.
