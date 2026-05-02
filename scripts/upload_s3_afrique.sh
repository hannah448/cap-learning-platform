#!/usr/bin/env bash
# =============================================================================
# Cap Learning — upload_s3_afrique.sh
# -----------------------------------------------------------------------------
# Upload toutes les vidéos MP4 traitées vers S3, génère les URLs finales
# (S3 direct + Cloudflare/CloudFront), produit upload_s3_log.txt exploitable
# par le script de remplissage de video-mapping.json.
#
# Prérequis :
#   - AWS CLI v2 installé et configuré : aws configure
#   - Un bucket S3 créé (privé recommandé), politique + CORS posés
#   - (Optionnel) Un domaine Cloudflare pointant vers le bucket
#
# Utilisation :
#   cd scripts/
#   chmod +x upload_s3_afrique.sh
#   ./upload_s3_afrique.sh
# =============================================================================

set -u

# ---------- Configuration (à adapter) ----------

S3_BUCKET="caplearning-videos"              # Nom du bucket S3
S3_PREFIX="cap-learning/videos"             # Chemin dans le bucket (sans / au début/fin)
AWS_REGION="eu-west-1"                      # Région du bucket
SOURCE_DIR="./videos_afrique_720p"          # Dossier des MP4 à uploader
LOG_FILE="./upload_s3_log.txt"

# Domaine CDN devant le bucket (Cloudflare proxied)
# Un seul CDN dessert cap-learning.com ET cap-learning.sn
CDN_HOST="${CDN_HOST:-cdn.cap-learning.com}"

# ACL : "private" (recommandé, via CDN signé) ou "public-read" (accès direct S3)
S3_ACL="private"

# Cache-Control envoyé avec chaque objet (1 an, immutable)
CACHE_CONTROL="public, max-age=31536000, immutable"

# ---------- Checks ----------

if ! command -v aws >/dev/null 2>&1; then
    echo "❌ AWS CLI non installé. Mac: brew install awscli puis: aws configure" >&2
    exit 1
fi

if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Dossier introuvable : $SOURCE_DIR" >&2
    echo "   Lance d'abord ./process_videos_afrique.sh ou ./cut_videos_from_csv.sh" >&2
    exit 1
fi

# Check identité AWS
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    echo "❌ AWS CLI non authentifié. Lance: aws configure" >&2
    exit 1
fi

# Check existence bucket
if ! aws s3api head-bucket --bucket "$S3_BUCKET" --region "$AWS_REGION" 2>/dev/null; then
    echo "❌ Bucket $S3_BUCKET inaccessible (inexistant ou pas les droits)." >&2
    exit 1
fi

shopt -s nullglob
FILES=( "$SOURCE_DIR"/*.mp4 )
shopt -u nullglob
TOTAL=${#FILES[@]}
if [ "$TOTAL" -eq 0 ]; then
    echo "⚠️  Aucun .mp4 trouvé dans $SOURCE_DIR" >&2
    exit 0
fi

# ---------- Banner ----------

{
    echo ""
    echo "============================================================"
    echo "  Cap Learning — Upload S3 ($(date))"
    echo "  Bucket : s3://$S3_BUCKET/$S3_PREFIX/"
    echo "  Région : $AWS_REGION"
    echo "  ACL    : $S3_ACL"
    echo "  CDN    : ${CDN_HOST:-(aucun, URLs S3 directes)}"
    echo "  Total  : $TOTAL fichier(s)"
    echo "============================================================"
    echo ""
    echo "lesson_id,filename,s3_url,cdn_url"
} | tee "$LOG_FILE"

# ---------- Loop ----------

I=0; OK=0; FAIL=0
for F in "${FILES[@]}"; do
    I=$((I+1))
    BN=$(basename "$F")
    KEY="$S3_PREFIX/$BN"
    # Tente d'extraire le lesson_id du metadata (injecté par nos scripts ffmpeg)
    LESSON_ID=$(ffprobe -v error -show_entries format_tags=comment -of default=nw=1:nk=1 "$F" 2>/dev/null \
                | sed -n 's/.*lesson_id=\([A-Za-z0-9_-]\+\).*/\1/p' | head -1)

    echo "[$I/$TOTAL] ⬆️  $BN"

    aws s3 cp "$F" "s3://$S3_BUCKET/$KEY" \
        --region "$AWS_REGION" \
        --acl "$S3_ACL" \
        --content-type "video/mp4" \
        --cache-control "$CACHE_CONTROL" \
        --only-show-errors

    if [ $? -ne 0 ]; then
        echo "    ❌ upload failed"
        FAIL=$((FAIL+1))
        continue
    fi

    S3_URL="https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${KEY}"
    if [ -n "$CDN_HOST" ]; then
        CDN_URL="https://${CDN_HOST}/${KEY}"
    else
        CDN_URL=""
    fi

    echo "    ✅ $S3_URL"
    [ -n "$CDN_URL" ] && echo "    🌍 $CDN_URL"
    echo "${LESSON_ID},${BN},${S3_URL},${CDN_URL}" >> "$LOG_FILE"
    OK=$((OK+1))
done

{
    echo ""
    echo "============================================================"
    echo "  RÉCAP   ✅ OK=$OK   ❌ Fail=$FAIL"
    echo "  📄 CSV résultat : $LOG_FILE"
    echo ""
    echo "  Next:"
    echo "   1. Vérifie une lecture : ouvre une URL CDN dans un navigateur"
    echo "   2. Remplis video-mapping.json avec ./apply_urls_to_mapping.py $LOG_FILE"
    echo "============================================================"
} | tee -a "$LOG_FILE"
