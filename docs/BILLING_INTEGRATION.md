# Intégration Facturation — CinetPay × Pennylane

Cap Learning encaisse via **CinetPay** (Wave, Orange Money, MTN, Moov, Free Money, cartes bancaires) et génère automatiquement les factures dans **Pennylane** à chaque paiement validé.

---

## Architecture

```
  ┌──────────────────┐        ┌────────────────────────┐
  │  panier.html     │ 1 POST │  /api/create-checkout  │
  │  + checkout.js   │───────▶│  (Vercel serverless)   │
  └──────────────────┘        └──────────┬─────────────┘
           │                              │ 2 init payment
           │                              ▼
           │                   ┌────────────────────┐
           │                   │  CinetPay API      │
           │                   │  → payment_url     │
           │                   └──────────┬─────────┘
           │                              │ 3 redirect browser
           ◀──────────────────────────────┘
           │
           │  4 user pays on hosted checkout
           │     (Wave / Orange / MTN / carte)
           │
           ▼
  ┌──────────────────────────┐        ┌────────────────────┐
  │  CinetPay hosted page    │ 5 POST │  /api/webhook-     │
  │  (off-site)              │───────▶│  cinetpay          │
  └──────────────────────────┘        └──────────┬─────────┘
                                                 │ 6 verify HMAC
                                                 │ 7 re-check tx status
                                                 │ 8 create invoice
                                                 ▼
                                      ┌────────────────────┐
                                      │  Pennylane API     │
                                      │  → facture + email │
                                      └────────────────────┘
```

---

## Prérequis

### Comptes

| Service | Plan minimum | Coût |
|---|---|---|
| **CinetPay** | Merchant account, KYC validé | 0 € setup, ~2-3,5 % par transaction |
| **Pennylane** | Pro ou Premium (accès API) | ~29-79 €/mois selon plan |
| **Vercel** | Hobby (gratuit) suffit pour commencer | 0 € jusqu'à 100 GB bandwidth/mois |

### Clés à récupérer

**CinetPay** — dans le dashboard, *Intégration > Mes identifiants API* :
- `CINETPAY_API_KEY`
- `CINETPAY_SITE_ID`
- `CINETPAY_SECRET_KEY`

**Pennylane** — *Paramètres > Intégrations > API > Créer un token* :
- `PENNYLANE_API_KEY`
- (optionnel) code du journal de ventes : `PENNYLANE_JOURNAL` (par défaut `VE`)

---

## Structure des fichiers

```
afrilearn-platform/
├── api/                          Serverless functions (Vercel)
│   ├── create-checkout.js        POST — initie un paiement CinetPay
│   ├── webhook-cinetpay.js       POST — reçoit la notification CinetPay,
│   │                                    vérifie la signature, crée la facture Pennylane
│   └── lib/
│       ├── cinetpay.js           Wrapper API CinetPay (init + verify)
│       ├── pennylane.js          Wrapper API Pennylane (upsert client + facture + paiement)
│       └── signature.js          Vérification HMAC-SHA256 des webhooks
├── js/
│   └── checkout.js               Bridge client → /api/create-checkout
├── vercel.json                   Config runtime + headers sécurité
├── .env.example                  Template variables d'environnement
└── .gitignore                    Exclut les .env de Git
```

---

## Déploiement (première fois)

### 1. Créer le projet Vercel

```bash
npm i -g vercel     # si pas déjà installé
cd afrilearn-platform
vercel              # suit le wizard, link au projet
```

Vercel détecte automatiquement `api/*.js` comme fonctions serverless.

### 2. Ajouter les variables d'environnement

Dans le dashboard Vercel → *Settings > Environment Variables* :

| Nom | Valeur | Scope |
|---|---|---|
| `PUBLIC_BASE_URL` | `https://caplearning.com` | Production |
| `CINETPAY_API_KEY` | _votre clé_ | Production + Preview |
| `CINETPAY_SITE_ID` | _votre ID site_ | Production + Preview |
| `CINETPAY_SECRET_KEY` | _votre secret HMAC_ | Production + Preview |
| `PENNYLANE_API_KEY` | _votre token_ | Production + Preview |
| `PENNYLANE_JOURNAL` | `VE` | Production + Preview |

> Astuce : pour tester, créez un projet CinetPay et un Pennylane séparés en mode "test", assignés au scope `Preview` uniquement.

### 3. Configurer l'URL de notification côté CinetPay

Dans le dashboard CinetPay → *Intégration > URL de notification* :

```
https://caplearning.com/api/webhook-cinetpay
```

(Activer aussi "Tester" avant de passer en live.)

### 4. Activer le checkout réel côté frontend

Dans `js/checkout.js`, ligne 35 environ :
```js
MOCK: false,      // passer de true à false
```

Puis dans `pages/panier.html`, remplacer la simulation `setTimeout` de `processPayment()` par :

```js
function processPayment() {
    var method = PAY_METHODS[selectedMethod];
    var phone = document.getElementById('checkout-phone').value.trim();
    var user = JSON.parse(localStorage.getItem('caplearning_user') || '{}');
    var subtotal = Cart.items.reduce(function(s, i) { return s + i.price; }, 0);
    var total = subtotal - Math.round(subtotal * promoDiscount / 100);

    // Validation
    if (method.type === 'mobile' && phone.length < 8) {
        showToast('Numéro de téléphone invalide'); return;
    }
    if (!user.email) {
        showToast('Connectez-vous pour finaliser'); return;
    }

    // Show "processing" UI
    document.getElementById('checkout-step-confirm').style.display = 'none';
    document.getElementById('checkout-step-processing').classList.add('show');

    // Real checkout
    Checkout.start({
        course_id: Cart.items[0].id,
        course_label: Cart.items.length === 1
            ? Cart.items[0].title
            : Cart.items.length + ' formations Cap Learning',
        amount: total,
        currency: 'XOF',
        customer: {
            email: user.email,
            name: user.firstName || user.name || 'Apprenant',
            surname: user.lastName || '',
            phone_number: phone.startsWith('+') ? phone : '+221' + phone.replace(/\D/g, ''),
            country: user.country || 'SN'
        }
    }).catch(function(err) {
        // Show error, reopen modal
        document.getElementById('checkout-step-processing').classList.remove('show');
        document.getElementById('checkout-step-confirm').style.display = 'block';
        showToast(err.message || 'Paiement impossible, réessayez.');
    });
}
```

### 5. Tester

1. **Paiement test** sur preview : ajouter une formation au panier, cliquer "Payer", vous serez redirigé·e vers le checkout CinetPay test. Utiliser les [identifiants sandbox CinetPay](https://docs.cinetpay.com/api/1.0-fr/checkout/test).
2. **Vérifier le webhook** : dans les logs Vercel (`vercel logs`), chercher `[webhook-cinetpay]`. Vous devez voir `→ Pennylane invoice XXXX (created)`.
3. **Vérifier Pennylane** : dans votre compte, onglet *Factures client* — la facture doit apparaître, marquée payée, avec le bon client, le bon produit et la TVA.
4. **Vérifier l'email** : le client doit recevoir la facture PDF de la part de `facture@pennylane.com` au nom de Cap Learning.

---

## Considérations techniques

### Idempotence

Les webhooks CinetPay peuvent être renvoyés plusieurs fois (timeouts réseau, retries). Nous utilisons `external_reference` dans Pennylane = `cinetpay_transaction_id` pour dédoublonner. `findInvoiceByReference()` est appelé avant chaque création — si la facture existe déjà, on retourne 200 sans recréer.

### Sécurité

- **Signature HMAC** : le header `x-token` envoyé par CinetPay est vérifié en comparaison temporelle constante (`crypto.timingSafeEqual`) avant tout traitement. Tout webhook non signé → 401.
- **Re-vérification du statut** : on ne fait JAMAIS confiance au `cpm_result` du body du webhook. On appelle toujours `/payment/check` côté CinetPay pour confirmer. Un attaquant qui falsifierait le webhook (même avec la bonne signature — improbable mais) ne pourrait pas faire créer une facture pour un paiement non encaissé.
- **HSTS + no-store** sur `/api/*` déjà configuré dans `vercel.json`.
- **Secrets** : `CINETPAY_SECRET_KEY` et `PENNYLANE_API_KEY` ne sont **jamais** exposés au navigateur. Ils vivent uniquement dans l'environnement serverless.

### TVA

Par défaut on applique **18 %** pour l'Afrique de l'Ouest francophone (SN, CI, BJ, BF, ML, TG), **19 %** pour le Niger, **19,25 %** pour le Cameroun, **20 %** pour la France. À ajuster dans `api/webhook-cinetpay.js` → `VAT_BY_COUNTRY` selon votre statut fiscal. Si vous facturez HT (export hors zone), passer `vatRate: 'exempt'`.

Le montant envoyé à CinetPay est TTC. Le backend reverse-calcule le HT unitaire pour Pennylane.

### Multi-items

Pour un panier avec plusieurs formations, actuellement on envoie un seul `line_item` avec le label "N formations Cap Learning". Pour une facturation ligne par ligne, modifier `create-checkout.js` pour passer `Cart.items` dans `metadata`, puis `webhook-cinetpay.js` pour itérer et construire `line_items_attributes[]` avec chaque formation.

### Reconciliation

Pennylane importe automatiquement les relevés bancaires Wave/Orange/banque si vous connectez vos comptes (onglet *Synchronisations*). Le rapprochement facture ↔ encaissement se fait en ~1 clic grâce à la référence externe commune.

---

## Dépannage

| Symptôme | Cause probable | Fix |
|---|---|---|
| `401 invalid signature` dans les logs webhook | `CINETPAY_SECRET_KEY` incorrect ou non défini | Re-copier depuis le dashboard CinetPay |
| Facture non créée, pas d'erreur dans Vercel | Webhook non configuré côté CinetPay | Ajouter l'URL de notif dans le dashboard |
| `Pennylane 422 validation error` | `PENNYLANE_JOURNAL` invalide ou compte sans accès API | Vérifier code journal / plan Pro actif |
| Double facture pour le même paiement | Idempotency check cassé (changement de `external_reference`) | Garder `cpm_trans_id` comme référence stable |
| Paiement OK mais client pas débloqué | TODO dans `webhook-cinetpay.js` non implémenté | Ajouter l'appel à votre DB d'utilisateurs au `TODO: unlock course access` |

---

## Roadmap future

- [ ] Débloquer automatiquement l'accès formation côté Cap Learning (aujourd'hui : `TODO` dans le webhook)
- [ ] Email de confirmation Cap Learning brandé (en complément de celui de Pennylane)
- [ ] Dashboard admin : liste des transactions + filtres + export CSV
- [ ] Gestion des remboursements : endpoint `/api/refund` + avoir Pennylane
- [ ] Support multi-devises (XAF pour CM/CF/TD/GQ, MAD, EUR)
- [ ] Webhook inverse : Pennylane → Cap Learning pour marquer une facture comme encaissée après virement manuel
