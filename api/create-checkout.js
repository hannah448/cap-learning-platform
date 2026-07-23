/**
 * /api/create-checkout
 *
 * Init une session de paiement CinetPay et renvoie (ou redirige vers) le payment_url.
 *
 * 2 modes supportés :
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Mode A — Quick-buy (recommandé) — GET ?course=<slug>&user_id=<uuid>
 * ──────────────────────────────────────────────────────────────────────────────
 *   Utilisé par les pages formation. L'utilisateur DOIT être authentifié
 *   (user_id valide dans Supabase). Le serveur récupère son profile pour
 *   construire le customer CinetPay automatiquement.
 *
 *   Réponse : redirection HTTP 302 directe vers la page de paiement CinetPay.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Mode B — Cart legacy — POST { course_id, course_label, amount, customer:{...} }
 * ──────────────────────────────────────────────────────────────────────────────
 *   Utilisé par panier.html (multi-items). Garde le comportement historique :
 *   répond JSON { payment_url, transaction_id }, le frontend redirige.
 *   Si user_id est passé en plus dans le body, on le valide aussi (sécurise).
 *
 * Dans tous les cas, on stocke `user_id` dans metadata pour que le webhook
 * crée la bonne enrollment (pas de fuzzy match par email).
 *
 * Deploys as a Vercel serverless function (Node 18+).
 */

const { randomUUID } = require('crypto');
const { initCheckout } = require('./lib/cinetpay');
const { findProfileByEmail, select } = require('./lib/supabase-admin');

// Catalogue serveur-source-de-vérité pour les prix (évite tout tampering client)
const COURSE_CATALOG = {
    'marketing':       { label: 'Marketing Digital Complet',           priceXof: 25000 },
    'ecommerce':       { label: 'E-commerce & Paiements Digitaux',     priceXof: 30000 },
    'ia-business':     { label: 'IA & Business — Automatisation & Agents IA', priceXof: 30000 },
    'reseaux-sociaux': { label: 'Réseaux Sociaux & Community Management', priceXof: 18000 }
};

async function findProfileById(userId) {
    if (!userId) return null;
    try {
        const rows = await select('profiles', 'id=eq.' + encodeURIComponent(userId) + '&select=id,email,full_name,phone,country&limit=1');
        return rows && rows[0] ? rows[0] : null;
    } catch (e) {
        console.error('[create-checkout] findProfileById error:', e.message);
        return null;
    }
}

module.exports = async function handler(req, res) {
    // CORS pour POST mode B
    res.setHeader('Access-Control-Allow-Origin', process.env.PUBLIC_BASE_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    // ──────────────────────────────────────────────────────────────────────
    // Mode A — Quick-buy (GET ?course=...&user_id=...)
    // ──────────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
        try {
            const { course, user_id } = req.query || {};
            if (!course || !user_id) {
                return res.status(400).json({ error: 'Missing query params: course and user_id are required' });
            }

            // Validation course
            const meta = COURSE_CATALOG[course];
            if (!meta) {
                return res.status(400).json({ error: 'Unknown course: ' + course });
            }

            // Validation user_id : doit correspondre à un profile Supabase
            const profile = await findProfileById(user_id);
            if (!profile) {
                console.warn('[create-checkout] user_id not found in profiles:', user_id);
                return res.status(401).json({ error: 'Invalid user' });
            }

            // Construit le customer CinetPay depuis le profile
            const fullName = (profile.full_name || profile.email.split('@')[0] || 'Apprenant').trim();
            const nameParts = fullName.split(/\s+/);
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ') || 'Cap Learning';
            const phone = profile.phone || '+221770000000';  // CinetPay exige un phone, fallback safe
            const country = profile.country || 'SN';

            const transactionId = `CL-${Date.now()}-${randomUUID().slice(0, 8)}`;

            const session = await initCheckout({
                transactionId,
                amount: meta.priceXof,
                currency: 'XOF',
                description: meta.label.slice(0, 80),
                customer: {
                    name: firstName,
                    surname: lastName,
                    email: profile.email,
                    phone_number: phone,
                    country: country,
                    state: country,
                    zip_code: '00000'
                },
                channels: 'ALL',
                metadata: {
                    course_id: course,           // alias pour compat
                    course_db_id: course,
                    course_label: meta.label,
                    customer_email: profile.email,
                    user_id: profile.id          // 🔑 utilisé par le webhook pour créer l'enrollment
                }
            });

            // Redirection 302 directe vers CinetPay → flow le plus naturel pour l'apprenant
            res.setHeader('Location', session.payment_url);
            return res.status(302).end();
        } catch (err) {
            console.error('[create-checkout][GET] error:', err);
            return res.status(500).json({ error: err.message || 'internal error' });
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Mode B — Cart legacy (POST avec body JSON)
    // ──────────────────────────────────────────────────────────────────────
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const {
            course_id,
            course_label,
            amount,
            currency = 'XOF',
            customer,
            user_id   // optionnel — si fourni, on valide
        } = body;

        // Validation params
        if (!course_id || !course_label) {
            return res.status(400).json({ error: 'course_id and course_label are required' });
        }
        if (!Number.isInteger(amount) || amount <= 0) {
            return res.status(400).json({ error: 'amount must be a positive integer (XOF, no decimals)' });
        }
        if (!customer || !customer.email || !customer.phone_number) {
            return res.status(400).json({ error: 'customer.email and customer.phone_number are required' });
        }
        if (currency === 'XOF' && (amount < 100 || amount % 5 !== 0)) {
            return res.status(400).json({ error: 'XOF amount must be >= 100 and a multiple of 5' });
        }

        // Si user_id fourni → on valide qu'il existe (sécu)
        let resolvedUserId = null;
        if (user_id) {
            const p = await findProfileById(user_id);
            if (!p) {
                return res.status(401).json({ error: 'Invalid user' });
            }
            resolvedUserId = p.id;
        } else {
            // Fallback : tente de trouver par email (best-effort)
            const p = await findProfileByEmail(customer.email);
            if (p) resolvedUserId = p.id;
        }

        const transactionId = `CL-${Date.now()}-${randomUUID().slice(0, 8)}`;

        const session = await initCheckout({
            transactionId,
            amount,
            currency,
            description: course_label.slice(0, 80),
            customer: {
                name: customer.name || 'Client',
                surname: customer.surname || 'Cap Learning',
                email: customer.email,
                phone_number: customer.phone_number,
                address: customer.address,
                city: customer.city,
                country: customer.country || 'SN',
                state: customer.state || customer.country || 'SN',
                zip_code: customer.zip_code || '00000'
            },
            channels: 'ALL',
            metadata: {
                course_id,
                course_db_id: course_id,
                course_label,
                customer_email: customer.email,
                user_id: resolvedUserId   // peut être null si email pas connu
            }
        });

        return res.status(200).json({
            payment_url: session.payment_url,
            transaction_id: session.transaction_id
        });
    } catch (err) {
        console.error('[create-checkout][POST] error:', err);
        return res.status(500).json({
            error: err.message || 'internal error',
            detail: err.cinetpayResponse || undefined
        });
    }
};
