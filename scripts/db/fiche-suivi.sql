-- ============================================================================
-- Cap Learning — Fiche de suivi (projet, objectif, jalons, journal de bord)
-- ----------------------------------------------------------------------------
-- À lancer APRÈS schema.sql et rls.sql.
--   Dashboard Supabase → SQL Editor → New query → coller ce fichier → Run
--
-- Ce fichier est ré-exécutable sans danger : il ne détruit aucune donnée
-- existante (create table if not exists / drop policy if exists).
--
-- Modèle :
--   1 apprenante = 1 fiche (project_trackers)
--                    ├── N jalons          (tracker_milestones)
--                    └── N entrées journal (tracker_journal_entries)
--
-- Accès : l'apprenante lit/écrit SA fiche. L'équipe Cap Learning (role=admin)
-- la lit en LECTURE SEULE — c'est le sens de la promesse « partageable avec
-- votre formateur ou la CSM » affichée sur la page plateforme.
-- ============================================================================

-- ------------------------------------------------------------------
-- project_trackers : la fiche elle-même (1 seule par apprenante)
-- ------------------------------------------------------------------
create table if not exists public.project_trackers (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null unique references public.profiles(id) on delete cascade,
    project         text,           -- « Lancer une marque de cosmétique naturelle à Dakar »
    objective       text,           -- « Atteindre 50 commandes / mois »
    objective_due_on date,          -- échéance de l'objectif (optionnelle)
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_project_trackers_user on public.project_trackers(user_id);

comment on table public.project_trackers is 'Fiche de suivi : 1 ligne par apprenante';

-- ------------------------------------------------------------------
-- tracker_milestones : les jalons du projet
-- ------------------------------------------------------------------
-- user_id est dupliqué depuis le tracker parent : ça permet aux policies RLS
-- de vérifier la propriété sans jointure (moins de code, plus rapide).
create table if not exists public.tracker_milestones (
    id              uuid primary key default gen_random_uuid(),
    tracker_id      uuid not null references public.project_trackers(id) on delete cascade,
    user_id         uuid not null references public.profiles(id) on delete cascade,
    title           text not null,
    timeframe       text,           -- libre : « Semaine 3 », « Avant juin », « S1 »
    status          text not null default 'todo'
                        check (status in ('todo', 'current', 'done')),
    position        integer not null default 0,
    completed_at    timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_tracker_milestones_tracker
    on public.tracker_milestones(tracker_id, position);
create index if not exists idx_tracker_milestones_user
    on public.tracker_milestones(user_id);

comment on table public.tracker_milestones is 'Jalons d''une fiche de suivi (ordonnés par position)';

-- ------------------------------------------------------------------
-- tracker_journal_entries : le journal de bord
-- ------------------------------------------------------------------
create table if not exists public.tracker_journal_entries (
    id              uuid primary key default gen_random_uuid(),
    tracker_id      uuid not null references public.project_trackers(id) on delete cascade,
    user_id         uuid not null references public.profiles(id) on delete cascade,
    body            text not null,
    entry_date      date not null default current_date,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_tracker_journal_tracker
    on public.tracker_journal_entries(tracker_id, entry_date desc);
create index if not exists idx_tracker_journal_user
    on public.tracker_journal_entries(user_id);

comment on table public.tracker_journal_entries is 'Journal de bord d''une fiche de suivi';

-- ------------------------------------------------------------------
-- Triggers updated_at (réutilise public.touch_updated_at de schema.sql)
-- ------------------------------------------------------------------
drop trigger if exists touch_project_trackers_updated on public.project_trackers;
create trigger touch_project_trackers_updated
    before update on public.project_trackers
    for each row execute procedure public.touch_updated_at();

drop trigger if exists touch_tracker_milestones_updated on public.tracker_milestones;
create trigger touch_tracker_milestones_updated
    before update on public.tracker_milestones
    for each row execute procedure public.touch_updated_at();

drop trigger if exists touch_tracker_journal_updated on public.tracker_journal_entries;
create trigger touch_tracker_journal_updated
    before update on public.tracker_journal_entries
    for each row execute procedure public.touch_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.project_trackers        enable row level security;
alter table public.tracker_milestones      enable row level security;
alter table public.tracker_journal_entries enable row level security;

-- ------------------------------------------------------------------
-- project_trackers
-- ------------------------------------------------------------------

-- SELECT : sa propre fiche OU admin (lecture seule côté équipe)
drop policy if exists "project_trackers_select_own_or_admin" on public.project_trackers;
create policy "project_trackers_select_own_or_admin" on public.project_trackers
    for select
    using (auth.uid() = user_id OR public.is_admin());

drop policy if exists "project_trackers_insert_own" on public.project_trackers;
create policy "project_trackers_insert_own" on public.project_trackers
    for insert
    with check (auth.uid() = user_id);

drop policy if exists "project_trackers_update_own" on public.project_trackers;
create policy "project_trackers_update_own" on public.project_trackers
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "project_trackers_delete_own" on public.project_trackers;
create policy "project_trackers_delete_own" on public.project_trackers
    for delete
    using (auth.uid() = user_id);

-- Pas de policy d'écriture admin : l'équipe lit, elle ne modifie pas la fiche
-- d'une apprenante à sa place.

-- ------------------------------------------------------------------
-- tracker_milestones
-- ------------------------------------------------------------------

drop policy if exists "tracker_milestones_select_own_or_admin" on public.tracker_milestones;
create policy "tracker_milestones_select_own_or_admin" on public.tracker_milestones
    for select
    using (auth.uid() = user_id OR public.is_admin());

-- INSERT : seulement dans SA propre fiche (double vérif user_id + propriété du tracker)
drop policy if exists "tracker_milestones_insert_own" on public.tracker_milestones;
create policy "tracker_milestones_insert_own" on public.tracker_milestones
    for insert
    with check (
        auth.uid() = user_id
        AND exists (
            select 1 from public.project_trackers t
            where t.id = tracker_milestones.tracker_id
              and t.user_id = auth.uid()
        )
    );

drop policy if exists "tracker_milestones_update_own" on public.tracker_milestones;
create policy "tracker_milestones_update_own" on public.tracker_milestones
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "tracker_milestones_delete_own" on public.tracker_milestones;
create policy "tracker_milestones_delete_own" on public.tracker_milestones
    for delete
    using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- tracker_journal_entries
-- ------------------------------------------------------------------

drop policy if exists "tracker_journal_select_own_or_admin" on public.tracker_journal_entries;
create policy "tracker_journal_select_own_or_admin" on public.tracker_journal_entries
    for select
    using (auth.uid() = user_id OR public.is_admin());

drop policy if exists "tracker_journal_insert_own" on public.tracker_journal_entries;
create policy "tracker_journal_insert_own" on public.tracker_journal_entries
    for insert
    with check (
        auth.uid() = user_id
        AND exists (
            select 1 from public.project_trackers t
            where t.id = tracker_journal_entries.tracker_id
              and t.user_id = auth.uid()
        )
    );

drop policy if exists "tracker_journal_update_own" on public.tracker_journal_entries;
create policy "tracker_journal_update_own" on public.tracker_journal_entries
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "tracker_journal_delete_own" on public.tracker_journal_entries;
create policy "tracker_journal_delete_own" on public.tracker_journal_entries
    for delete
    using (auth.uid() = user_id);

-- ============================================================================
-- ✅ Fiche de suivi installée.
-- Vérifier : Dashboard → Authentication → Policies → 12 nouvelles policies
-- sur project_trackers / tracker_milestones / tracker_journal_entries.
-- ============================================================================
