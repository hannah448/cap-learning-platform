# Google Search Console — activation Cap Learning

Guide pas-à-pas. Compte **15 minutes** au total. À faire une seule fois.

Search Console t'apprend :
- ✅ Sur quels mots-clés ta plateforme apparaît dans Google (« formation e-commerce Sénégal », etc.)
- ✅ Combien de fois tes pages sont vues dans les résultats, combien de clics
- ✅ Les erreurs d'indexation (page cassée, redirect mauvaise, mobile pas responsive)
- ✅ Les liens qui pointent vers ton site depuis d'autres sites

Ça **ne coûte rien**, ne pose aucun cookie, ne demande aucun bandeau RGPD.

---

## Étape 1 — Ouvrir Search Console (2 min)

1. Va sur **https://search.google.com/search-console**
2. Connecte-toi avec **le compte Google que tu utilises pour Cap Learning** (mets le bon compte, tu ne changeras pas facilement après)
3. Clic **Ajouter une propriété** (bouton bleu en haut à gauche si c'est ta première fois)

## Étape 2 — Déclarer le site (2 min)

Choisis le type **« Préfixe d'URL »** (celui de droite) :

- Colle : `https://cap-learning.com`
- Clic **Continuer**

*(Pas « Domaine » — ça demande une validation DNS chez OVH qu'on peut faire plus tard si besoin.)*

## Étape 3 — Valider la propriété (3 min)

Google va te proposer plusieurs méthodes. Choisis **« Balise HTML »** (la 2e option) :

1. Google affiche un bout de code du genre :
    ```html
    <meta name="google-site-verification" content="abcd1234EFGH5678..." />
    ```
2. Copie **uniquement la valeur** de `content="..."` — ex. `abcd1234EFGH5678...`

3. Ouvre le fichier `index.html` (à la racine du projet Cap Learning) et remplace la ligne :
    ```html
    <meta name="google-site-verification" content="REMPLACE_MOI_AVEC_TON_CODE_GOOGLE">
    ```
    par ta vraie valeur.

4. **Commit + push** ce changement (ou demande-moi de le faire).

5. Attends que Vercel redéploie (2-3 min).

6. Retourne sur Search Console et clic **Valider**. Google doit dire « Propriété validée ».

## Étape 4 — Envoyer le sitemap (1 min)

1. Menu de gauche → **Sitemaps**
2. Champ **Ajouter un sitemap** → tape : `sitemap.xml`
3. Clic **Envoyer**
4. Statut doit passer à **« Réussite »** dans les 24 h. Google va crawler toutes les pages listées dans le sitemap.

## Étape 5 — Attendre 3-7 jours

Google met **1 semaine environ** pour :
- Indexer toutes les pages du sitemap
- Commencer à te montrer des chiffres dans **Performance** (impressions, clics, position moyenne)

Reviens toutes les 2 semaines pour :
- Vérifier **Pages** : combien sont indexées, y a-t-il des erreurs
- Regarder **Performance** : quels mots-clés attirent des visiteurs

---

## Bonus — ce qui est déjà en place

- ✅ `robots.txt` à la racine (autorise Google, bloque les pages authentifiées)
- ✅ `sitemap.xml` à la racine (16 pages publiques)
- ✅ Balise `<meta name="google-site-verification">` dans `index.html` (à personnaliser)

Si tu ajoutes une nouvelle page marketing dans le futur (ex. `pages/formation-ia-2.html`), pense à l'ajouter dans `sitemap.xml`.

---

## Questions fréquentes

**Q : Search Console vs Google Analytics, c'est pareil ?**
Non. Search Console = ce qui se passe **sur Google** (recherches, impressions). Analytics = ce qui se passe **sur ton site** (pages vues, temps passé, conversions). Complémentaires.

**Q : Faut-il un bandeau cookies pour Search Console ?**
Non — Search Console ne pose aucun cookie chez tes visiteurs. C'est un outil externe qui interroge ton site depuis Google.

**Q : Comment améliorer ma position dans Google ?**
- Écrire un contenu unique et utile sur chaque fiche formation
- Titres `<title>` clairs et différents par page (déjà fait)
- Descriptions `<meta description>` accrocheuses (déjà fait)
- Obtenir des liens depuis d'autres sites qui parlent de Cap Learning
- Vitesse de chargement (déjà bonne grâce à Vercel)
