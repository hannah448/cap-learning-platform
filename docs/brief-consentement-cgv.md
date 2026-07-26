# Brief Claude Code — Recueil du consentement CGV et de la renonciation au droit de rétractation

Projet : `~/Digi Africa/digi-learn` (site Cap Learning, HTML statique + fonctions serverless Vercel, `cleanUrls: true`).

---

## 1. Contexte

Les CGV viennent d'être publiées sur `pages/cgv.html`. Deux de leurs articles décrivent un mécanisme qui **n'existe pas encore dans le code** :

- **Article 1** : « Toute commande implique l'acceptation pleine et entière des présentes CGV, matérialisée par la case à cocher prévue à cet effet lors de la validation du panier. »
- **Article 10** : « L'accès aux parcours étant ouvert immédiatement après le paiement, le client est invité, lors de la validation de sa commande, à donner cet accord et à renoncer expressément à son droit de rétractation, en cochant la case prévue à cet effet. »

Aujourd'hui, aucun des deux parcours d'achat ne recueille de consentement. Tant que ce n'est pas corrigé :

- les CGV décrivent une réalité fausse, ce qui les fragilise en cas de litige ;
- la renonciation au droit de rétractation prévue à l'article L221-28, 13° du Code de la consommation est **inopposable** — un client peut donc exiger le remboursement dans les 14 jours après avoir consommé l'intégralité du parcours, sans que la garantie commerciale n'y change rien ;
- c'est le premier point de contrôle des prestataires de paiement (FedaPay/CinetPay, PayDunya) et des régies publicitaires lors de la revue d'un compte marchand.

### Les deux parcours d'achat à couvrir

**Parcours A — quick-buy** (majoritaire). Bouton « Acheter » sur les quatre pages `pages/formation-*.html` → `js/buy-flow.js` → `handleBuyClick()` → redirection navigateur `GET /api/create-checkout?course=<slug>&user_id=<uuid>` → **302 direct vers la page de paiement**. Il n'y a aucun écran intermédiaire : c'est le trou principal.

**Parcours B — panier**. `pages/panier.html` → bouton `#checkout-btn` → modale `#checkout-overlay` → `processPayment()` (ligne ~983) → `Checkout.start({...})` → `POST /api/create-checkout`. La modale contient déjà le choix du moyen de paiement, le champ téléphone et le bouton `#modal-confirm-btn`. C'est l'emplacement naturel des cases à cocher.

---

## 2. Objectif

Recueillir, **avant tout départ vers la page de paiement**, deux consentements distincts, les faire respecter côté serveur, et en conserver la preuve.

### Règles juridiques à respecter à la lettre

1. **Deux cases séparées**, jamais fusionnées en une seule :
   - case 1 — acceptation des CGV (avec lien vers `/pages/cgv`, ouvert dans un nouvel onglet, sans quitter le tunnel) ;
   - case 2 — demande d'accès immédiat **et** renonciation expresse au droit de rétractation.
2. **Décochées par défaut.** Aucune case pré-cochée, aucun consentement implicite, aucun « en cliquant sur Payer vous acceptez ».
3. **Bloquantes.** Le bouton de paiement reste désactivé tant que les deux cases ne sont pas cochées, avec un message d'erreur explicite si l'utilisateur tente de forcer.
4. **Pas de dark pattern.** Texte lisible (pas de gris clair sur blanc, pas de taille réduite), cases de taille normale, formulation neutre. La case 2 doit dire en clair ce que le client perd.
5. **Preuve conservée.** Horodatage, version des CGV, identifiant utilisateur et référence de transaction, stockés côté serveur au moment de la création de la commande — pas en `localStorage`.

### Formulations à utiliser telles quelles

> ☐ J'ai lu et j'accepte les [Conditions générales de vente](/pages/cgv) de Cap Learning.

> ☐ Je demande à accéder immédiatement à ma formation et je renonce expressément à mon droit de rétractation de 14 jours. Je reste couvert par la garantie « satisfait ou remboursé » de 14 jours décrite à l'article 9 des CGV.

La seconde phrase n'est pas une formule de politesse : elle évite que la renonciation soit perçue comme une perte sèche, tout en restant exacte.

---

## 3. Travail attendu

### 3.1 Parcours B — `pages/panier.html`

Insérer le bloc de consentement dans la modale `#checkout-step-confirm`, **entre le bloc `#virement-info` (fin ligne ~734) et `<div class="checkout-actions">` (ligne ~736)**. Il doit être visible quel que soit le moyen de paiement sélectionné, y compris virement.

Dans `processPayment()` (ligne ~983), ajouter la vérification **avant** l'appel à `showProcessingStep()`, au même niveau que la validation du numéro de téléphone déjà présente. Si un consentement manque : `showToast(...)` et `return`, sans passer à l'étape de traitement.

Transmettre les consentements dans l'objet passé à `Checkout.start({...})`, aux côtés de `user_id` et `customer`.

Gérer aussi l'état du bouton `#modal-confirm-btn` : désactivé (`disabled` + style visuel cohérent avec le design system) tant que les deux cases ne sont pas cochées, réactivé ensuite. Réinitialiser les cases à chaque ouverture de la modale (`openCheckoutModal()`, ligne ~866) pour qu'un abandon suivi d'une reprise ne conserve pas un consentement périmé.

### 3.2 Parcours A — quick-buy

C'est le point le plus délicat : `handleBuyClick()` redirige aujourd'hui directement vers `/api/create-checkout`. Il faut intercaler un écran de consentement.

Approche recommandée : ajouter dans `js/buy-flow.js` une étape de confirmation réutilisant le pattern de `js/auth-modal.js` — une modale légère qui affiche le parcours, le prix, les deux cases, un bouton « Payer » et un lien « Annuler ». La redirection vers `/api/create-checkout` n'a lieu qu'après validation, et les consentements sont ajoutés à l'URL (ou basculés en `POST`, voir 3.3).

Ne pas dupliquer le markup dans les quatre pages `formation-*.html` : le composant doit être généré par `buy-flow.js` et injecté dans le DOM, comme le fait déjà `auth-modal.js`. Vérifier le rendu sur les quatre pages.

Si la modale d'authentification s'affiche (utilisateur non connecté), l'écran de consentement doit venir **après** la connexion, avant le paiement — jamais avant, sinon le consentement est perdu au retour de `connexion`.

### 3.3 Serveur — `api/create-checkout.js`

Le contrôle client ne suffit pas : un appel direct à l'API le contournerait, et la preuve doit être produite par le serveur.

Rejeter la requête avec un `400` explicite si les deux consentements ne sont pas présents et vrais, dans les deux modes (GET quick-buy et POST panier). Vu que le mode A passe aujourd'hui par un `GET` avec redirection 302, deux options : accepter des paramètres de requête (`&cgv=1&waiver=1`), ou basculer le quick-buy en `POST` avec formulaire auto-soumis. **Privilégier la seconde** : un consentement dans une query string finit dans les logs d'accès et les `Referer`, ce qui est à la fois fragile juridiquement et discutable côté RGPD.

Enregistrer la preuve au moment de la création de la transaction, avant l'appel à `initCheckout()` : `user_id`, `transaction_id`, version des CGV, horodatage serveur (`new Date().toISOString()`, jamais une date client), adresse IP (`req.headers['x-forwarded-for']`), et les deux booléens séparément. Réutiliser les helpers existants de `lib/supabase-admin.js`.

Définir la version des CGV comme une constante partagée (par exemple `CGV_VERSION = '2026-07-26'`) et l'exposer aussi dans `pages/cgv.html` via un `<meta>` ou un attribut `data-`, pour que la version affichée et la version enregistrée ne puissent pas diverger.

### 3.4 Base de données

Ajouter une migration dans `scripts/db/` (le schéma existant est dans `scripts/db/schema.sql`, les politiques dans `scripts/db/rls.sql`) créant une table `order_consents` :

```
id, user_id (fk profiles), transaction_id, course_id,
cgv_accepted boolean not null, cgv_version text not null,
withdrawal_waived boolean not null,
ip inet, user_agent text, created_at timestamptz default now()
```

Prévoir les politiques RLS dans le même style que les tables existantes : lecture par le propriétaire, écriture réservée au service role. Un consentement est une preuve : **aucune route d'`UPDATE` ni de `DELETE`**, et pas de suppression en cascade si un profil est supprimé — remplacer l'identifiant par une valeur anonymisée plutôt que perdre la trace.

### 3.5 Confirmation

Sur `pages/merci.html` et dans l'email de confirmation (`lib/brevo.js`), rappeler en une ligne que le client a accepté les CGV et demandé l'accès immédiat, avec la date. C'est ce qui transforme le consentement en preuve confirmée par écrit sur support durable, comme l'exige l'article L221-13 du Code de la consommation.

---

## 4. Contraintes techniques

L'arbre de travail contient **un refactor `api/` → `lib/` en cours, non commité** (`api/lib/*.js` déplacés, plusieurs handlers modifiés). Ne rien réorganiser, ne pas `git add -A`. Travailler sur une branche dédiée (`feat/consentement-cgv`) et ne commiter que les fichiers touchés par ce brief.

Le site est en HTML statique sans build : pas de framework, pas de bundler, pas de nouvelle dépendance npm côté front. Le JavaScript existant est en ES5/ES6 simple, sans transpilation — s'aligner dessus.

Utiliser exclusivement les variables du design system (`css/tokens.css`) : pas de couleur en dur. Le site a un mode sombre piloté par `data-theme` sur `<html>` — vérifier le rendu des cases et du texte dans les deux thèmes.

Accessibilité : `<label for>` correctement associé à chaque `<input type="checkbox">`, focus visible au clavier, `aria-describedby` pour le message d'erreur, et parcours complet réalisable sans souris. Les cases doivent rester confortablement cliquables sur mobile (cible d'au moins 44 px).

Ne pas modifier `pages/cgv.html`, `pages/mentions-legales.html`, `pages/cgu.html` ni `pages/confidentialite.html` : leur contenu est validé.

---

## 5. Critères d'acceptation

1. Sur les quatre pages `formation-*.html`, cliquer « Acheter » n'envoie plus directement vers la page de paiement : un écran de consentement s'intercale.
2. Sur `pages/panier.html`, le bouton « Confirmer le paiement » est inactif tant que les deux cases ne sont pas cochées, et le devient dès qu'elles le sont.
3. Fermer puis rouvrir la modale remet les deux cases à zéro.
4. Un `POST /api/create-checkout` sans consentement renvoie `400` avec un message explicite, y compris appelé directement (curl) hors du navigateur.
5. Après un paiement de test, une ligne existe dans `order_consents` avec la bonne `transaction_id`, la bonne version de CGV et un horodatage serveur.
6. Le parcours complet fonctionne au clavier seul, et le rendu est correct en thème clair comme en thème sombre.
7. Un utilisateur non connecté qui clique « Acheter » se connecte, revient, et voit alors l'écran de consentement — son consentement n'est ni perdu ni pré-rempli.
8. `git status` ne montre aucun fichier du refactor `api/` → `lib/` dans le commit produit.

---

## 6. Hors périmètre

Le montant du capital social, la ville du greffe, l'adresse de l'hébergeur, la durée minimale garantie d'accès, le régime de TVA et le médiateur de la consommation sont signalés en jaune dans les pages légales et attendent des informations que seule Hannah peut fournir. Ne pas inventer de valeurs, ne pas retirer les marqueurs.

Le `robots.txt` et le `sitemap.xml` (tous deux en 404 aujourd'hui) font l'objet d'un chantier séparé.
