#!/bin/bash
# =============================================================================
# Réparation des 45 vidéos batch 1 tronquées à 12 min (Cap Learning)
# Télécharge par lots de 9, réencode en durée complète (DUREE_MAX=0),
# vérifie les durées, supprime les sources au fur et à mesure.
# Travaille dans scripts/fix12min/ pour ne pas toucher au batch 2 en cours.
# =============================================================================
set -u
export PATH="$HOME/bin:$PATH"

SCRATCH="/private/tmp/claude-501/-Users-hannahpeters-Digi-Africa/b1405c09-5625-40cb-9edd-7e29510e45fd/scratchpad"
SCRIPTS="/Users/hannahpeters/Digi Africa/digi-learn/scripts"
FIX="$SCRIPTS/fix12min"
SRC="$FIX/videos_originales"
OUT="$FIX/videos_afrique_720p"
DL="$FIX/dl_chunks"
COOKIES="$SCRATCH/cookies_fix.txt"
DUR_REF="$SCRATCH/vimeo_durations.tsv"
LOG="$SCRATCH/orchestrator.log"
DLLOG="$SCRATCH/download_fix.log"
ENCLOG="$SCRATCH/encode_fix.log"
FAILURES="$FIX/echecs.txt"
BATCH2_PID=5445

mkdir -p "$SRC" "$OUT" "$DL"
: > "$FAILURES"

log(){ echo "$(date +'%F %T') $*" >> "$LOG"; }

free_gb(){ df -g / | awk 'NR==2 {print $4}'; }

probe_s(){ ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1" 2>/dev/null | awk '{printf("%d", $1)}'; }

# ---- Téléchargement d'un lot (fichier tsv slug\turl\tduree) vers un dossier ----
dl_chunk(){
  local chunk_file="$1" dest="$2" slug url dur
  mkdir -p "$dest"
  while IFS=$'\t' read -r slug url dur; do
    [ -z "$slug" ] && continue
    if [ -f "$dest/$slug.mp4" ]; then log "DL  skip (déjà là) $slug"; continue; fi
    log "DL  début $slug"
    yt-dlp --cookies "$COOKIES" \
      -f "bv*+ba/b" -S "ext:mp4:m4a,res,codec" \
      --merge-output-format mp4 \
      -o "$dest/$slug.%(ext)s" \
      --no-overwrites --continue --retries 5 --fragment-retries 10 \
      --concurrent-fragments 4 --no-progress --no-colors \
      "$url" >> "$DLLOG" 2>&1 </dev/null
    if [ -f "$dest/$slug.mp4" ]; then
      log "DL  ok $slug ($(du -h "$dest/$slug.mp4" | awk '{print $1}'))"
    else
      log "DL  ÉCHEC $slug"
      echo "DOWNLOAD	$slug	$url" >> "$FAILURES"
    fi
  done < "$chunk_file"
}

# ---- Vérification d'un lot : sortie présente + durée ≈ durée Vimeo → rm source ----
verify_chunk(){
  local chunk_file="$1" slug url dur out d diff
  while IFS=$'\t' read -r slug url dur; do
    [ -z "$slug" ] && continue
    out="$OUT/${slug}_720p_afrique.mp4"
    if [ ! -f "$out" ]; then
      log "VER ÉCHEC sortie manquante $slug"
      echo "ENCODE_MISSING	$slug	$url" >> "$FAILURES"
      continue
    fi
    d=$(probe_s "$out")
    diff=$(( d - dur )); [ "$diff" -lt 0 ] && diff=$(( -diff ))
    if [ "$diff" -le 5 ]; then
      log "VER ok $slug (${d}s vs Vimeo ${dur}s)"
      rm -f "$SRC/$slug.mp4"
    else
      log "VER ÉCHEC durée $slug : sortie ${d}s vs Vimeo ${dur}s"
      echo "DURATION_MISMATCH	$slug	sortie=${d}s vimeo=${dur}s" >> "$FAILURES"
    fi
  done < "$chunk_file"
}

log "=== DÉMARRAGE réparation 45 vidéos tronquées ==="
log "Espace libre initial : $(free_gb) Go"

CHUNKS=( "$SCRATCH"/chunk_*.tsv )
N=${#CHUNKS[@]}
log "$N lots à traiter"

# Télécharge le lot 1 tout de suite (le réseau est libre même si le batch 2 encode)
log "--- Téléchargement lot 1/$N ---"
dl_chunk "${CHUNKS[0]}" "$DL/1"

# Attend la fin de l'encodage batch 2 (PID $BATCH2_PID), 2h max
WAITED=0
while kill -0 "$BATCH2_PID" 2>/dev/null && [ "$WAITED" -lt 7200 ]; do
  [ $(( WAITED % 600 )) -eq 0 ] && log "Attente fin encodage batch 2 (PID $BATCH2_PID)... ${WAITED}s"
  sleep 30; WAITED=$(( WAITED + 30 ))
done
log "Encodage batch 2 terminé (ou délai 2h atteint) — début des encodages"

i=0
DL_PID=""
for CHUNK in "${CHUNKS[@]}"; do
  i=$(( i + 1 ))

  # Sécurité disque
  if [ "$(free_gb)" -lt 8 ]; then
    log "ABANDON : moins de 8 Go libres. Arrêt propre."
    echo "DISK_FULL	lot_$i" >> "$FAILURES"
    break
  fi

  # Les fichiers du lot courant passent dans videos_originales (complets uniquement)
  mv "$DL/$i"/*.mp4 "$SRC/" 2>/dev/null

  # Lance le téléchargement du lot suivant en parallèle de l'encodage
  next=$(( i + 1 ))
  if [ "$next" -le "$N" ]; then
    log "--- Téléchargement lot $next/$N (en parallèle) ---"
    dl_chunk "${CHUNKS[$((next-1))]}" "$DL/$next" &
    DL_PID=$!
  else
    DL_PID=""
  fi

  # Encode (script du repo, cwd=fix12min, durée illimitée)
  log "--- Encodage lot $i/$N ---"
  ( cd "$FIX" && DUREE_MAX=0 bash "$SCRIPTS/process_videos_afrique.sh" >> "$ENCLOG" 2>&1 )
  log "Encodage lot $i terminé"

  # Vérifie et libère l'espace
  verify_chunk "$CHUNK"
  log "Espace libre : $(free_gb) Go"

  # Attend la fin du téléchargement du lot suivant
  if [ -n "$DL_PID" ]; then wait "$DL_PID"; fi
done

# ---- Récap final ----
TOTAL_OUT=$(ls "$OUT"/*.mp4 2>/dev/null | wc -l | tr -d ' ')
NFAIL=$(grep -c . "$FAILURES" 2>/dev/null || echo 0)
log "=== TERMINÉ : $TOTAL_OUT fichiers encodés, $NFAIL échec(s) ==="

# Liste des URLs CDN à purger chez Cloudflare (vidéos vérifiées OK)
: > "$FIX/urls_a_purger_cloudflare.txt"
while IFS=$'\t' read -r slug url dur; do
  [ -z "$slug" ] && continue
  if [ -f "$OUT/${slug}_720p_afrique.mp4" ] && ! grep -q "	$slug	" "$FAILURES" 2>/dev/null; then
    echo "https://cdn.cap-learning.com/cap-learning/videos/${slug}_720p_afrique.mp4" >> "$FIX/urls_a_purger_cloudflare.txt"
  fi
done < "$DUR_REF"
log "Liste de purge Cloudflare écrite : $FIX/urls_a_purger_cloudflare.txt"

exit 0
