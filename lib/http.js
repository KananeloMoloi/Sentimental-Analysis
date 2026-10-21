'use strict';
const crypto = require('node:crypto');
const { GroqError } = require('./groq');

const MAX_BODY = 4 * 1024 * 1024; // Vercel's own limit is ~4.5 MB

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const hits = new Map();
/** Best-effort per-instance rate limit (serverless instances do not share memory). */
function rateLimited(req) {
  const limit = Number(process.env.RATE_LIMIT_PER_MIN ?? 60);
  if (!(limit > 0)) return false;
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || rec.reset < now) {
    hits.set(ip, { count: 1, reset: now + 60000 });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return false;
  }
  rec.count++;
  return rec.count > limit;
}

function authorized(req) {
  const code = process.env.ACCESS_CODE;
  if (!code) return true;
  const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(hash(req.headers['x-access-code'] || ''), hash(code));
}

function parseJson(s) {
  if (!s.trim()) return {};
  let v;
  try { v = JSON.parse(s); } catch { throw new HttpError(400, 'Request body must be valid JSON.'); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Request body must be a JSON object.');
  return v;
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return parseJson(req.body.toString('utf8'));
    if (typeof req.body === 'string') return parseJson(req.body);
    return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request is too large.');
    chunks.push(c);
  }
  return parseJson(Buffer.concat(chunks).toString('utf8'));
}

function send(res, status, payload, extra = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(JSON.stringify(payload));
}

function createHandler({ methods = ['POST'], auth = true, limit = true, handler }) {
  return async function (req, res) {
    try {
      if (!methods.includes(req.method)) return send(res, 405, { error: 'Method not allowed.' }, { Allow: methods.join(', ') });
      if (auth && !authorized(req)) return send(res, 401, { error: 'Missing or invalid access code.' });
      if (limit && rateLimited(req)) return send(res, 429, { error: 'Too many requests. Please slow down.' }, { 'Retry-After': '60' });
      const body = req.method === 'POST' ? await readBody(req) : {};
      return send(res, 200, await handler(body, req));
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      if (e instanceof GroqError) return send(res, e.httpStatus, { error: e.message });
      console.error(e);
      return send(res, 500, { error: 'Unexpected server error.' });
    }
  };
}

module.exports = { createHandler, HttpError };
