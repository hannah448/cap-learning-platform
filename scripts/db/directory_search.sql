-- ============================================================================
-- Cap Learning — Annuaire P3 : recherche accent-insensible
-- ----------------------------------------------------------------------------
-- Ajoute une colonne calculée `directory_search_norm` sur profiles qui
-- concatène display_name + project_title + project_pitch après :
--   - passage en minuscules
--   - suppression des accents (extension unaccent)
--
-- Le front normalise sa saisie côté JS et cherche via ILIKE sur cette colonne.
-- Résultat : "Senegal" trouve "Sénégal", "wax" trouve "Wax", etc.
--
-- À lancer APRÈS scripts/db/directory.sql.
-- Dashboard Supabase → SQL Editor → New query → coller → Run.
-- ============================================================================

-- 1. Extension unaccent (fournie par Postgres)
create extension if not exists unaccent;

-- 2. Wrapper IMMUTABLE (unaccent() ne l'est pas par défaut, donc inutilisable
--    dans une colonne générée)
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
as $$
    select public.unaccent('public.unaccent'::regdictionary, $1)
$$;

-- 3. Colonne calculée
alter table public.profiles
    add column if not exists directory_search_norm text
    generated always as (
        public.immutable_unaccent(lower(
            coalesce(display_name, '')  || ' ' ||
            coalesce(project_title, '') || ' ' ||
            coalesce(project_pitch, '')
        ))
    ) stored;

comment on column public.profiles.directory_search_norm is
    'Colonne calculée : (display_name + project_title + project_pitch) minuscule + sans accents. Utilisée pour la recherche libre annuaire.';

-- 4. Index B-tree simple sur la colonne (pas besoin de pg_trgm pour ILIKE prefix,
--    et Postgres reste efficace jusqu'à quelques dizaines de milliers de lignes)
create index if not exists idx_profiles_directory_search_norm
    on public.profiles (directory_search_norm)
    where is_directory_visible = true;

-- ============================================================================
-- ✅ Fait. Vérif :
--   select display_name, directory_search_norm from public.profiles limit 5;
--   -- doit retourner la version normalisée (ex. "fatou n. boutique whatsapp de tissus wax")
-- ============================================================================
