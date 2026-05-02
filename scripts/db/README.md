# Cap Learning — Setup Supabase (DB + Auth)

Guide pas-à-pas. Compte ~30 min pour la première fois.

---

## 1. Créer le projet Supabase (5 min)

1. Va sur https://supabase.com → **Sign up** (avec ton email Cap Learning)
2. **New project** :
   - Name : `cap-learning`
   - Database password : génère un mot de passe fort → **sauvegarde-le dans 1Password**
   - Region : **Frankfurt (eu-central-1)** ← latence Afrique de l'Ouest ~80ms
   - Pricing plan : **Free** (largement suffisant : 500 MB DB, 50K MAU, 1 GB Storage)
3. **Create new project** → attends ~2 min que ça provisionne

---

## 2. Récupérer les 3 keys (2 min)

Dashboard → **Settings → API** :

| Variable | Visible | Usage |
|---|---|---|
| **Project URL** | `https://xxxxx.supabase.co` | Frontend + serveur |
| **anon public** | `eyJ...` (long) | **Frontend** (HTML/JS) — sécurisé par RLS |
| **service_role secret** | `eyJ...` (long, caché par défaut, clic pour révéler) | ⚠️ **SERVEUR UNIQUEMENT** — bypass RLS |

⚠️ Ne mets **JAMAIS** le `service_role secret` dans le frontend ou dans git.

---

## 3. Lancer les SQL (3 min)

1. Dashboard → **SQL Editor** → **New query**
2. Colle tout le contenu de **`schema.sql`** → **Run** (Ctrl/Cmd+Enter)
   - Tu dois voir "Success. No rows returned." en bas.
3. **New query** à nouveau, colle **`rls.sql`** → **Run**
4. Vérifie : Dashboard → **Authentication → Policies** → tu vois 10+ policies listées sur les 4 tables.

---

## 4. Activer Email/Password (2 min)

Dashboard → **Authentication → Providers** :

- **Email** → activé par défaut
  - **Confirm email** : désactive en développement (réactive avant la prod)
  - **Secure email change** : ON
- (Optionnel) **Google** → si tu veux le login Google plus tard

Dashboard → **Authentication → Email Templates** :

- Personnalise le mail de bienvenue avec le branding Cap Learning (plus tard)

---

## 5. Configurer le frontend (5 min)

Dans le projet local :

```bash
cd "/Users/hannahpeters/Documents/Documents - MacBook de Hannah/afrilearn-platform"
cp js/config.js.example js/config.js
```

Édite `js/config.js` avec tes **vraies** valeurs :

```js
window.CapConfig = {
    SUPABASE_URL: 'https://xxxxx.supabase.co',  // ← ton Project URL
    SUPABASE_ANON_KEY: 'eyJ...'                 // ← ton anon public
};
```

⚠️ `js/config.js` est dans `.gitignore` — ne sera jamais commit.

---

## 6. Variables d'env Vercel (pour le webhook) (3 min)

Pour que le webhook CinetPay puisse créer une `enrollment` automatiquement après paiement, il faut le `service_role_key` côté serveur.

Vercel Dashboard → ton projet → **Settings → Environment Variables** :

| Name | Value | Environments |
|---|---|---|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (le **service_role secret**) | Production, Preview, Development |

Re-deploie après ajout des vars.

---

## 7. Te promouvoir admin (1 min)

Une fois que tu as créé ton premier compte via `pages/connexion.html`, retourne sur Supabase :

Dashboard → **SQL Editor** → :

```sql
update public.profiles
set role = 'admin'
where email = 'TON_EMAIL@cap-learning.com';
```

Tu peux aussi le faire via Dashboard → **Table Editor → profiles** → édite la ligne → change `role` en `admin`.

---

## 8. Vérification (1 min)

1. Ouvre Cap Learning local : http://localhost:8000
2. Va sur `pages/connexion.html` → crée un compte avec un email réel
3. Dashboard Supabase → **Authentication → Users** → tu dois voir ton email
4. **Table Editor → profiles** → ligne créée auto avec ton ID + email + role=apprenant
5. Connecte-toi → tu accèdes au dashboard

---

## Schéma de la DB

```
auth.users (Supabase) ────┐
                          │ 1-1
                          ▼
                       profiles
                          │ 1-N
              ┌───────────┴────────────┐
              ▼                        ▼
         enrollments          lesson_progress
              │ 1-N
              ▼
         certificates
```

---

## Tables

| Table | Lignes attendues | Notes |
|---|---|---|
| `profiles` | 1 par user | Étend `auth.users`, créé auto via trigger |
| `enrollments` | N (1 par achat) | Créé par webhook CinetPay après paiement réussi |
| `lesson_progress` | N (1 par user × leçon vue) | Mis à jour côté client à chaque play/95% |
| `certificates` | 1 par formation terminée | Généré quand tous les modules sont à 100% |

## Quotas Free Tier (Supabase)

- 500 MB DB → tu peux loger ~500K enrollments avant de payer
- 50K MAU (Monthly Active Users) → largement large pour Cap Learning V1
- 5 GB egress / mois → suffisant pour le chargement des metadata
- Auth illimité

Quand tu scale au-dessus, **25 $/mois** (Pro plan) débloque 8 GB DB + 250 GB transfer.

---

## Troubleshooting

### "permission denied for table profiles"
RLS bloque. Vérifie que tu es authentifié côté client (`CapAuth.getUser()` retourne un user).

### Le trigger handle_new_user échoue au signup
Vérifie dans Dashboard → Database → Logs. Souvent : un champ obligatoire dans `profiles` qui n'a pas de default.

### "Invalid API key"
Vérifie que `js/config.js` contient l'**anon public**, pas le service_role.

### Le webhook ne crée pas l'enrollment
Vérifie sur Vercel Logs que `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont bien définis. Vérifie aussi que tu utilises `createClient(URL, SERVICE_ROLE)` côté webhook (pas l'anon).
