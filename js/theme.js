/* ============================================================================
   Cap Learning — Theme controller (light/dark/system)
   ----------------------------------------------------------------------------
   Expose window.CapTheme avec :
     CapTheme.get()                  → 'light' | 'dark' | 'system'
     CapTheme.getResolved()          → 'light' | 'dark' (résout 'system')
     CapTheme.set('light'|'dark'|'system')
     CapTheme.toggle()               → bascule light ↔ dark
     CapTheme.subscribe(fn)          → callback à chaque changement

   Persistance : localStorage.caplearning_theme
   Anti-flash : déjà géré par le <script> inline dans <head> de chaque page,
                ce fichier prend le relais une fois le DOM prêt.
   ========================================================================= */

(function () {
    'use strict';

    var STORAGE_KEY = 'caplearning_theme';
    var VALID_THEMES = ['light', 'dark', 'system'];
    var listeners = [];
    var mediaQuery = null;

    function read() {
        try {
            var v = localStorage.getItem(STORAGE_KEY);
            return VALID_THEMES.indexOf(v) !== -1 ? v : 'system';
        } catch (e) {
            return 'system';
        }
    }

    function write(theme) {
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (e) {
            // Storage indispo (mode privé Safari, par ex.) — fallback en mémoire seulement
        }
    }

    function resolve(theme) {
        if (theme === 'system') {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
            return 'light';
        }
        return theme === 'dark' ? 'dark' : 'light';
    }

    function apply(theme) {
        var resolved = resolve(theme);
        document.documentElement.setAttribute('data-theme', resolved);
        // Notifier les listeners
        listeners.forEach(function (fn) {
            try { fn(resolved, theme); } catch (e) { /* swallow */ }
        });
    }

    function set(theme) {
        if (VALID_THEMES.indexOf(theme) === -1) theme = 'system';
        write(theme);
        apply(theme);
    }

    function toggle() {
        // Toggle simple : light ↔ dark (ignore 'system' pour aller direct)
        var current = resolve(read());
        set(current === 'dark' ? 'light' : 'dark');
    }

    function subscribe(fn) {
        if (typeof fn === 'function') listeners.push(fn);
        return function unsubscribe() {
            var i = listeners.indexOf(fn);
            if (i !== -1) listeners.splice(i, 1);
        };
    }

    // Si l'utilisateur a 'system' choisi, suivre les changements OS en live
    function bindMediaQuery() {
        if (!window.matchMedia) return;
        mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        var handler = function () {
            if (read() === 'system') apply('system');
        };
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handler);
        } else if (mediaQuery.addListener) {
            // Safari ≤14
            mediaQuery.addListener(handler);
        }
    }

    // Re-applique le thème au chargement (au cas où l'anti-flash n'aurait pas tourné)
    apply(read());
    bindMediaQuery();

    // API publique
    window.CapTheme = {
        get: read,
        getResolved: function () { return resolve(read()); },
        set: set,
        toggle: toggle,
        subscribe: subscribe
    };
})();
