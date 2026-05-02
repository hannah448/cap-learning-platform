/* =============================================================================
   Cap Learning — DB helpers (enrollments / progress / certificates / admin)
   -----------------------------------------------------------------------------
   Charger APRÈS supabase-client.js + auth.js.
   Expose : window.CapData

   Toute la sécurité passe par les RLS policies (rls.sql), donc ces helpers
   sont volontairement minces — on délègue les vérifs à Postgres.
   ============================================================================= */

(function () {
    'use strict';

    if (!window.CapDB) {
        console.error('[CapData] window.CapDB indisponible. Charge supabase-client.js avant db.js.');
        return;
    }

    var db = window.CapDB;

    function logErr(label, err) {
        if (window.CapConfig && window.CapConfig.DEBUG) {
            console.warn('[CapData] ' + label, err);
        }
    }

    // ====================================================================
    // ENROLLMENTS
    // ====================================================================

    /** Liste les enrollments du user courant (RLS limite automatiquement). */
    async function getMyEnrollments() {
        var res = await db
            .from('enrollments')
            .select('*')
            .order('enrolled_at', { ascending: false });
        if (res.error) { logErr('getMyEnrollments', res.error); throw res.error; }
        return res.data || [];
    }

    /** Récupère un enrollment précis par course_id (ou null si pas inscrit). */
    async function getEnrollment(courseId) {
        if (!courseId) throw new Error('courseId requis');
        var res = await db
            .from('enrollments')
            .select('*')
            .eq('course_id', courseId)
            .maybeSingle();
        if (res.error) { logErr('getEnrollment', res.error); throw res.error; }
        return res.data || null;
    }

    /** Vrai si l'user a accès à la formation (active ou completed). */
    async function hasAccess(courseId) {
        var e = await getEnrollment(courseId);
        return !!(e && (e.status === 'active' || e.status === 'completed'));
    }

    // ====================================================================
    // LESSON PROGRESS
    // ====================================================================

    /** Toute la progression d'un user pour un course donné. */
    async function getProgress(courseId) {
        if (!courseId) throw new Error('courseId requis');
        var res = await db
            .from('lesson_progress')
            .select('*')
            .eq('course_id', courseId);
        if (res.error) { logErr('getProgress', res.error); throw res.error; }
        return res.data || [];
    }

    /** Get/Set d'une seule leçon. */
    async function getLessonProgress(courseId, lessonId) {
        if (!courseId || !lessonId) throw new Error('courseId et lessonId requis');
        var res = await db
            .from('lesson_progress')
            .select('*')
            .eq('course_id', courseId)
            .eq('lesson_id', lessonId)
            .maybeSingle();
        if (res.error) { logErr('getLessonProgress', res.error); throw res.error; }
        return res.data || null;
    }

    /**
     * Met à jour la progression d'une leçon (upsert).
     * @param {string} courseId
     * @param {string} lessonId
     * @param {number} pct       0..1
     * @param {boolean} completed
     */
    async function setProgress(courseId, lessonId, pct, completed) {
        var user = await window.CapAuth.getUser();
        if (!user) throw new Error('Authentification requise');

        var safePct = Math.max(0, Math.min(1, parseFloat(pct) || 0));
        var done = !!completed || safePct >= 0.95;

        var row = {
            user_id: user.id,
            course_id: courseId,
            lesson_id: lessonId,
            progress_pct: safePct,
            completed: done,
            last_watched_at: new Date().toISOString()
        };
        if (done) row.completed_at = new Date().toISOString();

        var res = await db
            .from('lesson_progress')
            .upsert(row, { onConflict: 'user_id,lesson_id' })
            .select()
            .single();
        if (res.error) { logErr('setProgress', res.error); throw res.error; }
        return res.data;
    }

    /** Marque une leçon 100% complétée. */
    async function markComplete(courseId, lessonId) {
        return setProgress(courseId, lessonId, 1, true);
    }

    /** Récap progression : { total, completed, started, percent } pour un course. */
    async function getCourseProgressSummary(courseId, totalLessons) {
        var rows = await getProgress(courseId);
        var completed = rows.filter(function (r) { return r.completed; }).length;
        var started = rows.length;
        var total = totalLessons || started;
        return {
            total: total,
            started: started,
            completed: completed,
            percent: total > 0 ? completed / total : 0,
            rows: rows
        };
    }

    // ====================================================================
    // CERTIFICATES
    // ====================================================================

    async function getMyCertificates() {
        var res = await db
            .from('certificates')
            .select('*')
            .order('issued_at', { ascending: false });
        if (res.error) { logErr('getMyCertificates', res.error); throw res.error; }
        return res.data || [];
    }

    async function getCertificateByCode(verificationCode) {
        if (!verificationCode) throw new Error('verificationCode requis');
        var res = await db
            .from('certificates')
            .select('*, profiles(full_name)')
            .eq('verification_code', verificationCode)
            .maybeSingle();
        if (res.error) { logErr('getCertificateByCode', res.error); throw res.error; }
        return res.data || null;
    }

    // ====================================================================
    // ADMIN (RLS bloque automatiquement si non-admin)
    // ====================================================================

    async function adminListProfiles(opts) {
        opts = opts || {};
        var q = db.from('profiles').select('*');
        if (opts.role) q = q.eq('role', opts.role);
        if (opts.country) q = q.eq('country', opts.country);
        q = q.order('created_at', { ascending: false }).limit(opts.limit || 200);
        var res = await q;
        if (res.error) { logErr('adminListProfiles', res.error); throw res.error; }
        return res.data || [];
    }

    async function adminListEnrollments(opts) {
        opts = opts || {};
        var q = db
            .from('enrollments')
            .select('*, profiles(email, full_name, country)');
        if (opts.courseId) q = q.eq('course_id', opts.courseId);
        if (opts.status) q = q.eq('status', opts.status);
        q = q.order('enrolled_at', { ascending: false }).limit(opts.limit || 500);
        var res = await q;
        if (res.error) { logErr('adminListEnrollments', res.error); throw res.error; }
        return res.data || [];
    }

    async function adminListProgressSummary(opts) {
        opts = opts || {};
        var q = db.from('enrollment_progress_summary').select('*');
        if (opts.courseId) q = q.eq('course_id', opts.courseId);
        var res = await q;
        if (res.error) { logErr('adminListProgressSummary', res.error); throw res.error; }
        return res.data || [];
    }

    async function adminGetStats() {
        var counts = await Promise.all([
            db.from('profiles').select('*', { count: 'exact', head: true }),
            db.from('enrollments').select('*', { count: 'exact', head: true }).eq('status', 'active'),
            db.from('enrollments').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
            db.from('certificates').select('*', { count: 'exact', head: true })
        ]);
        return {
            users: counts[0].count || 0,
            activeEnrollments: counts[1].count || 0,
            completedEnrollments: counts[2].count || 0,
            certificates: counts[3].count || 0
        };
    }

    // ====================================================================
    // Compat localStorage (migration douce)
    // ====================================================================

    /**
     * Lit l'ancien progressData en localStorage (avant DB) et le pousse dans
     * la DB. Utile à appeler une fois après login pour migrer les progrès
     * stockés en local par les anciens utilisateurs.
     */
    async function migrateLocalProgress() {
        try {
            var raw = localStorage.getItem('caplearning_progress');
            if (!raw) return { migrated: 0 };
            var local = JSON.parse(raw) || {};
            var migrated = 0;

            for (var courseId in local) {
                if (!Object.prototype.hasOwnProperty.call(local, courseId)) continue;
                var lessons = (local[courseId] && local[courseId].completed) || [];
                for (var i = 0; i < lessons.length; i++) {
                    try {
                        await markComplete(courseId, lessons[i]);
                        migrated++;
                    } catch (e) { /* silent — peut être bloqué par RLS si pas d'enrollment */ }
                }
            }
            return { migrated: migrated };
        } catch (e) {
            return { migrated: 0, error: e.message };
        }
    }

    window.CapData = {
        // Enrollments
        getMyEnrollments: getMyEnrollments,
        getEnrollment: getEnrollment,
        hasAccess: hasAccess,

        // Progress
        getProgress: getProgress,
        getLessonProgress: getLessonProgress,
        setProgress: setProgress,
        markComplete: markComplete,
        getCourseProgressSummary: getCourseProgressSummary,

        // Certificates
        getMyCertificates: getMyCertificates,
        getCertificateByCode: getCertificateByCode,

        // Admin
        adminListProfiles: adminListProfiles,
        adminListEnrollments: adminListEnrollments,
        adminListProgressSummary: adminListProgressSummary,
        adminGetStats: adminGetStats,

        // Migration
        migrateLocalProgress: migrateLocalProgress
    };
})();
