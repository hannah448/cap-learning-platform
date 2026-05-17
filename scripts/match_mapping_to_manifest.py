#!/usr/bin/env python3
"""
Cap Learning — match_mapping_to_manifest.py
--------------------------------------------
Branche les vidéos S3 du manifest (`js/video-assets-manifest.json`) aux
leçons cibles du mapping (`js/video-mapping.json`).

Pour chaque leçon en status=pending :
  1. Filtre le manifest par course correspondant
  2. Calcule un score Jaccard sur les tokens des titres
  3. Top match si score >= HIGH → auto-applique (status: live)
  4. Match MID → applique + flag _review: true pour validation humaine
  5. Pas de match → reste pending

Format de sortie video-mapping.json :
  status: 'live' | 'pending'
  provider: 'mp4'
  mp4: { url: 'https://cdn.cap-learning.com/...' }
  _source: { manifest_slug, filename, score, confidence }
  _review: true (si MID, à valider manuellement)

Usage :
    python3 scripts/match_mapping_to_manifest.py            # dry-run + rapport
    python3 scripts/match_mapping_to_manifest.py --apply    # écrit le mapping
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPPING_PATH  = os.path.join(ROOT, 'js', 'video-mapping.json')
MANIFEST_PATH = os.path.join(ROOT, 'js', 'video-assets-manifest.json')

# Mapping course_key (video-mapping.json) → course (manifest)
# (le manifest utilise les slugs courses du catalogue source)
COURSE_KEY_TO_MANIFEST = {
    'marketing-digital': 'marketing',
    'ecommerce':         'ecommerce',
    'ia-business':       'ia-business',
    'reseaux-sociaux':   'reseaux-sociaux',
    'no-code':           'no-code',
    'email-marketing':   'marketing'        # email = sous-thème de marketing, fallback
}

# Score thresholds
SCORE_HIGH = 0.40   # >= → auto-applique sans review
SCORE_MID  = 0.18   # >= → applique mais flag _review
# < SCORE_MID → reste pending

# Stop-words FR
STOP_WORDS = {
    'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd',
    'a', 'au', 'aux', 'en', 'un', 'une', 'et', 'ou',
    'pour', 'dans', 'sur', 'par', 'avec', 'sans',
    'votre', 'vos', 'notre', 'nos', 'ce', 'cet', 'cette', 'ces',
    'son', 'sa', 'ses', 'leur', 'leurs', 'qui', 'que', 'quoi',
    'comment', 'pourquoi', 'quand', 'plus', 'moins',
    'mp4', 'v1', 'v2', 'v3', 'v4'
}


def normalize_tokens(text):
    """Lowercase + supprime accents + tokens significatifs."""
    if not text:
        return set()
    text = text.lower()
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    tokens = re.findall(r'[a-z0-9]+', text)
    return {t for t in tokens if t not in STOP_WORDS and len(t) > 1}


def jaccard(sa, sb):
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def score_video_for_lesson(video, lesson_title):
    """Score (0..1) de pertinence d'une vidéo pour une leçon."""
    lesson_tokens = normalize_tokens(lesson_title)
    video_tokens = normalize_tokens(video.get('title') or '') | normalize_tokens(video.get('slug') or '')
    return jaccard(lesson_tokens, video_tokens)


def find_best_matches(video_pool, lesson_title, top_n=3):
    """Retourne les top N matches triés par score décroissant."""
    scored = [(score_video_for_lesson(v, lesson_title), v) for v in video_pool]
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[:top_n]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--apply', action='store_true',
                    help='Écrit les modifications dans js/video-mapping.json (sinon dry-run)')
    ap.add_argument('--force', action='store_true',
                    help='Re-applique même les leçons déjà live')
    args = ap.parse_args()

    # Load files
    with open(MAPPING_PATH, 'r', encoding='utf-8') as f:
        mapping = json.load(f)
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    # Index manifest par course
    by_course = {}
    for v in manifest.get('videos', []):
        c = v.get('course')
        if c:
            by_course.setdefault(c, []).append(v)

    print(f"📂 Mapping : {MAPPING_PATH}")
    print(f"📂 Manifest: {MANIFEST_PATH}")
    print(f"🎬 Pool : {sum(len(v) for v in by_course.values())} vidéos sur {len(by_course)} courses\n")

    used_slugs = set()       # éviter d'attribuer la même vidéo à 2 leçons
    stats = {'high': 0, 'mid': 0, 'low': 0, 'no_match': 0, 'no_course': 0, 'already_live': 0}
    review_list = []
    no_match_list = []

    print(f"{'='*84}")
    print(f"{'COURSE / LESSON':50} {'SCORE':>6}  MATCH (slug)")
    print(f"{'='*84}")

    for course_key, course in mapping.get('courses', {}).items():
        if not isinstance(course, dict):
            continue
        manifest_course = COURSE_KEY_TO_MANIFEST.get(course_key)
        candidates = list(by_course.get(manifest_course, []))
        # Retire les vidéos déjà attribuées
        candidates = [v for v in candidates if v['slug'] not in used_slugs]

        print(f"\n— {course_key:46} ({manifest_course or '?'}, {len(candidates)} candidats dispo) —")

        for lid, lesson in course.get('lessons', {}).items():
            if not isinstance(lesson, dict):
                continue

            label = f"  {lid:8} {(lesson.get('title') or '')[:45]:46}"

            # Skip si déjà live (sauf --force)
            if lesson.get('status') == 'live' and not args.force:
                print(f"{label} ⏭️    déjà live")
                stats['already_live'] += 1
                continue

            # Pas de course dans le manifest → no_course
            if not candidates:
                if not manifest_course or manifest_course not in by_course:
                    print(f"{label} ⛔    {course_key} pas dans manifest")
                    stats['no_course'] += 1
                else:
                    print(f"{label} 💤    pool épuisé pour {course_key}")
                    stats['no_match'] += 1
                no_match_list.append((lid, lesson.get('title')))
                continue

            best = find_best_matches(candidates, lesson.get('title') or lid, top_n=2)
            top_score, top_v = best[0]
            second_score = best[1][0] if len(best) > 1 else 0

            if top_score >= SCORE_HIGH:
                tag, level = '✅ HIGH', 'high'
            elif top_score >= SCORE_MID:
                tag, level = '🟡 MID ', 'mid'
            else:
                tag, level = '❌ LOW ', 'low'

            print(f"{label} {top_score:>5.2f}  {tag}  {top_v['slug']}")

            if level == 'high':
                # Auto-applique
                apply_match(lesson, top_v, top_score, review=False)
                used_slugs.add(top_v['slug'])
                stats['high'] += 1
            elif level == 'mid':
                # Applique + flag review
                apply_match(lesson, top_v, top_score, review=True)
                used_slugs.add(top_v['slug'])
                stats['mid'] += 1
                review_list.append({
                    'lesson_id': lid,
                    'lesson_title': lesson.get('title'),
                    'top1': (round(top_score, 3), top_v['slug'], top_v.get('title')),
                    'top2': (round(second_score, 3), best[1][1]['slug'], best[1][1].get('title')) if len(best) > 1 else None
                })
            else:
                # Pas de match → laisse pending
                stats['low'] += 1
                no_match_list.append((lid, lesson.get('title')))

    # Vidéos non utilisées
    all_assigned = used_slugs
    unused = [v for v in manifest.get('videos', []) if v['slug'] not in all_assigned]

    # Stats
    print(f"\n{'='*84}")
    print(f"RÉCAP")
    print(f"{'='*84}")
    print(f"  ✅ HIGH (auto-appliqué)    : {stats['high']:3}")
    print(f"  🟡 MID  (appliqué + REVIEW): {stats['mid']:3}")
    print(f"  ❌ LOW  (rejeté → pending) : {stats['low']:3}")
    print(f"  ⛔ NO_COURSE (course absent du manifest) : {stats['no_course']:3}")
    print(f"  💤 NO_MATCH (pool vide pour ce course)    : {stats['no_match']:3}")
    print(f"  ⏭️  ALREADY_LIVE          : {stats['already_live']:3}")
    print(f"  📦 Vidéos manifest non utilisées : {len(unused)}")

    if review_list:
        print(f"\n{'='*84}")
        print(f"LEÇONS À REVIEW MANUELLEMENT ({len(review_list)})")
        print(f"{'='*84}")
        for r in review_list:
            print(f"\n  {r['lesson_id']}  '{r['lesson_title']}'")
            print(f"    Match 1 : {r['top1'][0]:.2f}  {r['top1'][1]}")
            print(f"              ({r['top1'][2]})")
            if r['top2']:
                print(f"    Match 2 : {r['top2'][0]:.2f}  {r['top2'][1]}")

    if not args.apply:
        print(f"\n{'='*84}")
        print(f"DRY-RUN — rien écrit. Pour appliquer : python3 {sys.argv[0]} --apply")
        print(f"{'='*84}")
        return

    # Write
    if '_doc' in mapping:
        mapping['_doc']['last_updated'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
        mapping['_doc']['matched_via_script'] = 'match_mapping_to_manifest.py'

    backup = MAPPING_PATH + '.bak'
    os.replace(MAPPING_PATH, backup) if os.path.exists(MAPPING_PATH) else None
    with open(MAPPING_PATH, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)
    print(f"\n💾 Écrit : {MAPPING_PATH}")
    print(f"   Backup : {backup}")


def apply_match(lesson, video, score, review=False):
    """Patche en place une entrée lesson avec les infos du video S3."""
    url = video.get('cdn_url') or video.get('mp4_url') or video.get('s3_url')
    lesson['status'] = 'live'
    lesson['provider'] = 'mp4'
    lesson['mp4'] = {'url': url}
    lesson.pop('vimeo', None)  # nettoie l'ancien provider
    lesson['_source'] = {
        'manifest_slug': video['slug'],
        'filename': video.get('filename'),
        'score': round(score, 3),
        'confidence': 'high' if score >= SCORE_HIGH else 'mid'
    }
    if review:
        lesson['_review'] = True
    else:
        lesson.pop('_review', None)


if __name__ == '__main__':
    main()
