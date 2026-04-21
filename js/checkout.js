/**
 * Cap Learning — Checkout bridge (client ↔ serverless API)
 * --------------------------------------------------------
 * Exposes `window.Checkout` with a single method: `Checkout.start({...})`
 *
 * Call it from panier.html's "Confirmer le paiement" handler. It:
 *   1. POSTs the cart + customer info to /api/create-checkout
 *   2. Receives a CinetPay hosted payment URL
 *   3. Redirects the browser to that URL (Wave / Orange / MTN / carte UI)
 *   4. After payment, CinetPay redirects back to /pages/merci.html?tx=...
 *   5. The webhook (server-side) creates the Pennylane invoice
 *
 * Until serverless is deployed, `window.Checkout.MOCK = true` makes start()
 * simulate success (keeps the existing demo flow working).
 *
 * Usage (in panier.html, replacing the setTimeout fake flow):
 *
 *   Checkout.start({
 *       course_id: Cart.items[0].id,              // or a bundled ID for multi-item carts
 *       course_label: Cart.items[0].title,
 *       amount: totalTTC,                         // integer XOF
 *       currency: 'XOF',
 *       customer: {
 *           email: user.email,
 *           name: user.firstName,
 *           surname: user.lastName,
 *           phone_number: '+221' + phone.replace(/\D/g, ''),
 *           country: 'SN'
 *       }
 *   });
 */

(function (global) {
    'use strict';

    const API_ENDPOINT = '/api/create-checkout';

    const Checkout = {
        // Flip to false once serverless is deployed with CinetPay credentials.
        MOCK: true,

        /**
         * Initiate payment. Returns a Promise that resolves when the browser
         * has been redirected (caller rarely needs to await it).
         */
        async start(order) {
            validate(order);

            if (this.MOCK) {
                return mockFlow(order);
            }

            let res;
            try {
                res = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(order),
                });
            } catch (networkErr) {
                throw new CheckoutError('network', 'Connexion perdue. Vérifiez votre réseau et réessayez.');
            }

            let data;
            try { data = await res.json(); } catch { data = {}; }

            if (!res.ok || !data.payment_url) {
                const msg = data.error || `Erreur ${res.status}`;
                throw new CheckoutError('server', msg);
            }

            // Persist reference before redirect so the return page can look it up
            try {
                localStorage.setItem(
                    'caplearning_pending_checkout',
                    JSON.stringify({
                        transaction_id: data.transaction_id,
                        created_at: Date.now(),
                        course_id: order.course_id,
                    })
                );
            } catch { /* localStorage can be disabled; non-fatal */ }

            // Hard redirect to CinetPay's hosted checkout
            global.location.href = data.payment_url;
        },
    };

    function validate(order) {
        const missing = [];
        if (!order?.course_id) missing.push('course_id');
        if (!order?.course_label) missing.push('course_label');
        if (!Number.isInteger(order?.amount) || order.amount <= 0) missing.push('amount (integer > 0)');
        if (!order?.customer?.email) missing.push('customer.email');
        if (!order?.customer?.phone_number) missing.push('customer.phone_number');
        if (missing.length) {
            throw new CheckoutError('validation', `Champs manquants : ${missing.join(', ')}`);
        }
    }

    function mockFlow(order) {
        return new Promise((resolve) => {
            console.info('[Checkout.MOCK] start', order);
            // Simulate the existing UI delay. The caller's existing setTimeout
            // chain in panier.html handles the visual progress.
            setTimeout(() => {
                console.info('[Checkout.MOCK] success (no real payment)');
                resolve({ mock: true, transaction_id: 'MOCK-' + Date.now() });
            }, 400);
        });
    }

    class CheckoutError extends Error {
        constructor(kind, message) {
            super(message);
            this.kind = kind;
        }
    }
    Checkout.Error = CheckoutError;

    global.Checkout = Checkout;
})(typeof window !== 'undefined' ? window : globalThis);
