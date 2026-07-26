/**
 * Rate limit best-effort (in-memory, sliding window)
 * --------------------------------------------------
 * Utile pour bloquer un hammering évident depuis une même IP quand la fonction
 * Vercel est "chaude". Ne survit PAS aux cold starts et ne partage rien entre
 * instances → pour une protection stricte, brancher @vercel/kv ou Upstash.
 *
 * Usage :
 *   const { rateLimit } = require('../lib/rate-limit');   // depuis api/x.js
 *   const { rateLimit } = require('../../lib/rate-limit'); // depuis api/directory/x.js
 *   if (!rateLimit(req, { max: 60, windowMs: 60_000 })) {
 *       return res.status(429).json({ error: 'Trop de requêtes.' });
 *   }
 */

const buckets = new Map(); // ip -> [timestamps]

function getIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
    return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function rateLimit(req, { max = 60, windowMs = 60_000 } = {}) {
    const ip = getIp(req);
    const now = Date.now();
    const cutoff = now - windowMs;
    const hits = (buckets.get(ip) || []).filter(t => t > cutoff);
    if (hits.length >= max) {
        buckets.set(ip, hits);
        return false;
    }
    hits.push(now);
    buckets.set(ip, hits);
    // GC très simple : purge occasionnelle
    if (buckets.size > 1000) {
        for (const [k, v] of buckets) {
            const kept = v.filter(t => t > cutoff);
            if (kept.length === 0) buckets.delete(k);
            else buckets.set(k, kept);
        }
    }
    return true;
}

module.exports = { rateLimit };
