/* Fiche de suivi — v2
   Stockage : Supabase (table `fiche_suivi`) si user connecté, localStorage sinon.
   - Fetch initial : Supabase si dispo, fallback localStorage
   - Sync : chaque modif → upsert Supabase + miroir localStorage
   - Fallback offline : si erreur réseau, localStorage prend le relais
   Clé localStorage : caplearning_fiche_suivi
*/
(function () {
    'use strict';

    const KEY = 'caplearning_fiche_suivi';
    const TABLE = 'fiche_suivi';
    const DEFAULT = { objective: '', jalons: [], journal: [] };

    // --- helpers ---
    const $ = (s, root = document) => root.querySelector(s);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const uid = () => Math.random().toString(36).slice(2, 10);
    const todayFR = () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    let state = { ...DEFAULT };
    let currentUserId = null;   // uuid du user connecté (null = mode localStorage)
    let saving = false;         // évite les upserts concurrents
    let pendingSave = false;    // marque une modif en attente pendant un save en cours

    // --- normalisation ---
    function normalize(raw) {
        if (!raw) return { ...DEFAULT };
        return {
            objective: typeof raw.objective === 'string' ? raw.objective : '',
            jalons: Array.isArray(raw.jalons) ? raw.jalons.map(j => ({
                id: j.id || uid(),
                title: String(j.title || ''),
                week: String(j.week || ''),
                status: ['done', 'current', 'todo'].includes(j.status) ? j.status : 'todo'
            })) : [],
            journal: Array.isArray(raw.journal) ? raw.journal.map(e => ({
                id: e.id || uid(),
                date: String(e.date || ''),
                text: String(e.text || '')
            })) : []
        };
    }

    // --- data layer : localStorage (miroir + fallback) ---
    function loadLocal() {
        try { return normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); }
        catch (e) { return { ...DEFAULT }; }
    }
    function saveLocal() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { /* quota — on ignore */ }
    }

    // --- data layer : Supabase ---
    async function whoami() {
        if (!window.CapDB) return null;
        try {
            const { data } = await window.CapDB.auth.getSession();
            return data?.session?.user?.id || null;
        } catch (e) { return null; }
    }
    async function loadRemote(userId) {
        const { data, error } = await window.CapDB
            .from(TABLE)
            .select('objective, jalons, journal')
            .eq('user_id', userId)
            .maybeSingle();
        if (error) throw error;
        return data ? normalize(data) : { ...DEFAULT };
    }
    async function saveRemote() {
        if (!currentUserId || !window.CapDB) return;
        if (saving) { pendingSave = true; return; }
        saving = true;
        try {
            const { error } = await window.CapDB
                .from(TABLE)
                .upsert({
                    user_id: currentUserId,
                    objective: state.objective,
                    jalons: state.jalons,
                    journal: state.journal
                }, { onConflict: 'user_id' });
            if (error) throw error;
            setSyncStatus('ok');
        } catch (e) {
            console.warn('[fiche-suivi] save Supabase KO, fallback localStorage', e);
            setSyncStatus('local');
        } finally {
            saving = false;
            if (pendingSave) { pendingSave = false; saveRemote(); }
        }
    }

    // --- persist : appelle localStorage TOUJOURS + Supabase si connecté ---
    function persist() {
        saveLocal();
        if (currentUserId) saveRemote();
    }

    // --- render ---
    function render() {
        renderObjective(); renderJalons(); renderJournal(); renderProgress();
    }
    function renderObjective() {
        const el = $('#fs-objective-text');
        if (!el) return;
        el.textContent = state.objective || 'Aucun objectif défini. Cliquez sur « Modifier » pour ajouter le vôtre.';
        el.classList.toggle('is-empty', !state.objective);
    }
    function renderJalons() {
        const ul = $('#fs-jalons');
        if (!ul) return;
        if (!state.jalons.length) {
            ul.innerHTML = '<li class="fs-empty">Aucun jalon. Ajoutez votre premier jalon ci-dessous.</li>';
            return;
        }
        ul.innerHTML = state.jalons.map(j => `
            <li class="dash-jalon ${j.status === 'done' ? 'done' : j.status === 'current' ? 'current' : ''}" data-id="${esc(j.id)}">
                <button class="dash-jalon-check" type="button" title="Changer le statut" aria-label="Statut du jalon">${j.status === 'done' ? '✓' : j.status === 'current' ? '●' : ''}</button>
                <span class="dash-jalon-title">${esc(j.title)}</span>
                <span class="dash-jalon-date">${esc(j.week)}</span>
                <button class="fs-jalon-del" type="button" title="Supprimer" aria-label="Supprimer ce jalon">✕</button>
            </li>
        `).join('');
    }
    function renderJournal() {
        const wrap = $('#fs-journal-list');
        if (!wrap) return;
        if (!state.journal.length) {
            wrap.innerHTML = '<p class="fs-empty">Aucune entrée. Notez ci-dessus vos blocages, réussites et prochains pas.</p>';
            return;
        }
        wrap.innerHTML = state.journal.slice().reverse().map(e => `
            <div class="dash-journal-entry" data-id="${esc(e.id)}">
                <div class="dash-journal-entry-date">${esc(e.date)}</div>
                <div class="dash-journal-entry-text">${esc(e.text)}</div>
                <button class="fs-entry-del" type="button" title="Supprimer" aria-label="Supprimer cette entrée">✕</button>
            </div>
        `).join('');
    }
    function renderProgress() {
        const total = state.jalons.length;
        const done = state.jalons.filter(j => j.status === 'done').length;
        const label = $('#fs-progress-label');
        const bar = $('#fs-progress-fill');
        if (label) label.textContent = total ? `${done} sur ${total} jalons complétés` : 'Aucun jalon défini';
        if (bar) bar.style.width = total ? Math.round((done / total) * 100) + '%' : '0%';
    }

    // --- statut sync (badge visuel) ---
    function setSyncStatus(kind) {
        const el = $('#fs-sync-status');
        if (!el) return;
        const map = {
            loading: { txt: '⏳ Chargement…', cls: 'is-loading' },
            ok:      { txt: '☁️ Synchronisé', cls: 'is-ok' },
            local:   { txt: '📱 Sur cet appareil', cls: 'is-local' },
        };
        const m = map[kind] || map.local;
        el.textContent = m.txt;
        el.className = 'fs-sync-status ' + m.cls;
    }

    // --- actions ---
    function editObjective() {
        const next = window.prompt('Votre objectif principal (ex : « Lancer ma boutique Shopify avant décembre »)', state.objective || '');
        if (next === null) return;
        state.objective = next.trim();
        renderObjective(); persist();
    }
    function addJalon(form) {
        const title = form.querySelector('input[name=title]').value.trim();
        const week = form.querySelector('input[name=week]').value.trim();
        if (!title) return;
        state.jalons.push({ id: uid(), title, week, status: 'todo' });
        renderJalons(); renderProgress(); persist();
        form.reset();
        form.querySelector('input[name=title]').focus();
    }
    function cycleJalonStatus(id) {
        const j = state.jalons.find(x => x.id === id);
        if (!j) return;
        j.status = j.status === 'todo' ? 'current' : j.status === 'current' ? 'done' : 'todo';
        renderJalons(); renderProgress(); persist();
    }
    function deleteJalon(id) {
        if (!window.confirm('Supprimer ce jalon ?')) return;
        state.jalons = state.jalons.filter(j => j.id !== id);
        renderJalons(); renderProgress(); persist();
    }
    function addJournalEntry(form) {
        const text = form.querySelector('textarea[name=text]').value.trim();
        if (!text) return;
        state.journal.push({ id: uid(), date: todayFR(), text });
        renderJournal(); persist();
        form.reset();
    }
    function deleteJournalEntry(id) {
        if (!window.confirm('Supprimer cette entrée ?')) return;
        state.journal = state.journal.filter(e => e.id !== id);
        renderJournal(); persist();
    }

    // --- init ---
    async function init() {
        setSyncStatus('loading');
        // Chargement optimiste depuis localStorage
        state = loadLocal();
        render();

        // Vérifie si user connecté et récupère la version cloud
        currentUserId = await whoami();
        if (!currentUserId) {
            setSyncStatus('local');
            return;
        }
        try {
            const remote = await loadRemote(currentUserId);
            // Fusion simple : si le cloud a des données, il l'emporte ; sinon on garde le local et on push
            const cloudHasContent = remote.objective || remote.jalons.length || remote.journal.length;
            if (cloudHasContent) {
                state = remote;
                saveLocal();
                render();
                setSyncStatus('ok');
            } else if (state.objective || state.jalons.length || state.journal.length) {
                // local avec contenu → on push vers le cloud
                await saveRemote();
            } else {
                setSyncStatus('ok');
            }
        } catch (e) {
            console.warn('[fiche-suivi] load Supabase KO, mode local', e);
            setSyncStatus('local');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        init();
        $('#fs-edit-objective')?.addEventListener('click', editObjective);
        $('#fs-add-jalon-form')?.addEventListener('submit', (e) => { e.preventDefault(); addJalon(e.target); });
        $('#fs-add-journal-form')?.addEventListener('submit', (e) => { e.preventDefault(); addJournalEntry(e.target); });
        $('#fs-jalons')?.addEventListener('click', (e) => {
            const li = e.target.closest('.dash-jalon');
            if (!li) return;
            const id = li.dataset.id;
            if (e.target.classList.contains('dash-jalon-check')) cycleJalonStatus(id);
            else if (e.target.classList.contains('fs-jalon-del')) deleteJalon(id);
        });
        $('#fs-journal-list')?.addEventListener('click', (e) => {
            if (!e.target.classList.contains('fs-entry-del')) return;
            const entry = e.target.closest('.dash-journal-entry');
            if (entry) deleteJournalEntry(entry.dataset.id);
        });
    });
})();
