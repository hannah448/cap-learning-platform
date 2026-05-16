#!/usr/bin/env python3
"""
Cap Learning — audit_lesson_mapping.py
---------------------------------------
Compare les leçons définies dans `pages/apprendre.html` (COURSES_DATA)
avec le catalogue des vidéos S3 (`js/video-assets-manifest.json`).

Pour chaque leçon de COURSES_DATA, propose le meilleur match dans le
manifest (vidéos du même course) en se basant sur un score Jaccard
sur les tokens des titres.

Sortie :
- scripts/lesson_mapping_proposal.csv  (propositions à arbitrer humainement)
- stats console

Usage :
    python3 scripts/audit_lesson_mapping.py
"""

import csv
import json
import os
import re
import sys
import unicodedata

# Mapping legacy_id (URL ?id=N) → course_db_id (slug Supabase + manifest)
LEGACY_TO_DB = {
    '1':  'marketing',
    '2':  'ecommerce',
    '3':  'ia-business',
    '5':  'reseaux-sociaux',
    '10': 'entrepreneuriat'
}

# Stop-words FR pour Jaccard (mots vides à ignorer)
STOP_WORDS = {
    'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd',
    'a', 'au', 'aux', 'en', 'un', 'une',
    'et', 'ou', 'pour', 'dans', 'sur', 'par', 'avec', 'sans',
    'votre', 'votre', 'vos', 'notre', 'nos',
    'ce', 'cet', 'cette', 'ces', 'son', 'sa', 'ses', 'leur', 'leurs',
    'qui', 'que', 'quoi', 'dont', 'ou',
    'comment', 'pourquoi', 'quand',
    'plus', 'moins', 'tout', 'tous', 'toute', 'toutes',
    'est', 'sont', 'etre', 'avoir', 'fait', 'faire',
    'mp4', 'v1', 'v2', 'v3'
}


def normalize(text):
    """Lowercase + supprime accents + tokens."""
    if not text:
        return []
    text = text.lower()
    # supprime accents
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    # tokenize
    tokens = re.findall(r'[a-z0-9]+', text)
    return [t for t in tokens if t not in STOP_WORDS and len(t) > 1]


def jaccard(a, b):
    """Score Jaccard entre 2 sets de tokens (0..1)."""
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    inter = len(sa & sb)
    union = len(sa | sb)
    return inter / union if union else 0.0


def extract_courses_data(html_path):
    """
    Extrait COURSES_DATA depuis apprendre.html par regex.
    Retourne : { legacy_id: { name, lessons: [{ id, title, module }] } }
    """
    with open(html_path, 'r', encoding='utf-8') as f:
        src = f.read()

    # Trouve le bloc `const COURSES_DATA = { ... };` (approximatif)
    m = re.search(r'const\s+COURSES_DATA\s*=\s*\{', src)
    if not m:
        return {}
    start = m.end() - 1  # position du `{`

    # Trouve la fin du bloc en comptant les accolades (équilibre)
    depth, i = 0, start
    while i < len(src):
        c = src[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                break
        i += 1
    block = src[start:i + 1]

    # On extrait les courses : recherche les blocs '1': { ... 'name': '...' ... }
    # Stratégie simple : chercher tous les patterns "id: 'xxx-xxx', title: '...'"
    # qui correspondent aux leçons individuelles. Et le course_id depuis le contexte
    # le plus proche.

    # Découpe par sections de course (heuristique : '1': {...}, '2': {...})
    course_sections = []
    pat_course = re.compile(r"'(\d+)':\s*\{")
    for match in pat_course.finditer(block):
        legacy_id = match.group(1)
        if legacy_id not in LEGACY_TO_DB:
            continue
        # Trouve fin du course en comptant les accolades
        s = match.end() - 1
        d = 0
        j = s
        while j < len(block):
            c = block[j]
            if c == '{':
                d += 1
            elif c == '}':
                d -= 1
                if d == 0:
                    break
            j += 1
        course_sections.append((legacy_id, block[s:j + 1]))

    result = {}
    pat_lesson = re.compile(
        r"id:\s*['\"]([\w\-]+)['\"]\s*,\s*title:\s*['\"]([^'\"]+)['\"]",
        re.DOTALL
    )
    pat_name = re.compile(r"name:\s*['\"]([^'\"]+)['\"]")
    pat_module = re.compile(r"title:\s*['\"]([^'\"]*Module[^'\"]*?)['\"]")

    for legacy_id, course_block in course_sections:
        name_m = pat_name.search(course_block)
        course_name = name_m.group(1) if name_m else f'Course {legacy_id}'
        lessons = []
        # Trouve les leçons (id + title)
        for lm in pat_lesson.finditer(course_block):
            lid, ltitle = lm.group(1), lm.group(2)
            # Skip les "Module X" qui apparaissent comme objets parent
            if lid.lower().startswith('module') or 'module' in lid.lower():
                continue
            lessons.append({'id': lid, 'title': ltitle})
        result[legacy_id] = {
            'legacy_id': legacy_id,
            'course_db_id': LEGACY_TO_DB[legacy_id],
            'name': course_name,
            'lessons': lessons
        }
    return result


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    html_path = os.path.join(root, 'pages', 'apprendre.html')
    manifest_path = os.path.join(root, 'js', 'video-assets-manifest.json')

    print(f"📂 Parse {html_path}")
    courses = extract_courses_data(html_path)
    if not courses:
        print("❌ COURSES_DATA introuvable dans apprendre.html")
        sys.exit(1)

    print(f"📂 Parse {manifest_path}")
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    videos = manifest.get('videos', [])

    # Index manifest par course_db_id
    by_course = {}
    for v in videos:
        c = v.get('course')
        if c:
            by_course.setdefault(c, []).append(v)

    print("\n=== Catalogue source-of-truth (apprendre.html) ===")
    total_lessons = 0
    for legacy_id, c in courses.items():
        print(f"  course {legacy_id:>3} ({c['course_db_id']:18}) : {len(c['lessons']):3} leçons — {c['name']}")
        total_lessons += len(c['lessons'])
    print(f"  TOTAL : {total_lessons} leçons")

    print("\n=== Vidéos manifest par course ===")
    for db_id in sorted(set(LEGACY_TO_DB.values()) | set(by_course.keys())):
        n = len(by_course.get(db_id, []))
        print(f"  {db_id:18} : {n:3} vidéos")

    # Matching
    rows = []
    used_video_slugs = set()
    stats = {'high': 0, 'mid': 0, 'low': 0, 'no_match': 0}
    ambiguities = []  # cas où top1 et top2 sont proches

    for legacy_id, course in courses.items():
        db_id = course['course_db_id']
        candidates = by_course.get(db_id, [])
        for lesson in course['lessons']:
            ltokens = normalize(lesson['title'])
            scored = []
            for v in candidates:
                vtokens = normalize(v.get('title') or '') + normalize(v.get('slug') or '')
                score = jaccard(ltokens, set(vtokens))
                scored.append((score, v))
            scored.sort(key=lambda x: x[0], reverse=True)

            best_score = scored[0][0] if scored else 0
            best_v = scored[0][1] if scored else None
            second_score = scored[1][0] if len(scored) > 1 else 0

            if not best_v or best_score < 0.05:
                stats['no_match'] += 1
                rows.append({
                    'legacy_id': lesson['id'],
                    'legacy_title': lesson['title'],
                    'course_db_id': db_id,
                    'best_match_slug': '',
                    'best_match_title': '',
                    'score': 0,
                    'note': 'NO_MATCH'
                })
            else:
                if best_score >= 0.4:
                    stats['high'] += 1
                    note = 'HIGH'
                elif best_score >= 0.2:
                    stats['mid'] += 1
                    note = 'MID'
                else:
                    stats['low'] += 1
                    note = 'LOW'

                used_video_slugs.add(best_v['slug'])
                rows.append({
                    'legacy_id': lesson['id'],
                    'legacy_title': lesson['title'],
                    'course_db_id': db_id,
                    'best_match_slug': best_v['slug'],
                    'best_match_title': best_v.get('title') or '',
                    'score': round(best_score, 3),
                    'note': note
                })

                # Ambiguïté : top1 et top2 proches
                if best_score >= 0.2 and second_score > 0 and (best_score - second_score) < 0.10:
                    ambiguities.append({
                        'legacy_id': lesson['id'],
                        'legacy_title': lesson['title'],
                        'top1': (round(best_score, 3), best_v['slug']),
                        'top2': (round(second_score, 3), scored[1][1]['slug'])
                    })

    # Vidéos manifest non utilisées
    unused_videos = [v for v in videos if v.get('course') and v['slug'] not in used_video_slugs]

    # Écrit CSV
    csv_path = os.path.join(root, 'scripts', 'lesson_mapping_proposal.csv')
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['legacy_id', 'legacy_title', 'course_db_id',
                                          'best_match_slug', 'best_match_title',
                                          'score', 'note'])
        w.writeheader()
        for r in rows:
            w.writerow(r)

    # Rapport
    print(f"\n=== Matching scores ===")
    print(f"  HIGH (≥ 0.40)  : {stats['high']:3}  — probablement bons")
    print(f"  MID  (0.20-0.40): {stats['mid']:3}  — à revoir")
    print(f"  LOW  (< 0.20)   : {stats['low']:3}  — probablement faux")
    print(f"  NO_MATCH        : {stats['no_match']:3}  — aucun candidat dans le manifest")
    print(f"  TOTAL leçons    : {sum(stats.values())}")

    print(f"\n=== {len(unused_videos)} vidéos du manifest non matchées par aucune leçon ===")
    for v in unused_videos[:10]:
        print(f"  {v['course']:18}  {v['slug']}")
    if len(unused_videos) > 10:
        print(f"  ... +{len(unused_videos) - 10} autres")

    print(f"\n=== TOP {min(10, len(ambiguities))} AMBIGUÏTÉS (top1-top2 < 0.10) ===")
    for a in ambiguities[:10]:
        print(f"  {a['legacy_id']:8} '{a['legacy_title'][:50]}'")
        print(f"    1. {a['top1'][0]:.2f}  {a['top1'][1]}")
        print(f"    2. {a['top2'][0]:.2f}  {a['top2'][1]}")

    print(f"\n📄 CSV écrit : {csv_path}")
    print(f"   {len(rows)} lignes")


if __name__ == '__main__':
    main()
