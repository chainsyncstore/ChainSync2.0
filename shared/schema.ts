import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  decimal,
  integer,
  timestamp,
  boolean,
  uuid,
  pgEnum,
  index,
  jsonb,
  uniqueIndex,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums (align with production)
export const roleEnum = pgEnum("role", ["ADMIN", "MANAGER", "CASHIER"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "completed", "voided", "held"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card", "digital"]);
export const transactionKindEnum = pgEnum("transaction_kind", ["SALE", "REFUND", "ADJUSTMENT", "SWAP_CHARGE", "SWAP_REFUND"]);
export const saleStatusEnum = pgEnum("sale_status", ["COMPLETED", "RETURNED"]);

// Subscription Enums
export const subscriptionStatusEnum = pgEnum("subscription_status", ["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED", "SUSPENDED"]);
export const subscriptionProviderEnum = pgEnum("subscription_provider", ["PAYSTACK", "FLW"]);

// Promotion Enums
export const promotionTypeEnum = pgEnum("promotion_type", ["percentage", "bundle"]);
export const promotionScopeEnum = pgEnum("promotion_scope", ["all_products", "category", "specific_products"]);
export const promotionStatusEnum = pgEnum("promotion_status", ["draft", "scheduled", "active", "expired", "cancelled"]);

// Core organizations table for multi-tenancy
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("NGN"),
  isActive: boolean("is_active").notNull().default(false),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  billingEmail: varchar("billing_email", { length: 255 }),
  ipWhitelistEnforced: boolean("ip_whitelist_enforced").notNull().default(false),
  loyaltyEarnRate: decimal("loyalty_earn_rate", { precision: 10, scale: 4 }).notNull().default("1.0000"),
  loyaltyRedeemValue: decimal("loyalty_redeem_value", { precision: 10, scale: 4 }).notNull().default("0.0100"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Users table (align with production migrations)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
  subscriptionId: uuid("subscription_id"),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  settings: jsonb("settings").default({}),
  isAdmin: boolean("is_admin").notNull().default(false),
  requires2fa: boolean("requires_2fa").notNull().default(false),
  totpSecret: varchar("totp_secret", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  emailVerified: boolean("email_verified").default(false),
  // Optional/compat fields used across app (client + server). Kept nullable to avoid strict migrations.
  username: varchar("username", { length: 255 }),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  companyName: varchar("company_name", { length: 255 }),
  location: varchar("location", { length: 64 }),
  role: varchar("role", { length: 32 }),
  storeId: uuid("store_id"),
  signupCompleted: boolean("signup_completed"),
  signupAttempts: integer("signup_attempts"),
  signupStartedAt: timestamp("signup_started_at", { withTimezone: true }),
  signupCompletedAt: timestamp("signup_completed_at", { withTimezone: true }),
  isActive: boolean("is_active"),
  phoneVerified: boolean("phone_verified"),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  failedLoginAttempts: integer("failed_login_attempts"),
  // Some legacy/test code reads user.password directly; keep optional mirror for compatibility
  password: varchar("password", { length: 255 }),
  requiresPasswordChange: boolean("requires_password_change").default(false),
}, (table) => ({
  orgIdx: index("users_org_idx").on(table.orgId),
  usernameUnique: uniqueIndex("users_username_unique").on(table.username),
  storeIdx: index("users_store_idx").on(table.storeId),
}));

// Subscriptions table (billing for organizations)
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id"),
  tier: varchar("tier", { length: 50 }).notNull(),
  planCode: varchar("plan_code", { length: 128 }).notNull(),
  provider: subscriptionProviderEnum("provider").notNull().default("PAYSTACK"),
  status: subscriptionStatusEnum("status").notNull().default("TRIAL"),
  upfrontFeePaid: decimal("upfront_fee_paid", { precision: 10, scale: 2 }).notNull(),
  upfrontFeeCurrency: varchar("upfront_fee_currency", { length: 3 }).notNull(),
  monthlyAmount: decimal("monthly_amount", { precision: 10, scale: 2 }).notNull(),
  monthlyCurrency: varchar("monthly_currency", { length: 3 }).notNull(),
  trialStartDate: timestamp("trial_start_date").notNull().defaultNow(),
  trialEndDate: timestamp("trial_end_date").notNull(),
  nextBillingDate: timestamp("next_billing_date"),
  upfrontFeeCredited: boolean("upfront_fee_credited").notNull().default(false),
  autopayEnabled: boolean("autopay_enabled").notNull().default(false),
  autopayProvider: subscriptionProviderEnum("autopay_provider"),
  autopayReference: varchar("autopay_reference", { length: 255 }),
  autopayConfiguredAt: timestamp("autopay_configured_at", { withTimezone: true }),
  autopayLastStatus: varchar("autopay_last_status", { length: 32 }),
  trialReminder7SentAt: timestamp("trial_reminder_7_sent_at", { withTimezone: true }),
  trialReminder3SentAt: timestamp("trial_reminder_3_sent_at", { withTimezone: true }),
  externalCustomerId: varchar("external_customer_id", { length: 255 }),
  externalSubId: varchar("external_sub_id", { length: 255 }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  lastEventRaw: jsonb("last_event_raw"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orgIdx: index("subscriptions_org_idx").on(table.orgId),
  userIdIdx: index("subscriptions_user_id_idx").on(table.userId),
  statusIdx: index("subscriptions_status_idx").on(table.status),
  trialEndDateIdx: index("subscriptions_trial_end_date_idx").on(table.trialEndDate),
}));

// User roles table (align with production migrations)
export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  storeId: uuid('store_id'),
  role: roleEnum('role').notNull(),
}, (t) => ({
  userIdx: index('user_roles_user_idx').on(t.userId),
  orgIdx: index('user_roles_org_idx').on(t.orgId),
  storeIdx: index('user_roles_store_idx').on(t.storeId),
  uniqueUserScope: uniqueIndex('user_roles_unique_scope').on(t.userId, t.storeId, t.role),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  store: one(stores, {
    fields: [userRoles.storeId],
    references: [stores.id],
  }),
}));

// Stores table
export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  ownerId: uuid("owner_id"),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  currency: varchar("currency", { length: 3 }).default('USD'),
  taxRate: decimal("tax_rate", { precision: 5, scale: 4 }).default("0.085"),
  taxIncluded: boolean("tax_included").notNull().default(false),
  loyaltyEarnRateOverride: decimal("loyalty_earn_rate_override", { precision: 10, scale: 4 }),
  loyaltyRedeemValueOverride: decimal("loyalty_redeem_value_override", { precision: 10, scale: 4 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Products table
export const products = pgTable("products", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id"),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 255 }).unique(),
  barcode: varchar("barcode", { length: 255 }).unique(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  costPrice: varchar("cost_price", { length: 255 }),
  salePrice: varchar("sale_price", { length: 255 }),
  vatRate: varchar("vat_rate", { length: 64 }),
  category: varchar("category", { length: 255 }),
  brand: varchar("brand", { length: 255 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  nameIdx: index("products_name_idx").on(table.name),
  categoryIdx: index("products_category_idx").on(table.category),
  brandIdx: index("products_brand_idx").on(table.brand),
  isActiveIdx: index("products_is_active_idx").on(table.isActive),
  createdAtIdx: index("products_created_at_idx").on(table.createdAt),
}));

// Inventory table
export const inventory = pgTable("inventory", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: uuid("product_id").notNull(),
  storeId: uuid("store_id").notNull(),
  quantity: integer("quantity").notNull().default(0),
  reorderLevel: integer("reorder_level"),
  minStockLevel: integer("min_stock_level").default(10),
  maxStockLevel: integer("max_stock_level").default(100),
  lastRestocked: timestamp("last_restocked"),
  avgCost: decimal("avg_cost", { precision: 12, scale: 4 }).notNull().default("0"),
  totalCostValue: decimal("total_cost_value", { precision: 14, scale: 4 }).notNull().default("0"),
  lastCostUpdate: timestamp("last_cost_update", { withTimezone: true }),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("inventory_store_id_idx").on(table.storeId),
  productIdIdx: index("inventory_product_id_idx").on(table.productId),
  storeProductUnique: uniqueIndex("inventory_store_product_unique").on(table.storeId, table.productId),
}));

export const inventoryCostLayers = pgTable("inventory_cost_layers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantityRemaining: integer("quantity_remaining").notNull(),
  unitCost: decimal("unit_cost", { precision: 12, scale: 4 }).notNull(),
  source: varchar("source", { length: 64 }),
  referenceId: uuid("reference_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  storeProductIdx: index("inventory_cost_layers_store_product_idx").on(table.storeId, table.productId, table.createdAt),
}));

export const priceChangeEvents = pgTable("price_change_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
  source: varchar("source", { length: 64 }),
  referenceId: uuid("reference_id"),
  oldCost: decimal("old_cost", { precision: 12, scale: 4 }),
  newCost: decimal("new_cost", { precision: 12, scale: 4 }),
  oldSalePrice: decimal("old_sale_price", { precision: 12, scale: 4 }),
  newSalePrice: decimal("new_sale_price", { precision: 12, scale: 4 }),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  storeProductIdx: index("price_change_events_store_product_idx").on(table.storeId, table.productId, table.occurredAt),
}));

export const inventoryRevaluationEvents = pgTable("inventory_revaluation_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  source: varchar("source", { length: 64 }),
  referenceId: uuid("reference_id"),
  quantityBefore: integer("quantity_before").notNull(),
  quantityAfter: integer("quantity_after").notNull(),
  revaluedQuantity: integer("revalued_quantity"),
  avgCostBefore: decimal("avg_cost_before", { precision: 12, scale: 4 }),
  avgCostAfter: decimal("avg_cost_after", { precision: 12, scale: 4 }),
  totalCostBefore: decimal("total_cost_before", { precision: 14, scale: 4 }),
  totalCostAfter: decimal("total_cost_after", { precision: 14, scale: 4 }),
  deltaValue: decimal("delta_value", { precision: 14, scale: 4 }),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  storeProductIdx: index("inventory_revaluation_events_store_product_idx").on(table.storeId, table.productId, table.occurredAt),
}));

export const importJobs = pgTable("import_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  orgId: uuid("org_id"),
  storeId: uuid("store_id"),
  type: varchar("type", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("processing"),
  fileName: varchar("file_name", { length: 255 }),
  mode: varchar("mode", { length: 32 }),
  cutoffDate: timestamp("cutoff_date", { withTimezone: true }),
  totalRows: integer("total_rows").notNull().default(0),
  processedRows: integer("processed_rows").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  invalidCount: integer("invalid_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  details: jsonb("details"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// Transactions table
export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull(),
  cashierId: uuid("cashier_id").notNull(),
  status: transactionStatusEnum("status").default("pending"),
  kind: transactionKindEnum("kind").notNull().default("SALE"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  amountReceived: decimal("amount_received", { precision: 10, scale: 2 }),
  changeDue: decimal("change_due", { precision: 10, scale: 2 }),
  receiptNumber: varchar("receipt_number", { length: 255 }).unique(),
  originTransactionId: uuid("origin_transaction_id"),
  source: varchar("source", { length: 64 }).notNull().default("pos"),
  importBatchId: uuid("import_batch_id"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  storeIdIdx: index("transactions_store_id_idx").on(table.storeId),
  cashierIdIdx: index("transactions_cashier_id_idx").on(table.cashierId),
  createdAtIdx: index("transactions_created_at_idx").on(table.createdAt),
}));

// Promotions tables
export const promotions = pgTable("promotions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  promotionType: promotionTypeEnum("promotion_type").notNull(),
  scope: promotionScopeEnum("scope").notNull(),
  categoryFilter: varchar("category_filter", { length: 255 }),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
  bundleBuyQuantity: integer("bundle_buy_quantity"),
  bundleGetQuantity: integer("bundle_get_quantity"),
  perProductPricing: boolean("per_product_pricing").notNull().default(false),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: promotionStatusEnum("status").notNull().default("draft"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index("promotions_org_idx").on(table.orgId, table.status),
  storeIdx: index("promotions_store_idx").on(table.storeId, table.status),
  dateIdx: index("promotions_date_idx").on(table.startsAt, table.endsAt),
}));

export const promotionProducts = pgTable("promotion_products", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  promotionId: uuid("promotion_id").notNull().references(() => promotions.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  customDiscountPercent: decimal("custom_discount_percent", { precision: 5, scale: 2 }),
}, (table) => ({
  promotionIdx: index("promotion_products_promotion_idx").on(table.promotionId),
  productIdx: index("promotion_products_product_idx").on(table.productId),
  uniqueProductPromo: uniqueIndex("promotion_products_unique").on(table.promotionId, table.productId),
}));

// Promotion relations
export const promotionsRelations = relations(promotions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [promotions.orgId],
    references: [organizations.id],
  }),
  store: one(stores, {
    fields: [promotions.storeId],
    references: [stores.id],
  }),
  createdByUser: one(users, {
    fields: [promotions.createdBy],
    references: [users.id],
  }),
  products: many(promotionProducts),
}));

export const promotionProductsRelations = relations(promotionProducts, ({ one }) => ({
  promotion: one(promotions, {
    fields: [promotionProducts.promotionId],
    references: [promotions.id],
  }),
  product: one(products, {
    fields: [promotionProducts.productId],
    references: [products.id],
  }),
}));

// Promotion Types
export type Promotion = typeof promotions.$inferSelect;
export type InsertPromotion = typeof promotions.$inferInsert;
export type PromotionProduct = typeof promotionProducts.$inferSelect;
export type InsertPromotionProduct = typeof promotionProducts.$inferInsert;

// Transaction Items table
export const transactionItems = pgTable("transaction_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionId: uuid("transaction_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 12, scale: 4 }).notNull().default("0"),
  totalCost: decimal("total_cost", { precision: 14, scale: 4 }).notNull().default("0"),
  // Promotion Tracking
  promotionId: uuid("promotion_id").references(() => promotions.id, { onDelete: "set null" }),
  promotionDiscount: decimal("promotion_discount", { precision: 12, scale: 2 }).default("0"),
  originalUnitPrice: decimal("original_unit_price", { precision: 12, scale: 2 }),
  isFreeItem: boolean("is_free_item").default(false),
}, (table) => ({
  transactionIdIdx: index("transaction_items_transaction_id_idx").on(table.transactionId),
  productIdIdx: index("transaction_items_product_id_idx").on(table.productId),
  promotionIdx: index("transaction_items_promotion_idx").on(table.promotionId),
}));

// Legacy POS sales tables (production-aligned)
export const legacySales = pgTable("sales", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  storeId: uuid("store_id").notNull(),
  cashierId: uuid("cashier_id").notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  status: saleStatusEnum("status").notNull().default("COMPLETED"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
  walletReference: varchar("wallet_reference", { length: 255 }),
  paymentBreakdown: jsonb("payment_breakdown"),
});

export const legacySaleItems = pgTable("sale_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  saleId: uuid("sale_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineDiscount: decimal("line_discount", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
});

export const legacyReturns = pgTable("returns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  saleId: uuid("sale_id").notNull(),
  storeId: uuid("store_id").notNull(),
  reason: text("reason"),
  processedBy: uuid("processed_by").notNull(),
  refundType: varchar("refund_type", { length: 16 }).notNull(),
  totalRefund: decimal("total_refund", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 255 }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  idempotencyKeyUnique: uniqueIndex("returns_idempotency_unique").on(table.idempotencyKey),
}));

export const legacyReturnItems = pgTable("return_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  returnId: uuid("return_id").notNull(),
  saleItemId: uuid("sale_item_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  restockAction: varchar("restock_action", { length: 16 }).notNull(),
  refundType: varchar("refund_type", { length: 16 }).notNull(),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  notes: text("notes"),
});

// Legacy loyalty tables (org-scoped)
export const legacyCustomers = pgTable("customers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  phone: varchar("phone", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const loyaltyAccounts = pgTable("loyalty_accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  points: integer("points").notNull().default(0),
  tier: varchar("tier", { length: 255 }),
});

export const legacyLoyaltyTransactions = pgTable("loyalty_transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loyaltyAccountId: uuid("loyalty_account_id").notNull(),
  points: integer("points").notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Realtime notifications table for websocket broadcasting
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id"),
  userId: uuid("user_id"),
  type: varchar("type", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  data: jsonb("data"),
  priority: varchar("priority", { length: 16 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const storePerformanceAlerts = pgTable("store_performance_alerts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  snapshotDate: date("snapshot_date").notNull(),
  timeframe: varchar("timeframe", { length: 32 }).notNull().default("daily"),
  comparisonWindow: varchar("comparison_window", { length: 64 }).notNull().default("previous_7_days"),
  grossRevenue: decimal("gross_revenue", { precision: 14, scale: 2 }).notNull().default("0"),
  netRevenue: decimal("net_revenue", { precision: 14, scale: 2 }).notNull().default("0"),
  transactionsCount: integer("transactions_count").notNull().default(0),
  averageOrderValue: decimal("average_order_value", { precision: 14, scale: 2 }).notNull().default("0"),
  baselineRevenue: decimal("baseline_revenue", { precision: 14, scale: 2 }),
  baselineTransactions: decimal("baseline_transactions", { precision: 14, scale: 2 }),
  revenueDeltaPct: decimal("revenue_delta_pct", { precision: 6, scale: 2 }),
  transactionsDeltaPct: decimal("transactions_delta_pct", { precision: 6, scale: 2 }),
  refundRatio: decimal("refund_ratio", { precision: 6, scale: 2 }),
  topProduct: jsonb("top_product"),
  severity: varchar("severity", { length: 16 }).notNull().default("low"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  storeSnapshotUnique: uniqueIndex("store_performance_alerts_unique").on(table.storeId, table.snapshotDate, table.timeframe),
  orgSnapshotIdx: index("store_performance_alerts_org_idx").on(table.orgId, table.snapshotDate),
  storeIdx: index("store_performance_alerts_store_idx").on(table.storeId, table.snapshotDate),
  severityIdx: index("store_performance_alerts_severity_idx").on(table.severity),
}));

export const profileUpdateOtps = pgTable("profile_update_otps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  code: varchar("code", { length: 10 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userExpiryIdx: index("profile_update_otps_user_idx").on(table.userId, table.expiresAt),
}));

// Active websocket connections for tracking
export const websocketConnections = pgTable("websocket_connections", {
  connectionId: varchar("connection_id", { length: 255 }).primaryKey(),
  userId: uuid("user_id").notNull(),
  storeId: uuid("store_id").notNull(),
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address", { length: 45 }),
  isActive: boolean("is_active").default(true),
  connectedAt: timestamp("connected_at").defaultNow(),
  lastActivity: timestamp("last_activity").defaultNow(),
  disconnectedAt: timestamp("disconnected_at"),
});

// Offline sync queue table for background synchronization
export const syncQueue = pgTable("sync_queue", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull(),
  userId: uuid("user_id").notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: uuid("entity_id"),
  action: varchar("action", { length: 50 }).notNull(),
  data: jsonb("data"),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  retryCount: integer("retry_count").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  syncedAt: timestamp("synced_at"),
});

// Low Stock Alerts table
export const lowStockAlerts = pgTable("low_stock_alerts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull(),
  productId: uuid("product_id").notNull(),
  currentStock: integer("current_stock").notNull(),
  minStockLevel: integer("min_stock_level").notNull(),
  isResolved: boolean("is_resolved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => ({
  storeIdIdx: index("low_stock_alerts_store_id_idx").on(table.storeId),
  productIdIdx: index("low_stock_alerts_product_id_idx").on(table.productId),
}));

export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantityBefore: integer("quantity_before").notNull().default(0),
  quantityAfter: integer("quantity_after").notNull().default(0),
  delta: integer("delta").notNull(),
  actionType: varchar("action_type", { length: 32 }).notNull(),
  source: varchar("source", { length: 64 }),
  referenceId: uuid("reference_id"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  storeOccurredIdx: index("stock_movements_store_occurred_idx").on(table.storeId, table.occurredAt),
  productStoreIdx: index("stock_movements_product_store_idx").on(table.productId, table.storeId),
}));

// User-Store permissions table (many-to-many relationship for managers)
export const userStorePermissions = pgTable("user_store_permissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  storeId: uuid("store_id").notNull(),
  grantedBy: uuid("granted_by"), // ID of admin/manager who granted permission
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("user_store_permissions_user_id_idx").on(table.userId),
  storeIdIdx: index("user_store_permissions_store_id_idx").on(table.storeId),
}));

// Loyalty Program Tables
export const loyaltyTiers = pgTable("loyalty_tiers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  pointsRequired: integer("points_required").notNull().default(0),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }).default("0.00"),
  color: varchar("color", { length: 50 }).default("#6B7280"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("loyalty_tiers_store_id_idx").on(table.storeId),
}));

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  loyaltyNumber: varchar("loyalty_number", { length: 255 }).unique(),
  currentPoints: integer("current_points").notNull().default(0),
  lifetimePoints: integer("lifetime_points").notNull().default(0),
  tierId: uuid("tier_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("customers_store_id_idx").on(table.storeId),
}));

export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: uuid("customer_id").notNull(),
  transactionId: uuid("transaction_id").notNull(),
  pointsEarned: integer("points_earned").notNull().default(0),
  pointsRedeemed: integer("points_redeemed").notNull().default(0),
  pointsBefore: integer("points_before").notNull(),
  pointsAfter: integer("points_after").notNull(),
  tierBefore: uuid("tier_before"),
  tierAfter: uuid("tier_after"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  customerIdIdx: index("loyalty_transactions_customer_id_idx").on(table.customerId),
  transactionIdIdx: index("loyalty_transactions_transaction_id_idx").on(table.transactionId),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  roles: many(userRoles),
  transactions: many(transactions),
}));

export const storesRelations = relations(stores, ({ many }) => ({
  roles: many(userRoles),
  inventory: many(inventory),
  transactions: many(transactions),
  lowStockAlerts: many(lowStockAlerts),
  stockMovements: many(stockMovements),
}));

export const productsRelations = relations(products, ({ many }) => ({
  inventory: many(inventory),
  transactionItems: many(transactionItems),
  lowStockAlerts: many(lowStockAlerts),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
  product: one(products, {
    fields: [inventory.productId],
    references: [products.id],
  }),
  store: one(stores, {
    fields: [inventory.storeId],
    references: [stores.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  store: one(stores, {
    fields: [transactions.storeId],
    references: [stores.id],
  }),
  cashier: one(users, {
    fields: [transactions.cashierId],
    references: [users.id],
  }),
  items: many(transactionItems),
}));

export const transactionItemsRelations = relations(transactionItems, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionItems.transactionId],
    references: [transactions.id],
  }),
  product: one(products, {
    fields: [transactionItems.productId],
    references: [products.id],
  }),
  promotion: one(promotions, {
    fields: [transactionItems.promotionId],
    references: [promotions.id],
  }),
}));

export const lowStockAlertsRelations = relations(lowStockAlerts, ({ one }) => ({
  store: one(stores, {
    fields: [lowStockAlerts.storeId],
    references: [stores.id],
  }),
  product: one(products, {
    fields: [lowStockAlerts.productId],
    references: [products.id],
  }),
}));

// Enhanced validation schemas with comprehensive rules
export const enhancedUserSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be less than 50 characters")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, underscores, hyphens, and periods"),
  email: z.string()
    .email("Invalid email format")
    .max(255, "Email must be less than 255 characters"),
  firstName: z.string()
    .min(1, "First name is required")
    .max(100, "First name must be less than 100 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters, spaces, hyphens, and apostrophes"),
  lastName: z.string()
    .min(1, "Last name is required")
    .max(100, "Last name must be less than 100 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters, spaces, hyphens, and apostrophes"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be less than 128 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/\d/, "Password must contain at least one number")
    .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character"),
  phone: z.string()
    .min(7, "Phone number must be at least 7 digits")
    .max(20, "Phone number must be less than 20 characters")
    .regex(/^\+?[1-9]\d{6,15}$/, "Invalid phone number format"),
  companyName: z.string()
    .min(1, "Company name is required")
    .max(255, "Company name must be less than 255 characters"),
  tier: z.enum(["basic", "pro", "enterprise"], {
    errorMap: () => ({ message: "Invalid tier selection" })
  }),
  location: z.enum(["nigeria", "international"], {
    errorMap: () => ({ message: "Invalid location selection" })
  }),
  role: z.enum(["cashier", "manager", "admin"], {
    errorMap: () => ({ message: "Invalid role selection" })
  }).default("cashier"),
  storeId: z.string().uuid("Invalid store ID").optional(),
  isActive: z.boolean().default(true),
  signupCompleted: z.boolean().default(false),
  signupStartedAt: z.date().optional(),
  signupCompletedAt: z.date().optional(),
  signupAttempts: z.number().int().min(0).default(0),
});

export const enhancedProductSchema = z.object({
  name: z.string()
    .min(1, "Product name is required")
    .max(255, "Product name must be less than 255 characters")
    .regex(/^[a-zA-Z0-9\s\-_&.,()]+$/, "Product name contains invalid characters"),
  sku: z.string()
    .max(255, "SKU must be less than 255 characters")
    .regex(/^[A-Z0-9\-_]+$/, "SKU can only contain uppercase letters, numbers, hyphens, and underscores")
    .optional(),
  barcode: z.string()
    .max(255, "Barcode must be less than 255 characters")
    .regex(/^[0-9]+$/, "Barcode must contain only numbers")
    .optional(),
  description: z.string()
    .max(1000, "Description must be less than 1000 characters")
    .optional(),
  price: z.string()
    .min(1, "Price is required")
    .regex(/^\d+(\.\d{1,2})?$/, "Invalid price format - use numbers only (e.g., 10.99)")
    .refine((val) => parseFloat(val) > 0, "Price must be greater than 0")
    .refine((val) => parseFloat(val) <= 999999.99, "Price cannot exceed 999,999.99"),
  cost: z.string()
    .regex(/^\d+(\.\d{1,2})?$/, "Invalid cost format - use numbers only (e.g., 5.50)")
    .refine((val) => !val || parseFloat(val) >= 0, "Cost cannot be negative")
    .refine((val) => !val || parseFloat(val) <= 999999.99, "Cost cannot exceed 999,999.99")
    .optional(),
  category: z.string()
    .min(1, "Category is required")
    .max(255, "Category must be less than 255 characters"),
  brand: z.string()
    .max(255, "Brand must be less than 255 characters")
    .optional(),
  isActive: z.boolean().default(true),
  weight: z.string()
    .regex(/^\d+(\.\d{1,2})?$/, "Invalid weight format - use numbers only")
    .refine((val) => !val || parseFloat(val) >= 0, "Weight cannot be negative")
    .refine((val) => !val || parseFloat(val) <= 999999.99, "Weight cannot exceed 999,999.99")
    .optional(),
  dimensions: z.string()
    .max(100, "Dimensions must be less than 100 characters")
    .regex(/^[0-9xX\s]+$/, "Dimensions can only contain numbers, 'x', and spaces")
    .optional(),
  tags: z.string()
    .max(500, "Tags must be less than 500 characters")
    .optional(),
});

export const enhancedCustomerSchema = z.object({
  storeId: z.string().uuid("Invalid store ID"),
  firstName: z.string()
    .min(1, "First name is required")
    .max(100, "First name must be less than 100 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters, spaces, hyphens, and apostrophes"),
  lastName: z.string()
    .min(1, "Last name is required")
    .max(100, "Last name must be less than 100 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters, spaces, hyphens, and apostrophes"),
  email: z.string()
    .email("Invalid email format")
    .max(255, "Email must be less than 255 characters")
    .optional(),
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(20, "Phone number must be less than 20 characters")
    .regex(/^\+?[1-9]\d{0,15}$/, "Invalid phone number format")
    .optional(),
  loyaltyNumber: z.string()
    .max(255, "Loyalty number must be less than 255 characters")
    .regex(/^[A-Z0-9\-_]+$/, "Loyalty number can only contain uppercase letters, numbers, hyphens, and underscores")
    .optional(),
  currentPoints: z.number()
    .int("Points must be a whole number")
    .min(0, "Points cannot be negative")
    .max(999999999, "Points cannot exceed 999,999,999")
    .default(0),
  lifetimePoints: z.number()
    .int("Lifetime points must be a whole number")
    .min(0, "Lifetime points cannot be negative")
    .max(999999999, "Lifetime points cannot exceed 999,999,999")
    .default(0),
  tierId: z.string().uuid("Invalid tier ID").optional(),
  isActive: z.boolean().default(true),
});

export const enhancedInventorySchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
  storeId: z.string().uuid("Invalid store ID"),
  quantity: z.number()
    .int("Quantity must be a whole number")
    .min(0, "Quantity cannot be negative")
    .max(999999999, "Quantity cannot exceed 999,999,999"),
  minStockLevel: z.number()
    .int("Minimum stock level must be a whole number")
    .min(0, "Minimum stock level cannot be negative")
    .max(999999999, "Minimum stock level cannot exceed 999,999,999")
    .default(10),
  maxStockLevel: z.number()
    .int("Maximum stock level must be a whole number")
    .min(1, "Maximum stock level must be at least 1")
    .max(999999999, "Maximum stock level cannot exceed 999,999,999")
    .default(100),
});

export const enhancedStockAdjustmentSchema = z.object({
  adjustmentType: z.enum(["add", "remove", "set"], {
    errorMap: () => ({ message: "Invalid adjustment type" })
  }),
  quantity: z.number()
    .positive("Quantity must be greater than 0")
    .max(999999999, "Quantity cannot exceed 999,999,999"),
  reason: z.string()
    .min(1, "Reason is required")
    .max(255, "Reason must be less than 255 characters"),
  notes: z.string()
    .max(1000, "Notes must be less than 1000 characters")
    .optional(),
  cost: z.number()
    .min(0, "Cost cannot be negative")
    .max(999999.99, "Cost cannot exceed 999,999.99")
    .optional(),
});

export const enhancedLoyaltyTierSchema = z.object({
  storeId: z.string().uuid("Invalid store ID"),
  name: z.string()
    .min(1, "Tier name is required")
    .max(100, "Tier name must be less than 100 characters")
    .regex(/^[a-zA-Z0-9\s\-_]+$/, "Tier name can only contain letters, numbers, spaces, hyphens, and underscores"),
  description: z.string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  pointsRequired: z.number()
    .int("Points required must be a whole number")
    .min(0, "Points required cannot be negative")
    .max(999999999, "Points required cannot exceed 999,999,999"),
  discountPercentage: z.number()
    .min(0, "Discount percentage cannot be negative")
    .max(100, "Discount percentage cannot exceed 100%"),
  color: z.string()
    .regex(/^#[0-9A-F]{6}$/i, "Color must be a valid hex color (e.g., #FF0000)")
    .default("#6B7280"),
});

export const enhancedTransactionSchema = z.object({
  storeId: z.string().uuid("Invalid store ID"),
  customerId: z.string().uuid("Invalid customer ID").optional(),
  total: z.number()
    .positive("Total must be greater than 0")
    .max(999999.99, "Total cannot exceed 999,999.99"),
  tax: z.number()
    .min(0, "Tax cannot be negative")
    .max(999999.99, "Tax cannot exceed 999,999.99"),
  discount: z.number()
    .min(0, "Discount cannot be negative")
    .max(999999.99, "Discount cannot exceed 999,999.99")
    .default(0),
  paymentMethod: z.enum(["cash", "card", "digital"], {
    errorMap: () => ({ message: "Invalid payment method" })
  }),
  status: z.enum(["pending", "completed", "voided", "held"], {
    errorMap: () => ({ message: "Invalid transaction status" })
  }).default("pending"),
  notes: z.string()
    .max(1000, "Notes must be less than 1000 characters")
    .optional(),
});

export const enhancedTransactionItemSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID"),
  productId: z.string().uuid("Invalid product ID"),
  quantity: z.number()
    .positive("Quantity must be greater than 0")
    .max(999999, "Quantity cannot exceed 999,999"),
  unitPrice: z.number()
    .positive("Unit price must be greater than 0")
    .max(999999.99, "Unit price cannot exceed 999,999.99"),
  total: z.number()
    .positive("Total must be greater than 0")
    .max(999999.99, "Total cannot exceed 999,999.99"),
});

// Enhanced insert schemas with validation
export const insertUserSchema = createInsertSchema(users);

export const insertStoreSchema = createInsertSchema(stores);

export const insertProductSchema = createInsertSchema(products);

export const insertInventorySchema = createInsertSchema(inventory);

export const insertOrganizationSchema = createInsertSchema(organizations);

export const insertTransactionSchema = createInsertSchema(transactions);

export const insertTransactionItemSchema = createInsertSchema(transactionItems);

export const insertLowStockAlertSchema = createInsertSchema(lowStockAlerts);
export const insertStockMovementSchema = createInsertSchema(stockMovements);

// Loyalty Program Insert Schemas
export const insertLoyaltyTierSchema = createInsertSchema(loyaltyTiers);

export const insertCustomerSchema = createInsertSchema(customers);

export const insertLoyaltyTransactionSchema = createInsertSchema(loyaltyTransactions);

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Store = typeof stores.$inferSelect;
export type InsertStore = z.infer<typeof insertStoreSchema>;

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

export type Inventory = typeof inventory.$inferSelect;
export type InsertInventory = typeof inventory.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

export type TransactionItem = typeof transactionItems.$inferSelect;
export type InsertTransactionItem = typeof transactionItems.$inferInsert;

export type PriceChangeEvent = typeof priceChangeEvents.$inferSelect;
export type InventoryRevaluationEvent = typeof inventoryRevaluationEvents.$inferSelect;
export type InsertPriceChangeEvent = typeof priceChangeEvents.$inferInsert;
export type InsertInventoryRevaluationEvent = typeof inventoryRevaluationEvents.$inferInsert;

// Notification types
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

export type WebsocketConnection = typeof websocketConnections.$inferSelect;
export type InsertWebsocketConnection = typeof websocketConnections.$inferInsert;

export type LowStockAlert = typeof lowStockAlerts.$inferSelect;
export type InsertLowStockAlert = z.infer<typeof insertLowStockAlertSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;

// Loyalty Program Types
export type LoyaltyTier = typeof loyaltyTiers.$inferSelect;
export type InsertLoyaltyTier = z.infer<typeof insertLoyaltyTierSchema>;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;
export type InsertLoyaltyTransaction = z.infer<typeof insertLoyaltyTransactionSchema>;

export type UserStorePermission = typeof userStorePermissions.$inferSelect;
export type InsertUserStorePermission = typeof userStorePermissions.$inferInsert;

// Loyalty Program Relations
export const loyaltyTiersRelations = relations(loyaltyTiers, ({ one, many }) => ({
  store: one(stores, {
    fields: [loyaltyTiers.storeId],
    references: [stores.id],
  }),
  customers: many(customers),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  store: one(stores, {
    fields: [customers.storeId],
    references: [stores.id],
  }),
  tier: one(loyaltyTiers, {
    fields: [customers.tierId],
    references: [loyaltyTiers.id],
  }),
  loyaltyTransactions: many(loyaltyTransactions),
}));

export const loyaltyTransactionsRelations = relations(loyaltyTransactions, ({ one }) => ({
  customer: one(customers, {
    fields: [loyaltyTransactions.customerId],
    references: [customers.id],
  }),
  transaction: one(transactions, {
    fields: [loyaltyTransactions.transactionId],
    references: [transactions.id],
  }),
  tierBefore: one(loyaltyTiers, {
    fields: [loyaltyTransactions.tierBefore],
    references: [loyaltyTiers.id],
  }),
  tierAfter: one(loyaltyTiers, {
    fields: [loyaltyTransactions.tierAfter],
    references: [loyaltyTiers.id],
  }),
}));

export const ipWhitelists = pgTable("ip_whitelists", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(), // IPv6 can be up to 45 chars
  description: varchar("description", { length: 255 }),
  whitelistedBy: uuid("whitelisted_by").notNull(), // User ID who added this IP
  whitelistedFor: uuid("whitelisted_for").notNull(), // User ID this IP is whitelisted for
  role: roleEnum("role").notNull(), // Role this IP is whitelisted for
  storeId: uuid("store_id"), // Store this IP is associated with (for managers/cashiers)
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  ipAddressIdx: index("ip_whitelists_ip_address_idx").on(table.ipAddress),
  orgIdIdx: index("ip_whitelists_org_id_idx").on(table.orgId),
  whitelistedByIdx: index("ip_whitelists_whitelisted_by_idx").on(table.whitelistedBy),
  whitelistedForIdx: index("ip_whitelists_whitelisted_for_idx").on(table.whitelistedFor),
  storeIdIdx: index("ip_whitelists_store_id_idx").on(table.storeId),
}));

// IP Whitelist Logs table
export const ipWhitelistLogs = pgTable("ip_whitelist_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  userId: uuid("user_id"),
  username: varchar("username", { length: 255 }),
  action: varchar("action", { length: 50 }).notNull(), // 'login_attempt', 'whitelist_added', 'whitelist_removed'
  success: boolean("success").notNull(),
  reason: varchar("reason", { length: 255 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ipAddressIdx: index("ip_whitelist_logs_ip_address_idx").on(table.ipAddress),
  userIdIdx: index("ip_whitelist_logs_user_id_idx").on(table.userId),
}));

// Subscription Payments table
export const subscriptionPayments = pgTable("subscription_payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  orgId: uuid("org_id"),
  paymentReference: varchar("payment_reference", { length: 255 }),
  planCode: varchar("plan_code", { length: 128 }),
  externalSubId: varchar("external_sub_id", { length: 255 }),
  externalInvoiceId: varchar("external_invoice_id", { length: 255 }),
  reference: varchar("reference", { length: 255 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  paymentType: varchar("payment_type", { length: 50 }).notNull(), // 'upfront_fee', 'monthly_billing'
  status: varchar("status", { length: 50 }).notNull(), // 'pending', 'completed', 'failed'
  provider: varchar("provider", { length: 50 }).notNull(), // 'paystack', 'flutterwave'
  eventType: varchar("event_type", { length: 64 }),
  raw: jsonb("raw"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  occurredAt: timestamp("occurred_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  subscriptionIdIdx: index("subscription_payments_subscription_id_idx").on(table.subscriptionId),
  orgIdx: index("subscription_payments_org_id_idx").on(table.orgId),
  paymentReferenceIdx: index("subscription_payments_reference_idx").on(table.paymentReference),
  statusIdx: index("subscription_payments_status_idx").on(table.status),
}));

export const dunningEvents = pgTable("dunning_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id"),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  attempt: integer("attempt"),
  status: varchar("status", { length: 32 }),
  sentAt: timestamp("sent_at"),
  nextAttemptAt: timestamp("next_attempt_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  subscriptionIdx: index("dunning_events_subscription_id_idx").on(table.subscriptionId),
  orgIdx: index("dunning_events_org_id_idx").on(table.orgId),
}));

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id"),
  userId: uuid("user_id"),
  action: varchar("action", { length: 64 }).notNull(),
  entity: varchar("entity", { length: 64 }),
  entityId: uuid("entity_id"),
  meta: jsonb("meta"),
  ip: varchar("ip", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  orgIdx: index("audit_logs_org_id_idx").on(table.orgId),
  userIdx: index("audit_logs_user_id_idx").on(table.userId),
}));

// Scheduled analytics reports table
export const scheduledReports = pgTable("scheduled_reports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id"),
  storeId: uuid("store_id"),
  userId: uuid("user_id"),
  isActive: boolean("is_active").notNull().default(true),
  interval: varchar("interval", { length: 32 }).notNull().default("daily"),
  params: jsonb("params"),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  orgIdx: index("scheduled_reports_org_id_idx").on(table.orgId),
  userIdx: index("scheduled_reports_user_id_idx").on(table.userId),
}));

// Password Reset Tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: boolean("is_used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("password_reset_tokens_user_id_idx").on(table.userId),
  tokenIdx: index("password_reset_tokens_token_idx").on(table.token),
}));

// IP Whitelist Insert Schemas
export const insertIpWhitelistSchema = createInsertSchema(ipWhitelists);

export const insertIpWhitelistLogSchema = createInsertSchema(ipWhitelistLogs);

// Password Reset Token Insert Schema
export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens);

// IP Whitelist Types
export type IpWhitelist = typeof ipWhitelists.$inferSelect;
export type InsertIpWhitelist = z.infer<typeof insertIpWhitelistSchema>;

export type IpWhitelistLog = typeof ipWhitelistLogs.$inferSelect;
export type InsertIpWhitelistLog = z.infer<typeof insertIpWhitelistLogSchema>;

// Password Reset Token Types
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;

// Email Verification Tokens table
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: boolean("is_used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  usedAt: timestamp("used_at"),
}, (table) => ({
  userIdIdx: index("email_verification_tokens_user_id_idx").on(table.userId),
  tokenIdx: index("email_verification_tokens_token_idx").on(table.token),
  expiresAtIdx: index("email_verification_tokens_expires_at_idx").on(table.expiresAt),
}));

// Phone Verification OTP table
export const phoneVerificationOTP = pgTable("phone_verification_otp", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phone: varchar("phone", { length: 50 }).notNull(),
  otpHash: varchar("otp_hash", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  createdAt: timestamp("created_at").defaultNow(),
  verifiedAt: timestamp("verified_at"),
  isVerified: boolean("is_verified").default(false),
}, (table) => ({
  userIdIdx: index("phone_verification_otp_user_id_idx").on(table.userId),
  phoneIdx: index("phone_verification_otp_phone_idx").on(table.phone),
  expiresAtIdx: index("phone_verification_otp_expires_at_idx").on(table.expiresAt),
}));

// Account Lockout Logs table
export const accountLockoutLogs = pgTable("account_lockout_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id"),
  username: varchar("username", { length: 255 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  success: boolean("success").notNull(),
  reason: text("reason"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("account_lockout_logs_user_id_idx").on(table.userId),
  ipAddressIdx: index("account_lockout_logs_ip_address_idx").on(table.ipAddress),
  createdAtIdx: index("account_lockout_logs_created_at_idx").on(table.createdAt),
  actionIdx: index("account_lockout_logs_action_idx").on(table.action),
}));

// User Sessions table
export const userSessions = pgTable("user_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionToken: text("session_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  refreshExpiresAt: timestamp("refresh_expires_at").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
}, (table) => ({
  userIdIdx: index("user_sessions_user_id_idx").on(table.userId),
  refreshTokenIdx: index("user_sessions_refresh_token_idx").on(table.refreshToken),
  isActiveIdx: index("user_sessions_is_active_idx").on(table.isActive),
}));

// Webhook events idempotency table
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider", { length: 32 }).notNull(),
  eventId: varchar("event_id", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  providerIdx: index("webhook_events_provider_idx").on(table.provider),
  eventIdIdx: index("webhook_events_event_id_idx").on(table.eventId),
}));

// Stock alerts table used by nightly low stock scanner
export const stockAlerts = pgTable("stock_alerts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull(),
  productId: uuid("product_id").notNull(),
  currentQty: integer("current_qty").notNull(),
  reorderLevel: integer("reorder_level").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  storeIdx: index("stock_alerts_store_id_idx").on(table.storeId),
  productIdx: index("stock_alerts_product_id_idx").on(table.productId),
}));

// Subscription Insert Schemas
export const insertSubscriptionSchema = createInsertSchema(subscriptions);

export const insertSubscriptionPaymentSchema = createInsertSchema(subscriptionPayments);

// Subscription and Auth Types
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect;
export type InsertSubscriptionPayment = z.infer<typeof insertSubscriptionPaymentSchema>;

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;

// AI Profit Advisor Tables
export const aiInsights = pgTable("ai_insights", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  insightType: varchar("insight_type", { length: 64 }).notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  severity: varchar("severity", { length: 16 }).notNull().default("info"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  data: jsonb("data").notNull().default({}),
  isActionable: boolean("is_actionable").notNull().default(false),
  isDismissed: boolean("is_dismissed").notNull().default(false),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  dismissedBy: uuid("dismissed_by").references(() => users.id, { onDelete: "set null" }),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  storeIdx: index("ai_insights_store_idx").on(table.storeId, table.generatedAt),
  typeIdx: index("ai_insights_type_idx").on(table.insightType, table.severity),
  productIdx: index("ai_insights_product_idx").on(table.productId),
}));

export const aiBatchRuns = pgTable("ai_batch_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  storesProcessed: integer("stores_processed").notNull().default(0),
  insightsGenerated: integer("insights_generated").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index("ai_batch_runs_org_idx").on(table.orgId, table.createdAt),
}));

export const aiProductProfitability = pgTable("ai_product_profitability", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  periodDays: integer("period_days").notNull().default(30),
  unitsSold: integer("units_sold").notNull().default(0),
  totalRevenue: decimal("total_revenue", { precision: 14, scale: 2 }).notNull().default("0"),
  totalCost: decimal("total_cost", { precision: 14, scale: 4 }).notNull().default("0"),
  totalProfit: decimal("total_profit", { precision: 14, scale: 2 }).notNull().default("0"),
  profitMargin: decimal("profit_margin", { precision: 6, scale: 4 }).notNull().default("0"),
  avgProfitPerUnit: decimal("avg_profit_per_unit", { precision: 10, scale: 4 }).notNull().default("0"),
  refundedAmount: decimal("refunded_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  refundedQuantity: integer("refunded_quantity").notNull().default(0),
  netRevenue: decimal("net_revenue", { precision: 14, scale: 2 }).notNull().default("0"),
  grossRevenue: decimal("gross_revenue", { precision: 14, scale: 2 }).notNull().default("0"),
  netCost: decimal("net_cost", { precision: 14, scale: 4 }).notNull().default("0"),
  saleVelocity: decimal("sale_velocity", { precision: 10, scale: 4 }).notNull().default("0"),
  daysToStockout: integer("days_to_stockout"),
  removalCount: integer("removal_count").notNull().default(0),
  removalLossValue: decimal("removal_loss_value", { precision: 14, scale: 2 }).notNull().default("0"),
  trend: varchar("trend", { length: 16 }).default("stable"),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  storeIdx: index("ai_product_profitability_store_idx").on(table.storeId, table.computedAt),
  profitIdx: index("ai_product_profitability_profit_idx").on(table.storeId, table.totalProfit),
  velocityIdx: index("ai_product_profitability_velocity_idx").on(table.storeId, table.saleVelocity),
  uniqueProduct: uniqueIndex("ai_product_profitability_unique").on(table.storeId, table.productId, table.periodDays),
}));

// AI Types
export type AiInsight = typeof aiInsights.$inferSelect;
export type InsertAiInsight = typeof aiInsights.$inferInsert;
export type AiBatchRun = typeof aiBatchRuns.$inferSelect;
export type AiProductProfitability = typeof aiProductProfitability.$inferSelect;


