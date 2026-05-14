#!/usr/bin/env bash
# =============================================================================
# Cap Learning — setup_aws_from_csv.sh
# -----------------------------------------------------------------------------
# Configure aws CLI à partir du CSV téléchargé depuis IAM
# (~/Downloads/caplearning-uploader_accessKeys.csv).
#
# Le secret ne quitte jamais ta machine — ce script lit le CSV local et
# écrit ~/.aws/credentials et ~/.aws/config localement.
#
# Usage :
#   chmod +x setup_aws_from_csv.sh
#   ./setup_aws_from_csv.sh
# =============================================================================

set -eu

CSV="${1:-$HOME/Downloads/caplearning-uploader_accessKeys.csv}"
REGION="eu-west-1"

if [ ! -f "$CSV" ]; then
    echo "❌ CSV introuvable : $CSV" >&2
    echo "   Soit le télécharger depuis IAM, soit le passer en argument." >&2
    exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
    echo "❌ AWS CLI non installé. Mac : brew install awscli" >&2
    exit 1
fi

echo "📄 Lecture de $CSV"

# Le CSV AWS a 2 colonnes : Access key ID,Secret access key
# Ligne 1 = headers, ligne 2 = valeurs
ACCESS_KEY=$(awk -F, 'NR==2 {gsub(/[ \r\n"]/,"",$1); print $1}' "$CSV")
SECRET_KEY=$(awk -F, 'NR==2 {gsub(/[ \r\n"]/,"",$2); print $2}' "$CSV")

if [ -z "$ACCESS_KEY" ] || [ -z "$SECRET_KEY" ]; then
    echo "❌ Impossible de parser le CSV. Vérifie le format." >&2
    exit 1
fi

# Sécurité : le préfixe d'une access key AWS est 'AKIA' (longue durée)
if [[ ! "$ACCESS_KEY" =~ ^AKIA ]]; then
    echo "⚠️  L'access key ne commence pas par AKIA — vérifie le CSV." >&2
    exit 1
fi

# Backup l'éventuelle config existante
if [ -f "$HOME/.aws/credentials" ]; then
    cp "$HOME/.aws/credentials" "$HOME/.aws/credentials.backup.$(date +%s)"
    echo "💾 Backup de l'ancien credentials créé"
fi

mkdir -p "$HOME/.aws"
chmod 700 "$HOME/.aws"

# Écrit en profil 'default'
cat > "$HOME/.aws/credentials" <<EOF
[default]
aws_access_key_id = $ACCESS_KEY
aws_secret_access_key = $SECRET_KEY
EOF
chmod 600 "$HOME/.aws/credentials"

cat > "$HOME/.aws/config" <<EOF
[default]
region = $REGION
output = json
EOF
chmod 600 "$HOME/.aws/config"

echo "✅ ~/.aws/credentials écrit (perms 600)"
echo "✅ ~/.aws/config écrit (region=$REGION, output=json)"
echo ""
echo "🔍 Test de l'auth AWS..."
echo ""

if aws sts get-caller-identity; then
    echo ""
    echo "🎉 Auth OK. Tu peux maintenant lancer ./upload_s3_afrique.sh"
else
    echo ""
    echo "❌ Auth en erreur. Si InvalidClientTokenId, attends 30s et retente :"
    echo "   aws sts get-caller-identity"
    exit 1
fi
