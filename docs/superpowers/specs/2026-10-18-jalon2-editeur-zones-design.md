# Radar KZ — Jalon 2 : mode éditeur, zones et barre de zone

Date : 2026-10-18
Statut : brouillon, à valider par le porteur du projet
Complète : `docs/specs/2026-10-16-prototype-web-design.md` (appelé ici « conception initiale »).
Ce jalon correspond aux étapes 4 et 5 de sa section 12.

## 1. Pourquoi

L'appli est en **développement** : pas encore d'utilisateurs. Le but est d'obtenir
une appli **fiable**, et pour ça il faut **récolter des données sur le terrain**.

Une recherche du 18/10/2026 confirme qu'il n'existe **aucune donnée publique
réutilisable** avec les positions des caméras d'Almaty :
- pas de jeu de données ouvertes officiel (portail open data, police) ;
- les listes de caméras Sergek ne sont que des adresses en texte, dans la presse,
  souvent de 2018-2019 ;
- les zones de vitesse moyenne existent surtout sur les routes autour d'Almaty
  (périphérique BAKAD, Almaty–Bichkek, Almaty–Khorgos, Almaty–Konaïev), sans points
  de début et de fin publiés ;
- OpenStreetMap contient 161 radars à Almaty (16 avec un sens) et 0 zone de vitesse moyenne.

Donc : **le porteur relève lui-même** ce qu'il voit sur la route, avec un mode
éditeur, et ces relevés deviennent la base commune de l'appli.

## 2. Objectifs

1. Nouvelle disposition de l'écran de conduite et **barre de zone** (section 4).
2. **Mode éditeur** réservé au porteur : ajouter, déplacer, corriger, supprimer
   radars, caméras, contrôles et zones de vitesse moyenne (sections 5 et 6).
3. Les relevés sont **partagés** : tous les conducteurs de l'appli les voient.
   Seul l'éditeur peut écrire.
4. Les zones peuvent venir de **deux sources** : relevées à la main par l'éditeur, et
   calculées automatiquement à partir des données de carte (section 7).

## 3. Non-objectifs (autres jalons)

- Signalements d'accident / panne et commentaires des conducteurs (étape 8).
- Recherche, trajet, guidage, trafic (étapes 6-7). Les 4 langues (étape 9).
- Édition des **lignes continues** et des **limites par portion de route** :
  prévues dans la conception initiale (section 9), mais repoussées à un jalon
  suivant pour garder celui-ci raisonnable (*choix du constructeur*).

## 4. L'écran de conduite (validé avec le porteur, maquettes du 18/10)

**Changement de disposition** (remplace la section 5 de la conception initiale) :
- **Bas gauche** : la **vitesse actuelle** (rouge en cas de dépassement, comme aujourd'hui).
- **Bas droite** : le **panneau de limite** de vitesse.

**Barre de zone**, style Waze :
- Fine **barre verticale**, posée **au-dessus du panneau de limite** (bas droite).
- Juste au-dessus de la barre, une petite étiquette : **temps restant · distance
  restante**, par exemple « 45 s · 750 m ».
- **Pleine** à l'entrée de la zone, elle **descend** à mesure qu'on avance.
  Elle **disparaît** à la sortie. Elle n'est visible qu'autour des radars
  (détail en section 7) ; le reste du temps, elle est cachée.
- Couleur **rouge**, comme les alertes (*supposé par le constructeur, accepté par le porteur*).
- Le **temps restant** = distance restante ÷ vitesse actuelle (*supposé par le
  constructeur, accepté par le porteur*). Sous 10 km/h (bouchon, feu), le temps
  n'a pas de sens : on n'affiche que la distance (*choix du constructeur*).

**Nouveau style visuel : « verre dépoli »** (choisi par le porteur le 18/10, qui
trouvait l'ancien design « moche » ; maquette `style-sobre-v2.html`, version B) :
- Encadrés **transparents et flous** (effet verre) qui laissent deviner la carte :
  bandeau d'alerte, étiquette de la barre.
- **Vitesse** dans un bloc **foncé** bien contrasté, coins très arrondis, chiffres
  gros et serrés, « KM/H » en petit dessous.
- **Panneau de limite** blanc à bord rouge, avec un léger halo blanc.
- **Barre de zone** en dégradé orange → rouge.
- Bandeau d'alerte : icône dans un carré rouge en dégradé, type en gras, limite en
  dessous, **distance en gros à droite**.
- Ma position : flèche **violette** ; trajet surligné en violet (pour le guidage).
- Icônes fines dessinées (plus d'emoji) ; fond de carte plus calme.
- Le **même style** s'applique à l'écran de démarrage et au menu éditeur
  (*choix du constructeur* pour les détails). Si un téléphone ne sait pas faire
  l'effet de flou, les encadrés deviennent simplement blancs presque opaques.

**Ce qui se passe dans une zone de vitesse moyenne** (*choix du constructeur*,
complète la section 7 de la conception initiale) :
- À l'entrée : voix + bandeau du haut pendant quelques secondes, par exemple
  « Zone de vitesse moyenne, 60, sur 2,4 km ». Ensuite, seule la barre reste.
- Pendant la zone, l'appli calcule la **moyenne depuis l'entrée**. Si elle dépasse
  la limite, la vitesse passe au rouge et la voix prévient une fois
  (« Moyenne trop haute, ralentissez »). Ce message peut revenir seulement si la
  moyenne est d'abord redescendue d'au moins 5 km/h sous la limite.
- Dans une zone relevée par l'éditeur, le **panneau affiche la limite de la zone**,
  même si OpenStreetMap indique autre chose (priorité « éditeur > OSM > défaut »
  de la conception initiale, section 6.2).
- La règle actuelle reste valable dans la zone : rouler **en ce moment** au-dessus
  de la limite fait passer la vitesse au rouge, avec un bip, même si la moyenne est bonne.

## 5. Les éléments que l'éditeur peut placer

Le porteur veut « pouvoir tout faire ». Types :

| Type | Durée | Données |
|---|---|---|
| Radar fixe de vitesse | permanent | position, sens surveillé(s), limite |
| Caméra (Sergek, carrefour, feu rouge…) | permanent | position, sens, ce qu'elle contrôle (vitesse, feu rouge / ligne d'arrêt, autre) |
| Zone de vitesse moyenne | permanent | début, fin, tracé suivant la route, sens, limite |
| Poste de police fixe | permanent | position, sens, note |
| Contrôle mobile (voiture de police, radar sur trépied…) | **temporaire** | position, sens, note, heure de fin |
| Autre | permanent ou temporaire | position, sens, texte libre |

- **Sens** : « mon sens de circulation », « sens opposé » ou « les deux ».
  Quand l'élément est placé depuis la route, le sens est pris par défaut sur le
  cap du téléphone.
- **Contrôle mobile** : il disparaît seul à l'heure de fin. Par défaut **2 h**
  après sa création, modifiable (*choix du constructeur*).
- Chaque élément garde **qui l'a créé et quand**, et **quand il a été modifié**.
- Les **alertes** suivent la conception initiale (section 7) : bandeau + voix
  avant l'élément, seulement s'il surveille le sens du conducteur. Pour un
  contrôle de police, le message dit « Contrôle de police dans X m ».

## 6. Le mode éditeur

**Accès** : un compte éditeur avec connexion (email + mot de passe) via la base de
données. Aujourd'hui, il n'y a **qu'un seul éditeur** (le porteur). La base garde
quand même une **liste des éditeurs**, pour pouvoir en ajouter un plus tard sans
tout refaire (*choix du constructeur*). Le bouton du mode éditeur n'apparaît que quand l'éditeur est connecté. Les
autres conducteurs ne voient rien de ce menu. La connexion reste mémorisée sur le
téléphone.

**Sécurité au volant** (anti-objectif de la conception initiale : pas d'écran qui
distrait) : le mode éditeur est fait pour un **passager**, ou pour le conducteur
**à l'arrêt**. Un rappel s'affiche à l'ouverture du menu.

**Deux façons de placer un élément** :
1. **Depuis la route** : un gros bouton **« Marquer ici »**. L'élément est placé
   à la position GPS actuelle, avec le cap actuel comme sens. On choisit ensuite
   le type (gros boutons). Les détails peuvent être complétés plus tard.
   Pour une zone : bouton **« Début de zone ici »**, puis **« Fin de zone ici »**.
2. **Sur la carte** (téléphone ou PC) : toucher la carte pour placer, faire
   glisser pour déplacer, toucher un élément pour le modifier ou le supprimer.
   Pour une zone : toucher le début, puis la fin. Le tracé suit la route entre
   les deux.

**Éléments d'OpenStreetMap** : l'éditeur peut aussi les corriger (déplacer, sens,
limite) ou les **masquer** s'ils n'existent plus. Les données OSM d'origine ne
sont pas modifiées : la correction est enregistrée à part et prend le dessus.

## 7. Zones automatiques

Le porteur veut aussi des zones **calculées automatiquement**. Aujourd'hui
OpenStreetMap ne contient **aucune** zone de vitesse moyenne à Almaty. Les zones
automatiques viendront donc :
- des zones de vitesse moyenne ajoutées un jour dans OpenStreetMap (relations
  `enforcement` de type `average_speed`), lues au prochain import ;
- la barre n'est **pas** montrée sur les simples portions de route à limite
  constante (décidé par le porteur le 18/10 : « elle apparaît quand il y a un
  radar, et disparaît »).

**Quand la barre apparaît** (décidé par le porteur) : seulement quand il y a un radar.
- **Zone de vitesse moyenne** : de l'entrée à la sortie de la zone.
- **Radar fixe ou caméra de vitesse** : pendant l'approche, à partir du moment de
  l'alerte (~500 m), jusqu'au passage du radar. Elle montre alors le temps et la
  distance jusqu'au radar (*interprétation du constructeur, à confirmer par le
  porteur à la lecture*).
- Le reste du temps, elle est cachée.

Une zone relevée par l'éditeur prend le dessus sur une zone automatique au même endroit.

## 8. Où sont enregistrées les données

**Base de données partagée : Supabase, offre gratuite**, comme décidé dans la
conception initiale (section 11).

Dans la conversation du 18/10, le constructeur avait d'abord proposé d'enregistrer
les relevés directement dans le dépôt GitHub avec une clé secrète sur le
téléphone. **Correction** : la conception initiale avait déjà choisi Supabase, et
c'est le meilleur choix, parce qu'aux jalons suivants les conducteurs enverront
des signalements et des commentaires. GitHub ne peut pas recevoir ça
proprement. Supabase gère aussi la connexion de l'éditeur.

- **Lecture** : publique (tout conducteur lit les éléments).
- **Écriture** : uniquement le compte éditeur (règles de sécurité de la base).
- Les radars d'OSM restent dans `data/*.json`. L'appli fusionne au démarrage :
  données OSM + éléments de l'éditeur + corrections/masquages.
- **Réseau faible** : l'appli garde sur le téléphone la dernière copie téléchargée
  des éléments de l'éditeur. Sans réseau, elle utilise cette copie.
- **Relevés sans réseau** : « Marquer ici » et les autres modifications de
  l'éditeur marchent aussi sans réseau. Elles sont gardées en attente sur le
  téléphone, puis envoyées automatiquement au retour du réseau. Si un même élément
  a été modifié à deux endroits, la dernière modification gagne
  (*choix du constructeur*). Un petit compteur indique les relevés en attente.
- **Sauvegarde** : une tâche automatique GitHub (GitHub Actions) copie **chaque
  jour** les éléments de l'éditeur dans le dépôt (fichier JSON), pour ne jamais
  perdre les relevés. En passant, elle empêche le projet Supabase gratuit de se
  mettre en pause, ce qui arrive après une semaine sans activité
  (*choix du constructeur*).
- **À faire par le porteur, guidé pas à pas** : créer le compte et le projet
  Supabase (le constructeur ne peut pas créer de compte à sa place), donner
  l'adresse et la clé publique du projet, et ajouter la clé secrète de
  sauvegarde dans les réglages du dépôt GitHub. Le plan commence par cette étape.
- **Hébergement** : GitHub Pages, déjà en ligne sur
  https://valsobdev.github.io/radar-kz/ (depuis le 18/10/2026).

## 9. Anti-objectifs (en plus de ceux de la conception initiale)

- **Perdre des relevés de terrain** (d'où la sauvegarde et la copie locale).
- **Qu'un inconnu puisse modifier les données** (écriture réservée à l'éditeur).
- **Un mode éditeur qui pousse à manipuler le téléphone en roulant.**
- **Une barre qui affiche n'importe quoi** : si l'appli n'est pas sûre d'être dans
  la zone (GPS perdu, sortie de la route de la zone), la barre disparaît plutôt
  que d'afficher une valeur fausse.

## 10. Vérification

- Les 79 tests actuels continuent de passer. Nouveaux tests pour la logique :
  progression dans une zone, temps restant, moyenne depuis l'entrée, fusion
  OSM + éditeur + masquages, expiration des contrôles mobiles.
- La simulation (`?sim`) doit pouvoir traverser une zone de test.
- La fiche d'essai sur route (`docs/essai-route.md`) reçoit une section pour la
  barre de zone et le mode éditeur.

## 11. Laissé au constructeur

Structure de la base et du code, apparence exacte du menu éditeur et des icônes,
méthode pour que le tracé d'une zone suive la route, distances et textes des
alertes, fréquence de la sauvegarde.

## 12. Questions ouvertes

Aucune. La question « barre sur toutes les routes ? » a été tranchée par le
porteur : non, seulement autour des radars (section 7).
