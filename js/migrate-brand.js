/* ============================================
   Cap Learning — Brand migration (one-shot)
   Rename legacy localStorage keys afrilearn_* → caplearning_*
   Safe to load on every page. Runs once per browser,
   guarded by caplearning_migrated_v1 flag.
   ============================================ */
(function migrateAfriLearnToCapLearning() {
    try {
        if (typeof localStorage === 'undefined') return;
        if (localStorage.getItem('caplearning_migrated_v1') === '1') return;

        var moved = 0;
        var keysToRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (!k || k.indexOf('afrilearn_') !== 0) continue;
            var newKey = 'caplearning_' + k.slice('afrilearn_'.length);
            // Do not overwrite if the new key already has a (fresher) value
            if (localStorage.getItem(newKey) === null) {
                localStorage.setItem(newKey, localStorage.getItem(k));
                moved++;
            }
            keysToRemove.push(k);
        }
        keysToRemove.forEach(function (k) { localStorage.removeItem(k); });

        localStorage.setItem('caplearning_migrated_v1', '1');
        if (moved > 0 && window.console) {
            console.info('[Cap Learning] Migrated ' + moved + ' legacy key(s) from afrilearn_* to caplearning_*');
        }
    } catch (e) {
        // Storage may be disabled (private mode, quota, etc.) — fail silently
    }
})();
