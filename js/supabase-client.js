/* =============================================================================
   Cap Learning — Supabase client (singleton)
   -----------------------------------------------------------------------------
   Charge ce script APRÈS :
     1. <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     2. <script src="js/config.js"></script>

   Et AVANT auth.js, db.js, page-guard.js.

   Expose : window.CapDB (instance Supabase)
   ============================================================================= */

(function () {
    'use strict';

    if (!window.supabase) {
        console.error('[Cap Learning] Manque la lib @supabase/supabase-js. Ajoute :\n' +
            '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
        return;
    }

    if (!window.CapConfig || !window.CapConfig.SUPABASE_URL || !window.CapConfig.SUPABASE_ANON_KEY) {
        console.error('[Cap Learning] Manque js/config.js (ou config invalide). ' +
            'Copie config.js.example en config.js et remplis tes valeurs Supabase.');
        return;
    }

    var url = window.CapConfig.SUPABASE_URL;
    var key = window.CapConfig.SUPABASE_ANON_KEY;

    // Sanity check : pas le service_role par erreur ?
    if (key.indexOf('service_role') !== -1) {
        console.error('[Cap Learning] ⚠️ ATTENTION : SUPABASE_ANON_KEY contient "service_role". ' +
            'Tu as collé la mauvaise key. Utilise "anon public" depuis Settings → API.');
        return;
    }

    window.CapDB = window.supabase.createClient(url, key, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: window.localStorage,
            storageKey: 'caplearning_supabase_auth'
        }
    });

    if (window.CapConfig.DEBUG) {
        console.info('[Cap Learning] Supabase client ready', { url: url });
    }
})();
