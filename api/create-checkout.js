/**
 * POST /api/create-checkout
 *
 * Called by the frontend when the user clicks "Payer".
 * Initiates a CinetPay payment session and returns the hosted checkout URL.
 *
 * Request body (JSON):
 * {
 *   course_id: "ecommerce-shopify",
 *   course_label: "E-commerce & Shopify en Afrique",
 *   amount: 89000,                // XOF, integer
 *   currency: "XOF",
 *   customer: {
 *     email: "aissatou@example.com",
 *     name: "Aïssatou",
 *     surname: "Diallo",
 *     phone_number: "+221771234567",
 *     country: "SN"
 *   }
 * }
 *
 * Response (200):
 * { payment_url, transaction_id }
 *
 * Deploys as a Vercel serverless function (Node 18+).
 */

const { randomUUID } = require('crypto');
const { initCheckout } = require('./lib/cinetpay');

module.exports = async function handler(req, res) {
    // CORS — allow same-origin by default; widen if you deploy frontend separately
    res.setHeader('Access-Control-Allow-Origin', process.env.PUBLIC_BASE_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const {
            course_id,
            course_label,
            amount,
            currency = 'XOF',
            customer,
        } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        // --- Validation ---
        if (!course_id || !course_label) {
            return res.status(400).json({ error: 'course_id and course_label are required' });
        }
        if (!Number.isInteger(amount) || amount <= 0) {
            return res.status(400).json({ error: 'amount must be a positive integer (XOF, no decimals)' });
        }
        if (!customer?.email || !customer?.phone_number) {
            return res.status(400).json({ error: 'customer.email and customer.phone_number are required' });
        }
        // XOF min for CinetPay = 100; multiples of 5
        if (currency === 'XOF' && (amount < 100 || amount % 5 !== 0)) {
            return res.status(400).json({ error: 'XOF amount must be >= 100 and a multiple of 5' });
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
                zip_code: customer.zip_code || '00000',
            },
            channels: 'ALL',
            metadata: {
                course_id,
                course_label,
                customer_email: customer.email,
            },
        });

        return res.status(200).json({
            payment_url: session.payment_url,
            transaction_id: session.transaction_id,
        });
    } catch (err) {
        console.error('[create-checkout] error:', err);
        return res.status(500).json({
            error: err.message || 'internal error',
            detail: err.cinetpayResponse || undefined,
        });
    }
};
