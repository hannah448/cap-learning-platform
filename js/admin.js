/* ================================================================
 * Cap Learning — Admin Panel Controller
 * Rend et gère : dashboard, liste apprenants, assignation formations,
 * création/suppression. Utilise AdminData (admin-data.js) comme backend.
 * ================================================================ */
(function () {
    'use strict';

    const D = window.AdminData;
    if (!D) { console.error('AdminData manquant'); return; }

    // Garde admin
    const session = D.requireAdmin();
    if (!session) return;

    // ----- Refs DOM
    const el = (id) => document.getElementById(id);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    // ----- Utilitaires
    const fmtFCFA = (n) => (n || 0).toLocaleString('fr-FR') + ' FCFA';
    const fmtDate = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d)) return '—';
        const now = new Date();
        const diff = Math.floor((now - d) / 86400000);
        if (diff === 0) return 'Aujourd\'hui';
        if (diff === 1) return 'Hier';
        if (diff < 7) return `Il y a ${diff}j`;
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    };
    const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'
    })[c]);
    const toast = (msg, isError) => {
        const t = el('toast');
        const m = el('toast-message');
        if (!t || !m) return;
        m.textContent = msg;
        t.classList.toggle('toast-error', !!isError);
        t.hidden = false;
        clearTimeout(toast._t);
        toast._t = setTimeout(() => { t.hidden = true; }, 3200);
    };

    // ----- Bootstrap UI
    function renderSessionInfo() {
        const admin = D.getUserByEmail(session.email) || {};
        el('adminAvatar').textContent = admin.avatar || 'AD';
        el('adminName').textContent = admin.name || session.name || 'Administrateur';
        el('adminEmail').textContent = admin.email || session.email;
        if (el('setting-email')) el('setting-email').textContent = admin.email || '—';
        if (el('setting-name'))  el('setting-name').textContent = admin.name || '—';
        if (el('setting-created')) el('setting-created').textContent = fmtDate(admin.createdAt);
    }

    // ----- Dashboard
    function renderDashboard() {
        const s = D.getStats();
        el('stat-learners').textContent = s.totalLearners;
        el('stat-enrollments').textContent = s.activeEnrollments;
        el('stat-revenue').textContent = fmtFCFA(s.totalRevenue);
        el('stat-progress').textContent = s.avgProgress + '%';
        if (el('stat-certified')) el('stat-certified').textContent = s.certified || 0;

        // Dernières inscriptions
        const recent = D.getEnrollments()
            .slice()
            .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt))
            .slice(0, 5);
        el('recentEnrollments').innerHTML = recent.map(e => {
            const u = D.getUser(e.userId);
            const c = D.getCourse(e.courseId);
            if (!u || !c) return '';
            const assignedLabel = e.assignedBy === 'self-purchase'
                ? '<span class="admin-tag admin-tag-success">Achat direct</span>'
                : '<span class="admin-tag admin-tag-info">Attribué par admin</span>';
            return `
                <div class="admin-recent-item">
                    <div class="admin-recent-avatar">${escapeHtml(u.avatar)}</div>
                    <div class="admin-recent-info">
                        <div><strong>${escapeHtml(u.name)}</strong> &middot; ${escapeHtml(c.name)}</div>
                        <div class="admin-recent-meta">${fmtDate(e.assignedAt)} &middot; ${assignedLabel}</div>
                    </div>
                </div>`;
        }).join('') || '<p class="admin-empty-small">Aucune inscription pour le moment.</p>';

        // Apprenants par formation : compte unique + répartition active / certifiée / archivée
        const enrollments = D.getEnrollments();
        const byCourse = {};
        enrollments.forEach(e => {
            const cid = e.courseId;
            if (!byCourse[cid]) byCourse[cid] = { users: new Set(), active: 0, certified: 0, archived: 0 };
            byCourse[cid].users.add(e.userId);
            if (e.certified) byCourse[cid].certified++;
            else if (e.status === 'archived') byCourse[cid].archived++;
            else byCourse[cid].active++;
        });

        const rows = D.getCatalog().map(c => {
            const b = byCourse[c.id] || { users: new Set(), active: 0, certified: 0, archived: 0 };
            return {
                course: c,
                learners: b.users.size,
                active: b.active,
                certified: b.certified,
                archived: b.archived
            };
        }).sort((a, b) => b.learners - a.learners);

        const maxLearners = rows[0] ? Math.max(1, rows[0].learners) : 1;
        el('popularCourses').innerHTML = rows.map(({ course, learners, active, certified, archived }) => {
            const parts = [];
            if (active)    parts.push(`<span class="admin-popular-tag admin-popular-tag-active">${active} actif${active > 1 ? 's' : ''}</span>`);
            if (certified) parts.push(`<span class="admin-popular-tag admin-popular-tag-cert">&#127942; ${certified}</span>`);
            if (archived)  parts.push(`<span class="admin-popular-tag admin-popular-tag-archived">${archived} archivé${archived > 1 ? 's' : ''}</span>`);
            if (!parts.length) parts.push('<span class="admin-popular-tag admin-popular-tag-empty">Aucun apprenant</span>');
            return `
                <div class="admin-popular-item">
                    <div class="admin-popular-main">
                        <div class="admin-popular-name">${escapeHtml(course.name)}</div>
                        <div class="admin-popular-tags">${parts.join('')}</div>
                    </div>
                    <div class="admin-popular-bar-wrap">
                        <div class="admin-popular-bar" style="width: ${Math.round((learners / maxLearners) * 100)}%"></div>
                    </div>
                    <div class="admin-popular-count" title="Apprenants uniques">${learners}</div>
                </div>
            `;
        }).join('') || '<p class="admin-empty-small">Pas encore de données.</p>';
    }

    // ----- Liste apprenants
    function renderLearners(filter) {
        const q = (filter || '').toLowerCase().trim();
        const learners = D.getUsers()
            .filter(u => u.role !== 'admin')
            .filter(u => !q || [u.name, u.email, u.country, u.phone].some(v => (v || '').toLowerCase().includes(q)))
            .sort((a, b) => new Date(b.lastLogin || 0) - new Date(a.lastLogin || 0));

        const tbody = el('learnersTableBody');
        const empty = el('learnersEmpty');
        if (learners.length === 0) {
            tbody.innerHTML = '';
            empty.hidden = false;
            return;
        }
        empty.hidden = true;

        tbody.innerHTML = learners.map(u => {
            const enrolls = D.getUserEnrollments(u.id);
            const avgProgress = enrolls.length
                ? Math.round(enrolls.reduce((s, e) => s + e.progress, 0) / enrolls.length)
                : 0;
            const lastAct = enrolls.reduce((max, e) => {
                const d = e.lastActivity ? new Date(e.lastActivity) : null;
                return d && (!max || d > max) ? d : max;
            }, null);

            const coursePills = enrolls.slice(0, 3).map(e => {
                const c = D.getCourse(e.courseId);
                if (!c) return '';
                const short = c.name.length > 28 ? c.name.substring(0, 28) + '…' : c.name;
                return `<span class="admin-course-pill" title="${escapeHtml(c.name)} (${e.progress}%)">${escapeHtml(short)}</span>`;
            }).join('');
            const more = enrolls.length > 3 ? `<span class="admin-course-pill admin-course-pill-more">+${enrolls.length - 3}</span>` : '';

            // Certifications
            const certified = enrolls.filter(e => e.certified);
            const certCell = certified.length
                ? `<span class="admin-cert-chip" title="${certified.map(e => {
                        const c = D.getCourse(e.courseId);
                        return c ? `${c.name} — ${e.grade}/20` : '';
                    }).join('\n')}">
                        <span class="admin-cert-chip-icon">&#127942;</span>
                        <strong>${certified.length}</strong>
                        <span class="admin-cert-chip-sep">·</span>
                        <span>${Math.round(certified.reduce((s, e) => s + (e.grade || 0), 0) / certified.length * 10) / 10}/20</span>
                    </span>`
                : '<span class="admin-empty-small">—</span>';

            return `
                <tr data-user-id="${u.id}">
                    <td>
                        <div class="admin-user-cell">
                            <div class="admin-user-cell-avatar">${escapeHtml(u.avatar)}</div>
                            <div>
                                <div class="admin-user-cell-name">${escapeHtml(u.name)}</div>
                                <div class="admin-user-cell-email">${escapeHtml(u.email)}</div>
                            </div>
                        </div>
                    </td>
                    <td>${escapeHtml(u.country || '—')}</td>
                    <td>
                        <div class="admin-course-pills">
                            ${coursePills || '<span class="admin-empty-small">Aucune</span>'}
                            ${more}
                        </div>
                    </td>
                    <td>
                        <div class="admin-progress-cell">
                            <div class="admin-progress-bar"><div class="admin-progress-fill" style="width:${avgProgress}%"></div></div>
                            <span class="admin-progress-text">${avgProgress}%</span>
                        </div>
                    </td>
                    <td>${certCell}</td>
                    <td>${lastAct ? fmtDate(lastAct.toISOString()) : '—'}</td>
                    <td class="admin-actions-cell">
                        <button class="btn btn-ghost btn-sm" data-action="details" data-user="${u.id}">Gérer</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ----- Helpers exercices
    const EXERCISE_TYPES = {
        quiz:       { label: 'QCM',             icon: '&#10067;' },  // ❓
        true_false: { label: 'Vrai / Faux',     icon: '&#9989;' },   // ✅
        matching:   { label: 'Association',     icon: '&#128279;' }, // 🔗
        fill_blank: { label: 'Texte à trous',   icon: '&#9997;' },   // ✏️
        open:       { label: 'Question ouverte',icon: '&#128221;' }, // 📝
        exam:       { label: 'Examen final',    icon: '&#127891;' }  // 🎓
    };
    const scoreClass = (pct) => pct >= 80 ? 'admin-score-great'
                            : pct >= 60 ? 'admin-score-ok'
                            : 'admin-score-low';

    function renderExerciseResults(enrollment) {
        const results = enrollment.exerciseResults || [];
        if (results.length === 0) {
            return '<p class="admin-empty-small">Aucun exercice complété pour le moment.</p>';
        }
        // Regroupe par module pour la lisibilité
        const byModule = {};
        results.forEach(r => {
            const k = r.module || 'Divers';
            (byModule[k] = byModule[k] || []).push(r);
        });
        const totalCorrect = results.reduce((s, r) => s + r.correct, 0);
        const totalMax = results.reduce((s, r) => s + r.total, 0);
        const avgScore = totalMax ? Math.round((totalCorrect / totalMax) * 100) : 0;

        const groupsHtml = Object.entries(byModule).map(([mod, rows]) => `
            <div class="admin-exercise-group">
                <div class="admin-exercise-group-title">${escapeHtml(mod)}</div>
                ${rows.map(r => {
                    const type = EXERCISE_TYPES[r.type] || { label: r.type, icon: '&#10067;' };
                    return `
                        <div class="admin-exercise-row">
                            <div class="admin-exercise-icon">${type.icon}</div>
                            <div class="admin-exercise-main">
                                <div class="admin-exercise-title">${escapeHtml(r.title)}</div>
                                <div class="admin-exercise-meta">
                                    ${type.label} &middot; ${r.correct}/${r.total} bonnes réponses
                                    &middot; ${r.attempts} tentative${r.attempts > 1 ? 's' : ''}
                                    &middot; ${fmtDate(r.completedAt)}
                                </div>
                            </div>
                            <div class="admin-exercise-score ${scoreClass(r.scorePct)}">${r.scorePct}%</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `).join('');

        return `
            <div class="admin-exercise-summary">
                <span><strong>${results.length}</strong> exercices complétés</span>
                <span><strong>${totalCorrect}/${totalMax}</strong> bonnes réponses</span>
                <span class="${scoreClass(avgScore)}"><strong>Score moyen : ${avgScore}%</strong></span>
            </div>
            <div class="admin-exercise-groups">${groupsHtml}</div>
        `;
    }

    function renderCertificationBlock(userId, enrollment, course) {
        if (enrollment.certified) {
            return `
                <div class="admin-cert-block admin-cert-block-active">
                    <div class="admin-cert-head">
                        <span class="admin-cert-badge"><span class="admin-cert-badge-icon">&#127942;</span> Certifié</span>
                        <div class="admin-cert-info">
                            <div><strong>Note : ${enrollment.grade}/20</strong></div>
                            <div class="admin-cert-id">
                                N° ${escapeHtml(enrollment.certificateId)} &middot; Délivré ${fmtDate(enrollment.certifiedAt)}
                            </div>
                        </div>
                    </div>
                    <div class="admin-cert-actions">
                        <a href="certificat.html?e=${enrollment.id}" target="_blank" class="btn btn-primary btn-sm">
                            &#128196; Voir / Télécharger le certificat
                        </a>
                        <button class="btn btn-ghost btn-sm admin-danger"
                                data-action="revoke-cert" data-user="${userId}" data-course="${course.id}">
                            Révoquer la certification
                        </button>
                    </div>
                </div>
            `;
        }
        const ready = enrollment.progress >= 80;
        return `
            <div class="admin-cert-block">
                <div class="admin-cert-head">
                    <span class="admin-cert-badge admin-cert-badge-muted">
                        <span class="admin-cert-badge-icon">&#9201;</span> Non certifié
                    </span>
                    <span class="admin-cert-info admin-empty-small">
                        ${ready
                            ? 'Progression &ge; 80 % — éligible à la certification.'
                            : `Éligible à partir de 80 % de progression (actuel ${enrollment.progress} %).`}
                    </span>
                </div>
                <form class="admin-cert-form" data-action="certify-form"
                      data-user="${userId}" data-course="${course.id}">
                    <label class="admin-cert-grade">
                        <span>Note sur 20</span>
                        <input type="number" name="grade" min="10" max="20" step="0.5"
                               value="${ready ? 15 : ''}" required>
                    </label>
                    <button type="submit" class="btn btn-primary btn-sm"
                            ${ready ? '' : 'disabled title="Progression insuffisante"'}>
                        Certifier
                    </button>
                </form>
            </div>
        `;
    }

    // ----- Modal détails apprenant (assignation + certification + exercices)
    function openLearnerModal(userId) {
        const u = D.getUser(userId);
        if (!u) return;
        el('learnerModalTitle').textContent = u.name;
        const enrolls = D.getUserEnrollments(userId);
        const catalog = D.getCatalog();
        const availableCourses = catalog.filter(c => !enrolls.some(e => e.courseId === c.id));

        const assignedCards = enrolls.map(e => {
            const c = D.getCourse(e.courseId);
            if (!c) return '';
            const assignLabel = e.assignedBy === 'self-purchase'
                ? '<span class="admin-tag admin-tag-success">Achat direct</span>'
                : '<span class="admin-tag admin-tag-info">Par admin</span>';
            const exCount = (e.exerciseResults || []).length;
            return `
                <details class="admin-enroll-card" data-enrollment="${e.id}">
                    <summary class="admin-enroll-summary">
                        <div class="admin-enroll-summary-main">
                            <div class="admin-enroll-name">
                                ${escapeHtml(c.name)}
                                ${e.certified ? '<span class="admin-cert-badge admin-cert-badge-inline"><span class="admin-cert-badge-icon">&#127942;</span> ' + e.grade + '/20</span>' : ''}
                            </div>
                            <div class="admin-enroll-meta">
                                Attribué ${fmtDate(e.assignedAt)} &middot; ${assignLabel}
                                &middot; ${exCount} exercice${exCount > 1 ? 's' : ''}
                            </div>
                            <div class="admin-enroll-progress">
                                <div class="admin-progress-bar"><div class="admin-progress-fill" style="width:${e.progress}%"></div></div>
                                <span class="admin-progress-text">${e.progress}%</span>
                            </div>
                        </div>
                        <div class="admin-enroll-summary-aside">
                            <span class="admin-enroll-toggle">Détails &#9662;</span>
                            <button class="btn btn-ghost btn-sm admin-danger"
                                    data-action="revoke" data-user="${userId}" data-course="${c.id}"
                                    onclick="event.stopPropagation();">Retirer</button>
                        </div>
                    </summary>

                    <div class="admin-enroll-details">
                        <div class="admin-enroll-subsection">
                            <h4>Certification</h4>
                            ${renderCertificationBlock(userId, e, c)}
                        </div>
                        <div class="admin-enroll-subsection">
                            <h4>Résultats pédagogiques</h4>
                            ${renderExerciseResults(e)}
                        </div>
                    </div>
                </details>
            `;
        }).join('');

        const assignOptions = availableCourses.map(c => `
            <option value="${c.id}">${escapeHtml(c.name)} — ${fmtFCFA(c.price)}</option>
        `).join('');

        const certifiedCount = enrolls.filter(e => e.certified).length;
        const totalExercises = enrolls.reduce((s, e) => s + (e.exerciseResults || []).length, 0);

        el('learnerModalBody').innerHTML = `
            <div class="admin-learner-profile">
                <div class="admin-learner-avatar">${escapeHtml(u.avatar)}</div>
                <div class="admin-learner-meta">
                    <div><strong>${escapeHtml(u.email)}</strong></div>
                    <div>${escapeHtml(u.phone || '—')} &middot; ${escapeHtml(u.country || '—')}</div>
                    <div class="admin-learner-dates">Inscrit ${fmtDate(u.createdAt)} &middot; Dernière connexion ${fmtDate(u.lastLogin)}</div>
                    <div class="admin-learner-kpis">
                        <span><strong>${enrolls.length}</strong> formation${enrolls.length > 1 ? 's' : ''}</span>
                        <span><strong>${certifiedCount}</strong> certification${certifiedCount > 1 ? 's' : ''}</span>
                        <span><strong>${totalExercises}</strong> exercice${totalExercises > 1 ? 's' : ''} complété${totalExercises > 1 ? 's' : ''}</span>
                    </div>
                </div>
            </div>

            <section class="admin-modal-section">
                <h3>Formations assignées <span class="admin-count-badge">${enrolls.length}</span></h3>
                <p class="admin-section-hint">Clique sur une formation pour voir la certification et les résultats d'exercices.</p>
                <div class="admin-enroll-list">
                    ${assignedCards || '<p class="admin-empty-small">Aucune formation assignée pour le moment.</p>'}
                </div>
            </section>

            <section class="admin-modal-section">
                <h3>Attribuer une nouvelle formation</h3>
                ${availableCourses.length === 0
                    ? '<p class="admin-empty-small">Toutes les formations du catalogue sont déjà assignées.</p>'
                    : `
                    <form id="assignForm" class="admin-assign-form">
                        <select name="courseId" required class="admin-field-input">
                            <option value="">— Sélectionner une formation —</option>
                            ${assignOptions}
                        </select>
                        <input type="text" name="note" placeholder="Note interne (optionnel)" class="admin-field-input">
                        <button type="submit" class="btn btn-primary">Assigner</button>
                    </form>
                `}
            </section>

            <section class="admin-modal-section admin-danger-zone">
                <h3>Zone de danger</h3>
                <button class="btn btn-ghost admin-danger" data-action="delete-user" data-user="${userId}">Supprimer cet apprenant</button>
            </section>
        `;

        openModal('learnerModal');

        const form = document.getElementById('assignForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const fd = new FormData(form);
                const courseId = fd.get('courseId');
                const note = fd.get('note');
                try {
                    D.assignCourse(userId, courseId, session.userId, note);
                    toast('Formation attribuée avec succès');
                    openLearnerModal(userId);   // refresh
                    renderLearners(el('learnerSearch').value);
                    renderDashboard();
                } catch (err) {
                    toast(err.message, true);
                }
            });
        }

        // Formulaires de certification (par enrollment)
        $$('.admin-cert-form', el('learnerModalBody')).forEach(f => {
            f.addEventListener('submit', (e) => {
                e.preventDefault();
                const uId = f.dataset.user;
                const cId = f.dataset.course;
                const grade = Number(f.querySelector('input[name="grade"]').value);
                try {
                    D.certifyEnrollment(uId, cId, grade);
                    const c = D.getCourse(cId);
                    toast('Certification délivrée pour ' + (c ? c.name : 'la formation'));
                    openLearnerModal(uId);
                    renderLearners(el('learnerSearch').value);
                    renderDashboard();
                } catch (err) {
                    toast(err.message, true);
                }
            });
        });
    }

    // ----- Section Formations
    function renderFormations() {
        const enrollments = D.getEnrollments();
        el('formationsGrid').innerHTML = D.getCatalog().map(c => {
            const enrolls = enrollments.filter(e => e.courseId === c.id);
            const uniqueLearners = new Set(enrolls.map(e => e.userId)).size;
            const active    = enrolls.filter(e => !e.certified && e.status !== 'archived').length;
            const certified = enrolls.filter(e => e.certified).length;
            const archived  = enrolls.filter(e => e.status === 'archived' && !e.certified).length;
            const avgProgress = enrolls.length
                ? Math.round(enrolls.reduce((s, e) => s + e.progress, 0) / enrolls.length)
                : 0;
            const paid = enrolls.filter(e => e.assignedBy === 'self-purchase' && e.paymentStatus === 'paid');
            const revenue = paid.reduce((s, e) => s + (e.amount || c.price), 0);

            return `
                <div class="admin-formation-card">
                    <div class="admin-formation-head">
                        <h3>${escapeHtml(c.name)}</h3>
                        <span class="admin-formation-price">${fmtFCFA(c.price)}</span>
                    </div>
                    <div class="admin-formation-meta">
                        ${c.duration}h &middot; ${c.modules} modules &middot; catégorie ${escapeHtml(c.category)}
                    </div>

                    <div class="admin-formation-learners">
                        <div class="admin-formation-learners-total">
                            <span class="admin-formation-learners-num">${uniqueLearners}</span>
                            <span class="admin-formation-learners-lbl">apprenant${uniqueLearners > 1 ? 's' : ''}</span>
                        </div>
                        <div class="admin-formation-learners-breakdown">
                            <div class="admin-formation-breakdown-row admin-formation-row-active">
                                <span class="admin-formation-dot"></span>
                                <span class="admin-formation-breakdown-label">Actifs</span>
                                <strong>${active}</strong>
                            </div>
                            <div class="admin-formation-breakdown-row admin-formation-row-cert">
                                <span class="admin-formation-dot"></span>
                                <span class="admin-formation-breakdown-label">Certifiés</span>
                                <strong>${certified}</strong>
                            </div>
                            <div class="admin-formation-breakdown-row admin-formation-row-archived">
                                <span class="admin-formation-dot"></span>
                                <span class="admin-formation-breakdown-label">Archivés</span>
                                <strong>${archived}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="admin-formation-stats">
                        <div>Progression moy. <strong>${avgProgress}%</strong></div>
                        <div>CA : <strong>${fmtFCFA(revenue)}</strong></div>
                    </div>
                    <a href="${c.page}" class="btn btn-ghost btn-sm btn-block" target="_blank">Voir la page formation &rarr;</a>
                </div>
            `;
        }).join('');
    }

    // ----- Ventes & recettes
    // État local de la section (filtres, range du graphique)
    const salesState = {
        range: 12,
        search: '',
        status: '',
        courseId: ''
    };

    function renderSalesKpis() {
        const s = D.getSalesStats();
        el('sales-kpi-total').textContent = fmtFCFA(s.totalRevenue);
        el('sales-kpi-net').textContent = s.refundedAmount
            ? 'Net : ' + fmtFCFA(s.netRevenue) + ' après remboursements'
            : s.orderCount + ' commandes cumulées';
        el('sales-kpi-month').textContent = fmtFCFA(s.thisMonthRevenue);
        const growthEl = el('sales-kpi-growth');
        const g = s.monthGrowth;
        const arrow = g > 0 ? '▲' : (g < 0 ? '▼' : '■');
        const tone = g > 0 ? 'admin-sales-trend-up' : (g < 0 ? 'admin-sales-trend-down' : 'admin-sales-trend-flat');
        growthEl.className = 'admin-sales-kpi-sub ' + tone;
        growthEl.innerHTML = `<span>${arrow}</span> ${g > 0 ? '+' : ''}${g}% vs mois précédent &middot; ${s.thisMonthOrders} commande${s.thisMonthOrders > 1 ? 's' : ''}`;
        el('sales-kpi-avg').textContent = fmtFCFA(s.avgBasket);
        el('sales-kpi-orders').textContent = s.orderCount + ' commandes encaissées';
        el('sales-kpi-refunds').textContent = fmtFCFA(s.refundedAmount);
        el('sales-kpi-refunds-sub').textContent = s.refundCount
            ? s.refundCount + ' remboursement' + (s.refundCount > 1 ? 's' : '')
            : 'Aucun remboursement';
    }

    // Graphique SVG en barres — pas de lib externe
    function renderSalesChart() {
        const host = el('salesChart');
        if (!host) return;
        const data = D.getRevenueByMonth(salesState.range);
        const max = Math.max(1, ...data.map(d => d.revenue));
        const niceMax = Math.ceil(max / 50000) * 50000 || max;

        const w = host.clientWidth || 720;
        const h = 260;
        const padding = { top: 20, right: 16, bottom: 44, left: 64 };
        const innerW = w - padding.left - padding.right;
        const innerH = h - padding.top - padding.bottom;
        const step = innerW / data.length;
        const barW = Math.max(12, step * 0.6);

        // Grille horizontale (4 lignes)
        const gridLines = [0, 0.25, 0.5, 0.75, 1].map(r => {
            const y = padding.top + innerH * (1 - r);
            const value = Math.round(niceMax * r);
            return `
                <line x1="${padding.left}" y1="${y}" x2="${w - padding.right}" y2="${y}" stroke="#E5E7EB" stroke-width="1"/>
                <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6B7280">
                    ${value >= 1000 ? (value / 1000) + 'k' : value}
                </text>`;
        }).join('');

        const bars = data.map((d, i) => {
            const barH = (d.revenue / niceMax) * innerH;
            const x = padding.left + step * i + (step - barW) / 2;
            const y = padding.top + innerH - barH;
            const isCurrent = i === data.length - 1;
            const fill = isCurrent ? 'url(#barGradActive)' : 'url(#barGrad)';
            return `
                <g class="admin-sales-bar-group">
                    <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="6" fill="${fill}">
                        <title>${d.label} — ${fmtFCFA(d.revenue)} (${d.orders} commande${d.orders > 1 ? 's' : ''})</title>
                    </rect>
                    ${d.revenue > 0 && barH > 20 ? `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="10" font-weight="600" fill="#1F2937">${d.revenue >= 1000 ? Math.round(d.revenue / 1000) + 'k' : d.revenue}</text>` : ''}
                    <text x="${x + barW / 2}" y="${padding.top + innerH + 16}" text-anchor="middle" font-size="11" fill="#6B7280">${escapeHtml(d.label)}</text>
                </g>`;
        }).join('');

        host.innerHTML = `
            <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="Chiffre d'affaires sur ${salesState.range} mois">
                <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#3A50F6"/>
                        <stop offset="100%" stop-color="#7C3AED"/>
                    </linearGradient>
                    <linearGradient id="barGradActive" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#F97316"/>
                        <stop offset="100%" stop-color="#F59E0B"/>
                    </linearGradient>
                </defs>
                ${gridLines}
                ${bars}
            </svg>`;
    }

    function renderSalesByCourse() {
        const host = el('salesByCourse');
        if (!host) return;
        const rows = D.getRevenueByCourse();
        if (!rows.length) {
            host.innerHTML = '<p class="admin-empty-small">Aucune vente enregistrée.</p>';
            return;
        }
        const maxRev = rows[0].revenue || 1;
        host.innerHTML = rows.map(r => `
            <div class="admin-sales-course">
                <div class="admin-sales-course-head">
                    <div class="admin-sales-course-name">${escapeHtml(r.name)}</div>
                    <div class="admin-sales-course-amount">${fmtFCFA(r.revenue)}</div>
                </div>
                <div class="admin-sales-course-bar-wrap">
                    <div class="admin-sales-course-bar" style="width:${Math.round((r.revenue / maxRev) * 100)}%"></div>
                </div>
                <div class="admin-sales-course-meta">
                    <span>${r.sales} vente${r.sales > 1 ? 's' : ''}</span>
                    <span>${r.share}% du CA</span>
                    <span>${fmtFCFA(r.unitPrice)} / u.</span>
                </div>
            </div>
        `).join('');
    }

    function renderSalesByMethod() {
        const host = el('salesByMethod');
        if (!host) return;
        const txs = D.getTransactions().filter(t => t.paymentStatus === 'paid');
        if (!txs.length) { host.innerHTML = '<p class="admin-empty-small">Aucune transaction.</p>'; return; }
        const buckets = {};
        txs.forEach(t => {
            buckets[t.paymentMethod] = buckets[t.paymentMethod] || { count: 0, amount: 0 };
            buckets[t.paymentMethod].count += 1;
            buckets[t.paymentMethod].amount += t.amount;
        });
        const totalAmt = txs.reduce((s, t) => s + t.amount, 0) || 1;
        const icons = { mobile_money: '📱', card: '💳', orange_money: '🟠', wave: '🌊', stripe: '🔷', bank: '🏦' };
        const methods = Object.entries(buckets)
            .map(([k, v]) => ({ key: k, label: D.PAYMENT_METHODS[k] || k, count: v.count, amount: v.amount, share: Math.round((v.amount / totalAmt) * 100) }))
            .sort((a, b) => b.amount - a.amount);
        host.innerHTML = methods.map(m => `
            <div class="admin-sales-method">
                <div class="admin-sales-method-icon">${icons[m.key] || '💰'}</div>
                <div class="admin-sales-method-info">
                    <div class="admin-sales-method-label">${escapeHtml(m.label)}</div>
                    <div class="admin-sales-method-meta">${m.count} transaction${m.count > 1 ? 's' : ''} &middot; ${fmtFCFA(m.amount)}</div>
                </div>
                <div class="admin-sales-method-share">${m.share}%</div>
            </div>
        `).join('');
    }

    function renderSalesTable() {
        const body = el('salesTableBody');
        const empty = el('salesEmpty');
        const footer = el('salesFooter');
        if (!body) return;

        const q = salesState.search.trim().toLowerCase();
        let txs = D.getTransactions();
        if (salesState.status) txs = txs.filter(t => t.paymentStatus === salesState.status);
        if (salesState.courseId) txs = txs.filter(t => t.courseId === salesState.courseId);
        if (q) {
            txs = txs.filter(t =>
                t.userName.toLowerCase().includes(q) ||
                t.userEmail.toLowerCase().includes(q) ||
                t.orderId.toLowerCase().includes(q) ||
                t.courseName.toLowerCase().includes(q)
            );
        }

        const total = txs.reduce((s, t) => s + (t.paymentStatus === 'paid' ? t.amount : 0), 0);

        if (!txs.length) {
            body.innerHTML = '';
            empty.hidden = false;
            footer.innerHTML = '';
            return;
        }
        empty.hidden = true;

        body.innerHTML = txs.map(t => {
            const statusMeta = D.PAYMENT_STATUS[t.paymentStatus] || { label: t.paymentStatus, tone: 'neutral' };
            const methodLabel = D.PAYMENT_METHODS[t.paymentMethod] || t.paymentMethod;
            const canRefund = t.paymentStatus === 'paid';
            return `
                <tr>
                    <td><code class="admin-order-id">${escapeHtml(t.orderId)}</code></td>
                    <td>${fmtDate(t.paidAt)}</td>
                    <td>
                        <div class="admin-sales-user">
                            <strong>${escapeHtml(t.userName)}</strong>
                            <span class="admin-sales-user-email">${escapeHtml(t.userEmail)}</span>
                        </div>
                    </td>
                    <td>${escapeHtml(t.courseName)}</td>
                    <td class="admin-col-amount"><strong>${fmtFCFA(t.amount)}</strong></td>
                    <td>${escapeHtml(methodLabel)}</td>
                    <td><span class="admin-status-badge admin-status-${statusMeta.tone}">${statusMeta.label}</span></td>
                    <td class="admin-col-actions">
                        ${canRefund ? `<button class="btn btn-ghost btn-xs" data-action="refund" data-id="${t.id}" title="Marquer comme remboursé">Rembourser</button>` : ''}
                    </td>
                </tr>`;
        }).join('');

        footer.innerHTML = `
            <span>${txs.length} transaction${txs.length > 1 ? 's' : ''} affichée${txs.length > 1 ? 's' : ''}</span>
            <span>Sous-total payé : <strong>${fmtFCFA(total)}</strong></span>`;
    }

    function renderSalesCourseFilter() {
        const select = el('salesCourseFilter');
        if (!select || select.options.length > 1) return; // déjà peuplé
        D.getCatalog().forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            select.appendChild(opt);
        });
    }

    function renderSales() {
        renderSalesKpis();
        renderSalesChart();
        renderSalesByCourse();
        renderSalesByMethod();
        renderSalesCourseFilter();
        renderSalesTable();
    }

    function downloadCsv() {
        const csv = D.exportTransactionsCSV();
        // BOM pour Excel (UTF-8)
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'caplearning-ventes-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        toast('Export CSV téléchargé');
    }

    // ----- Navigation sections
    function showSection(name) {
        $$('.admin-nav-item').forEach(a => a.classList.toggle('active', a.dataset.section === name));
        $$('.admin-section').forEach(s => {
            const match = s.id === 'section-' + name;
            s.hidden = !match;
            s.classList.toggle('active', match);
        });
        const titles = { dashboard: 'Tableau de bord', learners: 'Apprenants', formations: 'Formations', sales: 'Ventes & recettes', settings: 'Paramètres' };
        el('sectionTitle').textContent = titles[name] || 'Administration';

        if (name === 'dashboard') renderDashboard();
        if (name === 'learners') renderLearners(el('learnerSearch').value);
        if (name === 'formations') renderFormations();
        if (name === 'sales') renderSales();

        // Close mobile sidebar
        document.getElementById('adminSidebar').classList.remove('open');
    }

    // ----- Modales
    function openModal(id)  { el(id).hidden = false; document.body.style.overflow = 'hidden'; }
    function closeModal(id) { el(id).hidden = true;  document.body.style.overflow = ''; }

    // ----- Wire events
    function wire() {
        // Nav
        $$('.admin-nav-item').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                showSection(a.dataset.section);
                history.replaceState(null, '', '#' + a.dataset.section);
            });
        });

        // Sidebar toggle (mobile)
        el('sidebarToggle').addEventListener('click', () => {
            el('adminSidebar').classList.toggle('open');
        });

        // Logout
        el('logoutBtn').addEventListener('click', () => {
            D.clearSession();
            location.href = 'connexion.html';
        });

        // Reset demo
        const resetHandler = () => {
            if (!confirm('Réinitialiser toutes les données de démo ? (les apprenants créés et attributions seront perdus)')) return;
            D.resetDemo();
            renderDashboard();
            renderLearners();
            renderFormations();
            toast('Données de démo réinitialisées');
        };
        el('resetDemoBtn').addEventListener('click', resetHandler);
        if (el('resetDemoBtn2')) el('resetDemoBtn2').addEventListener('click', resetHandler);

        // Search
        let searchTimer;
        el('learnerSearch').addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => renderLearners(e.target.value), 120);
        });

        // Learners table actions (delegation)
        el('learnersTableBody').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action="details"]');
            if (btn) openLearnerModal(btn.dataset.user);
        });

        // Modal actions (delegation for revoke & delete user, forms)
        el('learnerModalBody').addEventListener('click', (e) => {
            const revoke = e.target.closest('button[data-action="revoke"]');
            if (revoke) {
                if (!confirm('Retirer cette formation ?')) return;
                D.revokeCourse(revoke.dataset.user, revoke.dataset.course);
                toast('Formation retirée');
                openLearnerModal(revoke.dataset.user);
                renderLearners(el('learnerSearch').value);
                renderDashboard();
                return;
            }
            const revokeCert = e.target.closest('button[data-action="revoke-cert"]');
            if (revokeCert) {
                if (!confirm('Révoquer cette certification ? Le certificat ne sera plus valide.')) return;
                D.revokeCertification(revokeCert.dataset.user, revokeCert.dataset.course);
                toast('Certification révoquée');
                openLearnerModal(revokeCert.dataset.user);
                renderLearners(el('learnerSearch').value);
                renderDashboard();
                return;
            }
            const del = e.target.closest('button[data-action="delete-user"]');
            if (del) {
                if (!confirm('Supprimer définitivement cet apprenant et toutes ses inscriptions ?')) return;
                D.deleteUser(del.dataset.user);
                toast('Apprenant supprimé');
                closeModal('learnerModal');
                renderLearners(el('learnerSearch').value);
                renderDashboard();
            }
        });

        // Close modal
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-close]')) {
                const m = e.target.closest('.admin-modal');
                if (m) closeModal(m.id);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                $$('.admin-modal').forEach(m => { if (!m.hidden) closeModal(m.id); });
            }
        });

        // Sales filters
        const salesSearch = el('salesSearch');
        if (salesSearch) {
            let st;
            salesSearch.addEventListener('input', (e) => {
                clearTimeout(st);
                st = setTimeout(() => { salesState.search = e.target.value; renderSalesTable(); }, 120);
            });
        }
        if (el('salesStatusFilter')) {
            el('salesStatusFilter').addEventListener('change', (e) => { salesState.status = e.target.value; renderSalesTable(); });
        }
        if (el('salesCourseFilter')) {
            el('salesCourseFilter').addEventListener('change', (e) => { salesState.courseId = e.target.value; renderSalesTable(); });
        }
        if (el('salesExportBtn')) {
            el('salesExportBtn').addEventListener('click', downloadCsv);
        }
        // Range du graphique
        $$('.admin-sales-range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                salesState.range = parseInt(btn.dataset.range, 10) || 12;
                $$('.admin-sales-range-btn').forEach(b => b.classList.toggle('active', b === btn));
                renderSalesChart();
            });
        });
        // Remboursement via table (delegation)
        const salesBody = el('salesTableBody');
        if (salesBody) {
            salesBody.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action="refund"]');
                if (!btn) return;
                if (!confirm('Confirmer le remboursement de cette commande ?')) return;
                try {
                    D.refundTransaction(btn.dataset.id);
                    toast('Transaction remboursée');
                    renderSales();
                    renderDashboard();
                } catch (err) {
                    toast(err.message || 'Erreur lors du remboursement', true);
                }
            });
        }

        // New learner
        el('newLearnerBtn').addEventListener('click', () => {
            el('newLearnerForm').reset();
            el('newLearnerError').hidden = true;
            openModal('newLearnerModal');
        });
        el('newLearnerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                D.createUser({
                    name: fd.get('name'),
                    email: fd.get('email'),
                    phone: fd.get('phone'),
                    country: fd.get('country')
                });
                closeModal('newLearnerModal');
                toast('Apprenant créé');
                renderLearners(el('learnerSearch').value);
                renderDashboard();
            } catch (err) {
                const box = el('newLearnerError');
                box.textContent = err.message;
                box.hidden = false;
            }
        });
    }

    // ----- Init
    renderSessionInfo();
    wire();
    const initial = (location.hash || '#dashboard').replace('#', '');
    showSection(['dashboard', 'learners', 'formations', 'sales', 'settings'].includes(initial) ? initial : 'dashboard');
})();
