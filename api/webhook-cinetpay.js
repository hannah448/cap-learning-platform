/**
 * POST /api/webhook-cinetpay
 *
 * Called by CinetPay servers after a payment attempt. We:
 *  1. Verify the HMAC signature (x-token header) against our secret.
 *  2. Re-verify the transaction status via the CinetPay API (don't trust the body blindly).
 *  3. If ACCEPTED → create a Pennylane invoice (idempotent via external_reference).
 *  4. Always respond 200 quickly — CinetPay retries on non-200.
 *
 * Docs: https://docs.cinetpay.com/api/1.0-fr/checkout/notification
 *
 * IMPORTANT: CinetPay sends `application/x-www-form-urlencoded`, not JSON.
 * Vercel parses it into req.body automatically when content-type is form-urlencoded.
 */

const { verifyCinetPayWebhook } = require('./lib/signature');
const { verifyTransaction, labelForPaymentMethod } = require('./lib/cinetpay');
const { createAndPayInvoice } = require('./lib/pennylane');

// Default VAT rate per country. Extend as you launch in new markets.
const VAT_BY_COUNTRY = {
    SN: 18,   // Sénégal
    CI: 18,   // Côte d'Ivoire
    BJ: 18,   // Bénin
    BF: 18,   // Burkina Faso
    ML: 18,   // Mali
    TG: 18,   // Togo
    NE: 19,   // Niger
    CM: 19.25, // Cameroun
    FR: 20,   // France
};

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body || {};
        const token = req.headers['x-token'] || req.headers['X-Token'];

        // 1. Verify HMAC
        if (!verifyCinetPayWebhook(body, token)) {
            console.warn('[webhook-cinetpay] invalid HMAC, rejecting', { trans_id: body.cpm_trans_id });
            return res.status(401).json({ error: 'invalid signature' });
        }

        const transactionId = body.cpm_trans_id;
        if (!transactionId) {
            return res.status(400).json({ error: 'missing cpm_trans_id' });
        }

        // 2. Re-verify with CinetPay (the body is not authoritative)
        const tx = await verifyTransaction(transactionId);

        // Respond 200 ASAP — CinetPay only cares about 2xx vs non-2xx
        // We still want to do the Pennylane work before responding, but keep it fast
        if (tx.status !== 'ACCEPTED') {
            console.log(`[webhook-cinetpay] ${transactionId} status=${tx.status}, no invoice.`);
            return res.status(200).json({ ok: true, status: tx.status });
        }

        // 3. Create Pennylane invoice
        const metadata = tx.metadata || {};
        const customerEmail = metadata.customer_email;
        const courseLabel = metadata.course_label || 'Formation Cap Learning';

        if (!customerEmail) {
            console.error('[webhook-cinetpay] no customer_email in metadata, skipping invoice');
            return res.status(200).json({ ok: true, skipped: 'no_email' });
        }

        const country = (body.cpm_phone_prefixe || '').startsWith('225') ? 'CI'
            : (body.cpm_phone_prefixe || '').startsWith('229') ? 'BJ'
            : 'SN';

        const vatRate = VAT_BY_COUNTRY[country] ?? 18;
        // Reverse-calc HT from TTC (amount from CinetPay is TTC)
        const unitPriceHt = Math.round(tx.amount / (1 + vatRate / 100));

        const { invoice, created } = await createAndPayInvoice({
            externalReference: transactionId,
            customer: {
                email: customerEmail,
                name: `${body.cpm_custom || ''}`.trim() || customerEmail.split('@')[0],
                phone: body.cel_phone_num ? `+${body.cpm_phone_prefixe}${body.cel_phone_num}` : null,
                country,
            },
            item: {
                label: courseLabel,
                unitPriceHt,
                vatRate,
                quantity: 1,
            },
            paymentMethodLabel: labelForPaymentMethod(tx.payment_method),
            paidAtISO: tx.payment_date ? new Date(tx.payment_date).toISOString() : new Date().toISOString(),
        });

        console.log(
            `[webhook-cinetpay] ${transactionId} → Pennylane invoice ${invoice.id} ` +
            `(${created ? 'created' : 'already_existed'})`
        );

        // TODO: unlock course access for customer in your user DB
        // TODO: send confirmation email from Cap Learning brand (in addition to Pennylane's)

        return res.status(200).json({
            ok: true,
            invoice_id: invoice.id,
            created,
        });
    } catch (err) {
        console.error('[webhook-cinetpay] error:', err);
        // Return 500 so CinetPay retries — only for true errors, not for "REFUSED" which is 200
        return res.status(500).json({ error: err.message });
    }
};

// Vercel body parser config: CinetPay sends form-urlencoded
module.exports.config = {
    api: {
        bodyParser: {
            sizeLimit: '10kb',
        },
    },
};
