'use strict';
/** Zero-dependency local server that mimics Vercel: static files from /public and the /api handlers.
 *  Run with `npm start` (reads .env.local or .env). Not used in production. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json; charset=utf-8',
};

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(__dirname, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[2] !== '' && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

function createServer() {
  const routes = {
    '/api/health': require('./api/health'),
    '/api/analyze': require('./api/analyze'),
    '/api/insights': require('./api/insights'),
    '/api/ask': require('./api/ask'),
  };
  return http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.statusCode = 400; return res.end('Bad request'); }
    if (routes[pathname]) return routes[pathname](req, res);
    const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.statusCode = 403; return res.end('Forbidden'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.statusCode = 404; return res.end('Not found'); }
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(data);
    });
  });
}

if (require.main === module) {
  loadEnv();
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    console.log(`Sentiment Insights running at http://localhost:${port}`);
    if (!process.env.GROQ_API_KEY) console.log('Warning: GROQ_API_KEY is not set (copy .env.example to .env.local).');
  });
}

module.exports = { createServer };
