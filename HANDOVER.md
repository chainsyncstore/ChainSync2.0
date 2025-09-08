## ChainSync-2 — Fullstack Handover

### 1. Project Overview
- **Name**: ChainSync-2
- **Version**: 1.0.0 (from `package.json`)
- **Stack**: TypeScript, Express, Vite (React), Drizzle ORM, PostgreSQL, Redis (optional in dev), Vitest, Playwright
- **Core Domains**: Auth, POS, Inventory, Multi-Store & RBAC, Loyalty, Subscriptions/Payments, Webhooks, Offline Sync, Observability, AI feature flags

Key files/directories:
- Server: `server/index.ts`, `server/api/index.ts`, `server/api/routes.*.ts`, `server/session.ts`, `shared/env.ts`
- Client: `client/` (Vite React app)
- Tests/Plans/Reports: `tests/`, `testsprite_tests/`

Reference PRD and code summaries:
- PRD: `testsprite_tests/tmp/prd_files/PRD.md` and root `PRD.md`
- Code summary: `testsprite_tests/tmp/code_summary.json`

### 2. How to Run (Local)
Backend (full app):
1) Install deps: `npm install`
2) Copy env: `cp env.example .env` (Windows: copy manually). Set minimally:
   - `APP_URL=http://localhost:5000`
   - `CORS_ORIGINS=http://localhost:5000`
   - `SESSION_SECRET` (>=16 chars)
   - `DATABASE_URL=postgresql://...` (prod/full app; optional for the lightweight test server)
   - `REDIS_URL` optional in dev (in-memory sessions are supported)
3) Start dev server: `npm run dev` (serves API and client on PORT=5000)

Lightweight backend test server (no DB, for diagnosis):
- `npm run dev:test` (listens on `http://localhost:5000` with mock endpoints)

Build & start (prod bundle):
- `npm run build` then `npm start`

Seeding helpers (optional):
- `npm run seed:ensure-admin`, `npm run seed:secure`, `npm run seed:demo`

### 3. Testsprite Diagnosis — Latest Summary
Source report (frontend + backend combined):
- Markdown: `testsprite_tests/testsprite-mcp-test-report.md`
- HTML: `testsprite_tests/testsprite-mcp-test-report.html`
- Frontend plan: `testsprite_tests/testsprite_frontend_test_plan.json`
- Backend plan: `testsprite_tests/testsprite_backend_test_plan.json`
- Raw results: `testsprite_tests/tmp/test_results.json` (if present)

Overall coverage (from report):
- Total tests: 19 | Passed: 4 | Failed: 15 | Partial: 0

High-signal observations:
- Authentication 401 on `GET /api/auth/me` is the primary blocker cascading into most feature failures (login, inventory, POS, etc.).
- Frontend asset serving instability in headless runs; disabling HMR and serving built static assets improves reliability.
- IP whitelist enforcement and invalid-credentials handling behave as expected.
- AI feature flags behave as expected (routes only when enabled).

#### Frontend — Key Findings
- Many flows fail due to backend auth 401 (session not established), preventing navigation to protected pages.
- Intermittent asset/WS issues when relying on Vite HMR in tests; using static build is recommended for E2E.
- Passed checks: invalid email validation (signup), invalid password handling (login), and IP whitelist enforcement.

#### Backend — Key Findings
- When tested headlessly against `http://localhost:5000`, auth/session issuance still fails at `me` route (401), blocking feature tests for POS, inventory, loyalty, webhooks, sync, and observability.
- Webhooks suggested to be validated via direct POST (bypassing UI) with signed requests.

See grouped details, test IDs, severities, and links inside:
- `testsprite_tests/testsprite-mcp-test-report.md`

### 4. Root Causes (Hypotheses) and Top Fixes
P0 — Authentication/session 401 on `/api/auth/me`:
- Verify session issuance during `/api/auth/login` and subsequent `me` checks.
- Confirm CSRF flow: `GET /api/auth/csrf-token` then include header/cookie for state-changing requests.
- Check rate limit middleware ordering and CSRF exclusions in `server/api/index.ts` and `server/middleware/security.ts`.
- Ensure in dev tests that Redis is optional (it is) and that the session cookie is being set/returned with correct SameSite flags.

P0 — Frontend asset serving for E2E:
- Build client (`vite build`) and use static serving path (see `server/vite.ts` helpers) for tests; set `DISABLE_VITE_HMR=true`.

P1 — Webhooks direct validation:
- Send signed requests to `/webhooks/paystack` and `/webhooks/flutterwave` to confirm signature and idempotency logic independently of UI.

P1 — Observability endpoints:
- After login fix, verify `/api/observability/health`, metrics, and security logs endpoints (some may be admin-only).

### 5. API Map (Selected)
Auth: `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/csrf-token`
Inventory: `/api/stores/{storeId}/inventory`, `/api/inventory/products`, `/api/inventory/import`, `/api/inventory/template.csv`
POS: `/api/pos/sales` (idempotent via `Idempotency-Key` header)
Payments: `/api/payment/initialize`, `/api/payment/verify`
Webhooks: `/webhooks/paystack`, `/webhooks/flutterwave`
Observability: `/api/observability/health`, `/api/observability/metrics`
Offline Sync: `/api/sync/upload`, `/api/sync/download`, `/api/sync/status`, `/api/sync/resolve-conflicts`

### 6. Environment Notes
- Env schema lives in `shared/env.ts` (strict; production hard-requires `REDIS_URL`).
- Dev/test allow in-memory sessions if `REDIS_URL` unset (see `server/session.ts`).
- CORS/URLs: set `APP_URL` and include app origin in `CORS_ORIGINS` CSV.

### 7. Reproduce and Validate (Suggested Flow)
1) Start backend dev server: `npm run dev` (PORT=5000). Alternatively, for a mock-only run: `npm run dev:test`.
2) Fetch CSRF token (if applicable) then login; verify `Set-Cookie` for `chainsync.sid`.
3) Call `GET /api/auth/me` with session cookie; expect 200.
4) Re-run Testsprite (backend-oriented) against `http://localhost:5000` with HMR disabled/static assets served.
5) Exercise POS, inventory CRUD, CSV import, and observability endpoints.

### 8. Prioritized Action Plan
1) Fix session/CSRF/login flow so `GET /api/auth/me` returns 200 after login.
2) Serve static assets (disable HMR) for headless tests; confirm client reliability in E2E.
3) Add or verify admin seeding (`npm run seed:ensure-admin`) to provide working credentials.
4) Validate webhook signature + idempotency via direct POST to `/webhooks/*`.
5) Validate inventory CSV template/download/import end-to-end.
6) Validate observability health/metrics and RBAC restrictions.

### 9. Useful Commands
- Dev server: `npm run dev`
- Test server (mock): `npm run dev:test`
- Build: `npm run build`
- Start (prod): `npm start`
- DB: `npm run db:generate && npm run db:migrate`
- Seed: `npm run seed:ensure-admin`
- Tests: `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`

### 10. Artifacts Index
- Testsprite report (latest): `testsprite_tests/testsprite-mcp-test-report.md`
- Testsprite HTML: `testsprite_tests/testsprite-mcp-test-report.html`
- Frontend plan: `testsprite_tests/testsprite_frontend_test_plan.json`
- Backend plan: `testsprite_tests/testsprite_backend_test_plan.json`
- PRD: `testsprite_tests/tmp/prd_files/PRD.md` (mirror at root `PRD.md`)
- Code summary: `testsprite_tests/tmp/code_summary.json`

### 11. Open Risks
- Auth 401 blocks majority of functionality tests; resolve first.
- Headless/static serving setup must be stabilized for reliable E2E.
- Production requires `REDIS_URL`; ensure parity between dev/prod behavior.

---
This handover consolidates the current diagnosis and the paths to resolution. For detailed per-test analysis, always consult `testsprite_tests/testsprite-mcp-test-report.md`.


