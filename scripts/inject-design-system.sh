#!/usr/bin/env bash
# =============================================================================
# Cap Learning — inject-design-system.sh
# -----------------------------------------------------------------------------
# Injecte dans chaque page HTML :
#   1. Le <link> vers css/tokens.css (avant style.css)
#   2. Le <script> anti-flash dark mode (juste après <head>)
#   3. Le <script> defer js/theme.js (avant </body>)
#
# Idempotent : peut être relancé sans danger.
# Auto-détecte si la page est à la racine (css/...) ou sous-dossier (../css/...).
#
# Usage :
#   ./inject-design-system.sh                  # toutes les pages HTML
#   ./inject-design-system.sh --dry-run        # affiche sans modifier
#   ./inject-design-system.sh path/to/file.html  # une seule page
# =============================================================================

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN=0
TARGETS=()

# Parse args
for arg in "$@"; do
    case "$arg" in
        --dry-run|-n) DRY_RUN=1 ;;
        -*) echo "Option inconnue: $arg" >&2; exit 1 ;;
        *) TARGETS+=("$arg") ;;
    esac
done

# Si aucun fichier passé, on prend toutes les pages HTML
if [ ${#TARGETS[@]} -eq 0 ]; then
    while IFS= read -r -d '' f; do
        TARGETS+=("$f")
    done < <(find "$ROOT" -maxdepth 3 -name "*.html" \
                          -not -path "*/node_modules/*" \
                          -not -path "*/.git/*" \
                          -not -path "*/scripts/*" \
                          -not -path "*/partials/*" \
                          -print0)
fi

echo "============================================================"
echo "  Cap Learning — Injection Design System v1.3"
echo "  Cibles : ${#TARGETS[@]} page(s) HTML"
echo "  Mode   : $([ $DRY_RUN -eq 1 ] && echo 'DRY-RUN (lecture seule)' || echo 'WRITE')"
echo "============================================================"
echo ""

OK=0; SKIP=0; FAIL=0

for f in "${TARGETS[@]}"; do
    if [ ! -f "$f" ]; then
        echo "  ❌ $f : fichier introuvable"
        FAIL=$((FAIL+1))
        continue
    fi

    REL="${f#$ROOT/}"

    # Détermine le préfixe relatif vers css/ et js/
    # Si le fichier est à la racine du projet → css/
    # Sinon (pages/X.html, docs/X.html) → ../css/
    DIR=$(dirname "$REL")
    if [ "$DIR" = "." ]; then
        CSS_PREFIX="css"
        JS_PREFIX="js"
    else
        # Compte les segments pour déterminer la profondeur
        DEPTH=$(echo "$DIR" | tr '/' '\n' | wc -l | tr -d ' ')
        UP=""
        for ((i=0; i<DEPTH; i++)); do UP="${UP}../"; done
        CSS_PREFIX="${UP}css"
        JS_PREFIX="${UP}js"
    fi

    NEEDS_TOKENS=0
    NEEDS_ANTIFLASH=0
    NEEDS_THEMEJS=0

    grep -q "${CSS_PREFIX}/tokens.css" "$f" || NEEDS_TOKENS=1
    grep -q "Cap Learning anti-flash" "$f" || NEEDS_ANTIFLASH=1
    grep -q "${JS_PREFIX}/theme.js" "$f" || NEEDS_THEMEJS=1

    if [ $NEEDS_TOKENS -eq 0 ] && [ $NEEDS_ANTIFLASH -eq 0 ] && [ $NEEDS_THEMEJS -eq 0 ]; then
        echo "  ✓ $REL : déjà à jour"
        SKIP=$((SKIP+1))
        continue
    fi

    ACTIONS=""
    [ $NEEDS_TOKENS -eq 1 ] && ACTIONS="${ACTIONS}+tokens.css "
    [ $NEEDS_ANTIFLASH -eq 1 ] && ACTIONS="${ACTIONS}+anti-flash "
    [ $NEEDS_THEMEJS -eq 1 ] && ACTIONS="${ACTIONS}+theme.js "

    if [ $DRY_RUN -eq 1 ]; then
        echo "  📝 $REL : $ACTIONS  (dry-run, pas de modif)"
        OK=$((OK+1))
        continue
    fi

    # ---- Backup ----
    cp "$f" "$f.bak"

    # ---- Modification via Python (sed multiline est galère) ----
    python3 - "$f" "$CSS_PREFIX" "$JS_PREFIX" "$NEEDS_TOKENS" "$NEEDS_ANTIFLASH" "$NEEDS_THEMEJS" <<'PYEOF'
import sys, re, io

path, css_prefix, js_prefix, n_tokens, n_aflash, n_thmjs = sys.argv[1:]
n_tokens = int(n_tokens); n_aflash = int(n_aflash); n_thmjs = int(n_thmjs)

with open(path, 'r', encoding='utf-8') as fh:
    src = fh.read()

# 1) Anti-flash : juste après <head> (avant tout autre <script>/<link>/<meta>)
if n_aflash:
    antiflash = (
        '\n    <!-- Cap Learning anti-flash dark mode (DS v1.3) -->\n'
        '    <script>(function(){try{var t=localStorage.getItem("caplearning_theme");'
        'if(!t||t==="system"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}'
        'document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");}catch(e){}})();</script>'
    )
    src = re.sub(r'(<head[^>]*>)', r'\1' + antiflash, src, count=1, flags=re.IGNORECASE)

# 2) tokens.css : avant le PREMIER <link rel="stylesheet" ...>
if n_tokens:
    link = f'    <link rel="stylesheet" href="{css_prefix}/tokens.css">\n'
    m = re.search(r'(\s*)<link\s+rel=["\']stylesheet["\']', src, flags=re.IGNORECASE)
    if m:
        src = src[:m.start()] + '\n' + link + src[m.start():]
    else:
        # Fallback : juste avant </head>
        src = src.replace('</head>', link + '</head>', 1)

# 3) theme.js : juste avant LE DERNIER </body> (pour éviter d'insérer dans
#    une string JavaScript qui contiendrait '</body>' en littéral, ex.
#    template d'impression dans dashboard.html).
if n_thmjs:
    script = f'    <script src="{js_prefix}/theme.js" defer></script>\n'
    idx = src.rfind('</body>')
    if idx != -1:
        src = src[:idx] + script + src[idx:]
    else:
        # Fallback : avant </html>
        src = src.replace('</html>', script + '</html>', 1)

with open(path, 'w', encoding='utf-8') as fh:
    fh.write(src)
PYEOF

    if [ $? -ne 0 ]; then
        echo "  ❌ $REL : échec injection (voir backup $f.bak)"
        FAIL=$((FAIL+1))
        continue
    fi

    echo "  ✏️  $REL : $ACTIONS"
    OK=$((OK+1))
done

echo ""
echo "============================================================"
echo "  RÉCAP   ✏️  Modifié=$OK   ✓ Déjà OK=$SKIP   ❌ Fail=$FAIL"
if [ $DRY_RUN -eq 0 ] && [ $OK -gt 0 ]; then
    echo "  📦 Backups : *.bak (à effacer après vérification)"
fi
echo "============================================================"
