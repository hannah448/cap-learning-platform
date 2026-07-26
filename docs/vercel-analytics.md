# Vercel Web Analytics — activation

Le code de tracking est **déjà en place** dans `js/analytics.js`. Il ne fait rien tant que tu n'as pas activé Web Analytics dans Vercel. Une case à cocher, c'est tout.

## Activer (2 min, gratuit)

1. Va sur **https://vercel.com/dashboard** → projet `cap-learning-platform`
2. Onglet **Analytics** (dans la barre du haut)
3. Bouton bleu **Enable Web Analytics**
4. Fini. Attends 10 min et rafraîchis — les premières vues arrivent.

## Ce qui est tracké

**Pageviews automatiques** — chaque page vue par un visiteur, sans code additionnel.

**Événements custom** (que j'ai posé dans le code) :

| Événement | Quand ça se déclenche | Utile pour |
|---|---|---|
| `annuaire_view` | Ouverture de `/pages/annuaire` | Adoption de l'annuaire |
| `annuaire_search` | Un filtre ou mot-clé est appliqué | Quels critères sont utilisés |
| `annuaire_profile_open` | Clic sur « Voir le profil » | Taux de curiosité |
| `annuaire_contact_click` | Clic sur bouton WhatsApp/LinkedIn/Insta | Prop `channel` = quel canal marche le mieux |
| `annuaire_report_sent` | Signalement envoyé | Volume de modération |
| `mon_profil_view` | Ouverture de `/pages/mon-profil` | Combien remplissent leur profil |
| `mon_profil_save` | Enregistrement du profil. Prop `first_opt_in: true` = première fois qu'on active la visibilité | Taux d'opt-in RGPD |

## Limites

- **Plan Hobby (gratuit) : 2 500 événements custom / mois**. Au-dessus, Vercel te propose un plan payant. Pour un lancement, largement suffisant.
- Ad-blockers → **~30 % des visiteurs bloquent le tracker** (comme partout). Chiffres à interpréter comme des tendances, pas des vérités absolues.
- **Zéro cookie, zéro donnée personnelle** — pas besoin de bandeau consentement RGPD.

## Consulter les données

Vercel Dashboard → projet → **Analytics** → onglets :
- **Visitors** : uniques par jour/semaine/mois
- **Pages** : quelles pages sont les plus vues
- **Events** : tes 7 événements custom, filtrables par prop

## Ajouter un événement plus tard

Depuis n'importe quelle page où `js/analytics.js` est chargé :

```js
window.capTrack('nom_evenement', { prop_optionnelle: 'valeur' });
```

Voilà tout.
