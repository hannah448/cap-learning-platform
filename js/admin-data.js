/* =============================================================================
   Cap Learning — AdminData (Supabase bridge)
   -----------------------------------------------------------------------------
   Cette version remplace l'ancien admin-data.js (sauvegardé en
   admin-data.legacy.js). Elle expose la MÊME API que l'ancien fichier mais
   lit/écrit dans Supabase derrière, via les helpers CapAuth + CapData.

   Pourquoi un bridge ? admin.js (~974 lignes) consomme 24 méthodes d'AdminData.
   Plutôt que tout réécrire, on garde admin.js intact et on plug Supabase ici.

   Les fonctions qui n'ont pas encore d'équivalent DB (revenue par mois,
   transactions, export CSV...) renvoient des valeurs par défaut sûres
   (tableau vide, 0) pour ne pas casser admin.js. À implémenter quand on
   ajoutera la table `transactions`.
   ============================================================================= */

(function () {
    'use strict';

    var CACHE = {
        profile: null,        // current profile loaded
        users: [],            // profiles
        enrollments: [],      // enrollments + joined profile
        ready: false,
        readyPromise: null
    };

    // Mapping course_db_id (Supabase) ↔ course UI representation
    var COURSES = [
        { id: '1',  course_db_id: 'marketing',       name: 'Marketing Digital Complet',           hours: 57, modules: 16, page: 'formation-marketing-digital.html', priceXof: 89000 },
        { id: '2',  course_db_id: 'ecommerce',       name: 'E-commerce & Paiements Digitaux',     hours: 79, modules: 47, page: 'formation-ecommerce.html',        priceXof: 99000 },
        { id: '3',  course_db_id: 'ia-business',     name: 'IA & Business',                       hours: 48, modules: 26, page: 'formation-ia-business.html',      priceXof: 89000 },
        { id: '5',  course_db_id: 'reseaux-sociaux', name: 'Réseaux Sociaux & CM',                hours: 41, modules: 25, page: 'formation-reseaux-sociaux.html',  priceXof: 79000 },
        { id: '10', course_db_id: 'entrepreneuriat', name: 'Entrepreneuriat Digital',             hours: 50, modules: 20, page: 'formation-entrepreneuriat-digital.html', priceXof: 89000 }
    ];

    var COURSES_BY_DB_ID = {};
    var COURSES_BY_ID = {};
    COURSES.forEach(function (c) {
        COURSES_BY_DB_ID[c.course_db_id] = c;
        COURSES_BY_ID[c.id] = c;
    });

    // ----------------------------------------------------------------
    // Hydration depuis Supabase
    // ----------------------------------------------------------------
    async function hydrate() {
        // Attend que la stack Supabase soit chargée
        var tries = 0;
        while ((!window.CapAuth || !window.CapData) && tries++ < 60) {
            await new Promise(function (r) { setTimeout(r, 30); });
        }
        if (!window.CapAuth || !window.CapData) return;

        // Récupère le profil avec retry défensif : si une race onAuthStateChange
        // écrase currentProfile au mauvais moment, getProfile() peut renvoyer null
        // alors que la session est valide. On retente jusqu'à ~250 ms.
        var attempts = 0;
        var profile = null;
        while (!profile && attempts++ < 6) {
            try { profile = await window.CapAuth.getProfile(); } catch (e) {}
            if (!profile) await new Promise(function (r) { setTimeout(r, 50); });
        }
        CACHE.profile = profile;

        // Charge users + enrollments en parallèle (RLS bloque si non admin → []
        // donc safe à appeler même pour un apprenant)
        try {
            var users = [];
            var enrolls = [];
            try { users = await window.CapData.adminListProfiles(); } catch (e) {}
            try { enrolls = await window.CapData.adminListEnrollments(); } catch (e) {}
            CACHE.users = users || [];
            CACHE.enrollments = enrolls || [];
        } catch (e) {
            CACHE.users = [];
            CACHE.enrollments = [];
        }

        CACHE.ready = true;
    }

    function ensureReady() {
        if (CACHE.ready) return Promise.resolve();
        if (CACHE.readyPromise) return CACHE.readyPromise;
        CACHE.readyPromise = hydrate();
        return CACHE.readyPromise;
    }

    // Démarre l'hydration immédiatement (en background)
    ensureReady();

    // ----------------------------------------------------------------
    // Adaptateurs : profile/enrollment Supabase → format AdminData attendu
    // ----------------------------------------------------------------
    function profileToUser(p) {
        if (!p) return null;
        return {
            id:         p.id,
            email:      p.email,
            name:       p.full_name || (p.email && p.email.split('@')[0]) || '—',
            phone:      p.phone || '',
            country:    p.country || '',
            role:       p.role,
            createdAt:  p.created_at,
            avatar_url: p.avatar_url
        };
    }

    function enrollToOldFormat(e) {
        if (!e) return null;
        var course = COURSES_BY_DB_ID[e.course_id];
        return {
            id:            e.id,
            userId:        e.user_id,
            userEmail:     e.profiles && e.profiles.email,
            userName:      e.profiles && e.profiles.full_name,
            courseId:      course ? course.id : e.course_id,
            courseName:    course ? course.name : e.course_id,
            courseDbId:    e.course_id,
            status:        e.status,
            enrolledAt:    e.enrolled_at,
            completedAt:   e.completed_at,
            certified:     e.status === 'completed',
            transactionId: e.cinetpay_transaction_id,
            invoiceId:     e.pennylane_invoice_id,
            amount:        e.amount_xof,
            currency:      e.currency || 'XOF',
            paymentMethod: e.payment_method
        };
    }

    // ----------------------------------------------------------------
    // API publique (compat AdminData)
    // ----------------------------------------------------------------

    // ---- Session ----
    function getSession() {
        if (!CACHE.profile) return null;
        return {
            email: CACHE.profile.email,
            name:  CACHE.profile.full_name,
            role:  CACHE.profile.role
        };
    }

    function clearSession() {
        if (window.CapAuth) window.CapAuth.signOut();
    }

    function setSession(user) {
        // Géré par CapAuth, no-op ici
        return getSession();
    }

    function requireAdmin() {
        // Cas hydraté → check immédiat
        if (CACHE.ready) {
            var s = getSession();
            if (!s || s.role !== 'admin') {
                window.location.href = 'connexion.html';
                return null;
            }
            return s;
        }
        // Pas hydraté → on attend en arrière-plan, et on retournera null pour
        // que admin.js sache qu'il faut attendre. admin.js gère bien le retour null.
        ensureReady().then(function () {
            var s = getSession();
            if (!s || s.role !== 'admin') {
                window.location.href = 'connexion.html';
            }
        });
        return null;
    }

    // ---- Users ----
    function getUsers() { return CACHE.users.map(profileToUser); }

    function getUser(id) {
        var p = CACHE.users.find(function (u) { return u.id === id; });
        return profileToUser(p);
    }

    function getUserByEmail(email) {
        if (!email) return null;
        var p = CACHE.users.find(function (u) {
            return u.email && u.email.toLowerCase() === email.toLowerCase();
        });
        return profileToUser(p);
    }

    async function createUser(data) {
        if (!window.CapDB) throw new Error('Supabase indisponible');
        // Note : créer un profile sans auth.users est possible mais ne génère pas
        // de compte de connexion. En prod, utilise l'invitation par email
        // (Supabase Auth Admin API, requiert service_role côté serveur).
        var r = await window.CapDB
            .from('profiles')
            .insert({
                email:     data.email,
                full_name: data.name,
                phone:     data.phone || null,
                country:   data.country || 'SN',
                role:      'apprenant'
            })
            .select()
            .single();
        if (r.error) throw new Error(r.error.message);
        await hydrate();
        return profileToUser(r.data);
    }

    async function deleteUser(id) {
        if (!window.CapDB) throw new Error('Supabase indisponible');
        var r = await window.CapDB.from('profiles').delete().eq('id', id);
        if (r.error) throw new Error(r.error.message);
        await hydrate();
        return true;
    }

    // ---- Catalogue ----
    function getCatalog() { return COURSES.slice(); }

    function getCourse(idOrDbId) {
        return COURSES_BY_ID[idOrDbId] || COURSES_BY_DB_ID[idOrDbId] || null;
    }

    // ---- Enrollments ----
    function getEnrollments(filter) {
        var rows = CACHE.enrollments.map(enrollToOldFormat);
        if (!filter) return rows;
        return rows.filter(function (e) {
            if (filter.userId && e.userId !== filter.userId) return false;
            if (filter.courseId && e.courseId !== filter.courseId) return false;
            if (filter.status && e.status !== filter.status) return false;
            return true;
        });
    }

    function getUserEnrollments(userId) {
        return getEnrollments({ userId: userId });
    }

    async function assignCourse(userId, courseIdOrDbId) {
        if (!window.CapDB) throw new Error('Supabase indisponible');
        var course = COURSES_BY_ID[courseIdOrDbId] || COURSES_BY_DB_ID[courseIdOrDbId];
        if (!course) throw new Error('Cours inconnu : ' + courseIdOrDbId);

        var r = await window.CapDB
            .from('enrollments')
            .upsert({
                user_id:        userId,
                course_id:      course.course_db_id,
                status:         'active',
                amount_xof:     course.priceXof,
                currency:       'XOF',
                payment_method: 'manual-admin'
            }, { onConflict: 'user_id,course_id' })
            .select()
            .single();
        if (r.error) throw new Error(r.error.message);
        await hydrate();
        return enrollToOldFormat(r.data);
    }

    async function revokeCourse(userId, courseIdOrDbId) {
        if (!window.CapDB) throw new Error('Supabase indisponible');
        var course = COURSES_BY_ID[courseIdOrDbId] || COURSES_BY_DB_ID[courseIdOrDbId];
        if (!course) throw new Error('Cours inconnu');
        var r = await window.CapDB
            .from('enrollments')
            .delete()
            .eq('user_id', userId)
            .eq('course_id', course.course_db_id);
        if (r.error) throw new Error(r.error.message);
        await hydrate();
        return true;
    }

    async function certifyEnrollment(enrollmentId) {
        if (!window.CapDB) throw new Error('Supabase indisponible');
        var r = await window.CapDB
            .from('enrollments')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', enrollmentId)
            .select()
            .single();
        if (r.error) throw new Error(r.error.message);
        await hydrate();
        return enrollToOldFormat(r.data);
    }

    async function revokeCertification(enrollmentId) {
        if (!window.CapDB) throw new Error('Supabase indisponible');
        var r = await window.CapDB
            .from('enrollments')
            .update({ status: 'active', completed_at: null })
            .eq('id', enrollmentId)
            .select()
            .single();
        if (r.error) throw new Error(r.error.message);
        await hydrate();
        return enrollToOldFormat(r.data);
    }

    // ---- Stats ----
    function getStats() {
        var enrolls = CACHE.enrollments;
        var courses = {};
        var revenueXof = 0;
        enrolls.forEach(function (e) {
            if (e.status === 'pending' || e.status === 'refunded') return;
            courses[e.course_id] = (courses[e.course_id] || 0) + 1;
            revenueXof += (e.amount_xof || 0);
        });
        var totalEnrollments = enrolls.length;
        var activeEnrollments = enrolls.filter(function (e) { return e.status === 'active'; }).length;
        var completedEnrollments = enrolls.filter(function (e) { return e.status === 'completed'; }).length;
        // Approximation : ratio enrollments terminés sur enrollments démarrés
        // (active + completed). Quand on aura un cache des lesson_progress,
        // on raffinera avec une vraie moyenne sur tous les % de progression.
        var nonRefunded = activeEnrollments + completedEnrollments;
        var avgProgress = nonRefunded > 0
            ? Math.round((completedEnrollments / nonRefunded) * 100)
            : 0;
        return {
            totalUsers:       CACHE.users.length,
            totalLearners:    CACHE.users.filter(function (u) { return u.role === 'apprenant'; }).length,
            totalAdmins:      CACHE.users.filter(function (u) { return u.role === 'admin'; }).length,
            totalEnrollments: totalEnrollments,
            activeEnrollments:    activeEnrollments,
            completedEnrollments: completedEnrollments,
            revenueXof:       revenueXof,
            // Alias pour compat avec admin.js (qui utilise les anciens noms d'AdminData)
            totalRevenue:     revenueXof,
            avgProgress:      avgProgress,
            certifications:   completedEnrollments,
            certified:        completedEnrollments,
            byCourse:         courses
        };
    }

    function getSalesStats() {
        var s = getStats();
        return {
            totalRevenueXof: s.revenueXof,
            totalSales:      s.activeEnrollments + s.completedEnrollments,
            avgBasketXof:    s.totalEnrollments > 0 ? Math.round(s.revenueXof / s.totalEnrollments) : 0
        };
    }

    // ---- Reporting (basé sur enrollments — table transactions à venir) ----
    function getTransactions() {
        return CACHE.enrollments
            .filter(function (e) { return e.status !== 'pending'; })
            .map(function (e) {
                var f = enrollToOldFormat(e);
                return {
                    id:            f.transactionId || f.id,
                    userId:        f.userId,
                    userEmail:     f.userEmail,
                    userName:      f.userName,
                    courseId:      f.courseId,
                    courseName:    f.courseName,
                    amount:        f.amount,
                    currency:      f.currency,
                    paymentMethod: f.paymentMethod,
                    date:          f.enrolledAt,
                    status:        f.status === 'refunded' ? 'refunded' : 'paid'
                };
            });
    }

    function getRevenueByCourse() {
        var stats = getStats();
        return Object.keys(stats.byCourse).map(function (dbId) {
            var c = COURSES_BY_DB_ID[dbId];
            return {
                courseId:   c ? c.id : dbId,
                courseName: c ? c.name : dbId,
                count:      stats.byCourse[dbId],
                revenueXof: (c ? c.priceXof : 0) * stats.byCourse[dbId]
            };
        });
    }

    function getRevenueByMonth() {
        var byMonth = {};
        CACHE.enrollments.forEach(function (e) {
            if (e.status === 'pending' || e.status === 'refunded') return;
            var d = new Date(e.enrolled_at);
            var k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            byMonth[k] = (byMonth[k] || 0) + (e.amount_xof || 0);
        });
        return Object.keys(byMonth).sort().map(function (k) {
            return { month: k, revenueXof: byMonth[k] };
        });
    }

    async function refundTransaction(enrollmentId) {
        if (!window.CapDB) throw new Error('Supabase indisponible');
        var r = await window.CapDB
            .from('enrollments')
            .update({ status: 'refunded', refunded_at: new Date().toISOString() })
            .eq('id', enrollmentId);
        if (r.error) throw new Error(r.error.message);
        await hydrate();
        return true;
    }

    function exportTransactionsCSV() {
        var rows = getTransactions();
        var header = ['id', 'date', 'email', 'name', 'course', 'amount_xof', 'currency', 'method', 'status'];
        var lines = [header.join(',')];
        rows.forEach(function (r) {
            lines.push([
                r.id, r.date, r.userEmail, r.userName, r.courseName,
                r.amount, r.currency, r.paymentMethod, r.status
            ].map(function (v) { return '"' + (v == null ? '' : v).toString().replace(/"/g, '""') + '"'; }).join(','));
        });
        return lines.join('\n');
    }

    // ---- Reset démo (no-op safe pour Supabase) ----
    async function resetDemo() {
        await hydrate();
        return true;
    }

    // ---- Constantes paiement ----
    var PAYMENT = {
        WAVE:         'wave',
        ORANGE_MONEY: 'orange-money',
        MTN:          'mtn',
        FREE_MONEY:   'free-money',
        MOOV:         'moov',
        CARD:         'card',
        ADMIN:        'manual-admin'
    };

    // ----------------------------------------------------------------
    // Expose
    // ----------------------------------------------------------------
    window.AdminData = {
        // Lifecycle
        hydrate: hydrate,
        ready:   ensureReady,
        isReady: function () { return CACHE.ready; },

        // Session
        getSession:   getSession,
        setSession:   setSession,
        clearSession: clearSession,
        requireAdmin: requireAdmin,

        // Users
        getUsers:        getUsers,
        getUser:         getUser,
        getUserByEmail:  getUserByEmail,
        createUser:      createUser,
        deleteUser:      deleteUser,

        // Catalogue
        getCatalog: getCatalog,
        getCourse:  getCourse,

        // Enrollments
        getEnrollments:        getEnrollments,
        getUserEnrollments:    getUserEnrollments,
        assignCourse:          assignCourse,
        revokeCourse:          revokeCourse,
        certifyEnrollment:     certifyEnrollment,
        revokeCertification:   revokeCertification,

        // Stats
        getStats:      getStats,
        getSalesStats: getSalesStats,

        // Reporting
        getTransactions:       getTransactions,
        getRevenueByCourse:    getRevenueByCourse,
        getRevenueByMonth:     getRevenueByMonth,
        refundTransaction:     refundTransaction,
        exportTransactionsCSV: exportTransactionsCSV,

        // Reset
        resetDemo: resetDemo,

        // Constantes
        PAYMENT: PAYMENT
    };
})();
