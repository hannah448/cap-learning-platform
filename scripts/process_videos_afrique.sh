#!/usr/bin/env bash
# =============================================================================
# Cap Learning — process_videos_afrique.sh
# -----------------------------------------------------------------------------
# Traite en batch toutes les vidéos du dossier source :
#   - Ré-encode en H.264 720p (max), AAC 96 kbps
#   - Tronque à DUREE_MAX (12 min par défaut) si la vidéo est plus longue
#   - Active +faststart (lecture progressive)
#   - Reprise automatique (ignore les fichiers déjà traités)
#   - Continue en cas d'erreur sur une vidéo
#
# Utilisation :
#   cd scripts/
#   chmod +x process_videos_afrique.sh
#   ./process_videos_afrique.sh
#
# Prérequis : ffmpeg + ffprobe (brew install ffmpeg sur Mac)
# =============================================================================

set -u  # stoppe sur variable non définie
# NE PAS mettre -e : on veut continuer même si une vidéo échoue

# ---------- Configuration (à adapter) ----------

INPUT_DIR="./videos_originales"          # Dossier source (fichiers Vimeo téléchargés)
OUTPUT_DIR="./videos_afrique_720p"       # Dossier sortie (MP4 compressés)
DUREE_MAX=720                            # 12 min en secondes — 0 = pas de limite
CRF=23                                   # Qualité vidéo (18=haute, 23=équilibre, 28=léger)
AUDIO_BITRATE="96k"                      # Bitrate audio (96k suffit pour la voix)
LOG_FILE="./traitement_log.txt"

# ---------- Checks ----------

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "❌ ffmpeg n'est pas installé. Mac: brew install ffmpeg" >&2
    exit 1
fi
if ! command -v ffprobe >/dev/null 2>&1; then
    echo "❌ ffprobe n'est pas installé (livré avec ffmpeg normalement)." >&2
    exit 1
fi

if [ ! -d "$INPUT_DIR" ]; then
    echo "❌ Dossier source introuvable : $INPUT_DIR" >&2
    echo "   Crée-le et dépose les vidéos Vimeo téléchargées dedans." >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

# ---------- Helpers ----------

log()    { echo "$(date +'%H:%M:%S') $*" | tee -a "$LOG_FILE"; }
human()  { du -h "$1" 2>/dev/null | awk '{print $1}'; }
probe_s(){ ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1" 2>/dev/null | awk '{printf("%d", $1)}'; }

# ---------- Banner ----------

{
    echo ""
    echo "============================================================"
    echo "  Cap Learning — Batch processor vidéos Afrique"
    echo "  $(date)"
    echo "------------------------------------------------------------"
    echo "  Source : $INPUT_DIR"
    echo "  Sortie : $OUTPUT_DIR"
    echo "  CRF=$CRF  Audio=$AUDIO_BITRATE  DureeMax=${DUREE_MAX}s"
    echo "============================================================"
    echo ""
} | tee -a "$LOG_FILE"

# ---------- Batch loop ----------

# Ramène les fichiers .mp4/.mov/.mkv/.avi/.webm dans un tableau
shopt -s nullglob nocaseglob
FILES=( "$INPUT_DIR"/*.mp4 "$INPUT_DIR"/*.mov "$INPUT_DIR"/*.mkv "$INPUT_DIR"/*.avi "$INPUT_DIR"/*.webm )
shopt -u nocaseglob

TOTAL=${#FILES[@]}
if [ "$TOTAL" -eq 0 ]; then
    echo "⚠️  Aucune vidéo trouvée dans $INPUT_DIR (extensions: mp4, mov, mkv, avi, webm)." >&2
    exit 0
fi

OK=0; SKIP=0; FAIL=0; I=0

for IN in "${FILES[@]}"; do
    I=$((I+1))
    BASENAME=$(basename "$IN")
    NAME_NOEXT="${BASENAME%.*}"
    # Slug safe : espaces → _, garde lettres/chiffres/._-
    SLUG=$(echo "$NAME_NOEXT" | tr ' ' '_' | LC_ALL=C sed 's/[^A-Za-z0-9._-]//g')
    OUT="$OUTPUT_DIR/${SLUG}_720p_afrique.mp4"

    log "[$I/$TOTAL] ▶️  $BASENAME"

    # Skip si déjà traité
    if [ -f "$OUT" ] && [ -s "$OUT" ]; then
        log "    ⏭️  déjà traité → $OUT (skip)"
        SKIP=$((SKIP+1))
        continue
    fi

    DUR=$(probe_s "$IN")
    SIZE_IN=$(human "$IN")

    # Construit la commande ffmpeg
    # Note: 2e scale=trunc(iw/2)*2:trunc(ih/2)*2 force largeur+hauteur paires
    # (H.264 exige dimensions paires, sinon "width not divisible by 2")
    # +genpts régénère les timestamps pour fichiers HLS un peu cassés
    FF_ARGS=(
        -y -hide_banner -loglevel error -fflags +genpts
        -i "$IN"
        -vf "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p"
        -c:v libx264 -preset medium -crf "$CRF"
        -c:a aac -b:a "$AUDIO_BITRATE" -ac 2 -ar 44100
        -movflags +faststart
        -metadata comment="Cap Learning Afrique — 720p"
    )
    # Tronque si dépasse DUREE_MAX (et DUREE_MAX > 0)
    if [ "$DUREE_MAX" -gt 0 ] && [ -n "$DUR" ] && [ "$DUR" -gt "$DUREE_MAX" ]; then
        log "    ✂️  durée ${DUR}s > ${DUREE_MAX}s → troncature"
        FF_ARGS+=( -t "$DUREE_MAX" )
    fi
    FF_ARGS+=( "$OUT" )

    # Encode
    if ffmpeg "${FF_ARGS[@]}" 2>>"$LOG_FILE"; then
        SIZE_OUT=$(human "$OUT")
        log "    ✅  $SIZE_IN → $SIZE_OUT  ($OUT)"
        OK=$((OK+1))
    else
        log "    ❌  ffmpeg failed on $BASENAME (voir $LOG_FILE)"
        rm -f "$OUT" 2>/dev/null
        FAIL=$((FAIL+1))
    fi
done

# ---------- Récap ----------

{
    echo ""
    echo "============================================================"
    echo "  RÉCAP"
    echo "  ✅ OK  : $OK"
    echo "  ⏭️  Skip: $SKIP (déjà traités)"
    echo "  ❌ Fail: $FAIL"
    echo "  📄 Log : $LOG_FILE"
    echo "============================================================"
} | tee -a "$LOG_FILE"
