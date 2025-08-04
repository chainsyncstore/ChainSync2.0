import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProductSchema, insertTransactionSchema, insertTransactionItemSchema } from "@shared/schema";
import { z } from "zod";
import session from "express-session";
import connectPg from "connect-pg-simple";

export async function registerRoutes(app: Express): Promise<Server> {
  // Session configuration
  const pgSession = connectPg(session);
  app.use(session({
    store: new pgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }));

  // Authentication middleware
  const authenticateUser = (req: any, res: any, next: any) => {
    if (req.session.user) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  };

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.authenticateUser(username, password);
      
      if (user) {
        req.session.user = user;
        res.json(user);
      } else {
        res.status(401).json({ message: "Invalid credentials" });
      }
    } catch (error) {
      console.error("Authentication error:", error);
      res.status(500).json({ message: "Authentication failed" });
    }
  });

  app.get("/api/auth/me", (req: any, res) => {
    if (req.session.user) {
      res.json(req.session.user);
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  app.post("/api/auth/logout", (req: any, res) => {
    req.session.destroy((err: any) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });
  // Store routes
  app.get("/api/stores", async (req, res) => {
    try {
      const stores = await storage.getAllStores();
      res.json(stores);
    } catch (error) {
      console.error("Error fetching stores:", error);
      res.status(500).json({ message: "Failed to fetch stores" });
    }
  });

  // Store-specific routes (must come before generic :id route)
  app.get("/api/stores/:storeId/alerts", async (req, res) => {
    try {
      const alerts = await storage.getLowStockAlerts(req.params.storeId);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.get("/api/stores/:storeId/analytics/daily-sales", async (req, res) => {
    try {
      const date = req.query.date ? new Date(req.query.date as string) : new Date();
      const dailySales = await storage.getDailySales(req.params.storeId, date);
      res.json(dailySales);
    } catch (error) {
      console.error("Error fetching daily sales:", error);
      res.status(500).json({ message: "Failed to fetch daily sales" });
    }
  });

  app.get("/api/stores/:storeId/analytics/popular-products", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const popularProducts = await storage.getPopularProducts(req.params.storeId, limit);
      res.json(popularProducts);
    } catch (error) {
      console.error("Error fetching popular products:", error);
      res.status(500).json({ message: "Failed to fetch popular products" });
    }
  });

  app.get("/api/stores/:storeId/analytics/profit-loss", async (req, res) => {
    try {
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      
      const profitLoss = await storage.getStoreProfitLoss(req.params.storeId, startDate, endDate);
      res.json(profitLoss);
    } catch (error) {
      console.error("Error fetching profit/loss:", error);
      res.status(500).json({ message: "Failed to fetch profit/loss data" });
    }
  });

  app.get("/api/stores/:storeId/inventory", async (req, res) => {
    try {
      const inventory = await storage.getStoreInventory(req.params.storeId);
      res.json(inventory);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ message: "Failed to fetch inventory" });
    }
  });

  app.get("/api/stores/:id", async (req, res) => {
    try {
      const store = await storage.getStore(req.params.id);
      if (!store) {
        return res.status(404).json({ message: "Store not found" });
      }
      res.json(store);
    } catch (error) {
      console.error("Error fetching store:", error);
      res.status(500).json({ message: "Failed to fetch store" });
    }
  });

  // Product routes
  app.get("/api/products", async (req, res) => {
    try {
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/products/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ message: "Search query is required" });
      }
      const products = await storage.searchProducts(query);
      res.json(products);
    } catch (error) {
      console.error("Error searching products:", error);
      res.status(500).json({ message: "Failed to search products" });
    }
  });

  app.get("/api/products/barcode/:barcode", async (req, res) => {
    try {
      const product = await storage.getProductByBarcode(req.params.barcode);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product by barcode:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(productData);
      res.status(201).json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      console.error("Error creating product:", error);
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  // Inventory routes
  app.get("/api/stores/:storeId/inventory", async (req, res) => {
    try {
      const inventory = await storage.getInventoryByStore(req.params.storeId);
      res.json(inventory);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ message: "Failed to fetch inventory" });
    }
  });

  app.get("/api/stores/:storeId/inventory/low-stock", async (req, res) => {
    try {
      const lowStockItems = await storage.getLowStockItems(req.params.storeId);
      res.json(lowStockItems);
    } catch (error) {
      console.error("Error fetching low stock items:", error);
      res.status(500).json({ message: "Failed to fetch low stock items" });
    }
  });

  app.put("/api/stores/:storeId/inventory/:productId", async (req, res) => {
    try {
      const { storeId, productId } = req.params;
      const { quantity } = req.body;
      
      if (typeof quantity !== "number") {
        return res.status(400).json({ message: "Quantity must be a number" });
      }

      const inventory = await storage.updateInventory(productId, storeId, { quantity });
      res.json(inventory);
    } catch (error) {
      console.error("Error updating inventory:", error);
      res.status(500).json({ message: "Failed to update inventory" });
    }
  });

  // Transaction routes
  app.post("/api/transactions", async (req, res) => {
    try {
      const transactionData = insertTransactionSchema.parse(req.body);
      
      // Generate receipt number
      const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      const transaction = await storage.createTransaction({
        ...transactionData,
        receiptNumber,
      });
      
      res.status(201).json(transaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid transaction data", errors: error.errors });
      }
      console.error("Error creating transaction:", error);
      res.status(500).json({ message: "Failed to create transaction" });
    }
  });

  app.post("/api/transactions/:transactionId/items", async (req, res) => {
    try {
      const itemData = insertTransactionItemSchema.parse({
        ...req.body,
        transactionId: req.params.transactionId,
      });
      
      const item = await storage.addTransactionItem(itemData);
      
      // Update inventory
      await storage.adjustInventory(itemData.productId, req.body.storeId, -itemData.quantity);
      
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid item data", errors: error.errors });
      }
      console.error("Error adding transaction item:", error);
      res.status(500).json({ message: "Failed to add transaction item" });
    }
  });

  app.put("/api/transactions/:transactionId/complete", async (req, res) => {
    try {
      const transaction = await storage.updateTransaction(req.params.transactionId, {
        status: "completed" as const,
        completedAt: new Date(),
      });
      res.json(transaction);
    } catch (error) {
      console.error("Error completing transaction:", error);
      res.status(500).json({ message: "Failed to complete transaction" });
    }
  });

  app.put("/api/transactions/:transactionId/void", async (req, res) => {
    try {
      // Get transaction items to restore inventory
      const items = await storage.getTransactionItems(req.params.transactionId);
      
      // Restore inventory for each item
      for (const item of items) {
        await storage.adjustInventory(item.productId, req.body.storeId, item.quantity);
      }
      
      const transaction = await storage.updateTransaction(req.params.transactionId, {
        status: "voided",
      });
      
      res.json(transaction);
    } catch (error) {
      console.error("Error voiding transaction:", error);
      res.status(500).json({ message: "Failed to void transaction" });
    }
  });

  app.get("/api/stores/:storeId/transactions", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const transactions = await storage.getTransactionsByStore(req.params.storeId, limit);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Remove duplicate routes - they're already defined above

  app.put("/api/alerts/:alertId/resolve", async (req, res) => {
    try {
      await storage.resolveLowStockAlert(req.params.alertId);
      res.json({ message: "Alert resolved successfully" });
    } catch (error) {
      console.error("Error resolving alert:", error);
      res.status(500).json({ message: "Failed to resolve alert" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
