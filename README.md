# Cap Learning

Plateforme e-learning pour entrepreneurs d'Afrique francophone.
_by Digi Atlas_

> **Stack** : site statique HTML/CSS/JS · fonctions serverless Vercel (Node 20) · paiements CinetPay (Wave, Orange Money, MTN, Moov, Free Money, cartes) · facturation auto Pennylane · vidéos Vimeo (migration AWS prévue).

---

## Structure du projet

```
afrilearn-platform/
├── index.html                      Page d'accueil
├── pages/                          Toutes les autres pages
│   ├── catalogue.html              Liste des formations
│   ├── formation-*.html            8 pages de formation (landing)
│   ├── plateforme.html             Présentation du dashboard
│   ├── apprendre.html              Player de cours (leçons + quiz)
│   ├── dashboard.html              Espace apprenant
│   ├── admin.html                  Espace admin formateurs
│   ├── panier.html                 Panier + checkout
│   ├── connexion.html              Login / signup
│   ├── contact.html                Formulaire contact + FAQ
│   └── ...
├── css/
│   ├── style.css                   Styles globaux
│   ├── components.css              Composants réutilisables
│   └── admin.css                   Styles admin-spécifiques
├── js/
│   ├── checkout.js                 Bridge client → /api/create-checkout
│   ├── video-mapping.json          Lesson ID → source vidéo Vimeo/S3
│   ├── migrate-brand.js            Migration localStorage afrilearn_* → caplearning_*
│   ├── whatsapp-widget.js          Widget WhatsApp flottant
│   └── ...
├── api/                            Fonctions serverless Vercel
│   ├── create-checkout.js          POST — initie paiement CinetPay
│   ├── webhook-cinetpay.js         POST — reçoit notif CinetPay + crée facture Pennylane
│   └── lib/
│       ├── cinetpay.js             Wrapper API CinetPay
│       ├── pennylane.js            Wrapper API Pennylane
│       └── signature.js            Vérification HMAC webhook
├── img/                            Assets (logo Digi Atlas, avatars africains)
├── docs/
│   ├── BILLING_INTEGRATION.md      Guide d'activation paiement + facturation
│   └── GO-LIVE.md                  Checklist déploiement
├── vercel.json                     Config runtime serverless
├── .env.example                    Template variables d'env (6 clés)
└── .gitignore                      Exclut .env*, node_modules, etc.
```

---

## Lancement en local

Le site est 100 % statique côté front. Pour un aperçu local :

```bash
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

Les fonctions API dans `api/` ne tournent **pas** en local avec ce serveur — il faut soit :
- Installer Vercel CLI : `npm i -g vercel` puis `vercel dev`
- OU déployer sur Vercel preview (automatique à chaque `git push`)

---

## Déploiement

Voir [docs/GO-LIVE.md](docs/GO-LIVE.md) pour le pas-à-pas complet.

**TL;DR** :
1. Push sur GitHub
2. Import dans Vercel → déploiement auto en 90 s
3. Ajouter le domaine personnalisé + DNS
4. Coller les 6 variables d'env CinetPay + Pennylane
5. Passer `Checkout.MOCK = false` dans `js/checkout.js`

---

## Intégrations

| Service | Rôle | Doc |
|---|---|---|
| **Vercel** | Hébergement statique + fonctions serverless | [vercel.com/docs](https://vercel.com/docs) |
| **CinetPay** | Encaissement Wave / Mobile Money / cartes | [docs.cinetpay.com](https://docs.cinetpay.com) |
| **Pennylane** | Facture + compta auto | [pennylane.readme.io](https://pennylane.readme.io) |
| **Vimeo** | Hébergement vidéos cours | [developer.vimeo.com](https://developer.vimeo.com) |

Voir [docs/BILLING_INTEGRATION.md](docs/BILLING_INTEGRATION.md) pour l'architecture détaillée du flux paiement → facturation.

---

## État de l'intégration

- [x] Site marketing complet (accueil, catalogue, 6 fiches formation, plateforme, contact)
- [x] Player de cours avec quiz et progression en localStorage
- [x] Espace apprenant, admin formateur
- [x] Panier + checkout mocké
- [x] Skeleton intégration CinetPay + Pennylane (api/)
- [x] Client bridge checkout.js (mode MOCK par défaut)
- [x] Structure `js/video-mapping.json` pour mapper leçons → Vimeo
- [ ] Upload effectif des vidéos sur Vimeo
- [ ] Activation MOCK=false + branchement réel `processPayment()`
- [ ] DB utilisateurs (Supabase prévu pour > 50 users)

---

## Licence

Propriétaire — Digi Atlas, 2026. Tous droits réservés.
