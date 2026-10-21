# Sentiment Insights — Project Documentation

Groq edition | 21 October 2026

## 1. Project overview

Sentiment Insights is a web-based dashboard that uses the Groq API to classify customer review sentiment, summarize themes and emotions, generate AI insights, and answer questions about analyzed reviews. It accepts review data, displays aggregated results, and exports reports.

## 2. Core functionality

• Review input including CSV import and sample review data.
• Classification: positive, negative, neutral, or mixed.
• Emotion, topic, summary, score and confidence output per review.
• Dashboard charts and aggregate sentiment statistics.
• AI-generated insights and question-answering based on results.
• CSV and JSON exports.

## 3. Technology stack

Frontend: HTML, CSS and vanilla JavaScript in public/. Backend: Node.js 22+ using built-in fetch and HTTP modules. AI provider: Groq chat completions REST API. No npm runtime dependencies are declared. Tests: built-in Node.js test runner.

## 4. Architecture and data flow

Browser → /api/analyze (reviews in batches of 5) → lib/analysis.js → lib/groq.js → Groq API. The browser accumulates analysis results, then calls /api/insights to calculate statistics and request narrative insights. /api/ask answers questions about current results. /api/health reports configuration status without exposing secrets.

## 5. Project structure

public/index.html — application page
public/app.js — client interactions, batching, progress, charts, exports
public/styles.css — styling
public/sample_reviews.csv — example dataset
api/analyze.js — analysis endpoint
api/insights.js — statistics and AI insights endpoint
api/ask.js — question-answering endpoint
api/health.js — configuration health endpoint
lib/analysis.js — validation, aggregation and AI prompts
lib/groq.js — Groq REST client, timeouts and retries
lib/http.js — API handler and request utilities
dev-server.js — local development server
vercel.json — Vercel deployment settings
test/ — automated tests

## 6. Local installation

Prerequisite: Node.js 22 or newer.
1. Extract the project ZIP and open sentiment-insights/.
2. Copy .env.example to .env.
3. Enter GROQ_API_KEY and optionally GROQ_MODEL.
4. Run npm start.
5. Open http://localhost:3000.
6. Run npm test to execute local tests without spending API quota.

## 7. Environment variables

GROQ_API_KEY — required secret, issued by GroqCloud.
GROQ_MODEL — optional; defaults to openai/gpt-oss-20b.
ACCESS_CODE — optional deployment access protection.
RATE_LIMIT_PER_MIN — optional request rate setting; example 60.
Never expose API keys in public JavaScript or commit .env files.

## 8. API endpoints

GET /api/health — returns ok, model, configured, requiresAccessCode and maxTexts.
POST /api/analyze — JSON: {"texts":["Great service"],"offset":0}; returns {"results":[...]}.
POST /api/insights — JSON: {"results":[...]}; returns stats, insights and insightsError.
POST /api/ask — JSON: {"question":"What are the common complaints?","results":[...]}; returns answer.
Requests may require an access code if ACCESS_CODE is configured. Follow the frontend implementation for its header convention.

## 9. Progress, retries and timeouts

The frontend processes reviews sequentially in batches of five. Its progress indicator animates an estimated percentage during a request, confirms progress after each completed batch, allocates approximately 0–85% to analysis and 85–100% to insights, and is not a streamed server measurement. The Groq client uses a 20-second per-attempt timeout and up to two retries for temporary network/API failures (including 429 and 5xx), with backoff and Retry-After support. The browser uses a 75-second timeout for API requests. Long operations can still fail under hosting limits.

## 10. Error handling

Missing key: configure GROQ_API_KEY on the server.
401/403: verify Groq key and permissions.
404: verify GROQ_MODEL.
429: free-tier rate limit; reduce load and wait.
502/503/504 or timeouts: retry later, reduce batch size, and check server logs.
If insight generation fails, successful review statistics can still be returned and the UI offers regeneration.

## 11. Deployment

Vercel: the repository includes vercel.json with API functions and a public/ output directory. Add GROQ_API_KEY and GROQ_MODEL to project environment settings and redeploy. Function duration and provider plan limits must be checked.
Netlify: the ZIP is NOT configured for Netlify as-is. It needs Netlify Functions or a compatible backend adapter, API route rewrites, build/publish configuration, and validation against function time limits. Do not assume that deploying the current ZIP directly will make /api/* work.

## 12. Testing and acceptance criteria

Run npm test for automated API, server and analysis tests. With a valid Groq key, manually verify: health status; a single review; CSV upload; progress during multiple batches; correct sentiment dashboard; insights; Q&A; CSV and JSON export; and handling of invalid key, throttling and temporary API failures. Automated tests do not guarantee live Groq connectivity or hosting compatibility.

## 13. Limitations and future improvements

The progress percentage is an estimate between completed batches. AI output can be imperfect or inconsistent; validate high-stakes decisions independently. Free-tier rate limits may change. Serverless execution limits may interrupt larger jobs. Potential improvements: background job processing, resumable batch analysis, better observability, user authentication, and Netlify-specific deployment support.

## 14. Resources

Groq console: https://console.groq.com/keys
Groq limits: https://console.groq.com/docs/rate-limits
Node.js: https://nodejs.org/
Vercel: https://vercel.com/docs
Netlify Functions: https://docs.netlify.com/build/functions/overview/

