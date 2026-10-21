'use strict';
const { createHandler, HttpError } = require('../lib/http');
const { sanitizeResults, aggregate, askData } = require('../lib/analysis');

module.exports = createHandler({
  handler: async (body) => {
    const question = String(body.question || '').trim();
    if (!question) throw new HttpError(400, 'Please enter a question.');
    if (question.length > 500) throw new HttpError(400, 'Question must be 500 characters or fewer.');
    const results = sanitizeResults(body.results);
    if (!results.length) throw new HttpError(400, '"results" must be a non-empty array.');
    return { answer: await askData(question, results, aggregate(results)) };
  },
});
