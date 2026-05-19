/* =============================================================================
   Cap Learning — Frontend config (Supabase)
   -----------------------------------------------------------------------------
   Copie ce fichier en config.js et remplis avec tes vraies valeurs.

   Trouve-les dans : Supabase Dashboard → Settings → API
   - Project URL    → SUPABASE_URL
   - anon public    → SUPABASE_ANON_KEY

   ⚠️ NE COMMIT JAMAIS config.js (déjà dans .gitignore).
   La anon key est faite pour être publique côté client (la sécurité vient des
   policies RLS au niveau Postgres). Ne JAMAIS mettre service_role ici.
   ============================================================================= */

window.CapConfig = {
    SUPABASE_URL:       'https://hqdcaighricsqeqcaezk.supabase.co',
    SUPABASE_ANON_KEY:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxZGNhaWdocmljc3FlcWNhZXprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MDU0MDksImV4cCI6MjA5MzI4MTQwOX0.SZT_JlxVluM5vQqLOEod_MZwm95GD6FeHEPnz8M6JEg',

    // Optionnel : domaine public pour les redirects auth
    PUBLIC_BASE_URL:    'https://cap-learning.com',

    // Mode dev/prod (true = logs verbeux dans la console)
    DEBUG:              true
};
