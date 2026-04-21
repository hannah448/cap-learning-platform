/**
 * Pennylane API wrapper
 * ---------------------
 * Docs: https://pennylane.readme.io/
 * Auth: Bearer token (API key from Pennylane Pro/Premium account settings)
 *
 * Env vars required:
 *   PENNYLANE_API_KEY   - from your Pennylane account (Paramètres > Intégrations > API)
 *   PENNYLANE_JOURNAL   - (optional) sales journal code, defaults to 'VE'
 *
 * Strategy for idempotency:
 *   We set `external_reference` to the CinetPay transaction_id. Before creating
 *   a new invoice, we search for an existing one with the same reference. If
 *   found, we return it (avoids duplicates on webhook retries).
 */

const API_BASE = 'https://app.pennylane.com/api/external/v2';

function headers() {
    const key = process.env.PENNYLANE_API_KEY;
    if (!key) throw new Error('PENNYLANE_API_KEY missing');
    return {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
}

async function request(path, init = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { ...headers(), ...(init.headers || {}) },
    });
    const body = await res.text();
    let data;
    try { data = body ? JSON.parse(body) : {}; } catch { data = { raw: body }; }

    if (!res.ok) {
        const err = new Error(`Pennylane ${init.method || 'GET'} ${path} failed: ${res.status} ${data.message || body}`);
        err.status = res.status;
        err.body = data;
        throw err;
    }
    return data;
}

/**
 * Find or create a customer by email.
 * Pennylane requires a Customer before you can attach an invoice to them.
 */
async function upsertCustomer({ email, name, phone, address, country = 'SN' }) {
    // Search by email
    const search = await request(`/customers?filter[email]=${encodeURIComponent(email)}`);
    if (search.items && search.items.length > 0) {
        return search.items[0];
    }

    // Create
    const [firstName, ...rest] = (name || email.split('@')[0]).split(' ');
    const lastName = rest.join(' ') || '-';

    const created = await request('/customers', {
        method: 'POST',
        body: JSON.stringify({
            customer: {
                source_id: `caplearning_${email}`,
                customer_type: 'individual',
                first_name: firstName,
                last_name: lastName,
                name: name || email,
                emails: [email],
                phone: phone || null,
                billing_address: address || null,
                billing_country_alpha2: country,
                delivery_address: address || null,
                delivery_country_alpha2: country,
            },
        }),
    });

    return created.customer || created;
}

/**
 * Look up an invoice by our external_reference (CinetPay transaction_id).
 * Used for idempotency: if the webhook fires twice, we don't create two invoices.
 */
async function findInvoiceByReference(externalReference) {
    const q = encodeURIComponent(externalReference);
    const res = await request(`/customer_invoices?filter[external_reference]=${q}`);
    return (res.items && res.items[0]) || null;
}

/**
 * Create a customer invoice, mark it as paid, and return it.
 *
 * @param {object} params
 * @param {string} params.externalReference  - CinetPay transaction_id (for idempotency)
 * @param {object} params.customer           - { email, name, phone, address, country }
 * @param {object} params.item               - { label, unitPriceHt, vatRate, quantity }
 * @param {string} params.paymentMethodLabel - e.g. 'Wave Sénégal'
 * @param {string} params.paidAtISO          - ISO 8601 date
 * @param {string} [params.journalCode]      - Sales journal code, default 'VE'
 */
async function createAndPayInvoice({
    externalReference,
    customer,
    item,
    paymentMethodLabel,
    paidAtISO,
    journalCode = process.env.PENNYLANE_JOURNAL || 'VE',
}) {
    // 1. Idempotency check
    const existing = await findInvoiceByReference(externalReference);
    if (existing) {
        return { invoice: existing, created: false };
    }

    // 2. Upsert customer
    const pnCustomer = await upsertCustomer(customer);

    // 3. Create the invoice (draft)
    const today = paidAtISO ? paidAtISO.split('T')[0] : new Date().toISOString().split('T')[0];

    const invoicePayload = {
        invoice: {
            customer_id: pnCustomer.id,
            date: today,
            deadline: today,  // Paid on the spot
            external_reference: externalReference,
            currency: 'XOF',
            language: 'fr_FR',
            draft: false,     // Finalize immediately (assigns a legal invoice number)
            line_items_attributes: [
                {
                    label: item.label,
                    quantity: item.quantity || 1,
                    unit: 'pièce',
                    currency_amount: item.unitPriceHt,  // HT unit price in XOF (integer, no decimals)
                    vat_rate: String(item.vatRate ?? 'exempt'),   // '0', '18', 'exempt', etc.
                },
            ],
            special_mention: `Paiement encaissé via ${paymentMethodLabel}. Réf. transaction : ${externalReference}`,
        },
    };

    const created = await request('/customer_invoices', {
        method: 'POST',
        body: JSON.stringify(invoicePayload),
    });

    const invoice = created.invoice || created;

    // 4. Record the payment against it
    try {
        await request(`/customer_invoices/${invoice.id}/mark_as_paid`, {
            method: 'POST',
            body: JSON.stringify({
                payment: {
                    paid_at: today,
                    method: paymentMethodLabel,
                    journal_code: journalCode,
                },
            }),
        });
    } catch (e) {
        // Non-fatal: the invoice exists, the user will see it. Payment recording can be retried.
        console.warn(`[pennylane] mark_as_paid failed for invoice ${invoice.id}:`, e.message);
    }

    // 5. Trigger send-by-email (Pennylane emails the PDF automatically)
    try {
        await request(`/customer_invoices/${invoice.id}/send_by_email`, {
            method: 'POST',
            body: JSON.stringify({}),
        });
    } catch (e) {
        console.warn(`[pennylane] send_by_email failed for invoice ${invoice.id}:`, e.message);
    }

    return { invoice, created: true };
}

module.exports = {
    upsertCustomer,
    findInvoiceByReference,
    createAndPayInvoice,
};
