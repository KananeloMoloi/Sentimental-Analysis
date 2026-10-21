'use strict';
const { createHandler, HttpError } = require('../lib/http');
const { analyzeTexts, MAX_CHUNK } = require('../lib/analysis');

module.exports = createHandler({
  handler: async (body) => {
    const { texts, offset = 0 } = body;
    if (!Array.isArray(texts) || !texts.length) throw new HttpError(400, '"texts" must be a non-empty array.');
    if (texts.length > MAX_CHUNK) throw new HttpError(400, `Send at most ${MAX_CHUNK} texts per request.`);
    const clean = texts.map((t) => String(t == null ? '' : t).trim());
    if (clean.some((t) => !t)) throw new HttpError(400, 'Texts must not be empty.');
    const off = Number.isInteger(offset) && offset >= 0 && offset < 100000 ? offset : 0;
    return { results: await analyzeTexts(clean, off) };
  },
});
