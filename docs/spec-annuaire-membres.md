# Spec — Annuaire filtrable des membres Cap Learning

**Version** : 1.0 · **Date** : 2026-07-25 · **Contact projet** : Hannah Peters (hannah@digi-atlas.com)
**Stack existante** : HTML statique (Vercel) + Supabase (Postgres/Auth) + Vercel Functions Node.js
**Repo** : `hannah448/cap-learning-platform` (branche `main`)

---

## 1. Contexte & objectif

Cap Learning promet sur la page `/pages/plateforme` un « annuaire filtrable, en 3 clics max » de sa communauté d'entrepreneurs. Cette fonctionnalité n'existe pas encore. **Objectif** : permettre à un apprenant connecté de découvrir les autres apprenants, filtrer par pays / ville / secteur / formation suivie, consulter un profil détaillé et prendre contact via WhatsApp.

### Non-objectifs (V1)
- ❌ Pas de messagerie interne (les échanges se font par WhatsApp externe).
- ❌ Pas de contenu utilisateur riche (pas de posts, pas de likes, pas de forum).
- ❌ Pas de gestion d'événements ni de groupes thématiques.
- ❌ Pas d'accès public — annuaire strictement réservé aux comptes ayant au moins 1 `enrollment` actif.

---

## 2. User stories (V1)

| # | En tant que… | Je veux… | Pour… |
|---|---|---|---|
| US-1 | apprenant Cap Learning connecté | voir la liste des autres apprenants | trouver des pairs qui font le même parcours |
| US-2 | apprenant | filtrer par pays, ville, secteur d'activité, formation suivie | cibler des profils pertinents (ex. e-commerçants au Bénin) |
| US-3 | apprenant | ouvrir la fiche détaillée d'un membre | comprendre son projet avant de le contacter |
| US-4 | apprenant | contacter un membre en un clic via WhatsApp | échanger sans passer par une messagerie interne |
| US-5 | tout membre | **choisir si mon profil est visible** dans l'annuaire (opt-in) | respecter ma vie privée |
| US-6 | tout membre | éditer mon profil public (bio, projet, secteur, ville, réseaux) | tenir mes infos à jour |
| US-7 | admin Cap Learning | masquer / bannir un profil signalé | modération |

---

## 3. Modèle de données

### 3.1 Extension de la table `profiles` existante (Supabase)

Ajouter les colonnes suivantes à `public.profiles` :

| Colonne | Type | Nullable | Notes |
|---|---|:---:|---|
| `is_directory_visible` | `boolean` | non (default `false`) | **Opt-in explicite** (RGPD) |
| `display_name` | `text` | oui | Nom public choisi par l'apprenant (peut différer du nom légal) |
| `country_iso` | `text` (2 lettres) | oui | ex. `SN`, `CI`, `BJ` — limite : 17 pays OHADA + RDC/Guinée/Comores |
| `city` | `text` | oui | libre |
| `sector` | `text` (enum) | oui | valeurs contrôlées, voir §3.2 |
| `project_title` | `text` | oui | max 80 car. — ex. « Boutique WhatsApp de tissus wax » |
| `project_pitch` | `text` | oui | max 300 car. — description libre |
| `whatsapp_e164` | `text` | oui | format E.164 (`+221771234567`), regex à valider côté API |
| `linkedin_url` | `text` | oui | URL, validation `^https://([a-z]{2,3}\.)?linkedin\.com/` |
| `instagram_handle` | `text` | oui | sans `@` |
| `avatar_url` | `text` | oui | URL storage Supabase (bucket `avatars/`) |
| `directory_updated_at` | `timestamptz` | non (default `now()`) | audit |

Créer un index composite pour la recherche :

```sql
create index if not exists idx_profiles_directory
  on public.profiles (is_directory_visible, country_iso, sector)
  where is_directory_visible = true;
```

### 3.2 Enum `sector` — valeurs autorisées

À stocker en constante côté serveur ET côté front (source de vérité : `/js/directory-config.js`) :

```
commerce, mode-textile, alimentation, beaute-cosmetique, sante-bien-etre,
artisanat, agriculture-agroalimentaire, education-formation,
services-numeriques, marketing-communication, evenementiel, tourisme-hospitality,
btp-construction, transport-logistique, finance-fintech, immobilier,
media-contenu, arts-culture, ong-social, autre
```

### 3.3 Table `directory_reports` (nouvelle, pour la modération)

```sql
create table public.directory_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  reported_id  uuid not null references public.profiles(id) on delete cascade,
  reason       text not null,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id)
);
create index on public.directory_reports (reported_id, resolved_at);
```

### 3.4 Sécurité — Row Level Security (RLS)

```sql
alter table public.profiles enable row level security;

-- SELECT : membres connectés voient les profils opt-in ; chacun voit toujours le sien
create policy directory_read on public.profiles for select
  using (
    is_directory_visible = true
    or auth.uid() = id
  );

-- UPDATE : chacun n'édite QUE son propre profil
create policy self_update on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- reports : n'importe quel apprenant connecté peut signaler
alter table public.directory_reports enable row level security;
create policy report_create on public.directory_reports for insert
  with check (auth.uid() = reporter_id);
```

**Gate d'accès** : la RLS ci-dessus ne suffit pas — l'accès à l'annuaire doit exiger **au moins 1 enrollment actif** (`enrollments.status = 'paid'`). C'est vérifié par l'API (§4.2), pas par la RLS (plus simple).

---

## 4. API — Vercel Functions (Node)

Fichiers à créer dans `/api/directory/`.

### 4.1 `GET /api/directory/list`

**Query params** (tous optionnels sauf pagination) :
| Param | Type | Notes |
|---|---|---|
| `country` | `string` (ISO2) | ex. `SN` |
| `city` | `string` | insensible à la casse, `ILIKE %city%` |
| `sector` | `string` (enum) | valider contre la liste §3.2 |
| `course` | `string` | slug course (`marketing`, `ecommerce`…) → jointure sur `enrollments` |
| `q` | `string` | recherche full-text sur `display_name` + `project_title` |
| `page` | `int` | défaut 1 |
| `limit` | `int` | défaut 24, max 50 |

**Réponse** (200) :
```json
{
  "total": 142,
  "page": 1,
  "results": [
    {
      "id": "uuid",
      "display_name": "Fatou N.",
      "country_iso": "SN",
      "city": "Dakar",
      "sector": "mode-textile",
      "project_title": "Boutique WhatsApp de wax",
      "avatar_url": "https://.../avatar.jpg",
      "courses": ["marketing", "ecommerce"]
    }
  ]
}
```

**Sécurité** :
- Auth requise (JWT Supabase dans header `Authorization: Bearer …`).
- Rejeter (403) si `enrollments count for auth.uid() where status='paid' = 0`.
- Rate limit : 60 requêtes/min/IP (utiliser `@vercel/kv` ou un middleware simple).
- Ne JAMAIS retourner `whatsapp_e164`, `linkedin_url`, `instagram_handle`, `project_pitch` dans la liste (uniquement dans le détail).

### 4.2 `GET /api/directory/profile/:id`

Retourne le profil complet **d'un autre membre** (opt-in obligatoire).
Ajoute les champs `project_pitch`, `linkedin_url`, `instagram_handle`, et — **seulement si le membre a coché `contact_via_whatsapp`** — le `whatsapp_e164` **hashé côté serveur** dans un lien `https://wa.me/…` (ne jamais exposer le numéro brut en JSON, uniquement l'URL prête à cliquer).

### 4.3 `PUT /api/directory/me`

Édition de son propre profil annuaire. Body JSON = champs de §3.1. **Validation stricte** :
- `whatsapp_e164` : regex `^\+[1-9]\d{7,14}$`
- `country_iso` : dans une liste blanche (17 pays OHADA + RDC/Guinée/Comores)
- `sector` : dans l'enum §3.2
- `project_title` ≤ 80 car., `project_pitch` ≤ 300 car.
- Sanitize XSS (aucun HTML, uniquement texte plain).

### 4.4 `POST /api/directory/report`

Body : `{ reported_id: uuid, reason: string }`. Insertion dans `directory_reports`. Envoyer un email à `hannah@digi-atlas.com` via Brevo (SMTP existant).

---

## 5. UI — Pages à créer

### 5.1 `/pages/annuaire.html` (accès élève connecté)

**Layout** — bandeau filtres à gauche (~260 px), grille de cartes à droite (responsive : 3 colonnes desktop, 2 tablet, 1 mobile). Réutiliser les tokens design du site (voir `css/tokens.css`, `css/components.css`).

**Bloc filtres** :
- Recherche libre (input avec debounce 400 ms).
- Select pays (avec compteur : « Sénégal (42) »).
- Select ville (dépendant du pays choisi).
- Select secteur (§3.2, avec icônes emoji).
- Chips « Formation suivie » (multi-select : Marketing / IA / E-commerce / Réseaux).
- Bouton « Réinitialiser ».

**Carte membre** :
- Avatar rond 80 px (fallback : initiales sur dégradé, comme sur `nos-experts`).
- Nom d'affichage + drapeau pays + ville.
- Badge secteur.
- Titre du projet (1 ligne, ellipsis).
- Chips des formations suivies.
- Bouton « Voir le profil » → ouvre une modale ou navigue vers `/pages/annuaire-profil?id=…`.

**Empty state** : « Aucun membre ne correspond à ces filtres. Essaie d'élargir ta recherche. »

### 5.2 Modale « Profil détaillé »

Titre + avatar + tags. Section « Son projet » (pitch complet). Boutons contact :
- **WhatsApp** (si dispo) : ouvre `https://wa.me/…?text=Bonjour%20…%2C%20je%20t%27ai%20découvert%20sur%20l%27annuaire%20Cap%20Learning`
- **LinkedIn** (si dispo)
- **Instagram** (si dispo)
- Lien discret « Signaler ce profil » → POST `/api/directory/report`.

### 5.3 Onglet « Mon profil public » dans `/pages/dashboard`

Toggle géant en haut : *« Rendre mon profil visible dans l'annuaire »* (default `off`). Formulaire d'édition des champs §3.1. Preview live à droite. Bouton « Enregistrer » qui appelle `PUT /api/directory/me`.

### 5.4 Lien dans le menu élève (dashboard-v2 sidebar)

Ajouter une entrée `Annuaire des membres` avec l'icône 👥 (`&#128101;`), pointant vers `/pages/annuaire`.

---

## 6. RGPD / conformité

1. **Opt-in explicite obligatoire** (case décochée par défaut).
2. **Consentement horodaté** — stocker `directory_opted_in_at timestamptz` lors du 1er toggle ON.
3. **Droit à l'effacement** : bouton « Retirer mon profil de l'annuaire » → passe `is_directory_visible=false` + purge des champs annuaire (garde le compte).
4. **Modération** : Hannah reçoit un email pour chaque report ; peut masquer un profil depuis `/pages/admin` (nouvelle action à ajouter).
5. **Mentions dans la politique de confidentialité** : mettre à jour `/pages/confidentialite` pour décrire cette collecte et cette finalité.
6. **Pas d'export CSV public** ; scraping bloqué par auth + rate limit.

---

## 7. Phases de livraison recommandées

| Phase | Périmètre | Effort estimé |
|---|---|---|
| **P1 — MVP** | Migration DB + RLS · API list/profile/me · page annuaire minimal · toggle opt-in dashboard | ~5 jours |
| **P2 — Contact & modération** | Boutons WhatsApp/LinkedIn/Insta · modale profil · report + email Hannah · admin masquage | ~2 jours |
| **P3 — Filtres avancés** | Compteurs par pays/secteur · dépendance ville→pays · recherche full-text | ~2 jours |
| **P4 — Polish** | Empty states · loader skeleton · analytics events · a11y check | ~1 jour |

**Total** : ≈ 10 jours homme.

---

## 8. Definition of Done (P1)

- [ ] Migration SQL appliquée en prod Supabase, RLS actif et testé (tests SQL fournis).
- [ ] 3 endpoints API déployés sur Vercel, avec auth + rate limit + validation.
- [ ] Page `/pages/annuaire` accessible uniquement aux élèves connectés & payants.
- [ ] Toggle opt-in fonctionnel dans le dashboard, avec horodatage consentement.
- [ ] Politique de confidentialité mise à jour.
- [ ] Aucune donnée sensible (téléphone brut) exposée dans les réponses API.
- [ ] Testé sur Chrome/Safari mobile (3G simulée) et desktop.

---

## 9. Points de vigilance

- **Numéros WhatsApp** : ne jamais les afficher en clair, seulement le lien `wa.me`. Sinon = risque de spam massif via scraping.
- **Sur-promesse à retirer si non livré** : sur `/pages/plateforme`, le bloc parle d'« annuaire filtrable en 3 clics » — la page est OK avec cette spec, mais si P1 glisse, aligner la comm.
- **Cohérence avec le WhatsApp Business** : la mention « communauté WhatsApp par promotion » est provisoire (voir `MEMORY.md`), à réconcilier avec cet annuaire.
- **Éviter le doublon avec `nos-experts.html`** : nos-experts = équipe pédagogique, annuaire = pairs apprenants — deux pages distinctes.
