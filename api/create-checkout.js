/**
 * /api/create-checkout
 *
 * Init une session de paiement FedaPay et renvoie (ou redirige vers) le payment_url.
 *
 * ⚠️ CONSENTEMENT OBLIGATOIRE (art. 1 et 10 des CGV)
 * ──────────────────────────────────────────────────────────────────────────────
 * Aucune session de paiement n'est créée sans les DEUX consentements :
 *   • cgv_accepted       — acceptation des conditions générales de vente
 *   • withdrawal_waived  — demande d'accès immédiat valant renonciation expresse
 *                          au droit de rétractation de 14 jours
 * La preuve est écrite dans `order_consents` AVANT l'appel à FedaPay : si elle
 * ne peut pas être enregistrée, on n'encaisse pas.
 *
 * 2 modes supportés :
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Mode A — Quick-buy — POST { course, user_id, cgv_accepted, withdrawal_waived }
 * ──────────────────────────────────────────────────────────────────────────────
 *   Utilisé par les pages formation via js/buy-flow.js, en formulaire
 *   auto-soumis. L'utilisateur DOIT être authentifié (user_id valide dans
 *   Supabase). Le serveur récupère son profile pour construire le customer.
 *
 *   Réponse : redirection HTTP 302 directe vers la page de paiement si
 *   `redirect=1` (cas du formulaire), sinon JSON.
 *
 *   ⚠️ Le GET historique (?course=...&user_id=...) est refusé : un consentement
 *   passé en query string finirait dans les logs d'accès et les en-têtes
 *   Referer — fragile juridiquement et discutable côté RGPD.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Mode B — Cart — POST { course_id, course_label, amount, customer:{...}, ... }
 * ──────────────────────────────────────────────────────────────────────────────
 *   Utilisé par panier.html (multi-items). Répond JSON
 *   { payment_url, transaction_id }, le frontend redirige.
 *
 * Dans tous les cas, on stocke `user_id` dans metadata pour que le webhook
 * crée la bonne enrollment (pas de fuzzy match par email).
 *
 * Deploys as a Vercel serverless function (Node 18+).
 */

const { randomUUID } = require('crypto');
const { initCheckout } = require('../lib/fedapay'); // paiement : FedaPay (ex-CinetPay, conservé en réf.)
const { findProfileByEmail, select } = require('../lib/supabase-admin');
const { readConsent, validateConsent, recordOrderConsent } = require('../lib/cgv-consent');

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

/**
 * Écrit la preuve du consentement. Toute erreur est fatale : mieux vaut un
 * paiement qui échoue qu'un accès vendu sans trace opposable.
 */
async function persistConsent(req, { userId, transactionId, courseId }) {
    try {
        await recordOrderConsent({ req, userId, transactionId, courseId });
    } catch (e) {
        console.error('[create-checkout] enregistrement du consentement impossible:', e.message);
        const err = new Error(
            'Le consentement n\'a pas pu être enregistré, la commande est annulée. '
            + 'Vérifiez que la table order_consents existe (scripts/db/order_consents.sql).'
        );
        err.statusCode = 500;
        throw err;
    }
}

module.exports = async function handler(req, res) {
    // CORS pour POST mode B
    res.setHeader('Access-Control-Allow-Origin', process.env.PUBLIC_BASE_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    // ──────────────────────────────────────────────────────────────────────
    // GET — refusé : le consentement ne doit jamais transiter en query string
    // ──────────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
        return res.status(400).json({
            error: 'Cette route n\'accepte plus le GET. Le consentement CGV et la '
                + 'renonciation au droit de rétractation doivent être transmis en POST '
                + '(cgv_accepted, withdrawal_waived), afin de ne pas apparaître dans les '
                + 'logs d\'accès ni dans les en-têtes Referer.'
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (e) {
        return res.status(400).json({ error: 'invalid json body' });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Garde commune aux deux modes : les deux cases doivent être cochées.
    // ──────────────────────────────────────────────────────────────────────
    const consent = readConsent(body);
    const consentCheck = validateConsent(consent);
    if (!consentCheck.ok) {
        console.warn('[create-checkout] refus, consentement incomplet:', consentCheck.missing.join(','));
        return res.status(400).json({ error: consentCheck.error, missing: consentCheck.missing });
    }

    // Le formulaire auto-soumis du quick-buy attend une redirection navigateur ;
    // le fetch JSON du panier attend une réponse JSON.
    const wantsRedirect = body.redirect === '1' || body.redirect === 1 || body.redirect === true;

    // ──────────────────────────────────────────────────────────────────────
    // Mode A — Quick-buy (POST { course, user_id, ... })
    // ──────────────────────────────────────────────────────────────────────
    if (body.course && !body.course_id) {
        try {
            const course = body.course;
            const userId = body.user_id;
            if (!userId) {
                return res.status(400).json({ error: 'Missing param: user_id is required' });
            }

            // Validation course
            const meta = COURSE_CATALOG[course];
            if (!meta) {
                return res.status(400).json({ error: 'Unknown course: ' + course });
            }

            // Validation user_id : doit correspondre à un profile Supabase
            const profile = await findProfileById(userId);
            if (!profile) {
                console.warn('[create-checkout] user_id not found in profiles:', userId);
                return res.status(401).json({ error: 'Invalid user' });
            }

            // Construit le customer FedaPay depuis le profile
            const fullName = (profile.full_name || profile.email.split('@')[0] || 'Apprenant').trim();
            const nameParts = fullName.split(/\s+/);
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ') || 'Cap Learning';
            const phone = profile.phone || '+221770000000';  // le PSP exige un phone, fallback safe
            const country = profile.country || 'SN';

            const transactionId = `CL-${Date.now()}-${randomUUID().slice(0, 8)}`;

            // Preuve AVANT paiement.
            await persistConsent(req, { userId: profile.id, transactionId, courseId: course });

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
                    customer_name: fullName,
                    customer_phone: phone,
                    country: country,
                    user_id: profile.id          // 🔑 utilisé par le webhook pour créer l'enrollment
                }
            });

            if (wantsRedirect) {
                // Redirection 302 directe → flow le plus naturel pour l'apprenant
                res.setHeader('Location', session.payment_url);
                return res.status(302).end();
            }
            return res.status(200).json({
                payment_url: session.payment_url,
                transaction_id: session.transaction_id
            });
        } catch (err) {
            console.error('[create-checkout][quick-buy] error:', err);
            return res.status(err.statusCode || 500).json({ error: err.message || 'internal error' });
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Mode B — Cart (POST avec body JSON)
    // ──────────────────────────────────────────────────────────────────────
    try {
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

        // Preuve AVANT paiement.
        await persistConsent(req, { userId: resolvedUserId, transactionId, courseId: course_id });

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
                customer_name: [customer.name, customer.surname].filter(Boolean).join(' ').trim() || customer.email.split('@')[0],
                customer_phone: customer.phone_number || null,
                country: customer.country || 'SN',
                user_id: resolvedUserId   // peut être null si email pas connu
            }
        });

        return res.status(200).json({
            payment_url: session.payment_url,
            transaction_id: session.transaction_id
        });
    } catch (err) {
        console.error('[create-checkout][cart] error:', err);
        return res.status(err.statusCode || 500).json({
            error: err.message || 'internal error',
            detail: err.cinetpayResponse || undefined
        });
    }
};
