/**
 * Consentement CGV + renonciation au droit de rétractation — côté serveur
 * ------------------------------------------------------------------------
 * Source de vérité pour :
 *   • la version des CGV en vigueur (CGV_VERSION) ;
 *   • la validation des deux consentements reçus du client ;
 *   • l'enregistrement de la preuve dans la table `order_consents`.
 *
 * Pourquoi côté serveur : le contrôle client seul est contournable (un appel
 * direct à l'API le sauterait), et l'article L221-13 du Code de la consommation
 * exige une preuve produite et conservée par le vendeur — pas par le navigateur.
 *
 * ⚠️  CGV_VERSION doit rester synchronisée avec :
 *       - js/consent.js            (constante VERSION)
 *       - pages/cgv.html           (<meta name="cgv-version">)
 *     Toute modification du texte des CGV impose de bumper cette date.
 */

const { upsert } = require('./supabase-admin');

const CGV_VERSION = '2026-07-26';

/**
 * Normalise un booléen reçu du client.
 * Un formulaire HTML POST envoie des chaînes ('1', 'true', 'on'), un fetch JSON
 * envoie de vrais booléens. Tout le reste vaut false : on n'infère jamais un
 * consentement à partir d'une valeur ambiguë.
 */
function toBool(v) {
    if (v === true) return true;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        return s === '1' || s === 'true' || s === 'on' || s === 'yes';
    }
    return false;
}

/**
 * Lit les deux consentements dans une source (req.body ou req.query).
 * @returns {{cgvAccepted: boolean, withdrawalWaived: boolean}}
 */
function readConsent(source) {
    const s = source || {};
    return {
        cgvAccepted: toBool(s.cgv_accepted),
        withdrawalWaived: toBool(s.withdrawal_waived)
    };
}

/**
 * Vérifie que les DEUX consentements sont présents et vrais.
 * @returns {{ok: true} | {ok: false, error: string, missing: string[]}}
 */
function validateConsent(consent) {
    const missing = [];
    if (!consent.cgvAccepted) missing.push('cgv_accepted');
    if (!consent.withdrawalWaived) missing.push('withdrawal_waived');

    if (missing.length) {
        return {
            ok: false,
            missing,
            error: 'Consentement requis avant paiement : '
                + 'cgv_accepted (acceptation des conditions générales de vente) et '
                + 'withdrawal_waived (demande d\'accès immédiat valant renonciation au droit '
                + 'de rétractation de 14 jours) doivent être transmis et valoir true. '
                + 'Manquant(s) : ' + missing.join(', ') + '.'
        };
    }
    return { ok: true };
}

/**
 * Adresse IP réelle derrière le proxy Vercel.
 * x-forwarded-for peut contenir une liste "client, proxy1, proxy2" → on garde
 * le premier segment, qui est le client.
 */
function clientIp(req) {
    const raw = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
    const first = String(raw).split(',')[0].trim();
    return first || null;
}

/**
 * Enregistre la preuve du consentement.
 *
 * Appelé AVANT initCheckout() : si la preuve ne peut pas être écrite, on
 * n'encaisse pas. Un paiement sans trace reproduirait exactement le problème
 * que ce module corrige.
 *
 * L'horodatage vient du serveur (`now()` côté Postgres via le default, doublé
 * ici par un ISO serveur) — jamais d'une date fournie par le client.
 */
async function recordOrderConsent({ req, userId, transactionId, courseId }) {
    if (!transactionId) throw new Error('recordOrderConsent: transactionId requis');

    return upsert('order_consents', {
        user_id: userId || null,
        transaction_id: transactionId,
        course_id: courseId || null,
        cgv_accepted: true,
        cgv_version: CGV_VERSION,
        withdrawal_waived: true,
        ip: clientIp(req),
        user_agent: (req.headers['user-agent'] || '').slice(0, 500) || null,
        created_at: new Date().toISOString()
    });
}

module.exports = {
    CGV_VERSION,
    readConsent,
    validateConsent,
    recordOrderConsent,
    clientIp,
    toBool
};
