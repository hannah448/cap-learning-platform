# Cap Learning — Process vidéos (S3 + Cloudflare)

Guide opérationnel pour passer des **sources Vimeo Digi-Atlas** aux
**MP4 720p hébergés sur S3 + Cloudflare** et les brancher dans la plateforme.

Ce dossier contient tous les scripts + la config AWS prêts à l'emploi.

---

## 📁 Contenu

```
scripts/
├── process_videos_afrique.sh      # Batch FFmpeg : réencode tous les .mp4/.mov en 720p
├── cut_videos_from_csv.sh         # Cut + réencode via timecodes.csv
├── upload_s3_afrique.sh           # Upload vers S3 + génère upload_s3_log.txt
├── apply_urls_to_mapping.py       # Remplit js/video-mapping.json à partir du CSV S3
├── timecodes.csv.example          # Template CSV pour les cuts (10 blocs RS + 8 No-Code)
├── aws/
│   ├── bucket-policy.json         # Politique S3 (whitelist IPs Cloudflare)
│   ├── cors.json                  # CORS (origines cap-learning.com + localhost)
│   └── iam-policy-uploader.json   # Policy IAM pour l'utilisateur uploader
└── README.md                      # (ce fichier)
```

---

## 🧭 Architecture cible

```
Vimeo Digi-Atlas (source)          →  téléchargement manuel
    ↓
videos_originales/*.mp4             →  cut_videos_from_csv.sh + timecodes.csv
    ↓                                  ou process_videos_afrique.sh
videos_afrique_720p/*.mp4           →  upload_s3_afrique.sh
    ↓
S3 (privé, caplearning-videos)      →  Cloudflare CDN (cdn.cap-learning.com)
    ↓
video-mapping.json                  →  apply_urls_to_mapping.py
    ↓
js/video-player.js (CapPlayer)      →  <video> natif + hls.js (si .m3u8)
    ↓
pages/apprendre.html                →  apprenant final
```

**Rappel stack** : pas de Next.js, pas de Prisma, pas de react-player.
Tout est **vanilla HTML/JS** côté front. Le mapping vit dans `js/video-mapping.json`.

---

## 🚦 Plan d'action (4 semaines, aligné sur le PDF)

### Semaine 1 — Télécharger + compresser

```bash
cd scripts/

# 1. Crée le dossier source et dépose-y les vidéos Vimeo téléchargées
mkdir -p videos_originales
# (… drag & drop des .mp4 Digi-Atlas dans videos_originales/)

# 2. Installe FFmpeg si pas déjà
brew install ffmpeg          # Mac
# ou : sudo apt install ffmpeg   (Linux)

# 3a. Cas simple : juste compresser en 720p (pas de cut)
chmod +x process_videos_afrique.sh
./process_videos_afrique.sh

# 3b. Cas réel : couper des segments précis (voir section "Timecodes" plus bas)
cp timecodes.csv.example timecodes.csv
# Édite timecodes.csv avec tes vrais timecodes + lesson_ids
chmod +x cut_videos_from_csv.sh
./cut_videos_from_csv.sh timecodes.csv

# 4. Vérifie 3-4 vidéos à l'œil dans videos_afrique_720p/
open videos_afrique_720p/
```

**Résultat** : dossier `videos_afrique_720p/` rempli de MP4 ~120 Mo chacun,
nommés `nom_slug_720p_afrique.mp4`.

### Semaine 2 — AWS S3 + Cloudflare

#### A. Créer le bucket S3

```bash
aws s3api create-bucket \
    --bucket caplearning-videos \
    --region eu-west-1 \
    --create-bucket-configuration LocationConstraint=eu-west-1

# Bloque l'accès public par défaut
aws s3api put-public-access-block \
    --bucket caplearning-videos \
    --public-access-block-configuration \
      BlockPublicAcls=false,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false

# Applique la politique whitelist Cloudflare
aws s3api put-bucket-policy \
    --bucket caplearning-videos \
    --policy file://aws/bucket-policy.json

# Applique le CORS (pour que le <video> charge depuis cap-learning.com)
aws s3api put-bucket-cors \
    --bucket caplearning-videos \
    --cors-configuration file://aws/cors.json
```

> ⚠️ La liste d'IPs Cloudflare dans `bucket-policy.json` est à
> **rafraîchir** depuis https://www.cloudflare.com/ips-v4 de temps en temps.

#### B. Créer l'utilisateur IAM uploader

```bash
# Console AWS → IAM → Users → Add user
# - name : caplearning-uploader
# - access type : Programmatic access (access key + secret)
# - attach policy : coller le contenu de aws/iam-policy-uploader.json
# → récupérer AccessKeyId + SecretAccessKey

# Configure l'AWS CLI avec ces clés
aws configure
# AWS Access Key ID     : AKIA...
# AWS Secret Access Key : ...
# Default region        : eu-west-1
# Default output format : json
```

#### C. Configurer Cloudflare (2 domaines, 1 CDN partagé)

**Stratégie** : un seul sous-domaine CDN `cdn.cap-learning.com` sert les vidéos
aux deux sites (`.com` et `.sn`). Le `.sn` est essentiellement une redirection
vers le `.com` (ou une copie miroir, voir plus bas).

**Étape 1 — DNS `cap-learning.com` (domaine principal)**

Dans Cloudflare → Websites → `cap-learning.com` → DNS :

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `cdn` | `caplearning-videos.s3.eu-west-1.amazonaws.com` | 🟠 Proxied |
| CNAME | `@` | (ton hébergement actuel : Vercel, GitHub Pages, etc.) | 🟠 Proxied |
| CNAME | `www` | `cap-learning.com` | 🟠 Proxied |

**Étape 2 — DNS `cap-learning.sn`**

Dans Cloudflare → Websites → `cap-learning.sn` → DNS :

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `@` | `cap-learning.com` | 🟠 Proxied |
| CNAME | `www` | `cap-learning.com` | 🟠 Proxied |

Puis **Rules → Redirect Rules → Create rule** :
- Name : `Redirect .sn → .com`
- If : `Hostname equals cap-learning.sn OR Hostname equals www.cap-learning.sn`
- Then : Static → Status 301 → `https://cap-learning.com$${}\{http.request.uri.path}`
- Preserve query string : ON

> ⚠️ Pas besoin de CNAME `cdn.cap-learning.sn` : toutes les vidéos sont
> chargées depuis `cdn.cap-learning.com` quel que soit le site qui les affiche.
> C'est **CORS** qui autorise `cap-learning.sn` à faire la requête (voir `aws/cors.json`).

**Étape 3 — Protection commune (sur `cap-learning.com`)**

- Rules → **Hotlink Protection** : ON
- Caching → Cache Rules :
  - Name : `Videos — long cache`
  - If : `URI Path starts with /cap-learning/videos/`
  - Then : Cache eligibility = Eligible for cache, Edge TTL = 1 year, Browser TTL = 1 year
- Security → Bots → **Bot Fight Mode** : ON (bloque les scrapers)

**Variante "copie miroir" au lieu de redirection** — si tu veux que les
apprenants restent visuellement sur `.sn` (pour le branding local), remplace
l'étape 2 par un reverse-proxy Workers qui proxie le `.com` sous le `.sn`.
Me dire si c'est ce que tu veux, je fournis le script Worker.

#### D. Uploader

```bash
# Dans scripts/upload_s3_afrique.sh, vérifie/adapte les variables en tête :
#   S3_BUCKET="caplearning-videos"
#   S3_PREFIX="cap-learning/videos"
#   AWS_REGION="eu-west-1"
#   CDN_HOST="cdn.cap-learning.com"   # export CDN_HOST=... avant run

export CDN_HOST="cdn.cap-learning.com"
chmod +x upload_s3_afrique.sh
./upload_s3_afrique.sh

# Le log produit upload_s3_log.txt au format CSV :
#   lesson_id,filename,s3_url,cdn_url
```

#### E. Brancher dans le mapping

```bash
# Met à jour js/video-mapping.json avec les URLs CDN (fallback S3)
python3 apply_urls_to_mapping.py upload_s3_log.txt

# Pour un test à blanc sans écrire :
python3 apply_urls_to_mapping.py upload_s3_log.txt --dry-run
```

### Semaine 3-4 — Vidéos à tourner + QA

- Tourne les **17 vidéos spécifiques Afrique** (voir PDF section 8)
- Pour chaque : nomme le fichier `bloc_sujet_720p_afrique.mp4`, dépose dans `videos_originales/`
- Ajoute une ligne à `timecodes.csv` si c'est un cut, sinon juste `./process_videos_afrique.sh`
- Upload + `apply_urls_to_mapping.py`
- **QA** : ouvrir `pages/apprendre.html` → naviguer leçon par leçon → vérifier lecture 3G simulée
  (DevTools Chrome → Network → **Slow 3G**)

---

## ✂️ Timecodes : comment les relever

Le PDF section 7 liste ~72 segments à extraire des vidéos Digi-Atlas.

**Workflow conseillé** :

1. Sur Vimeo, télécharger la vidéo source complète (`videos_originales/RS6452.mp4`)
2. Ouvrir dans VLC / QuickTime, naviguer jusqu'au début du segment voulu
3. Noter le timecode `HH:MM:SS` de début + de fin
4. Ajouter une ligne à `timecodes.csv` :

```csv
source_file,start,end,lesson_id,output_name
RS6452_session1.mp4,00:02:00,00:10:30,s1-1,bloc1_presence_digitale
```

- `source_file` = nom exact du fichier dans `videos_originales/`
- `start` / `end` = `HH:MM:SS` ou secondes brutes (`750`)
- `lesson_id` = clé dans `js/video-mapping.json` (indispensable pour l'import auto)
- `output_name` = nom lisible du MP4 final (sera slugifié)

Le script `cut_videos_from_csv.sh` :
- **réencode** (pas `-c copy`) pour obtenir un cut frame-accurate et un 720p propre
- **ignore** une ligne si le MP4 de sortie existe déjà (reprise sans doublon)
- **continue** en cas d'erreur sur une ligne
- **injecte** le `lesson_id` dans les metadata du MP4 → récupéré auto par `upload_s3_afrique.sh`

---

## 📊 Paramètres d'encodage (alignés sur le PDF)

| Paramètre | Valeur | Pourquoi |
|---|---|---|
| Résolution max | 1280×720 | 3G/4G Sénégal, taille raisonnable |
| Codec vidéo | `libx264` preset `medium` | Compat universelle |
| CRF | 23 | Équilibre qualité / poids (18=haute, 28=léger) |
| Codec audio | AAC 96 kbps mono → stéréo | Voix propre, -30 % vs 128 kbps |
| faststart | ✅ (`-movflags +faststart`) | Lecture démarre avant fin du DL |
| Durée max | 720 s (12 min) | Adapté aux sessions Afrique |

**Gain attendu** : 500 Mo → 120 Mo par vidéo (-76 %), ~10 Go pour 80 vidéos.

---

## 🔒 Sécurité / protection

Niveaux de protection par ordre croissant :

| Niveau | Comment | Quand l'utiliser |
|---|---|---|
| **Niveau 1 — `controlsList="nodownload"`** | Déjà actif dans `video-player.js` | Toujours (protection cosmétique) |
| **Niveau 2 — Whitelist IP Cloudflare sur S3** | `aws/bucket-policy.json` | Dès Semaine 2 (ce guide) |
| **Niveau 3 — Hotlink protection Cloudflare** | Cloudflare → Rules → Hotlink | Dès Semaine 2 |
| **Niveau 4 — Signed URLs Cloudflare** | Workers + token HMAC | Quand il y aura des abonnements payants |

Le **Niveau 2 + 3** suffit amplement au démarrage : un utilisateur ne peut pas
copier l'URL S3 et la partager, elle ne marche que via le domaine `cap-learning.com`.

---

## 🧩 Commandes utiles

```bash
# Vérifier la durée d'une vidéo
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 videos_originales/foo.mp4

# Re-traiter une seule vidéo (skip auto sinon)
rm videos_afrique_720p/foo_720p_afrique.mp4 && ./process_videos_afrique.sh

# Lister les objets présents dans S3
aws s3 ls s3://caplearning-videos/cap-learning/videos/ --human-readable

# Supprimer un upload raté
aws s3 rm s3://caplearning-videos/cap-learning/videos/foo_720p_afrique.mp4

# Tester une URL CDN depuis la ligne de commande
curl -I https://cdn.cap-learning.com/cap-learning/videos/foo_720p_afrique.mp4
# → doit renvoyer 200 OK + Content-Type: video/mp4 + Cache-Control
```

---

## 🆘 Troubleshooting

**ffmpeg failed sur une vidéo** → regarde `traitement_log.txt`, souvent un
fichier source corrompu ou un codec exotique. Re-télécharge depuis Vimeo.

**403 sur l'URL CDN** → les IPs Cloudflare ont peut-être changé. Rafraîchis
`aws/bucket-policy.json` et réapplique `aws s3api put-bucket-policy`.

**Le player reste sur "Vidéo en cours de production"** → le `lesson_id` n'a pas
été matché dans `video-mapping.json`. Vérifie avec
`python3 apply_urls_to_mapping.py upload_s3_log.txt --dry-run` — les lignes
`missing` sont à corriger dans le CSV ou dans le mapping.

**CORS error dans la console** → vérifie que l'origine du navigateur est dans
`aws/cors.json`, et ré-applique `aws s3api put-bucket-cors`.
