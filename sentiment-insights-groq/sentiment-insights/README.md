# Sentiment Insights — Groq edition

Review sentiment dashboard with CSV input, positive/negative/neutral/mixed labels, topic and emotion breakdown, generated insights, Q&A and report export. No npm dependencies needed. Node 22+.

## Setup
1. Obtain a Groq key at https://console.groq.com/keys.
2. Copy `.env.example` to `.env` in the project root.
3. Set `GROQ_API_KEY=gsk_...` and optionally `GROQ_MODEL=openai/gpt-oss-20b`.
4. Run `npm start`, open http://localhost:3000.
5. Run `npm test` to run local mock tests without consuming API quota.

If you already have `.env.local` or deployment variables with Gemini settings, remove those old settings and add Groq ones. Never commit or share API keys. For Vercel add GROQ_API_KEY and GROQ_MODEL in project environment settings and redeploy.

## Processing
Reviews are processed sequentially in batches of 5 to reduce free-tier throttling. The progress bar smoothly estimates progress between completed batches and shows measured progress on completion. The backend retries timeouts, 429 and temporary server errors up to twice, respecting `Retry-After` where provided; the frontend does not multiply those retries. A single request may take up to ~65 seconds with retries; frontend allows 75 seconds. Progress is not a precise server-side streaming percentage. Insights failure does not discard successful review results.

Groq free-tier limits vary by model and account; see https://console.groq.com/docs/rate-limits. Live API access cannot be tested without your own key.
