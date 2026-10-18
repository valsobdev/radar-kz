# Fiche d'essai sur route — Radar KZ, jalon 1

> ⚠️ **Sécurité** : c'est le **passager** qui remplit cette fiche, ou le conducteur **à l'arrêt**.
> Jamais en conduisant.

## Avant de partir

- [ ] Ouvrir la page sur le téléphone, appuyer sur **Démarrer**, autoriser la position.
- [ ] Monter le volume (la voix annonce les radars).
- [ ] Brancher le téléphone : l'écran reste allumé et le GPS consomme de la batterie.
- [ ] Date : ............  Trajet : ...........................................

## Pour chaque radar croisé

| # | Rue / repère | Alerte reçue ? | Dans le bon sens ? | Distance annoncée juste ? | Limite affichée juste ? | Remarque |
|---|---|---|---|---|---|---|
| 1 | | oui / non | oui / non | oui / non | oui / non | |
| 2 | | oui / non | oui / non | oui / non | oui / non | |
| 3 | | oui / non | oui / non | oui / non | oui / non | |
| 4 | | oui / non | oui / non | oui / non | oui / non | |
| 5 | | oui / non | oui / non | oui / non | oui / non | |

Noter aussi :
- les radars **réels sans alerte** (radar absent de la carte) : rue, sens ;
- les **alertes sans radar** (radar disparu ou mal placé) : rue.

## Limites de vitesse

| Rue | Limite sur le panneau réel | Limite affichée par l'appli |
|---|---|---|
| | | |
| | | |
| | | |

## Sens des radars OpenStreetMap (important)

Seuls quelques radars d'Almaty ont un sens enregistré dans OpenStreetMap
(16 sur 161 au 16/10/2026). Si l'un d'eux :
- prévient **dans le mauvais sens** (alerte quand on s'éloigne de la caméra, silence quand on arrive face à elle), alors
  il faut inverser le réglage `OSM_DIRECTION_IS_TRAVEL` dans `src/cameras.js` ;
- prévient dans le bon sens, alors le réglage est correct.

Radar avec sens testé : rue ..............................  Résultat : bon sens / mauvais sens

## Barre et zones

Barre verticale à droite de l'écran (temps ou distance restants).

| Point à vérifier | Résultat | Remarque |
|---|---|---|
| La barre apparaît avec l'alerte radar | oui / non | |
| Le temps affiché est cohérent avec la distance et la vitesse | oui / non | |
| La barre disparaît après le radar | oui / non | |
| Zone de vitesse moyenne : annonce vocale à l'entrée | oui / non | |
| La limite affichée sur le panneau est celle de la zone | oui / non | |
| La barre descend pendant la zone | oui / non | |
| « Moyenne trop haute » annoncé quand la moyenne dépasse la limite | oui / non / pas testé | |
| La barre disparaît à la fin de la zone | oui / non | |

## Ressenti général

- Alerte assez tôt ? trop tôt ? ..................................................
- Voix compréhensible ? .........................................................
- Écran lisible d'un coup d'œil ? ................................................
- Autre : ........................................................................
