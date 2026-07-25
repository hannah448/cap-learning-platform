/**
 * POST /api/webhook-fedapay
 *
 * Appelé par les serveurs FedaPay après une tentative de paiement. On :
 *  1. Lit le CORPS BRUT (bodyParser désactivé) pour vérifier la signature.
 *  2. Vérifie la signature HMAC (en-tête x-fedapay-signature).
 *  3. Ne traite que l'évènement `transaction.approved`.
 *  4. Re-vérifie le statut réel via l'API FedaPay (on ne fait pas confiance au corps).
 *  5. Si 'approved' → facture Pennylane (idempotent) + enrollment Supabase (accès formation).
 *  6. Répond toujours 200 vite (FedaPay retente sur non-2xx).
 *
 * Config webhook côté FedaPay : dashboard → Webhooks → URL = https://cap-learning.com/api/webhook-fedapay
 * Le secret de cet endpoint va dans FEDAPAY_WEBHOOK_SECRET.
 */

const { verifyFedaPayWebhook } = require('./lib/signature-fedapay');
const { verifyTransaction, labelForPaymentMethod } = require('./lib/fedapay');
const { createAndPayInvoice } = require('./lib/pennylane');
const { findProfileByEmail, upsertEnrollment, select } = require('./lib/supabase-admin');

async function findProfileById(userId) {
    if (!userId) return null;
    try {
        const rows = await select('profiles', 'id=eq.' + encodeURIComponent(userId) + '&select=id,email,full_name&limit=1');
        return rows && rows[0] ? rows[0] : null;
    } catch (e) {
        return null;
    }
}

// TVA par défaut selon le pays. À ajuster selon le statut fiscal réel.
const VAT_BY_COUNTRY = {
    SN: 18, CI: 18, BJ: 18, BF: 18, ML: 18, TG: 18, NE: 19, CM: 19.25, FR: 20,
};

function readRawBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const raw = await readRawBody(req);
        const sig = req.headers['x-fedapay-signature'] || req.headers['X-FEDAPAY-SIGNATURE'];

        // 1+2. Vérifier la signature sur le corps brut
        if (!verifyFedaPayWebhook(raw, sig)) {
            console.warn('[webhook-fedapay] signature invalide, rejet');
            return res.status(401).json({ error: 'invalid signature' });
        }

        let event = {};
        try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: 'invalid json' }); }

        const eventName = event.name || event.event || '';
        const entity = event.entity || event.data || event.transaction || {};

        // 3. On ne s'intéresse qu'aux paiements approuvés
        if (eventName && eventName !== 'transaction.approved') {
            console.log(`[webhook-fedapay] évènement ignoré : ${eventName}`);
            return res.status(200).json({ ok: true, ignored: eventName });
        }

        const providerRef = entity.id;
        if (!providerRef) {
            return res.status(400).json({ error: 'missing transaction id' });
        }

        // 4. Re-vérifier le statut réel via l'API (le corps n'est pas autoritaire)
        const tx = await verifyTransaction(providerRef);
        if (tx.status !== 'approved') {
            console.log(`[webhook-fedapay] ${providerRef} status=${tx.status}, pas de facture.`);
            return res.status(200).json({ ok: true, status: tx.status });
        }

        // 5. Facturation + accès
        const metadata = tx.metadata || {};
        const customerEmail = metadata.customer_email;
        const courseLabel = metadata.course_label || 'Formation Cap Learning';
        const country = (metadata.country || 'SN').toUpperCase();

        if (!customerEmail) {
            console.error('[webhook-fedapay] pas de customer_email en metadata, facture ignorée');
            return res.status(200).json({ ok: true, skipped: 'no_email' });
        }

        const vatRate = VAT_BY_COUNTRY[country] ?? 18;
        const unitPriceHt = Math.round(tx.amount / (1 + vatRate / 100)); // le montant FedaPay est TTC

        // Facture Pennylane — NON BLOQUANT (si l'API Pennylane n'est pas encore active,
        // on log et on continue pour ne pas priver le client de son accès).
        let invoice = null;
        let created = false;
        try {
            const result = await createAndPayInvoice({
                externalReference: metadata.internal_reference || String(providerRef),
                customer: {
                    email: customerEmail,
                    name: (metadata.customer_name || '').trim() || customerEmail.split('@')[0],
                    phone: metadata.customer_phone || null,
                    country,
                },
                item: { label: courseLabel, unitPriceHt, vatRate, quantity: 1 },
                paymentMethodLabel: labelForPaymentMethod(tx.payment_method),
                paidAtISO: tx.approved_at ? new Date(tx.approved_at).toISOString() : new Date().toISOString(),
            });
            invoice = result.invoice;
            created = result.created;
            console.log(`[webhook-fedapay] ${providerRef} → Pennylane invoice ${invoice.id} (${created ? 'created' : 'already_existed'})`);
        } catch (pennylaneErr) {
            console.warn(`[webhook-fedapay] ${providerRef} → Pennylane SKIPPED: ${pennylaneErr.message}. Facture à émettre manuellement.`);
        }

        // Enrollment Supabase (donne accès à la formation)
        let enrollmentResult = null;
        const courseDbId = metadata.course_db_id || metadata.course_id;
        const metadataUserId = metadata.user_id;

        if (!courseDbId) {
            console.warn(`[webhook-fedapay] ${providerRef}: pas de course_db_id en metadata, enrollment ignorée`);
        } else {
            try {
                let profile = null;
                if (metadataUserId) profile = await findProfileById(metadataUserId);
                if (!profile && customerEmail) profile = await findProfileByEmail(customerEmail);

                if (!profile) {
                    console.error(`[webhook-fedapay] ${providerRef}: aucun profile (user_id=${metadataUserId || 'absent'}, email=${customerEmail}). Enrollment manuelle requise.`);
                } else {
                    enrollmentResult = await upsertEnrollment({
                        userId: profile.id,
                        courseId: courseDbId,
                        cinetpayTransactionId: metadata.internal_reference || String(providerRef),
                        pennylaneInvoiceId: invoice ? invoice.id : null,
                        amountXof: tx.amount,
                        paymentMethod: tx.payment_method,
                    });
                    console.log(`[webhook-fedapay] ${providerRef} → enrollment ${enrollmentResult.id} (user=${profile.email}, course=${courseDbId})`);
                }
            } catch (e) {
                console.error(`[webhook-fedapay] ${providerRef} enrollment failed:`, e.message);
            }
        }

        return res.status(200).json({
            ok: true,
            invoice_id: invoice ? invoice.id : null,
            invoice_created: created,
            invoice_skipped: !invoice,
            enrollment_id: enrollmentResult ? enrollmentResult.id : null,
            enrollment_status: enrollmentResult ? enrollmentResult.status : 'skipped',
        });
    } catch (err) {
        console.error('[webhook-fedapay] error:', err);
        return res.status(500).json({ error: err.message });
    }
};

// FedaPay envoie du JSON, mais on a besoin du corps BRUT pour vérifier la signature
// → on désactive le bodyParser de Vercel et on lit le flux nous-mêmes.
module.exports.config = {
    api: { bodyParser: false },
};
