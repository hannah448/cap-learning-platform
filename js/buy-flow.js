/* =============================================================================
   Cap Learning — Buy flow (quick-buy depuis pages formation)
   -----------------------------------------------------------------------------
   Charger APRÈS auth.js + auth-modal.js sur toutes les pages formation-*.html.
   Expose : window.CapBuy

   Usage :
     CapBuy.handleBuyClick({
         courseDbId: 'ecommerce',
         courseLabel: 'E-commerce & Paiements Digitaux',
         priceXof: 99000
     });

   Ou via l'attribut data-cap-buy sur un bouton :
     <button data-cap-buy='{"courseDbId":"ecommerce","courseLabel":"...","priceXof":99000}'>
       Acheter — 99 000 FCFA →
     </button>

   Le bouton se câble automatiquement au DOMContentLoaded.
   ============================================================================= */

(function () {
    'use strict';

    /**
     * Construit l'URL CinetPay et y redirige.
     * Appelle GET /api/create-checkout?course=...&user_id=...
     * Le serveur Vercel valide user_id, récupère le profil, init CinetPay et
     * répond par une redirection (302) vers le payment_url.
     */
    function redirectToCheckout(courseDbId, userId) {
        if (!courseDbId || !userId) {
            console.error('[CapBuy] redirectToCheckout: courseDbId ou userId manquant');
            return;
        }
        var url = '/api/create-checkout?course=' + encodeURIComponent(courseDbId)
                + '&user_id=' + encodeURIComponent(userId);
        window.location.href = url;
    }

    /**
     * Entry point unique : "Acheter" depuis une page formation.
     * @param {object} opts
     * @param {string} opts.courseDbId   ('ecommerce'|'marketing'|'ia-business'|'reseaux-sociaux')
     * @param {string} opts.courseLabel  ex: "Marketing Digital Complet"
     * @param {number} opts.priceXof     ex: 89000
     */
    async function handleBuyClick(opts) {
        opts = opts || {};
        if (!opts.courseDbId) {
            console.error('[CapBuy] handleBuyClick: courseDbId requis');
            return;
        }

        // Attente que CapAuth soit prêt
        var tries = 0;
        while (!window.CapAuth && tries++ < 60) {
            await new Promise(function (r) { setTimeout(r, 30); });
        }

        // Si déjà connecté → checkout direct
        if (window.CapAuth) {
            try {
                var profile = await window.CapAuth.getProfile();
                if (profile) {
                    redirectToCheckout(opts.courseDbId, profile.id);
                    return;
                }
            } catch (e) { /* pas connecté */ }
        }

        // Pas connecté → ouverture modale
        if (!window.AuthModal) {
            // Fallback : redirect vers la page connexion classique avec intent
            sessionStorage.setItem('caplearning_redirect_after_login', window.location.pathname);
            sessionStorage.setItem('caplearning_pending_buy', JSON.stringify({
                courseDbId: opts.courseDbId,
                ts: Date.now()
            }));
            window.location.href = (window.location.pathname.indexOf('/pages/') !== -1 ? '' : 'pages/') + 'connexion.html';
            return;
        }

        var priceLabel = opts.priceXof
            ? (opts.priceXof.toLocaleString('fr-FR') + ' FCFA')
            : '';

        window.AuthModal.open({
            defaultTab: 'signup',
            title: 'Créez votre compte pour acheter',
            subtitle: opts.courseLabel
                ? (opts.courseLabel + (priceLabel ? ' — ' + priceLabel : ''))
                : 'Inscrivez-vous puis finalisez le paiement',
            onAuthSuccess: function (profile) {
                if (!profile || !profile.id) {
                    console.error('[CapBuy] onAuthSuccess: pas de profile.id');
                    return;
                }
                // L'utilisateur vient de signer / se connecter → checkout direct
                redirectToCheckout(opts.courseDbId, profile.id);
            }
        });
    }

    /**
     * Auto-binding : tout bouton avec [data-cap-buy='{...}'] se câble auto.
     */
    function autoBind() {
        var btns = document.querySelectorAll('[data-cap-buy]');
        btns.forEach(function (btn) {
            // Idempotence : un seul listener par bouton
            if (btn.__capBuyBound) return;
            btn.__capBuyBound = true;
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                var raw = btn.getAttribute('data-cap-buy');
                var opts;
                try { opts = JSON.parse(raw); }
                catch (err) {
                    console.error('[CapBuy] data-cap-buy invalide:', raw, err);
                    return;
                }
                handleBuyClick(opts);
            });
        });
    }

    // Si une session était en attente (cas Method3 fallback), on la consomme
    function consumePendingBuy() {
        var raw = sessionStorage.getItem('caplearning_pending_buy');
        if (!raw) return;
        try {
            var pending = JSON.parse(raw);
            // Expire après 10 min
            if (!pending.ts || Date.now() - pending.ts > 600000) {
                sessionStorage.removeItem('caplearning_pending_buy');
                return;
            }
            // Tente de récupérer la session pour voir si l'user est maintenant logged
            if (window.CapAuth) {
                window.CapAuth.getProfile().then(function (profile) {
                    if (profile && pending.courseDbId) {
                        sessionStorage.removeItem('caplearning_pending_buy');
                        redirectToCheckout(pending.courseDbId, profile.id);
                    }
                });
            }
        } catch (e) { sessionStorage.removeItem('caplearning_pending_buy'); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            autoBind();
            consumePendingBuy();
        });
    } else {
        autoBind();
        consumePendingBuy();
    }

    window.CapBuy = {
        handleBuyClick: handleBuyClick,
        redirectToCheckout: redirectToCheckout,
        autoBind: autoBind   // utile si la page injecte des boutons après load
    };
})();
