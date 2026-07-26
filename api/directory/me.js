/**
 * PUT /api/directory/me
 * ---------------------
 * Édite le profil annuaire de l'apprenant connecté.
 * Corps JSON (tous les champs sont optionnels) :
 *   {
 *     is_directory_visible?: boolean,
 *     display_name?: string (1-60),
 *     city?: string (1-60),
 *     country?: string (ISO 2 lettres, dans la liste blanche),
 *     sector?: string (dans l'enum SECTOR_KEYS),
 *     project_title?: string (max 80),
 *     project_pitch?: string (max 300),
 *     whatsapp_e164?: string (regex E.164),
 *     linkedin_url?: string (regex LinkedIn),
 *     instagram_handle?: string (max 30, alphanum + . _),
 *     contact_via_whatsapp?: boolean
 *   }
 *
 * Réponses :
 *   200 { ok: true, profile: {...} }
 *   400 { error, field?, hint? }   validation
 *   401 { error }                  auth manquante/invalide
 *   405 / 500
 */

const { update } = require('../lib/supabase-admin');
const { requireUser } = require('../lib/user-auth');
const {
    SECTOR_KEYS,
    COUNTRY_ISO,
    WHATSAPP_REGEX,
    LINKEDIN_REGEX,
    LIMITS
} = require('../lib/directory-constants');

// Whitelist des champs éditables (tout le reste est ignoré silencieusement)
const EDITABLE = [
    'is_directory_visible', 'display_name', 'city', 'country', 'sector',
    'project_title', 'project_pitch', 'whatsapp_e164', 'linkedin_url',
    'instagram_handle', 'contact_via_whatsapp'
];

// Sanitize XSS : refuse toute chaîne contenant du HTML.
// (Simple et efficace : les champs sont du texte brut, pas de markup autorisé.)
const HTML_TAG = /[<>]/;
const INSTAGRAM_HANDLE = /^[a-zA-Z0-9._]{1,30}$/;

function fail(res, code, error, extra) {
    return res.status(code).json(Object.assign({ error }, extra || {}));
}

function validate(body) {
    const patch = {};

    for (const key of EDITABLE) {
        if (!(key in body)) continue;
        const v = body[key];

        // Booléens
        if (key === 'is_directory_visible' || key === 'contact_via_whatsapp') {
            if (typeof v !== 'boolean') {
                return { error: { code: 400, field: key, msg: `${key} doit être un booléen.` } };
            }
            patch[key] = v;
            continue;
        }

        // null / '' = effacement du champ
        if (v === null || v === '') { patch[key] = null; continue; }

        if (typeof v !== 'string') {
            return { error: { code: 400, field: key, msg: `${key} doit être une chaîne.` } };
        }

        const trimmed = v.trim();
        if (HTML_TAG.test(trimmed)) {
            return { error: { code: 400, field: key, msg: 'Les caractères < et > ne sont pas autorisés.' } };
        }

        switch (key) {
            case 'country':
                if (!COUNTRY_ISO.includes(trimmed.toUpperCase())) {
                    return { error: { code: 400, field: key, msg: 'Pays non autorisé.', hint: `Utilisez un code ISO parmi : ${COUNTRY_ISO.join(', ')}` } };
                }
                patch[key] = trimmed.toUpperCase();
                break;

            case 'sector':
                if (!SECTOR_KEYS.includes(trimmed)) {
                    return { error: { code: 400, field: key, msg: 'Secteur inconnu.' } };
                }
                patch[key] = trimmed;
                break;

            case 'whatsapp_e164':
                if (!WHATSAPP_REGEX.test(trimmed)) {
                    return { error: { code: 400, field: key, msg: 'Numéro WhatsApp invalide.', hint: 'Format attendu : +221771234567' } };
                }
                patch[key] = trimmed;
                break;

            case 'linkedin_url':
                if (trimmed.length > LIMITS.linkedin_url.max) {
                    return { error: { code: 400, field: key, msg: `URL LinkedIn trop longue (max ${LIMITS.linkedin_url.max}).` } };
                }
                if (!LINKEDIN_REGEX.test(trimmed)) {
                    return { error: { code: 400, field: key, msg: 'URL LinkedIn invalide.', hint: 'Format attendu : https://linkedin.com/in/xxx' } };
                }
                patch[key] = trimmed;
                break;

            case 'instagram_handle': {
                // On accepte "@fatou" ou "fatou" — on retire un @ initial.
                const cleaned = trimmed.replace(/^@/, '');
                if (!INSTAGRAM_HANDLE.test(cleaned)) {
                    return { error: { code: 400, field: key, msg: 'Nom Instagram invalide.', hint: 'Lettres, chiffres, points et underscores uniquement (max 30).' } };
                }
                patch[key] = cleaned;
                break;
            }

            case 'display_name':
            case 'city':
            case 'project_title':
            case 'project_pitch': {
                const max = LIMITS[key].max;
                if (trimmed.length > max) {
                    return { error: { code: 400, field: key, msg: `${key} trop long (max ${max} caractères).` } };
                }
                patch[key] = trimmed;
                break;
            }
        }
    }

    return { patch };
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'PUT' && req.method !== 'PATCH') {
        return fail(res, 405, 'Method not allowed. Utilisez PUT.');
    }

    // 1. Auth
    const user = await requireUser(req, res);
    if (!user) return; // 401 déjà envoyé

    // 2. Parse body
    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (e) {
        return fail(res, 400, 'JSON invalide.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return fail(res, 400, 'Corps JSON attendu (objet).');
    }

    // 3. Validation
    const { patch, error } = validate(body);
    if (error) return fail(res, error.code, error.msg, { field: error.field, hint: error.hint });
    if (Object.keys(patch).length === 0) {
        return fail(res, 400, 'Aucun champ modifiable dans le corps.');
    }

    // 4. Update (via service_role — on filtre explicitement sur id = user.id)
    // Le trigger touch_directory_updated_at gère l'horodatage RGPD.
    try {
        const rows = await update(
            'profiles',
            `id=eq.${encodeURIComponent(user.id)}&select=*`,
            patch
        );
        const profile = Array.isArray(rows) ? rows[0] : rows;
        if (!profile) {
            return fail(res, 404, 'Profil introuvable.');
        }
        // Ne jamais renvoyer role ni infos sensibles autres que celles éditables + rappels
        return res.status(200).json({
            ok: true,
            profile: {
                id: profile.id,
                is_directory_visible: profile.is_directory_visible,
                directory_opted_in_at: profile.directory_opted_in_at,
                display_name: profile.display_name,
                city: profile.city,
                country: profile.country,
                sector: profile.sector,
                project_title: profile.project_title,
                project_pitch: profile.project_pitch,
                whatsapp_e164: profile.whatsapp_e164,
                linkedin_url: profile.linkedin_url,
                instagram_handle: profile.instagram_handle,
                contact_via_whatsapp: profile.contact_via_whatsapp,
                directory_updated_at: profile.directory_updated_at
            }
        });
    } catch (e) {
        console.error('[directory/me] update failed:', e.message);
        return fail(res, 500, 'Erreur serveur pendant la mise à jour.');
    }
};
