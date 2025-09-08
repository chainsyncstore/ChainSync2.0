## ChainSync — Product Requirements Document (PRD)

### 1. Overview
ChainSync is a multi-store Point of Sale (POS) and inventory platform that unifies checkout, real-time analytics, and centralized administration. It supports offline-first POS, barcode scanning, inventory management, low-stock alerts, loyalty, subscriptions/billing, and optional AI-driven insights and forecasting.

### 2. Problem Statement
Store owners and managers struggle with fragmented tools for sales, inventory, and analytics, especially across multiple locations. Manual data consolidation causes errors, delayed decisions, and stockouts. ChainSync streamlines sales capture, inventory accuracy, and insights across stores in real time.

### 3. Goals and Non-Goals
- Goals:
  - Provide reliable POS with idempotent sales recording and accurate inventory updates
  - Offer real-time dashboards, alerts, and analytics for managers/admins
  - Support multi-store operations and role-based access (admin/manager/cashier)
  - Enable data import from CSV and seamless web-based use with secure sessions
  - Provide subscription management with regional providers (Paystack/Flutterwave)
  - Optional AI features: insights, chat, demand forecasting (feature-flagged)
- Non-Goals:
  - Full ERP (procurement, accounting ledger, HR)
  - Complex warehouse WMS or advanced supply chain planning

### 4. Users and Roles
- Admin: Owns organization, manages stores, users, billing, global analytics.
- Manager: Oversees store(s), views analytics, manages inventory/loyalty, approves actions.
- Cashier: Performs checkout, scans barcodes, collects payments, prints recipts.

Role enforcement: server-side authorization with route-level checks; session-based auth; IP whitelisting optional per policy.

### 5. Key Features
- POS and Checkout
  - Scan via barcode or search catalog
  - Build cart, apply discounts/tax, accept payments (cash/card/digital)
  - Generate receipt number, record items and totals; idempotency via header
- Inventory Management
  - CRUD products; track per-store stock; set min/max levels
  - Auto-deduct on completed sale; low-stock alerts table and notifications
- Multi-Store Administration
  - Create/manage stores; assign users and permissions; centralized visibility
- Analytics and Dashboards
  - Overview KPIs, sales trends, product popularity, alerts
  - Observability endpoints for metrics and health
- Customer Loyalty
  - Customers, tiers, points earn/redeem, transaction ledger
- CSV Import and Templates
  - Inventory CSV template downloadable; upload parser and validations
- Subscriptions and Billing
  - Tiered plans, trial, payments via Paystack/Flutterwave, webhooks, dunning
- Security and Compliance
  - Sessions, CSRF strategy, rate limits, CSP, IP whitelist, audit logs
- AI (optional)
  - Chat endpoint for natural-language queries
  - AI insights cards and demand forecasting models

### 6. Detailed Requirements

6.1 POS
- Create sale with items, quantities, unit prices, discounts, tax, totals
- Status lifecycle: pending → completed/voided/held
- Idempotency required using Idempotency-Key for safe retries
- Update inventory on completed sale; emit notifications

Acceptance:
- Posting the same sale payload twice with same idempotency key must not duplicate
- Inventory levels decrement exactly by sold quantities per item

6.2 Inventory
- Product fields: name, sku, barcode, price, cost, category, brand, active
- Per-store inventory: quantity, min/max, last restocked
- Low-stock alert when quantity < min; alert listing with resolve flow

Acceptance:
- Importing CSV validates schema and rejects malformed rows with helpful errors
- Updating min/max affects alert generation immediately

6.3 Multi-Store and Roles
- Users have roles cashier/manager/admin; optional many-to-many store permissions
- Admin can create stores; assign manager/cashier to stores
- Manager limited to assigned stores; cashier to their store only

Acceptance:
- A cashier cannot access admin/analytics endpoints; 403 returned
- Manager sees only their stores’ data

6.4 Loyalty
- Customer profile with contact and loyalty number
- Tiers with points required and discounts
- Earn/redeem ledger tied to transactions

Acceptance:
- Earning points increments current and lifetime; redeeming cannot overdraw

6.5 CSV Import
- Provide `GET /api/inventory/template.csv`
- Upload CSV to create/update products and inventory with validations

Acceptance:
- Template matches server parser; columns include sku, name, price, quantity

6.6 Subscriptions and Billing
- Plans: basic/pro/enterprise; regional pricing (NGN vs USD)
- Trial support, upfront fee crediting flag, monthly billing
- Webhooks with signature verification, idempotency, and event storage
- Dunning pipeline for past_due handling

Acceptance:
- Valid signatures required; duplicate events return idempotent response
- Subscription status transitions recorded; next billing date maintained

6.7 Analytics and Observability
- Overview and analytics endpoints for KPIs
- Health: `/healthz`, `/api/observability/health` with DB latency and SMTP
- Metrics and security events for admins

6.8 Security
- Session cookies httpOnly, secure in prod, SameSite strict/lax as configured
- CSRF protection on `/api`; raw bodies excluded for webhooks
- Rate limits: global, auth-specific, sensitive exports, payment/webhooks
- CSP aligned with OpenAI, payment providers, reCAPTCHA
- IP whitelist tables and enforcement hooks
- Audit logs for sensitive actions

6.9 AI Features (feature-flagged)
- `/api/openai/chat` for NL queries; server-only key usage
- Insights and forecasting stored in AI tables; UI surfaces insights cards

Acceptance:
- When `AI_ANALYTICS_ENABLED=false`, AI routes are not registered

### 7. User Flows
- Signup and Trial
  - User signs up, gets trial; optional upfront fee logic; verify email/phone
- Login and IP Whitelist
  - After credentials, IP checked if policy enabled; denied if not whitelisted
- POS Checkout
  - Cashier scans items, confirms payment, receives receipt; inventory updates
- Manager Dashboard
  - Views alerts, top products, recent sales; adjusts stock thresholds
- Admin Billing
  - Reviews plan, updates payment method, monitors webhook health and dunning

### 8. Non-Functional Requirements
- Performance: page loads < 2s on broadband; API p95 < 300ms for common routes
- Scalability: horizontal scale on stateless API; Redis-backed sessions; indexes per schema
- Reliability: idempotency for writes; webhook dedupe; seed scripts for bootstrap
- Security: OWASP-aligned validation, sanitization, CSP, rate limits, logging
- Offline: POS queue for uploads; sync endpoints for upload/download/status

### 9. APIs (high level)
- Auth: `/api/auth/*` login, signup, 2FA, logout, me
- Inventory: `/api/inventory/*` products CRUD, template.csv
- POS: `/api/pos/sales` with `Idempotency-Key`
- Analytics: `/api/analytics/overview`
- Admin/Stores: `/api/admin/*`, `/api/stores/*`
- Loyalty: `/api/loyalty/*`, customers endpoints
- Billing/Payments: `/api/payment/*`, webhooks `/webhooks/*`
- Observability: `/api/observability/*`
- Offline Sync: `/api/sync/*`
- AI: `/api/openai/chat` and AI analytics routes when enabled

### 10. Data Model (selected)
- Users, Stores, Products, Inventory, Transactions, TransactionItems
- LowStockAlerts, Notifications, WebsocketConnections
- Customers, LoyaltyTiers, LoyaltyTransactions
- Subscriptions, SubscriptionPayments, WebhookEvents, DunningEvents
- ForecastModels, DemandForecasts, AIInsights, SeasonalPatterns, ExternalFactors
- IPWhitelists, IPWhitelistLogs, Sessions, PasswordReset/Verification tokens

### 11. Constraints and Risks
- Payment provider differences (NGN vs USD) and webhook reliability
- Offline conflicts during sync; requires conflict resolution strategy
- AI cost control; must be feature-flagged and rate-limited

### 12. Success Metrics
- Operational: error rates < 0.5% p95; webhook duplication handled 100%
- Business: reduced stockouts, faster checkout, increased retention/ARPU
- Adoption: time-to-first-sale under 30 minutes from signup

### 13. Rollout and Phases
- MVP: POS, inventory, low-stock alerts, CSV import, basic analytics, auth
- Phase 2: Loyalty and customers, multi-store admin enhancements
- Phase 3: Subscriptions, payments, webhooks, dunning
- Phase 8+: AI insights, forecasting, observability, offline sync enhancements

### 14. Open Questions
- Device management for POS terminals (future)
- Returns and exchanges workflows expansion
- Advanced promotions and bundles


