#!/usr/bin/env python3
"""
Découpe les vidéos réencodées (durée complète) en parties d'environ 12 min,
SANS réencodage (copie des flux, coupes aux images clés).

Règle : n = round(d/720), min 1 ; si d/n > 780 s (13 min) → n += 1.
→ parties de durée égale, toutes ≤ ~13 min, au plus près de 12 min.
Toutes les vidéos produisent des fichiers _pN.mp4 (même n=1) : nouveaux noms
sur le CDN → aucun conflit de cache avec les anciens fichiers tronqués.

Sortie : parts/<slug>_720p_afrique_pN.mp4 + parts.json (durées exactes).
"""
import json, os, subprocess, sys, shutil

HOME = os.path.expanduser("~")
FFMPEG = os.path.join(HOME, "bin", "ffmpeg")
FFPROBE = os.path.join(HOME, "bin", "ffprobe")
FIX = "/Users/hannahpeters/Digi Africa/digi-learn/scripts/fix12min"
SRC_DIR = os.path.join(FIX, "videos_afrique_720p")
OUT_DIR = os.path.join(FIX, "parts")
PARTS_JSON = os.path.join(FIX, "parts.json")

TARGET = 720.0   # durée cible d'une partie (12 min)
MAX_PART = 780.0 # durée max tolérée pour rester en 1 partie (13 min)

def probe(path):
    r = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", path],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0

def n_parts(d):
    n = max(1, round(d / TARGET))
    if d / n > MAX_PART:
        n += 1
    return n

def main():
    only = sys.argv[1:]  # option : liste de slugs pour un test partiel
    os.makedirs(OUT_DIR, exist_ok=True)
    result = {}
    files = sorted(f for f in os.listdir(SRC_DIR) if f.endswith("_720p_afrique.mp4"))
    for f in files:
        slug = f[:-len("_720p_afrique.mp4")]
        if only and slug not in only:
            continue
        src = os.path.join(SRC_DIR, f)
        d = probe(src)
        if d <= 0:
            print(f"!! ffprobe KO sur {f}", file=sys.stderr)
            continue
        n = n_parts(d)
        base = f[:-len(".mp4")]
        expected = [f"{base}_p{i}.mp4" for i in range(1, n + 1)]
        if all(os.path.exists(os.path.join(OUT_DIR, e)) for e in expected):
            print(f"== {slug} : déjà découpé ({n} partie(s)), skip")
        elif n == 1:
            shutil.copy2(src, os.path.join(OUT_DIR, expected[0]))
            print(f"== {slug} : {d:.0f}s → 1 partie (copie)")
        else:
            cuts = ",".join(f"{d * i / n:.3f}" for i in range(1, n))
            cmd = [FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
                   "-i", src, "-c", "copy", "-map", "0",
                   "-f", "segment", "-segment_times", cuts,
                   "-segment_start_number", "1", "-reset_timestamps", "1",
                   "-segment_format", "mp4",
                   "-segment_format_options", "movflags=+faststart",
                   os.path.join(OUT_DIR, f"{base}_p%d.mp4")]
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode != 0:
                print(f"!! ffmpeg KO sur {f} : {r.stderr[:300]}", file=sys.stderr)
                continue
            print(f"== {slug} : {d:.0f}s → {n} parties (~{d/n:.0f}s)")
        # Durées exactes de chaque partie
        parts = []
        for e in expected:
            p = os.path.join(OUT_DIR, e)
            pd = probe(p)
            parts.append({"filename": e, "duration_seconds": round(pd)})
        total_parts = sum(p["duration_seconds"] for p in parts)
        if abs(total_parts - d) > 10:
            print(f"!! {slug} : somme des parties {total_parts}s ≠ source {d:.0f}s",
                  file=sys.stderr)
        result[slug] = {"full_duration_seconds": round(d), "parts": parts}

    # Fusionne avec un parts.json existant (mode test partiel)
    if os.path.exists(PARTS_JSON):
        with open(PARTS_JSON) as fh:
            old = json.load(fh)
        old.update(result)
        result = old
    with open(PARTS_JSON, "w") as fh:
        json.dump(result, fh, indent=2, ensure_ascii=False)
    print(f"\n{len(result)} vidéo(s) dans {PARTS_JSON}")

if __name__ == "__main__":
    main()
