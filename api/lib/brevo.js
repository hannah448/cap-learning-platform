/**
 * Brevo — API transactionnelle (envoi d'email)
 * --------------------------------------------
 * Utilise l'API REST Brevo v3 (pas de package npm).
 *
 * Env vars requises :
 *   BREVO_API_KEY       Clé API Brevo (Settings → SMTP & API → API Keys)
 *   BREVO_FROM_EMAIL    Adresse expéditrice validée dans Brevo (ex. no-reply@cap-learning.com)
 *   BREVO_FROM_NAME     (optionnel) Nom affiché, ex. "Cap Learning"
 *
 * Si BREVO_API_KEY est absente, sendEmail retourne { skipped: true } et log l'email
 * sans le poster — utile pour la staging et pour ne pas casser le déploiement V1.
 */

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

/**
 * @param {{to: string|string[], subject: string, html: string, text?: string, replyTo?: string}} opts
 */
async function sendEmail(opts) {
    const apiKey = process.env.BREVO_API_KEY;
    const fromEmail = process.env.BREVO_FROM_EMAIL;
    const fromName = process.env.BREVO_FROM_NAME || 'Cap Learning';

    if (!apiKey || !fromEmail) {
        console.log('[brevo] BREVO_API_KEY/BREVO_FROM_EMAIL manquants — email non envoyé.',
            { to: opts.to, subject: opts.subject });
        return { skipped: true, reason: 'missing_env' };
    }

    const toArray = (Array.isArray(opts.to) ? opts.to : [opts.to])
        .filter(Boolean)
        .map(email => ({ email }));

    const body = {
        sender: { name: fromName, email: fromEmail },
        to: toArray,
        subject: opts.subject,
        htmlContent: opts.html
    };
    if (opts.text) body.textContent = opts.text;
    if (opts.replyTo) body.replyTo = { email: opts.replyTo };

    const res = await fetch(BREVO_API, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': apiKey,
            'content-type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Brevo send failed: ${res.status} ${txt}`);
    }
    return res.json();
}

module.exports = { sendEmail };
