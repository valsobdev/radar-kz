# Radar KZ

Prototype web d'alertes radars et de limites de vitesse pour Almaty (Kazakhstan).
La page s'ouvre sur un téléphone, suit la position GPS et annonce à la voix les radars à l'approche.

> ⚠️ Ne manipulez pas le téléphone en conduisant.

## Lancer en local

```bash
node tools/serve.mjs
```

## Tests

```bash
npm test
```

## Données

Les radars, les routes, les limites de vitesse et le fond de carte proviennent
d'[OpenStreetMap](https://www.openstreetmap.org/copyright) :
© contributeurs OpenStreetMap, sous licence [ODbL](https://opendatacommons.org/licenses/odbl/).
Fond de carte : [OpenFreeMap](https://openfreemap.org).

## Mode éditeur et sauvegarde

Un éditeur connecté peut marquer radars, postes et zones depuis la route ou sur la carte ; les relevés sont stockés dans Supabase (lecture publique).
Un workflow GitHub (`.github/workflows/backup.yml`) en sauvegarde une copie chaque nuit dans `data/editor-backup.json`.
