/**
 * POST /api/invite-user
 *
 * Invite un nouvel utilisateur par email et lui attribue un niveau d'accès.
 * -------------------------------------------------------------------------
 * Sécurité :
 *   - L'appelant DOIT être authentifié et avoir le rôle 'admin'.
 *     On vérifie son jeton (Authorization: Bearer <access_token>) auprès de
 *     Supabase, puis on relit son profile pour confirmer role === 'admin'.
 *   - Le service_role_key ne quitte jamais le serveur (voir lib/supabase-admin).
 *
 * Corps attendu (JSON) :
 *   { email: "x@y.com", name?: "Prénom Nom", role: "admin"|"editor"|"apprenant" }
 *
 * Effet :
 *   1. Envoie l'email d'invitation Supabase (l'utilisateur crée son mot de passe).
 *   2. Pose le niveau d'accès (profiles.role) via upsert (service_role).
 *
 * Prérequis déploiement (Vercel → Environment Variables) :
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Prérequis base : la colonne profiles.role doit accepter la valeur 'editor'
 *   (si un CHECK limite à 'admin'/'apprenant', l'étendre à 'editor').
 */

const { upsert, findProfileByEmail } = require('./lib/supabase-admin');

const ROLES = ['admin', 'editor', 'apprenant'];

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function svcHeaders() {
    return {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
}

// Résout l'utilisateur appelant à partir de son access_token.
async function resolveCaller(token) {
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
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!SUPABASE_URL || !SERVICE_KEY) {
        return res.status(500).json({ error: 'Configuration serveur incomplète (env Supabase manquantes).' });
    }

    // 1. Jeton de l'appelant
    const authz = req.headers['authorization'] || '';
    const token = authz.indexOf('Bearer ') === 0 ? authz.slice(7).trim() : null;
    if (!token) {
        return res.status(401).json({ error: 'Authentification requise.' });
    }

    // 2. Vérifie que l'appelant est admin
    let caller;
    try {
        caller = await resolveCaller(token);
    } catch (e) {
        return res.status(401).json({ error: 'Jeton invalide.' });
    }
    if (!caller || !caller.email) {
        return res.status(401).json({ error: 'Jeton invalide.' });
    }
    let callerProfile;
    try {
        callerProfile = await findProfileByEmail(caller.email);
    } catch (e) {
        return res.status(500).json({ error: 'Impossible de vérifier les droits.' });
    }
    if (!callerProfile || callerProfile.role !== 'admin') {
        return res.status(403).json({ error: 'Réservé aux administrateurs.' });
    }

    // 3. Valide le corps
    const body = req.body || {};
    const email = (body.email || '').trim().toLowerCase();
    const name = (body.name || '').trim();
    const role = body.role;
    if (!email || email.indexOf('@') === -1) {
        return res.status(400).json({ error: 'Email invalide.' });
    }
    if (ROLES.indexOf(role) === -1) {
        return res.status(400).json({ error: 'Niveau d\'accès inconnu.' });
    }

    // 4. Envoie l'invitation (crée l'utilisateur auth + email de définition du mot de passe)
    //    redirect_to = page où l'invité définit son mot de passe.
    //    (Cette URL doit être autorisée dans Supabase → Auth → URL Configuration → Redirect URLs.)
    const base = (process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`).replace(/\/$/, '');
    const redirectTo = `${base}/pages/definir-mot-de-passe.html`;
    let invitedUser = null;
    let alreadyExists = false;
    try {
        const inviteUrl = `${SUPABASE_URL}/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`;
        const inviteRes = await fetch(inviteUrl, {
            method: 'POST',
            headers: svcHeaders(),
            body: JSON.stringify({
                email: email,
                data: { full_name: name, role: role }
            })
        });
        if (inviteRes.ok) {
            invitedUser = await inviteRes.json();
        } else {
            const txt = await inviteRes.text();
            // Déjà inscrit → on ne renvoie pas d'invitation, on met juste le rôle à jour.
            if (/already|registered|exists/i.test(txt)) {
                alreadyExists = true;
            } else {
                return res.status(502).json({ error: 'Invitation Supabase échouée : ' + txt });
            }
        }
    } catch (e) {
        return res.status(502).json({ error: 'Invitation Supabase échouée : ' + e.message });
    }

    // 5. Pose le niveau d'accès sur le profile.
    //    Conflit sur la clé primaire 'id' (toujours unique). On récupère l'id :
    //    soit depuis l'invitation, soit depuis le profile existant.
    try {
        let profileId = invitedUser && invitedUser.id ? invitedUser.id : null;
        if (!profileId) {
            const existing = await findProfileByEmail(email);
            profileId = existing && existing.id ? existing.id : null;
        }
        const row = { email: email, role: role };
        if (name) row.full_name = name;
        if (profileId) {
            row.id = profileId;
            await upsert('profiles', row, { onConflict: 'id' });
        } else {
            // Pas d'id connu (le trigger n'a pas encore créé le profile) : insertion simple.
            await upsert('profiles', row);
        }
    } catch (e) {
        return res.status(500).json({
            error: 'Utilisateur créé mais niveau d\'accès non appliqué : ' + e.message
        });
    }

    return res.status(200).json({
        ok: true,
        email: email,
        role: role,
        invited: !alreadyExists,
        updated_existing: alreadyExists
    });
};
