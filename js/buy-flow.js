/* =============================================================================
   Cap Learning — Buy flow (quick-buy depuis pages formation)
   -----------------------------------------------------------------------------
   Charger APRÈS auth.js + auth-modal.js + consent.js sur toutes les pages
   formation-*.html.
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

   Enchaînement :
     clic « Acheter »
       → (si non connecté) modale auth
       → écran de consentement (CGV + renonciation à la rétractation)
       → POST auto-soumis vers /api/create-checkout
       → 302 vers la page de paiement

   L'écran de consentement vient TOUJOURS après l'authentification : recueilli
   avant, il serait perdu au retour de la page connexion.
   ============================================================================= */

(function () {
    'use strict';

    var CHECKOUT_ENDPOINT = '/api/create-checkout';

    // ----------------------------------------------------------------
    // CSS de la modale de confirmation (même pattern que js/auth-modal.js).
    // Uniquement des tokens du design system → OK en thème clair et sombre.
    // ----------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('cap-buy-modal-styles')) return;
        var s = document.createElement('style');
        s.id = 'cap-buy-modal-styles';
        s.textContent = [
            '.cap-bf-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.65); backdrop-filter: blur(4px); z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 20px; animation: capBfFade 0.2s ease; }',
            '.cap-bf-modal { background: var(--color-surface, #fff); color: var(--color-text, #1c1917); border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); width: 100%; max-width: 480px; max-height: 92vh; overflow-y: auto; padding: 28px 28px 24px; position: relative; animation: capBfSlide 0.25s ease; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif; }',
            '.cap-bf-close { position: absolute; top: 14px; right: 14px; width: 36px; height: 36px; border-radius: 50%; border: none; background: var(--color-surface-2, #f5f5f4); color: var(--color-text-soft, #57534e); cursor: pointer; font-size: 20px; line-height: 1; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }',
            '.cap-bf-close:hover { background: var(--color-border, #e7e5e4); color: var(--color-text, #1c1917); }',
            '.cap-bf-close:focus-visible { outline: 2px solid var(--accent-ia, #3460e5); outline-offset: 2px; }',
            '.cap-bf-title { font-size: 22px; font-weight: 800; margin: 0 0 16px; letter-spacing: -0.02em; padding-right: 40px; }',
            '.cap-bf-recap { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 14px 16px; border-radius: 12px; background: var(--color-surface-2, #f5f5f4); border: 1px solid var(--color-border, #e7e5e4); }',
            '.cap-bf-recap-label { font-size: 14px; font-weight: 600; color: var(--color-text, #1c1917); }',
            '.cap-bf-recap-price { font-size: 18px; font-weight: 800; white-space: nowrap; color: var(--color-text, #1c1917); }',
            '.cap-bf-submit { width: 100%; padding: 14px 18px; background: var(--accent-ia, #3460e5); color: #fff; border: none; border-radius: 10px; font-weight: 700; font-size: 15px; cursor: pointer; transition: transform 0.1s, opacity 0.15s; }',
            '.cap-bf-submit:hover:not(:disabled) { transform: translateY(-1px); }',
            '.cap-bf-submit:focus-visible { outline: 2px solid var(--accent-ia, #3460e5); outline-offset: 3px; }',
            // Désactivé : opacité + not-allowed, mais le bouton reste focusable et
            // cliquable pour pouvoir afficher le message d'erreur (pas de cul-de-sac).
            '.cap-bf-submit[aria-disabled="true"] { opacity: 0.55; cursor: not-allowed; }',
            '.cap-bf-cancel { width: 100%; margin-top: 10px; padding: 11px 18px; background: none; border: none; color: var(--color-text-soft, #57534e); font-size: 14px; font-family: inherit; cursor: pointer; border-radius: 8px; }',
            '.cap-bf-cancel:hover { color: var(--color-text, #1c1917); text-decoration: underline; }',
            '.cap-bf-cancel:focus-visible { outline: 2px solid var(--accent-ia, #3460e5); outline-offset: 2px; }',
            '.cap-bf-secure { text-align: center; font-size: 12px; color: var(--color-text-soft, #57534e); margin: 14px 0 0; }',
            '@keyframes capBfFade { from { opacity: 0; } to { opacity: 1; } }',
            '@keyframes capBfSlide { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }',
            '@media (prefers-reduced-motion: reduce) { .cap-bf-overlay, .cap-bf-modal { animation: none; } }'
        ].join('\n');
        document.head.appendChild(s);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /**
     * Toutes les pages sont servies à la racine : /cgv, quelle que soit la page
     * courante. (La réécriture Vercel les sert depuis pages/ sans le montrer.)
     */
    function cgvHref() {
        return '/cgv';
    }

    // ----------------------------------------------------------------
    // Modale de consentement
    // ----------------------------------------------------------------
    var modalEl = null;
    var lastFocusedEl = null;

    function closeConsentModal() {
        if (modalEl) {
            modalEl.remove();
            modalEl = null;
        }
        document.body.style.overflow = '';
        document.removeEventListener('keydown', onKeydown);
        if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
            lastFocusedEl.focus();
        }
        lastFocusedEl = null;
    }

    function onKeydown(e) {
        if (!modalEl) return;
        if (e.key === 'Escape') {
            closeConsentModal();
            return;
        }
        if (e.key !== 'Tab') return;

        // Piège à focus : le parcours clavier ne doit pas sortir de la modale.
        var focusables = modalEl.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    /**
     * Affiche l'écran de consentement puis, après validation, lance le paiement.
     * @param {object} opts   { courseDbId, courseLabel, priceXof }
     * @param {string} userId uuid du profil authentifié
     */
    function openConsentModal(opts, userId) {
        if (!window.CapConsent) {
            // Sans le composant de consentement, on ne peut pas recueillir
            // l'accord : on refuse de partir en paiement plutôt que de vendre
            // sans consentement valable.
            console.error('[CapBuy] CapConsent indisponible — chargez js/consent.js avant js/buy-flow.js.');
            alert('Le formulaire de commande n\'a pas pu se charger. Rechargez la page et réessayez.');
            return;
        }

        injectStyles();
        if (modalEl) closeConsentModal();
        lastFocusedEl = document.activeElement;

        var priceLabel = opts.priceXof
            ? (opts.priceXof.toLocaleString('fr-FR') + ' FCFA')
            : '';

        var html = [
            '<div class="cap-bf-overlay" data-cap-bf-backdrop>',
            '  <div class="cap-bf-modal" role="dialog" aria-modal="true" aria-labelledby="capBfTitle">',
            '    <button type="button" class="cap-bf-close" aria-label="Fermer" data-cap-bf-close>&times;</button>',
            '    <h2 id="capBfTitle" class="cap-bf-title">Confirmer votre commande</h2>',
            '    <div class="cap-bf-recap">',
            '      <span class="cap-bf-recap-label">' + escapeHtml(opts.courseLabel || 'Formation Cap Learning') + '</span>',
            (priceLabel ? '      <span class="cap-bf-recap-price">' + escapeHtml(priceLabel) + '</span>' : ''),
            '    </div>',
            '    <div data-cap-bf-consent></div>',
            '    <button type="button" class="cap-bf-submit" data-cap-bf-submit aria-disabled="true">',
            (priceLabel ? '🔒 Payer ' + escapeHtml(priceLabel) : '🔒 Payer'),
            '    </button>',
            '    <button type="button" class="cap-bf-cancel" data-cap-bf-cancel>Annuler</button>',
            '    <p class="cap-bf-secure">🔒 Paiement sécurisé — vous allez être redirigé vers notre prestataire.</p>',
            '  </div>',
            '</div>'
        ].join('\n');

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        modalEl = wrapper.firstElementChild;
        document.body.appendChild(modalEl);
        document.body.style.overflow = 'hidden';

        var submitBtn = modalEl.querySelector('[data-cap-bf-submit]');

        var consent = window.CapConsent.mount(
            modalEl.querySelector('[data-cap-bf-consent]'),
            {
                idPrefix: 'cap-bf-consent',
                cgvHref: cgvHref(),
                onChange: function (isComplete) {
                    submitBtn.setAttribute('aria-disabled', isComplete ? 'false' : 'true');
                }
            }
        );

        modalEl.querySelector('[data-cap-bf-close]').addEventListener('click', closeConsentModal);
        modalEl.querySelector('[data-cap-bf-cancel]').addEventListener('click', closeConsentModal);
        // modalEl EST l'overlay : querySelector ne cherche que les descendants,
        // on écoute donc directement dessus.
        modalEl.addEventListener('click', function (e) {
            if (e.target === e.currentTarget) closeConsentModal();
        });

        submitBtn.addEventListener('click', function () {
            if (!consent.isComplete()) {
                consent.showError();
                return;
            }
            submitBtn.setAttribute('aria-disabled', 'true');
            submitBtn.textContent = '⏳ Redirection…';
            submitToCheckout(opts.courseDbId, userId, consent.values());
        });

        document.addEventListener('keydown', onKeydown);

        // Focus sur la première case : le parcours est réalisable au clavier seul.
        setTimeout(function () {
            var firstBox = modalEl.querySelector('input[type="checkbox"]');
            if (firstBox) firstBox.focus();
        }, 100);
    }

    /**
     * Envoie la commande en POST via un formulaire auto-soumis.
     * Le serveur répond 302 vers la page de paiement, que le navigateur suit.
     *
     * POST et pas GET : un consentement en query string finirait dans les logs
     * d'accès et les en-têtes Referer.
     */
    function submitToCheckout(courseDbId, userId, consentValues) {
        if (!courseDbId || !userId) {
            console.error('[CapBuy] submitToCheckout: courseDbId ou userId manquant');
            return;
        }

        var fields = {
            course: courseDbId,
            user_id: userId,
            cgv_accepted: consentValues.cgv_accepted ? '1' : '0',
            withdrawal_waived: consentValues.withdrawal_waived ? '1' : '0',
            cgv_version: consentValues.cgv_version,
            redirect: '1'
        };

        var form = document.createElement('form');
        form.method = 'POST';
        form.action = CHECKOUT_ENDPOINT;
        form.style.display = 'none';

        Object.keys(fields).forEach(function (name) {
            var input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = fields[name];
            form.appendChild(input);
        });

        document.body.appendChild(form);
        form.submit();
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

        // Si déjà connecté → écran de consentement direct.
        // Le try n'entoure QUE getProfile : une erreur d'affichage du
        // consentement ne doit pas être confondue avec « non connecté » et
        // faire retomber l'utilisateur sur la modale d'inscription.
        var profile = null;
        if (window.CapAuth) {
            try {
                profile = await window.CapAuth.getProfile();
            } catch (e) { /* pas connecté */ }
        }
        if (profile && profile.id) {
            openConsentModal(opts, profile.id);
            return;
        }

        // Pas connecté → ouverture modale d'authentification
        if (!window.AuthModal) {
            // Fallback : redirect vers la page connexion classique avec intent.
            // On ne mémorise QUE l'intention d'achat, jamais un consentement :
            // il sera recueilli au retour, sur l'écran dédié.
            sessionStorage.setItem('caplearning_redirect_after_login', window.location.pathname);
            sessionStorage.setItem('caplearning_pending_buy', JSON.stringify({
                courseDbId: opts.courseDbId,
                courseLabel: opts.courseLabel || '',
                priceXof: opts.priceXof || 0,
                ts: Date.now()
            }));
            window.location.href = '/connexion';
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
                // Connecté → consentement, PUIS paiement.
                openConsentModal(opts, profile.id);
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

    // Si une intention d'achat était en attente (fallback page connexion), on la
    // consomme au retour → écran de consentement, jamais de paiement direct.
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
                        openConsentModal({
                            courseDbId: pending.courseDbId,
                            courseLabel: pending.courseLabel,
                            priceXof: pending.priceXof
                        }, profile.id);
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
        autoBind: autoBind   // utile si la page injecte des boutons après load
    };
})();
