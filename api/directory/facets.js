/**
 * GET /api/directory/facets
 * -------------------------
 * Renvoie les compteurs par pays / secteur pour peupler les filtres
 * de l'annuaire, plus la liste des villes distinctes par pays
 * (pour l'autocomplete du champ ville).
 *
 * Auth requise + gate enrollment payé (mêmes règles que /list).
 *
 * Réponse :
 * {
 *   total: 142,
 *   countries: [{ iso: "SN", count: 42 }, ...],   trié DESC
 *   sectors:   [{ key: "mode-textile", count: 8 }, ...],   trié DESC
 *   cities_by_country: { "SN": ["Dakar", "Thiès", "Saint-Louis"], "CI": [...] }
 * }
 *
 * Implémentation : on agrège en mémoire (OK jusqu'à quelques milliers de
 * profils). Si besoin de scaler, remplacer par une vue Postgres ou un RPC.
 */

const { requireUser } = require('../lib/user-auth');
const { rateLimit } = require('../lib/rate-limit');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cap dur pour éviter de tirer 100k lignes si la table explose un jour
const MAX_PROFILES = 5000;
// Cap de villes par pays retournées (les plus fréquentes)
const CITIES_PER_COUNTRY = 30;

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

module.exports = async function handler(req, res) {
    // 60 secondes de cache privé — les compteurs bougent lentement
    res.setHeader('Cache-Control', 'private, max-age=60');

    if (req.method !== 'GET') return fail(res, 405, 'Method not allowed.');
    if (!SUPABASE_URL || !SERVICE_KEY) return fail(res, 500, 'Configuration serveur incomplète.');

    if (!rateLimit(req, { max: 30, windowMs: 60_000 })) {
        return fail(res, 429, 'Trop de requêtes. Réessaie dans une minute.');
    }

    const user = await requireUser(req, res);
    if (!user) return;

    if (!(await callerHasPaidEnrollment(user.id))) {
        return fail(res, 403, "Annuaire réservé aux apprenants Cap Learning.");
    }

    // Tire les colonnes minimales : country, sector, city
    const r = await sbFetch(
        `profiles?is_directory_visible=eq.true&select=country,sector,city&limit=${MAX_PROFILES}`
    );
    if (!r.ok) {
        console.error('[directory/facets] fetch failed:', r.status);
        return fail(res, 500, 'Erreur pendant le calcul des filtres.');
    }
    const rows = await r.json();

    const countryCounts = new Map();
    const sectorCounts  = new Map();
    const cityCountsByCountry = new Map(); // iso -> Map<city, count>

    for (const p of rows) {
        if (p.country) countryCounts.set(p.country, (countryCounts.get(p.country) || 0) + 1);
        if (p.sector)  sectorCounts.set(p.sector, (sectorCounts.get(p.sector) || 0) + 1);
        if (p.country && p.city) {
            const norm = p.city.trim();
            if (!norm) continue;
            if (!cityCountsByCountry.has(p.country)) cityCountsByCountry.set(p.country, new Map());
            const m = cityCountsByCountry.get(p.country);
            m.set(norm, (m.get(norm) || 0) + 1);
        }
    }

    const countries = [...countryCounts.entries()]
        .map(([iso, count]) => ({ iso, count }))
        .sort((a, b) => b.count - a.count);

    const sectors = [...sectorCounts.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);

    const cities_by_country = {};
    for (const [iso, m] of cityCountsByCountry) {
        cities_by_country[iso] = [...m.entries()]
            .sort((a, b) => b[1] - a[1])   // les plus fréquentes d'abord
            .slice(0, CITIES_PER_COUNTRY)
            .map(([city]) => city);
    }

    return res.status(200).json({
        total: rows.length,
        countries,
        sectors,
        cities_by_country
    });
};
