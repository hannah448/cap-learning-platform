/* =============================================================================
   Cap Learning — Auth Modal (signup / login réutilisable)
   -----------------------------------------------------------------------------
   Modale qui s'ouvre par-dessus la page courante. 2 onglets :
     - Inscription (par défaut)
     - Connexion

   Charger APRÈS supabase-client.js + auth.js.
   Expose : window.AuthModal

   API :
     AuthModal.open({
         defaultTab: 'signup' | 'login',     // optionnel, défaut 'signup'
         title: 'Créez votre compte pour acheter',  // optionnel
         subtitle: 'Marketing Digital — 25 000 FCFA',  // optionnel
         onAuthSuccess: (profile) => {}     // callback après auth réussie
     })

   AuthModal.close()
   ============================================================================= */

(function () {
    'use strict';

    if (!window.CapAuth) {
        console.warn('[AuthModal] CapAuth indisponible. La modale ne s\'ouvrira pas.');
    }

    var modalEl = null;
    var currentOptions = null;

    // Liste UEMOA + CEMAC + France pour le select pays
    var COUNTRIES = [
        { code: 'SN', label: 'Sénégal' },
        { code: 'CI', label: "Côte d'Ivoire" },
        { code: 'BJ', label: 'Bénin' },
        { code: 'BF', label: 'Burkina Faso' },
        { code: 'ML', label: 'Mali' },
        { code: 'TG', label: 'Togo' },
        { code: 'NE', label: 'Niger' },
        { code: 'GW', label: 'Guinée-Bissau' },
        { code: 'CM', label: 'Cameroun' },
        { code: 'GA', label: 'Gabon' },
        { code: 'CG', label: 'Congo-Brazzaville' },
        { code: 'CD', label: 'RD Congo' },
        { code: 'TD', label: 'Tchad' },
        { code: 'CF', label: 'Centrafrique' },
        { code: 'GQ', label: 'Guinée équatoriale' },
        { code: 'MR', label: 'Mauritanie' },
        { code: 'GN', label: 'Guinée' },
        { code: 'MG', label: 'Madagascar' },
        { code: 'FR', label: 'France' },
        { code: 'OTHER', label: 'Autre pays' }
    ];

    // ----------------------------------------------------------------
    // CSS injecté une fois (utilise les tokens DS v1.3 quand disponibles)
    // ----------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('cap-auth-modal-styles')) return;
        var s = document.createElement('style');
        s.id = 'cap-auth-modal-styles';
        s.textContent = [
            '.cap-am-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.65); backdrop-filter: blur(4px); z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 20px; animation: capAmFade 0.2s ease; }',
            '.cap-am-modal { background: var(--color-surface, #fff); color: var(--color-text, #1c1917); border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); width: 100%; max-width: 460px; max-height: 92vh; overflow-y: auto; padding: 28px 28px 24px; position: relative; animation: capAmSlide 0.25s ease; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif; }',
            '.cap-am-close { position: absolute; top: 14px; right: 14px; width: 36px; height: 36px; border-radius: 50%; border: none; background: var(--color-surface-2, #f5f5f4); color: var(--color-text-soft, #57534e); cursor: pointer; font-size: 20px; line-height: 1; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }',
            '.cap-am-close:hover { background: var(--color-border, #e7e5e4); color: var(--color-text, #1c1917); }',
            '.cap-am-title { font-size: 22px; font-weight: 800; margin: 0 0 6px; letter-spacing: -0.02em; padding-right: 40px; }',
            '.cap-am-subtitle { font-size: 14px; color: var(--color-text-soft, #57534e); margin: 0 0 20px; }',
            '.cap-am-tabs { display: flex; gap: 4px; padding: 4px; background: var(--color-surface-2, #f5f5f4); border-radius: 12px; margin-bottom: 22px; }',
            '.cap-am-tab { flex: 1; padding: 10px 14px; border: none; background: transparent; color: var(--color-text-soft, #57534e); font-weight: 600; font-size: 14px; cursor: pointer; border-radius: 8px; transition: all 0.15s; }',
            '.cap-am-tab.active { background: var(--color-surface, #fff); color: var(--color-text, #1c1917); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }',
            '.cap-am-form { display: flex; flex-direction: column; gap: 14px; }',
            '.cap-am-form.cap-am-hidden { display: none; }',
            '.cap-am-row { display: flex; flex-direction: column; gap: 6px; }',
            '.cap-am-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }',
            '.cap-am-label { font-size: 13px; font-weight: 600; color: var(--color-text, #1c1917); }',
            '.cap-am-input { width: 100%; padding: 11px 14px; border: 1px solid var(--color-border, #e7e5e4); background: var(--color-surface, #fff); color: var(--color-text, #1c1917); border-radius: 10px; font-size: 14px; font-family: inherit; transition: border 0.15s, box-shadow 0.15s; }',
            '.cap-am-input:focus { outline: none; border-color: var(--accent-ia, #3460e5); box-shadow: 0 0 0 3px rgba(52,96,229,0.15); }',
            '.cap-am-input.cap-am-error { border-color: var(--accent-rs, #fb6e45); }',
            '.cap-am-submit { margin-top: 6px; padding: 13px 18px; background: var(--accent-ia, #3460e5); color: #fff; border: none; border-radius: 10px; font-weight: 700; font-size: 15px; cursor: pointer; transition: transform 0.1s, opacity 0.15s; }',
            '.cap-am-submit:hover:not(:disabled) { transform: translateY(-1px); }',
            '.cap-am-submit:disabled { opacity: 0.6; cursor: wait; }',
            '.cap-am-error-msg { padding: 10px 12px; background: var(--accent-rs-bg, #ffe0d6); color: var(--accent-rs-text, #7c2410); border-radius: 8px; font-size: 13px; line-height: 1.4; display: none; }',
            '.cap-am-error-msg.cap-am-visible { display: block; }',
            '.cap-am-success-msg { padding: 10px 12px; background: var(--accent-ent-bg, #ccfbf1); color: var(--accent-ent-text, #115e4f); border-radius: 8px; font-size: 13px; line-height: 1.4; display: none; }',
            '.cap-am-success-msg.cap-am-visible { display: block; }',
            '.cap-am-foot { margin-top: 16px; font-size: 12px; color: var(--color-text-mute, #a8a29e); text-align: center; line-height: 1.5; }',
            '.cap-am-foot a { color: var(--accent-ia, #3460e5); text-decoration: none; }',
            '.cap-am-foot a:hover { text-decoration: underline; }',
            '@keyframes capAmFade { from { opacity: 0; } to { opacity: 1; } }',
            '@keyframes capAmSlide { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }',
            '@media (prefers-reduced-motion: reduce) { .cap-am-overlay, .cap-am-modal { animation: none; } }'
        ].join('\n');
        document.head.appendChild(s);
    }

    // ----------------------------------------------------------------
    // Build DOM
    // ----------------------------------------------------------------
    function buildDom(opts) {
        var defaultTab = opts.defaultTab === 'login' ? 'login' : 'signup';
        var title = opts.title || (defaultTab === 'login' ? 'Connexion à Cap Learning' : 'Créez votre compte Cap Learning');
        var subtitle = opts.subtitle || '';

        var countriesOpts = COUNTRIES.map(function (c) {
            return '<option value="' + c.code + '"' + (c.code === 'SN' ? ' selected' : '') + '>' + c.label + '</option>';
        }).join('');

        var html = [
            '<div class="cap-am-overlay" data-cap-am-backdrop>',
            '  <div class="cap-am-modal" role="dialog" aria-modal="true" aria-labelledby="capAmTitle">',
            '    <button type="button" class="cap-am-close" aria-label="Fermer" data-cap-am-close>&times;</button>',
            '    <h2 id="capAmTitle" class="cap-am-title">' + escapeHtml(title) + '</h2>',
            (subtitle ? '    <p class="cap-am-subtitle">' + escapeHtml(subtitle) + '</p>' : ''),
            '    <div class="cap-am-tabs" role="tablist">',
            '      <button type="button" class="cap-am-tab' + (defaultTab === 'signup' ? ' active' : '') + '" data-cap-am-tab="signup">Créer un compte</button>',
            '      <button type="button" class="cap-am-tab' + (defaultTab === 'login' ? ' active' : '') + '" data-cap-am-tab="login">Se connecter</button>',
            '    </div>',
            '    <div class="cap-am-error-msg" data-cap-am-error></div>',
            '    <div class="cap-am-success-msg" data-cap-am-success></div>',
            // Signup form
            '    <form class="cap-am-form' + (defaultTab === 'signup' ? '' : ' cap-am-hidden') + '" data-cap-am-form="signup" novalidate>',
            '      <div class="cap-am-row">',
            '        <label class="cap-am-label" for="capAmSuName">Nom complet</label>',
            '        <input class="cap-am-input" type="text" id="capAmSuName" name="full_name" required autocomplete="name" placeholder="Ex : Aminata Diallo">',
            '      </div>',
            '      <div class="cap-am-row">',
            '        <label class="cap-am-label" for="capAmSuEmail">Email</label>',
            '        <input class="cap-am-input" type="email" id="capAmSuEmail" name="email" required autocomplete="email" placeholder="email@exemple.com">',
            '      </div>',
            '      <div class="cap-am-row-2">',
            '        <div class="cap-am-row">',
            '          <label class="cap-am-label" for="capAmSuPassword">Mot de passe</label>',
            '          <input class="cap-am-input" type="password" id="capAmSuPassword" name="password" required minlength="8" autocomplete="new-password" placeholder="8 caractères min.">',
            '        </div>',
            '        <div class="cap-am-row">',
            '          <label class="cap-am-label" for="capAmSuPhone">Téléphone</label>',
            '          <input class="cap-am-input" type="tel" id="capAmSuPhone" name="phone" autocomplete="tel" placeholder="+221 77 000 00 00">',
            '        </div>',
            '      </div>',
            '      <div class="cap-am-row">',
            '        <label class="cap-am-label" for="capAmSuCountry">Pays</label>',
            '        <select class="cap-am-input" id="capAmSuCountry" name="country" required>' + countriesOpts + '</select>',
            '      </div>',
            '      <button type="submit" class="cap-am-submit">Créer mon compte</button>',
            '      <p class="cap-am-foot">Déjà un compte ? <a href="#" data-cap-am-switch="login">Se connecter</a></p>',
            '    </form>',
            // Login form
            '    <form class="cap-am-form' + (defaultTab === 'login' ? '' : ' cap-am-hidden') + '" data-cap-am-form="login" novalidate>',
            '      <div class="cap-am-row">',
            '        <label class="cap-am-label" for="capAmLiEmail">Email</label>',
            '        <input class="cap-am-input" type="email" id="capAmLiEmail" name="email" required autocomplete="email" placeholder="email@exemple.com">',
            '      </div>',
            '      <div class="cap-am-row">',
            '        <label class="cap-am-label" for="capAmLiPassword">Mot de passe</label>',
            '        <input class="cap-am-input" type="password" id="capAmLiPassword" name="password" required autocomplete="current-password" placeholder="Votre mot de passe">',
            '      </div>',
            '      <button type="submit" class="cap-am-submit">Se connecter</button>',
            '      <p class="cap-am-foot">Pas encore de compte ? <a href="#" data-cap-am-switch="signup">Créer un compte</a></p>',
            '    </form>',
            '  </div>',
            '</div>'
        ].join('\n');

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        return wrapper.firstElementChild;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ----------------------------------------------------------------
    // UI helpers
    // ----------------------------------------------------------------
    function setError(msg) {
        var el = modalEl.querySelector('[data-cap-am-error]');
        if (!el) return;
        if (msg) {
            el.textContent = msg;
            el.classList.add('cap-am-visible');
        } else {
            el.textContent = '';
            el.classList.remove('cap-am-visible');
        }
    }

    function setSuccess(msg) {
        var el = modalEl.querySelector('[data-cap-am-success]');
        if (!el) return;
        if (msg) {
            el.textContent = msg;
            el.classList.add('cap-am-visible');
        } else {
            el.textContent = '';
            el.classList.remove('cap-am-visible');
        }
    }

    function setTab(tab) {
        var tabs = modalEl.querySelectorAll('[data-cap-am-tab]');
        tabs.forEach(function (t) {
            t.classList.toggle('active', t.dataset.capAmTab === tab);
        });
        var forms = modalEl.querySelectorAll('[data-cap-am-form]');
        forms.forEach(function (f) {
            f.classList.toggle('cap-am-hidden', f.dataset.capAmForm !== tab);
        });
        setError('');
        setSuccess('');
    }

    function setLoading(form, isLoading) {
        var btn = form.querySelector('.cap-am-submit');
        if (!btn) return;
        if (isLoading) {
            btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
            btn.textContent = '⏳ Patientez…';
            btn.disabled = true;
        } else {
            if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
            btn.disabled = false;
        }
    }

    function humanizeError(err) {
        var msg = (err && err.message) || '';
        if (/Invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.';
        if (/Email not confirmed/i.test(msg))       return 'Email non confirmé. Vérifie ta boîte mail.';
        if (/User already registered/i.test(msg))   return 'Un compte existe déjà avec cet email. Connecte-toi.';
        if (/at least 8/i.test(msg))                return 'Le mot de passe doit faire au moins 8 caractères.';
        if (/Password should/i.test(msg))           return 'Mot de passe trop faible.';
        if (/rate limit/i.test(msg))                return 'Trop de tentatives. Réessaie dans quelques minutes.';
        if (/Failed to fetch/i.test(msg))           return 'Connexion à Cap Learning échouée. Vérifie ta connexion internet.';
        return msg || 'Une erreur est survenue.';
    }

    // ----------------------------------------------------------------
    // Submit handlers
    // ----------------------------------------------------------------
    async function handleSignupSubmit(form) {
        setError('');
        var data = new FormData(form);
        var email = (data.get('email') || '').toString().trim();
        var password = (data.get('password') || '').toString();
        var fullName = (data.get('full_name') || '').toString().trim();
        var phone = (data.get('phone') || '').toString().trim();
        var country = (data.get('country') || 'SN').toString();

        if (!email || !password || !fullName) {
            setError('Veuillez remplir les champs obligatoires.');
            return;
        }
        if (password.length < 8) {
            setError('Le mot de passe doit faire au moins 8 caractères.');
            return;
        }

        setLoading(form, true);
        try {
            var res = await window.CapAuth.signUp(email, password, {
                full_name: fullName,
                phone: phone,
                country: country
            });
            if (res && res.session) {
                // Auto-confirm activé : connecté direct
                var profile = await window.CapAuth.getProfile();
                triggerSuccess(profile);
            } else {
                // Confirm email activé : il faut valider par email avant de pouvoir continuer
                setLoading(form, false);
                setSuccess('✅ Compte créé. Vérifie ta boîte mail pour confirmer puis reviens te connecter.');
                setTimeout(function () { setTab('login'); }, 3500);
            }
        } catch (err) {
            setLoading(form, false);
            setError(humanizeError(err));
        }
    }

    async function handleLoginSubmit(form) {
        setError('');
        var data = new FormData(form);
        var email = (data.get('email') || '').toString().trim();
        var password = (data.get('password') || '').toString();

        if (!email || !password) {
            setError('Veuillez remplir tous les champs.');
            return;
        }

        setLoading(form, true);
        try {
            await window.CapAuth.signIn(email, password);
            var profile = await window.CapAuth.getProfile();
            triggerSuccess(profile);
        } catch (err) {
            setLoading(form, false);
            setError(humanizeError(err));
        }
    }

    function triggerSuccess(profile) {
        // Notifie le caller AVANT de fermer pour qu'il puisse choisir s'il garde la modale
        var cb = currentOptions && currentOptions.onAuthSuccess;
        close();
        if (typeof cb === 'function') {
            try { cb(profile); } catch (e) { console.error('[AuthModal] onAuthSuccess error:', e); }
        }
    }

    // ----------------------------------------------------------------
    // Public API
    // ----------------------------------------------------------------
    function open(options) {
        options = options || {};
        currentOptions = options;
        injectStyles();

        // Si déjà connecté → court-circuit, on rappelle le callback direct
        if (window.CapAuth) {
            window.CapAuth.getProfile().then(function (profile) {
                if (profile && typeof options.onAuthSuccess === 'function') {
                    options.onAuthSuccess(profile);
                    return;
                }
                renderAndShow(options);
            }).catch(function () { renderAndShow(options); });
        } else {
            renderAndShow(options);
        }
    }

    function renderAndShow(options) {
        if (modalEl) close();
        modalEl = buildDom(options);
        document.body.appendChild(modalEl);
        document.body.style.overflow = 'hidden';

        // Bind events
        modalEl.querySelector('[data-cap-am-close]').addEventListener('click', close);
        modalEl.querySelector('[data-cap-am-backdrop]').addEventListener('click', function (e) {
            if (e.target === e.currentTarget) close();
        });

        modalEl.querySelectorAll('[data-cap-am-tab]').forEach(function (t) {
            t.addEventListener('click', function () { setTab(this.dataset.capAmTab); });
        });
        modalEl.querySelectorAll('[data-cap-am-switch]').forEach(function (a) {
            a.addEventListener('click', function (e) {
                e.preventDefault();
                setTab(this.dataset.capAmSwitch);
            });
        });

        var signupForm = modalEl.querySelector('[data-cap-am-form="signup"]');
        var loginForm = modalEl.querySelector('[data-cap-am-form="login"]');
        signupForm.addEventListener('submit', function (e) { e.preventDefault(); handleSignupSubmit(signupForm); });
        loginForm.addEventListener('submit', function (e) { e.preventDefault(); handleLoginSubmit(loginForm); });

        // Escape key to close
        document.addEventListener('keydown', escListener);

        // Focus first input
        setTimeout(function () {
            var first = modalEl.querySelector('.cap-am-form:not(.cap-am-hidden) .cap-am-input');
            if (first) first.focus();
        }, 100);
    }

    function escListener(e) {
        if (e.key === 'Escape') close();
    }

    function close() {
        if (modalEl) {
            modalEl.remove();
            modalEl = null;
        }
        document.body.style.overflow = '';
        document.removeEventListener('keydown', escListener);
        currentOptions = null;
    }

    window.AuthModal = {
        open: open,
        close: close
    };
})();
