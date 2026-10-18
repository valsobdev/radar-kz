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

## 5. Te déclarer éditeur
Retourne dans **SQL Editor**, nouvelle requête, remplace l'email par le tien, puis **Run** :

```sql
insert into editors (user_id) select id from auth.users where email = 'ton@email.com';
```

Tu dois voir « Success » (1 ligne ajoutée).

## 6. Copier les clés dans le projet
1. Menu **Project Settings** (roue dentée), puis **API**.
2. Copie **Project URL** (de la forme `https://xxxx.supabase.co`) dans `SUPABASE_URL` du fichier `src/config.js`.
3. Copie la clé **anon public** (longue suite de caractères) dans `SUPABASE_ANON_KEY`.

Ne copie **jamais** la clé `service_role` : elle est secrète. La clé `anon` est publique par conception et peut être dans le dépôt.

## Vérification
Remplace `URL` et `ANON` par tes valeurs.

Lecture publique : doit répondre `[]`.
```
curl "URL/rest/v1/elements?select=id" -H "apikey: ANON"
```

Écriture avec la seule clé anon : doit être refusée (401 ou 403).
```
curl -X POST "URL/rest/v1/elements" -H "apikey: ANON" -H "Content-Type: application/json" -d '{"kind":"other"}'
```
