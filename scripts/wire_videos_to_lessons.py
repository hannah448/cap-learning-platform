#!/usr/bin/env python3
"""
Cap Learning — wire_videos_to_lessons.py
-----------------------------------------
Branche les 59 vidéos S3 du manifest aux leçons de video-mapping.json en
utilisant :
  1. Les ancres explicites (regex slug → lesson_id) fournies par Hannah
  2. Le `course` du manifest pour distribuer le reste sur des slots
     existants ou créer de nouveaux slots dans video-mapping.json

Produit :
  - scripts/upload_s3_log.txt (CSV : lesson_id, filename, s3_url, cdn_url)
    Vidéos non matchées listées sous `# UNMATCHED:` en fin de fichier
  - js/video-mapping.json patché : status=live + provider=mp4 + mp4.url=cdn_url
    pour chaque leçon branchée. Nouveaux slots créés si nécessaire.

Usage :
    python3 scripts/wire_videos_to_lessons.py            # dry-run
    python3 scripts/wire_videos_to_lessons.py --apply    # écrit les fichiers
"""

import argparse
import csv
import json
import os
import re
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPPING_PATH  = os.path.join(ROOT, 'js', 'video-mapping.json')
MANIFEST_PATH = os.path.join(ROOT, 'js', 'video-assets-manifest.json')
LOG_PATH      = os.path.join(ROOT, 'scripts', 'upload_s3_log.txt')

# ====================================================================
# ANCRES — regex slug → lesson_id (priorité maximale, Hannah-validées)
# ====================================================================
# Ordre important : la première qui matche gagne.
ANCHORS = [
    # E-COMMERCE
    (r'^bienvenue-developper-e-commerce',              'e1-1'),   # intro e-commerce
    (r'^bienvenue-fondamentaux-e-commerce',            'e1-1'),   # idem
    (r'^bienvenue-shopify',                            'e2-1'),   # Shopify intro
    (r'^introduction-shopify',                         'e2-1'),
    (r'^decouverte-et-configuration-shopify',          'e2-1'),
    (r'^configuration-paiements-expeditions',          'e4-2'),   # intégration paiement
    (r'^m-trouverproduitsdropshipping',                'e1-2'),   # niche & produits
    (r'^m-trouverdesproduits',                         'e1-2'),
    (r'^m-introductiondropshipping',                   'e1-2'),
    # RÉSEAUX SOCIAUX
    (r'^m-marketinginfluence',                         's2-1'),
    (r'^m-tiktocvendreproduits',                       's2-2'),
    (r'^m-communauteetventeinstagram',                 's2-3'),
    (r'^m-instagram',                                  's2-4'),
    (r'^m-facebookadsinstagramads',                    's2-5'),
    (r'^m-vendregraceafacebookinstagramads',           's2-6'),
    (r'^m-developperreseau',                           's2-7'),
    (r'^m-creercomptesreseauxsociaux',                 's1-1'),
    # MARKETING DIGITAL
    (r'^m-googleadscampagneshopping',                  'l3-3'),
    (r'^m-referencementnaturel',                       'l3-1'),
    (r'^m-creerplanningeditorialautomatise',           'l2-2'),
    (r'^m-etablirstrategiecontenuecommerce',           'l2-1'),
    # NO-CODE / AUTOMATION (les m-*automatis* + Zapier, Make, MCP, etc.)
    (r'^m-basesdelautomatisation',                     'n1-1'),
    (r'^m-automatisercestquoi',                        'n1-1'),
    (r'^m-Maitriser-Zapier',                           'n2-1'),
    (r'^m-connecteriaamake',                           'n2-2'),
    (r'^m-creer-des-workflows-automatises',            'n2-3'),
    (r'^m-identifier-les-contenus-a-automatiser',      'n3-1'),
    (r'^m-identifier-les-taches-automatisables',       'n3-2'),
    (r'^m-ajouter-des-outils-aux-IA-grace-aux-MCP',    'n4-1'),
    (r'^m-IA-Act-et-la-RGPD',                          'n5-1'),
    (r'^m-IA-responsable-et-le_-developpement-durable','n5-2'),
    (r'^m-assurer-une-veille-active',                  'n5-3'),
    (r'^m-bonuspromptsofferts',                        'n4-2'),
    (r'^m-certification-auto-no-code',                 'n6-1'),   # final certif

    # ECOMMERCE — slots additionnels (e5-x à e8-x créés dans NEW_SLOTS)
    (r'^creation-pages-principales-e-commerce-1',      'e5-1'),
    (r'^creation-pages-principales-e-commerce-2',      'e5-1b'),
    (r'^personnalisation-design-e-commerce',           'e5-2'),
    (r'^extensions-applications-shopify',              'e5-3'),
    (r'^integration-blog-shopify',                     'e5-4'),
    (r'^gestion-index-google-e-commerce',              'e6-1'),
    (r'^gestion-index-google-shopify',                 'e6-2'),
    (r'^referencement-local-boutique-en-ligne',        'e6-3'),
    (r'^gestion-commandes-relation-client',            'e7-1'),
    (r'^maintenance-evolution-boutique',               'e7-2'),
    (r'^lancement-promotion-boutique-en-ligne',        'e7-3'),
    (r'^preparation-conception-site-e-commerce',       'e7-4'),
    (r'^travailler-tunnel-achat-site-e-commerce',      'e7-5'),
    (r'^m-decouvrircomptabiliteecommerce',             'e8-1'),
    (r'^m-definirarborescencesiteecommerce-1',         'e8-2'),
    (r'^m-definirarborescencesiteecommerce-2',         'e8-2b'),
    (r'^m-definirarborescencesiteecommerce-3',         'e8-2c'),
    (r'^m-espionnerconcurenceventeenligne',            'e8-3'),
    (r'^m-configurernomdomainehebergementshopify',     'e2-2'),  # config Shopify détaillée

    # NO-CODE / AUTOMATION — slots additionnels
    (r'^m-applicationsconnecteessurmake',              'n2-4'),
    (r'^m-connecterbasededonneesamake',                'n2-5'),
    (r'^m-lexiqueetmotsclesdelautomatisation',         'n1-2'),
    (r'^m-panoramadesoutilsdautomatisation',           'n2-6'),
    (r'^m-n8n',                                        'n2-7'),

    # ECOMMERCE — derniers UNMATCHED → slots e8-x / e9-x
    (r'^m-introductionspecificitesecommerce',          'e1-1c'),
    (r'^m-lancement-site-vitrine-e-commerce',          'e7-3b'),
    (r'^m-legislationventeenligne',                    'e8-4'),
    (r'^m-preparation-conception-site-e-commerce-1-v3','e7-4b'),
    (r'^m-preparationcertificationshopify',            'e9-1'),
    (r'^m-preparationcertificationstrategieecommerce', 'e9-2'),
    (r'^m-trouverfournisseursdropshipping',            'e1-2b'),
    (r'^optimisation-referencement-naturel-e-commerce','e6-1b'),
    (r'^personnalisation-design-boutique',             'e5-2b'),
]

# ====================================================================
# Nouveaux slots à créer dans video-mapping.json
# (course_key → liste de lesson_id + title pour préremplir les leçons absentes)
# ====================================================================
NEW_SLOTS = {
    'reseaux-sociaux': [
        ('s1-1',  'Créer ses comptes réseaux sociaux pro'),
        ('s2-1',  'Marketing d\'influence : trouver et activer des partenariats'),
        ('s2-1b', 'Marketing d\'influence (suite)'),
        ('s2-2',  'TikTok : vendre ses produits via du contenu viral'),
        ('s2-2b', 'TikTok (suite)'),
        ('s2-3',  'Communauté & ventes Instagram'),
        ('s2-3b', 'Communauté Instagram (suite)'),
        ('s2-4',  'Maîtriser Instagram (contenu, hashtags, reels)'),
        ('s2-4b', 'Maîtriser Instagram (suite)'),
        ('s2-5',  'Facebook Ads & Instagram Ads — bases'),
        ('s2-5b', 'Facebook & Instagram Ads (suite)'),
        ('s2-6',  'Vendre grâce à Facebook & Instagram Ads — avancé'),
        ('s2-6b', 'Vendre via FB/Insta Ads (suite 2)'),
        ('s2-6c', 'Vendre via FB/Insta Ads (suite 3)'),
        ('s2-7',  'Développer son réseau d\'influence'),
        ('s2-7b', 'Développer son réseau (suite)'),
        ('s2-7c', 'Développer son réseau (3e partie)'),
    ],
    'marketing-digital': [
        ('l3-1', 'Référencement naturel (SEO) : les fondamentaux'),
        ('l3-3', 'Google Ads : campagnes Shopping pour e-commerce'),
        ('l2-1', 'Établir sa stratégie de contenu e-commerce'),
        ('l2-2', 'Créer un planning éditorial automatisé'),
    ],
    'no-code': [
        ('n1-1', 'Les bases de l\'automatisation no-code'),
        ('n1-2', 'Lexique et mots-clés de l\'automatisation'),
        ('n2-1', 'Maîtriser Zapier'),
        ('n2-2', 'Connecter une IA à Make'),
        ('n2-3', 'Créer des workflows automatisés'),
        ('n2-4', 'Applications connectées sur Make'),
        ('n2-5', 'Connecter une base de données à Make'),
        ('n2-6', 'Panorama des outils d\'automatisation'),
        ('n2-7', 'n8n : alternative open-source à Zapier/Make'),
        ('n3-1', 'Identifier les contenus à automatiser'),
        ('n3-2', 'Identifier les tâches automatisables'),
        ('n4-1', 'Ajouter des outils aux IA grâce aux MCP'),
        ('n4-2', 'Bonus : prompts offerts'),
        ('n5-1', 'IA Act & RGPD : conformité'),
        ('n5-2', 'IA responsable & développement durable'),
        ('n5-3', 'Assurer une veille active sur l\'IA'),
        ('n6-1', 'Obtention de votre certificat No-Code'),
    ],
    'ecommerce': [
        # Slots additionnels pour les 45 vidéos ecommerce qui débordent
        ('e1-1b', 'Fondamentaux e-commerce (suite)'),
        ('e2-1b', 'Découverte & configuration Shopify (suite)'),
        ('e2-2',  'Configuration domaine & hébergement Shopify'),
        ('e5-1',  'Création des pages principales e-commerce'),
        ('e5-1b', 'Création des pages principales (suite)'),
        ('e5-2',  'Personnalisation design e-commerce'),
        ('e5-3',  'Extensions et applications Shopify'),
        ('e5-4',  'Intégration blog Shopify'),
        ('e6-1',  'Gestion de l\'index Google e-commerce'),
        ('e6-2',  'Gestion de l\'index Google Shopify'),
        ('e6-3',  'Référencement local boutique en ligne'),
        ('e7-1',  'Gestion des commandes et relation client'),
        ('e7-2',  'Maintenance et évolution de la boutique'),
        ('e7-3',  'Lancement et promotion boutique en ligne'),
        ('e7-4',  'Préparation et conception du site e-commerce'),
        ('e7-5',  'Travailler le tunnel d\'achat'),
        ('e8-1',  'Découvrir la comptabilité e-commerce'),
        ('e8-2',  'Définir l\'arborescence du site e-commerce'),
        ('e8-2b', 'Arborescence du site (suite)'),
        ('e8-2c', 'Arborescence du site (3e partie)'),
        ('e8-3',  'Espionner la concurrence en vente en ligne'),
        ('e8-4',  'Législation de la vente en ligne'),
        ('e9-1',  'Préparation à la certification Shopify'),
        ('e9-2',  'Préparation à la certification Stratégie e-commerce'),
        ('e1-1c', 'Introduction aux spécificités e-commerce'),
        ('e1-2b', 'Trouver des fournisseurs dropshipping'),
        ('e5-2b', 'Personnalisation design boutique (suite)'),
        ('e6-1b', 'Optimisation du référencement naturel e-commerce'),
        ('e7-3b', 'Lancement site vitrine e-commerce'),
        ('e7-4b', 'Préparation & conception du site (3e partie)'),
    ],
    'ia-business': [
        # 3 vidéos ia-business (déjà 2 slots i1-1, i1-2 dans le mapping)
    ],
}

# ====================================================================
# Mapping course du manifest → course_key du video-mapping.json
# ====================================================================
MANIFEST_COURSE_TO_KEY = {
    'ecommerce':       'ecommerce',
    'no-code':         'no-code',
    'ia-business':     'ia-business',
    'marketing':       'marketing-digital',
    'reseaux-sociaux': 'reseaux-sociaux',
}


def find_anchor(slug):
    """Retourne lesson_id si une ancre matche, sinon None."""
    for pattern, lid in ANCHORS:
        if re.match(pattern, slug, re.IGNORECASE):
            return lid
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--apply', action='store_true', help='Écrit les fichiers (sinon dry-run)')
    args = ap.parse_args()

    with open(MAPPING_PATH, 'r', encoding='utf-8') as f:
        mapping = json.load(f)
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    print(f"📂 Mapping : {len(mapping.get('courses', {}))} courses")
    print(f"📂 Manifest: {len(manifest.get('videos', []))} vidéos\n")

    # --- ÉTAPE 1 : Créer les nouveaux slots dans video-mapping.json ---
    courses = mapping.setdefault('courses', {})
    slots_created = 0
    for course_key, slots in NEW_SLOTS.items():
        if course_key not in courses:
            # Crée le course si absent (ne devrait pas arriver)
            courses[course_key] = {
                'title': course_key.replace('-', ' ').title(),
                'landing_page': f'pages/formation-{course_key}.html',
                'lessons': {}
            }
        lessons = courses[course_key].setdefault('lessons', {})
        for lid, title in slots:
            if lid not in lessons:
                lessons[lid] = {
                    'title': title,
                    'status': 'pending',
                    'provider': 'mp4',
                    'duration_seconds': None,
                    'poster': None,
                    'subtitles': []
                }
                slots_created += 1
    print(f"✨ Nouveaux slots créés dans video-mapping.json : {slots_created}\n")

    # --- ÉTAPE 2 : Matcher les vidéos aux lesson_ids ---
    log_rows = []
    unmatched = []
    matched = {}   # lesson_id → video (pour détecter conflits)
    conflicts = []

    for v in manifest.get('videos', []):
        slug = v.get('slug')
        # 2a. Essaie les ancres explicites
        lesson_id = find_anchor(slug)

        if lesson_id:
            if lesson_id in matched:
                # Conflit : 2 vidéos veulent le même slot → ajoute suffixe b, c, d…
                conflicts.append((lesson_id, matched[lesson_id]['slug'], slug))
                # Cherche un suffixe libre
                for suf in 'bcdefghijk':
                    candidate = lesson_id + suf
                    if candidate not in matched:
                        lesson_id = candidate
                        break
            matched[lesson_id] = v

            log_rows.append({
                'lesson_id': lesson_id,
                'filename':  v.get('filename', ''),
                's3_url':    v.get('s3_url', ''),
                'cdn_url':   v.get('cdn_url', '')
            })
        else:
            unmatched.append(v)

    print(f"📌 Matchs par ancre : {len(matched)} sur {len(manifest['videos'])}")
    print(f"❓ Non matchées par ancre : {len(unmatched)}\n")

    if conflicts:
        print(f"⚠️  Conflits (2 vidéos pour le même slot) : {len(conflicts)}")
        for lid, first, second in conflicts:
            print(f"    {lid}: {first}  +  {second}")

    # --- ÉTAPE 3 : Patcher video-mapping.json pour les leçons matchées ---
    applied = 0
    for lid, video in matched.items():
        # Trouve le lesson_id dans le mapping (course_key cherché)
        found_course = None
        for ckey, c in courses.items():
            if isinstance(c, dict) and lid in c.get('lessons', {}):
                found_course = ckey
                break

        if not found_course:
            # Le lesson_id n'existe pas (ex: e1-1b après conflit)
            # → on l'ajoute dans le course indiqué par le manifest
            mcourse = video.get('course')
            target_ckey = MANIFEST_COURSE_TO_KEY.get(mcourse)
            if target_ckey and target_ckey in courses:
                courses[target_ckey].setdefault('lessons', {})[lid] = {
                    'title': video.get('title') or lid,
                    'status': 'pending',
                    'provider': 'mp4'
                }
                found_course = target_ckey

        if not found_course:
            continue

        lesson = courses[found_course]['lessons'][lid]
        url = video.get('cdn_url') or video.get('mp4_url') or video.get('s3_url')
        lesson['status']   = 'live'
        lesson['provider'] = 'mp4'
        lesson['mp4']      = {'url': url}
        lesson.pop('vimeo', None)
        lesson['_source']  = {
            'manifest_slug': video['slug'],
            'filename':      video.get('filename'),
            'confidence':    'anchor'
        }
        applied += 1

    print(f"✅ Leçons branchées (status=live + cdn_url) : {applied}\n")

    # --- ÉTAPE 4 : Génère upload_s3_log.txt ---
    log_lines = ['lesson_id,filename,s3_url,cdn_url']
    for r in log_rows:
        log_lines.append(f'{r["lesson_id"]},{r["filename"]},{r["s3_url"]},{r["cdn_url"]}')
    if unmatched:
        log_lines.append('')
        log_lines.append(f'# UNMATCHED — {len(unmatched)} vidéos pour lesquelles aucune ancre n\'a matché.')
        log_lines.append('# À mapper manuellement quand un lesson_id sera défini.')
        for v in unmatched:
            log_lines.append(f',{v.get("filename", "")},{v.get("s3_url", "")},{v.get("cdn_url", "")}')

    # --- Rapport ---
    print("=" * 80)
    print(f"RÉCAP")
    print(f"=" * 80)
    print(f"  Vidéos manifest          : {len(manifest['videos'])}")
    print(f"  Mappées via ancre        : {len(matched)}")
    print(f"  Branchées dans mapping   : {applied}")
    print(f"  Conflits (suffix -b)     : {len(conflicts)}")
    print(f"  UNMATCHED (à mapper main): {len(unmatched)}")
    print(f"  Nouveaux slots créés     : {slots_created}")

    if unmatched:
        print(f"\n📋 UNMATCHED — à reviser manuellement :")
        for v in unmatched[:15]:
            print(f"    {v.get('course', '?'):18} {v.get('slug', '?')}")
        if len(unmatched) > 15:
            print(f"    ... +{len(unmatched) - 15} autres")

    if not args.apply:
        print(f"\n💡 DRY-RUN — rien écrit. Pour appliquer : python3 {sys.argv[0]} --apply")
        return

    # --- ÉTAPE 5 : Écrire les fichiers ---
    if '_doc' in mapping:
        mapping['_doc']['last_updated'] = datetime.now(timezone.utc).isoformat(timespec='seconds')

    backup = MAPPING_PATH + '.bak'
    os.replace(MAPPING_PATH, backup) if os.path.exists(MAPPING_PATH) else None
    with open(MAPPING_PATH, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)
    print(f"\n💾 Écrit : {MAPPING_PATH}")
    print(f"   Backup : {backup}")

    with open(LOG_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(log_lines))
    print(f"💾 Écrit : {LOG_PATH}")


if __name__ == '__main__':
    main()
