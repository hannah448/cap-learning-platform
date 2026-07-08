# fix12min — Réparation des 45 vidéos batch 1 tronquées à 12 min

**Contexte (7-8 juillet 2026)** : les 59 vidéos du batch 1 avaient été encodées
avec `DUREE_MAX=720` → 45 coupées à 12min00 pile (originaux : 12min21 à 70min41,
soit ~24 h de contenu manquant). Décision : option « leçon avec parties
enchaînées » — chaque vidéo complète est découpée en parties d'environ 12 min
qui s'enchaînent dans le lecteur.

## État
- ✅ 45 vidéos retéléchargées depuis Vimeo, réencodées en durée complète,
  durées vérifiées identiques à Vimeo (0 échec)
- ✅ Découpées en **165 parties** (~12 min, sans réencodage) → `parts/` (5,9 Go)
- ✅ Lecteur multi-parties (js/video-player.js v1.2.0) + mappings mis à jour
  (video-mapping.json, video-assets-manifest.json) + bug data-index=-1 corrigé
  dans apprendre.html — testé en local, prêt à déployer
- ⏳ Upload S3 : **bloqué, identifiants AWS absents de la machine**

## Contenu
- `videos_afrique_720p/` : les 45 MP4 complets (garder jusqu'à validation prod)
- `parts/` : les 165 fichiers `<slug>_720p_afrique_pN.mp4` à uploader
- `parts.json` : durées exactes de chaque partie (source des mappings)
- `upload/videos_afrique_720p` : lien vers `parts/` pour le script d'upload
- `echecs.txt` : vide (aucun échec)

## Mise en ligne (dans CET ordre)
1. **Restaurer l'accès AWS** : télécharger un CSV de clés IAM
   `caplearning-uploader` depuis la console AWS, puis :
   `cd scripts && ./setup_aws_from_csv.sh`
2. **Uploader les parties** (nouveaux noms → aucun risque pour l'existant,
   aucune purge de cache nécessaire) :
   `cd scripts/fix12min/upload && PATH="$HOME/bin:$PATH" ../../upload_s3_afrique.sh`
3. **Vérifier une lecture** : ouvrir
   `https://cdn.cap-learning.com/cap-learning/videos/configuration-paiements-expeditions-1-v1_720p_afrique_p1.mp4`
4. **Déployer le code** : commit + push (Vercel redéploie) — SEULEMENT après
   l'upload, sinon les leçons pointeraient vers des fichiers absents.
5. Plus tard, après validation : supprimer du bucket les 45 anciens fichiers
   tronqués `<slug>_720p_afrique.mp4` (devenus orphelins).
