#!/usr/bin/env bash
# =============================================================================
# Cap Learning — download_vimeo.sh
# -----------------------------------------------------------------------------
# Batch-download les vidéos Digi-Atlas depuis Vimeo Pro via yt-dlp.
# Utilise tes cookies navigateur pour s'authentifier sur le compte Pro.
#
# PRÉREQUIS :
#   1. yt-dlp installé dans ~/bin (déjà fait si tu as suivi le guide)
#   2. Un fichier vimeo_cookies.txt à la racine de scripts/ — voir section
#      "Comment récupérer les cookies" plus bas
#   3. Un fichier vimeo_urls.txt (une URL Vimeo par ligne)
#
# UTILISATION :
#   cd scripts/
#   ./download_vimeo.sh
#
# ============================================================================
# COMMENT RÉCUPÉRER vimeo_cookies.txt :
# ============================================================================
# 1. Installe l'extension Chrome "Get cookies.txt LOCALLY"
#    https://chromewebstore.google.com/detail/get-cookies-txt-locally/cclelndahbckbenkjhflpdbgdldlbecc
# 2. Connecte-toi sur vimeo.com avec le compte Pro Digi-Atlas
# 3. Clique sur l'icône de l'extension → "Export As" → "Netscape HTTP"
# 4. Sauvegarde le fichier sous scripts/vimeo_cookies.txt
# 5. Ne committe JAMAIS ce fichier (il est dans .gitignore)
# ============================================================================

set -u

COOKIES_FILE="${COOKIES_FILE:-vimeo_cookies.txt}"
URLS_FILE="${URLS_FILE:-vimeo_urls.txt}"
OUTPUT_DIR="${OUTPUT_DIR:-./videos_originales}"
LOG_FILE="./download_vimeo_log.txt"

# --------- Checks ---------

if ! command -v yt-dlp >/dev/null 2>&1 && [ ! -x "$HOME/bin/yt-dlp" ]; then
    echo "❌ yt-dlp non trouvé. Installe-le :" >&2
    echo "   curl -L -o ~/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" >&2
    echo "   chmod +x ~/bin/yt-dlp" >&2
    exit 1
fi
YTDLP="${YTDLP:-$HOME/bin/yt-dlp}"
command -v yt-dlp >/dev/null 2>&1 && YTDLP="yt-dlp"

if [ ! -f "$COOKIES_FILE" ]; then
    cat >&2 <<EOF
❌ Fichier cookies introuvable : $COOKIES_FILE

Pour le générer :
 1. Installe l'extension Chrome "Get cookies.txt LOCALLY"
 2. Connecte-toi sur vimeo.com avec le compte Pro Digi-Atlas
 3. Clique sur l'extension → Export As → Netscape HTTP
 4. Sauvegarde sous : $COOKIES_FILE
EOF
    exit 1
fi

if [ ! -f "$URLS_FILE" ]; then
    cat >&2 <<EOF
❌ Fichier URLs introuvable : $URLS_FILE

Crée un fichier texte, une URL Vimeo par ligne, ex. :
    https://vimeo.com/123456789
    https://vimeo.com/987654321
    https://vimeo.com/manage/videos/111111/settings
    # (lignes commençant par # ignorées)

Astuce : dashboard Vimeo → sélection de plusieurs vidéos → copier les URLs.
EOF
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

# --------- Banner ---------

{
    echo ""
    echo "============================================================"
    echo "  Cap Learning — Batch download Vimeo Pro → $OUTPUT_DIR"
    echo "  $(date)"
    echo "  Cookies  : $COOKIES_FILE"
    echo "  URLs     : $URLS_FILE ($(grep -cv '^\s*\(#\|$\)' "$URLS_FILE") vidéo(s))"
    echo "  Format   : best mp4 ou mov (qualité originale)"
    echo "============================================================"
    echo ""
} | tee "$LOG_FILE"

# --------- Download ---------

# Options yt-dlp :
#   -f "bv*+ba/b"               : meilleur video + audio combinés ou best unique
#   -S "ext:mp4:m4a"             : préfère mp4/m4a
#   --merge-output-format mp4    : force MP4 en sortie
#   -o "$OUTPUT_DIR/%(title).80s.%(ext)s"  : nom = titre Vimeo (limité 80 char)
#   --no-overwrites              : skip si déjà téléchargé
#   --download-archive .done.txt : log de reprise (skip vidéos déjà faites)
#   --concurrent-fragments 4     : parallélise les chunks pour vitesse
#   --continue                   : reprend un DL interrompu
#   --retries 3                  : retry 3x sur erreur réseau
#   --fragment-retries 10        : retry chunks HLS (fiabilité Vimeo)

"$YTDLP" \
    --cookies "$COOKIES_FILE" \
    --batch-file "$URLS_FILE" \
    -f "bv*+ba/b" \
    -S "ext:mp4:m4a,res,codec" \
    --merge-output-format mp4 \
    -o "$OUTPUT_DIR/%(title).80s.%(ext)s" \
    --restrict-filenames \
    --no-overwrites \
    --download-archive "$OUTPUT_DIR/.yt-dlp-archive.txt" \
    --concurrent-fragments 4 \
    --continue \
    --retries 3 \
    --fragment-retries 10 \
    --progress \
    --no-colors \
    2>&1 | tee -a "$LOG_FILE"

RC=$?

# --------- Récap ---------

{
    echo ""
    echo "============================================================"
    if [ "$RC" -eq 0 ]; then
        echo "  ✅ TERMINÉ — vérifie $OUTPUT_DIR"
    else
        echo "  ⚠️  TERMINÉ AVEC ERREURS (code $RC) — voir $LOG_FILE"
    fi
    TOTAL=$(find "$OUTPUT_DIR" -maxdepth 1 -type f \( -name "*.mp4" -o -name "*.mov" \) | wc -l | tr -d ' ')
    SIZE=$(du -sh "$OUTPUT_DIR" 2>/dev/null | awk '{print $1}')
    echo "  📊 $TOTAL fichier(s) dans $OUTPUT_DIR ($SIZE)"
    echo ""
    echo "  ▶ Prochaine étape :"
    echo "     ./cut_videos_from_csv.sh timecodes.csv"
    echo "============================================================"
} | tee -a "$LOG_FILE"

exit $RC
