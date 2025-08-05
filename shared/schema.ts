import { sql } from "drizzle-orm";
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
  index
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["cashier", "manager", "admin"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "completed", "voided", "held"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card", "digital"]);

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).unique(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  password: varchar("password", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  companyName: varchar("company_name", { length: 255 }),
  tier: varchar("tier", { length: 50 }),
  location: varchar("location", { length: 50 }),
  trialEndsAt: timestamp("trial_ends_at"),
  role: userRoleEnum("role").notNull().default("cashier"),
  storeId: uuid("store_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("users_store_id_idx").on(table.storeId),
  isActiveIdx: index("users_is_active_idx").on(table.isActive),
  createdAtIdx: index("users_created_at_idx").on(table.createdAt),
}));

// Stores table
export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  ownerId: uuid("owner_id"),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  taxRate: decimal("tax_rate", { precision: 5, scale: 4 }).default("0.085"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Products table
export const products = pgTable("products", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 255 }).unique(),
  barcode: varchar("barcode", { length: 255 }).unique(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }),
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
  minStockLevel: integer("min_stock_level").default(10),
  maxStockLevel: integer("max_stock_level").default(100),
  lastRestocked: timestamp("last_restocked"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("inventory_store_id_idx").on(table.storeId),
  productIdIdx: index("inventory_product_id_idx").on(table.productId),
}));

// Transactions table
export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull(),
  cashierId: uuid("cashier_id").notNull(),
  status: transactionStatusEnum("status").default("pending"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  amountReceived: decimal("amount_received", { precision: 10, scale: 2 }),
  changeDue: decimal("change_due", { precision: 10, scale: 2 }),
  receiptNumber: varchar("receipt_number", { length: 255 }).unique(),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  storeIdIdx: index("transactions_store_id_idx").on(table.storeId),
  cashierIdIdx: index("transactions_cashier_id_idx").on(table.cashierId),
  createdAtIdx: index("transactions_created_at_idx").on(table.createdAt),
}));

// Transaction Items table
export const transactionItems = pgTable("transaction_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionId: uuid("transaction_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
}, (table) => ({
  transactionIdIdx: index("transaction_items_transaction_id_idx").on(table.transactionId),
  productIdIdx: index("transaction_items_product_id_idx").on(table.productId),
}));

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
export const usersRelations = relations(users, ({ one, many }) => ({
  store: one(stores, {
    fields: [users.storeId],
    references: [stores.id],
  }),
  transactions: many(transactions),
}));

export const storesRelations = relations(stores, ({ many }) => ({
  users: many(users),
  inventory: many(inventory),
  transactions: many(transactions),
  lowStockAlerts: many(lowStockAlerts),
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



// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStoreSchema = createInsertSchema(stores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInventorySchema = createInsertSchema(inventory).omit({
  id: true,
  updatedAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertTransactionItemSchema = createInsertSchema(transactionItems).omit({
  id: true,
});

export const insertLowStockAlertSchema = createInsertSchema(lowStockAlerts).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});

// Loyalty Program Insert Schemas
export const insertLoyaltyTierSchema = createInsertSchema(loyaltyTiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLoyaltyTransactionSchema = createInsertSchema(loyaltyTransactions).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Store = typeof stores.$inferSelect;
export type InsertStore = z.infer<typeof insertStoreSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type Inventory = typeof inventory.$inferSelect;
export type InsertInventory = z.infer<typeof insertInventorySchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type TransactionItem = typeof transactionItems.$inferSelect;
export type InsertTransactionItem = z.infer<typeof insertTransactionItemSchema>;

export type LowStockAlert = typeof lowStockAlerts.$inferSelect;
export type InsertLowStockAlert = z.infer<typeof insertLowStockAlertSchema>;

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

// IP Whitelist Tables
export const ipWhitelists = pgTable("ip_whitelists", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(), // IPv6 can be up to 45 chars
  description: varchar("description", { length: 255 }),
  whitelistedBy: uuid("whitelisted_by").notNull(), // User ID who added this IP
  whitelistedFor: uuid("whitelisted_for").notNull(), // User ID this IP is whitelisted for
  role: userRoleEnum("role").notNull(), // Role this IP is whitelisted for
  storeId: uuid("store_id"), // Store this IP is associated with (for managers/cashiers)
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  ipAddressIdx: index("ip_whitelists_ip_address_idx").on(table.ipAddress),
  whitelistedByIdx: index("ip_whitelists_whitelisted_by_idx").on(table.whitelistedBy),
  whitelistedForIdx: index("ip_whitelists_whitelisted_for_idx").on(table.whitelistedFor),
  storeIdIdx: index("ip_whitelists_store_id_idx").on(table.storeId),
}));

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

// Session table for express-session
export const sessions = pgTable("session", {
  sid: varchar("sid", { length: 255 }).primaryKey(),
  sess: text("sess").notNull(),
  expire: timestamp("expire").notNull(),
}, (table) => ({
  expireIdx: index("session_expire_idx").on(table.expire),
}));

// Password Reset Tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: boolean("is_used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("password_reset_tokens_user_id_idx").on(table.userId),
  tokenIdx: index("password_reset_tokens_token_idx").on(table.token),
}));

// AI Demand Forecasting Tables
export const forecastModels = pgTable("forecast_models", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  modelType: varchar("model_type", { length: 100 }).notNull(), // 'linear', 'arima', 'lstm', 'prophet', etc.
  parameters: text("parameters"), // JSON string of model parameters
  accuracy: decimal("accuracy", { precision: 5, scale: 4 }),
  isActive: boolean("is_active").default(true),
  lastTrained: timestamp("last_trained"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("forecast_models_store_id_idx").on(table.storeId),
}));

export const demandForecasts = pgTable("demand_forecasts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull(),
  productId: uuid("product_id").notNull(),
  modelId: uuid("model_id").notNull(),
  forecastDate: timestamp("forecast_date").notNull(),
  predictedDemand: integer("predicted_demand").notNull(),
  confidenceLower: integer("confidence_lower"),
  confidenceUpper: integer("confidence_upper"),
  actualDemand: integer("actual_demand"),
  accuracy: decimal("accuracy", { precision: 5, scale: 4 }),
  factors: text("factors"), // JSON string of factors that influenced the forecast
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("demand_forecasts_store_id_idx").on(table.storeId),
  productIdIdx: index("demand_forecasts_product_id_idx").on(table.productId),
  modelIdIdx: index("demand_forecasts_model_id_idx").on(table.modelId),
  forecastDateIdx: index("demand_forecasts_forecast_date_idx").on(table.forecastDate),
}));

export const aiInsights = pgTable("ai_insights", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull(),
  insightType: varchar("insight_type", { length: 100 }).notNull(), // 'trend', 'anomaly', 'recommendation', 'pattern'
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  severity: varchar("severity", { length: 50 }).default("medium"), // 'low', 'medium', 'high', 'critical'
  data: text("data"), // JSON string of insight data
  isRead: boolean("is_read").default(false),
  isActioned: boolean("is_actioned").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  actionedAt: timestamp("actioned_at"),
}, (table) => ({
  storeIdIdx: index("ai_insights_store_id_idx").on(table.storeId),
}));

export const seasonalPatterns = pgTable("seasonal_patterns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull(),
  productId: uuid("product_id"),
  patternType: varchar("pattern_type", { length: 100 }).notNull(), // 'daily', 'weekly', 'monthly', 'yearly'
  season: varchar("season", { length: 50 }),
  dayOfWeek: integer("day_of_week"), // 0-6 for Sunday-Saturday
  month: integer("month"), // 1-12
  averageDemand: integer("average_demand").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("seasonal_patterns_store_id_idx").on(table.storeId),
  productIdIdx: index("seasonal_patterns_product_id_idx").on(table.productId),
}));

export const externalFactors = pgTable("external_factors", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: uuid("store_id").notNull(),
  factorType: varchar("factor_type", { length: 100 }).notNull(), // 'weather', 'holiday', 'event', 'economic'
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  impact: varchar("impact", { length: 50 }).default("neutral"), // 'positive', 'negative', 'neutral'
  impactStrength: decimal("impact_strength", { precision: 3, scale: 2 }).default("0.00"), // -1.00 to 1.00
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("external_factors_store_id_idx").on(table.storeId),
}));

// AI Relations
export const forecastModelsRelations = relations(forecastModels, ({ one, many }) => ({
  store: one(stores, {
    fields: [forecastModels.storeId],
    references: [stores.id],
  }),
  forecasts: many(demandForecasts),
}));

export const demandForecastsRelations = relations(demandForecasts, ({ one }) => ({
  store: one(stores, {
    fields: [demandForecasts.storeId],
    references: [stores.id],
  }),
  product: one(products, {
    fields: [demandForecasts.productId],
    references: [products.id],
  }),
  model: one(forecastModels, {
    fields: [demandForecasts.modelId],
    references: [forecastModels.id],
  }),
}));

export const aiInsightsRelations = relations(aiInsights, ({ one }) => ({
  store: one(stores, {
    fields: [aiInsights.storeId],
    references: [stores.id],
  }),
}));

export const seasonalPatternsRelations = relations(seasonalPatterns, ({ one }) => ({
  store: one(stores, {
    fields: [seasonalPatterns.storeId],
    references: [stores.id],
  }),
  product: one(products, {
    fields: [seasonalPatterns.productId],
    references: [products.id],
  }),
}));

export const externalFactorsRelations = relations(externalFactors, ({ one }) => ({
  store: one(stores, {
    fields: [externalFactors.storeId],
    references: [stores.id],
  }),
}));

// IP Whitelist Relations
export const ipWhitelistsRelations = relations(ipWhitelists, ({ one }) => ({
  whitelistedByUser: one(users, {
    fields: [ipWhitelists.whitelistedBy],
    references: [users.id],
  }),
  whitelistedForUser: one(users, {
    fields: [ipWhitelists.whitelistedFor],
    references: [users.id],
  }),
  store: one(stores, {
    fields: [ipWhitelists.storeId],
    references: [stores.id],
  }),
}));

export const ipWhitelistLogsRelations = relations(ipWhitelistLogs, ({ one }) => ({
  user: one(users, {
    fields: [ipWhitelistLogs.userId],
    references: [users.id],
  }),
}));

// Password Reset Token Relations
export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

// AI Insert Schemas
export const insertForecastModelSchema = createInsertSchema(forecastModels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDemandForecastSchema = createInsertSchema(demandForecasts).omit({
  id: true,
  createdAt: true,
});

export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({
  id: true,
  createdAt: true,
  actionedAt: true,
});

export const insertSeasonalPatternSchema = createInsertSchema(seasonalPatterns).omit({
  id: true,
  createdAt: true,
});

export const insertExternalFactorSchema = createInsertSchema(externalFactors).omit({
  id: true,
  createdAt: true,
});

// IP Whitelist Insert Schemas
export const insertIpWhitelistSchema = createInsertSchema(ipWhitelists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIpWhitelistLogSchema = createInsertSchema(ipWhitelistLogs).omit({
  id: true,
  createdAt: true,
});

// Password Reset Token Insert Schema
export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

// AI Types
export type ForecastModel = typeof forecastModels.$inferSelect;
export type InsertForecastModel = z.infer<typeof insertForecastModelSchema>;

export type DemandForecast = typeof demandForecasts.$inferSelect;
export type InsertDemandForecast = z.infer<typeof insertDemandForecastSchema>;

export type AiInsight = typeof aiInsights.$inferSelect;
export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;

export type SeasonalPattern = typeof seasonalPatterns.$inferSelect;
export type InsertSeasonalPattern = z.infer<typeof insertSeasonalPatternSchema>;

export type ExternalFactor = typeof externalFactors.$inferSelect;
export type InsertExternalFactor = z.infer<typeof insertExternalFactorSchema>;

// IP Whitelist Types
export type IpWhitelist = typeof ipWhitelists.$inferSelect;
export type InsertIpWhitelist = z.infer<typeof insertIpWhitelistSchema>;

export type IpWhitelistLog = typeof ipWhitelistLogs.$inferSelect;
export type InsertIpWhitelistLog = z.infer<typeof insertIpWhitelistLogSchema>;

// Password Reset Token Types
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
