import {
  users,
  stores,
  products,
  inventory,
  transactions,
  transactionItems,
  userStorePermissions,
  lowStockAlerts,
  loyaltyTiers,
  customers,
  loyaltyTransactions,
  type User,
  type InsertUser,
  type UserStorePermission,
  type InsertUserStorePermission,
  type Store,
  type InsertStore,
  type Product,
  type InsertProduct,
  type Inventory,
  type InsertInventory,
  type Transaction,
  type InsertTransaction,
  type TransactionItem,
  type InsertTransactionItem,
  type LowStockAlert,
  type InsertLowStockAlert,
  type LoyaltyTier,
  type InsertLoyaltyTier,
  type Customer,
  type InsertCustomer,
  type LoyaltyTransaction,
  type InsertLoyaltyTransaction,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, lt, lte, gte, between, isNotNull, or } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsersByStore(storeId: string): Promise<User[]>;

  // Store operations
  getAllStores(): Promise<Store[]>;
  getStore(id: string): Promise<Store | undefined>;
  createStore(store: InsertStore): Promise<Store>;
  updateStore(id: string, store: Partial<InsertStore>): Promise<Store>;

  // Product operations
  getAllProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  getProductByBarcode(barcode: string): Promise<Product | undefined>;
  getProductBySku(sku: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product>;
  searchProducts(query: string): Promise<Product[]>;

  // Inventory operations
  getInventoryByStore(storeId: string): Promise<Inventory[]>;
  getInventoryItem(productId: string, storeId: string): Promise<Inventory | undefined>;
  updateInventory(productId: string, storeId: string, inventory: Partial<InsertInventory>): Promise<Inventory>;
  adjustInventory(productId: string, storeId: string, quantityChange: number): Promise<Inventory>;
  getLowStockItems(storeId: string): Promise<Inventory[]>;

  // Transaction operations
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  addTransactionItem(item: InsertTransactionItem): Promise<TransactionItem>;
  getTransaction(id: string): Promise<Transaction | undefined>;
  getTransactionsByStore(storeId: string, limit?: number): Promise<Transaction[]>;
  updateTransaction(id: string, transaction: Partial<Transaction>): Promise<Transaction>;
  getTransactionItems(transactionId: string): Promise<TransactionItem[]>;

  // Analytics operations
  getDailySales(storeId: string, date: Date): Promise<{ revenue: number; transactions: number }>;
  getPopularProducts(storeId: string, limit?: number): Promise<Array<{ product: Product; salesCount: number }>>;
  getStoreProfitLoss(storeId: string, startDate: Date, endDate: Date): Promise<{ revenue: number; cost: number; profit: number }>;
  getStoreInventory(storeId: string): Promise<any>;

  // Alert operations
  createLowStockAlert(alert: InsertLowStockAlert): Promise<LowStockAlert>;
  getLowStockAlerts(storeId: string): Promise<LowStockAlert[]>;
  resolveLowStockAlert(id: string): Promise<void>;

  // Loyalty Program operations
  getLoyaltyTiers(storeId: string): Promise<LoyaltyTier[]>;
  createLoyaltyTier(tier: InsertLoyaltyTier): Promise<LoyaltyTier>;
  updateLoyaltyTier(id: string, tier: Partial<InsertLoyaltyTier>): Promise<LoyaltyTier>;
  deleteLoyaltyTier(id: string): Promise<void>;
  getLoyaltyTierByName(storeId: string, name: string): Promise<LoyaltyTier | undefined>;
  
  getLoyaltyCustomers(storeId: string): Promise<Customer[]>;
  createLoyaltyCustomer(customer: InsertCustomer): Promise<Customer>;
  getLoyaltyCustomer(id: string): Promise<Customer | undefined>;
  updateLoyaltyCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer>;
  getCustomerByLoyaltyNumber(loyaltyNumber: string): Promise<Customer | undefined>;
  
  createLoyaltyTransaction(transaction: InsertLoyaltyTransaction): Promise<LoyaltyTransaction>;
  getLoyaltyTransactions(storeId: string, limit?: number): Promise<LoyaltyTransaction[]>;
  getCustomerLoyaltyTransactions(customerId: string, limit?: number): Promise<LoyaltyTransaction[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async authenticateUser(username: string, password: string): Promise<User | null> {
    // Simple password check - in production, use proper password hashing
    const user = await this.getUserByUsername(username);
    
    // Demo credentials
    const validCredentials = {
      admin: "admin123",
      manager: "manager123", 
      cashier: "cashier123"
    };
    
    if (user && validCredentials[username as keyof typeof validCredentials] === password) {
      return user;
    }
    
    return null;
  }

  async getUserStorePermissions(userId: string): Promise<UserStorePermission[]> {
    const permissions = await db.select().from(userStorePermissions).where(eq(userStorePermissions.userId, userId));
    return permissions;
  }

  async getUserAccessibleStores(userId: string): Promise<Store[]> {
    const user = await this.getUser(userId);
    if (!user) return [];
    
    // Admin can access all stores
    if (user.role === "admin") {
      return await this.getAllStores();
    }
    
    // Cashier only access their assigned store
    if (user.role === "cashier" && user.storeId) {
      const store = await this.getStore(user.storeId);
      return store ? [store] : [];
    }
    
    // Manager can access stores they have permissions for
    if (user.role === "manager") {
      const permissions = await this.getUserStorePermissions(userId);
      const storeIds = permissions.map(p => p.storeId);
      
      if (storeIds.length === 0) return [];
      
      const storeResults = await db.select().from(stores).where(
        sql`${stores.id} = ANY(${storeIds})`
      );
      return storeResults;
    }
    
    return [];
  }

  async grantStoreAccess(userId: string, storeId: string, grantedBy: string): Promise<UserStorePermission> {
    const [permission] = await db.insert(userStorePermissions).values({
      userId,
      storeId,
      grantedBy,
    }).returning();
    
    return permission;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUsersByStore(storeId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.storeId, storeId));
  }

  // Store operations
  async getAllStores(): Promise<Store[]> {
    return await db.select().from(stores).where(eq(stores.isActive, true));
  }

  async getStore(id: string): Promise<Store | undefined> {
    const [store] = await db.select().from(stores).where(eq(stores.id, id));
    return store || undefined;
  }

  async createStore(insertStore: InsertStore): Promise<Store> {
    const [store] = await db.insert(stores).values(insertStore).returning();
    return store;
  }

  async updateStore(id: string, updateStore: Partial<InsertStore>): Promise<Store> {
    const [store] = await db
      .update(stores)
      .set({ ...updateStore, updatedAt: new Date() })
      .where(eq(stores.id, id))
      .returning();
    return store;
  }

  // Product operations
  async getAllProducts(): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.isActive, true));
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async getProductByBarcode(barcode: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.barcode, barcode));
    return product || undefined;
  }

  async getProductBySku(sku: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.sku, sku));
    return product || undefined;
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [product] = await db.insert(products).values(insertProduct).returning();
    return product;
  }

  async updateProduct(id: string, updateProduct: Partial<InsertProduct>): Promise<Product> {
    const [product] = await db
      .update(products)
      .set({ ...updateProduct, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  async searchProducts(query: string): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.isActive, true),
          sql`${products.name} ILIKE ${`%${query}%`} OR ${products.barcode} ILIKE ${`%${query}%`} OR ${products.sku} ILIKE ${`%${query}%`}`
        )
      );
  }

  // Enhanced Product Management Methods
  async deleteProduct(id: string): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  async getProductCategories(): Promise<string[]> {
    const result = await db.select({ category: products.category })
      .from(products)
      .where(isNotNull(products.category))
      .groupBy(products.category);
    
    return result.map(r => r.category).filter((category): category is string => typeof category === 'string');
  }

  async getProductBrands(): Promise<string[]> {
    const result = await db.select({ brand: products.brand })
      .from(products)
      .where(isNotNull(products.brand))
      .groupBy(products.brand);
    
    return result.map(r => r.brand).filter((brand): brand is string => typeof brand === 'string');
  }

  // Inventory operations
  async getInventoryByStore(storeId: string): Promise<Inventory[]> {
    return await db.select().from(inventory).where(eq(inventory.storeId, storeId));
  }

  async getInventoryItem(productId: string, storeId: string): Promise<Inventory | undefined> {
    const [item] = await db
      .select()
      .from(inventory)
      .where(and(eq(inventory.productId, productId), eq(inventory.storeId, storeId)));
    return item || undefined;
  }

  async updateInventory(productId: string, storeId: string, updateInventory: Partial<InsertInventory>): Promise<Inventory> {
    const [item] = await db
      .update(inventory)
      .set({ ...updateInventory, updatedAt: new Date() })
      .where(and(eq(inventory.productId, productId), eq(inventory.storeId, storeId)))
      .returning();
    return item;
  }

  async adjustInventory(productId: string, storeId: string, quantityChange: number): Promise<Inventory> {
    const [item] = await db
      .update(inventory)
      .set({ 
        quantity: sql`${inventory.quantity} + ${quantityChange}`,
        updatedAt: new Date()
      })
      .where(and(eq(inventory.productId, productId), eq(inventory.storeId, storeId)))
      .returning();
    return item;
  }

  async getLowStockItems(storeId: string): Promise<Inventory[]> {
    return await db
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.storeId, storeId),
          sql`${inventory.quantity} <= ${inventory.minStockLevel}`
        )
      );
  }

  // Transaction operations
  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db.insert(transactions).values(insertTransaction).returning();
    return transaction;
  }

  async addTransactionItem(insertItem: InsertTransactionItem): Promise<TransactionItem> {
    const [item] = await db.insert(transactionItems).values(insertItem).returning();
    return item;
  }

  async getTransaction(id: string): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id));
    return transaction || undefined;
  }

  async getTransactionsByStore(storeId: string, limit = 50): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.storeId, storeId))
      .orderBy(desc(transactions.createdAt))
      .limit(limit);
  }

  async updateTransaction(id: string, updateTransaction: Partial<Transaction>): Promise<Transaction> {
    const [transaction] = await db
      .update(transactions)
      .set(updateTransaction)
      .where(eq(transactions.id, id))
      .returning();
    return transaction;
  }

  async getTransactionItems(transactionId: string): Promise<TransactionItem[]> {
    return await db
      .select()
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, transactionId));
  }

  // Enhanced Analytics Methods
  async getSalesData(storeId: string, startDate: Date, endDate: Date): Promise<any[]> {
    const result = await db.select({
      date: sql`DATE(${transactions.createdAt})`,
      revenue: sql`SUM(${transactions.total})`,
      transactions: sql`COUNT(*)`,
      customers: sql`COUNT(DISTINCT ${transactions.cashierId})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.storeId, storeId),
        eq(transactions.status, "completed"),
        gte(transactions.createdAt, startDate),
        lte(transactions.createdAt, endDate)
      )
    )
    .groupBy(sql`DATE(${transactions.createdAt})`)
    .orderBy(asc(sql`DATE(${transactions.createdAt})`));

    return result;
  }

  async getInventoryValue(storeId: string): Promise<{ totalValue: number; itemCount: number }> {
    const result = await db.select({
      totalValue: sql`SUM(${inventory.quantity} * ${products.price})`,
      itemCount: sql`COUNT(*)`,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .where(eq(inventory.storeId, storeId));

    return {
      totalValue: parseFloat(String(result[0]?.totalValue || "0")),
      itemCount: parseInt(String(result[0]?.itemCount || "0")),
    };
  }

  async getCustomerInsights(storeId: string): Promise<{
    totalCustomers: number;
    newCustomers: number;
    repeatCustomers: number;
  }> {
    const totalCustomers = await db.select({ count: sql`COUNT(*)` })
      .from(customers)
      .where(eq(customers.storeId, storeId));

    const newCustomers = await db.select({ count: sql`COUNT(*)` })
      .from(customers)
      .where(
        and(
          eq(customers.storeId, storeId),
          gte(customers.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        )
      );

    // Mock repeat customers calculation
    const repeatCustomers = Math.floor(parseInt(String(totalCustomers[0]?.count || "0")) * 0.3);

    return {
      totalCustomers: parseInt(String(totalCustomers[0]?.count || "0")),
      newCustomers: parseInt(String(newCustomers[0]?.count || "0")),
      repeatCustomers,
    };
  }

  async getEmployeePerformance(storeId: string): Promise<any[]> {
    const result = await db.select({
      cashierId: transactions.cashierId,
      totalSales: sql`COUNT(*)`,
      totalRevenue: sql`SUM(${transactions.total})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.storeId, storeId),
        eq(transactions.status, "completed"),
        gte(transactions.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      )
    )
    .groupBy(transactions.cashierId)
    .orderBy(desc(sql`SUM(${transactions.total})`));

    return result;
  }

  // Enhanced Inventory Management Methods
  async bulkUpdateInventory(storeId: string, updates: any[]): Promise<any[]> {
    const results = [];
    
    for (const update of updates) {
      try {
        const result = await this.updateInventory(
          update.productId,
          storeId,
          { quantity: update.quantity }
        );
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
      }
    }
    
    return results;
  }

  async getStockMovements(storeId: string): Promise<any[]> {
    // This would typically query a stock_movements table
    // For now, return mock data
    return [
      {
        id: "1",
        productId: "product-1",
        type: "sale",
        quantity: -2,
        previousStock: 10,
        newStock: 8,
        timestamp: new Date(),
        reason: "Sale transaction",
      },
      {
        id: "2",
        productId: "product-1",
        type: "restock",
        quantity: 5,
        previousStock: 8,
        newStock: 13,
        timestamp: new Date(),
        reason: "Manual restock",
      },
    ];
  }

  async performStockCount(storeId: string, items: any[]): Promise<any[]> {
    const results = [];
    
    for (const item of items) {
      try {
        const currentInventory = await this.getInventoryItem(item.productId, storeId);
        const variance = item.countedQuantity - (currentInventory?.quantity || 0);
        
        await this.updateInventory(item.productId, storeId, {
          quantity: item.countedQuantity,
        });
        
        results.push({
          productId: item.productId,
          previousQuantity: currentInventory?.quantity || 0,
          countedQuantity: item.countedQuantity,
          variance,
          success: true,
        });
      } catch (error) {
        results.push({
          productId: item.productId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    
    return results;
  }

  // Enhanced User Management Methods
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(asc(users.firstName));
  }

  async updateUser(id: string, userData: Partial<InsertUser>): Promise<User> {
    const [user] = await db.update(users)
      .set({ ...userData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // Enhanced Transaction Management Methods
  async createRefund(transactionId: string, items: any[], reason: string): Promise<any> {
    // Create a refund transaction
    const refundTransaction = await this.createTransaction({
      storeId: "store-id", // Get from original transaction
      cashierId: "current-user",
      subtotal: items.reduce((sum, item) => sum + item.totalPrice, 0).toString(),
      taxAmount: "0", // Calculate based on refund amount
      total: items.reduce((sum, item) => sum + item.totalPrice, 0).toString(),
      paymentMethod: "cash", // Use cash as the payment method for refunds
      status: "completed",
    });

    // Restore inventory for refunded items
    for (const item of items) {
      await this.adjustInventory(item.productId, "store-id", item.quantity);
    }

    return refundTransaction;
  }

  async getReturns(storeId: string): Promise<any[]> {
    // For now, return empty array since we're not tracking refunds separately
    // In a real implementation, you might have a separate refunds table or use a different approach
    return [];
  }

  // Alert operations
  async createLowStockAlert(insertAlert: InsertLowStockAlert): Promise<LowStockAlert> {
    const [alert] = await db.insert(lowStockAlerts).values(insertAlert).returning();
    return alert;
  }

  async getLowStockAlerts(storeId: string): Promise<LowStockAlert[]> {
    return await db
      .select()
      .from(lowStockAlerts)
      .where(and(eq(lowStockAlerts.storeId, storeId), eq(lowStockAlerts.isResolved, false)))
      .orderBy(desc(lowStockAlerts.createdAt));
  }

  async resolveLowStockAlert(id: string): Promise<void> {
    await db
      .update(lowStockAlerts)
      .set({ isResolved: true, resolvedAt: new Date() })
      .where(eq(lowStockAlerts.id, id));
  }

  // Loyalty Program operations
  async getLoyaltyTiers(storeId: string): Promise<LoyaltyTier[]> {
    return await db
      .select()
      .from(loyaltyTiers)
      .where(eq(loyaltyTiers.storeId, storeId))
      .orderBy(asc(loyaltyTiers.pointsRequired));
  }

  async createLoyaltyTier(tier: InsertLoyaltyTier): Promise<LoyaltyTier> {
    const [newTier] = await db.insert(loyaltyTiers).values(tier).returning();
    return newTier;
  }

  async updateLoyaltyTier(id: string, tier: Partial<InsertLoyaltyTier>): Promise<LoyaltyTier> {
    const [updatedTier] = await db
      .update(loyaltyTiers)
      .set({ ...tier, updatedAt: new Date() })
      .where(eq(loyaltyTiers.id, id))
      .returning();
    return updatedTier;
  }

  async deleteLoyaltyTier(id: string): Promise<void> {
    await db.delete(loyaltyTiers).where(eq(loyaltyTiers.id, id));
  }

  async getLoyaltyTierByName(storeId: string, name: string): Promise<LoyaltyTier | undefined> {
    const [tier] = await db
      .select()
      .from(loyaltyTiers)
      .where(and(eq(loyaltyTiers.storeId, storeId), eq(loyaltyTiers.name, name)));
    return tier || undefined;
  }

  async getLoyaltyCustomers(storeId: string): Promise<Customer[]> {
    return await db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        phone: customers.phone,
        storeId: customers.storeId,
        loyaltyNumber: customers.loyaltyNumber,
        currentPoints: customers.currentPoints,
        lifetimePoints: customers.lifetimePoints,
        tierId: customers.tierId,
        isActive: customers.isActive,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        tier: {
          id: loyaltyTiers.id,
          name: loyaltyTiers.name,
          color: loyaltyTiers.color,
        },
      })
      .from(customers)
      .leftJoin(loyaltyTiers, eq(customers.tierId, loyaltyTiers.id))
      .where(eq(customers.storeId, storeId))
      .orderBy(desc(customers.createdAt));
  }

  async createLoyaltyCustomer(customer: InsertCustomer): Promise<Customer> {
    const [newCustomer] = await db.insert(customers).values(customer).returning();
    return newCustomer;
  }

  async getLoyaltyCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        phone: customers.phone,
        loyaltyNumber: customers.loyaltyNumber,
        currentPoints: customers.currentPoints,
        lifetimePoints: customers.lifetimePoints,
        tierId: customers.tierId,
        storeId: customers.storeId,
        isActive: customers.isActive,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        tier: {
          id: loyaltyTiers.id,
          name: loyaltyTiers.name,
          color: loyaltyTiers.color,
        },
      })
      .from(customers)
      .leftJoin(loyaltyTiers, eq(customers.tierId, loyaltyTiers.id))
      .where(eq(customers.id, id));
    return customer || undefined;
  }

  async updateLoyaltyCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer> {
    const [updatedCustomer] = await db
      .update(customers)
      .set({ ...customer, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return updatedCustomer;
  }

  async getCustomerByLoyaltyNumber(loyaltyNumber: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.loyaltyNumber, loyaltyNumber));
    return customer || undefined;
  }

  async createLoyaltyTransaction(transaction: InsertLoyaltyTransaction): Promise<LoyaltyTransaction> {
    const [newTransaction] = await db.insert(loyaltyTransactions).values(transaction).returning();
    return newTransaction;
  }

  async getLoyaltyTransactions(storeId: string, limit = 50): Promise<LoyaltyTransaction[]> {
    return await db
      .select({
        id: loyaltyTransactions.id,
        customerId: loyaltyTransactions.customerId,
        transactionId: loyaltyTransactions.transactionId,
        pointsEarned: loyaltyTransactions.pointsEarned,
        pointsRedeemed: loyaltyTransactions.pointsRedeemed,
        pointsBefore: loyaltyTransactions.pointsBefore,
        pointsAfter: loyaltyTransactions.pointsAfter,
        tierBefore: loyaltyTransactions.tierBefore,
        tierAfter: loyaltyTransactions.tierAfter,
        createdAt: loyaltyTransactions.createdAt,
        customer: {
          firstName: customers.firstName,
          lastName: customers.lastName,
        },
      })
      .from(loyaltyTransactions)
      .leftJoin(customers, eq(loyaltyTransactions.customerId, customers.id))
      .where(eq(customers.storeId, storeId))
      .orderBy(desc(loyaltyTransactions.createdAt))
      .limit(limit);
  }

  async getCustomerLoyaltyTransactions(customerId: string, limit = 50): Promise<LoyaltyTransaction[]> {
    return await db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.customerId, customerId))
      .orderBy(desc(loyaltyTransactions.createdAt))
      .limit(limit);
  }

  // Enhanced Loyalty Program Methods
  async searchLoyaltyCustomer(criteria: {
    loyaltyNumber?: string;
    email?: string;
    phone?: string;
  }): Promise<Customer | undefined> {
    const conditions = [];
    
    if (criteria.loyaltyNumber) {
      conditions.push(eq(customers.loyaltyNumber, criteria.loyaltyNumber));
    }
    if (criteria.email) {
      conditions.push(eq(customers.email, criteria.email));
    }
    if (criteria.phone) {
      conditions.push(eq(customers.phone, criteria.phone));
    }

    if (conditions.length === 0) return undefined;

    const [customer] = await db.select()
      .from(customers)
      .where(or(...conditions))
      .limit(1);

    return customer;
  }

  async adjustLoyaltyPoints(customerId: string, points: number, reason: string): Promise<any> {
    const customer = await this.getLoyaltyCustomer(customerId);
    if (!customer) throw new Error("Customer not found");

    const newPoints = customer.currentPoints + points;
    const newLifetimePoints = customer.lifetimePoints + Math.max(0, points);

    const updatedCustomer = await this.updateLoyaltyCustomer(customerId, {
      currentPoints: newPoints,
      lifetimePoints: newLifetimePoints,
    });

    // Create loyalty transaction record
    await this.createLoyaltyTransaction({
      customerId,
      transactionId: "refund-transaction-id", // In real app, link to actual transaction
      pointsEarned: Math.max(0, points),
      pointsRedeemed: Math.max(0, -points),
      pointsBefore: customer.currentPoints,
      pointsAfter: newPoints,
      tierBefore: customer.tierId,
      tierAfter: customer.tierId, // Would recalculate based on new points
    });

    return updatedCustomer;
  }

  async getLoyaltyReports(storeId: string): Promise<any> {
    const customers = await this.getLoyaltyCustomers(storeId);
    const tiers = await this.getLoyaltyTiers(storeId);

    const tierDistribution = tiers.map(tier => ({
      tier: tier.name,
      customers: customers.filter(c => c.tierId === tier.id).length,
    }));

    const totalPoints = customers.reduce((sum, c) => sum + c.currentPoints, 0);
    const averagePoints = customers.length > 0 ? totalPoints / customers.length : 0;

    return {
      totalCustomers: customers.length,
      totalPoints,
      averagePoints,
      tierDistribution,
      topCustomers: customers
        .sort((a, b) => b.currentPoints - a.currentPoints)
        .slice(0, 10),
    };
  }

  // Reporting Methods
  async generateSalesReport(storeId: string, startDate: Date, endDate: Date, format: string): Promise<any> {
    const salesData = await db.select({
      id: transactions.id,
      date: transactions.createdAt,
      total: transactions.total,
      items: sql`COUNT(${transactionItems.id})`,
    })
    .from(transactions)
    .leftJoin(transactionItems, eq(transactions.id, transactionItems.transactionId))
    .where(
      and(
        eq(transactions.storeId, storeId),
        eq(transactions.status, "completed"),
        gte(transactions.createdAt, startDate),
        lte(transactions.createdAt, endDate)
      )
    )
    .groupBy(transactions.id, transactions.createdAt, transactions.total)
    .orderBy(desc(transactions.createdAt));

    if (format === "csv") {
      const csvHeader = "Date,Transaction ID,Total,Items\n";
      const csvRows = salesData.map(t => 
        `${t.date?.toISOString().split('T')[0] || ''},${t.id},${t.total},${t.items}`
      ).join('\n');
      return csvHeader + csvRows;
    }

    return {
      period: { startDate, endDate },
      totalTransactions: salesData.length,
      totalRevenue: salesData.reduce((sum, t) => sum + parseFloat(t.total), 0),
      transactions: salesData,
    };
  }

  async generateInventoryReport(storeId: string, format: string): Promise<any> {
    const inventoryData = await db.select({
      productName: products.name,
      barcode: products.barcode,
      category: products.category,
      price: products.price,
      quantity: inventory.quantity,
      minStockLevel: inventory.minStockLevel,
      maxStockLevel: inventory.maxStockLevel,
      value: sql`${inventory.quantity} * ${products.price}`,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .where(eq(inventory.storeId, storeId))
    .orderBy(asc(products.name));

    if (format === "csv") {
      const csvHeader = "Product Name,Barcode,Category,Price,Quantity,Min Level,Max Level,Value\n";
      const csvRows = inventoryData.map(item => 
        `"${item.productName}","${item.barcode}","${item.category}",${item.price},${item.quantity},${item.minStockLevel},${item.maxStockLevel},${item.value}`
      ).join('\n');
      return csvHeader + csvRows;
    }

    return {
      totalItems: inventoryData.length,
      totalValue: inventoryData.reduce((sum, item) => sum + parseFloat(String(item.value)), 0),
      lowStockItems: inventoryData.filter(item => item.quantity <= (item.minStockLevel || 0)).length,
      outOfStockItems: inventoryData.filter(item => item.quantity === 0).length,
      inventory: inventoryData,
    };
  }

  async generateCustomerReport(storeId: string, format: string): Promise<any> {
    const customerData = await db.select({
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      phone: customers.phone,
      loyaltyNumber: customers.loyaltyNumber,
      currentPoints: customers.currentPoints,
      lifetimePoints: customers.lifetimePoints,
      tierName: loyaltyTiers.name,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .leftJoin(loyaltyTiers, eq(customers.tierId, loyaltyTiers.id))
    .where(eq(customers.storeId, storeId))
    .orderBy(asc(customers.firstName));

    if (format === "csv") {
      const csvHeader = "First Name,Last Name,Email,Phone,Loyalty Number,Current Points,Lifetime Points,Tier,Join Date\n";
      const csvRows = customerData.map(customer => 
        `"${customer.firstName}","${customer.lastName}","${customer.email || ''}","${customer.phone || ''}","${customer.loyaltyNumber}","${customer.currentPoints}","${customer.lifetimePoints}","${customer.tierName || ''}","${customer.createdAt?.toISOString().split('T')[0] || ''}"`
      ).join('\n');
      return csvHeader + csvRows;
    }

    return {
      totalCustomers: customerData.length,
      activeCustomers: customerData.filter(c => c.currentPoints > 0).length,
      averagePoints: customerData.reduce((sum, c) => sum + c.currentPoints, 0) / customerData.length,
      customers: customerData,
    };
  }

  // Export Methods
  async exportProducts(storeId: string, format: string): Promise<any> {
    const productData = await db.select()
      .from(products)
      .orderBy(asc(products.name));

    if (format === "csv") {
      const csvHeader = "Name,Barcode,Description,Price,Cost,Category,Brand,Active\n";
      const csvRows = productData.map(p => 
        `"${p.name}","${p.barcode || ''}","${p.description || ''}",${p.price},${p.cost || ''},"${p.category || ''}","${p.brand || ''}",${p.isActive}`
      ).join('\n');
      return csvHeader + csvRows;
    }

    return productData;
  }

  async exportTransactions(storeId: string, startDate: Date, endDate: Date, format: string): Promise<any> {
    const transactionData = await db.select({
      id: transactions.id,
      date: transactions.createdAt,
      total: transactions.total,
      paymentMethod: transactions.paymentMethod,
      status: transactions.status,
      cashierId: transactions.cashierId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.storeId, storeId),
        gte(transactions.createdAt, startDate),
        lte(transactions.createdAt, endDate)
      )
    )
    .orderBy(desc(transactions.createdAt));

    if (format === "csv") {
      const csvHeader = "Transaction ID,Date,Total,Payment Method,Status,Cashier ID\n";
      const csvRows = transactionData.map(t => 
        `${t.id},${t.date?.toISOString() || ''},${t.total},${t.paymentMethod},${t.status},${t.cashierId}`
      ).join('\n');
      return csvHeader + csvRows;
    }

    return transactionData;
  }

  // Settings Methods
  async getStoreSettings(storeId: string): Promise<any> {
    const store = await this.getStore(storeId);
    if (!store) throw new Error("Store not found");

    return {
      name: store.name,
      address: store.address,
      phone: store.phone,
      taxRate: store.taxRate,
      isActive: store.isActive,
      // Add more settings as needed
    };
  }

  async updateStoreSettings(storeId: string, settings: any): Promise<any> {
    const store = await this.updateStore(storeId, settings);
    return store;
  }

  // Dashboard Methods
  async getDashboardOverview(): Promise<any> {
    const totalStores = await db.select({ count: sql`COUNT(*)` }).from(stores);
    const totalProducts = await db.select({ count: sql`COUNT(*)` }).from(products);
    const totalUsers = await db.select({ count: sql`COUNT(*)` }).from(users);
    const totalCustomers = await db.select({ count: sql`COUNT(*)` }).from(customers);

    return {
      stores: parseInt(String(totalStores[0]?.count || "0")),
      products: parseInt(String(totalProducts[0]?.count || "0")),
      users: parseInt(String(totalUsers[0]?.count || "0")),
      customers: parseInt(String(totalCustomers[0]?.count || "0")),
    };
  }

  async getDashboardNotifications(): Promise<any[]> {
    // Get low stock alerts
    const alertData = await db.select()
      .from(lowStockAlerts)
      .where(eq(lowStockAlerts.isResolved, false))
      .limit(10);

    // Mock other notifications
    const notifications = [
      ...alertData.map(alert => ({
        id: alert.id,
        type: "low_stock",
        title: "Low Stock Alert",
        message: `Product ${alert.productId} is running low`,
        timestamp: alert.createdAt,
        priority: "high",
      })),
      {
        id: "1",
        type: "system",
        title: "System Update",
        message: "New features available in the latest update",
        timestamp: new Date(),
        priority: "medium",
      },
    ];

    return notifications;
  }

  // Analytics methods
  async getDailySales(storeId: string, date: Date): Promise<{ revenue: number; transactions: number }> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await db.select({
      revenue: sql`SUM(${transactions.total})`,
      transactions: sql`COUNT(*)`
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.storeId, storeId),
        eq(transactions.status, "completed"),
        gte(transactions.createdAt, startOfDay),
        lt(transactions.createdAt, endOfDay)
      )
    );

    return {
      revenue: parseFloat(String(result[0]?.revenue || "0")),
      transactions: parseInt(String(result[0]?.transactions || "0"))
    };
  }

  async getPopularProducts(storeId: string, limit = 10): Promise<Array<{ product: Product; salesCount: number }>> {
    const result = await db.select({
      productId: transactionItems.productId,
      salesCount: sql`COUNT(*)`,
      product: products
    })
    .from(transactionItems)
    .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
    .innerJoin(products, eq(transactionItems.productId, products.id))
    .where(
      and(
        eq(transactions.storeId, storeId),
        eq(transactions.status, "completed")
      )
    )
    .groupBy(transactionItems.productId, products.id)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);

    return result.map(row => ({
      product: row.product,
      salesCount: parseInt(String(row.salesCount))
    }));
  }

  async getStoreProfitLoss(storeId: string, startDate: Date, endDate: Date): Promise<{ revenue: number; cost: number; profit: number }> {
    const result = await db.select({
      revenue: sql`SUM(${transactions.total})`,
      cost: sql`SUM(${transactionItems.quantity} * ${products.cost})`
    })
    .from(transactions)
    .innerJoin(transactionItems, eq(transactions.id, transactionItems.transactionId))
    .innerJoin(products, eq(transactionItems.productId, products.id))
    .where(
      and(
        eq(transactions.storeId, storeId),
        eq(transactions.status, "completed"),
        gte(transactions.createdAt, startDate),
        lt(transactions.createdAt, endDate)
      )
    );

    const revenue = parseFloat(String(result[0]?.revenue || "0"));
    const cost = parseFloat(String(result[0]?.cost || "0"));
    const profit = revenue - cost;

    return { revenue, cost, profit };
  }

  async getStoreInventory(storeId: string): Promise<any> {
    const result = await db.select({
      product: products,
      inventory: inventory
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .where(eq(inventory.storeId, storeId));

    return result.map(row => ({
      ...row.inventory,
      product: row.product
    }));
  }
}

export const storage = new DatabaseStorage();
