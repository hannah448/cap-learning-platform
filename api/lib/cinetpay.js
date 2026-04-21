/**
 * CinetPay API wrapper
 * -------------------
 * Supports: Wave (SN/CI), Orange Money, MTN, Moov, Free Money, cartes bancaires
 * Docs: https://docs.cinetpay.com/api/1.0-fr/checkout/initialisation
 *
 * Env vars required:
 *   CINETPAY_API_KEY       - API key from dashboard
 *   CINETPAY_SITE_ID       - Site ID from dashboard
 *   CINETPAY_SECRET_KEY    - For webhook HMAC verification
 *   PUBLIC_BASE_URL        - e.g. https://caplearning.com (for return/notify URLs)
 */

const API_BASE = 'https://api-checkout.cinetpay.com/v2';

/**
 * Initialize a payment session.
 * Returns { payment_url, payment_token, transaction_id } on success.
 *
 * @param {object} params
 * @param {string} params.transactionId  - Your internal unique ID (UUID recommended)
 * @param {number} params.amount         - Amount in the currency's smallest unit-safe integer (XOF = no decimals, so 89000 = 89 000 FCFA)
 * @param {string} params.currency       - 'XOF' | 'XAF' | 'CDF' | 'GNF' | 'USD' | 'EUR'
 * @param {string} params.description    - Shown to customer
 * @param {object} params.customer       - { name, surname, email, phone_number, address, city, country, state, zip_code }
 * @param {string} [params.channels]     - 'ALL' | 'MOBILE_MONEY' | 'CREDIT_CARD' | 'WALLET'
 * @param {object} [params.metadata]     - Arbitrary JSON we'll get back in the webhook (course_id, user_id, etc.)
 */
async function initCheckout({
    transactionId,
    amount,
    currency = 'XOF',
    description,
    customer,
    channels = 'ALL',
    metadata = {},
}) {
    const apiKey = process.env.CINETPAY_API_KEY;
    const siteId = process.env.CINETPAY_SITE_ID;
    const publicBase = process.env.PUBLIC_BASE_URL;

    if (!apiKey || !siteId || !publicBase) {
        throw new Error('CinetPay config missing: CINETPAY_API_KEY / CINETPAY_SITE_ID / PUBLIC_BASE_URL');
    }

    const payload = {
        apikey: apiKey,
        site_id: siteId,
        transaction_id: transactionId,
        amount,
        currency,
        description,
        notify_url: `${publicBase}/api/webhook-cinetpay`,
        return_url: `${publicBase}/pages/merci.html?tx=${encodeURIComponent(transactionId)}`,
        channels,
        lang: 'fr',
        metadata: JSON.stringify(metadata),
        // Customer block (required for some channels like card 3DS)
        customer_name: customer.name,
        customer_surname: customer.surname,
        customer_email: customer.email,
        customer_phone_number: customer.phone_number,
        customer_address: customer.address || 'N/A',
        customer_city: customer.city || 'Dakar',
        customer_country: customer.country || 'SN',
        customer_state: customer.state || 'SN',
        customer_zip_code: customer.zip_code || '00000',
    };

    const res = await fetch(`${API_BASE}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (data.code !== '201' || !data.data?.payment_url) {
        const msg = data.message || 'CinetPay init failed';
        const err = new Error(`CinetPay: ${msg}`);
        err.cinetpayResponse = data;
        throw err;
    }

    return {
        payment_url: data.data.payment_url,
        payment_token: data.data.payment_token,
        transaction_id: transactionId,
    };
}

/**
 * Verify a transaction's real status by polling CinetPay.
 * Called from the webhook handler — the webhook payload itself is not trusted;
 * we must re-query CinetPay to confirm the payment is actually ACCEPTED.
 *
 * Returns { status, amount, currency, payment_method, operator_id, payment_date, metadata }
 */
async function verifyTransaction(transactionId) {
    const apiKey = process.env.CINETPAY_API_KEY;
    const siteId = process.env.CINETPAY_SITE_ID;

    const res = await fetch(`${API_BASE}/payment/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            apikey: apiKey,
            site_id: siteId,
            transaction_id: transactionId,
        }),
    });

    const data = await res.json();

    if (!data.data) {
        throw new Error(`CinetPay verify failed: ${data.message || 'unknown'}`);
    }

    return {
        status: data.data.status, // 'ACCEPTED' | 'REFUSED' | 'PENDING' | 'WAITING_CUSTOMER_PAYMENT'
        amount: Number(data.data.amount),
        currency: data.data.currency,
        payment_method: data.data.payment_method,  // 'WAVECI', 'OM', 'MOMO', 'CARD', etc.
        operator_id: data.data.operator_id,
        payment_date: data.data.payment_date,
        metadata: data.data.metadata ? safeJsonParse(data.data.metadata) : {},
    };
}

function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return {}; }
}

/**
 * Map CinetPay payment_method codes to human-readable labels for invoice display.
 */
const PAYMENT_METHOD_LABELS = {
    'WAVECI': 'Wave Côte d\'Ivoire',
    'WAVESN': 'Wave Sénégal',
    'OM': 'Orange Money',
    'OMCI': 'Orange Money Côte d\'Ivoire',
    'OMSN': 'Orange Money Sénégal',
    'MOMO': 'MTN Mobile Money',
    'MOOV': 'Moov Money',
    'FLOOZ': 'Moov Flooz',
    'FREEMONEY': 'Free Money',
    'CARD': 'Carte bancaire',
    'VISA': 'Visa',
    'MASTERCARD': 'Mastercard',
    'WALLET': 'Portefeuille CinetPay',
};

function labelForPaymentMethod(code) {
    return PAYMENT_METHOD_LABELS[code] || code || 'Mobile Money';
}

module.exports = {
    initCheckout,
    verifyTransaction,
    labelForPaymentMethod,
};
