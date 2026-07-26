/**
 * GET  /api/directory/admin/reports?status=pending
 * POST /api/directory/admin/reports  { report_id, action: 'hide_profile' | 'dismiss' }
 * ------------------------------------------------------------------------------------
 * Endpoints admin pour la modération de l'annuaire.
 *
 * GET  : retourne les signalements (pending par défaut) + infos jointes des profils.
 * POST : deux actions possibles sur un signalement :
 *   - hide_profile : passe le profil signalé en is_directory_visible=false ET marque
 *                    le signalement résolu.
 *   - dismiss      : marque le signalement résolu sans toucher au profil (faux positif).
 *
 * Auth : role='admin' obligatoire (401/403 sinon).
 */

const { update, select } = require('../../../lib/supabase-admin');
const { requireAdmin } = require('../../../lib/user-auth');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(res, code, error) {
    return res.status(code).json({ error });
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    const admin = await requireAdmin(req, res);
    if (!admin) return; // 401/403 déjà envoyé

    if (req.method === 'GET') {
        const status = (req.query && req.query.status) || 'pending';
        const filter = status === 'all'
            ? ''
            : (status === 'resolved' ? '&resolved_at=not.is.null' : '&resolved_at=is.null');

        try {
            const rows = await select(
                'directory_reports',
                `select=id,reason,created_at,resolved_at,reporter_id,reported_id&order=created_at.desc${filter}`
            );
            // Enrichit avec les infos profils (nom + email)
            const ids = [...new Set(rows.flatMap(r => [r.reporter_id, r.reported_id]))];
            let profilesById = {};
            if (ids.length) {
                const profiles = await select(
                    'profiles',
                    `id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,email,display_name,full_name,is_directory_visible`
                );
                profilesById = Object.fromEntries(profiles.map(p => [p.id, p]));
            }
            const enriched = rows.map(r => ({
                id: r.id,
                reason: r.reason,
                created_at: r.created_at,
                resolved_at: r.resolved_at,
                reporter: profilesById[r.reporter_id] || { id: r.reporter_id },
                reported: profilesById[r.reported_id] || { id: r.reported_id }
            }));
            return res.status(200).json({ total: enriched.length, reports: enriched });
        } catch (e) {
            console.error('[admin/reports] GET failed:', e.message);
            return fail(res, 500, 'Erreur pendant le chargement des signalements.');
        }
    }

    if (req.method === 'POST') {
        let body;
        try {
            body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        } catch (e) { return fail(res, 400, 'JSON invalide.'); }

        const reportId = body.report_id ? String(body.report_id).trim() : '';
        const action = body.action ? String(body.action).trim() : '';

        if (!UUID_REGEX.test(reportId)) return fail(res, 400, 'report_id invalide.');
        if (!['hide_profile', 'dismiss'].includes(action)) {
            return fail(res, 400, "action invalide. Attendu : 'hide_profile' ou 'dismiss'.");
        }

        // Récupère le signalement pour connaître le reported_id
        let report;
        try {
            const rows = await select('directory_reports', `id=eq.${encodeURIComponent(reportId)}&select=*&limit=1`);
            report = rows[0];
        } catch (e) {
            return fail(res, 500, 'Erreur pendant la lecture du signalement.');
        }
        if (!report) return fail(res, 404, 'Signalement introuvable.');
        if (report.resolved_at) return fail(res, 400, 'Signalement déjà résolu.');

        try {
            if (action === 'hide_profile') {
                await update(
                    'profiles',
                    `id=eq.${encodeURIComponent(report.reported_id)}`,
                    { is_directory_visible: false }
                );
            }
            await update(
                'directory_reports',
                `id=eq.${encodeURIComponent(reportId)}`,
                { resolved_at: new Date().toISOString(), resolved_by: admin.id }
            );
            return res.status(200).json({ ok: true, action });
        } catch (e) {
            console.error('[admin/reports] POST failed:', e.message);
            return fail(res, 500, 'Erreur pendant l\'action.');
        }
    }

    return fail(res, 405, 'Method not allowed.');
};
