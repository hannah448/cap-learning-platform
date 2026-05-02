-- ============================================================================
-- Cap Learning — Row Level Security (RLS) policies
-- ----------------------------------------------------------------------------
-- À lancer APRÈS schema.sql.
-- Active RLS sur toutes les tables et définit qui peut lire/écrire quoi
-- depuis le client (frontend HTML/JS avec anon_key).
--
-- Règles globales :
--   • Un apprenant lit/écrit SES propres données (profil, progression)
--   • Les enrollments sont créés UNIQUEMENT par le serveur (webhook CinetPay
--     avec service_role_key) — les clients ne peuvent ni insert ni update
--   • Les admins lisent/modifient tout (mais ne peuvent pas s'auto-promouvoir)
-- ============================================================================

-- Active RLS sur toutes les tables
alter table public.profiles         enable row level security;
alter table public.enrollments      enable row level security;
alter table public.lesson_progress  enable row level security;
alter table public.certificates     enable row level security;

-- ============================================================
-- Helper : retourne true si le user authentifié courant est admin
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin'
    );
$$;

-- ====================================================================
-- profiles
-- ====================================================================

-- SELECT : son propre profil OU admin voit tout
create policy "profiles_select_own_or_admin" on public.profiles
    for select
    using (auth.uid() = id OR public.is_admin());

-- UPDATE : son propre profil, MAIS pas le champ "role" (anti auto-promotion)
create policy "profiles_update_own_no_role_change" on public.profiles
    for update
    using (auth.uid() = id)
    with check (
        auth.uid() = id
        AND role = (select role from public.profiles where id = auth.uid())
    );

-- UPDATE pour admin : tout
create policy "profiles_update_admin" on public.profiles
    for update
    using (public.is_admin())
    with check (public.is_admin());

-- INSERT : aucune (créé par trigger handle_new_user)
-- DELETE : aucune (cascadé via auth.users)

-- ====================================================================
-- enrollments
-- ====================================================================

-- SELECT : son propre enrollment OU admin
create policy "enrollments_select_own_or_admin" on public.enrollments
    for select
    using (auth.uid() = user_id OR public.is_admin());

-- INSERT/UPDATE/DELETE : SEULEMENT admin via dashboard
-- (Le webhook CinetPay utilisera service_role_key qui bypass RLS)
create policy "enrollments_admin_all" on public.enrollments
    for all
    using (public.is_admin())
    with check (public.is_admin());

-- ====================================================================
-- lesson_progress
-- ====================================================================

-- SELECT : son propre progress OU admin
create policy "lesson_progress_select_own_or_admin" on public.lesson_progress
    for select
    using (auth.uid() = user_id OR public.is_admin());

-- INSERT : son propre progress, MAIS uniquement si enrollment "active" pour ce course
create policy "lesson_progress_insert_with_enrollment" on public.lesson_progress
    for insert
    with check (
        auth.uid() = user_id
        AND exists (
            select 1 from public.enrollments
            where user_id = auth.uid()
              and course_id = lesson_progress.course_id
              and status in ('active', 'completed')
        )
    );

-- UPDATE : son propre progress
create policy "lesson_progress_update_own" on public.lesson_progress
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- DELETE : son propre progress (utile reset)
create policy "lesson_progress_delete_own" on public.lesson_progress
    for delete
    using (auth.uid() = user_id);

-- Admin peut tout faire en plus
create policy "lesson_progress_admin_all" on public.lesson_progress
    for all
    using (public.is_admin())
    with check (public.is_admin());

-- ====================================================================
-- certificates
-- ====================================================================

-- SELECT : son propre certificat OU admin
create policy "certificates_select_own_or_admin" on public.certificates
    for select
    using (auth.uid() = user_id OR public.is_admin());

-- INSERT/UPDATE/DELETE : admin uniquement (création auto via webhook = service_role)
create policy "certificates_admin_all" on public.certificates
    for all
    using (public.is_admin())
    with check (public.is_admin());

-- ====================================================================
-- enrollment_progress_summary (vue) hérite des RLS des tables sources
-- ====================================================================

-- ============================================================================
-- ✅ Policies créées.
-- Vérifier sur Dashboard → Authentication → Policies que tout est listé.
-- ============================================================================
