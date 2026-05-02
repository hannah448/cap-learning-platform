/* =============================================================================
   Cap Learning — Page guard (redirige les non-authentifiés)
   -----------------------------------------------------------------------------
   Charger APRÈS auth.js.

   Usage : ajouter un attribut sur <body> de la page à protéger.

     <body data-auth-required="true">    ← apprenant ou admin
     <body data-admin-required="true">   ← admin uniquement

   Sans attribut : page publique, aucun guard.

   Comportement :
     - Cache visuellement la page tant que la vérif n'est pas faite
       (via class .cap-guard-checking sur <html>)
     - Si non-connecté : sauvegarde l'URL demandée + redirige vers connexion
     - Si connecté mais pas admin (sur page admin) : redirige vers index
     - Si OK : retire le voile + dispatch CustomEvent('cap:auth-ready')
   ============================================================================= */

(function () {
    'use strict';

    var html = document.documentElement;
    var body = document.body;

    var requireAuth = body && body.getAttribute('data-auth-required') === 'true';
    var requireAdmin = body && body.getAttribute('data-admin-required') === 'true';

    // Si pas de guard demandé, on sort
    if (!requireAuth && !requireAdmin) return;

    // Ajoute un voile (CSS minimal inline pour éviter de dépendre d'un CSS)
    html.classList.add('cap-guard-checking');
    var style = document.createElement('style');
    style.textContent =
        'html.cap-guard-checking body { visibility: hidden; }' +
        'html.cap-guard-checking::before {' +
        '  content: "Vérification…";' +
        '  position: fixed; inset: 0;' +
        '  display: flex; align-items: center; justify-content: center;' +
        '  background: var(--color-bg, #fff);' +
        '  color: var(--color-text-soft, #666);' +
        '  font-family: -apple-system, sans-serif; font-size: 14px;' +
        '  z-index: 99999; visibility: visible;' +
        '}';
    document.head.appendChild(style);

    function buildPath(target) {
        // Détecte si on est à la racine ou dans pages/ ou docs/
        var path = window.location.pathname;
        var depth = 0;
        if (path.indexOf('/pages/') !== -1 || path.indexOf('/docs/') !== -1) depth = 1;
        var prefix = '';
        for (var i = 0; i < depth; i++) prefix += '../';
        if (target === 'login') return prefix + 'pages/connexion.html';
        if (target === 'home')  return prefix + 'index.html';
        return prefix + target;
    }

    function release() {
        html.classList.remove('cap-guard-checking');
        try {
            document.dispatchEvent(new CustomEvent('cap:auth-ready'));
        } catch (e) { /* legacy browsers */ }
    }

    function redirect(target) {
        // Mémorise l'URL demandée pour rediriger après login
        try {
            sessionStorage.setItem(
                'caplearning_redirect_after_login',
                window.location.pathname + window.location.search + window.location.hash
            );
        } catch (e) {}
        window.location.replace(buildPath(target));
    }

    async function waitForCapAuth(maxMs) {
        var start = Date.now();
        while (!window.CapAuth && Date.now() - start < maxMs) {
            await new Promise(function (r) { setTimeout(r, 30); });
        }
        return !!window.CapAuth;
    }

    async function check() {
        var ok = await waitForCapAuth(3000);
        if (!ok) {
            console.error('[CapGuard] CapAuth indisponible après 3s. Vérifie ' +
                'que js/config.js, js/supabase-client.js et js/auth.js sont chargés ' +
                'avant js/page-guard.js.');
            release();
            return;
        }

        try {
            var profile = await window.CapAuth.getProfile();
            if (!profile) {
                redirect('login');
                return;
            }
            if (requireAdmin && profile.role !== 'admin') {
                console.warn('[CapGuard] Accès refusé : page admin, role=' + profile.role);
                redirect('home');
                return;
            }
            // OK
            html.setAttribute('data-cap-authed', 'true');
            html.setAttribute('data-cap-role', profile.role);
            release();
        } catch (e) {
            console.error('[CapGuard] Erreur:', e);
            redirect('login');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', check);
    } else {
        check();
    }
})();
