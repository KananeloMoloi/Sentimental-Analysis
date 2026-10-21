'use strict';
const { createHandler } = require('../lib/http');
const { MAX_RESULTS } = require('../lib/analysis');

module.exports = createHandler({
  methods: ['GET'], auth: false, limit: false,
  handler: async () => ({
    ok: true,
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    configured: Boolean(process.env.GROQ_API_KEY),
    requiresAccessCode: Boolean(process.env.ACCESS_CODE),
    maxTexts: MAX_RESULTS,
  }),
});
