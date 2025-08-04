import {
  users,
  stores,
  products,
  inventory,
  transactions,
  transactionItems,
  userStorePermissions,
  lowStockAlerts,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, lt, gte, between } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
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

  // Alert operations
  createLowStockAlert(alert: InsertLowStockAlert): Promise<LowStockAlert>;
  getLowStockAlerts(storeId: string): Promise<LowStockAlert[]>;
  resolveLowStockAlert(id: string): Promise<void>;
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
      return await this.getStores();
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
      
      const stores = await db.select().from(stores).where(
        sql`${stores.id} = ANY(${storeIds})`
      );
      return stores;
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
          sql`${products.name} ILIKE ${`%${query}%`} OR ${products.barcode} ILIKE ${`%${query}%`}`
        )
      );
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

  // Analytics operations
  async getDailySales(storeId: string, date: Date): Promise<{ revenue: number; transactions: number }> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [result] = await db
      .select({
        revenue: sql<number>`COALESCE(SUM(${transactions.total}), 0)`,
        transactions: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.storeId, storeId),
          eq(transactions.status, "completed"),
          between(transactions.createdAt, startOfDay, endOfDay)
        )
      );

    return {
      revenue: Number(result.revenue) || 0,
      transactions: Number(result.transactions) || 0,
    };
  }

  async getPopularProducts(storeId: string, limit = 10): Promise<Array<{ product: Product; salesCount: number }>> {
    const results = await db
      .select({
        product: products,
        salesCount: sql<number>`SUM(${transactionItems.quantity})`,
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
      .groupBy(products.id)
      .orderBy(desc(sql`SUM(${transactionItems.quantity})`))
      .limit(limit);

    return results.map(r => ({
      product: r.product,
      salesCount: Number(r.salesCount) || 0,
    }));
  }

  async getStoreProfitLoss(storeId: string, startDate: Date, endDate: Date): Promise<{ revenue: number; cost: number; profit: number }> {
    const [result] = await db
      .select({
        revenue: sql<number>`COALESCE(SUM(${transactions.total}), 0)`,
        cost: sql<number>`COALESCE(SUM(${transactionItems.quantity} * ${products.cost}), 0)`,
      })
      .from(transactions)
      .innerJoin(transactionItems, eq(transactions.id, transactionItems.transactionId))
      .innerJoin(products, eq(transactionItems.productId, products.id))
      .where(
        and(
          eq(transactions.storeId, storeId),
          eq(transactions.status, "completed"),
          between(transactions.createdAt, startDate, endDate)
        )
      );

    const revenue = Number(result.revenue) || 0;
    const cost = Number(result.cost) || 0;
    const profit = revenue - cost;

    return { revenue, cost, profit };
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
}

export const storage = new DatabaseStorage();
