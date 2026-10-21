'use strict';
const { createHandler, HttpError } = require('../lib/http');
const { sanitizeResults, aggregate, generateInsights } = require('../lib/analysis');
const { GroqError } = require('../lib/groq');

module.exports = createHandler({
  handler: async (body) => {
    const results = sanitizeResults(body.results);
    if (!results.length) throw new HttpError(400, '"results" must be a non-empty array.');
    const stats = aggregate(results);
    try {
      return { stats, insights: await generateInsights(results, stats), insightsError: null };
    } catch (e) {
      // Stats are exact and local, so still return them if the AI step fails.
      if (e instanceof GroqError) return { stats, insights: null, insightsError: e.message };
      throw e;
    }
  },
});
