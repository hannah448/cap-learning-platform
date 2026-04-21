# Go-live checklist — Cap Learning

Du local au live en production, pas-à-pas. Cocher au fur et à mesure.

---

## Jour 1 — Site statique en ligne (≈ 1 h)

### 1. Créer le repo GitHub

**Option A — via le site web (recommandé si pas de `gh` CLI)**
- [ ] Se connecter à https://github.com (créer un compte si besoin)
- [ ] Cliquer *+ → New repository*
- [ ] Nom : `caplearning-platform` (ou `afrilearn-platform`)
- [ ] Visibilité : **Private** (recommandé tant que le code n'est pas public)
- [ ] **Ne pas** cocher "Add a README" ni ".gitignore" (déjà dans notre repo local)
- [ ] Cliquer *Create repository*
- [ ] Copier l'URL qui s'affiche (ex : `https://github.com/hannah/caplearning-platform.git`)

**Option B — via `gh` CLI**
```bash
brew install gh
gh auth login
cd afrilearn-platform
gh repo create caplearning-platform --private --source=. --push
```

### 2. Push le code local vers GitHub

Depuis `afrilearn-platform/` :

```bash
# Si pas déjà fait :
git add .
git commit -m "Initial commit"

# Remplacer l'URL par celle copiée à l'étape 1 :
git remote add origin https://github.com/VOTRE_USERNAME/caplearning-platform.git
git push -u origin main
```

Vérifier que le repo GitHub montre bien tous les fichiers.

### 3. Créer un compte Vercel + importer le repo

- [ ] Aller sur https://vercel.com/signup
- [ ] Cliquer *Continue with GitHub* (l'auth se fait automatiquement)
- [ ] Autoriser Vercel à accéder à votre compte GitHub
- [ ] Sur le dashboard Vercel, cliquer *Add New... → Project*
- [ ] Sélectionner le repo `caplearning-platform`
- [ ] Framework Preset : **Other** (Vercel détecte automatiquement HTML + api/)
- [ ] Root Directory : laisser à `./`
- [ ] Build Command : vide (pas de build nécessaire)
- [ ] Output Directory : vide
- [ ] Cliquer *Deploy*

➡️ En **90 secondes**, le site est en ligne sur `caplearning-platform-xxx.vercel.app`.

### 4. Vérifier

- [ ] Ouvrir l'URL Vercel → la home s'affiche
- [ ] Naviguer vers `/pages/plateforme.html` → la page plateforme s'affiche
- [ ] Ouvrir `/pages/contact.html` → le formulaire fonctionne (données stockées en localStorage pour l'instant)
- [ ] `/api/create-checkout` retourne `{"error":"Method not allowed"}` en GET (normal — la fonction existe mais n'accepte que POST)

---

## Jour 2 — Domaine + HTTPS (≈ 30 min)

### 5. Acheter le domaine

- [ ] Aller sur https://www.gandi.net (ou OVH / Namecheap)
- [ ] Chercher `caplearning.com` → ~12 €/an
- [ ] Acheter + activer la protection Whois (gratuite)

### 6. Connecter le domaine à Vercel

- [ ] Vercel → projet → *Settings → Domains*
- [ ] Cliquer *Add* → entrer `caplearning.com`
- [ ] Vercel affiche 2 enregistrements DNS à créer :
  - `A` record : `@` → `76.76.21.21`
  - `CNAME` record : `www` → `cname.vercel-dns.com`
- [ ] Chez Gandi → *DNS records* → ajouter ces 2 entrées
- [ ] Attendre propagation (typiquement 5-30 min)
- [ ] Vercel passera automatiquement en ✅ *Valid Configuration*
- [ ] Certificat HTTPS (Let's Encrypt) émis automatiquement sous 2 min

➡️ Le site est accessible sur **https://caplearning.com** 🎉

---

## Jour 2-3 — Email pro (≈ 30 min)

### 7. Créer une messagerie professionnelle

**Option low-cost : OVH Email Pro — 1,50 €/mois/boîte**
- [ ] Commander sur https://www.ovh.com/fr/emails/
- [ ] Créer les boîtes :
  - `hello@caplearning.com`
  - `factures@caplearning.com` (pour Pennylane)
- [ ] OVH fournit les enregistrements `MX`, `SPF`, `DKIM` — les ajouter dans les DNS Gandi

**Option confort : Google Workspace — 6 €/mois/boîte**
- [ ] https://workspace.google.com → *Start free trial*
- [ ] Suivre l'assistant pour configurer `caplearning.com`

➡️ Tester : envoyer un email depuis une adresse externe à `hello@caplearning.com` et inversement.

---

## Jour 3-5 — Vidéos Vimeo

### 8. Créer compte Vimeo + configurer la confidentialité

- [ ] S'inscrire sur https://vimeo.com → plan **Plus** (12 €/mois) ou **Pro** (20 €/mois)
- [ ] *Settings → Default privacy* :
  - Who can watch : **Only people with the private link**
  - Where can this be embedded : **Specific domains only** → ajouter `caplearning.com` et `caplearning-platform-xxx.vercel.app`

### 9. Upload + mapping

Pour chaque cours (répéter 25 fois) :

- [ ] Upload le MP4 sur Vimeo
- [ ] Attendre la fin de l'encoding (~5-10 min)
- [ ] Dans la page vidéo Vimeo → onglet *Embed* → copier l'URL :
  - Format : `https://player.vimeo.com/video/987654321?h=abc123def4`
  - ID = `987654321` · Hash = `abc123def4`
- [ ] Dans `js/video-mapping.json`, trouver la leçon correspondante (ex : `l1-1`) et remplir :
  ```json
  "vimeo": { "id": "987654321", "hash": "abc123def4" },
  "status": "live"
  ```
- [ ] Commit + push → Vercel redéploie automatiquement

---

## Jour 6-7 — Paiement réel (≈ 1 h)

### 10. Créer compte CinetPay

- [ ] https://cinetpay.com → *Créer un compte marchand*
- [ ] Fournir les pièces KYC (RCCM, carte ID dirigeant, RIB) — validation 24-48 h
- [ ] Une fois activé : *Intégration → Mes identifiants API* → copier :
  - `CINETPAY_API_KEY`
  - `CINETPAY_SITE_ID`
  - `CINETPAY_SECRET_KEY`
- [ ] *Intégration → URL de notification* → coller : `https://caplearning.com/api/webhook-cinetpay`

### 11. Activer Pennylane Pro

- [ ] https://pennylane.com → s'abonner au plan **Pro** (~49 €/mois)
- [ ] Paramétrer l'entreprise (SIRET, adresse, logo, RIB)
- [ ] *Paramètres → Intégrations → API → Créer un token* → copier `PENNYLANE_API_KEY`

### 12. Ajouter les env vars dans Vercel

- [ ] Vercel → projet → *Settings → Environment Variables*
- [ ] Ajouter les 6 variables (voir [`.env.example`](../.env.example)) :
  - `PUBLIC_BASE_URL=https://caplearning.com`
  - `CINETPAY_API_KEY=...`
  - `CINETPAY_SITE_ID=...`
  - `CINETPAY_SECRET_KEY=...`
  - `PENNYLANE_API_KEY=...`
  - `PENNYLANE_JOURNAL=VE`
- [ ] Scope : **Production + Preview**
- [ ] Redéployer (Vercel → *Deployments → ... → Redeploy*) pour que les vars soient prises en compte

### 13. Brancher le vrai checkout

Dans `js/checkout.js` ligne ~35 :
```js
MOCK: false,   // était true
```

Dans `pages/panier.html`, modifier `processPayment()` selon le snippet dans [`docs/BILLING_INTEGRATION.md`](BILLING_INTEGRATION.md).

Commit + push → redéploiement auto.

### 14. Test en sandbox CinetPay

- [ ] Mettre une formation au panier
- [ ] Cliquer *Payer* → redirection vers CinetPay
- [ ] Utiliser les [identifiants test CinetPay](https://docs.cinetpay.com/api/1.0-fr/checkout/test)
- [ ] Vercel → *Logs* → chercher `[webhook-cinetpay]` → doit afficher `→ Pennylane invoice XXX (created)`
- [ ] Pennylane → *Factures client* → la facture doit apparaître, marquée payée

---

## Jour 8 — Ouverture publique 🚀

- [ ] Tester une fois de plus le parcours complet (inscription → achat → lecture vidéo)
- [ ] Configurer Google Analytics ou Plausible (optionnel)
- [ ] Annoncer sur WhatsApp / LinkedIn / Instagram
- [ ] Monitorer les 48 premières heures (Vercel logs, CinetPay dashboard, Pennylane)

---

## Récap coûts mensuels

| Poste | Coût |
|---|---|
| Domaine (12 €/an amorti) | ~1 €/mois |
| Vercel Hobby | 0 € |
| Email OVH (2 boîtes) | ~3 €/mois |
| Vimeo Plus | 12 €/mois |
| CinetPay | 0 € fixe (~2-3 % par transaction) |
| Pennylane Pro | ~49 €/mois |
| **Total** | **~65 €/mois** |

---

## Quand passer au niveau supérieur

| Signal | À faire |
|---|---|
| > 50 users actifs | Migrer comptes localStorage → Supabase Auth |
| > 100 GB bandwidth/mois Vercel | Passer en Vercel Pro (20 €/mois) |
| > 500 €/mois Vimeo | Migrer sur AWS S3 + CloudFront |
| Plusieurs formateurs | Créer sous-comptes Pennylane + découper les rôles admin |
| Besoin SCORM / drip content avancé | Reconsidérer LearnWorlds (mais garder l'admin custom) |
