-- ============================================================================
-- Cap Learning — Schema initial Supabase
-- ----------------------------------------------------------------------------
-- À lancer dans le SQL Editor de Supabase :
--   Dashboard → SQL Editor → New query → coller ce fichier → Run
--
-- ⚠️ À lancer AVANT rls.sql (qui doit être lancé juste après).
-- ============================================================================

-- ------------------------------------------------------------------
-- profiles : extension de auth.users (1-1 par user authentifié)
-- ------------------------------------------------------------------
create table public.profiles (
    id          uuid references auth.users on delete cascade primary key,
    email       text unique not null,
    full_name   text,
    phone       text,
    country     text,                -- 'SN' | 'CI' | 'BJ' | 'CM' | 'FR' etc.
    role        text not null default 'apprenant'
                check (role in ('apprenant', 'admin')),
    avatar_url  text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Profils étendus des users authentifiés Cap Learning';
comment on column public.profiles.role is 'apprenant (defaut) ou admin (modifiable uniquement via service_role)';

-- ------------------------------------------------------------------
-- Trigger auto-création de profile à chaque signup
-- ------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name, phone, country)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'phone',
        coalesce(new.raw_user_meta_data->>'country', 'SN')
    );
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------------
-- enrollments : 1 user × 1 formation = 1 achat payé
-- ------------------------------------------------------------------
create table public.enrollments (
    id                          uuid primary key default gen_random_uuid(),
    user_id                     uuid not null references public.profiles(id) on delete cascade,
    course_id                   text not null,
        -- 'ecommerce' | 'ia-business' | 'marketing' | 'entrepreneuriat' | 'reseaux-sociaux'
    status                      text not null default 'pending'
                                    check (status in ('pending', 'active', 'completed', 'refunded')),
    cinetpay_transaction_id     text unique,
    pennylane_invoice_id        text,
    amount_xof                  integer,
    currency                    text default 'XOF',
    payment_method              text,                -- 'wave' | 'orange-money' | 'mtn' | 'card' | 'free-money' | 'moov'
    enrolled_at                 timestamptz not null default now(),
    completed_at                timestamptz,
    refunded_at                 timestamptz,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now(),
    constraint unique_user_course unique (user_id, course_id)
);

create index idx_enrollments_user_id on public.enrollments(user_id);
create index idx_enrollments_course_id on public.enrollments(course_id);
create index idx_enrollments_status on public.enrollments(status);

comment on table public.enrollments is 'Inscriptions payées : un user accède à une formation';

-- ------------------------------------------------------------------
-- lesson_progress : progression vidéo par leçon
-- ------------------------------------------------------------------
create table public.lesson_progress (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.profiles(id) on delete cascade,
    course_id       text not null,
    lesson_id       text not null,
        -- ex: 'ecom-s1-1', 'ia-n3-2', 'mkt-bonus-7'
    progress_pct    real not null default 0
                        check (progress_pct >= 0 and progress_pct <= 1),
    completed       boolean not null default false,
    last_watched_at timestamptz not null default now(),
    completed_at    timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint unique_user_lesson unique (user_id, lesson_id)
);

create index idx_lesson_progress_user on public.lesson_progress(user_id);
create index idx_lesson_progress_user_course on public.lesson_progress(user_id, course_id);

comment on table public.lesson_progress is 'Progression vidéo par leçon : 1 ligne par (user × leçon vue)';

-- ------------------------------------------------------------------
-- certificates : certificats émis quand course completed
-- ------------------------------------------------------------------
create table public.certificates (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid not null references public.profiles(id) on delete cascade,
    course_id           text not null,
    issued_at           timestamptz not null default now(),
    pdf_url             text,
    verification_code   text unique not null default substring(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    created_at          timestamptz not null default now()
);

create index idx_certificates_user on public.certificates(user_id);
create index idx_certificates_verif on public.certificates(verification_code);

comment on table public.certificates is 'Certificats Cap Learning : 1 par user × course terminé';

-- ------------------------------------------------------------------
-- Trigger touch_updated_at (auto-update du champ updated_at)
-- ------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger touch_profiles_updated
    before update on public.profiles
    for each row execute procedure public.touch_updated_at();

create trigger touch_enrollments_updated
    before update on public.enrollments
    for each row execute procedure public.touch_updated_at();

create trigger touch_lesson_progress_updated
    before update on public.lesson_progress
    for each row execute procedure public.touch_updated_at();

-- ------------------------------------------------------------------
-- Vue pratique : résumé progression par enrollment (utile dashboard)
-- ------------------------------------------------------------------
create or replace view public.enrollment_progress_summary as
select
    e.id                            as enrollment_id,
    e.user_id,
    e.course_id,
    e.status,
    e.enrolled_at,
    count(distinct lp.lesson_id)            as lessons_started,
    count(distinct lp.lesson_id) filter (where lp.completed) as lessons_completed,
    coalesce(avg(lp.progress_pct), 0)       as avg_progress_pct,
    max(lp.last_watched_at)                 as last_activity_at
from public.enrollments e
left join public.lesson_progress lp
    on lp.user_id = e.user_id and lp.course_id = e.course_id
group by e.id, e.user_id, e.course_id, e.status, e.enrolled_at;

comment on view public.enrollment_progress_summary is 'Résumé progression par inscription pour dashboard';

-- ============================================================================
-- ✅ Schema créé. Lance maintenant rls.sql.
-- ============================================================================
