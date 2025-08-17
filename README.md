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
- Ensure envs match `shared/env.ts` requirements. In production, `REDIS_URL` is required.
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


