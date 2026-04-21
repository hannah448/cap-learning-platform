/**
 * CinetPay webhook signature verification (HMAC-SHA256).
 *
 * CinetPay sends an `x-token` header (HMAC of concatenated form fields with your
 * secret key). We recompute it and compare in constant time.
 *
 * Docs: https://docs.cinetpay.com/api/1.0-fr/checkout/hmac
 */
const crypto = require('crypto');

/**
 * Fields concatenated for the HMAC, in this exact order.
 */
const HMAC_FIELDS = [
    'cpm_site_id',
    'cpm_trans_id',
    'cpm_trans_date',
    'cpm_amount',
    'cpm_currency',
    'signature',
    'payment_method',
    'cel_phone_num',
    'cpm_phone_prefixe',
    'cpm_language',
    'cpm_version',
    'cpm_payment_config',
    'cpm_page_action',
    'cpm_custom',
    'cpm_designation',
    'cpm_error_message',
];

/**
 * @param {object} body - Parsed form-urlencoded body from the webhook POST
 * @param {string} receivedToken - Value of the `x-token` request header
 * @returns {boolean} true if signature matches
 */
function verifyCinetPayWebhook(body, receivedToken) {
    const secret = process.env.CINETPAY_SECRET_KEY;
    if (!secret) throw new Error('CINETPAY_SECRET_KEY missing');
    if (!receivedToken) return false;

    const dataString = HMAC_FIELDS.map((f) => body[f] ?? '').join('');
    const computed = crypto
        .createHmac('sha256', secret)
        .update(dataString)
        .digest('hex');

    // Constant-time compare to avoid timing attacks
    const a = Buffer.from(computed, 'utf8');
    const b = Buffer.from(receivedToken, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

module.exports = { verifyCinetPayWebhook };
