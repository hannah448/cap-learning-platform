/**
 * GET /api/directory/profile/:id
 * ------------------------------
 * Renvoie le profil annuaire complet d'un membre (opt-in obligatoire).
 * Auth requise + gate enrollment payé.
 *
 * Sécurité : le numéro WhatsApp brut N'EST JAMAIS renvoyé.
 * À la place on renvoie une URL wa.me prête à cliquer.
 *
 * Réponse 200 :
 *   {
 *     id, display_name, city, country, sector,
 *     project_title, project_pitch,
 *     courses: [...],
 *     contact: {
 *       whatsapp_url: string | null,
 *       linkedin_url: string | null,
 *       instagram_url: string | null
 *     }
 *   }
 * 403 si annuaire pas accessible / profil pas opt-in / self view
 * 404 si profil inexistant
 */

const { requireUser } = require('../../lib/user-auth');
const { rateLimit } = require('../../lib/rate-limit');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(res, code, error, extra) {
    return res.status(code).json(Object.assign({ error }, extra || {}));
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

async function fetchCourses(userId) {
    const r = await sbFetch(
        `enrollments?user_id=eq.${encodeURIComponent(userId)}&status=in.(active,completed)&select=course_id&order=enrolled_at.asc`
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return rows.map(x => x.course_id);
}

function buildWhatsappUrl(e164, targetDisplayName) {
    if (!e164) return null;
    // wa.me veut le numéro SANS le + initial
    const digits = e164.replace(/^\+/, '');
    if (!/^\d{8,15}$/.test(digits)) return null;
    const greeting = `Bonjour ${targetDisplayName || ''}, je t'ai découvert(e) sur l'annuaire Cap Learning.`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(greeting)}`;
}

function buildInstagramUrl(handle) {
    if (!handle) return null;
    return `https://instagram.com/${encodeURIComponent(handle)}`;
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET') return fail(res, 405, 'Method not allowed. Utilisez GET.');
    if (!SUPABASE_URL || !SERVICE_KEY) return fail(res, 500, 'Configuration serveur incomplète.');

    if (!rateLimit(req, { max: 60, windowMs: 60_000 })) {
        return fail(res, 429, 'Trop de requêtes. Réessaie dans une minute.');
    }

    const user = await requireUser(req, res);
    if (!user) return;

    const isPaidLearner = await callerHasPaidEnrollment(user.id);
    if (!isPaidLearner) {
        return fail(res, 403, "Annuaire réservé aux apprenants Cap Learning.");
    }

    // ID cible : Vercel remplit req.query.id via le nom de fichier [id].js
    const targetId = req.query && req.query.id ? String(req.query.id).trim() : '';
    if (!UUID_REGEX.test(targetId)) return fail(res, 400, 'Identifiant invalide.');

    // Empêche l'autoconsultation via cet endpoint (l'apprenant a déjà /me pour ça)
    if (targetId === user.id) {
        return fail(res, 400, "Utilise /api/directory/me pour ton propre profil.");
    }

    // Récupère le profil (RLS permet aux opt-in visibles)
    const pRes = await sbFetch(
        `profiles?id=eq.${encodeURIComponent(targetId)}&is_directory_visible=eq.true&select=*&limit=1`
    );
    if (!pRes.ok) return fail(res, 500, 'Erreur pendant le chargement du profil.');
    const rows = await pRes.json();
    if (!rows || rows.length === 0) {
        return fail(res, 404, 'Ce profil est introuvable ou masqué.');
    }
    const p = rows[0];

    const courses = await fetchCourses(p.id);

    const whatsappUrl = p.contact_via_whatsapp
        ? buildWhatsappUrl(p.whatsapp_e164, p.display_name)
        : null;

    return res.status(200).json({
        id: p.id,
        display_name: p.display_name || 'Membre Cap Learning',
        city: p.city || null,
        country: p.country || null,
        sector: p.sector || null,
        project_title: p.project_title || null,
        project_pitch: p.project_pitch || null,
        courses,
        contact: {
            whatsapp_url: whatsappUrl,
            linkedin_url: p.linkedin_url || null,
            instagram_url: buildInstagramUrl(p.instagram_handle)
        }
    });
};
