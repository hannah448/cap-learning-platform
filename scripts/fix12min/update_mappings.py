#!/usr/bin/env python3
"""
Applique le découpage en parties (parts.json) aux deux JSON de la plateforme :
  - js/video-assets-manifest.json : ajoute "parts" à chaque vidéo découpée,
    repointe les URLs principales vers la partie 1, met à jour la durée totale.
  - js/video-mapping.json : pour chaque leçon mp4 dont l'URL référence un
    fichier découpé : mp4.url → partie 1 (fallback anciens clients),
    mp4.parts (si ≥ 2), duration_seconds → durée complète.

Usage : update_mappings.py [--dry-run]
"""
import json, sys, datetime

REPO = "/Users/hannahpeters/Digi Africa/digi-learn"
PARTS_JSON = f"{REPO}/scripts/fix12min/parts.json"
MANIFEST = f"{REPO}/js/video-assets-manifest.json"
MAPPING = f"{REPO}/js/video-mapping.json"
CDN = "https://cdn.cap-learning.com/cap-learning/videos"
S3 = "https://caplearning-videos.s3.eu-west-1.amazonaws.com/cap-learning/videos"

dry = "--dry-run" in sys.argv

with open(PARTS_JSON) as f:
    parts_map = json.load(f)

# ---------- 1. video-assets-manifest.json ----------
with open(MANIFEST) as f:
    manifest = json.load(f)

touched_manifest = 0
for v in manifest["videos"]:
    slug = v.get("slug")
    if slug not in parts_map:
        continue
    info = parts_map[slug]
    v["parts"] = [
        {
            "filename": p["filename"],
            "cdn_url": f"{CDN}/{p['filename']}",
            "s3_url": f"{S3}/{p['filename']}",
            "duration_seconds": p["duration_seconds"],
        }
        for p in info["parts"]
    ]
    p1 = v["parts"][0]
    # URLs principales → partie 1 (l'ancien fichier tronqué devient orphelin)
    v["cdn_url"] = p1["cdn_url"]
    v["mp4_url"] = p1["cdn_url"]
    v["s3_url"] = p1["s3_url"]
    v["duration_seconds"] = info["full_duration_seconds"]
    touched_manifest += 1

manifest["_doc"]["last_enriched_at"] = datetime.datetime.now(
    datetime.timezone.utc).isoformat(timespec="seconds")
manifest["_doc"]["parts_note"] = (
    "Vidéos > 13 min découpées en parties ~12 min (champ 'parts'). "
    "Les URLs principales pointent vers la partie 1."
)

# ---------- 2. video-mapping.json ----------
with open(MAPPING) as f:
    mapping = json.load(f)

touched_mapping = 0
slugs_seen = set()
for cid, course in mapping["courses"].items():
    for lid, lesson in course.get("lessons", {}).items():
        if not isinstance(lesson, dict):
            continue
        mp4 = lesson.get("mp4") or {}
        url = mp4.get("url") or ""
        fname = url.rsplit("/", 1)[-1]
        if not fname.endswith("_720p_afrique.mp4"):
            continue
        slug = fname[:-len("_720p_afrique.mp4")]
        if slug not in parts_map:
            continue
        info = parts_map[slug]
        parts = [
            {"url": f"{CDN}/{p['filename']}", "duration_seconds": p["duration_seconds"]}
            for p in info["parts"]
        ]
        mp4["url"] = parts[0]["url"]
        if len(parts) > 1:
            mp4["parts"] = parts
        elif "parts" in mp4:
            del mp4["parts"]
        lesson["mp4"] = mp4
        lesson["duration_seconds"] = info["full_duration_seconds"]
        touched_mapping += 1
        slugs_seen.add(slug)
        print(f"  mapping {cid}/{lid} → {slug} ({len(parts)} partie(s), "
              f"{info['full_duration_seconds']}s)")

mapping["_doc"]["last_updated"] = datetime.datetime.now(
    datetime.timezone.utc).isoformat(timespec="seconds")

missing = sorted(set(parts_map) - slugs_seen)
print(f"\nManifest : {touched_manifest} vidéo(s) mises à jour")
print(f"Mapping  : {touched_mapping} leçon(s) mises à jour")
if missing:
    print(f"⚠️  {len(missing)} slug(s) découpé(s) sans leçon dans video-mapping.json "
          f"(servis via le fallback manifest) :")
    for s in missing:
        print("   -", s)

if dry:
    print("\n(dry-run : aucun fichier écrit)")
else:
    with open(MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")
    with open(MAPPING, "w") as f:
        json.dump(mapping, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("\nÉcrit :", MANIFEST, "et", MAPPING)
