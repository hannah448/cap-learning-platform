#!/usr/bin/env python3
"""
Bascule les leçons batch 2 / batch 3 découpées vers le format mp4.parts.
Pour chaque slug de /tmp/split_slugs.txt : trouve TOUTES les leçons du mapping
dont mp4.url pointe vers <slug>_720p_afrique.mp4 (fichier unique) et les remplace
par mp4.url = p1 + mp4.parts = [{url, duration_seconds}...]. Met à jour
duration_seconds = durée totale. Idempotent (ignore ce qui a déjà des parts).
"""
import json, os
from collections import OrderedDict

ROOT = "/Users/hannahpeters/Digi Africa/digi-learn"
MAPPING = os.path.join(ROOT, "js", "video-mapping.json")
PARTS_JSON = os.path.join(ROOT, "scripts", "fix12min", "parts.json")
CDN = "https://cdn.cap-learning.com/cap-learning/videos/"

slugs = [s.strip() for s in open("/tmp/split_slugs.txt") if s.strip()]
pj = json.load(open(PARTS_JSON))
d = json.load(open(MAPPING), object_pairs_hook=OrderedDict)

# filename -> mp4 object (parts) + durée totale
built = {}
for s in slugs:
    if s not in pj:
        print("!! slug absent de parts.json:", s); continue
    fn = s + "_720p_afrique.mp4"
    parts = pj[s]["parts"]
    parr = [OrderedDict([("url", CDN + p["filename"]),
                         ("duration_seconds", p["duration_seconds"])]) for p in parts]
    built[fn] = (OrderedDict([("url", parr[0]["url"]), ("parts", parr)]),
                 pj[s]["full_duration_seconds"], len(parr))

changed = 0
for cid, c in d["courses"].items():
    for lid, l in c["lessons"].items():
        if not isinstance(l, dict):
            continue
        mp4 = l.get("mp4") or {}
        url = mp4.get("url", "")
        if "parts" in mp4 or not url:
            continue
        base = os.path.basename(url)
        if base in built:
            obj, full, n = built[base]
            l["mp4"] = obj
            l["duration_seconds"] = full
            changed += 1
            print(f"  {cid}/{lid}: {base[:44]} → {n} parties")

d["_doc"]["last_updated"] = "2026-07-14T00:00:00+00:00"
json.dump(d, open(MAPPING, "w"), ensure_ascii=False, indent=2)
open(MAPPING, "a").write("\n")
print(f"\n{changed} leçons basculées en mp4.parts")
