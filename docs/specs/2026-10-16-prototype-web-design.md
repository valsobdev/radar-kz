# Radar KZ — Prototype web : document de conception

Date : 2026-10-16
Statut : brouillon, à valider par le porteur du projet

## 1. Pourquoi ce projet

Au Kazakhstan, et à Almaty en particulier, les panneaux de signalisation manquent
ou sont peu clairs. Un conducteur ne sait pas où commence ni où finit une zone
contrôlée, ni à quelle vitesse il a le droit de rouler. 2GIS n'est pas fiable sur
ce point. Résultat : le porteur du projet roule « presque tout le temps à 50 ou 60
pour ne pas avoir d'amende », même là où la limite est plus haute.

L'application joue le rôle des **panneaux absents**. Elle doit permettre de
**rouler à la vraie limite, ni plus ni moins**, d'éviter les amendes et la
suspension de permis (franchir une ligne continue au Kazakhstan peut entraîner
une suspension), et de **naviguer comme un GPS**.

Le porteur du projet débute en programmation. Le projet sert aussi à apprendre :
chaque étape doit être expliquée en français, simplement.

## 2. Objectifs du prototype

1. Utilisable **sur un téléphone, dans la voiture**, avec le vrai GPS, écran allumé
   et page ouverte.
2. Zone couverte : **Almaty et ses environs** uniquement.
3. Afficher en permanence la **limite de vitesse applicable** et la **vitesse
   actuelle**.
4. Prévenir, avec un bandeau et une voix, de chaque caméra et zone contrôlée sur la route.
5. Chercher une adresse ou un lieu, calculer un trajet et **guider à la voix,
   tour par tour**.
6. Interface et voix en **4 langues** : français, russe, kazakh, anglais, au choix
   de l'utilisateur.

## 3. Non-objectifs (pour plus tard, appli mobile)

- Fonctionnement en **arrière-plan** / écran éteint.
- **Contrôle de Spotify** depuis l'appli (⏮ ⏯ ⏭) et baisse automatique de la
  musique pendant les alertes. Le porteur utilise Android, sa femme un iPhone :
  l'appli mobile devra marcher sur les deux. Spotify fournit un kit officiel
  (« App Remote ») pour les deux plateformes.
- Base d'entreprises aussi complète que 2GIS (service payant, à étudier plus tard).
- Couverture au-delà d'Almaty.

## 4. Anti-objectifs (ce qui ferait échouer le projet même si « ça marche »)

- **Une appli remplie de n'importe quoi.** Si tout le monde peut ajouter des
  radars, plus personne ne fait confiance aux alertes. Seul l'éditeur (le porteur)
  crée et modifie les radars, les zones et les lignes.
- **Une appli vide.** Au départ, on importe les données existantes
  (OpenStreetMap) pour qu'il y ait déjà quelque chose.
- **Afficher une limite fausse ou inventée.** S'il n'y a pas de limite enregistrée,
  on applique la limite légale par défaut (section 6.2), jamais un chiffre au hasard.
- **Un écran chargé qui distrait le conducteur.** Les éléments n'apparaissent que
  quand ils servent : alertes seulement quand quelque chose approche, barre
  musique seulement si de la musique joue (dans l'appli mobile).

## 5. L'écran de conduite (choix « B », validé)

Carte en plein écran, façon Waze.

- **Centre** : la position du conducteur. La carte tourne dans le sens de la marche.
- **Bas gauche** : panneau rond de **limite de vitesse** applicable.
- **Bas droite** : **vitesse actuelle**, qui passe en rouge en cas de dépassement de la limite.
- **Haut** : bandeau d'alerte, visible seulement quand une alerte est active.
- **Pendant un guidage** : la prochaine instruction (flèche, distance, nom de rue)
  et le trajet dessiné sur la carte.
- Icônes sur la carte : 📷 radar, 🚦 caméra de feu rouge, ⏱ zone de vitesse
  moyenne, ligne continue en surbrillance, 💥 accident, ⚠️ voiture en panne.
- Bouton pour **signaler** un accident ou une voiture en panne.
- (Appli mobile seulement) barre Spotify en bas, visible seulement si de la musique joue.

## 6. Les données

### 6.1 Types d'éléments

| Type | Données enregistrées |
|---|---|
| Radar fixe de vitesse | position, **direction(s) surveillée(s)**, limite |
| Zone de vitesse moyenne | point de début, point de fin, tracé suivant la route, sens, limite |
| Caméra de carrefour | position, sens, ce qu'elle contrôle (ligne d'arrêt au feu rouge) |
| Ligne continue | tracé (portion de route), sens concernés |
| Limite de vitesse d'une portion | tracé, limite |
| Signalement temporaire | type (accident / panne), position, sens, heure |
| Commentaire | élément concerné, texte, auteur, heure |

### 6.2 Limite par défaut quand aucune limite n'est connue

D'après le code de la route du Kazakhstan, article 10 (texte vu sur
kodeksy-kz.com, **à revérifier dans le texte officiel** de l'arrêté du ministère
de l'Intérieur n° 534 du 30/06/2023 avant de coder) :

- en agglomération : **60 km/h** ;
- zones résidentielles et cours : **20 km/h** ;
- hors agglomération : **110 km/h** ;
- autoroute : limite affichée par le panneau 3.24, au maximum 140 km/h.
  Sans information, on applique **110 km/h** (*choix du constructeur, le plus prudent*).

Ordre de priorité : limite saisie par l'éditeur > limite d'OpenStreetMap > limite
par défaut selon le type de zone (en ville ou non, d'après les limites
d'agglomération d'OpenStreetMap).

### 6.3 Sources

- **OpenStreetMap** (gratuit, mention « © OpenStreetMap » obligatoire) : environ
  2 260 radars au Kazakhstan, dont ~60 % avec limite et ~25 % avec direction.
  57 caméras de feu rouge, **0 zone de vitesse moyenne**, presque aucune ligne
  continue, environ 27 % des grandes rues d'Almaty avec limite (comptage du 16/10/2026).
  On importe la zone d'Almaty et ses environs.
- **Liste Tengrinews** (tengrinews.kz/page/sergek) : 164 tronçons Sergek à Almaty,
  décrits en texte (sans coordonnées GPS). Elle sert de **référence à l'éditeur**
  pour placer les zones à la main. Elle n'est pas importée automatiquement.
- Interdit : copier les données de services commerciaux (SpeedCamOnline, 2GIS…).

## 7. Les alertes

| Situation | Quand | Message |
|---|---|---|
| Radar fixe | ~500 m avant, **seulement s'il surveille le sens du conducteur** | type, limite |
| Zone de vitesse moyenne | à l'entrée, puis bandeau maintenu jusqu'à la sortie | limite, distance restante, **moyenne calculée depuis l'entrée** |
| Caméra de carrefour | avant le carrefour | « ne pas franchir la ligne d'arrêt » |
| Ligne continue | au début de la portion | « pas de dépassement, encore X km » |
| Accident / panne | à l'approche | type d'événement |
| Dépassement de limite | en continu | vitesse en rouge (+ son bref, *choix du constructeur*) |

Les distances exactes et les sons sont laissés au constructeur, à ajuster après
des essais sur la route.

## 8. Recherche et guidage

- Recherche d'**adresses et de lieux** (entreprises, magasins…) dans Almaty, en
  utilisant les données gratuites d'OpenStreetMap. Limite connue : il y aura moins
  d'entreprises que dans 2GIS.
- Calcul du trajet en voiture, trajet dessiné sur la carte.
- **Guidage vocal tour par tour** (exigence du porteur pour le prototype), avec
  recalcul si le conducteur sort du trajet.
- Les alertes radar continuent pendant le guidage.

### 8.1 Trafic en temps réel (ajouté le 2026-10-16, jalon 3)

- Afficher le trafic (fluide / ralenti / bouchon) sur la carte et **calculer des
  trajets qui évitent les bouchons**.
- Source : **TomTom**. Sa documentation (édition de septembre 2026) indique que le
  Kazakhstan est couvert pour le trafic en temps réel, les incidents et le
  calcul d'itinéraire avec trafic. Une étude de 2026 a utilisé ces données à
  Almaty. Points à vérifier au début du jalon 3 : la densité réelle des rues
  couvertes à Almaty, le serveur à utiliser (certaines documentations
  mentionnent un serveur régional), et les limites de l'offre gratuite.
- Pourquoi pas OpenStreetMap : il ne contient pas de trafic. Pourquoi pas
  Yandex ou 2GIS : très bonnes données à Almaty, mais conditions d'utilisation
  plus restrictives ou payantes. HERE : couverture du Kazakhstan non confirmée.
- Plus tard, quand l'appli aura beaucoup de conducteurs à Almaty : compléter
  avec leurs propres vitesses (méthode de Waze).
- Conséquence : le guidage du jalon 3 utilise de préférence l'itinéraire TomTom
  (avec trafic) plutôt qu'un service OSM sans trafic.

## 9. Qui peut faire quoi

| Action | Conducteur | Éditeur (le porteur) |
|---|---|---|
| Voir la carte, les alertes, chercher, être guidé | ✅ | ✅ |
| Signaler un accident / une panne | ✅ | ✅ |
| Commenter un radar ou un événement | ✅ | ✅ |
| Ajouter, déplacer, supprimer radars, zones, lignes, limites | ❌ | ✅ |
| Supprimer un commentaire ou un signalement | ❌ | ✅ |

Les signalements temporaires disparaissent seuls après un délai (*choix du
constructeur : environ 1 h pour un accident, 30 min pour une panne*).

**Mode éditeur** : protégé par une connexion. On y place les éléments directement
sur la carte, sur le téléphone ou le PC : clic au début, clic à la fin, choix du
sens et de la limite.

## 10. Langues

Français, russe, kazakh, anglais, pour les textes et la voix. Langue choisie dans
les réglages.
Limite connue : la voix kazakhe dépend de ce que le téléphone propose. Beaucoup de
téléphones n'ont pas de voix kazakhe installée. Si elle manque, l'appli le signale
et propose le russe pour la voix.

## 11. Choix techniques (décidés par le constructeur, contestables)

- **Page web** (HTML, CSS, JavaScript), sans application à installer.
- **Carte** : bibliothèque gratuite (MapLibre ou Leaflet) avec un fond
  OpenStreetMap.
- **Hébergement** : gratuit avec https (GitHub Pages ou équivalent), obligatoire
  pour que le téléphone donne accès au GPS.
- **Base de données partagée** (radars, zones, signalements, commentaires,
  connexion de l'éditeur) : Supabase, offre gratuite.
- **Recherche d'adresses et itinéraires** : services gratuits basés sur
  OpenStreetMap (par ex. Photon/Nominatim pour la recherche,
  OSRM/GraphHopper/openrouteservice pour les trajets), à choisir selon leurs
  limites d'usage gratuites.
- **Voix** : synthèse vocale intégrée au navigateur du téléphone.
- **Écran allumé** : demander au navigateur de garder l'écran allumé pendant la conduite.

## 12. Ordre de construction (pour livrer vite quelque chose d'utile)

1. Carte + position GPS + vitesse actuelle sur le téléphone.
2. Radars OpenStreetMap d'Almaty + alertes (sens de circulation compris).
3. Limites de vitesse (OSM + défauts légaux) et vitesse en rouge.
4. Base de données + mode éditeur (radars, zones de vitesse moyenne, lignes continues).
5. Zones de vitesse moyenne avec moyenne calculée.
6. Recherche d'adresses et de lieux + trajet sur la carte.
7. Guidage vocal tour par tour, trafic en temps réel et évitement des bouchons (8.1).
8. Signalements accident / panne + commentaires.
9. Les 4 langues.

## 13. Laissé au constructeur

Distances et sons d'alerte, apparence exacte, choix précis des services gratuits,
structure du code et de la base de données, durée de vie des signalements.

## 14. Questions ouvertes

- Vérifier les limites hors agglomération et sur autoroute dans le texte officiel
  (section 6.2).

## 15. Identité des conducteurs (décidé par le porteur)

Pas de compte ni de mot de passe pour les conducteurs. Au premier signalement ou
commentaire, l'appli demande un **pseudo ou un nom**, puis le garde en mémoire
sur le téléphone. Le pseudo s'affiche à côté de chaque commentaire et
signalement. L'éditeur peut supprimer n'importe quel commentaire ou signalement.
