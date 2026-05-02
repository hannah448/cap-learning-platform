/**
 * Supabase admin client (service_role)
 * -------------------------------------
 * À utiliser UNIQUEMENT côté serveur (Vercel Functions).
 * Bypass les RLS policies → ne JAMAIS exposer le service_role_key au frontend.
 *
 * Env vars requises (Vercel Dashboard → Settings → Environment Variables) :
 *   SUPABASE_URL                = https://xxxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   = eyJ... (Project Settings → API → service_role secret)
 *
 * Pas de package npm requis : on parle directement à l'API REST de Supabase.
 * (Ça évite d'ajouter @supabase/supabase-js dans le bundle Vercel.)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function ensureEnv() {
    if (!SUPABASE_URL || !SERVICE_KEY) {
        throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquants dans les env vars Vercel');
    }
}

function authHeaders() {
    return {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
}

/**
 * GET /rest/v1/<table>?<query>
 * Ex: select('profiles', 'select=id,email&email=eq.hannah@x.com')
 */
async function select(table, queryString) {
    ensureEnv();
    const url = `${SUPABASE_URL}/rest/v1/${table}?${queryString}`;
    const res = await fetch(url, { method: 'GET', headers: authHeaders() });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Supabase GET ${table} failed: ${res.status} ${txt}`);
    }
    return res.json();
}

/**
 * POST /rest/v1/<table>?on_conflict=...
 * Insert ou upsert avec Prefer: resolution=merge-duplicates
 */
async function upsert(table, row, opts) {
    ensureEnv();
    opts = opts || {};
    const params = new URLSearchParams();
    if (opts.onConflict) params.set('on_conflict', opts.onConflict);
    params.set('select', '*');

    const url = `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
    const headers = Object.assign({}, authHeaders(), {
        'Prefer': opts.onConflict
            ? 'resolution=merge-duplicates,return=representation'
            : 'return=representation'
    });

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(Array.isArray(row) ? row : [row])
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Supabase upsert ${table} failed: ${res.status} ${txt}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
}

/**
 * PATCH /rest/v1/<table>?<query>
 */
async function update(table, queryString, patch) {
    ensureEnv();
    const url = `${SUPABASE_URL}/rest/v1/${table}?${queryString}`;
    const headers = Object.assign({}, authHeaders(), { 'Prefer': 'return=representation' });
    const res = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch)
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Supabase PATCH ${table} failed: ${res.status} ${txt}`);
    }
    return res.json();
}

/**
 * Trouve un profile par email (insensible à la casse).
 * Retourne null si pas trouvé.
 */
async function findProfileByEmail(email) {
    if (!email) return null;
    const e = encodeURIComponent(email.toLowerCase());
    const rows = await select('profiles', `email=eq.${e}&select=*&limit=1`);
    return rows && rows[0] ? rows[0] : null;
}

/**
 * Crée ou met à jour une enrollment.
 * Constraint unique (user_id, course_id) → upsert idempotent.
 */
async function upsertEnrollment({
    userId,
    courseId,            // 'ecommerce' | 'marketing' | 'ia-business' | 'reseaux-sociaux' | 'entrepreneuriat'
    cinetpayTransactionId,
    pennylaneInvoiceId,
    amountXof,
    paymentMethod,
}) {
    if (!userId || !courseId) {
        throw new Error('upsertEnrollment: userId et courseId requis');
    }
    return upsert('enrollments', {
        user_id: userId,
        course_id: courseId,
        status: 'active',
        cinetpay_transaction_id: cinetpayTransactionId || null,
        pennylane_invoice_id: pennylaneInvoiceId || null,
        amount_xof: amountXof || null,
        currency: 'XOF',
        payment_method: paymentMethod || null,
        enrolled_at: new Date().toISOString()
    }, { onConflict: 'user_id,course_id' });
}

module.exports = {
    select,
    upsert,
    update,
    findProfileByEmail,
    upsertEnrollment
};
