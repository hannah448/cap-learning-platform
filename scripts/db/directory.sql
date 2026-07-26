-- ============================================================================
-- Cap Learning — Annuaire des membres (T1 + T2)
-- ----------------------------------------------------------------------------
-- Ajoute les colonnes annuaire à `profiles`, crée `directory_reports`,
-- et pose les policies RLS.
--
-- À lancer APRÈS schema.sql et rls.sql.
-- Dashboard Supabase → SQL Editor → New query → coller ce fichier → Run.
-- Doit afficher "Success. No rows returned." en bas.
-- ============================================================================

-- ------------------------------------------------------------------
-- 1. Colonnes annuaire sur profiles
-- ------------------------------------------------------------------
-- Note : on réutilise la colonne `country` existante (déjà en 2 lettres)
-- plutôt que d'ajouter un doublon `country_iso`.
alter table public.profiles
    add column if not exists is_directory_visible   boolean not null default false,
    add column if not exists directory_opted_in_at  timestamptz,
    add column if not exists display_name           text,
    add column if not exists city                   text,
    add column if not exists sector                 text,
    add column if not exists project_title          text,
    add column if not exists project_pitch          text,
    add column if not exists whatsapp_e164          text,
    add column if not exists linkedin_url           text,
    add column if not exists instagram_handle       text,
    add column if not exists contact_via_whatsapp   boolean not null default true,
    add column if not exists directory_updated_at   timestamptz not null default now();

comment on column public.profiles.is_directory_visible is 'Opt-in RGPD explicite pour apparaître dans l''annuaire (default false)';
comment on column public.profiles.directory_opted_in_at is 'Horodatage du 1er passage du toggle à true (preuve RGPD)';
comment on column public.profiles.display_name is 'Nom public choisi par l''apprenant (peut différer de full_name)';
comment on column public.profiles.whatsapp_e164 is 'Numéro WhatsApp au format E.164, ex. +221771234567';
comment on column public.profiles.contact_via_whatsapp is 'L''apprenant autorise-t-il le contact via WhatsApp ? (default true si numéro renseigné)';

-- Contraintes de format (garde-fous minimum)
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'profiles_sector_check') then
        alter table public.profiles add constraint profiles_sector_check check (
            sector is null or sector in (
                'commerce','mode-textile','alimentation','beaute-cosmetique',
                'sante-bien-etre','artisanat','agriculture-agroalimentaire',
                'education-formation','services-numeriques','marketing-communication',
                'evenementiel','tourisme-hospitality','btp-construction',
                'transport-logistique','finance-fintech','immobilier',
                'media-contenu','arts-culture','ong-social','autre'
            )
        );
    end if;
    if not exists (select 1 from pg_constraint where conname = 'profiles_project_title_len') then
        alter table public.profiles add constraint profiles_project_title_len
            check (project_title is null or length(project_title) <= 80);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'profiles_project_pitch_len') then
        alter table public.profiles add constraint profiles_project_pitch_len
            check (project_pitch is null or length(project_pitch) <= 300);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'profiles_whatsapp_format') then
        alter table public.profiles add constraint profiles_whatsapp_format
            check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+[1-9]\d{7,14}$');
    end if;
    if not exists (select 1 from pg_constraint where conname = 'profiles_country_iso_len') then
        alter table public.profiles add constraint profiles_country_iso_len
            check (country is null or length(country) = 2);
    end if;
end$$;

-- Index composite pour la recherche annuaire (uniquement les profils visibles)
create index if not exists idx_profiles_directory
    on public.profiles (is_directory_visible, country, sector)
    where is_directory_visible = true;

-- ------------------------------------------------------------------
-- 2. Trigger : maintien de directory_updated_at + horodatage RGPD 1er opt-in
-- ------------------------------------------------------------------
create or replace function public.touch_directory_updated_at()
returns trigger language plpgsql as $$
begin
    -- 1er opt-in : on stampe l'horodatage RGPD (preuve du consentement)
    if new.is_directory_visible = true
        and (old.is_directory_visible is null or old.is_directory_visible = false)
        and new.directory_opted_in_at is null then
        new.directory_opted_in_at = now();
    end if;

    -- Toute modif d'un champ annuaire → refresh directory_updated_at
    if (
        new.is_directory_visible   is distinct from old.is_directory_visible or
        new.display_name           is distinct from old.display_name or
        new.city                   is distinct from old.city or
        new.sector                 is distinct from old.sector or
        new.project_title          is distinct from old.project_title or
        new.project_pitch          is distinct from old.project_pitch or
        new.whatsapp_e164          is distinct from old.whatsapp_e164 or
        new.linkedin_url           is distinct from old.linkedin_url or
        new.instagram_handle       is distinct from old.instagram_handle or
        new.contact_via_whatsapp   is distinct from old.contact_via_whatsapp
    ) then
        new.directory_updated_at = now();
    end if;

    return new;
end;
$$;

drop trigger if exists touch_profiles_directory on public.profiles;
create trigger touch_profiles_directory
    before update on public.profiles
    for each row execute procedure public.touch_directory_updated_at();

-- ------------------------------------------------------------------
-- 3. Table directory_reports (modération V1)
-- ------------------------------------------------------------------
create table if not exists public.directory_reports (
    id           uuid primary key default gen_random_uuid(),
    reporter_id  uuid not null references public.profiles(id) on delete cascade,
    reported_id  uuid not null references public.profiles(id) on delete cascade,
    reason       text not null check (length(reason) between 3 and 500),
    created_at   timestamptz not null default now(),
    resolved_at  timestamptz,
    resolved_by  uuid references public.profiles(id)
);

create index if not exists idx_directory_reports_reported
    on public.directory_reports (reported_id, resolved_at);

comment on table public.directory_reports is 'Signalements de profils annuaire pour modération (V1: email à Hannah)';

-- ------------------------------------------------------------------
-- 4. RLS — policy de lecture annuaire sur profiles
-- ------------------------------------------------------------------
-- Les policies existantes de profiles (self read/update) restent en place.
-- On AJOUTE une lecture restreinte aux profils opt-in.
drop policy if exists directory_read on public.profiles;
create policy directory_read on public.profiles
    for select
    using (
        is_directory_visible = true
        or auth.uid() = id
    );

-- ------------------------------------------------------------------
-- 5. RLS — directory_reports
-- ------------------------------------------------------------------
alter table public.directory_reports enable row level security;

drop policy if exists report_create on public.directory_reports;
create policy report_create on public.directory_reports
    for insert
    with check (auth.uid() = reporter_id);

drop policy if exists report_read_own on public.directory_reports;
create policy report_read_own on public.directory_reports
    for select
    using (auth.uid() = reporter_id);
-- (Les admins lisent via service_role côté serveur, qui bypasse la RLS.)

-- ============================================================================
-- ✅ Migration terminée.
--
-- Vérifs à coller ensuite dans le SQL Editor (facultatif) :
--
--   select column_name from information_schema.columns
--    where table_name = 'profiles'
--      and column_name in ('is_directory_visible','directory_opted_in_at',
--                          'display_name','city','sector','project_title',
--                          'project_pitch','whatsapp_e164','linkedin_url',
--                          'instagram_handle','contact_via_whatsapp',
--                          'directory_updated_at');
--   -- doit retourner 12 lignes
--
--   select count(*) from public.directory_reports;
--   -- doit retourner 0 sans erreur
-- ============================================================================
