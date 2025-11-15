import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  numeric,
  pgEnum,
  text,
  jsonb,
  index,
  uniqueIndex
} from 'drizzle-orm/pg-core';

// Enums
export const roleEnum = pgEnum('role', ['ADMIN', 'MANAGER', 'CASHIER']);
export const saleStatusEnum = pgEnum('sale_status', ['COMPLETED', 'RETURNED']);
export const subscriptionProviderEnum = pgEnum('subscription_provider', ['PAYSTACK', 'FLW']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['ACTIVE', 'PAST_DUE', 'CANCELLED']);

// Core — Multi-tenancy
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull().default('NGN'),
  isActive: boolean('is_active').notNull().default(false),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  billingEmail: varchar('billing_email', { length: 255 }),
  loyaltyEarnRate: numeric('loyalty_earn_rate', { precision: 10, scale: 4 }).notNull().default('1.0000'),
  loyaltyRedeemValue: numeric('loyalty_redeem_value', { precision: 10, scale: 4 }).notNull().default('0.0100'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address'),
  currency: varchar('currency', { length: 3 }).default('NGN'),
  taxRate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull().default('0.0850'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgIdx: index('stores_org_idx').on(t.orgId),
}));

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id'),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  settings: jsonb('settings').default({}),
  isAdmin: boolean('is_admin').notNull().default(false),
  requires2fa: boolean('requires_2fa').notNull().default(false),
  totpSecret: varchar('totp_secret', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  emailVerified: boolean('email_verified').default(false),
  requiresPasswordChange: boolean('requires_password_change').default(false),
}, (t) => ({
  orgIdx: index('users_org_idx').on(t.orgId),
}));

export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull(),
  orgId: uuid('org_id').notNull(),
  storeId: uuid('store_id'),
  role: roleEnum('role').notNull(),
}, (t) => ({
  userIdx: index('user_roles_user_idx').on(t.userId),
  orgIdx: index('user_roles_org_idx').on(t.orgId),
  storeIdx: index('user_roles_store_idx').on(t.storeId),
  uniqueUserScope: uniqueIndex('user_roles_unique_scope').on(t.userId, t.storeId, t.role),
}));

export const ipWhitelist = pgTable('ip_whitelist', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  role: roleEnum('role').notNull(),
  cidrOrIp: varchar('cidr_or_ip', { length: 64 }).notNull(),
  label: varchar('label', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgIdx: index('ip_whitelist_org_idx').on(t.orgId),
}));

// Customers & Loyalty
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  phone: varchar('phone', { length: 32 }).notNull(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgPhoneUnique: uniqueIndex('customers_org_phone_unique').on(t.orgId, t.phone),
  orgIdx: index('customers_org_idx').on(t.orgId),
}));

export const loyaltyAccounts = pgTable('loyalty_accounts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  points: integer('points').notNull().default(0),
  tier: varchar('tier', { length: 64 }),
}, (t) => ({
  orgIdx: index('loyalty_accounts_org_idx').on(t.orgId),
  customerUnique: uniqueIndex('loyalty_accounts_customer_unique').on(t.customerId),
}));

export const loyaltyTransactions = pgTable('loyalty_transactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  loyaltyAccountId: uuid('loyalty_account_id').notNull(),
  points: integer('points').notNull(),
  reason: varchar('reason', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  accountIdx: index('loyalty_tx_account_idx').on(t.loyaltyAccountId),
}));

// Products & Inventory
export const products = pgTable('products', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  sku: varchar('sku', { length: 128 }).notNull(),
  barcode: varchar('barcode', { length: 128 }),
  name: varchar('name', { length: 255 }).notNull(),
  costPrice: numeric('cost_price', { precision: 12, scale: 2 }).notNull().default('0'),
  salePrice: numeric('sale_price', { precision: 12, scale: 2 }).notNull().default('0'),
  vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgIdx: index('products_org_idx').on(t.orgId),
  orgSkuUnique: uniqueIndex('products_org_sku_unique').on(t.orgId, t.sku),
}));

export const inventory = pgTable('inventory', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid('store_id').notNull(),
  productId: uuid('product_id').notNull(),
  quantity: integer('quantity').notNull().default(0),
  reorderLevel: integer('reorder_level').notNull().default(0),
}, (t) => ({
  storeIdx: index('inventory_store_idx').on(t.storeId),
  productIdx: index('inventory_product_idx').on(t.productId),
  uniquePerStoreProduct: uniqueIndex('inventory_store_product_unique').on(t.storeId, t.productId),
}));

// Sales
export const sales = pgTable('sales', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  storeId: uuid('store_id').notNull(),
  cashierId: uuid('cashier_id').notNull(),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
  discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0'),
  tax: numeric('tax', { precision: 12, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text('payment_method').notNull().default('manual'),
  paymentBreakdown: jsonb('payment_breakdown'),
  status: saleStatusEnum('status').notNull().default('COMPLETED'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
}, (t) => ({
  orgIdx: index('sales_org_idx').on(t.orgId),
  storeIdx: index('sales_store_idx').on(t.storeId),
  occurredIdx: index('sales_occurred_idx').on(t.occurredAt),
  idempotencyUnique: uniqueIndex('sales_idempotency_unique').on(t.idempotencyKey),
}));

export const saleItems = pgTable('sale_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  saleId: uuid('sale_id').notNull(),
  productId: uuid('product_id').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  lineDiscount: numeric('line_discount', { precision: 12, scale: 2 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
}, (t) => ({
  saleIdx: index('sale_items_sale_idx').on(t.saleId),
  productIdx: index('sale_items_product_idx').on(t.productId),
}));

export const returns = pgTable('returns', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  saleId: uuid('sale_id').notNull(),
  storeId: uuid('store_id').notNull(),
  reason: text('reason'),
  processedBy: uuid('processed_by').notNull(),
  refundType: varchar('refund_type', { length: 32 }).notNull().default('FULL'),
  totalRefund: numeric('total_refund', { precision: 12, scale: 2 }).notNull().default('0'),
  currency: varchar('currency', { length: 8 }).notNull().default('USD'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow(),
});

export const returnItems = pgTable('return_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  returnId: uuid('return_id').notNull().references(() => returns.id, { onDelete: 'cascade' }),
  saleItemId: uuid('sale_item_id').notNull().references(() => saleItems.id),
  productId: uuid('product_id').notNull(),
  quantity: integer('quantity').notNull(),
  restockAction: varchar('restock_action', { length: 16 }).notNull(),
  refundType: varchar('refund_type', { length: 16 }).notNull().default('NONE'),
  refundAmount: numeric('refund_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  currency: varchar('currency', { length: 8 }).notNull().default('USD'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  returnIdx: index('return_items_return_idx').on(t.returnId),
  saleItemIdx: index('return_items_sale_item_idx').on(t.saleItemId),
}));

export const priceChanges = pgTable('price_changes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  storeId: uuid('store_id'),
  productId: uuid('product_id'),
  oldPrice: numeric('old_price', { precision: 12, scale: 2 }).notNull(),
  newPrice: numeric('new_price', { precision: 12, scale: 2 }).notNull(),
  initiatedBy: uuid('initiated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgIdx: index('price_changes_org_idx').on(t.orgId),
}));

export const stockAlerts = pgTable('stock_alerts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid('store_id').notNull(),
  productId: uuid('product_id').notNull(),
  currentQty: integer('current_qty').notNull(),
  reorderLevel: integer('reorder_level').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  resolved: boolean('resolved').notNull().default(false),
}, (t) => ({
  storeIdx: index('stock_alerts_store_idx').on(t.storeId),
  productIdx: index('stock_alerts_product_idx').on(t.productId),
}));

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  userId: uuid('user_id'),
  provider: subscriptionProviderEnum('provider').notNull(),
  planCode: varchar('plan_code', { length: 128 }).notNull(),
  status: subscriptionStatusEnum('status').notNull(),
  externalCustomerId: varchar('external_customer_id', { length: 255 }),
  externalSubId: varchar('external_sub_id', { length: 255 }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  lastEventRaw: jsonb('last_event_raw'),
  autopayEnabled: boolean('autopay_enabled').notNull().default(false),
  autopayProvider: subscriptionProviderEnum('autopay_provider'),
  autopayReference: varchar('autopay_reference', { length: 255 }),
  autopayConfiguredAt: timestamp('autopay_configured_at', { withTimezone: true }),
  autopayLastStatus: varchar('autopay_last_status', { length: 32 }),
  trialStartDate: timestamp('trial_start_date', { withTimezone: true }),
  trialEndDate: timestamp('trial_end_date', { withTimezone: true }),
  nextBillingDate: timestamp('next_billing_date', { withTimezone: true }),
  trialReminder7SentAt: timestamp('trial_reminder_7_sent_at', { withTimezone: true }),
  trialReminder3SentAt: timestamp('trial_reminder_3_sent_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgIdx: index('subscriptions_org_idx').on(t.orgId),
  userIdx: index('subscriptions_user_idx').on(t.userId),
}));

export const subscriptionPayments = pgTable('subscription_payments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  provider: subscriptionProviderEnum('provider').notNull(),
  planCode: varchar('plan_code', { length: 128 }).notNull(),
  externalSubId: varchar('external_sub_id', { length: 255 }),
  externalInvoiceId: varchar('external_invoice_id', { length: 255 }),
  reference: varchar('reference', { length: 255 }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  eventType: varchar('event_type', { length: 64 }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow(),
  raw: jsonb('raw'),
}, (t) => ({
  orgIdx: index('subscription_payments_org_idx').on(t.orgId),
  uniqInvoice: uniqueIndex('subscription_payments_provider_invoice_unique').on(t.provider, t.externalInvoiceId),
  uniqReference: uniqueIndex('subscription_payments_provider_reference_unique').on(t.provider, t.reference),
}));

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  provider: subscriptionProviderEnum('provider').notNull(),
  eventId: varchar('event_id', { length: 255 }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqProviderEvent: uniqueIndex('webhook_events_provider_event_unique').on(t.provider, t.eventId),
}));

export const dunningEvents = pgTable('dunning_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  subscriptionId: uuid('subscription_id').notNull(),
  attempt: integer('attempt').notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  reason: text('reason'),
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
}, (t) => ({
  orgIdx: index('dunning_events_org_idx').on(t.orgId),
  subIdx: index('dunning_events_subscription_idx').on(t.subscriptionId),
  uniqAttempt: uniqueIndex('dunning_events_subscription_attempt_unique').on(t.subscriptionId, t.attempt),
}));

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  userId: uuid('user_id'),
  action: varchar('action', { length: 64 }).notNull(),
  entity: varchar('entity', { length: 64 }).notNull(),
  entityId: uuid('entity_id'),
  meta: jsonb('meta'),
  ip: varchar('ip', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgIdx: index('audit_logs_org_idx').on(t.orgId),
  createdIdx: index('audit_logs_created_idx').on(t.createdAt),
}));
export const scheduledReports = pgTable('scheduled_reports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  userId: uuid('user_id').notNull(),
  storeId: uuid('store_id'),
  reportType: varchar('report_type', { length: 64 }).notNull(),
  format: varchar('format', { length: 16 }).notNull(),
  interval: varchar('interval', { length: 16 }).notNull(),
  params: jsonb('params'),
  isActive: boolean('is_active').notNull().default(false),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgIdx: index('scheduled_reports_org_idx').on(t.orgId),
  userIdx: index('scheduled_reports_user_idx').on(t.userId),
}));

// Relations (minimal for Drizzle inference and joins)
export const orgRelations = relations(organizations, ({ many }) => ({
  stores: many(stores),
  users: many(users),
  products: many(products),
  sales: many(sales),
  subscriptions: many(subscriptions),
  auditLogs: many(auditLogs),
}));

export const storeRelations = relations(stores, ({ many, one }) => ({
  org: one(organizations, { fields: [stores.orgId], references: [organizations.id] }),
  inventory: many(inventory),
  sales: many(sales),
}));


