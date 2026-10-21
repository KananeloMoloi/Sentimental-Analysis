'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GROQ_API_KEY = 'test-key';
process.env.GROQ_RETRY_DELAY_MS = '1';
process.env.RATE_LIMIT_PER_MIN = '1000';
const { installGroqStub } = require('../testkit/stub');
const health = require('../api/health');
const analyze = require('../api/analyze');
const insights = require('../api/insights');
const ask = require('../api/ask');

let ipCounter = 0;
async function call(handler, { method = 'POST', body, headers = {} } = {}) {
  const req = { method, body, headers: { 'x-forwarded-for': `10.0.0.${++ipCounter}`, ...headers }, socket: {} };
  const res = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(s) { this.body = s; } };
  await handler(req, res);
  return { status: res.statusCode, json: JSON.parse(res.body), headers: res.headers, raw: res.body };
}
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i, text: i % 2 ? 'app crash' : 'great food', sentiment: i % 2 ? 'negative' : 'positive', score: i % 2 ? -0.8 : 0.7, confidence: 0.9, topics: ['t'], emotions: ['e'] }));

test('health reports configuration without leaking the key', async () => {
  const r = await call(health, { method: 'GET' });
  assert.equal(r.status, 200);
  assert.equal(r.json.configured, true);
  assert.ok(!r.raw.includes('test-key'));
});

test('analyze: method, validation and success', async () => {
  const stub = installGroqStub();
  try {
    assert.equal((await call(analyze, { method: 'GET' })).status, 405);
    assert.equal((await call(analyze, { body: {} })).status, 400);
    assert.equal((await call(analyze, { body: { texts: ['ok', ' '] } })).status, 400);
    assert.equal((await call(analyze, { body: { texts: new Array(26).fill('x') } })).status, 400);
    const r = await call(analyze, { body: { texts: ['great', 'app crash'], offset: 20 } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.results.map((x) => x.id), [20, 21]);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.ok(!r.raw.includes('test-key'));
  } finally { stub.restore(); }
});

test('access code is enforced when configured', async () => {
  const stub = installGroqStub();
  process.env.ACCESS_CODE = 's3cret';
  try {
    assert.equal((await call(analyze, { body: { texts: ['a'] } })).status, 401);
    assert.equal((await call(analyze, { body: { texts: ['a'] }, headers: { 'x-access-code': 'wrong' } })).status, 401);
    assert.equal((await call(analyze, { body: { texts: ['a'] }, headers: { 'x-access-code': 's3cret' } })).status, 200);
    assert.equal((await call(health, { method: 'GET' })).json.requiresAccessCode, true);
  } finally { delete process.env.ACCESS_CODE; stub.restore(); }
});

test('rate limiting returns 429 with Retry-After', async () => {
  const stub = installGroqStub();
  process.env.RATE_LIMIT_PER_MIN = '2';
  const headers = { 'x-forwarded-for': '203.0.113.9' };
  try {
    const go = () => { const req = { method: 'POST', body: { texts: ['a'] }, headers, socket: {} }; const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = s; } }; return analyze(req, res).then(() => res); };
    assert.equal((await go()).statusCode, 200);
    assert.equal((await go()).statusCode, 200);
    const third = await go();
    assert.equal(third.statusCode, 429);
    assert.equal(third.headers['Retry-After'], '60');
  } finally { process.env.RATE_LIMIT_PER_MIN = '1000'; stub.restore(); }
});

test('missing API key gives a clear 500', async () => {
  const saved = process.env.GROQ_API_KEY; delete process.env.GROQ_API_KEY;
  try {
    const r = await call(analyze, { body: { texts: ['a'] } });
    assert.equal(r.status, 500);
    assert.match(r.json.error, /GROQ_API_KEY/);
  } finally { process.env.GROQ_API_KEY = saved; }
});

test('upstream Groq failures map to friendly errors', async () => {
  let stub = installGroqStub({ status: 429 });
  try { const r = await call(analyze, { body: { texts: ['a'] } }); assert.equal(r.status, 429); assert.match(r.json.error, /rate limit/i); } finally { stub.restore(); }
  stub = installGroqStub({ status: 403 });
  try { const r = await call(analyze, { body: { texts: ['a'] } }); assert.equal(r.status, 502); assert.match(r.json.error, /API key/); assert.ok(!r.raw.includes('upstream error')); } finally { stub.restore(); }
});

test('insights returns stats plus AI interpretation', async () => {
  const stub = installGroqStub();
  try {
    const r = await call(insights, { body: { results: rows(10) } });
    assert.equal(r.status, 200);
    assert.equal(r.json.stats.total, 10);
    assert.equal(r.json.stats.counts.negative, 5);
    assert.equal(r.json.insights.executiveSummary, 'Summary');
    assert.equal(r.json.insights.recommendations[0].priority, 'high');
    assert.equal((await call(insights, { body: { results: [] } })).status, 400);
  } finally { stub.restore(); }
});

test('insights still returns stats when the AI step fails', async () => {
  const stub = installGroqStub({ insightsStatus: 400 });
  try {
    const r = await call(insights, { body: { results: rows(4) } });
    assert.equal(r.status, 200);
    assert.equal(r.json.stats.total, 4);
    assert.equal(r.json.insights, null);
    assert.match(r.json.insightsError, /rejected/);
  } finally { stub.restore(); }
});

test('ask validates input and returns a trimmed answer', async () => {
  const stub = installGroqStub();
  try {
    assert.equal((await call(ask, { body: { results: rows(3) } })).status, 400);
    assert.equal((await call(ask, { body: { question: 'q'.repeat(501), results: rows(3) } })).status, 400);
    const r = await call(ask, { body: { question: 'What is wrong?', results: rows(3) } });
    assert.equal(r.status, 200);
    assert.equal(r.json.answer, 'Answer');
  } finally { stub.restore(); }
});
