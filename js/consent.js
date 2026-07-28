/* =============================================================================
   Cap Learning — Bloc de consentement CGV + renonciation au droit de rétractation
   -----------------------------------------------------------------------------
   Composant partagé par les DEUX parcours d'achat :
     • quick-buy  (js/buy-flow.js, pages formation-*.html)
     • panier     (pages/panier.html, modale #checkout-overlay)

   Expose : window.CapConsent

   Règles juridiques appliquées ici (art. 1 et 10 des CGV) :
     1. DEUX cases distinctes, jamais fusionnées.
     2. Décochées par défaut, aucun pré-cochage possible.
     3. Bloquantes : le bouton de paiement reste inactif tant que les deux ne
        sont pas cochées.
     4. Texte lisible, cible tactile ≥ 44 px, formulation neutre.
     5. La preuve est enregistrée CÔTÉ SERVEUR (api/create-checkout.js) — ce
        module ne fait que recueillir, jamais stocker.

   ⚠️  VERSION doit rester synchronisée avec CGV_VERSION dans lib/cgv-consent.js
       et avec <meta name="cgv-version"> dans pages/cgv.html.

   API :
     CapConsent.VERSION              -> '2026-07-26'
     CapConsent.injectStyles()       -> injecte le CSS une seule fois
     CapConsent.mount(container, opts)
         opts.idPrefix   préfixe des id/for (défaut 'cap-consent')
         opts.cgvHref    lien vers les CGV (défaut '/cgv')
         opts.onChange   callback(isComplete) à chaque coche/décoche
         -> retourne un objet { isComplete, values, reset, showError, element }
   ============================================================================= */

(function () {
    'use strict';

    var VERSION = '2026-07-26';

    // ----------------------------------------------------------------
    // CSS — 100 % tokens du design system, aucune couleur en dur.
    // Fonctionne en thème clair et sombre via css/tokens.css.
    // ----------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('cap-consent-styles')) return;
        var s = document.createElement('style');
        s.id = 'cap-consent-styles';
        s.textContent = [
            '.cap-consent { display: flex; flex-direction: column; gap: 12px; margin: 20px 0; padding: 16px; border: 1px solid var(--color-border, #E7E5E4); border-radius: 12px; background: var(--color-surface-2, #F5F5F4); text-align: left; }',
            // Cible tactile confortable : le label entier est cliquable, hauteur min 44px.
            '.cap-consent-item { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; }',
            '.cap-consent-item input[type="checkbox"] { flex: 0 0 auto; width: 22px; height: 22px; margin: 0; accent-color: var(--accent-ia, #3460E5); cursor: pointer; }',
            '.cap-consent-item input[type="checkbox"]:focus-visible { outline: 2px solid var(--accent-ia, #3460E5); outline-offset: 3px; }',
            // 14px minimum + contraste plein : pas de gris clair sur blanc (anti dark pattern).
            '.cap-consent-item label { flex: 1; font-size: 14px; line-height: 1.5; color: var(--color-text, #1C1917); cursor: pointer; font-weight: 400; letter-spacing: 0; text-transform: none; margin: 0; }',
            '.cap-consent-item label a { color: var(--accent-ia, #3460E5); text-decoration: underline; font-weight: 600; }',
            // En thème sombre, --accent-ia sur --color-surface-2 ne dépasse pas 3:1.
            // --accent-ia-text (#B5C7FF) remonte le contraste au-dessus de 6:1.
            '[data-theme="dark"] .cap-consent-item label a { color: var(--accent-ia-text, #B5C7FF); }',
            '.cap-consent-item label a:focus-visible { outline: 2px solid var(--accent-ia, #3460E5); outline-offset: 2px; border-radius: 2px; }',
            '.cap-consent-error { display: none; font-size: 13px; line-height: 1.45; padding: 8px 10px; border-radius: 8px; background: var(--accent-rs-bg, #FFE0D6); color: var(--accent-rs-text, #7C2410); }',
            '.cap-consent-error.is-visible { display: block; }'
        ].join('\n');
        document.head.appendChild(s);
    }

    // Les deux formulations sont imposées par le brief juridique : ne pas les
    // reformuler sans repasser par une relecture des CGV.
    function buildHtml(idPrefix, cgvHref) {
        var idCgv = idPrefix + '-cgv';
        var idWaiver = idPrefix + '-waiver';
        var idError = idPrefix + '-error';

        return [
            '<div class="cap-consent" data-cap-consent>',
            '  <div class="cap-consent-item">',
            '    <input type="checkbox" id="' + idCgv + '" data-cap-consent-cgv aria-describedby="' + idError + '">',
            '    <label for="' + idCgv + '">J\'ai lu et j\'accepte les <a href="' + cgvHref + '" target="_blank" rel="noopener">Conditions générales de vente</a> de Cap Learning.</label>',
            '  </div>',
            '  <div class="cap-consent-item">',
            '    <input type="checkbox" id="' + idWaiver + '" data-cap-consent-waiver aria-describedby="' + idError + '">',
            '    <label for="' + idWaiver + '">Je demande à accéder immédiatement à ma formation et je renonce expressément à mon droit de rétractation de 14 jours. Je reste couvert par la garantie «&nbsp;satisfait ou remboursé&nbsp;» de 14 jours décrite à l\'article 9 des CGV.</label>',
            '  </div>',
            '  <p class="cap-consent-error" id="' + idError + '" role="alert" data-cap-consent-error></p>',
            '</div>'
        ].join('\n');
    }

    var ERROR_MESSAGE = 'Pour continuer, cochez les deux cases : acceptation des CGV et demande d\'accès immédiat.';

    /**
     * Injecte le bloc dans `container` et retourne son contrôleur.
     * Remplace tout contenu précédent du container (idempotent).
     */
    function mount(container, opts) {
        if (!container) throw new Error('[CapConsent] mount: container requis');
        opts = opts || {};
        injectStyles();

        var idPrefix = opts.idPrefix || 'cap-consent';
        var cgvHref = opts.cgvHref || '/cgv';

        container.innerHTML = buildHtml(idPrefix, cgvHref);

        var root = container.querySelector('[data-cap-consent]');
        var cgvBox = root.querySelector('[data-cap-consent-cgv]');
        var waiverBox = root.querySelector('[data-cap-consent-waiver]');
        var errorEl = root.querySelector('[data-cap-consent-error]');

        function isComplete() {
            return !!(cgvBox.checked && waiverBox.checked);
        }

        function showError(msg) {
            errorEl.textContent = msg || ERROR_MESSAGE;
            errorEl.classList.add('is-visible');
        }

        function clearError() {
            errorEl.textContent = '';
            errorEl.classList.remove('is-visible');
        }

        function handleChange() {
            if (isComplete()) clearError();
            if (typeof opts.onChange === 'function') {
                try { opts.onChange(isComplete()); }
                catch (e) { console.error('[CapConsent] onChange error:', e); }
            }
        }

        cgvBox.addEventListener('change', handleChange);
        waiverBox.addEventListener('change', handleChange);

        function reset() {
            // Décochage systématique : un abandon suivi d'une reprise ne doit
            // jamais conserver un consentement périmé.
            cgvBox.checked = false;
            waiverBox.checked = false;
            clearError();
            handleChange();
        }

        // État initial garanti décoché (défense contre un autofill navigateur).
        reset();

        return {
            element: root,
            isComplete: isComplete,
            showError: showError,
            clearError: clearError,
            reset: reset,
            /**
             * Payload à transmettre au serveur. La version des CGV vient d'ici,
             * mais le serveur ne fait JAMAIS confiance à cette valeur : il
             * réenregistre la sienne (cf. lib/cgv-consent.js).
             */
            values: function () {
                return {
                    cgv_accepted: cgvBox.checked,
                    withdrawal_waived: waiverBox.checked,
                    cgv_version: VERSION
                };
            }
        };
    }

    window.CapConsent = {
        VERSION: VERSION,
        ERROR_MESSAGE: ERROR_MESSAGE,
        injectStyles: injectStyles,
        mount: mount
    };
})();
