# POS API Reference

This document summarizes the current Point of Sale HTTP interfaces, their required payloads, and the supporting offline/loyalty behaviors. It is the baseline for the cashier-profile refactor and should be kept in sync with future schema updates.

## Table of contents

1. [Overview](#overview)
2. [/api/pos/sales](#apipossales)
   - [Request schema](#request-schema)
   - [Server-side processing](#server-side-processing)
   - [Response shape](#response-shape)
   - [Offline queue integration](#offline-queue-integration)
   - [Error cases](#error-cases)
3. [/api/pos/returns](#apiposreturns)
   - [Request schema](#returns-request-schema)
   - [Server-side processing](#returns-server-side-processing)
   - [Response shape](#returns-response-shape)
   - [Known limitations / next steps](#known-limitations--next-steps)
4. [Peripheral diagnostics & hooks](#peripheral-diagnostics--hooks)
5. [Related modules & tests](#related-modules--tests)

---

## Overview

* Sales + returns HTTP routes live in [`server/api/routes.pos.ts`](server/api/routes.pos.ts).
* POS clients call these routes directly (cashier role, IP-whitelisted) or via the offline queue when disconnected.
* Inventory, loyalty, and websocket rollups are handled server-side; clients should not mutate inventory directly.
* Cashier flows rely on `Idempotency-Key` headers so the server can safely dedupe retries and offline replays.

## `/api/pos/sales`

### Request schema

Validated by `SaleSchema` in `routes.pos.ts`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `storeId` | `uuid` | ✅ | Cashier-selected store scope. |
| `subtotal` | `string` | ✅ | Sum of line totals *before* discount/tax. Server parses as float. |
| `discount` | `string` | default `"0"` | Additional discount amount (non-loyalty). |
| `tax` | `string` | default `"0"` | Applied tax amount. |
| `total` | `string` | ✅ | Client-computed total; server recalculates with loyalty adjustments. |
| `paymentMethod` | `string` | default `"manual"` | Typically `cash | card | digital`. |
| `customerPhone` | `string` | optional | Used to look up / create loyalty account. |
| `redeemPoints` | `number` | optional | Integer points to redeem. Validated vs loyalty balance. |
| `items` | `array` | ✅ | Each item requires `productId`, positive `quantity`, `unitPrice`, `lineDiscount`, `lineTotal` (all strings). |

**Headers:**
* `Idempotency-Key` (required). Missing key ⇒ HTTP 400.
* `Content-Type: application/json`.

### Server-side processing

1. **Auth & RBAC:** `requireAuth`, `requireRole('CASHIER')`, `enforceIpWhitelist`.
2. **Idempotency check:** Query `sales` table by `idempotencyKey`; if present, return existing row.
3. **Org/user resolution:** Pull cashier (session user), org loyalty settings (`earnRate`, `redeemValue`). Tests fall back to deterministic fixtures when `userId` missing in `NODE_ENV=test`.
4. **Loyalty:**
   - Look up/create customer by `customerPhone`.
   - Validate `redeemPoints` ≤ account balance; compute monetary discount via `redeemValue`.
   - Debit redeemed points before sale insert; credit earned points after ( spend base = subtotal - discounts).
5. **Persist sale:** Insert into `sales` table with normalized amounts (`subtotal`, `discount + loyalty`, `tax`, recalculated `total`). Cashier & org IDs are recorded plus `idempotencyKey`.
6. **Sale items:** Insert each item into `sale_items`; decrement inventory rows using raw SQL updates.
7. **Rollups & notifications:**
   - Call `incrementTodayRollups` (Redis) to update analytics counters.
   - Publish websocket `sale:created` event (store and org channels) when WS service is enabled.
8. **Offline compatibility:** On network failures, clients enqueue identical payload+key via IndexedDB (see [Offline queue integration](#offline-queue-integration)).

### Response shape

The handler returns the inserted sale record (as stored in `sales`). Key fields:

```json
{
  "id": "uuid",
  "orgId": "uuid",
  "storeId": "uuid",
  "cashierId": "uuid",
  "subtotal": "100.00",
  "discount": "5.00",
  "tax": "7.50",
  "total": "102.50",
  "paymentMethod": "cash",
  "status": "COMPLETED",
  "occurredAt": "2025-11-15T08:48:15.123Z",
  "idempotencyKey": "..."
}
```

> **Note:** Sale items are not expanded in this response; clients should refetch via `/api/transactions/:id` if item-level data is needed, or via future dedicated endpoints.

### Offline queue integration

* Client helper `client/src/lib/offline-queue.ts` wraps every sale submission with an idempotency key, storing the POST request (URL, headers, payload) inside IndexedDB.
* On failures, the sale is enqueued and the UI shows "Sale queued offline".
* Background sync: service worker (`client/src/lib/service-worker.ts`) registers `background-sync` and posts `TRY_SYNC` messages to flush the queue.
* Server ingestion: `/api/sync/upload` in `server/api/routes.offline-sync.ts` accepts serialized offline sales, reuses the same business logic, and respects idempotency by storing the offline record ID as the `sales.idempotencyKey`.
* TODO tests (tracked separately) will simulate `enqueueOfflineSale`, drop network, and assert that `/api/sync/upload` creates exactly one sale + inventory mutation when reconnected.

### Error cases

| HTTP | Reason |
| --- | --- |
| 400 | Missing `Idempotency-Key`, invalid schema (zod errors), insufficient loyalty points. |
| 401 | Not authenticated. |
| 402 | Org inactive/locked (handled in `requireRole`). |
| 403 | Role/IP not allowed. |
| 500 | Unhandled DB/loyalty/inventory failures (logged via `logger.error`). |

## `/api/pos/returns`

### Request schema

Validated by `ReturnSchema` in `routes.pos.ts`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `saleId` | `uuid` | ✅ | Must reference an existing sale. |
| `storeId` | `uuid` | ✅ | Needed for inventory adjustments. |
| `reason` | `string` | optional | Stored on the `returns` row. |

### Server-side processing

1. **Auth & RBAC:** Same guards as sales route.
2. **Sale lookup:** Fetch sale; if missing ⇒ 404. If `status === 'RETURNED'` ⇒ 409.
3. **Transaction:**
   - Update sale status to `RETURNED` (raw SQL `UPDATE sales SET status = 'RETURNED'`).
   - Fetch sale items and increment inventory quantity per product for the supplied store.
   - Insert row into `returns` table capturing `saleId`, `reason`, and `processedBy`.
4. **Response:** `{ ok: true, return: { id, saleId, reason, processedBy, occurredAt } }` (no item-level details yet).

### Known limitations / next steps

* No way to specify per-item restock/discard decisions; everything is currently restocked.
* Refund metadata (full vs partial, refund amount, currency) is absent. The cashier UI must track refunds separately.
* Route does not emit websocket or analytics events.
* No dedicated GET endpoints for listing returns.
* Does not reconcile loyalty/financial adjustments from the original sale.

> These gaps are addressed in the "Returns infrastructure" step of the cashier-profile refactor. The plan is to extend the schema (`return_items` table) and enrich this endpoint so it captures product-level decisions, refund types, and store currency for downstream reporting.

## Peripheral diagnostics & hooks

Offline-first cashier flows now expose dedicated hooks and UI for barcode scanners and receipt printers:

* `ScannerProvider` / `useScannerContext` (`client/src/hooks/use-barcode-scanner.tsx`)
  * Detects connected scanners via `navigator.usb` where available, with a keyboard-wedge fallback.
  * Maintains profile selection, trigger keys, and inline indicators that surface in both the POS top bar and barcode panel.
  * Centralizes scan buffering so POS and Returns share consistent UX/toasts.
* `useReceiptPrinter` (`client/src/hooks/use-receipt-printer.ts`)
  * Wraps printer capability detection (`client/src/lib/peripherals.ts`) and surfaces profile selection, manual refresh, and busy/error states.
  * Uses a mock thermal adapter (`client/src/lib/printer.ts`) in the browser to “print” downloadable `.txt` receipts until native USB/network adapters are wired in.
* UI integration
  * POS header shows the active printer badge, refresh action, and queued-sync controls.
  * `client/src/components/pos/checkout-panel.tsx` includes a printer block with profile dropdown + “Print Last” action, feeding the `useReceiptPrinter` hook.
  * Receipts use the assigned store metadata (name/address/phone) as their header so exported copies stay compliant.

Diagnostics toasts accompany successful/failed prints, and `lastReceiptJob` is cached in `client/src/pages/pos.tsx` for immediate reprints without touching history/downloads.

## Related modules & tests

| Area | File |
| --- | --- |
| API routes | `server/api/routes.pos.ts` |
| Offline sync routes | `server/api/routes.offline-sync.ts` |
| Offline queue helper (client) | `client/src/lib/offline-queue.ts` |
| Service worker background sync | `client/src/lib/service-worker.ts` |
| Inventory & sales schema | `shared/prd-schema.ts` |
| POS page (client) | `client/src/pages/pos.tsx` |
| Checkout panel | `client/src/components/pos/checkout-panel.tsx` |
| Peripheral hooks | `client/src/hooks/use-barcode-scanner.tsx`, `client/src/hooks/use-receipt-printer.ts` |
| Printer adapter helpers | `client/src/lib/peripherals.ts`, `client/src/lib/printer.ts` |
| Offline sync tests (planned) | `tests/integration/pos-idempotency.test.ts` (existing), future files TBD |

---

**Maintenance tips**

* Update this reference whenever route contracts change (e.g., once return items are implemented or when new payment methods are added).
* Keep examples in sync with integration tests so QA and documentation do not drift.
* Consider embedding sequence diagrams or cURL snippets for onboarding once flows stabilize.
