/**
 * Email de confirmation de commande — Cap Learning
 * ------------------------------------------------
 * Pourquoi ce fichier existe : l'article L221-25 du Code de la consommation,
 * lu avec les articles L221-13 et L221-28, 13°, subordonne l'efficacité de la
 * renonciation au droit de rétractation à la fourniture, sur un SUPPORT DURABLE,
 * de la confirmation de l'accord préalable exprès du client au démarrage
 * immédiat ET de son renoncement exprès.
 *
 * Sans cet email, les deux cases cochées au paiement (js/consent.js) ne purgent
 * rien : le droit de rétractation subsiste, et l'article L221-20 prolonge le
 * délai de douze mois. Cet email est donc la pièce de preuve centrale du tunnel
 * d'achat, pas une politesse commerciale.
 *
 * L'article 1 des CGV promet par ailleurs qu'« une copie [des CGV] est adressée
 * au client avec sa confirmation de commande » : ce module tient cet engagement
 * en pointant vers la version horodatée des CGV effectivement acceptée.
 */

const { sendEmail } = require('../brevo');

const BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://www.cap-learning.com').replace(/\/+$/, '');
const CONTACT_EMAIL = 'hello@cap-learning.com';

/** Échappe le HTML — les libellés viennent de la metadata CinetPay, jamais de confiance aveugle. */
function esc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Format lisible et non ambigu : "28 juillet 2026 à 14:32 (UTC)". */
function formatDateTimeUtc(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return null;
    const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const p = n => String(n).padStart(2, '0');
    return `${d.getUTCDate()} ${mois[d.getUTCMonth()]} ${d.getUTCFullYear()} à ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} (UTC)`;
}

function formatAmount(amount, currency) {
    if (amount == null || isNaN(Number(amount))) return null;
    const n = Number(amount).toLocaleString('fr-FR');
    return `${n} ${currency || 'FCFA'}`;
}

/**
 * Construit le corps de l'email.
 * @param {object} o
 * @param {string} o.courseLabel      Intitulé du parcours acheté
 * @param {string} o.transactionId    Référence de transaction (CinetPay)
 * @param {number} o.amount           Montant effectivement payé
 * @param {string} [o.currency]       Devise (défaut XOF/FCFA)
 * @param {string} [o.paymentMethod]  Libellé du moyen de paiement
 * @param {string} [o.paidAtISO]      Date du paiement
 * @param {string} [o.consentAtISO]   Horodatage serveur du double consentement (order_consents.created_at)
 * @param {string} [o.cgvVersion]     Version des CGV acceptée
 */
function buildOrderConfirmation(o) {
    const cgvUrl = `${BASE_URL}/cgv`;
    const mlUrl = `${BASE_URL}/mentions-legales`;
    const confUrl = `${BASE_URL}/confidentialite`;
    const dashboardUrl = `${BASE_URL}/dashboard`;

    const consentDate = formatDateTimeUtc(o.consentAtISO) || formatDateTimeUtc(o.paidAtISO);
    const paidDate = formatDateTimeUtc(o.paidAtISO);
    const amount = formatAmount(o.amount, o.currency);

    const rows = [
        ['Parcours', o.courseLabel],
        ['Montant payé', amount],
        ['Moyen de paiement', o.paymentMethod],
        ['Date du paiement', paidDate],
        ['Référence de commande', o.transactionId],
        ['Version des CGV acceptée', o.cgvVersion]
    ].filter(([, v]) => v);

    const rowsHtml = rows.map(([k, v]) => `
        <tr>
          <th style="text-align:left;padding:8px 12px 8px 0;vertical-align:top;font-weight:600;color:#1C1917;white-space:nowrap;">${esc(k)}</th>
          <td style="padding:8px 0;vertical-align:top;color:#1C1917;">${esc(v)}</td>
        </tr>`).join('');

    const subject = o.courseLabel
        ? `Confirmation de votre commande — ${o.courseLabel}`
        : 'Confirmation de votre commande Cap Learning';

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1C1917;line-height:1.55;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">

  <div style="background:#FFFFFF;border:1px solid #E7E5E4;border-radius:12px;padding:24px;">
    <h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;">Merci pour votre commande</h1>
    <p style="margin:0 0 20px;font-size:15px;">
      Votre paiement a bien été reçu et votre accès est ouvert. Vous pouvez commencer dès maintenant depuis
      <a href="${dashboardUrl}" style="color:#3460E5;font-weight:600;">votre espace apprenant</a>.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #E7E5E4;">
      ${rowsHtml}
    </table>
  </div>

  <div style="background:#FFFFFF;border:1px solid #E7E5E4;border-radius:12px;padding:24px;margin-top:16px;">
    <h2 style="margin:0 0 12px;font-size:16px;line-height:1.3;">Confirmation de votre accord et de votre renonciation au droit de rétractation</h2>
    <p style="margin:0 0 12px;font-size:14px;">
      Lors de votre commande${consentDate ? `, le <strong>${esc(consentDate)}</strong>,` : ','} vous avez expressément
      demandé que l'exécution de votre parcours commence immédiatement, avant l'expiration du délai de rétractation de
      quatorze jours, et vous avez expressément renoncé à ce droit de rétractation. Conformément à l'article L221-28,
      13° du Code de la consommation, ce droit ne peut plus être exercé dès lors que l'exécution a commencé avec
      votre accord.
    </p>
    <p style="margin:0 0 12px;padding:12px;background:#F5F5F4;border-radius:8px;font-size:14px;">
      <strong>Vous restez intégralement couvert par notre garantie « satisfait ou remboursé » de 14 jours</strong>
      (article 9 des CGV) : sur simple demande à
      <a href="mailto:${CONTACT_EMAIL}" style="color:#3460E5;">${CONTACT_EMAIL}</a>, sans justificatif et quel que soit
      votre avancement dans le parcours, nous vous remboursons la totalité de votre paiement.
    </p>
    <p style="margin:0;font-size:14px;">
      Les conditions générales de vente applicables à votre commande${o.cgvVersion ? ` (version ${esc(o.cgvVersion)})` : ''}
      sont consultables et téléchargeables ici : <a href="${cgvUrl}" style="color:#3460E5;font-weight:600;">${cgvUrl}</a>.
      Conservez ce message : il constitue la confirmation de votre contrat sur support durable.
    </p>
  </div>

  <div style="background:#FFFFFF;border:1px solid #E7E5E4;border-radius:12px;padding:24px;margin-top:16px;">
    <h2 style="margin:0 0 12px;font-size:16px;line-height:1.3;">Formulaire type de rétractation</h2>
    <p style="margin:0 0 12px;font-size:13px;color:#57534E;">
      Communiqué conformément à l'article L221-5 du Code de la consommation. À compléter et à renvoyer uniquement si
      vous souhaitez vous rétracter du contrat.
    </p>
    <div style="padding:12px;background:#F5F5F4;border-radius:8px;font-size:13px;">
      À l'attention de <strong>CAP LEARNING</strong>, 2260 route de Saint-Fonds, 69480 Pommiers, France —
      <a href="mailto:${CONTACT_EMAIL}" style="color:#3460E5;">${CONTACT_EMAIL}</a>
      <br><br>
      Je vous notifie par la présente ma rétractation du contrat portant sur la prestation de services ci-dessous :
      <br><br>
      Parcours commandé : ______________________________<br>
      Commandé le : ______________________________<br>
      Nom du client : ______________________________<br>
      Adresse du client : ______________________________<br>
      Signature (uniquement en cas de notification sur papier) : ______________________________<br>
      Date : ______________________________
    </div>
  </div>

  <p style="margin:16px 0 0;font-size:12px;color:#57534E;text-align:center;">
    CAP LEARNING — 2260 route de Saint-Fonds, 69480 Pommiers, France<br>
    <a href="${mlUrl}" style="color:#57534E;">Mentions légales</a> ·
    <a href="${cgvUrl}" style="color:#57534E;">CGV</a> ·
    <a href="${confUrl}" style="color:#57534E;">Politique de confidentialité</a>
  </p>

</div></body></html>`;

    const text = [
        'MERCI POUR VOTRE COMMANDE',
        '',
        'Votre paiement a bien été reçu et votre accès est ouvert : ' + dashboardUrl,
        '',
        ...rows.map(([k, v]) => `${k} : ${v}`),
        '',
        '--- CONFIRMATION DE VOTRE ACCORD ET DE VOTRE RENONCIATION AU DROIT DE RÉTRACTATION ---',
        '',
        `Lors de votre commande${consentDate ? `, le ${consentDate},` : ','} vous avez expressément demandé que`,
        "l'exécution de votre parcours commence immédiatement, avant l'expiration du délai de",
        'rétractation de quatorze jours, et vous avez expressément renoncé à ce droit de',
        "rétractation. Conformément à l'article L221-28, 13° du Code de la consommation, ce droit",
        "ne peut plus être exercé dès lors que l'exécution a commencé avec votre accord.",
        '',
        'Vous restez intégralement couvert par notre garantie « satisfait ou remboursé » de',
        `14 jours (article 9 des CGV) : sur simple demande à ${CONTACT_EMAIL}, sans justificatif`,
        'et quel que soit votre avancement, nous vous remboursons la totalité de votre paiement.',
        '',
        `Conditions générales de vente applicables${o.cgvVersion ? ` (version ${o.cgvVersion})` : ''} : ${cgvUrl}`,
        'Conservez ce message : il constitue la confirmation de votre contrat sur support durable.',
        '',
        '--- FORMULAIRE TYPE DE RÉTRACTATION (art. L221-5 C. conso.) ---',
        'À compléter et renvoyer uniquement si vous souhaitez vous rétracter.',
        '',
        `À l'attention de CAP LEARNING, 2260 route de Saint-Fonds, 69480 Pommiers, France — ${CONTACT_EMAIL}`,
        '',
        'Je vous notifie par la présente ma rétractation du contrat portant sur la prestation',
        'de services ci-dessous :',
        '',
        'Parcours commandé : ______________________________',
        'Commandé le : ______________________________',
        'Nom du client : ______________________________',
        'Adresse du client : ______________________________',
        'Signature (uniquement en cas de notification sur papier) : ______________________________',
        'Date : ______________________________',
        '',
        '---',
        'CAP LEARNING — 2260 route de Saint-Fonds, 69480 Pommiers, France',
        `Mentions légales : ${mlUrl}`
    ].join('\n');

    return { subject, html, text };
}

/**
 * Envoie la confirmation. Ne jette jamais : l'appelant est un webhook de
 * paiement, un échec d'email ne doit pas provoquer de retry CinetPay ni bloquer
 * l'ouverture de l'accès. L'échec est loggué pour rattrapage.
 *
 * @returns {Promise<{sent: boolean, skipped?: string, error?: string}>}
 */
async function sendOrderConfirmation(o) {
    if (!o || !o.to) {
        console.error('[order-confirmation] destinataire manquant, email non envoyé');
        return { sent: false, skipped: 'no_recipient' };
    }
    try {
        const { subject, html, text } = buildOrderConfirmation(o);
        const result = await sendEmail({
            to: o.to,
            subject,
            html,
            text,
            replyTo: CONTACT_EMAIL
        });
        if (result && result.skipped) {
            console.warn(`[order-confirmation] ${o.transactionId}: Brevo non configuré, email NON envoyé. ` +
                `La preuve de renonciation au droit de rétractation n'est pas constituée pour cette commande.`);
            return { sent: false, skipped: result.reason || 'brevo_not_configured' };
        }
        console.log(`[order-confirmation] ${o.transactionId} → confirmation envoyée à ${o.to}`);
        return { sent: true };
    } catch (e) {
        console.error(`[order-confirmation] ${o.transactionId}: échec d'envoi — ${e.message}. ` +
            `À rattraper manuellement : sans cet email, la renonciation au droit de rétractation est inopposable.`);
        return { sent: false, error: e.message };
    }
}

module.exports = { buildOrderConfirmation, sendOrderConfirmation };
