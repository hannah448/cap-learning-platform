#!/usr/bin/env bash
# =============================================================================
# Cap Learning — cut_videos_from_csv.sh
# -----------------------------------------------------------------------------
# Coupe + ré-encode en 720p les segments spécifiés dans timecodes.csv.
#
# Format CSV attendu (header obligatoire) :
#   source_file,start,end,lesson_id,output_name
#   RS6452_session1.mp4,00:12:30,00:20:45,l1-1,bloc1_presence_digitale
#   RS7064_session2.mp4,00:03:00,00:11:30,s2-1,bloc2_instagram_business
#
# Temps au format HH:MM:SS ou HH:MM:SS.mmm ou secondes (ex: 750).
# La colonne lesson_id est facultative (utile pour le mapping JSON ensuite).
#
# Utilisation :
#   ./cut_videos_from_csv.sh timecodes.csv
#
# Prérequis : ffmpeg
# =============================================================================

set -u

CSV_FILE="${1:-timecodes.csv}"
INPUT_DIR="${INPUT_DIR:-./videos_originales}"
OUTPUT_DIR="${OUTPUT_DIR:-./videos_afrique_720p}"
CRF="${CRF:-23}"
AUDIO_BITRATE="${AUDIO_BITRATE:-96k}"
LOG_FILE="./cut_log.txt"

if [ ! -f "$CSV_FILE" ]; then
    cat >&2 <<EOF
❌ CSV introuvable : $CSV_FILE

Exemple de timecodes.csv :
    source_file,start,end,lesson_id,output_name
    RS6452.mp4,00:12:30,00:20:45,l1-1,bloc1_presence_digitale
    RS7064.mp4,00:03:00,00:11:30,s2-1,bloc2_instagram_business

Astuce : export depuis un Google Sheet en CSV, colonnes dans cet ordre.
EOF
    exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "❌ ffmpeg non installé (Mac: brew install ffmpeg)" >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

log() { echo "$(date +'%H:%M:%S') $*" | tee -a "$LOG_FILE"; }

I=0; OK=0; FAIL=0; SKIP=0
# Lit le CSV en sautant la ligne d'en-tête
tail -n +2 "$CSV_FILE" | while IFS=, read -r SRC START END LESSON_ID OUT_NAME; do
    I=$((I+1))
    # Trim CR + espaces
    SRC=$(echo "$SRC" | tr -d '\r' | awk '{$1=$1};1')
    START=$(echo "$START" | tr -d '\r' | awk '{$1=$1};1')
    END=$(echo "$END" | tr -d '\r' | awk '{$1=$1};1')
    LESSON_ID=$(echo "$LESSON_ID" | tr -d '\r' | awk '{$1=$1};1')
    OUT_NAME=$(echo "$OUT_NAME" | tr -d '\r' | awk '{$1=$1};1')

    [ -z "$SRC" ] && continue  # ligne vide

    if [ -z "$OUT_NAME" ]; then
        OUT_NAME="${LESSON_ID:-cut_$I}"
    fi
    SLUG=$(echo "$OUT_NAME" | tr ' ' '_' | LC_ALL=C sed 's/[^A-Za-z0-9._-]//g')
    OUT="$OUTPUT_DIR/${SLUG}_720p_afrique.mp4"
    IN="$INPUT_DIR/$SRC"

    log "[$I] ▶️  $SRC  [$START → $END]  → $OUT"

    if [ ! -f "$IN" ]; then
        log "    ❌ fichier source introuvable : $IN"
        FAIL=$((FAIL+1)); continue
    fi
    if [ -f "$OUT" ] && [ -s "$OUT" ]; then
        log "    ⏭️ déjà cut : $OUT (skip)"
        SKIP=$((SKIP+1)); continue
    fi

    # -ss avant -i = seek rapide, -to = position de fin absolue
    # On ré-encode (pas -c copy) pour obtenir un cut frame-accurate + 720p
    ffmpeg -y -hide_banner -loglevel error \
        -ss "$START" -to "$END" -i "$IN" \
        -vf "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,format=yuv420p" \
        -c:v libx264 -preset medium -crf "$CRF" \
        -c:a aac -b:a "$AUDIO_BITRATE" -ac 2 -ar 44100 \
        -movflags +faststart \
        -metadata comment="Cap Learning Afrique — lesson_id=${LESSON_ID}" \
        "$OUT" 2>>"$LOG_FILE"

    if [ $? -eq 0 ] && [ -s "$OUT" ]; then
        log "    ✅  OK → $(du -h "$OUT" | awk '{print $1}')"
        OK=$((OK+1))
    else
        log "    ❌ ffmpeg failed"
        rm -f "$OUT"
        FAIL=$((FAIL+1))
    fi
done

log ""
log "============================================================"
log "  CUT RÉCAP   ✅ OK=$OK   ⏭️ Skip=$SKIP   ❌ Fail=$FAIL"
log "============================================================"
