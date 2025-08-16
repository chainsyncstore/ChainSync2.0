### Backups

Neon Postgres logical backups:

```bash
bash infra/backup.sh ./backups
```

Requires `DATABASE_URL` in the environment and `pg_dump` in PATH.

ChainSync (PRD-aligned)

Setup
- Copy env.example to .env and fill values.
- Required: DATABASE_URL, REDIS_URL, SESSION_SECRET, CORS_ORIGINS, APP_URL, payment keys.

Scripts
- npm run dev: start API+client (existing Vite client).
- npx drizzle-kit generate && npx drizzle-kit migrate
- npm run seed: demo data (tbd).

APIs
- POST /api/auth/login (email+password, returns otp_required for admin 2FA)
- POST /api/auth/2fa/setup, POST /api/auth/2fa/verify
- GET /api/me, GET /api/me/roles
- Inventory: GET/POST /api/inventory/products, GET /api/inventory/template.csv
- POS: POST /api/pos/sales (Idempotency-Key header)
- Analytics: GET /api/analytics/overview

Deploy (Render)
- render.yaml included. Healthcheck at /healthz.

