# Mise en place de Supabase

Supabase héberge la base de données des éléments (radars, zones, etc.). Tout le monde peut les lire ; seul l'éditeur peut les modifier.

## 1. Créer le compte
1. Va sur https://supabase.com et clique sur **Start your project**.
2. Choisis **Continue with GitHub** et autorise l'accès.

## 2. Créer le projet
1. Clique sur **New project**.
2. Nom : `radar-kz`.
3. Région : **Central EU (Frankfurt)**.
4. Choisis un mot de passe de base de données : enregistre-le dans ton gestionnaire de mots de passe et ne le partage jamais (ni dans le chat, ni dans le dépôt).
5. Clique sur **Create new project** et attends 1 à 2 minutes que le tableau de bord s'affiche.

## 3. Créer les tables
1. Dans le menu de gauche, ouvre **SQL Editor**, puis **New query**.
2. Ouvre le fichier `supabase/schema.sql`, copie tout son contenu et colle-le dans la zone de texte.
3. Clique sur **Run**. Tu dois voir « Success. No rows returned ».

## 4. Créer l'utilisateur éditeur
1. Menu **Authentication**, puis **Users**, puis **Add user** → **Create new user**.
2. Saisis ton email et un mot de passe (différent de celui de la base).
3. Coche **Auto Confirm User**, puis valide. Ton utilisateur apparaît dans la liste.

## 4 bis. Fermer les inscriptions publiques
Menu **Authentication**, puis **Sign In / Providers**, et désactive **Allow new users to sign up**. Le bouton « Add user » continue de fonctionner pour toi (propriétaire).

## 5. Te déclarer éditeur
Retourne dans **SQL Editor**, nouvelle requête, remplace l'email par le tien, puis **Run** :

```sql
insert into editors (user_id) select id from auth.users where email = 'ton@email.com'
on conflict do nothing
returning user_id;
```

Une ligne affichée (ton `user_id`) = c'est bon. Aucune ligne = l'email ne correspond pas à celui de l'utilisateur, ou tu es déjà éditeur (vérifie avec `select * from public.editors;`).

## 6. Copier les clés dans le projet
1. Menu **Project Settings** (roue dentée), puis **API Keys**.
2. Le **Project URL** est sur la page **Data API** (ou dans la fenêtre **Connect** en haut du tableau de bord). Copie-le (de la forme `https://xxxx.supabase.co`) dans `SUPABASE_URL` du fichier `src/config.js`.
3. Les tableaux de bord récents affichent des clés « Publishable / Secret » et un onglet **Legacy API keys**. Ouvre cet onglet et copie la clé **anon public** (longue clé qui commence par `eyJ`) dans `SUPABASE_ANON_KEY`.

Ne copie **jamais** la clé `service_role` ni la clé « Secret » : elles sont secrètes. La clé `anon` est publique par conception et peut être dans le dépôt.

## Vérification
Lance ces commandes dans **Git Bash** (pas PowerShell, où `curl` est un autre outil qui déforme le JSON). Remplace `URL` et `ANON` par tes valeurs.

Lecture publique : doit répondre `[]`.
```
curl "URL/rest/v1/elements?select=id" -H "apikey: ANON"
```

Écriture avec la seule clé anon : doit répondre HTTP 401 avec un corps contenant `"code":"42501"` (règle de sécurité par lignes). Un 400 ou un 404 signifie que le test n'a pas fonctionné.
```
curl -X POST "URL/rest/v1/elements" -H "apikey: ANON" -H "Content-Type: application/json" -d '{"kind":"other"}' -i
```
