# Jalon 1 — Détecteur de radars et de limites : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Une page web ouverte sur le téléphone dans la voiture. Elle montre la carte
(écran B), la position, la vitesse, la limite applicable, et prévient à la voix
des radars d'OpenStreetMap autour d'Almaty, uniquement dans le sens de circulation.

**Architecture :** Site statique sans étape de compilation (HTML + modules
JavaScript natifs). Toute la logique (géométrie, limites, radars, GPS) se trouve
dans des modules « purs », testés avec `node --test`. `main.js` relie ces modules
au navigateur (carte, GPS, voix). Les données OSM sont téléchargées une fois par un
script Node et enregistrées en JSON dans `data/`.

**Tech Stack :** JavaScript (modules ES), MapLibre GL JS 4.7.1 (unpkg), tuiles
OpenFreeMap (style `liberty`), Overpass API, Node 24 (`node --test`, aucune
dépendance npm), GitHub Pages.

**Spec :** `docs/specs/2026-10-16-prototype-web-design.md` (sections 2, 5, 6, 7, 11, 12 étapes 1 à 3)

## Global Constraints

- Zone : Almaty et ses environs, bbox `42.95,76.40,43.95,77.60` (sud,ouest,nord,est).
- Limites par défaut (spec 6.2) : agglomération **60**, zone résidentielle/cour (`living_street`) **20**, hors agglomération **110**, autoroute sans info **110**.
- Priorité des limites : éditeur > OSM > défaut (au jalon 1, il n'y a pas encore d'éditeur, mais la fonction accepte déjà ce paramètre).
- Ne jamais afficher une limite inventée : sans route reconnue, appliquer la limite par défaut du lieu (ville ou non).
- Alerte radar à **500 m**, seulement si le radar surveille le sens du conducteur. Si la direction est inconnue, on alerte quand même (prudence).
- Mention « © OpenStreetMap » visible sur la carte.
- Aucune dépendance npm. Bibliothèques navigateur chargées avec une version exacte.
- Textes affichés et voix en **français** au jalon 1 (les 4 langues arrivent au jalon « langues »).
- Le porteur débute : chaque tâche se termine par une explication en français de ce qui a été fait et pourquoi.
- Le code (noms de fonctions, de variables) est en anglais, et les commentaires en français.

## Review Focus

1. **GPS sans vitesse ni cap** (`coords.speed`/`coords.heading` à `null`, fréquent sur iPhone et à l'arrêt). La vitesse et le cap doivent être calculés à partir des positions successives, et le cap précédent conservé à l'arrêt. Test dans la tâche 5.
2. **Sens des radars OSM ambigu** (`direction=forward/backward`, degrés, `N`/`NE`, `0;180`, valeurs fantaisistes). Une valeur illisible doit donner « direction inconnue » (alerte dans les deux sens), sans erreur. Test dans la tâche 3.
3. **Radar dépassé ou en sens inverse sur une route parallèle** : pas d'alerte pour un radar derrière soi, et une seule alerte par passage, sans répétition à chaque position GPS. Test dans la tâche 3.
4. **Route parallèle ou bretelle à moins de 25 m** : la limite doit venir de la route dont l'orientation correspond au cap, pas de la plus proche. Test dans la tâche 4.
5. **Valeurs `maxspeed` OSM non numériques** (`RU:urban`, `KZ:rural`, `60;40`, `none`, `signals`) : conversion en km/h ou `null`, sans planter. Test dans la tâche 2.

Point à vérifier sur la route (pas testable sur PC) : dans OSM, `direction` en degrés indique-t-il le sens de circulation contrôlé ou l'orientation de la caméra ? La constante `OSM_DIRECTION_IS_TRAVEL` (tâche 3) permet d'inverser l'interprétation après un essai devant 2 ou 3 radars connus.

---

## Structure des fichiers

```
radar-kz/
  index.html            page unique (écran B)
  style.css             apparence
  package.json          "type": "module", script "test"
  .gitignore            .superpowers/, node_modules/
  src/geo.js            calculs géographiques purs
  src/speedlimit.js     lecture des maxspeed OSM + limite applicable
  src/cameras.js        sens des radars + choix de l'alerte
  src/roads.js          index spatial des routes + route actuelle
  src/motion.js         vitesse et cap à partir des positions GPS
  src/main.js           branchement navigateur : carte, GPS, voix, affichage
  src/sim.js            faux GPS pour tester sur PC (?sim=1)
  tools/osm-transform.mjs  conversions pures OSM -> nos formats
  tools/import-osm.mjs     télécharge depuis Overpass, écrit data/*.json
  tools/serve.mjs          petit serveur local pour tester
  data/cameras.json  data/roads.json  data/urban.json   (générés)
  tests/*.test.js
```

Formats de données communs (utilisés par plusieurs tâches) :

```js
// Position
{ lat: number, lon: number }
// Camera (data/cameras.json : tableau)
{ id: "osm-n123", type: "speed" | "red_light", lat, lon,
  directions: number[],   // caps en degrés (0 = nord) du sens contrôlé ; [] = inconnu
  maxspeed: number | null }
// Road (data/roads.json : tableau ; c = [lat,lon,lat,lon,...] arrondi à 5 décimales)
{ id: "osm-w456", highway: "primary", maxspeed: number | null, oneway: boolean, c: number[] }
// Urban (data/urban.json : tableau)
{ name: "Алматы", rings: [ [[lat,lon], ...], ... ] }
```

---

### Task 1 : Mise en place du projet + calculs géographiques

**Files :**
- Create : `package.json`, `.gitignore`, `src/geo.js`
- Test : `tests/geo.test.js`

**Interfaces :**
- Produces :
  - `distanceMeters(a: Position, b: Position): number` (haversine, R = 6 371 000)
  - `bearingDeg(a: Position, b: Position): number` (0 à 360, 0 = nord)
  - `angleDiff(a: number, b: number): number` (écart absolu 0 à 180)
  - `distanceToSegmentMeters(p, a, b: Position): number` (projection locale équirectangulaire)
  - `segmentBearingDeg(a, b: Position): number` (= `bearingDeg`)
  - `pointInRing(p: Position, ring: [lat,lon][]): boolean` (lancer de rayon)

- [ ] **Step 1 : Initialiser** `git init` dans `radar-kz/`. `package.json` = `{"name":"radar-kz","private":true,"type":"module","scripts":{"test":"node --test tests/"}}`. `.gitignore` = `.superpowers/` et `node_modules/`.
- [ ] **Step 2 : Écrire les tests** dans `tests/geo.test.js` :

```js
const A = { lat: 43.238, lon: 76.945 }; // Almaty, place de la République
const B = { lat: 43.248, lon: 76.945 }; // ~1,11 km au nord
test('distance nord', () => assert.ok(Math.abs(distanceMeters(A, B) - 1112) < 5));
test('cap nord', () => assert.ok(angleDiff(bearingDeg(A, B), 0) < 0.5));
test('cap est', () => assert.ok(angleDiff(bearingDeg(A, { lat: 43.238, lon: 76.955 }), 90) < 0.5));
test('angleDiff passe par 0', () => assert.equal(angleDiff(350, 10), 20));
test('angleDiff max 180', () => assert.equal(angleDiff(0, 180), 180));
test('distance au segment', () => {
  const p = { lat: 43.243, lon: 76.946 }; // ~81 m à l'est du segment A-B
  assert.ok(Math.abs(distanceToSegmentMeters(p, A, B) - 81) < 3);
});
test('distance au segment au-delà de l\'extrémité', () => {
  assert.ok(Math.abs(distanceToSegmentMeters({ lat: 43.258, lon: 76.945 }, A, B) - 1112) < 5);
});
test('point dans un carré', () => {
  const ring = [[43,76],[43,77],[44,77],[44,76],[43,76]];
  assert.equal(pointInRing({ lat: 43.5, lon: 76.5 }, ring), true);
  assert.equal(pointInRing({ lat: 42.5, lon: 76.5 }, ring), false);
});
```

- [ ] **Step 3 : Lancer** `npm test` → ÉCHEC (module introuvable).
- [ ] **Step 4 : Écrire `src/geo.js`** avec les signatures ci-dessus.
- [ ] **Step 5 : Lancer** `npm test` → tous les tests passent.
- [ ] **Step 6 : Commit** `feat: calculs géographiques de base`. Expliquer au porteur : ce qu'est un test et pourquoi on calcule les distances nous-mêmes.

---

### Task 2 : Limites de vitesse

**Files :**
- Create : `src/speedlimit.js`
- Test : `tests/speedlimit.test.js`

**Interfaces :**
- Produces :
  - `DEFAULT_LIMITS = { urban: 60, living: 20, rural: 110, motorway: 110 }`
  - `parseMaxspeed(raw: string | undefined): number | null`
  - `effectiveLimit({ editorLimit?: number|null, osmLimit?: number|null, highway?: string|null, isUrban: boolean }): { kmh: number, source: "editor"|"osm"|"default" }`

- [ ] **Step 1 : Écrire les tests** :

```js
test('nombre', () => assert.equal(parseMaxspeed('60'), 60));
test('mph', () => assert.equal(parseMaxspeed('30 mph'), 48));
test('urbain', () => assert.equal(parseMaxspeed('RU:urban'), 60));
test('urbain KZ', () => assert.equal(parseMaxspeed('KZ:urban'), 60));
test('rural', () => assert.equal(parseMaxspeed('KZ:rural'), 110));
test('living', () => assert.equal(parseMaxspeed('RU:living_street'), 20));
test('plusieurs valeurs -> la plus basse', () => assert.equal(parseMaxspeed('60;40'), 40));
for (const bad of ['none', 'signals', 'walk', '', undefined, 'abc'])
  test(`illisible: ${bad}`, () => assert.equal(parseMaxspeed(bad), null));
test('éditeur prioritaire', () => assert.deepEqual(effectiveLimit({ editorLimit: 70, osmLimit: 60, isUrban: true }), { kmh: 70, source: 'editor' }));
test('osm ensuite', () => assert.deepEqual(effectiveLimit({ osmLimit: 80, isUrban: true }), { kmh: 80, source: 'osm' }));
test('défaut ville', () => assert.deepEqual(effectiveLimit({ isUrban: true }), { kmh: 60, source: 'default' }));
test('défaut hors ville', () => assert.deepEqual(effectiveLimit({ isUrban: false }), { kmh: 110, source: 'default' }));
test('autoroute sans info', () => assert.deepEqual(effectiveLimit({ highway: 'motorway', isUrban: false }), { kmh: 110, source: 'default' }));
test('zone résidentielle', () => assert.deepEqual(effectiveLimit({ highway: 'living_street', isUrban: true }), { kmh: 20, source: 'default' }));
```

- [ ] **Step 2 : Lancer** `npm test` → ÉCHEC.
- [ ] **Step 3 : Écrire `src/speedlimit.js`.** Codes `XX:urban`→60, `XX:rural`→110, `XX:living_street`→20, `XX:motorway`→110, quel que soit le préfixe pays (on applique les règles du Kazakhstan). Les mph sont convertis et arrondis (`Math.round(v * 1.609)`).
- [ ] **Step 4 : Lancer** `npm test` → PASS.
- [ ] **Step 5 : Commit** `feat: limites de vitesse (OSM + défauts légaux KZ)`. Explication au porteur.

---

### Task 3 : Radars — sens et choix de l'alerte

**Files :**
- Create : `src/cameras.js`
- Test : `tests/cameras.test.js`

**Interfaces :**
- Consumes : `distanceMeters`, `bearingDeg`, `angleDiff` (Task 1)
- Produces :
  - `OSM_DIRECTION_IS_TRAVEL = true` (si `false`, les degrés OSM sont inversés de 180°)
  - `parseDirection(raw: string|undefined, wayBearing?: number|null): number[]` : degrés (`"90"`), points cardinaux (`N, NNE, NE, …` sur 16 directions), plusieurs valeurs séparées par `;`, `forward` = `wayBearing`, `backward` = `wayBearing+180` (`[]` si pas de `wayBearing`), `both`/`all`/illisible = `[]`.
  - `monitorsHeading(camera: Camera, heading: number): boolean` (vrai si `directions` est vide, ou si une direction est à ≤ 45° de `heading`)
  - `ALERT_DISTANCE_M = 500`, `REARM_DISTANCE_M = 600`, `AHEAD_CONE_DEG = 30`
  - `createAlertTracker(cameras: Camera[]): { update(pos: Position, heading: number|null): { camera: Camera, distanceM: number } | null }` : renvoie un radar **une seule fois** quand il devient pertinent. Il est réarmé quand la distance repasse au-dessus de 600 m.

Un radar est pertinent quand : distance ≤ 500 m, et `angleDiff(bearingDeg(pos, camera), heading) ≤ 30` (devant soi), et `monitorsHeading(camera, heading)`. Si plusieurs radars sont pertinents, on prend le plus proche. Si `heading` est `null`, on ne renvoie aucune alerte.

- [ ] **Step 1 : Écrire les tests** :

```js
test('degrés', () => assert.deepEqual(parseDirection('90'), [90]));
test('cardinal', () => assert.deepEqual(parseDirection('NE'), [45]));
test('multiple', () => assert.deepEqual(parseDirection('0;180'), [0, 180]));
test('forward', () => assert.deepEqual(parseDirection('forward', 30), [30]));
test('backward', () => assert.deepEqual(parseDirection('backward', 30), [210]));
test('forward sans route', () => assert.deepEqual(parseDirection('forward', null), []));
for (const bad of ['both', 'abc', '', undefined, '999'])
  test(`inconnu: ${bad}`, () => assert.deepEqual(parseDirection(bad), []));

const cam = { id: 'c1', type: 'speed', lat: 43.248, lon: 76.945, directions: [0], maxspeed: 60 };
const south = { lat: 43.244, lon: 76.945 }; // ~445 m au sud du radar
test('alerte en approche, bon sens', () => {
  const t = createAlertTracker([cam]);
  assert.equal(t.update(south, 0).camera.id, 'c1');
});
test('une seule alerte par passage', () => {
  const t = createAlertTracker([cam]);
  t.update(south, 0);
  assert.equal(t.update({ lat: 43.245, lon: 76.945 }, 0), null);
});
test('réarmée après éloignement', () => {
  const t = createAlertTracker([cam]);
  t.update(south, 0);
  t.update({ lat: 43.240, lon: 76.945 }, 180); // ~890 m
  assert.equal(t.update(south, 0).camera.id, 'c1');
});
test('pas d\'alerte en sens inverse', () => assert.equal(createAlertTracker([cam]).update({ lat: 43.252, lon: 76.945 }, 180), null));
test('pas d\'alerte radar derrière', () => assert.equal(createAlertTracker([cam]).update({ lat: 43.250, lon: 76.945 }, 0), null));
test('trop loin', () => assert.equal(createAlertTracker([cam]).update({ lat: 43.240, lon: 76.945 }, 0), null));
test('direction inconnue -> alerte', () => {
  assert.ok(createAlertTracker([{ ...cam, directions: [] }]).update({ lat: 43.252, lon: 76.945 }, 180));
});
test('cap inconnu -> rien', () => assert.equal(createAlertTracker([cam]).update(south, null), null));
```

- [ ] **Step 2 : Lancer** `npm test` → ÉCHEC.
- [ ] **Step 3 : Écrire `src/cameras.js`.**
- [ ] **Step 4 : Lancer** `npm test` → PASS.
- [ ] **Step 5 : Commit** `feat: sens des radars et alertes`. Explication au porteur, y compris le doute sur le sens OSM et comment on le vérifiera.

---

### Task 4 : Route actuelle et zone urbaine

**Files :**
- Create : `src/roads.js`
- Test : `tests/roads.test.js`

**Interfaces :**
- Consumes : `distanceToSegmentMeters`, `segmentBearingDeg`, `angleDiff`, `pointInRing` (Task 1)
- Produces :
  - `buildRoadIndex(roads: Road[]): RoadIndex` : grille de cases de 0,005° ; chaque segment est rangé dans toutes les cases que couvre son rectangle englobant.
  - `MATCH_MAX_M = 25`, `MATCH_MAX_ANGLE = 45`
  - `currentRoad(index: RoadIndex, pos: Position, heading: number|null): Road | null` : parmi les segments à ≤ 25 m (cases voisines comprises), on garde ceux dont l'orientation est compatible avec le cap. Pour une route à double sens, l'écart est calculé modulo 180°. Pour un `oneway`, il est calculé au sens strict. On renvoie le plus proche. Si `heading` est `null`, on renvoie simplement le plus proche.
  - `isUrban(urbanAreas: Urban[], pos: Position): boolean`

- [ ] **Step 1 : Écrire les tests** :

```js
// Route nord-sud à lon 76.945, route est-ouest à lat 43.2402 (~22 m de p)
const ns = { id: 'ns', highway: 'primary', maxspeed: 60, oneway: false, c: [43.238, 76.945, 43.248, 76.945] };
const ew = { id: 'ew', highway: 'secondary', maxspeed: 40, oneway: false, c: [43.2402, 76.940, 43.2402, 76.950] };
const idx = buildRoadIndex([ns, ew]);
const p = { lat: 43.240, lon: 76.9451 }; // ~8 m de ns, ~22 m de ew
test('cap nord -> route nord-sud', () => assert.equal(currentRoad(idx, p, 0).id, 'ns'));
test('cap sud aussi (double sens)', () => assert.equal(currentRoad(idx, p, 180).id, 'ns'));
test('cap est -> route est-ouest malgré la distance', () => assert.equal(currentRoad(idx, p, 90).id, 'ew'));
test('trop loin -> null', () => assert.equal(currentRoad(idx, { lat: 43.240, lon: 76.948 }, 0), null));
test('sens interdit d\'un oneway ignoré', () => {
  const ow = { ...ns, id: 'ow', oneway: true };
  assert.equal(currentRoad(buildRoadIndex([ow]), p, 180), null);
});
test('ville', () => {
  const urban = [{ name: 'X', rings: [[[43, 76], [43, 77], [44, 77], [44, 76], [43, 76]]] }];
  assert.equal(isUrban(urban, p), true);
  assert.equal(isUrban(urban, { lat: 42.5, lon: 76.5 }), false);
});
```

- [ ] **Step 2 : Lancer** `npm test` → ÉCHEC.
- [ ] **Step 3 : Écrire `src/roads.js`.**
- [ ] **Step 4 : Lancer** `npm test` → PASS.
- [ ] **Step 5 : Commit** `feat: route actuelle et zone urbaine`. Explication au porteur.

---

### Task 5 : Vitesse et cap à partir du GPS

**Files :**
- Create : `src/motion.js`
- Test : `tests/motion.test.js`

**Interfaces :**
- Consumes : `distanceMeters`, `bearingDeg` (Task 1)
- Produces : `createMotionTracker(): { update(fix: { lat, lon, speed: number|null, heading: number|null, accuracy: number, timestamp: number }): { pos: Position, speedKmh: number, heading: number|null } }`

Règles : si `speed` (m/s) n'est pas `null`, on l'utilise, sinon vitesse = distance / temps depuis le point précédent. Si `heading` est valide (pas `null` ni `NaN`) et la vitesse ≥ 5 km/h, on l'utilise. Sinon, si le déplacement depuis le dernier point qui a servi au cap est ≥ 10 m, cap = `bearingDeg` entre ces points. Sinon, on garde le cap précédent. Les points avec `accuracy` > 50 m sont ignorés (le résultat précédent est renvoyé). La vitesse est arrondie à l'entier.

- [ ] **Step 1 : Écrire les tests** :

```js
const fix = (lat, t, extra = {}) => ({ lat, lon: 76.945, speed: null, heading: null, accuracy: 5, timestamp: t, ...extra });
test('vitesse fournie', () => assert.equal(createMotionTracker().update(fix(43.24, 0, { speed: 10 })).speedKmh, 36));
test('vitesse calculée', () => {
  const m = createMotionTracker(); m.update(fix(43.2400, 0));
  assert.equal(m.update(fix(43.2401, 1000)).speedKmh, 40); // ~11,1 m en 1 s
});
test('cap calculé', () => {
  const m = createMotionTracker(); m.update(fix(43.2400, 0));
  assert.ok(m.update(fix(43.2402, 2000)).heading < 1);
});
test('cap conservé à l\'arrêt', () => {
  const m = createMotionTracker(); m.update(fix(43.2400, 0)); m.update(fix(43.2402, 2000));
  assert.ok(m.update(fix(43.24021, 3000, { speed: 0 })).heading < 1);
});
test('point imprécis ignoré', () => {
  const m = createMotionTracker(); const a = m.update(fix(43.2400, 0, { speed: 10 }));
  assert.deepEqual(m.update(fix(43.30, 1000, { accuracy: 200 })), a);
});
test('premier point : cap null', () => assert.equal(createMotionTracker().update(fix(43.24, 0)).heading, null));
```

- [ ] **Step 2 : Lancer** `npm test` → ÉCHEC.
- [ ] **Step 3 : Écrire `src/motion.js`.**
- [ ] **Step 4 : Lancer** `npm test` → PASS.
- [ ] **Step 5 : Commit** `feat: vitesse et cap depuis le GPS`. Explication au porteur.

---

### Task 6 : Import des données OpenStreetMap

**Files :**
- Create : `tools/osm-transform.mjs`, `tools/import-osm.mjs`
- Create (générés) : `data/cameras.json`, `data/roads.json`, `data/urban.json`
- Test : `tests/osm-transform.test.js`

**Interfaces :**
- Consumes : `parseMaxspeed` (Task 2), `parseDirection` (Task 3), `bearingDeg` (Task 1)
- Produces (dans `tools/osm-transform.mjs`) :
  - `toCameras(overpassJson): Camera[]` : nœuds `highway=speed_camera` → `type:"speed"` ; nœuds `device` des relations `type=enforcement` + `enforcement=traffic_signals` → `type:"red_light"`. Si un nœud appartient à une route, `forward`/`backward` sont résolus avec le cap du segment de la route qui part de ce nœud (ou qui y arrive, s'il est le dernier nœud).
  - `toRoads(overpassJson): Road[]` : routes `highway` dans `motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street` et leurs `_link`. `oneway` vaut vrai si `oneway=yes` ou si `highway=motorway`. Coordonnées arrondies à 5 décimales.
  - `joinWays(ways: [lat,lon][][]): [lat,lon][][]` : assemble des morceaux de contour en anneaux fermés (algorithme ci-dessous).
  - `toUrban(overpassJson): Urban[]` : relations ou routes `place=city|town|village` fermées, et relation `boundary=administrative` d'Almaty. On utilise les membres `outer`, assemblés par `joinWays`.

Algorithme `joinWays` : prendre un morceau, puis chercher parmi les restants un morceau dont une extrémité est égale (à 1e-7 près) à la fin de l'anneau courant. L'ajouter, à l'envers si nécessaire, et recommencer jusqu'à ce que l'anneau soit fermé (premier point = dernier). Un morceau qui ne se ferme jamais est abandonné.

Requête Overpass (bbox `42.95,76.40,43.95,77.60`, `[timeout:180]`), envoyée à `https://overpass-api.de/api/interpreter`. En cas d'échec, on réessaie jusqu'à 3 fois à 30 s d'intervalle, puis on bascule sur `https://maps.mail.ru/osm/tools/overpass/api/interpreter` :
- radars : `node["highway"="speed_camera"](bbox); way(bn)["highway"]; relation["type"="enforcement"]["enforcement"="traffic_signals"](bbox); out geom;` (nœuds de route et membres inclus)
- routes : `way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$"](bbox); out geom;`
- villes : `(relation["place"~"^(city|town|village)$"](bbox); way["place"~"^(city|town|village)$"](bbox); relation["boundary"="administrative"]["name"="Алматы"](bbox);); out geom;`

L'implémenteur adapte la forme exacte des requêtes si Overpass l'exige. Ce qui compte, c'est le contenu des fichiers produits.

- [ ] **Step 1 : Écrire les tests** avec de petits JSON Overpass écrits à la main dans le test :
  - un nœud `speed_camera` avec `direction=90`, `maxspeed=60` → `{type:'speed', directions:[90], maxspeed:60}` ;
  - un nœud `speed_camera` avec `direction=forward` sur une route allant vers le nord → `directions:[0]` (à ±1°) ;
  - une relation `traffic_signals` avec un `device` → `type:'red_light'` ;
  - une route `primary` `maxspeed=RU:urban` → `maxspeed:60` ; une route `footway` est exclue ;
  - `joinWays` avec 3 morceaux dans le désordre (dont un à l'envers) → 1 anneau fermé de bonne longueur ; un morceau isolé → 0 anneau.
- [ ] **Step 2 : Lancer** `npm test` → ÉCHEC.
- [ ] **Step 3 : Écrire `tools/osm-transform.mjs`.**
- [ ] **Step 4 : Lancer** `npm test` → PASS.
- [ ] **Step 5 : Écrire `tools/import-osm.mjs`** (télécharge, transforme, écrit `data/*.json`, affiche le nombre d'éléments de chaque fichier).
- [ ] **Step 6 : Lancer** `node tools/import-osm.mjs` → doit afficher des chiffres plausibles : radars entre 100 et 1 500, routes > 5 000, au moins 1 zone urbaine nommée Алматы. `data/roads.json` doit faire moins de 8 Mo.
- [ ] **Step 7 : Commit** `feat: import des radars et routes OSM d'Almaty` (y compris `data/`). Expliquer d'où viennent les données et la licence ODbL.

---

### Task 7 : L'écran de conduite (B)

**Files :**
- Create : `index.html`, `style.css`, `src/main.js`, `src/sim.js`, `tools/serve.mjs`

**Interfaces :**
- Consumes : tout ce qui précède (`createMotionTracker`, `createAlertTracker`, `buildRoadIndex`, `currentRoad`, `isUrban`, `effectiveLimit`)
- Produces : `startSimulation(onFix: (fix) => void): void` dans `src/sim.js` : fait rouler un faux GPS le long d'un tracé fixe à Almaty (au moins 3 km, passant devant au moins un radar de `data/cameras.json`, choisi par l'implémenteur), à 60 km/h, avec un point par seconde. Le format du point est celui de `motion.update`.

Comportement :
- `tools/serve.mjs` : serveur statique Node (module `http`), port 8080, qui sert `radar-kz/` avec les bons types MIME (`.html .js .mjs .css .json`).
- Au chargement : carte MapLibre 4.7.1 (`https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js` + `.css`), style `https://tiles.openfreemap.org/styles/liberty`, centrée sur Almaty (43.238, 76.945), zoom 16. Attribution OSM visible. Les radars sont affichés en icônes 📷 / 🚦.
- Un gros bouton **« Démarrer »** en plein écran. Au toucher : `navigator.wakeLock.request('screen')` (on continue sans si c'est refusé), une phrase vide pour débloquer la voix sur iPhone, puis `navigator.geolocation.watchPosition` avec `enableHighAccuracy: true`. Avec `?sim=1` dans l'adresse, `startSimulation` est utilisé à la place.
- À chaque position : `motion.update` → la carte se centre sur la position et tourne selon le cap (`map.easeTo({center, bearing, duration: 900})`, point bleu fixe au centre de l'écran) → limite = `effectiveLimit({ osmLimit: road?.maxspeed, highway: road?.highway, isUrban })` → mise à jour du panneau en bas à gauche → vitesse en bas à droite, **rouge si vitesse > limite**, avec un bip court (Web Audio, 880 Hz, 150 ms) une seule fois à chaque passage au-dessus de la limite.
- Alerte radar (`alerts.update`) : bandeau rouge en haut « 📷 Radar dans 450 m · 60 » (distance arrondie à 50 m) et voix `fr-FR` « Radar dans 450 mètres, limite 60 ». Pour `red_light` : « 🚦 Caméra de feu rouge dans … » et voix « Caméra au feu, ne franchissez pas la ligne d'arrêt ». Le bandeau disparaît quand le radar est à plus de 600 m ou derrière soi.
- Si le GPS est refusé ou indisponible : message clair en français à l'écran.
- Mise en page : identique à la maquette B (`.superpowers/brainstorm/*/content/ecran-conduite.html`), sans barre Spotify. Gros chiffres lisibles d'un coup d'œil, pas de défilement de la page.

- [ ] **Step 1 : Écrire `tools/serve.mjs`**, lancer `node tools/serve.mjs` → `http://localhost:8080` répond.
- [ ] **Step 2 : Écrire `index.html`, `style.css`, `src/main.js`, `src/sim.js`.**
- [ ] **Step 3 : Vérifier dans le navigateur du PC** `http://localhost:8080/?sim=1` → Démarrer → la carte suit le trajet, la vitesse affiche ~60, la limite change selon les rues, l'alerte et la voix se déclenchent une seule fois au radar, aucune erreur dans la console. Faire une capture d'écran.
- [ ] **Step 4 : Lancer** `npm test` → toujours PASS.
- [ ] **Step 5 : Commit** `feat: écran de conduite B`. Explication au porteur : comment la page relie les modules, et ce qu'est un événement GPS.

---

### Task 8 : Mise en ligne et premier essai en voiture

**Files :**
- Create : `docs/essai-route.md` (fiche d'essai)

- [ ] **Step 1 : Le porteur crée un compte GitHub** (s'il n'en a pas) et un dépôt public vide `radar-kz`. L'implémenteur le guide écran par écran, sans faire ces actions à sa place.
- [ ] **Step 2 : Pousser le code** (`git remote add origin …`, `git push -u origin main`) après accord du porteur, puis activer GitHub Pages (Settings → Pages → branche `main`, dossier `/`).
- [ ] **Step 3 : Vérifier** `https://<pseudo>.github.io/radar-kz/?sim=1` sur le téléphone Android du porteur → la page se charge, et la simulation tourne.
- [ ] **Step 4 : Écrire `docs/essai-route.md`** : une checklist à remplir pendant un vrai trajet, **par un passager ou à l'arrêt, jamais en conduisant**. Pour chaque radar croisé : alerte reçue (oui/non), bon sens (oui/non), distance correcte, limite affichée juste (oui/non), et rue. Ajouter une case sur le sens des radars OSM (`OSM_DIRECTION_IS_TRAVEL`).
- [ ] **Step 5 : Commit et push** `docs: fiche d'essai sur route`. Expliquer au porteur comment faire l'essai et ramener les résultats.

---

## Après ce jalon

Plans suivants, un par jalon, à écrire ensuite (spec section 12) :
- Jalon 2 : base Supabase + mode éditeur + zones de vitesse moyenne (étapes 4-5)
- Jalon 3 : recherche + trajet + guidage vocal + trafic TomTom / évitement des bouchons (étapes 6-7, spec 8.1)
- Jalon 4 : signalements avec pseudo + commentaires (étape 8)
- Jalon 5 : 4 langues (étape 9)
