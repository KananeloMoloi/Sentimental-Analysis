'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GROQ_API_KEY = 'test-key';
process.env.GROQ_RETRY_DELAY_MS = '1';
const { installGroqStub } = require('../testkit/stub');
const A = require('../lib/analysis');

test('normalize clamps and repairs bad model output', () => {
  const r = A.normalize({ sentiment: 'WEIRD', score: 9, confidence: 'x', topics: ['  Price '], emotions: null }, 't', 3);
  assert.deepEqual([r.sentiment, r.score, r.confidence, r.topics, r.emotions, r.id], ['neutral', 1, 0.5, ['price'], [], 3]);
});

test('aggregate computes exact statistics', () => {
  const rows = A.sanitizeResults([
    { sentiment: 'positive', score: 0.8, confidence: 1, topics: ['food'], emotions: ['joy'], text: 'a' },
    { sentiment: 'positive', score: 0.6, confidence: 1, topics: ['food'], emotions: ['joy'], text: 'b' },
    { sentiment: 'negative', score: -0.7, confidence: 0.5, topics: ['app'], emotions: ['anger'], text: 'c' },
    { sentiment: 'neutral', score: 0, confidence: 0.5, topics: [], emotions: [], text: 'd' },
  ]);
  const s = A.aggregate(rows);
  assert.equal(s.total, 4);
  assert.deepEqual(s.counts, { positive: 2, neutral: 1, negative: 1, mixed: 0 });
  assert.equal(s.percentages.positive, 50);
  assert.equal(s.sentimentIndex, 25);
  assert.equal(s.avgScore, 0.18);
  assert.deepEqual(s.topTopics[0], { topic: 'food', mentions: 2, avgScore: 0.7 });
  assert.equal(A.aggregate([]).avgScore, 0);
});

test('analyzeTexts keeps global ids and fills gaps when the model skips an item', async () => {
  const stub = installGroqStub({ dropIds: [41] });
  try {
    const out = await A.analyzeTexts(['great food', 'app crash', 'nice'], 40);
    assert.deepEqual(out.map((r) => r.id), [40, 41, 42]);
    assert.equal(out[0].sentiment, 'positive');
    assert.equal(out[1].confidence, 0);            // fallback row
    assert.equal(out[1].sentiment, 'neutral');
    const call = stub.calls[0];
    assert.match(call.url, /chat\/completions$/);
    assert.equal(call.headers.Authorization, 'Bearer test-key');
    assert.equal(call.body.response_format.type, 'json_object');
    assert.match(call.body.messages[1].content, /\[40\] great food/);
  } finally { stub.restore(); }
});

test('sanitizeResults caps size and tolerates junk', () => {
  assert.deepEqual(A.sanitizeResults('nope'), []);
  const rows = A.sanitizeResults([null, 5, { text: 'x'.repeat(5000) }]);
  assert.equal(rows.length, 3);
  assert.equal(rows[2].text.length, 1500);
  assert.equal(A.sanitizeResults(new Array(900).fill({})).length, 500);
});
