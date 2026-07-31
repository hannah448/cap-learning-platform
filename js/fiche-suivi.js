/* Fiche de suivi — v1
   Stockage local (localStorage), pas de dépendance serveur.
   Clé : caplearning_fiche_suivi
   Structure : { objective: string, jalons: [{id, title, week, status}], journal: [{id, date, text}] }
*/
(function () {
    'use strict';

    const KEY = 'caplearning_fiche_suivi';
    const DEFAULT = {
        objective: '',
        jalons: [],
        journal: []
    };

    // --- helpers ---
    const $ = (s, root = document) => root.querySelector(s);
    const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const uid = () => Math.random().toString(36).slice(2, 10);
    const todayFR = () => {
        const d = new Date();
        return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    };

    // --- data layer ---
    function load() {
        try {
            const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
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
        } catch (e) { return { ...DEFAULT }; }
    }
    function save(state) {
        localStorage.setItem(KEY, JSON.stringify(state));
    }

    let state = load();

    // --- render ---
    function render() {
        renderObjective();
        renderJalons();
        renderJournal();
        renderProgress();
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

    // --- actions ---
    function editObjective() {
        const current = state.objective || '';
        const next = window.prompt('Votre objectif principal (ex : « Lancer ma boutique Shopify avant décembre »)', current);
        if (next === null) return;
        state.objective = next.trim();
        save(state); renderObjective();
    }

    function addJalon(form) {
        const title = form.querySelector('input[name=title]').value.trim();
        const week = form.querySelector('input[name=week]').value.trim();
        if (!title) return;
        state.jalons.push({ id: uid(), title, week, status: 'todo' });
        save(state); renderJalons(); renderProgress();
        form.reset();
        form.querySelector('input[name=title]').focus();
    }

    function cycleJalonStatus(id) {
        const j = state.jalons.find(x => x.id === id);
        if (!j) return;
        j.status = j.status === 'todo' ? 'current' : j.status === 'current' ? 'done' : 'todo';
        save(state); renderJalons(); renderProgress();
    }

    function deleteJalon(id) {
        if (!window.confirm('Supprimer ce jalon ?')) return;
        state.jalons = state.jalons.filter(j => j.id !== id);
        save(state); renderJalons(); renderProgress();
    }

    function addJournalEntry(form) {
        const text = form.querySelector('textarea[name=text]').value.trim();
        if (!text) return;
        state.journal.push({ id: uid(), date: todayFR(), text });
        save(state); renderJournal();
        form.reset();
    }

    function deleteJournalEntry(id) {
        if (!window.confirm('Supprimer cette entrée ?')) return;
        state.journal = state.journal.filter(e => e.id !== id);
        save(state); renderJournal();
    }

    // --- bindings ---
    document.addEventListener('DOMContentLoaded', () => {
        render();

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
