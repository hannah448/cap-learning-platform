#!/usr/bin/env python3
"""
Cap Learning — inject_video_library_to_courses_data.py
-------------------------------------------------------
Génère le bloc JS qui injecte les leçons LIVE de video-mapping.json
dans COURSES_DATA (pages/apprendre.html) sous forme d'un module
"📺 Bibliothèque vidéo".

Cette approche préserve totalement COURSES_DATA existant (avec ses
quiz/exercices/contenu HTML pédagogique) et **ajoute** simplement un module
en bas de chaque course pour les leçons vidéo qui ne sont pas encore
référencées.

Le bloc généré est injecté entre `// ===== INIT =====` et `renderSidebar()`
dans pages/apprendre.html. Idempotent.

Usage :
    python3 scripts/inject_video_library_to_courses_data.py            # dry-run
    python3 scripts/inject_video_library_to_courses_data.py --apply    # patch
"""

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPPING_PATH = os.path.join(ROOT, 'js', 'video-mapping.json')
HTML_PATH    = os.path.join(ROOT, 'pages', 'apprendre.html')

# Mapping course_key (video-mapping.json) → legacy_id (COURSES_DATA)
COURSE_KEY_TO_LEGACY = {
    'marketing-digital': '1',
    'ecommerce':         '2',
    'ia-business':       '3',
    'reseaux-sociaux':   '5',
    'no-code':           '7',
    'email-marketing':   '8'
}

# Titre du module ajouté par course
MODULE_TITLES = {
    '1': '📺 Bibliothèque vidéo — Marketing digital',
    '2': '📺 Bibliothèque vidéo — Shopify & e-commerce',
    '3': '📺 Bibliothèque vidéo — IA & Business',
    '5': '📺 Bibliothèque vidéo — Réseaux sociaux',
    '7': '📺 Bibliothèque vidéo — No-Code & Automation',
    '8': '📺 Bibliothèque vidéo — Email marketing',
}

# Marqueur d'injection (idempotence)
MARKER_BEGIN = '/* === BEGIN auto-injected video library (do not edit by hand) === */'
MARKER_END   = '/* === END auto-injected video library === */'


def extract_existing_lesson_ids(html):
    """Retourne dict {legacy_id: set(lesson_ids)} déjà présents dans COURSES_DATA."""
    m = re.search(r'const\s+COURSES_DATA\s*=\s*\{', html)
    if not m:
        return {}
    start = m.end() - 1
    depth, i = 0, start
    while i < len(html):
        if html[i] == '{':
            depth += 1
        elif html[i] == '}':
            depth -= 1
            if depth == 0:
                break
        i += 1
    block = html[start:i + 1]

    out = {}
    for cm in re.finditer(r"'(\d+)':\s*\{", block):
        legacy_id = cm.group(1)
        s = cm.end() - 1
        d, j = 0, s
        while j < len(block):
            if block[j] == '{':
                d += 1
            elif block[j] == '}':
                d -= 1
                if d == 0:
                    break
            j += 1
        cb = block[s:j + 1]
        ids = set(re.findall(r"id:\s*['\"]([\w\-]+)['\"]", cb))
        out[legacy_id] = ids
    return out


def js_string(s):
    """Échappe une string pour qu'elle tienne dans des simples quotes JS."""
    if s is None:
        s = ''
    return s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', ' ').strip()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--apply', action='store_true', help='Patche pages/apprendre.html (sinon dry-run)')
    args = ap.parse_args()

    with open(MAPPING_PATH, 'r', encoding='utf-8') as f:
        mapping = json.load(f)
    with open(HTML_PATH, 'r', encoding='utf-8') as f:
        html = f.read()

    existing = extract_existing_lesson_ids(html)
    print(f"📂 COURSES_DATA — leçons existantes :")
    for cid, lids in sorted(existing.items()):
        print(f"  course '{cid}' : {len(lids)} entries")

    # Construit les additions par legacy_id
    additions = {}  # legacy_id → [ (lesson_id, title) ]
    for ckey, course in mapping.get('courses', {}).items():
        legacy_id = COURSE_KEY_TO_LEGACY.get(ckey)
        if not legacy_id:
            continue
        lessons = course.get('lessons', {})
        existing_ids = existing.get(legacy_id, set())
        new_lessons = []
        for lid, lesson in lessons.items():
            if lesson.get('status') != 'live':
                continue
            if lid in existing_ids:
                continue
            new_lessons.append((lid, lesson.get('title') or lid))
        if new_lessons:
            additions[legacy_id] = new_lessons

    print(f"\n📌 Leçons à ajouter par course :")
    total = 0
    for legacy_id, lessons in additions.items():
        print(f"  course '{legacy_id}' ({MODULE_TITLES[legacy_id]}) : {len(lessons)} nouvelles leçons")
        for lid, title in lessons[:3]:
            print(f"    {lid:8} {title[:55]}")
        if len(lessons) > 3:
            print(f"    ... +{len(lessons) - 3} autres")
        total += len(lessons)
    print(f"\n  TOTAL nouvelles leçons à injecter : {total}")

    # Génère le bloc JS d'injection
    js_lines = [MARKER_BEGIN]
    js_lines.append("    (function injectVideoLibraryModules() {")
    js_lines.append("        if (typeof COURSES_DATA === 'undefined') return;")
    js_lines.append("        var ADDITIONS = {")
    for legacy_id in sorted(additions.keys()):
        lessons = additions[legacy_id]
        title = MODULE_TITLES[legacy_id]
        js_lines.append(f"            '{legacy_id}': {{")
        js_lines.append(f"                title: '{js_string(title)}',")
        js_lines.append(f"                lessons: [")
        for lid, lt in lessons:
            js_lines.append(f"                    {{ id: '{lid}', title: '{js_string(lt)}', type: 'video' }},")
        js_lines.append(f"                ]")
        js_lines.append(f"            }},")
    js_lines.append("        };")
    js_lines.append("        Object.keys(ADDITIONS).forEach(function (legacyId) {")
    js_lines.append("            var course = COURSES_DATA[legacyId];")
    js_lines.append("            if (course && Array.isArray(course.modules)) {")
    js_lines.append("                course.modules.push(ADDITIONS[legacyId]);")
    js_lines.append("            }")
    js_lines.append("        });")
    js_lines.append("    })();")
    js_lines.append("    " + MARKER_END)
    injection = '\n    '.join(js_lines)
    injection = '    ' + injection + '\n'

    # Identifie où injecter (juste avant `// ===== INIT =====`)
    init_marker = '// ===== INIT ====='
    init_pos = html.find(init_marker)
    if init_pos == -1:
        print("❌ Marqueur '// ===== INIT =====' introuvable. Abort.", file=sys.stderr)
        sys.exit(1)

    # Idempotence : retire l'ancien bloc injecté s'il existe
    new_html = html
    if MARKER_BEGIN in new_html:
        # Supprime depuis MARKER_BEGIN jusqu'à MARKER_END (inclus)
        b_idx = new_html.find(MARKER_BEGIN)
        e_idx = new_html.find(MARKER_END, b_idx)
        if e_idx != -1:
            # Inclus aussi un saut de ligne et indentation potentielle après
            e_end = new_html.find('\n', e_idx) + 1
            new_html = new_html[:b_idx] + new_html[e_end:]
            print("ℹ️  Bloc d'injection précédent retiré (idempotence).")

    # Re-localise INIT après suppression éventuelle
    init_pos = new_html.find(init_marker)
    # Recule jusqu'au début de la ligne contenant init_marker
    line_start = new_html.rfind('\n', 0, init_pos) + 1
    new_html = new_html[:line_start] + injection + '\n' + new_html[line_start:]

    if args.apply:
        backup = HTML_PATH + '.bak'
        with open(backup, 'w', encoding='utf-8') as f:
            f.write(html)
        with open(HTML_PATH, 'w', encoding='utf-8') as f:
            f.write(new_html)
        print(f"\n💾 Écrit : {HTML_PATH}")
        print(f"   Backup : {backup}")
    else:
        print(f"\n💡 DRY-RUN — rien écrit. Pour appliquer : python3 {sys.argv[0]} --apply")
        print(f"\n=== Aperçu bloc injecté ({len(injection.splitlines())} lignes) ===")
        print(injection[:600])
        print('...')


if __name__ == '__main__':
    main()
