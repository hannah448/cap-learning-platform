#!/usr/bin/env python3
"""
build_ia_business_course.py — génère la formation « IA & Business » (cours '3' / ia-business)
à partir du plan validé (4 blocs / 19 modules).

Produit :
  1. Les entrées video-mapping.json sous courses['ia-business'].lessons  (status pending par défaut)
  2. Le bloc JS des modules à insérer dans COURSES_DATA['3'].modules de pages/apprendre.html

Usage :
  python3 build_ia_business_course.py            # dry-run : affiche ce qui serait généré
  python3 build_ia_business_course.py --apply     # applique au mapping (pending) + écrit le JS modules dans /tmp
  python3 build_ia_business_course.py --live       # passe les leçons dont le mp4 est bien sur S3 en live

Les durées d'affichage sont lues depuis videos_afrique_720p/*.mp4 si présents (sinon 'à venir').
"""
import json, os, re, sys, subprocess
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPPING = os.path.join(ROOT, 'js', 'video-mapping.json')
ENC_DIR = os.path.join(ROOT, 'scripts', 'videos_afrique_720p')
CDN = 'https://cdn.cap-learning.com/cap-learning/videos/'

# ---- Plan : (bloc_title, [ (lesson_id, titre, description, slug|None, reuse?) ]) ----
# slug None => leçon "à tourner" (pas de vidéo). reuse=True => déjà sur S3 (autre batch).
PLAN = [
 ("Bloc 1 · Comprendre l'IA et son potentiel", [
   ('i1-1',            "L'IA pour les entrepreneurs : vue d'ensemble", "Ce que l'IA change concrètement pour une petite entreprise.", 'EXISTING', True),
   ('ib-opportunites', "Identifier les opportunités IA dans son activité", "Détecter les tâches à optimiser et prioriser ses chantiers IA.", 'm-identifier-les-opportunites-ia-dans-une-activite-1-v1', False),
   ('ib-limites',      "Limites, risques et contraintes des IA génératives", "Ce que l'IA ne maîtrise pas encore : hallucinations, biais, contexte.", 'm-limites-risques-contraintes-des-IA-1-v1', False),
   ('ib-limites-b',    "Les défis de l'IA (suite)", "Approfondir les limites et défis de l'IA générative.", 'm-defisia-1-v1', False),
   ('ib-responsable',  "IA responsable & usage durable", "Adopter une utilisation responsable et maîtriser les impacts de l'IA.", 'm-IA-responsable-et-le-developpement-durable-1-v1', True),
 ]),
 ("Bloc 2 · Prendre en main les outils IA", [
   ('i1-2',            "ChatGPT & Claude : prise en main", "Démarrer efficacement avec les deux assistants de référence.", 'EXISTING', True),
   ('ib-prompt-1',     "Le prompting, c'est quoi ?", "Comprendre le rôle du prompt et ses principes.", 'm-promptercestquoi-1-v1', False),
   ('ib-prompt-2',     "Prompting : les do & don't", "Les bonnes et mauvaises pratiques pour des résultats fiables.", 'm-dodontprompting-1-v1', False),
   ('ib-prompt-3',     "Adapter le ton et le style de l'IA", "Faire écrire l'IA dans votre voix de marque.", 'm-promptertonstyle-1-v1', False),
   ('ib-texte',        "Générer du texte professionnel avec l'IA", "Créer articles, e-mails, scripts et documents rapidement.", 'm-generationtexteia-v1', False),
   ('ib-texte-b',      "Rédiger des contenus textuels (suite)", "Approfondir la rédaction assistée par l'IA.", 'm-rediger-des-contenus-textuels-avec-ia-1-v1', False),
   ('ib-visuels',      "Créer des visuels avec l'IA", "Produire des visuels de qualité cohérents avec sa marque.", 'm-generationvisuelsia-v1', False),
   ('ib-visuels-b',    "Créer des visuels avec l'IA (suite)", "Séries de visuels, campagnes, templates.", 'm-creer-des-visuels-avec-l-lia-1-v1', False),
   ('ib-videos',       "Créer des vidéos professionnelles avec l'IA", "Voix off, avatars, narration : concevoir des vidéos complètes.", 'm-creer-des-videos-avec-ia-1-v1', False),
 ]),
 ("Bloc 3 · Développer son activité grâce à l'IA", [
   ('ib-audit',        "Auditer son activité pour intégrer l'IA", "Diagnostiquer où l'IA apporte le plus de valeur.", 'm-realiser-un-audit-en-vue-d-integrer-l-ia-1-v1', False),
   ('ib-plan',         "Bâtir son plan d'intégration IA", "Construire une feuille de route priorisée.", 'm-construire-un-plan-de-recommandation-pour-integrer-ia-1-v1', False),
   ('ib-kpis',         "Analyser ses KPIs grâce à l'IA", "Suivre ses indicateurs et décider, sans être analyste.", 'm-analyser-les-kpis-grace-a-lia-1-v1', False),
   ('ib-donnees',      "Synthétiser et analyser des données avec l'IA", "Traiter des informations complexes et en tirer une synthèse.", 'm-synthetiser-des_donnees-grace-a-l-IA-1-v1', False),
   ('ib-com',          "Produire sa communication marketing avec l'IA", "Alimenter ses contenus à moindre effort.", 'm-iaauservicedevoscontenus-1-v3', False),
   ('ib-com-b',        "Planifier & diffuser ses contenus avec l'IA", "Automatiser la planification et la diffusion.", 'm-utiliser-une-ia-de-planification-et-de-diffusion_des_contenus-1-v1', False),
   ('ib-ereput',       "Surveiller son e-réputation avec l'IA", "Suivre son image en ligne.", 'm-surveiller-l-e-reputation-avec-l-ia-1-v1', False),
   ('ib-moderation',   "Relation client : modération & réponses avec l'IA", "Fluidifier la relation client grâce à l'IA.", 'm-utiliser-ia-moderation-reponse-commentaires-1-v1', False),
 ]),
 ("Bloc 4 · Déléguer à des agents IA (avancé)", [
   ('ib-mcp',          "Ajouter des outils aux IA grâce aux MCP", "Connecter l'IA à ses propres outils et données.", 'm-ajouter-des-outils-aux-IA-grace-aux-MCP-1-v1', True),
   ('ib-agent',        "Créer un agent IA (assistant / chatbot)", "Concevoir un assistant qui exécute des tâches récurrentes.", 'm-creer-un-agent-IA-1-v1', False),
   ('ib-agent-champ',  "Définir le champ d'action d'un agent", "Cadrer et sécuriser les actions d'un agent.", 'm-definir-le-champ-d-action-d-un-agent-IA-1-v1', False),
   ('ib-agent-optim',  "Optimiser un agent IA", "Fiabiliser et réduire le coût d'un agent.", 'm-optimiser-un-agent-IA-1-v1', False),
   ('ib-veille',       "Assurer une veille active sur l'IA", "Rester à jour dans un domaine qui évolue chaque semaine.", 'm-assurer-une-veille-active-sur-les-evolutions-de-l-IA-1-v1', True),
 ]),
]

def probe(slug):
    f = os.path.join(ENC_DIR, slug + '_720p_afrique.mp4')
    if not os.path.exists(f): return None
    try:
        out = subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',f], text=True).strip()
        return int(float(out))
    except Exception: return None

def dfmt(sec):
    return f"{sec//60}:{sec%60:02d}" if sec else "à venir"

def js_escape(s):
    return s.replace('\\','\\\\').replace("'","\\'")

def gen_modules_js():
    out = []
    for btitle, lessons in PLAN:
        rows = []
        for lid, title, desc, slug, reuse in lessons:
            if slug and slug != 'EXISTING':
                dur = dfmt(probe(slug))
                rows.append("                    { id: '%s', title: '%s', type: 'video', duration: '%s', content: '<p>%s</p>' }," % (lid, js_escape(title), dur, js_escape(desc)))
        if rows:
            out.append("                { title: '%s', lessons: [\n%s\n                ]}," % (js_escape(btitle), "\n".join(rows)))
    return "\n".join(out)

def apply_mapping(live=False):
    d = json.load(open(MAPPING), object_pairs_hook=OrderedDict)
    lessons = d['courses']['ia-business']['lessons']
    n_added = n_live = 0
    for btitle, plan_lessons in PLAN:
        for lid, title, desc, slug, reuse in plan_lessons:
            if not slug or slug == 'EXISTING':
                continue  # i1-1/i1-2 déjà présents ; leçons "à tourner" ignorées
            fn = slug + '_720p_afrique.mp4'
            on_s3 = reuse or os.path.exists(os.path.join(ENC_DIR, fn))
            status = 'live' if (live and on_s3) else ('live' if reuse else 'pending')
            lessons[lid] = OrderedDict([
                ('title', title),
                ('status', status),
                ('provider', 'mp4'),
                ('duration_seconds', probe(slug)),
                ('poster', None),
                ('subtitles', []),
                ('mp4', OrderedDict([('url', CDN + fn)])),
                ('_source', OrderedDict([
                    ('manifest_slug', slug),
                    ('filename', fn),
                    ('confidence', 'anchor'),
                    ('batch', 'batch3-ia-business-2026-07-08'),
                ])),
            ])
            n_added += 1
            if status == 'live': n_live += 1
    d['_doc']['last_updated'] = '2026-07-08T00:00:00+00:00'
    json.dump(d, open(MAPPING,'w'), ensure_ascii=False, indent=2)
    open(MAPPING,'a').write('\n')
    print(f"mapping: {n_added} leçons écrites, dont {n_live} en live")

if __name__ == '__main__':
    if '--apply' in sys.argv:
        apply_mapping(live='--live' in sys.argv)
        js = gen_modules_js()
        open('/tmp/ia_modules.js','w').write(js)
        print("modules JS -> /tmp/ia_modules.js (", js.count('id:'), "leçons vidéo )")
    else:
        print("=== DRY-RUN : modules JS générés ===")
        print(gen_modules_js()[:1600])
        print("\n... (", gen_modules_js().count('id:'), "leçons vidéo au total )")
