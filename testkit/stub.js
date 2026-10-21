'use strict';
/** Replaces global fetch for Groq URLs only; other URLs (e.g. the local test server) pass through. */
function installGroqStub(opts = {}) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    if (!String(url).includes('api.groq.com/openai/v1/chat/completions')) return original(url, init);
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body, headers: init.headers });
    const schema = (body.response_format ? (body.messages[1].content.includes('schema exactly: {"type":"ARRAY"') ? { type: 'ARRAY' } : { type: 'OBJECT' }) : null);
    const prompt = body.messages[1].content;
    const status = schema && schema.type === 'OBJECT' && opts.insightsStatus ? opts.insightsStatus : opts.status;
    if (status && status !== 200) return { ok: false, status, text: async () => 'upstream error', json: async () => ({}) };
    let text;
    if (schema && schema.type === 'ARRAY') {
      const items = [...prompt.matchAll(/^\[(\d+)\] (.*)$/gm)]
        .filter((m) => !(opts.dropIds || []).includes(Number(m[1])))
        .map((m) => {
          const neg = /crash|cold|awful/i.test(m[2]);
          return { id: Number(m[1]), sentiment: neg ? 'negative' : 'positive', score: neg ? -0.8 : 0.7, confidence: 0.9,
            emotions: [neg ? 'anger' : 'joy'], topics: [neg ? 'app' : 'food'], summary: 'summary' };
        });
      text = JSON.stringify(items);
    } else if (schema && schema.type === 'OBJECT') {
      text = JSON.stringify({ executive_summary: 'Summary', key_themes: [{ theme: 'App', sentiment: 'negative', evidence: 'crashes' }],
        risks: ['r'], opportunities: ['o'], recommendations: [{ action: 'Fix app', priority: 'high', rationale: 'x' }] });
    } else text = ' Answer ';
    return { ok: true, status: 200, text: async () => text, json: async () => ({ choices: [{ message: { content: schema && schema.type === 'ARRAY' ? JSON.stringify({ results: JSON.parse(text) }) : text } }] }) };
  };
  return { calls, restore() { global.fetch = original; } };
}
module.exports = { installGroqStub };
