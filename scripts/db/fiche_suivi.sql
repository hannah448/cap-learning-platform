-- ============================================================================
-- Cap Learning — Fiche de suivi (v2 · sync multi-appareils)
-- ----------------------------------------------------------------------------
-- Crée la table `fiche_suivi` (une ligne par apprenant) + policies RLS.
--
-- À lancer APRÈS schema.sql et rls.sql.
-- Dashboard Supabase → SQL Editor → New query → coller ce fichier → Run.
-- Doit afficher "Success. No rows returned." en bas.
-- ============================================================================

-- ------------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------------
create table if not exists public.fiche_suivi (
    user_id     uuid primary key references public.profiles(id) on delete cascade,
    objective   text not null default '',
    jalons      jsonb not null default '[]'::jsonb,   -- [{id,title,week,status}]
    journal     jsonb not null default '[]'::jsonb,   -- [{id,date,text}]
    updated_at  timestamptz not null default now()
);

comment on table  public.fiche_suivi is 'Fiche de suivi personnelle de l''apprenant (objectif, jalons, journal)';
comment on column public.fiche_suivi.jalons  is 'Tableau JSON : [{id:string,title:string,week:string,status:"todo"|"current"|"done"}]';
comment on column public.fiche_suivi.journal is 'Tableau JSON : [{id:string,date:string,text:string}]';

-- Garde-fous : jalons et journal doivent être des tableaux JSON
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'fiche_suivi_jalons_check') then
        alter table public.fiche_suivi
            add constraint fiche_suivi_jalons_check check (jsonb_typeof(jalons) = 'array');
    end if;
    if not exists (select 1 from pg_constraint where conname = 'fiche_suivi_journal_check') then
        alter table public.fiche_suivi
            add constraint fiche_suivi_journal_check check (jsonb_typeof(journal) = 'array');
    end if;
end $$;

-- ------------------------------------------------------------------
-- 2. Trigger : bump updated_at à chaque UPDATE
-- ------------------------------------------------------------------
create or replace function public.fiche_suivi_touch() returns trigger
language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_fiche_suivi_touch on public.fiche_suivi;
create trigger trg_fiche_suivi_touch
    before update on public.fiche_suivi
    for each row execute function public.fiche_suivi_touch();

-- ------------------------------------------------------------------
-- 3. RLS : chaque user ne voit et ne modifie que SA fiche
-- ------------------------------------------------------------------
alter table public.fiche_suivi enable row level security;

drop policy if exists fs_self_read   on public.fiche_suivi;
drop policy if exists fs_self_insert on public.fiche_suivi;
drop policy if exists fs_self_update on public.fiche_suivi;
drop policy if exists fs_self_delete on public.fiche_suivi;

create policy fs_self_read on public.fiche_suivi for select
    using (auth.uid() = user_id);

create policy fs_self_insert on public.fiche_suivi for insert
    with check (auth.uid() = user_id);

create policy fs_self_update on public.fiche_suivi for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy fs_self_delete on public.fiche_suivi for delete
    using (auth.uid() = user_id);
