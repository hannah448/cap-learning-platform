/**
 * POST /api/directory/report
 * --------------------------
 * Signale un profil de l'annuaire.
 * Auth requise. Gate enrollment payé.
 *
 * Corps JSON : { reported_id: uuid, reason: string (3-500 caractères) }
 *
 * Effet :
 *   1. Insert dans directory_reports (via RLS avec le JWT de l'appelant).
 *   2. Envoie un email de notification à hannah@digi-atlas.com via Brevo
 *      (si BREVO_API_KEY présente ; sinon log seulement).
 *
 * Réponse :
 *   201 { ok: true, id }
 *   400 / 401 / 403 / 429 / 500
 */

const { upsert } = require('../../lib/supabase-admin');
const { requireUser } = require('../../lib/user-auth');
const { rateLimit } = require('../../lib/rate-limit');
const { sendEmail } = require('../../lib/brevo');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODERATOR_EMAIL = 'hannah@digi-atlas.com';

function fail(res, code, error) {
    return res.status(code).json({ error });
}

async function sbFetch(path) {
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'GET',
        headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Accept': 'application/json'
        }
    });
}

async function callerHasPaidEnrollment(userId) {
    const r = await sbFetch(
        `enrollments?user_id=eq.${encodeURIComponent(userId)}&status=in.(active,completed)&select=id&limit=1`
    );
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
}

async function fetchReportedProfile(id) {
    const r = await sbFetch(`profiles?id=eq.${encodeURIComponent(id)}&select=id,display_name,email,is_directory_visible&limit=1`);
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed. Utilisez POST.');
    if (!SUPABASE_URL || !SERVICE_KEY) return fail(res, 500, 'Configuration serveur incomplète.');

    // Rate limit spécifique (plus strict que /list) pour freiner les signalements abusifs
    if (!rateLimit(req, { max: 10, windowMs: 60_000 })) {
        return fail(res, 429, 'Trop de signalements. Réessaie dans une minute.');
    }

    const reporter = await requireUser(req, res);
    if (!reporter) return; // 401 déjà envoyé

    const isPaidLearner = await callerHasPaidEnrollment(reporter.id);
    if (!isPaidLearner) return fail(res, 403, 'Annuaire réservé aux apprenants Cap Learning.');

    // Parse
    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (e) { return fail(res, 400, 'JSON invalide.'); }

    const reportedId = body.reported_id ? String(body.reported_id).trim() : '';
    const reason = body.reason ? String(body.reason).trim() : '';

    if (!UUID_REGEX.test(reportedId)) return fail(res, 400, 'Identifiant du profil signalé invalide.');
    if (reportedId === reporter.id) return fail(res, 400, 'Tu ne peux pas te signaler toi-même.');
    if (reason.length < 3 || reason.length > 500) return fail(res, 400, 'Le motif doit faire entre 3 et 500 caractères.');
    if (/[<>]/.test(reason)) return fail(res, 400, 'Les caractères < et > ne sont pas autorisés dans le motif.');

    // Vérifie que la cible existe (sans exiger opt-in : on peut signaler un profil déjà masqué)
    const target = await fetchReportedProfile(reportedId);
    if (!target) return fail(res, 404, 'Profil signalé introuvable.');

    // Insertion via service_role (bypass RLS, on a déjà validé l'appelant)
    let row;
    try {
        row = await upsert('directory_reports', {
            reporter_id: reporter.id,
            reported_id: reportedId,
            reason: reason
        });
    } catch (e) {
        console.error('[directory/report] insert failed:', e.message);
        return fail(res, 500, 'Erreur pendant l\'enregistrement du signalement.');
    }

    // Email de notif à Hannah (best effort — n'échoue pas la requête si Brevo down)
    try {
        const html = [
            '<h2>Signalement d\'un profil annuaire</h2>',
            `<p><strong>Profil signalé :</strong> ${escapeHtml(target.display_name || target.email || target.id)} (id ${escapeHtml(target.id)})</p>`,
            `<p><strong>Signalé par :</strong> ${escapeHtml(reporter.email)}</p>`,
            `<p><strong>Motif :</strong></p>`,
            `<blockquote style="border-left: 3px solid #ccc; padding-left: 12px; color: #555;">${escapeHtml(reason).replace(/\n/g, '<br>')}</blockquote>`,
            `<p><a href="https://supabase.com/dashboard/project/hqdcaighricsqeqcaezk/editor?table=directory_reports">Voir dans Supabase</a></p>`,
            '<hr><p style="font-size: 12px; color: #888;">Email automatique — Cap Learning annuaire.</p>'
        ].join('\n');
        await sendEmail({
            to: MODERATOR_EMAIL,
            subject: `[Cap Learning] Signalement annuaire — ${target.display_name || target.email || 'profil ' + target.id.slice(0, 8)}`,
            html,
            replyTo: reporter.email
        });
    } catch (e) {
        console.error('[directory/report] email notif failed:', e.message);
        // on n'échoue PAS la requête — le report est bien en base
    }

    return res.status(201).json({ ok: true, id: row.id });
};
