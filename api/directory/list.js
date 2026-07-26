/**
 * GET /api/directory/list
 * -----------------------
 * Liste paginée des membres opt-in de l'annuaire Cap Learning.
 *
 * Auth requise. L'appelant DOIT avoir au moins un enrollment actif ou terminé
 * (sinon 403) — l'annuaire est réservé aux apprenants payants.
 *
 * Query params (tous optionnels sauf pagination) :
 *   country   ISO 2 lettres, ex. SN
 *   city      libre, ILIKE %city%
 *   sector    enum sector
 *   course    course_id, ex. marketing (croisé avec enrollments actifs)
 *   q         recherche libre sur display_name + project_title
 *   page      défaut 1
 *   limit     défaut 24, max 50
 *
 * Réponse : { total, page, results: [ card, ... ] }
 * Ne renvoie JAMAIS whatsapp_e164 / linkedin_url / instagram_handle / project_pitch
 * (ces champs sortent uniquement via GET /api/directory/profile/:id).
 */

const { requireUser } = require('../../lib/user-auth');
const { rateLimit } = require('../../lib/rate-limit');
const { SECTOR_KEYS, COUNTRY_ISO } = require('../../lib/directory-constants');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;

// Champs sûrs pour la vue "carte" (jamais de contact direct ici)
const CARD_FIELDS = [
    'id', 'display_name', 'city', 'country', 'sector', 'project_title',
    'directory_updated_at'
].join(',');

function fail(res, code, error, extra) {
    return res.status(code).json(Object.assign({ error }, extra || {}));
}

// Autorise seulement des caractères sûrs dans la recherche libre.
// Refuse tout ce qui pourrait injecter une syntaxe PostgREST (, ) : etc.
function sanitizeSearch(q) {
    if (typeof q !== 'string') return null;
    const cleaned = q.trim().replace(/[^\p{L}\p{N}\s\-']/gu, '').slice(0, 60);
    return cleaned.length >= 2 ? cleaned : null;
}

// Normalise pour la recherche accent-insensible : minuscules + suppression des
// diacritiques. Doit correspondre à la colonne SQL `directory_search_norm`
// (voir scripts/db/directory_search.sql).
function normalize(str) {
    return String(str).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

// Découpe la recherche en tokens de 2+ caractères, normalisés. Chaque token
// devient un ILIKE sur `directory_search_norm` ; les tokens sont AND-ed.
// Exemple : "Sénégal wax" → ["senegal", "wax"] → matche un profil qui contient
// les deux termes dans son nom / titre / pitch (ignorant les accents).
function tokenize(q) {
    return normalize(q).split(/\s+/).filter(w => w.length >= 2).slice(0, 4);
}

async function sbFetch(path, extraHeaders) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'GET',
        headers: Object.assign({
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Accept': 'application/json'
        }, extraHeaders || {})
    });
    return res;
}

/**
 * Vérifie que l'appelant a au moins 1 enrollment actif/terminé.
 * Retourne true/false.
 */
async function callerHasPaidEnrollment(userId) {
    const q = `enrollments?user_id=eq.${encodeURIComponent(userId)}&status=in.(active,completed)&select=id&limit=1`;
    const res = await sbFetch(q);
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
}

/**
 * Retourne la Map<profile_id, [course_id, ...]> pour un lot de profils.
 * (Utilisé pour afficher les chips de formations sur chaque carte.)
 */
async function fetchCoursesForProfiles(profileIds) {
    if (profileIds.length === 0) return {};
    const list = profileIds.map(encodeURIComponent).join(',');
    const q = `enrollments?user_id=in.(${list})&status=in.(active,completed)&select=user_id,course_id`;
    const res = await sbFetch(q);
    if (!res.ok) return {};
    const rows = await res.json();
    const map = {};
    for (const r of rows) {
        (map[r.user_id] = map[r.user_id] || []).push(r.course_id);
    }
    return map;
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET') return fail(res, 405, 'Method not allowed. Utilisez GET.');
    if (!SUPABASE_URL || !SERVICE_KEY) return fail(res, 500, 'Configuration serveur incomplète.');

    // 1. Rate limit best-effort
    if (!rateLimit(req, { max: 60, windowMs: 60_000 })) {
        return fail(res, 429, 'Trop de requêtes. Réessaie dans une minute.');
    }

    // 2. Auth
    const user = await requireUser(req, res);
    if (!user) return; // 401 déjà envoyé

    // 3. Gate : au moins un enrollment payé
    const isPaidLearner = await callerHasPaidEnrollment(user.id);
    if (!isPaidLearner) {
        return fail(res, 403, "Annuaire réservé aux apprenants Cap Learning. Inscris-toi à une formation pour y accéder.");
    }

    // 4. Parse & valide les filtres
    const qp = req.query || {};

    const filters = ['is_directory_visible=eq.true'];

    if (qp.country) {
        const iso = String(qp.country).toUpperCase();
        if (!COUNTRY_ISO.includes(iso)) return fail(res, 400, 'Pays inconnu.', { field: 'country' });
        filters.push(`country=eq.${encodeURIComponent(iso)}`);
    }
    if (qp.sector) {
        if (!SECTOR_KEYS.includes(qp.sector)) return fail(res, 400, 'Secteur inconnu.', { field: 'sector' });
        filters.push(`sector=eq.${encodeURIComponent(qp.sector)}`);
    }
    if (qp.city) {
        const city = String(qp.city).trim().slice(0, 60);
        if (city.length >= 2) {
            filters.push(`city=ilike.*${encodeURIComponent(city)}*`);
        }
    }

    // Filtre par formation suivie → 1 requête préalable sur enrollments
    if (qp.course) {
        const courseId = String(qp.course).trim().slice(0, 40);
        if (!/^[a-z0-9-]+$/.test(courseId)) {
            return fail(res, 400, 'Course_id invalide.', { field: 'course' });
        }
        const eRes = await sbFetch(
            `enrollments?course_id=eq.${encodeURIComponent(courseId)}&status=in.(active,completed)&select=user_id`
        );
        if (!eRes.ok) return fail(res, 500, 'Erreur pendant le filtrage par formation.');
        const eRows = await eRes.json();
        const ids = [...new Set(eRows.map(r => r.user_id))];
        if (ids.length === 0) {
            return res.status(200).json({ total: 0, page: 1, results: [] });
        }
        filters.push(`id=in.(${ids.map(encodeURIComponent).join(',')})`);
    }

    // Recherche libre : multi-mots AND, accent-insensible, sur la colonne
    // calculée `directory_search_norm` (voir scripts/db/directory_search.sql).
    const search = sanitizeSearch(qp.q);
    if (search) {
        const tokens = tokenize(search);
        // Chaque token = un filtre ILIKE (les filtres PostgREST séparés sont AND-ed).
        tokens.forEach(t => {
            filters.push(`directory_search_norm=ilike.*${encodeURIComponent(t)}*`);
        });
    }

    // 5. Pagination
    const page = Math.max(1, parseInt(qp.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(qp.limit, 10) || DEFAULT_LIMIT));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // 6. Query principale avec count exact
    const url = `profiles?${filters.join('&')}&select=${CARD_FIELDS}&order=directory_updated_at.desc`;
    const mainRes = await sbFetch(url, {
        'Range-Unit': 'items',
        'Range': `${from}-${to}`,
        'Prefer': 'count=exact'
    });
    if (!mainRes.ok) {
        const txt = await mainRes.text();
        console.error('[directory/list] main query failed:', mainRes.status, txt);
        return fail(res, 500, 'Erreur pendant la recherche.');
    }
    const rows = await mainRes.json();

    // Content-Range: "0-23/142"
    const contentRange = mainRes.headers.get('content-range') || '';
    const total = parseInt((contentRange.split('/')[1] || '0'), 10) || rows.length;

    // 7. Enrichissement : formations suivies (chips sur les cartes)
    const coursesByUser = await fetchCoursesForProfiles(rows.map(r => r.id));

    const results = rows.map(r => ({
        id: r.id,
        display_name: r.display_name || 'Membre Cap Learning',
        city: r.city || null,
        country: r.country || null,
        sector: r.sector || null,
        project_title: r.project_title || null,
        courses: coursesByUser[r.id] || []
    }));

    return res.status(200).json({ total, page, results });
};
