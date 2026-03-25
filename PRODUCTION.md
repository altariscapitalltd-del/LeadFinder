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
- Rotate API keys if any were ever committed to source history.
- Keep `.env`, `.db`, `.next`, and `node_modules` out of version control via `.gitignore`.
