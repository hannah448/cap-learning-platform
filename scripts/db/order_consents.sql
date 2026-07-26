-- ============================================================================
-- Cap Learning — Migration : table order_consents
-- ----------------------------------------------------------------------------
-- À lancer dans le SQL Editor de Supabase, APRÈS schema.sql et rls.sql :
--   Dashboard → SQL Editor → New query → coller ce fichier → Run
--
-- ⚠️ OBLIGATOIRE AVANT LE DÉPLOIEMENT de api/create-checkout.js : tant que
--    cette table n'existe pas, toute création de commande échoue volontairement
--    (on refuse d'encaisser un paiement dont le consentement n'est pas tracé).
--
-- Objet : conserver la preuve, exigée par l'article L221-13 du Code de la
-- consommation, que le client a (1) accepté les CGV et (2) demandé l'accès
-- immédiat en renonçant expressément à son droit de rétractation de 14 jours
-- (article L221-28, 13°).
--
-- Un consentement est une PREUVE, pas une donnée applicative :
--   • aucune policy UPDATE, aucune policy DELETE — la ligne est immuable ;
--   • pas de cascade à la suppression d'un profil : on anonymise l'identifiant
--     plutôt que de perdre la trace de la transaction.
-- ============================================================================

create table if not exists public.order_consents (
    id                  uuid primary key default gen_random_uuid(),

    -- on delete set null : si le profil disparaît (RGPD, suppression de compte),
    -- l'identifiant est anonymisé mais la preuve de la commande subsiste.
    user_id             uuid references public.profiles(id) on delete set null,

    transaction_id      text not null unique,
    course_id           text,

    cgv_accepted        boolean not null,
    cgv_version         text not null,
    withdrawal_waived   boolean not null,

    ip                  inet,
    user_agent          text,
    created_at          timestamptz not null default now(),

    -- Une ligne ne peut exister que si les deux consentements sont vrais :
    -- filet de sécurité en base si un futur appelant oubliait le contrôle applicatif.
    constraint order_consents_both_required
        check (cgv_accepted is true and withdrawal_waived is true)
);

create index if not exists idx_order_consents_user       on public.order_consents(user_id);
create index if not exists idx_order_consents_created_at on public.order_consents(created_at);

comment on table  public.order_consents is
    'Preuve horodatée du consentement CGV et de la renonciation au droit de rétractation, par transaction. Immuable : ni UPDATE ni DELETE.';
comment on column public.order_consents.cgv_version is
    'Version des CGV affichée au client au moment du consentement (cf. CGV_VERSION dans lib/cgv-consent.js).';
comment on column public.order_consents.user_id is
    'Mis à NULL si le profil est supprimé — la preuve de la transaction est conservée, l''identifiant est anonymisé.';

-- ====================================================================
-- RLS — même style que les tables existantes (cf. rls.sql)
-- ====================================================================

alter table public.order_consents enable row level security;

-- SELECT : son propre consentement OU admin.
-- (Le serveur écrit avec service_role_key, qui bypass RLS.)
create policy "order_consents_select_own_or_admin" on public.order_consents
    for select
    using (auth.uid() = user_id OR public.is_admin());

-- INSERT : réservé au service role (aucune policy INSERT côté client).
-- UPDATE : aucune policy — une preuve ne se modifie pas.
-- DELETE : aucune policy — une preuve ne se supprime pas, même par un admin.

-- ============================================================================
-- ✅ Table créée. Vérifier sur Dashboard → Authentication → Policies
--    qu'une seule policy (SELECT) est listée pour order_consents.
-- ============================================================================
