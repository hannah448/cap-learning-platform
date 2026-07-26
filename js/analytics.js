/* =============================================================================
   Cap Learning — Analytics (Vercel Web Analytics)
   -----------------------------------------------------------------------------
   Charge Vercel Web Analytics sans dépendance ni bandeau cookies (pas de
   cookie, données agrégées côté Vercel).
   Prérequis : dashboard Vercel → onglet "Analytics" → Enable Web Analytics.

   Expose :
     window.capTrack(eventName, props?)  → événement custom
     window.capPage()                    → refresh manuel du pageview
                                            (utile pour SPA-style navigation)
   ============================================================================= */

(function () {
    'use strict';

    // Shim officiel Vercel : file d'attente en attendant que le script Vercel
    // soit chargé (via /_vercel/insights/script.js déclaré plus bas).
    window.va = window.va || function () {
        (window.vaq = window.vaq || []).push(arguments);
    };

    // Injecte le script Vercel Analytics une seule fois
    if (!document.querySelector('script[data-cap-analytics]')) {
        var s = document.createElement('script');
        s.defer = true;
        s.src = '/_vercel/insights/script.js';
        s.setAttribute('data-cap-analytics', '');
        document.head.appendChild(s);
    }

    /**
     * Envoie un événement custom.
     * @param {string} name  ex: "annuaire_view", "annuaire_search"
     * @param {object} [props]  { key: value }
     */
    window.capTrack = function (name, props) {
        try {
            window.va('event', { name: String(name), data: props || {} });
        } catch (e) { /* silencieux */ }
    };

    /** Force un pageview supplémentaire (rare — la vue initiale est auto) */
    window.capPage = function () {
        try { window.va('pageview'); } catch (e) { /* silencieux */ }
    };
})();
