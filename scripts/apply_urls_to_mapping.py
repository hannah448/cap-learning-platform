#!/usr/bin/env python3
"""
Cap Learning — apply_urls_to_mapping.py
---------------------------------------
Lit upload_s3_log.txt (produit par upload_s3_afrique.sh) et met à jour
js/video-mapping.json :
  - provider = 'mp4' (ou 'hls' si l'URL finit par .m3u8)
  - status   = 'live'
  - mp4.url  = URL CDN si disponible, sinon URL S3
  - last_updated = horodatage ISO

Utilisation :
    python3 apply_urls_to_mapping.py upload_s3_log.txt
    python3 apply_urls_to_mapping.py upload_s3_log.txt --mapping ../js/video-mapping.json
    python3 apply_urls_to_mapping.py upload_s3_log.txt --dry-run
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone


def load_csv_rows(path):
    """Parse upload_s3_log.txt. Garde uniquement les lignes data."""
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for raw in reader:
            if not raw or not raw[0].strip():
                continue
            # Skip commentaires et header
            first = raw[0].strip()
            if first.startswith("#") or first.startswith("="):
                continue
            if first == "lesson_id":
                continue
            if len(raw) < 3:
                continue
            lesson_id = raw[0].strip()
            filename = raw[1].strip() if len(raw) > 1 else ""
            s3_url = raw[2].strip() if len(raw) > 2 else ""
            cdn_url = raw[3].strip() if len(raw) > 3 else ""
            if not lesson_id:
                # Pas de lesson_id → on skip (peut être renseigné à la main)
                print(f"⚠️  ligne sans lesson_id, skip : {filename}", file=sys.stderr)
                continue
            if not (s3_url or cdn_url):
                print(f"⚠️  ligne sans URL : {lesson_id}", file=sys.stderr)
                continue
            rows.append({
                "lesson_id": lesson_id,
                "filename": filename,
                "s3_url": s3_url,
                "cdn_url": cdn_url,
            })
    return rows


def find_lesson_path(mapping, lesson_id):
    """Renvoie (course_key, lesson_id) ou (None, None)."""
    for course_key, course in mapping.get("courses", {}).items():
        if not isinstance(course, dict):
            continue
        lessons = course.get("lessons", {})
        if lesson_id in lessons:
            return course_key, lesson_id
    return None, None


def apply_row(mapping, row, force=False):
    course_key, lid = find_lesson_path(mapping, row["lesson_id"])
    if not course_key:
        return ("missing", row["lesson_id"])

    lesson = mapping["courses"][course_key]["lessons"][lid]
    if not force and lesson.get("status") == "live":
        return ("already_live", row["lesson_id"])

    final_url = row["cdn_url"] or row["s3_url"]
    is_hls = final_url.endswith(".m3u8")

    lesson["status"] = "live"
    lesson["provider"] = "hls" if is_hls else "mp4"

    # Nettoie les clés devenues inutiles (Vimeo)
    lesson.pop("vimeo", None)

    if is_hls:
        lesson["s3"] = {"master_url": final_url}
        lesson.pop("mp4", None)
    else:
        lesson["mp4"] = {"url": final_url}
        lesson.pop("s3", None)

    # Conserve les URLs brutes pour debug
    lesson.setdefault("_source", {})
    lesson["_source"]["s3_url"] = row["s3_url"]
    if row["cdn_url"]:
        lesson["_source"]["cdn_url"] = row["cdn_url"]
    lesson["_source"]["filename"] = row["filename"]
    return ("updated", row["lesson_id"])


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv_file", help="upload_s3_log.txt produit par upload_s3_afrique.sh")
    ap.add_argument("--mapping", default=os.path.join(
        os.path.dirname(__file__), "..", "js", "video-mapping.json"
    ), help="Chemin du video-mapping.json (défaut: ../js/video-mapping.json)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Affiche le diff sans écrire")
    ap.add_argument("--force", action="store_true",
                    help="Écrase même les leçons déjà live")
    args = ap.parse_args()

    if not os.path.exists(args.csv_file):
        print(f"❌ CSV introuvable : {args.csv_file}", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(args.mapping):
        print(f"❌ mapping introuvable : {args.mapping}", file=sys.stderr)
        sys.exit(1)

    with open(args.mapping, "r", encoding="utf-8") as f:
        mapping = json.load(f)

    rows = load_csv_rows(args.csv_file)
    print(f"📄 {len(rows)} ligne(s) exploitable(s) dans {args.csv_file}")

    stats = {"updated": 0, "already_live": 0, "missing": 0}
    for row in rows:
        status, lid = apply_row(mapping, row, force=args.force)
        stats[status] += 1
        icon = {"updated": "✅", "already_live": "⏭️ ", "missing": "❓"}[status]
        print(f"  {icon} {lid} ({status})")

    # Horodatage
    if "_doc" in mapping:
        mapping["_doc"]["last_updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    print("")
    print(f"  ✅ updated     : {stats['updated']}")
    print(f"  ⏭️  already_live: {stats['already_live']}")
    print(f"  ❓ missing     : {stats['missing']}  (lesson_id absent du mapping)")

    if args.dry_run:
        print("\n(--dry-run actif, fichier non écrit)")
        return

    if stats["updated"] == 0 and stats["already_live"] == 0:
        print("\nRien à écrire (aucun lesson_id matché).")
        return

    backup = args.mapping + ".bak"
    os.replace(args.mapping, backup) if os.path.exists(args.mapping) else None
    with open(args.mapping, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)
    print(f"\n💾 Écrit : {args.mapping}")
    print(f"   Backup : {backup}")


if __name__ == "__main__":
    main()
