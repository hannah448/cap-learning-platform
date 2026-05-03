/**
 * GET /api/health-check
 *
 * Endpoint de diagnostic — vérifie que :
 *   1. La fonction Vercel s'exécute
 *   2. Les env vars critiques sont présentes (sans exposer leurs valeurs)
 *   3. La connexion à Supabase fonctionne (côté serveur, service_role)
 *
 * Réponse type :
 *   {
 *     status: "ok" | "degraded",
 *     vercel: { region, ts },
 *     env: { SUPABASE_URL: true, ... },
 *     supabase: { connected: true, profiles_count: 1 }
 *   }
 *
 * À utiliser pour valider un déploiement avant prod.
 * Pas de secret exposé : on retourne juste la PRÉSENCE des env vars (true/false).
 */

const { select } = require('./lib/supabase-admin');

// Required pour que la plateforme tourne (auth + DB)
const REQUIRED_VARS = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
];

// Required pour pouvoir traiter des paiements (passerelle Wave/OM/MTN/cartes)
// En leur absence, l'auth + le dashboard fonctionnent mais le checkout est cassé.
const PAYMENT_VARS = [
    'CINETPAY_API_KEY',
    'CINETPAY_SITE_ID',
    'CINETPAY_SECRET_KEY'
];

// Optionnels — la plateforme fonctionne sans, avec dégradation contrôlée :
//   - PENNYLANE_API_KEY : sans → factures à émettre manuellement (webhook continue)
//   - PUBLIC_BASE_URL   : utile pour les URLs de retour CinetPay (sinon valeur par défaut)
const OPTIONAL_VARS = [
    'PENNYLANE_API_KEY',
    'PUBLIC_BASE_URL'
];

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const env = {};
    REQUIRED_VARS.concat(PAYMENT_VARS, OPTIONAL_VARS).forEach(function (k) {
        env[k] = !!process.env[k];
    });

    const reqComplete = REQUIRED_VARS.every(function (k) { return !!process.env[k]; });
    const payComplete = PAYMENT_VARS.every(function (k) { return !!process.env[k]; });
    const optComplete = OPTIONAL_VARS.every(function (k) { return !!process.env[k]; });

    const result = {
        status: 'ok',
        vercel: {
            region: process.env.VERCEL_REGION || 'unknown',
            ts: new Date().toISOString()
        },
        env: env,
        env_required_complete: reqComplete,    // Supabase (auth + DB)
        env_payment_complete:  payComplete,    // CinetPay (passerelle paiement)
        env_optional_complete: optComplete,    // Pennylane + base URL
        platform_ready_to_sell: reqComplete && payComplete,  // peut accepter des paiements
        supabase: { connected: false }
    };

    // Test connexion Supabase (read-only count via service_role)
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
            const rows = await select('profiles', 'select=id&limit=1');
            result.supabase = {
                connected: true,
                profiles_table_accessible: true,
                sample_count: Array.isArray(rows) ? rows.length : 0
            };
        } catch (e) {
            result.status = 'degraded';
            result.supabase = {
                connected: false,
                error: e.message
            };
        }
    } else {
        result.status = 'degraded';
        result.supabase = { connected: false, error: 'env vars missing' };
    }

    if (!result.env_required_complete) {
        result.status = 'degraded';
    }

    return res.status(200).json(result);
};
