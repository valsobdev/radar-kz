// Télécharge depuis OpenStreetMap les radars, routes et villes d'Almaty et ses environs,
// puis écrit data/cameras.json, data/roads.json et data/urban.json.
// Lancer avec : node tools/import-osm.mjs
// Données © les contributeurs OpenStreetMap, licence ODbL.
import { writeFile, mkdir } from 'node:fs/promises';
import { toCameras, toRoads, toUrban } from './osm-transform.mjs';

const BBOX = '42.95,76.40,43.95,77.60'; // sud, ouest, nord, est
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const HEADER = '[out:json][timeout:180];';

const QUERIES = {
  cameras: `${HEADER}
node["highway"="speed_camera"](${BBOX})->.cams;
way(bn.cams)["highway"]->.ways;
relation["type"="enforcement"]["enforcement"="traffic_signals"](${BBOX})->.rels;
(.cams; .ways; .rels;); out geom;`,
  roads: `${HEADER}
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$"](${BBOX});
out geom;`,
  urban: `${HEADER}
(relation["place"~"^(city|town|village)$"](${BBOX});
 way["place"~"^(city|town|village)$"](${BBOX});
 relation["boundary"="administrative"]["name"="Алматы"](${BBOX}););
out geom;`,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Essaie chaque serveur : 3 tentatives à 30 s d'intervalle sur le premier, puis le suivant.
async function overpass(query) {
  for (const server of SERVERS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(server, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'radar-kz-import/0.1' },
          body: 'data=' + encodeURIComponent(query),
        });
        if (res.ok) return await res.json();
        console.warn(`  ${server} → HTTP ${res.status} (essai ${attempt}/3)`);
      } catch (err) {
        console.warn(`  ${server} → ${err.message} (essai ${attempt}/3)`);
      }
      if (attempt < 3) await sleep(30000);
    }
  }
  throw new Error('Aucun serveur Overpass ne répond. Réessayez plus tard.');
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
const converters = { cameras: toCameras, roads: toRoads, urban: toUrban };
for (const [name, query] of Object.entries(QUERIES)) {
  console.log(`Téléchargement : ${name}…`);
  const items = converters[name](await overpass(query));
  const file = new URL(`../data/${name}.json`, import.meta.url);
  const text = JSON.stringify(items);
  await writeFile(file, text);
  console.log(`  ${items.length} éléments, ${(text.length / 1e6).toFixed(2)} Mo`);
}
