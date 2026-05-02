/* =============================================================================
   Cap Learning — Auth helpers (signUp / signIn / signOut / getUser / isAdmin)
   -----------------------------------------------------------------------------
   Charger APRÈS supabase-client.js.
   Expose : window.CapAuth

   API :
     CapAuth.signUp(email, password, { full_name, phone, country })
     CapAuth.signIn(email, password)
     CapAuth.signInWithMagicLink(email)
     CapAuth.signOut()
     CapAuth.getUser()        → Promise<auth.user | null>
     CapAuth.getProfile()     → Promise<profile | null>
     CapAuth.isAdmin()        → Promise<boolean>
     CapAuth.onAuthChange(fn) → unsubscribe()
     CapAuth.requireAuth()    → Promise<profile>  (throw si pas connecté)
     CapAuth.requireAdmin()   → Promise<profile>  (throw si pas admin)
   ============================================================================= */

(function () {
    'use strict';

    if (!window.CapDB) {
        console.error('[CapAuth] window.CapDB indisponible. Charge supabase-client.js avant auth.js.');
        return;
    }

    var db = window.CapDB;
    var listeners = [];
    var currentUser = null;
    var currentProfile = null;
    var ready = false;
    var readyPromise = null;

    // --------------------------------------------------------------
    // Internal helpers
    // --------------------------------------------------------------

    function notify() {
        listeners.forEach(function (fn) {
            try { fn(currentUser, currentProfile); } catch (e) { /* swallow */ }
        });
    }

    async function loadProfile() {
        var session = await db.auth.getSession();
        currentUser = (session.data && session.data.session && session.data.session.user) || null;

        if (!currentUser) {
            currentProfile = null;
            return null;
        }

        var p = await db
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (p.error) {
            console.warn('[CapAuth] Erreur lecture profile:', p.error.message);
            currentProfile = null;
        } else {
            currentProfile = p.data || null;
        }
        return currentProfile;
    }

    function ensureReady() {
        if (ready) return Promise.resolve();
        if (readyPromise) return readyPromise;
        readyPromise = loadProfile().then(function () {
            ready = true;
            notify();
        });
        return readyPromise;
    }

    // --------------------------------------------------------------
    // Public API
    // --------------------------------------------------------------

    async function signUp(email, password, metadata) {
        if (!email || !password) throw new Error('Email et mot de passe requis');
        if (password.length < 8) throw new Error('Mot de passe : 8 caractères minimum');

        var res = await db.auth.signUp({
            email: email.trim().toLowerCase(),
            password: password,
            options: {
                data: {
                    full_name: (metadata && metadata.full_name) || '',
                    phone:     (metadata && metadata.phone) || '',
                    country:   (metadata && metadata.country) || 'SN'
                },
                emailRedirectTo: (window.CapConfig && window.CapConfig.PUBLIC_BASE_URL)
                    ? window.CapConfig.PUBLIC_BASE_URL + '/pages/dashboard.html'
                    : window.location.origin + '/pages/dashboard.html'
            }
        });
        if (res.error) throw res.error;

        // Si l'auto-confirm email est désactivé en prod, l'user n'a pas encore de session
        if (res.data && res.data.session) {
            await loadProfile();
            notify();
        }
        return res.data;
    }

    async function signIn(email, password) {
        if (!email || !password) throw new Error('Email et mot de passe requis');
        var res = await db.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password: password
        });
        if (res.error) throw res.error;
        await loadProfile();
        notify();
        return res.data;
    }

    async function signInWithMagicLink(email) {
        if (!email) throw new Error('Email requis');
        var res = await db.auth.signInWithOtp({
            email: email.trim().toLowerCase(),
            options: {
                emailRedirectTo: (window.CapConfig && window.CapConfig.PUBLIC_BASE_URL)
                    ? window.CapConfig.PUBLIC_BASE_URL + '/pages/dashboard.html'
                    : window.location.origin + '/pages/dashboard.html'
            }
        });
        if (res.error) throw res.error;
        return res.data;
    }

    async function signOut() {
        var res = await db.auth.signOut();
        currentUser = null;
        currentProfile = null;
        notify();
        // Compat avec ancien système (clean les fake users localStorage)
        try { localStorage.removeItem('caplearning_user'); } catch (e) {}
        return res;
    }

    async function getUser() {
        await ensureReady();
        return currentUser;
    }

    async function getProfile() {
        await ensureReady();
        return currentProfile;
    }

    async function isAdmin() {
        var p = await getProfile();
        return !!(p && p.role === 'admin');
    }

    async function requireAuth() {
        var p = await getProfile();
        if (!p) {
            var err = new Error('Authentification requise');
            err.code = 'AUTH_REQUIRED';
            throw err;
        }
        return p;
    }

    async function requireAdmin() {
        var p = await requireAuth();
        if (p.role !== 'admin') {
            var err = new Error('Droits administrateur requis');
            err.code = 'ADMIN_REQUIRED';
            throw err;
        }
        return p;
    }

    function onAuthChange(fn) {
        if (typeof fn !== 'function') return function () {};
        listeners.push(fn);
        // Si déjà ready, appel immédiat avec l'état courant
        if (ready) {
            try { fn(currentUser, currentProfile); } catch (e) { /* swallow */ }
        }
        return function unsubscribe() {
            var i = listeners.indexOf(fn);
            if (i !== -1) listeners.splice(i, 1);
        };
    }

    async function updateMyProfile(patch) {
        await requireAuth();
        // Sécurité côté client : on ne laisse pas patcher 'role' ni 'id' ni 'email'
        var safe = {};
        ['full_name', 'phone', 'country', 'avatar_url'].forEach(function (k) {
            if (patch && Object.prototype.hasOwnProperty.call(patch, k)) safe[k] = patch[k];
        });
        var res = await db
            .from('profiles')
            .update(safe)
            .eq('id', currentUser.id)
            .select()
            .single();
        if (res.error) throw res.error;
        currentProfile = res.data;
        notify();
        return currentProfile;
    }

    // --------------------------------------------------------------
    // Init : sync session au chargement + écoute événements Supabase
    // --------------------------------------------------------------
    ensureReady();

    db.auth.onAuthStateChange(function (event, session) {
        // event = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED' | ...
        if (window.CapConfig && window.CapConfig.DEBUG) {
            console.info('[CapAuth] event:', event, 'hasSession:', !!(session && session.user));
        }
        var hasUser = !!(session && session.user);
        if (hasUser) {
            currentUser = session.user;
            loadProfile().then(notify);
        } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
            // Vraie déconnexion → on purge le cache
            currentUser = null;
            currentProfile = null;
            notify();
        }
        // INITIAL_SESSION sans session, TOKEN_REFRESHED transitoire, etc. : on ne touche
        // PAS au cache currentProfile pour éviter d'écraser un profil chargé en parallèle
        // par ensureReady() (sinon getProfile() peut renvoyer null à un appelant qui
        // arrive juste après → redirect intempestif).
    });

    window.CapAuth = {
        signUp: signUp,
        signIn: signIn,
        signInWithMagicLink: signInWithMagicLink,
        signOut: signOut,
        getUser: getUser,
        getProfile: getProfile,
        isAdmin: isAdmin,
        requireAuth: requireAuth,
        requireAdmin: requireAdmin,
        onAuthChange: onAuthChange,
        updateMyProfile: updateMyProfile,
        reload: function () { ready = false; readyPromise = null; return ensureReady(); }
    };
})();
