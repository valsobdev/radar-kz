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
| La barre disparaît si le GPS est perdu (tunnel) | oui / non | |

## Mode éditeur

Le passager marque les éléments pendant le trajet (jamais le conducteur en conduisant).

| Point à vérifier | Résultat | Remarque |
|---|---|---|
| Connexion éditeur réussie (menu éditeur visible) | oui / non | |
| « Marquer ici » : Radar fixe | oui / non | |
| « Marquer ici » : Caméra | oui / non | |
| « Marquer ici » : Poste de police | oui / non | |
| « Marquer ici » : Contrôle mobile (heure de fin choisie) | oui / non | |
| « Marquer ici » : Autre | oui / non | |
| Zone : « Début de zone ici » puis « Fin de zone ici » (limite choisie) | oui / non | |
| Mode « Carte » : placer un élément en touchant la carte | oui / non | |
| Mode « Carte » : déplacer un élément de l'éditeur (glisser) | oui / non | |
| Mode « Carte » : « Corriger » un radar OpenStreetMap | oui / non | |
| Mode « Carte » : « Masquer » un radar OpenStreetMap | oui / non | |
| Hors réseau (mode avion) : le marquage est accepté, le compteur « en attente » monte | oui / non | |
| Réseau rétabli : le compteur « en attente » revient à 0 | oui / non | |
| Au passage suivant, l'alerte sonne sur un radar marqué pendant l'essai | oui / non | |

## Ressenti général

- Alerte assez tôt ? trop tôt ? ..................................................
- Voix compréhensible ? .........................................................
- Écran lisible d'un coup d'œil ? ................................................
- Autre : ........................................................................
