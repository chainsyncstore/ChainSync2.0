## ChainSync — Developer Guide (DX)

### Quick start (≤ 30 minutes)
1) Prereqs: Node 20+, pnpm or npm, Postgres 14+, optional Redis 6+.
2) Clone and install:
   - `git clone <repo>` then `cd ChainSync-2`
   - `npm ci`
3) Configure env:
   - `cp env.example .env`
   - Fill at minimum: `DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGINS`, `APP_URL`.
   - For local dev you can skip payment keys and Redis (set `REDIS_URL` only if using Redis locally).
4) Database: generate + migrate + seed
   - `npm run db:generate`
   - `npm run db:migrate`
   - `npm run db:seed`
5) Run the app (in two terminals):
   - API/server: `npm run dev:server` (default http://localhost:5000)
   - Web/client: `npm run dev:web` (default http://localhost:5173)

Time budget on a typical machine: install 8–12 min, DB 1–3 min, first dev run 1–2 min. Total ≤ 20–25 min.

### Environment
- Canonical schema lives in `shared/env.ts`. See validations and defaults.
- Example template: `env.example`. For local dev, required minimum:
  - **DATABASE_URL**: Postgres connection
  - **SESSION_SECRET**: any 16+ char string
  - **CORS_ORIGINS**: CSV list including your dev origins (e.g. http://localhost:5173,http://localhost:5000)
  - **APP_URL**: your server base (e.g. http://localhost:5000)
- Optional in dev: Redis, Payments, OpenAI, WebSocket tuning, Offline POS flags.

### Scripts (Developer DX)
- `npm run dev:web`: start the Vite web client
- `npm run dev:server`: start the Express API (TSX)
- `npm run db:generate`: generate Drizzle migrations from the schema
- `npm run db:migrate`: apply migrations to the target DB
- `npm run db:seed`: seed development data (`scripts/seed.ts`)

Advanced:
- `npm run build`: production build (client + bundled server)
- `npm run test` / `npm run test:unit`: run unit tests (Vitest)
- Drizzle config: `drizzle.config.ts` (uses `shared/prd-schema.ts`)

### CSV Import Templates
- Inventory import template is tracked at `scripts/csv-templates/inventory_import_template.csv`.
- The server exposes `GET /api/inventory/template.csv` for convenience.
- Typical columns: sku, name, price, quantity, reorder_level, etc.
- Import flow: use the Inventory screen in the app (Import action) or POST to the relevant endpoint with `multipart/form-data`.

### Common APIs (high level)
- Auth: `POST /api/auth/login`, `POST /api/auth/2fa/setup`, `POST /api/auth/2fa/verify`, `GET /api/me`
- Inventory: `GET/POST /api/inventory/products`, `GET /api/inventory/template.csv`
- POS: `POST /api/pos/sales` (use `Idempotency-Key` header)
- Analytics: `GET /api/analytics/overview` (AI features gated by env)

### Deployment (Render)
- `render.yaml` included; healthcheck `GET /healthz`.
- Ensure envs match `shared/env.ts`. Production: `REDIS_URL` required, `SESSION_SECRET` ≥ 32 chars, `CORS_ORIGINS` must include your app origins.
- Build artifact: `dist/` (client output under `dist/public`). Start command: `node dist/index.js`.

### Backups
- Neon Postgres logical backups:
  ```bash
  bash infra/backup.sh ./backups
  ```
  Requires `DATABASE_URL` in the environment and `pg_dump` in PATH.

### Troubleshooting
- Drizzle requires `DATABASE_URL` to run. Check `drizzle.config.ts`.
- CORS: make sure your dev origins are present in `CORS_ORIGINS` (CSV).
- Payments are optional in dev; omit keys or leave placeholders.
- Windows: prefer `npm ci` in PowerShell. All scripts are cross-platform (no Bash required for dev).



### Architecture and Entrypoints
- **Canonical server entrypoint**: `server/index.ts` boots Express, security middleware, monitoring, serves client, and listens on `PORT` (default 5000).
- **API registration**: `server/api/index.ts` configures sessions/cookies/CSRF/rate limits and registers all route modules.
- **Client (Vite)**: `client/` served in dev on 5173; in production static assets are served by the server.

### Auth Service and Core API Routes
- Auth endpoints in `server/api/routes.auth.ts`:
  - `POST /api/auth/signup`
  - `POST /api/auth/login` (rate-limited)
  - `GET /api/auth/csrf-token`
  - `POST /api/auth/2fa/setup`, `POST /api/auth/2fa/verify`
  - `POST /api/auth/logout`, `GET /api/auth/realtime-token`, `GET /api/auth/me`
- Other notable routes are registered in `server/api/index.ts` (inventory, POS, analytics, admin, billing, payment, webhooks, observability, offline sync).

### Security, CORS, Cookies, CSP
- See `server/middleware/security.ts` for:
  - Helmet security headers and detailed CSP (script/style/font/img/connect/frame/form-action) including payment providers and reCAPTCHA.
  - CORS: allowed origins derived from env (`shared/env.ts`). API path `/api` is CORS-protected.
  - CSRF: `csrfProtection` applied to `/api` routes, not to webhook raw endpoints.
  - Rate limiting: global, auth, sensitive export endpoints, and webhook-specific.
- Cookies: `server/lib/cookies.ts` sets `httpOnly`, `secure` (prod), and `sameSite: 'lax'`; session cookie `chainsync.sid`. `COOKIE_DOMAIN` (optional) scopes cookies.

### Webhooks (Payments)
- Implementation: `server/api/routes.webhooks.ts`.
- Endpoints (raw body required):
  - Paystack: `POST /webhooks/paystack` and `POST /api/payment/paystack-webhook`
  - Flutterwave: `POST /webhooks/flutterwave` and `POST /api/payment/flutterwave-webhook`
- Aliases: `/api/webhook/paystack`, `/api/webhook/flutterwave`; generic `/api/payment/webhook` returns 200 (tests only).
- Required headers:
  - Common: `x-event-id` (unique), `x-event-timestamp` (skew-checked; default ±5m).
  - Paystack: `x-paystack-signature` (HMAC-SHA512 with `WEBHOOK_SECRET_PAYSTACK` or `PAYSTACK_SECRET_KEY`).
  - Flutterwave: `verif-hash` (HMAC-SHA256 with `WEBHOOK_SECRET_FLW` or `FLUTTERWAVE_SECRET_KEY`).
- Idempotency:
  - Header `x-event-id` is cached (TTL default 10m) and events are also recorded in `webhookEvents` table; duplicates return `{ idempotent: true }`.

### Health and Metrics
- Liveness: `GET /healthz` (see `server/api/index.ts`) returns uptime and SMTP health.
- Detailed health: `GET /api/observability/health` (see `server/api/routes.observability.ts`) with DB latency and metrics.
- Metrics and security analytics (admin-only):
  - `GET /api/observability/metrics`
  - `GET /api/observability/security/events`
  - `GET /api/observability/performance`
  - `GET /api/observability/websocket/stats`
  - `POST /api/observability/metrics/clear`

### Offline Sync
- Endpoints in `server/api/routes.offline-sync.ts` (auth required unless noted):
  - `POST /api/sync/upload` — upload batched offline sales/inventory updates; conflict-safe writes; records metrics/audit.
  - `GET /api/sync/download?storeId=...&lastSync=...` — download delta data for products/inventory.
  - `GET /api/sync/status?storeId=...&deviceId=...` — current sync health/metrics.
  - `POST /api/sync/resolve-conflicts` — resolve conflicts with a strategy.
  - `GET /api/sync/health` — sync service health.

### SMTP
- Transport defined in `server/email.ts` with env-driven host/port/secure/auth and startup verification in `server/index.ts`.
- Env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.


### Relevant Tests
- **Webhooks**
  - `tests/integration/subscriptions.webhooks.test.ts` — signature verification, headers, idempotency behavior
  - `tests/e2e/prod-auth-payment-flow.test.ts` — full auth + payment flow, webhook integration
- **Offline Sync**
  - `tests/e2e/offline-sync.test.ts` — upload/download flows, conflict handling, status checks
- **Auth & Security**
  - `tests/auth/auth-service.test.ts` — core auth service
  - `tests/auth/lockout-behavior.test.ts` — rate limiting/lockout scenarios
  - `tests/auth/signup-validation-behavior.test.ts` — signup validation
  - `tests/integration/auth-validation.test.ts` — end-to-end auth route validations
- **Admin/Analytics**
  - `tests/integration/admin.test.ts` — admin route protections
  - `tests/integration/analytics.test.ts` — analytics endpoints

Tip: see `tests/config/test-environment.ts` for the test bootstrap and env expectations.

### Seeding a test admin user (Pro)

For quick user testing you can seed an admin user with a Pro subscription. A small script `seed-admin-pro.mjs` is included at the repository root and is schema-aware (it adapts to common column name variants).

Important: run this only against development/staging databases. Do NOT run against production without review.

Environment variables
- `DATABASE_URL` (required) — Postgres connection string. Example for Neon provided in project tasks.
- `ADMIN_EMAIL` (optional) — email to create or use (default: `admin@chainsync.local`).
- `ADMIN_USERNAME` (optional) — username to create (default: `admin`).
- `ADMIN_PASSWORD` (optional) — password to set for the user (default: `Password123!`).

PowerShell example (one-liner):

```pwsh
$env:DATABASE_URL='postgresql://user:pass@host:port/db?sslmode=require&channel_binding=require'
$env:ADMIN_EMAIL='admin@chainsync.local'
$env:ADMIN_PASSWORD='YourSecureTestPassword1!'
node .\seed-admin-pro.mjs
```

What the script does
- Detects available `users` and `subscriptions` table columns and adapts inserts/updates accordingly.
- Creates a user (if none exists) and marks them as admin (either via `role` or `is_admin` column depending on schema).
- Creates a subscription row for the user (if the subscriptions table is linked by a user reference column), marking it active.

Notes & safety
- Passwords are hashed with bcrypt before being stored.
- The script prints the email/password used for the seeded account (it will note if the password came from `ADMIN_PASSWORD` env).
- If you prefer not to run Node on the server or CI, the repo also includes a SQL-ready approach in the script logs; you can copy/paste the SQL into your DB client.

If you'd like, I can add a small `docs/SEEDING.md` file with extra troubleshooting steps (connection errors, missing columns). Just say the word.
