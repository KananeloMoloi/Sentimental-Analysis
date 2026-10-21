'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.GROQ_API_KEY = 'test-key';
process.env.RATE_LIMIT_PER_MIN = '1000';
const { installGroqStub } = require('../testkit/stub');
const { createServer } = require('../dev-server');

test('end-to-end through the HTTP server', async (t) => {
  const stub = installGroqStub();
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { stub.restore(); server.close(); });

  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Sentiment Insights/);
  assert.match((await fetch(base + '/app.js')).headers.get('content-type'), /javascript/);
  assert.notEqual((await fetch(base + '/%2e%2e/package.json')).status, 200);
  assert.equal((await fetch(base + '/nope.txt')).status, 404);

  const post = (p, body, raw) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw || JSON.stringify(body) });
  const a = await post('/api/analyze', { texts: ['great food', 'app crash'], offset: 0 });
  assert.equal(a.status, 200);
  const { results } = await a.json();
  const i = await (await post('/api/insights', { results })).json();
  assert.equal(i.stats.total, 2);
  assert.equal((await post('/api/analyze', null, '{not json')).status, 400);
});

test('static front end is CSP-safe (no inline scripts, styles or handlers)', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'inline <script> found');
  assert.ok(!/\sstyle=/i.test(html), 'inline style attribute found');
  assert.ok(!/\son[a-z]+=/i.test(html), 'inline event handler found');
  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(app), 'unsafe HTML sink found');
});

test('every element id used by app.js exists in index.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const used = new Set([...app.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]));
  ['search', 'f-sent', 'f-sort'].forEach((i) => used.add(i));
  const missing = [...used].filter((id) => !new RegExp(`id="${id}"`).test(html));
  assert.deepEqual(missing, []);
});

test('asset links are relative so the page styles correctly from any path (including file://)', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const refs = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  const bad = refs.filter((r) => r.startsWith('/') && !r.startsWith('//'));
  assert.deepEqual(bad, []);
  assert.ok(refs.includes('styles.css'));
  const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
  assert.equal(css.split('{').length, css.split('}').length, 'unbalanced braces in styles.css');
});
