'use strict';
/** Groq REST client. No dependencies; Node 22+ global fetch. */
class GroqError extends Error {
  constructor(message, httpStatus = 502) { super(message); this.name = 'GroqError'; this.httpStatus = httpStatus; }
}
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);
function friendly(status) {
  if (status === 400) return 'Groq rejected the request (400). Check the model or request format.';
  if (status === 401 || status === 403) return 'Groq API key is invalid or does not have access.';
  if (status === 404) return 'Groq model not found (404). Check GROQ_MODEL.';
  if (status === 429) return 'Groq rate limit reached (429). Wait for your free-tier limit to reset and try again.';
  if (status >= 500) return `Groq is temporarily unavailable (${status}). Try again shortly.`;
  return `Groq API error (${status}).`;
}
function retryDelay(res, attempt) {
  const raw = res?.headers?.get?.('retry-after');
  const secs = raw ? Number(raw) : NaN;
  if (Number.isFinite(secs) && secs >= 0) return Math.min(12000, secs * 1000);
  const base = Number(process.env.GROQ_RETRY_DELAY_MS) || 900;
  return Math.min(12000, base * (2 ** attempt));
}
async function callGroq({ prompt, schema, system, temperature = 0, retries = 2, timeoutMs = 20000 }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new GroqError('Server is missing GROQ_API_KEY. Add it to .env or deployment environment variables.', 500);
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
  const json = Boolean(schema);
  const messages = [
    { role: 'system', content: (system || 'You are a helpful assistant.') + (json ? '\nReturn only valid JSON matching the structure requested by the user.' : '') },
    { role: 'user', content: prompt + (json ? `\n\nReturn JSON matching this schema exactly: ${JSON.stringify(schema)}` : '') },
  ];
  // JSON object mode requires an object root. Arrays are wrapped in {results:[...]}; no change to API contracts.
  const wrapped = json && String(schema.type).toUpperCase() === 'ARRAY';
  if (wrapped) messages[1].content += '\nWrap the output array in a JSON object with a single "results" property.';
  const body = { model, messages, temperature, max_completion_tokens: 3500 };
  if (json) body.response_format = { type: 'json_object' };
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (attempt < retries) { await sleep(retryDelay(null, attempt)); continue; }
      throw new GroqError(`Could not reach Groq: ${['TimeoutError','AbortError'].includes(e.name) ? 'request timed out' : 'network error'}.`, 504);
    }
    if (!res.ok) {
      if (RETRYABLE.has(res.status) && attempt < retries) { await sleep(retryDelay(res, attempt)); continue; }
      const detail = await res.text().catch(() => '');
      console.error(`Groq HTTP ${res.status}: ${detail.slice(0, 250)}`);
      throw new GroqError(friendly(res.status), res.status === 429 ? 429 : 502);
    }
    let data;
    try { data = await res.json(); } catch { throw new GroqError('Groq returned an unreadable response.', 502); }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new GroqError('Groq returned an empty response.', 502);
    if (!json) return content;
    try {
      const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
      if (wrapped) {
        const result = Array.isArray(parsed) ? parsed : parsed.results;
        if (!Array.isArray(result)) throw Error('Expected results array');
        return result;
      }
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw Error('Expected object');
      return parsed;
    } catch { throw new GroqError('Groq returned JSON in an unexpected format. Please retry.', 502); }
  }
}
module.exports = { callGroq, GroqError };
