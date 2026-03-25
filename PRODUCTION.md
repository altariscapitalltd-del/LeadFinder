# Production Runbook

## 1) Environment
- Copy `.env.example` to your deployment secret store or `.env.local`.
- Set `APP_URL` to your public HTTPS URL.
- Set `NEXTAUTH_SECRET` to a strong value (32+ chars).
- Set `DATABASE_PATH` to persistent storage.
- Keep `SMTP_ALLOW_INVALID_TLS=0` in production.

## 2) Build and start
- Validate env + build: `npm run build:prod`
- Start server: `npm run start:prod`

## 3) Health check
- Endpoint: `GET /api/health`
- Success response includes `{ ok: true }`.

## 4) Operational notes
- SQLite is local disk storage. Use a persistent volume on VPS/Docker.
- Vercel does not provide persistent local disk for SQLite-backed production data. For Vercel production, move `contacts`, `campaigns`, `scrape_jobs`, and AI router tables to hosted storage such as Postgres.
- A migration helper now exists at `scripts/migrate-to-postgres.mjs`. Run `pnpm migrate:postgres` with `DATABASE_URL` set to export current SQLite data into Postgres.
- Discovery now supports real-time event streaming, per-job result filtering, CSV export, and optional Playwright rendering fallback for JS-heavy pages.
- AI routing now supports OpenAI, OpenRouter, Gemini, Groq, Anthropic, and OpenAI-compatible endpoints through the Settings UI.
- Provider model discovery is automatic after saving an API key; users should not manually select models.
- Rotate API keys if any were ever committed to source history.
- Keep `.env`, `.db`, `.next`, and `node_modules` out of version control via `.gitignore`.
