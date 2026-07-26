/**
 * FedaPay API wrapper
 * -------------------
 * Agrégateur de paiement Afrique de l'Ouest francophone :
 * Mobile Money (MTN, Moov, Orange, Free…) + cartes bancaires.
 * Docs : https://docs.fedapay.com/
 *
 * Remplace CinetPay (le fichier cinetpay.js est conservé pour référence).
 * Interface volontairement compatible : initCheckout(...) renvoie
 * { payment_url, transaction_id, provider_reference } comme avant, pour que
 * api/create-checkout.js et js/checkout.js n'aient (presque) rien à changer.
 *
 * Env vars requises :
 *   FEDAPAY_SECRET_KEY      - clé secrète API (sk_sandbox_... ou sk_live_...)
 *   FEDAPAY_ENV             - 'sandbox' (défaut) | 'live'
 *   PUBLIC_BASE_URL         - ex : https://cap-learning.com (URL de retour client)
 *   FEDAPAY_WEBHOOK_SECRET  - secret de l'endpoint webhook (voir signature-fedapay.js)
 */

const SANDBOX_BASE = 'https://sandbox-api.fedapay.com/v1';
const LIVE_BASE = 'https://api.fedapay.com/v1';

function apiBase() {
    return (process.env.FEDAPAY_ENV || 'sandbox') === 'live' ? LIVE_BASE : SANDBOX_BASE;
}

function authHeaders() {
    const key = process.env.FEDAPAY_SECRET_KEY;
    if (!key) throw new Error('FEDAPAY_SECRET_KEY missing');
    return {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
}

// Les réponses FedaPay enveloppent souvent l'objet sous une clé "v1/xxx".
function unwrap(data, singularKey) {
    if (!data || typeof data !== 'object') return data;
    return data['v1/' + singularKey] || data[singularKey] || data;
}

/**
 * Initialise un paiement.
 * 1) crée la transaction  2) génère le lien de paiement hébergé.
 * Renvoie { payment_url, transaction_id, provider_reference }.
 *
 * @param {object} p
 * @param {string} p.transactionId  - notre référence interne (ex : CL-...), renvoyée dans custom_metadata
 * @param {number} p.amount         - entier XOF (pas de décimales)
 * @param {string} [p.currency]     - 'XOF' par défaut
 * @param {string} p.description    - libellé affiché au client
 * @param {object} p.customer       - { name, surname, email, phone_number, country }
 * @param {object} [p.metadata]     - JSON renvoyé dans le webhook (course_id, user_id, course_label, customer_email…)
 */
async function initCheckout({ transactionId, amount, currency = 'XOF', description, customer, metadata = {} }) {
    const publicBase = process.env.PUBLIC_BASE_URL;
    if (!publicBase) throw new Error('PUBLIC_BASE_URL missing');

    // 1) Créer la transaction
    const createBody = {
        description: (description || 'Formation Cap Learning').slice(0, 250),
        amount,
        currency: { iso: currency },
        // callback_url = URL de RETOUR du client après paiement (pas le webhook).
        // Le webhook, lui, se configure dans le dashboard FedaPay → /api/webhook-fedapay
        callback_url: `${publicBase}/pages/merci.html?tx=${encodeURIComponent(transactionId)}`,
        custom_metadata: { ...metadata, internal_reference: transactionId },
        customer: {
            firstname: customer.name || 'Apprenant',
            lastname: customer.surname || 'Cap Learning',
            email: customer.email,
            ...(customer.phone_number
                ? { phone_number: { number: customer.phone_number, country: (customer.country || 'SN').toLowerCase() } }
                : {}),
        },
    };

    const cRes = await fetch(`${apiBase()}/transactions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(createBody),
    });
    const cData = await cRes.json().catch(() => ({}));
    const tx = unwrap(cData, 'transaction');
    const providerRef = tx && tx.id;

    if (!cRes.ok || !providerRef) {
        const err = new Error(`FedaPay: création transaction échouée (${cData.message || cRes.status})`);
        err.fedapayResponse = cData;
        throw err;
    }

    // 2) Générer le lien de paiement hébergé
    const tRes = await fetch(`${apiBase()}/transactions/${providerRef}/token`, {
        method: 'POST',
        headers: authHeaders(),
    });
    const tData = await tRes.json().catch(() => ({}));
    const paymentUrl = tData && tData.url;

    if (!tRes.ok || !paymentUrl) {
        const err = new Error(`FedaPay: génération du lien échouée (${tData.message || tRes.status})`);
        err.fedapayResponse = tData;
        throw err;
    }

    return {
        payment_url: paymentUrl,
        transaction_id: transactionId,      // notre réf interne (pour merci.html)
        provider_reference: String(providerRef), // id FedaPay (pour la vérif serveur)
    };
}

/**
 * Vérifie le vrai statut d'une transaction en interrogeant FedaPay.
 * Appelé depuis le webhook : on ne fait jamais confiance au corps du webhook,
 * on re-confirme via l'API que le paiement est bien 'approved'.
 *
 * @param {string|number} providerRef - id FedaPay de la transaction
 * Renvoie { status, amount, currency, payment_method, approved_at, metadata, reference }
 */
async function verifyTransaction(providerRef) {
    const res = await fetch(`${apiBase()}/transactions/${providerRef}`, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    const tx = unwrap(data, 'transaction');
    if (!tx || !tx.status) {
        throw new Error(`FedaPay verify failed: ${data.message || 'unknown'}`);
    }
    return {
        status: tx.status, // 'approved' | 'declined' | 'canceled' | 'pending' | 'transferred'
        amount: Number(tx.amount),
        currency: (tx.currency && tx.currency.iso) || 'XOF',
        payment_method: tx.mode || tx.last_error_code || null, // 'mtn','moov','orange_sn','card'…
        approved_at: tx.approved_at || tx.updated_at || null,
        metadata: tx.custom_metadata || {},
        reference: tx.reference || null,
    };
}

/**
 * Libellés lisibles des moyens de paiement FedaPay (champ `mode`) pour la facture.
 */
const PAYMENT_METHOD_LABELS = {
    mtn: 'MTN Mobile Money',
    mtn_ci: 'MTN Mobile Money',
    mtn_open: 'MTN Mobile Money',
    moov: 'Moov Money',
    moov_tg: 'Moov Money',
    moov_bj: 'Moov Money',
    orange_sn: 'Orange Money',
    orange_ci: 'Orange Money',
    free_sn: 'Free Money',
    togocom_tg: 'Togocom T-Money',
    card: 'Carte bancaire',
    visa: 'Visa',
    mastercard: 'Mastercard',
};

function labelForPaymentMethod(code) {
    return PAYMENT_METHOD_LABELS[code] || code || 'Mobile Money';
}

module.exports = {
    initCheckout,
    verifyTransaction,
    labelForPaymentMethod,
};
