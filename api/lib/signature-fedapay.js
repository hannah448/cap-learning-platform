/**
 * Vérification de signature des webhooks FedaPay (HMAC-SHA256).
 *
 * FedaPay envoie l'en-tête `X-FEDAPAY-SIGNATURE` au format Stripe-like :
 *     t=<timestamp>,s=<signature_hex>
 * La signature est le HMAC-SHA256 de `<timestamp>.<corps_brut>` avec le secret
 * de l'endpoint webhook (visible dans le dashboard FedaPay → Webhooks).
 *
 * ⚠️ Nécessite le CORPS BRUT de la requête (pas le JSON déjà parsé) — voir
 * api/webhook-fedapay.js qui désactive le bodyParser pour lire le flux brut.
 *
 * Docs : https://docs.fedapay.com/integration-api/fr/webhooks-fr
 */
const crypto = require('crypto');

const TOLERANCE_SECONDS = 5 * 60; // rejette les signatures de plus de 5 min (anti-replay)

/**
 * @param {string} rawBody     - corps brut exact reçu (string)
 * @param {string} sigHeader   - valeur de l'en-tête x-fedapay-signature
 * @param {object} [opts]      - { skipTimestampCheck: bool }
 * @returns {boolean}
 */
function verifyFedaPayWebhook(rawBody, sigHeader, opts = {}) {
    const secret = process.env.FEDAPAY_WEBHOOK_SECRET;
    if (!secret) throw new Error('FEDAPAY_WEBHOOK_SECRET missing');
    if (!sigHeader || typeof rawBody !== 'string') return false;

    // Parse "t=...,s=..." (tolère aussi une signature hex brute)
    const parts = {};
    String(sigHeader).split(',').forEach((kv) => {
        const idx = kv.indexOf('=');
        if (idx > -1) parts[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
    });
    const t = parts.t;
    const received = parts.s || parts.sha256 || parts.signature || (Object.keys(parts).length === 0 ? String(sigHeader).trim() : null);
    if (!received) return false;

    // Anti-replay : le timestamp ne doit pas être trop vieux
    if (t && !opts.skipTimestampCheck) {
        const ts = parseInt(t, 10);
        if (!Number.isFinite(ts)) return false;
        const nowSec = Math.floor(Date.now() / 1000);
        if (Math.abs(nowSec - ts) > TOLERANCE_SECONDS) return false;
    }

    const signedPayload = t ? `${t}.${rawBody}` : rawBody;
    const computed = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

    const a = Buffer.from(computed, 'utf8');
    const b = Buffer.from(received, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

module.exports = { verifyFedaPayWebhook };
