/**
 * User auth — résolution d'un access_token utilisateur en profil Cap Learning
 * ---------------------------------------------------------------------------
 * Utilisé par les endpoints qui parlent au nom d'un apprenant (annuaire, etc.).
 * Vérifie le JWT via l'API Auth Supabase puis renvoie { id, email } ou null.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Extrait le token "Authorization: Bearer <token>" d'une requête Vercel.
 */
function extractBearer(req) {
    const authz = req.headers['authorization'] || req.headers['Authorization'] || '';
    return authz.indexOf('Bearer ') === 0 ? authz.slice(7).trim() : null;
}

/**
 * Résout le user Supabase à partir de son access_token.
 * Retourne { id, email, ... } ou null si invalide.
 */
async function resolveUser(token) {
    if (!token || !SUPABASE_URL || !SERVICE_KEY) return null;
    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            method: 'GET',
            headers: {
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        if (!res.ok) return null;
        return res.json();
    } catch (e) {
        return null;
    }
}

/**
 * Middleware helper : renvoie le user auth ou envoie 401 et retourne null.
 * Usage :
 *   const user = await requireUser(req, res);
 *   if (!user) return;   // response déjà envoyée
 */
async function requireUser(req, res) {
    const token = extractBearer(req);
    if (!token) {
        res.status(401).json({ error: 'Authentification requise.' });
        return null;
    }
    const user = await resolveUser(token);
    if (!user || !user.id) {
        res.status(401).json({ error: 'Jeton invalide ou expiré.' });
        return null;
    }
    return user;
}

/**
 * Middleware helper : renvoie le user auth ET vérifie que role === 'admin'.
 * Envoie 401 ou 403 si nécessaire et retourne null.
 */
async function requireAdmin(req, res) {
    const user = await requireUser(req, res);
    if (!user) return null;
    try {
        const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`;
        const r = await fetch(url, {
            headers: {
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'Accept': 'application/json'
            }
        });
        if (!r.ok) { res.status(500).json({ error: 'Impossible de vérifier le rôle.' }); return null; }
        const rows = await r.json();
        if (!rows[0] || rows[0].role !== 'admin') {
            res.status(403).json({ error: 'Accès réservé aux administrateurs.' });
            return null;
        }
        return user;
    } catch (e) {
        res.status(500).json({ error: 'Erreur pendant la vérification du rôle.' });
        return null;
    }
}

module.exports = { extractBearer, resolveUser, requireUser, requireAdmin };
