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
  emailVerified: boolean("email_verified").default(false),
  phoneVerified: boolean("phone_verified").default(false),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  lastFailedLogin: timestamp("last_failed_login"),
  verificationToken: varchar("verification_token", { length: 255 }),
  verificationTokenExpires: timestamp("verification_token_expires"),
  signupCompleted: boolean("signup_completed").default(false),
  signupStartedAt: timestamp("signup_started_at"),
  signupCompletedAt: timestamp("signup_completed_at"),
  signupAttempts: integer("signup_attempts").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("users_store_id_idx").on(table.storeId),
  isActiveIdx: index("users_is_active_idx").on(table.isActive),
  createdAtIdx: index("users_created_at_idx").on(table.createdAt),
  incompleteSignupsIdx: index("users_incomplete_signups_idx").on(table.signupCompleted, table.signupStartedAt),
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

// Enhanced validation schemas with comprehensive rules
export const enhancedUserSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be less than 50 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
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
    .min(10, "Phone number must be at least 10 digits")
    .max(20, "Phone number must be less than 20 characters")
    .regex(/^[\+]?[1-9][\d]{0,15}$/, "Invalid phone number format"),
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
    .regex(/^[\+]?[1-9][\d]{0,15}$/, "Invalid phone number format")
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
export const insertUserSchema = enhancedUserSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStoreSchema = createInsertSchema(stores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductSchema = enhancedProductSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInventorySchema = enhancedInventorySchema.omit({
  id: true,
  updatedAt: true,
});

export const insertTransactionSchema = enhancedTransactionSchema.omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertTransactionItemSchema = enhancedTransactionItemSchema.omit({
  id: true,
});

export const insertLowStockAlertSchema = createInsertSchema(lowStockAlerts).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});

// Loyalty Program Insert Schemas
export const insertLoyaltyTierSchema = enhancedLoyaltyTierSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerSchema = enhancedCustomerSchema.omit({
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

// Email Verification Tokens table
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
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
  userId: uuid("user_id").notNull(),
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
  ipAddress: varchar("ip_address", { length: 45 }).notNull(), // IPv6 compatible
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

// User Sessions table for JWT token management
export const userSessions = pgTable("user_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
  refreshToken: varchar("refresh_token", { length: 255 }).notNull().unique(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  refreshExpiresAt: timestamp("refresh_expires_at").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("user_sessions_user_id_idx").on(table.userId),
  sessionTokenIdx: index("user_sessions_session_token_idx").on(table.sessionToken),
  refreshTokenIdx: index("user_sessions_refresh_token_idx").on(table.refreshToken),
  expiresAtIdx: index("user_sessions_expires_at_idx").on(table.expiresAt),
  isActiveIdx: index("user_sessions_is_active_idx").on(table.isActive),
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

// Email Verification Token Relations
export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id],
  }),
}));

// Phone Verification OTP Relations
export const phoneVerificationOTPRelations = relations(phoneVerificationOTP, ({ one }) => ({
  user: one(users, {
    fields: [phoneVerificationOTP.userId],
    references: [users.id],
  }),
}));

// Account Lockout Log Relations
export const accountLockoutLogsRelations = relations(accountLockoutLogs, ({ one }) => ({
  user: one(users, {
    fields: [accountLockoutLogs.userId],
    references: [users.id],
  }),
}));

// User Session Relations
export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
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

// Email Verification Token Insert Schema
export const insertEmailVerificationTokenSchema = createInsertSchema(emailVerificationTokens).omit({
  id: true,
  createdAt: true,
});

// Phone Verification OTP Insert Schema
export const insertPhoneVerificationOTPSchema = createInsertSchema(phoneVerificationOTP).omit({
  id: true,
  createdAt: true,
});

// Account Lockout Log Insert Schema
export const insertAccountLockoutLogSchema = createInsertSchema(accountLockoutLogs).omit({
  id: true,
  createdAt: true,
});

// User Session Insert Schema
export const insertUserSessionSchema = createInsertSchema(userSessions).omit({
  id: true,
  createdAt: true,
});

// IP Whitelist Types
export type IpWhitelist = typeof ipWhitelists.$inferSelect;
export type InsertIpWhitelist = z.infer<typeof insertIpWhitelistSchema>;

export type IpWhitelistLog = typeof ipWhitelistLogs.$inferSelect;
export type InsertIpWhitelistLog = z.infer<typeof insertIpWhitelistLogSchema>;

// Password Reset Token Types
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;

// Email Verification Token Types
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = z.infer<typeof insertEmailVerificationTokenSchema>;

// Phone Verification OTP Types
export type PhoneVerificationOTP = typeof phoneVerificationOTP.$inferSelect;
export type InsertPhoneVerificationOTP = z.infer<typeof insertPhoneVerificationOTPSchema>;

// Account Lockout Log Types
export type AccountLockoutLog = typeof accountLockoutLogs.$inferSelect;
export type InsertAccountLockoutLog = z.infer<typeof insertAccountLockoutLogSchema>;

// User Session Types
export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
