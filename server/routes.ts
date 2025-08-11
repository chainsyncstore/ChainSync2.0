import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { AuthService } from "./auth";
import { 
  insertProductSchema, 
  insertTransactionSchema, 
  insertTransactionItemSchema,
  insertLoyaltyTierSchema,
  insertCustomerSchema,
  insertLoyaltyTransactionSchema,
  insertUserSchema,
  type User
} from "@shared/schema";
import { z } from "zod";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { eq, desc } from "drizzle-orm";
import { forecastModels } from "@shared/schema";
import { db } from "./db";
import { OpenAIService } from "./openai/service";
import { PaymentService } from "./payment/service";
import { 
  sendErrorResponse, 
  sendSuccessResponse, 
  handleAsyncError,
  AppError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError,
  PaymentError
} from "./lib/errors";
import { 
  performanceMiddleware, 
  getPerformanceMetrics, 
  clearPerformanceMetrics 
} from "./lib/performance";
import { logger, extractLogContext } from "./lib/logger";
import { monitoringService } from "./lib/monitoring";

// Extend the session interface
declare module "express-session" {
  interface SessionData {
    user: User;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Validate required environment variables
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is required for production');
  }

  // Add performance monitoring middleware
  app.use(performanceMiddleware);

  // Session configuration
  const pgSession = connectPg(session);
  app.use(session({
    store: new pgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // Secure in production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict',
    },
    name: 'chainsync.sid', // Custom session name
  }));

  // Authentication middleware
  const authenticateUser = (req: any, res: any, next: any) => {
    if (req.session.user) {
      next();
    } else {
      sendErrorResponse(res, new AuthenticationError(), req.path);
    }
  };

  // Authentication routes
  app.post("/api/auth/login", handleAsyncError(async (req, res) => {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      throw new ValidationError("Username and password are required");
    }
    
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const logContext = extractLogContext(req, { ipAddress });
    
    try {
      const user = await storage.authenticateUser(username, password, ipAddress);
      
      if (user) {
        // Sanitize user data before storing in session
        const sanitizedUser = AuthService.sanitizeUserForSession(user);
        req.session.user = sanitizedUser;
        
        // Log successful login
        logger.logAuthEvent('login', { ...logContext, userId: user.id, storeId: user.storeId });
        monitoringService.recordAuthEvent('login', { ...logContext, userId: user.id, storeId: user.storeId });
        
        sendSuccessResponse(res, sanitizedUser, "Login successful");
      } else {
        // Log failed login attempt
        logger.logAuthEvent('login_failed', logContext);
        monitoringService.recordAuthEvent('login_failed', logContext);
        
        throw new AuthenticationError("Invalid credentials or IP not whitelisted");
      }
    } catch (error) {
      // Log failed login attempt
      logger.logAuthEvent('login_failed', logContext);
      monitoringService.recordAuthEvent('login_failed', logContext);
      throw error;
    }
  }));

  app.get("/api/auth/me", (req: any, res) => {
    if (req.session.user) {
      sendSuccessResponse(res, req.session.user);
    } else {
      sendErrorResponse(res, new AuthenticationError("Not authenticated"), req.path);
    }
  });

  app.post("/api/auth/logout", (req: any, res) => {
    const logContext = extractLogContext(req);
    
    req.session.destroy((err: any) => {
      if (err) {
        logger.error("Logout error", logContext, err);
        sendErrorResponse(res, new AppError("Logout failed", 500), req.path);
      } else {
        logger.logAuthEvent('logout', logContext);
        sendSuccessResponse(res, null, "Logged out successfully");
      }
    });
  });

  // Signup route
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { firstName, lastName, email, phone, companyName, password, tier, location } = req.body;
      
      // Validate required fields
      if (!firstName || !lastName || !email || !phone || !companyName || !password || !tier || !location) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Validate password strength
      const passwordValidation = AuthService.validatePassword(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({ 
          message: "Password does not meet security requirements",
          errors: passwordValidation.errors 
        });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User with this email already exists" });
      }

      // Create user account with hashed password
      const user = await storage.createUser({
        username: email,
        password: password, // Will be hashed in storage.createUser
        email,
        firstName,
        lastName,
        phone,
        companyName,
        role: "admin", // Default role for new signups
        tier,
        location,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks trial
        isActive: true
      });

      // Create default store for the user
      const store = await storage.createStore({
        name: companyName,
        ownerId: user.id,
        address: "",
        phone: phone,
        email: email,
        isActive: true
      });

      res.status(201).json({ 
        message: "Account created successfully",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          tier: user.tier,
          trialEndsAt: user.trialEndsAt
        },
        store: {
          id: store.id,
          name: store.name
        }
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  // Forgot password route
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Check if user exists
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if user exists or not for security
        return res.json({ message: "If an account with that email exists, a password reset link has been sent." });
      }

      // Create password reset token
      const resetToken = await storage.createPasswordResetToken(user.id);
      
      // Send email
      const { sendEmail, generatePasswordResetEmail } = await import('./email.js');
      const emailOptions = generatePasswordResetEmail(
        user.email!, 
        resetToken.token, 
        user.firstName || user.username
      );
      
      const emailSent = await sendEmail(emailOptions);
      
      if (emailSent) {
        res.json({ message: "If an account with that email exists, a password reset link has been sent." });
      } else {
        res.status(500).json({ message: "Failed to send password reset email" });
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  // Reset password route
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      // Validate password strength
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }

      // Get reset token
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Check if token is expired
      if (new Date() > resetToken.expiresAt) {
        await storage.invalidatePasswordResetToken(token);
        return res.status(400).json({ message: "Reset token has expired" });
      }

      // Check if token has been used
      if (resetToken.isUsed) {
        return res.status(400).json({ message: "Reset token has already been used" });
      }

      // Update user password
      const user = await storage.updateUserPassword(resetToken.userId, newPassword);
      
      // Invalidate the token
      await storage.invalidatePasswordResetToken(token);
      
      // Send confirmation email
      const { sendEmail, generatePasswordResetSuccessEmail } = await import('./email.js');
      const emailOptions = generatePasswordResetSuccessEmail(
        user.email!, 
        user.firstName || user.username
      );
      
      await sendEmail(emailOptions);
      
      res.json({ message: "Password has been successfully reset" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Validate reset token route
  app.get("/api/auth/validate-reset-token/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ message: "Invalid reset token" });
      }

      // Check if token is expired
      if (new Date() > resetToken.expiresAt) {
        await storage.invalidatePasswordResetToken(token);
        return res.status(400).json({ message: "Reset token has expired" });
      }

      // Check if token has been used
      if (resetToken.isUsed) {
        return res.status(400).json({ message: "Reset token has already been used" });
      }

      res.json({ message: "Token is valid" });
    } catch (error) {
      console.error("Validate token error:", error);
      res.status(500).json({ message: "Failed to validate token" });
    }
  });

  // Payment initialization route
  app.post("/api/payment/initialize", async (req, res) => {
    try {
      const { email, amount, currency, provider, tier, metadata } = req.body;
      const logContext = extractLogContext(req, { email, amount, provider, tier });
      
      if (!email || !amount || !currency || !provider || !tier) {
        return res.status(400).json({ message: "Missing required payment parameters" });
      }

      const paymentService = new PaymentService();
      const reference = paymentService.generateReference(provider as 'paystack' | 'flutterwave');
      
      // Ensure callback URL is properly set for both development and production
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const callbackUrl = `${baseUrl}/payment/callback`;
      
      console.log(`Setting callback URL: ${callbackUrl} for ${provider} payment`);
      
      const paymentRequest = {
        email,
        amount,
        currency,
        reference,
        callback_url: callbackUrl,
        metadata: {
          ...metadata,
          tier,
          provider
        }
      };

      let paymentResponse;
      
      if (provider === 'paystack') {
        // Use mock payment for development
        if (process.env.NODE_ENV === 'development') {
          paymentResponse = await paymentService.mockPaystackPayment(paymentRequest);
        } else {
          paymentResponse = await paymentService.initializePaystackPayment(paymentRequest);
        }
      } else if (provider === 'flutterwave') {
        // Use mock payment for development
        if (process.env.NODE_ENV === 'development') {
          paymentResponse = await paymentService.mockFlutterwavePayment(paymentRequest);
        } else {
          paymentResponse = await paymentService.initializeFlutterwavePayment(paymentRequest);
        }
      } else {
        return res.status(400).json({ message: "Unsupported payment provider" });
      }

      // Log payment initiation
      logger.logPaymentEvent('initiated', amount, { ...logContext, reference, callbackUrl });
      monitoringService.recordPaymentEvent('initiated', amount, { ...logContext, reference, callbackUrl });

      res.json(paymentResponse.data);
    } catch (error) {
      logger.error("Payment initialization error", extractLogContext(req), error);
      res.status(500).json({ message: "Failed to initialize payment" });
    }
  });

  // Payment verification route
  app.post("/api/payment/verify", handleAsyncError(async (req, res) => {
    const { reference, status } = req.body;
    const logContext = extractLogContext(req, { reference, status });
    
    if (!reference) {
      throw new ValidationError("Payment reference is required");
    }

    console.log(`Payment verification requested for reference: ${reference}, status: ${status}`);
    
    const paymentService = new PaymentService();
    
    // Determine provider from reference
    const provider = reference.startsWith('PAYSTACK') ? 'paystack' : 'flutterwave';
    console.log(`Detected payment provider: ${provider} for reference: ${reference}`);
    
    let isPaymentSuccessful = false;
    
    try {
      if (provider === 'paystack') {
        console.log(`Verifying Paystack payment for reference: ${reference}`);
        isPaymentSuccessful = await paymentService.verifyPaystackPayment(reference);
      } else if (provider === 'flutterwave') {
        console.log(`Verifying Flutterwave payment for reference: ${reference}`);
        isPaymentSuccessful = await paymentService.verifyFlutterwavePayment(reference);
      }
      
      console.log(`Payment verification result: ${isPaymentSuccessful ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
      console.error(`Payment verification error for ${provider}:`, error);
      // Payment service errors are already PaymentError instances
      throw error;
    }

    if (isPaymentSuccessful) {
      // Update user subscription status
      // In production, you would update the user's subscription status in the database
      logger.logPaymentEvent('completed', undefined, { ...logContext, provider });
      monitoringService.recordPaymentEvent('completed', undefined, { ...logContext, provider });
      
      console.log(`Payment completed successfully for ${provider} reference: ${reference}`);
      sendSuccessResponse(res, { success: true }, "Payment verified successfully");
    } else {
      logger.logPaymentEvent('failed', undefined, { ...logContext, provider });
      monitoringService.recordPaymentEvent('failed', undefined, { ...logContext, provider });
      
      console.log(`Payment verification failed for ${provider} reference: ${reference}`);
      throw new PaymentError("Payment verification failed", { reference, provider });
    }
  }));

  // Payment webhook route (for handling payment confirmations)
  app.post("/api/payment/webhook", async (req, res) => {
    try {
      const { reference, status, provider } = req.body;
      
      // In production, verify the webhook signature
      // For now, we'll just log the payment status
      console.log(`Payment webhook received: ${provider} - ${reference} - ${status}`);
      
      if (status === 'success' || status === 'successful') {
        // Update user subscription status
        // await storage.updateUserSubscription(reference, 'active');
        console.log(`Payment successful for reference: ${reference}`);
      }
      
      res.json({ status: 'success' });
    } catch (error) {
      console.error("Payment webhook error:", error);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  // Paystack-specific webhook endpoint
  app.post("/api/payment/paystack-webhook", async (req, res) => {
    try {
      console.log('Paystack webhook received:', req.body);
      
      // In production, verify the webhook signature using Paystack's secret key
      // For now, we'll process the webhook data
      const { event, data } = req.body;
      
      if (event === 'charge.success') {
        const { reference, amount, status, customer } = data;
        console.log(`Paystack payment successful: ${reference}, amount: ${amount}, status: ${status}`);
        
        // Here you would:
        // 1. Verify the payment with Paystack API
        // 2. Update user subscription status
        // 3. Send confirmation email
        // 4. Log the successful payment
        
        // For now, just log it
        logger.logPaymentEvent('webhook_success', amount, { reference, provider: 'paystack', customer: customer?.email });
        monitoringService.recordPaymentEvent('webhook_success', amount, { reference, provider: 'paystack' });
      }
      
      // Always respond with 200 to acknowledge receipt
      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error("Paystack webhook error:", error);
      // Still respond with 200 to prevent webhook retries
      res.status(200).json({ status: 'error', message: "Webhook processing failed" });
    }
  });

  // Flutterwave-specific webhook endpoint
  app.post("/api/payment/flutterwave-webhook", async (req, res) => {
    try {
      console.log('Flutterwave webhook received:', req.body);
      
      // In production, verify the webhook signature using Flutterwave's secret hash
      // For now, we'll process the webhook data
      const { event, data } = req.body;
      
      if (event === 'charge.completed') {
        const { tx_ref, amount, status, customer } = data;
        console.log(`Flutterwave payment successful: ${tx_ref}, amount: ${amount}, status: ${status}`);
        
        // Here you would:
        // 1. Verify the payment with Flutterwave API
        // 2. Update user subscription status
        // 3. Send confirmation email
        // 4. Log the successful payment
        
        // For now, just log it
        logger.logPaymentEvent('webhook_success', amount, { reference: tx_ref, provider: 'flutterwave', customer: customer?.email });
        monitoringService.recordPaymentEvent('webhook_success', amount, { reference: tx_ref, provider: 'flutterwave' });
      }
      
      // Always respond with 200 to acknowledge receipt
      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error("Flutterwave webhook error:", error);
      // Still respond with 200 to prevent webhook retries
      res.status(200).json({ status: 'error', message: "Webhook processing failed" });
    }
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
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      
      // Get total count for pagination metadata
      const totalCount = await storage.getProductsCount();
      const products = await storage.getProductsPaginated(limit, offset);
      
      res.json({
        data: products,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrev: page > 1
        }
      });
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

  app.get("/api/products/sku/:sku", async (req, res) => {
    try {
      const product = await storage.getProductBySku(req.params.sku);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product by SKU:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.post("/api/products", handleAsyncError(async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(productData);
      sendSuccessResponse(res, product, "Product created successfully", 201);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError("Invalid product data", error.errors);
      }
      throw error;
    }
  }));

  // Enhanced Product Management Routes
  app.put("/api/products/:id", handleAsyncError(async (req, res) => {
    try {
      const productData = insertProductSchema.partial().parse(req.body);
      const product = await storage.updateProduct(req.params.id, productData);
      if (!product) {
        throw new NotFoundError("Product not found");
      }
      sendSuccessResponse(res, product, "Product updated successfully");
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError("Invalid product data", error.errors);
      }
      throw error;
    }
  }));

  app.delete("/api/products/:id", async (req, res) => {
    try {
      await storage.deleteProduct(req.params.id);
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  app.get("/api/products/categories", async (req, res) => {
    try {
      const categories = await storage.getProductCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.get("/api/products/brands", async (req, res) => {
    try {
      const brands = await storage.getProductBrands();
      res.json(brands);
    } catch (error) {
      console.error("Error fetching brands:", error);
      res.status(500).json({ message: "Failed to fetch brands" });
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

  app.put("/api/stores/:storeId/inventory/:productId", handleAsyncError(async (req, res) => {
    try {
      const { storeId, productId } = req.params;
      const { quantity, adjustmentData } = req.body;
      const logContext = extractLogContext(req, { storeId, productId });
      
      // Validate quantity
      if (typeof quantity !== "number" || quantity < 0) {
        throw new ValidationError("Quantity must be a non-negative number");
      }

      // Validate adjustment data if provided
      if (adjustmentData) {
        enhancedStockAdjustmentSchema.parse(adjustmentData);
      }

      const inventory = await storage.updateInventory(productId, storeId, { quantity });
      
      // Log inventory update
      logger.logInventoryEvent('stock_adjusted', { ...logContext, quantity });
      monitoringService.recordInventoryEvent('updated', { ...logContext, quantity });
      
      sendSuccessResponse(res, inventory, "Inventory updated successfully");
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError("Invalid adjustment data", error.errors);
      }
      throw error;
    }
  }));

  // Enhanced Inventory Management Routes
  app.post("/api/stores/:storeId/inventory/bulk-update", async (req, res) => {
    try {
      const { updates } = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ message: "Updates must be an array" });
      }

      const results = await storage.bulkUpdateInventory(req.params.storeId, updates);
      res.json(results);
    } catch (error) {
      console.error("Error bulk updating inventory:", error);
      res.status(500).json({ message: "Failed to bulk update inventory" });
    }
  });

  app.get("/api/stores/:storeId/inventory/stock-movements", async (req, res) => {
    try {
      const movements = await storage.getStockMovements(req.params.storeId);
      res.json(movements);
    } catch (error) {
      console.error("Error fetching stock movements:", error);
      res.status(500).json({ message: "Failed to fetch stock movements" });
    }
  });

  app.post("/api/stores/:storeId/inventory/stock-count", async (req, res) => {
    try {
      const { items } = req.body;
      const results = await storage.performStockCount(req.params.storeId, items);
      res.json(results);
    } catch (error) {
      console.error("Error performing stock count:", error);
      res.status(500).json({ message: "Failed to perform stock count" });
    }
  });

  // Transaction routes
  app.post("/api/transactions", async (req, res) => {
    try {
      const transactionData = insertTransactionSchema.parse(req.body);
      const logContext = extractLogContext(req, { storeId: transactionData.storeId });
      
      // Generate receipt number
      const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      const transaction = await storage.createTransaction({
        ...transactionData,
        receiptNumber,
      });
      
      // Log transaction creation
      logger.logTransactionEvent('created', undefined, { ...logContext, transactionId: transaction.id });
      monitoringService.recordTransactionEvent('created', undefined, { ...logContext, transactionId: transaction.id });
      
      res.status(201).json(transaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid transaction data", errors: error.errors });
      }
      logger.error("Error creating transaction", extractLogContext(req), error);
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
      const logContext = extractLogContext(req, { transactionId: req.params.transactionId });
      
      const transaction = await storage.updateTransaction(req.params.transactionId, {
        status: "completed" as const,
        completedAt: new Date(),
      });
      
      // Log transaction completion
      const totalAmount = transaction.totalAmount || 0;
      logger.logTransactionEvent('completed', totalAmount, { ...logContext, storeId: transaction.storeId });
      monitoringService.recordTransactionEvent('completed', totalAmount, { ...logContext, storeId: transaction.storeId });
      
      res.json(transaction);
    } catch (error) {
      logger.error("Error completing transaction", extractLogContext(req), error);
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
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      
      // Get total count for pagination metadata
      const totalCount = await storage.getTransactionsCountByStore(req.params.storeId);
      const transactions = await storage.getTransactionsByStorePaginated(req.params.storeId, limit, offset);
      
      res.json({
        data: transactions,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrev: page > 1
        }
      });
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Enhanced Transaction Management Routes
  app.get("/api/transactions/:id", async (req, res) => {
    try {
      const transaction = await storage.getTransaction(req.params.id);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      res.json(transaction);
    } catch (error) {
      console.error("Error fetching transaction:", error);
      res.status(500).json({ message: "Failed to fetch transaction" });
    }
  });

  app.post("/api/transactions/:id/refund", async (req, res) => {
    try {
      const { items, reason } = req.body;
      const refund = await storage.createRefund(req.params.id, items, reason);
      res.status(201).json(refund);
    } catch (error) {
      console.error("Error creating refund:", error);
      res.status(500).json({ message: "Failed to create refund" });
    }
  });

  app.get("/api/stores/:storeId/transactions/returns", async (req, res) => {
    try {
      const returns = await storage.getReturns(req.params.storeId);
      res.json(returns);
    } catch (error) {
      console.error("Error fetching returns:", error);
      res.status(500).json({ message: "Failed to fetch returns" });
    }
  });

  // Enhanced Analytics Routes
  app.get("/api/stores/:storeId/analytics/sales", async (req, res) => {
    try {
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      
      const salesData = await storage.getSalesData(req.params.storeId, startDate, endDate);
      res.json(salesData);
    } catch (error) {
      console.error("Error fetching sales data:", error);
      res.status(500).json({ message: "Failed to fetch sales data" });
    }
  });

  app.get("/api/stores/:storeId/analytics/inventory-value", async (req, res) => {
    try {
      const inventoryValue = await storage.getInventoryValue(req.params.storeId);
      res.json(inventoryValue);
    } catch (error) {
      console.error("Error fetching inventory value:", error);
      res.status(500).json({ message: "Failed to fetch inventory value" });
    }
  });

  app.get("/api/stores/:storeId/analytics/customer-insights", async (req, res) => {
    try {
      const insights = await storage.getCustomerInsights(req.params.storeId);
      res.json(insights);
    } catch (error) {
      console.error("Error fetching customer insights:", error);
      res.status(500).json({ message: "Failed to fetch customer insights" });
    }
  });

  app.get("/api/stores/:storeId/analytics/employee-performance", async (req, res) => {
    try {
      const performance = await storage.getEmployeePerformance(req.params.storeId);
      res.json(performance);
    } catch (error) {
      console.error("Error fetching employee performance:", error);
      res.status(500).json({ message: "Failed to fetch employee performance" });
    }
  });

  // Loyalty Program Routes
  app.get("/api/stores/:storeId/loyalty/tiers", async (req, res) => {
    try {
      const tiers = await storage.getLoyaltyTiers(req.params.storeId);
      res.json(tiers);
    } catch (error) {
      console.error("Error fetching loyalty tiers:", error);
      res.status(500).json({ message: "Failed to fetch loyalty tiers" });
    }
  });

  app.post("/api/stores/:storeId/loyalty/tiers", async (req, res) => {
    try {
      const tierData = insertLoyaltyTierSchema.parse({
        ...req.body,
        storeId: req.params.storeId,
      });
      const tier = await storage.createLoyaltyTier(tierData);
      res.status(201).json(tier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid tier data", errors: error.errors });
      }
      console.error("Error creating loyalty tier:", error);
      res.status(500).json({ message: "Failed to create loyalty tier" });
    }
  });

  app.put("/api/loyalty/tiers/:tierId", async (req, res) => {
    try {
      const tier = await storage.updateLoyaltyTier(req.params.tierId, req.body);
      res.json(tier);
    } catch (error) {
      console.error("Error updating loyalty tier:", error);
      res.status(500).json({ message: "Failed to update loyalty tier" });
    }
  });

  app.delete("/api/loyalty/tiers/:tierId", async (req, res) => {
    try {
      await storage.deleteLoyaltyTier(req.params.tierId);
      res.json({ message: "Tier deleted successfully" });
    } catch (error) {
      console.error("Error deleting loyalty tier:", error);
      res.status(500).json({ message: "Failed to delete loyalty tier" });
    }
  });

  app.get("/api/stores/:storeId/loyalty/customers", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      
      // Get total count for pagination metadata
      const totalCount = await storage.getLoyaltyCustomersCount(req.params.storeId);
      const customers = await storage.getLoyaltyCustomersPaginated(req.params.storeId, limit, offset);
      
      res.json({
        data: customers,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrev: page > 1
        }
      });
    } catch (error) {
      console.error("Error fetching loyalty customers:", error);
      res.status(500).json({ message: "Failed to fetch loyalty customers" });
    }
  });

  app.post("/api/stores/:storeId/loyalty/customers", handleAsyncError(async (req, res) => {
    try {
      const customerData = insertCustomerSchema.parse({
        ...req.body,
        storeId: req.params.storeId,
      });
      
      // Generate loyalty number
      const loyaltyNumber = `LOY${Date.now().toString().slice(-6)}`;
      
      const customer = await storage.createLoyaltyCustomer({
        ...customerData,
        loyaltyNumber,
      });
      sendSuccessResponse(res, customer, "Customer created successfully", 201);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError("Invalid customer data", error.errors);
      }
      throw error;
    }
  }));

  app.get("/api/loyalty/customers/:customerId", async (req, res) => {
    try {
      const customer = await storage.getLoyaltyCustomer(req.params.customerId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      console.error("Error fetching loyalty customer:", error);
      res.status(500).json({ message: "Failed to fetch loyalty customer" });
    }
  });

  app.put("/api/loyalty/customers/:customerId", async (req, res) => {
    try {
      const customer = await storage.updateLoyaltyCustomer(req.params.customerId, req.body);
      res.json(customer);
    } catch (error) {
      console.error("Error updating loyalty customer:", error);
      res.status(500).json({ message: "Failed to update loyalty customer" });
    }
  });

  app.post("/api/loyalty/transactions", async (req, res) => {
    try {
      const transactionData = insertLoyaltyTransactionSchema.parse(req.body);
      const transaction = await storage.createLoyaltyTransaction(transactionData);
      res.status(201).json(transaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid loyalty transaction data", errors: error.errors });
      }
      console.error("Error creating loyalty transaction:", error);
      res.status(500).json({ message: "Failed to create loyalty transaction" });
    }
  });

  app.get("/api/stores/:storeId/loyalty/transactions", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      
      // Get total count for pagination metadata
      const totalCount = await storage.getLoyaltyTransactionsCount(req.params.storeId);
      const transactions = await storage.getLoyaltyTransactionsPaginated(req.params.storeId, limit, offset);
      
      res.json({
        data: transactions,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrev: page > 1
        }
      });
    } catch (error) {
      console.error("Error fetching loyalty transactions:", error);
      res.status(500).json({ message: "Failed to fetch loyalty transactions" });
    }
  });

  app.get("/api/loyalty/customers/:customerId/transactions", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const transactions = await storage.getCustomerLoyaltyTransactions(req.params.customerId, limit);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching customer loyalty transactions:", error);
      res.status(500).json({ message: "Failed to fetch customer loyalty transactions" });
    }
  });

  // Enhanced Loyalty Program Routes
  app.get("/api/loyalty/customers/search", async (req, res) => {
    try {
      const { loyaltyNumber, email, phone } = req.query;
      const customer = await storage.searchLoyaltyCustomer({
        loyaltyNumber: loyaltyNumber as string,
        email: email as string,
        phone: phone as string,
      });
      res.json(customer);
    } catch (error) {
      console.error("Error searching loyalty customer:", error);
      res.status(500).json({ message: "Failed to search customer" });
    }
  });

  app.post("/api/loyalty/customers/:customerId/points", async (req, res) => {
    try {
      const { points, reason } = req.body;
      const result = await storage.adjustLoyaltyPoints(req.params.customerId, points, reason);
      res.json(result);
    } catch (error) {
      console.error("Error adjusting loyalty points:", error);
      res.status(500).json({ message: "Failed to adjust loyalty points" });
    }
  });

  app.get("/api/stores/:storeId/loyalty/reports", async (req, res) => {
    try {
      const reports = await storage.getLoyaltyReports(req.params.storeId);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching loyalty reports:", error);
      res.status(500).json({ message: "Failed to fetch loyalty reports" });
    }
  });

  // Loyalty Data Import Route
  app.post("/api/stores/:storeId/loyalty/import", async (req, res) => {
    try {
      const { customers } = req.body;
      const storeId = req.params.storeId;
      
      if (!Array.isArray(customers)) {
        return res.status(400).json({ message: "Customers data must be an array" });
      }

      const results: {
        total: number;
        imported: number;
        errors: Array<{ row: number; error: string }>;
        skipped: number;
      } = {
        total: customers.length,
        imported: 0,
        errors: [],
        skipped: 0
      };

      for (const customerData of customers) {
        try {
          // Validate required fields
          if (!customerData.first_name || !customerData.last_name) {
            results.errors.push({
              row: results.imported + results.skipped + 1,
              error: "First name and last name are required"
            });
            results.skipped++;
            continue;
          }

          // Check if customer already exists by loyalty number
          if (customerData.loyalty_number) {
            const existingCustomer = await storage.getCustomerByLoyaltyNumber(customerData.loyalty_number);
            if (existingCustomer) {
              results.skipped++;
              continue;
            }
          }

          // Get or create tier
          let tierId = null;
          if (customerData.tier_name) {
            const tier = await storage.getLoyaltyTierByName(storeId, customerData.tier_name);
            if (tier) {
              tierId = tier.id;
            }
          }

          // Create customer
          const customer = await storage.createLoyaltyCustomer({
            storeId,
            firstName: customerData.first_name,
            lastName: customerData.last_name,
            email: customerData.email || null,
            phone: customerData.phone || null,
            loyaltyNumber: customerData.loyalty_number || `LOY${Date.now().toString().slice(-6)}`,
            currentPoints: parseInt(customerData.current_points) || 0,
            lifetimePoints: parseInt(customerData.lifetime_points) || 0,
            tierId,
            isActive: true,
          });

          results.imported++;
        } catch (error) {
          results.errors.push({
            row: results.imported + results.skipped + 1,
            error: error instanceof Error ? error.message : "Unknown error"
          });
          results.skipped++;
        }
      }

      res.json(results);
    } catch (error) {
      console.error("Error importing loyalty data:", error);
      res.status(500).json({ message: "Failed to import loyalty data" });
    }
  });

  // Enhanced User Management Routes
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.put("/api/users/:id", async (req, res) => {
    try {
      const userData = insertUserSchema.partial().parse(req.body);
      const user = await storage.updateUser(req.params.id, userData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Reporting Routes
  app.get("/api/stores/:storeId/reports/sales", async (req, res) => {
    try {
      const { startDate, endDate, format = "json" } = req.query;
      const report = await storage.generateSalesReport(
        req.params.storeId,
        new Date(startDate as string),
        new Date(endDate as string),
        format as string
      );
      
      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=sales-report.csv");
        res.send(report);
      } else {
        res.json(report);
      }
    } catch (error) {
      console.error("Error generating sales report:", error);
      res.status(500).json({ message: "Failed to generate sales report" });
    }
  });

  app.get("/api/stores/:storeId/reports/inventory", async (req, res) => {
    try {
      const { format = "json" } = req.query;
      const report = await storage.generateInventoryReport(req.params.storeId, format as string);
      
      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=inventory-report.csv");
        res.send(report);
      } else {
        res.json(report);
      }
    } catch (error) {
      console.error("Error generating inventory report:", error);
      res.status(500).json({ message: "Failed to generate inventory report" });
    }
  });

  app.get("/api/stores/:storeId/reports/customers", async (req, res) => {
    try {
      const { format = "json" } = req.query;
      const report = await storage.generateCustomerReport(req.params.storeId, format as string);
      
      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=customer-report.csv");
        res.send(report);
      } else {
        res.json(report);
      }
    } catch (error) {
      console.error("Error generating customer report:", error);
      res.status(500).json({ message: "Failed to generate customer report" });
    }
  });

  // Export Routes
  app.get("/api/stores/:storeId/export/products", async (req, res) => {
    try {
      const { format = "csv" } = req.query;
      const exportData = await storage.exportProducts(req.params.storeId, format as string);
      
      res.setHeader("Content-Type", format === "csv" ? "text/csv" : "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=products-export.${format}`);
      res.send(exportData);
    } catch (error) {
      console.error("Error exporting products:", error);
      res.status(500).json({ message: "Failed to export products" });
    }
  });

  app.get("/api/stores/:storeId/export/transactions", async (req, res) => {
    try {
      const { startDate, endDate, format = "csv" } = req.query;
      const exportData = await storage.exportTransactions(
        req.params.storeId,
        new Date(startDate as string),
        new Date(endDate as string),
        format as string
      );
      
      res.setHeader("Content-Type", format === "csv" ? "text/csv" : "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=transactions-export.${format}`);
      res.send(exportData);
    } catch (error) {
      console.error("Error exporting transactions:", error);
      res.status(500).json({ message: "Failed to export transactions" });
    }
  });

  app.get("/api/stores/:storeId/export/customers", async (req, res) => {
    try {
      const { format = "csv" } = req.query;
      const exportData = await storage.exportCustomers(
        req.params.storeId,
        format as string
      );
      
      res.setHeader("Content-Type", format === "csv" ? "text/csv" : "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=customers-export.${format}`);
      res.send(exportData);
    } catch (error) {
      console.error("Error exporting customers:", error);
      res.status(500).json({ message: "Failed to export customers" });
    }
  });

  app.get("/api/stores/:storeId/export/inventory", async (req, res) => {
    try {
      const { format = "csv" } = req.query;
      const exportData = await storage.exportInventory(
        req.params.storeId,
        format as string
      );
      
      res.setHeader("Content-Type", format === "csv" ? "text/csv" : "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=inventory-export.${format}`);
      res.send(exportData);
    } catch (error) {
      console.error("Error exporting inventory:", error);
      res.status(500).json({ message: "Failed to export inventory" });
    }
  });

  // Settings Routes
  app.get("/api/stores/:storeId/settings", async (req, res) => {
    try {
      const settings = await storage.getStoreSettings(req.params.storeId);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching store settings:", error);
      res.status(500).json({ message: "Failed to fetch store settings" });
    }
  });

  app.put("/api/stores/:storeId/settings", async (req, res) => {
    try {
      const settings = await storage.updateStoreSettings(req.params.storeId, req.body);
      res.json(settings);
    } catch (error) {
      console.error("Error updating store settings:", error);
      res.status(500).json({ message: "Failed to update store settings" });
    }
  });

  // Dashboard Routes
  app.get("/api/dashboard/overview", async (req, res) => {
    try {
      const overview = await storage.getDashboardOverview();
      res.json(overview);
    } catch (error) {
      console.error("Error fetching dashboard overview:", error);
      res.status(500).json({ message: "Failed to fetch dashboard overview" });
    }
  });

  app.get("/api/dashboard/notifications", async (req, res) => {
    try {
      const notifications = await storage.getDashboardNotifications();
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // AI Demand Forecasting Routes
  app.get("/api/stores/:storeId/ai/forecast-models", async (req, res) => {
    try {
      const { storeId } = req.params;
      
      const models = await db
        .select()
        .from(forecastModels)
        .where(eq(forecastModels.storeId, storeId))
        .orderBy(desc(forecastModels.createdAt));

      res.json(models);
    } catch (error) {
      console.error("Error fetching forecast models:", error);
      res.status(500).json({ error: "Failed to fetch forecast models" });
    }
  });

  app.post("/api/stores/:storeId/ai/forecast-models", async (req, res) => {
    try {
      const { storeId } = req.params;
      const { name, description, modelType, parameters } = req.body;

      const newModel = await db.insert(forecastModels).values({
        storeId,
        name,
        description,
        modelType,
        parameters: JSON.stringify(parameters),
        isActive: true,
      }).returning();

      res.json(newModel[0]);
    } catch (error) {
      console.error("Error creating forecast model:", error);
      res.status(500).json({ error: "Failed to create forecast model" });
    }
  });

  app.get("/api/stores/:storeId/ai/demand-forecasts", async (req, res) => {
    try {
      const { storeId } = req.params;
      const { period = "30", modelId } = req.query;

      // Generate mock forecast data for demonstration
      const forecasts = [];
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(period as string));

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const actualDemand = Math.floor(Math.random() * 50) + 20;
        const predictedDemand = actualDemand + Math.floor(Math.random() * 20) - 10;
        const confidenceLower = Math.max(0, predictedDemand - Math.floor(Math.random() * 10));
        const confidenceUpper = predictedDemand + Math.floor(Math.random() * 10);

        forecasts.push({
          date: d.toISOString().split('T')[0],
          actualDemand,
          predictedDemand,
          confidenceLower,
          confidenceUpper,
          accuracy: Math.random() * 0.3 + 0.7, // 70-100% accuracy
        });
      }

      res.json(forecasts);
    } catch (error) {
      console.error("Error fetching demand forecasts:", error);
      res.status(500).json({ error: "Failed to fetch demand forecasts" });
    }
  });

  app.get("/api/stores/:storeId/ai/insights", async (req, res) => {
    try {
      const { storeId } = req.params;
      
      // Generate mock AI insights for demonstration
      const mockInsights = [
        {
          id: "1",
          insightType: "trend",
          title: "Sales Trend Analysis",
          description: "Your sales have increased by 15% over the last 30 days, with the strongest growth in electronics category.",
          severity: "medium",
          data: {
            impact: 15,
            confidence: 85,
            recommendations: [
              "Consider increasing inventory for electronics",
              "Promote electronics category in marketing",
              "Monitor competitor pricing"
            ]
          },
          isRead: false,
          isActioned: false,
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "2",
          insightType: "anomaly",
          title: "Unusual Inventory Movement",
          description: "Product 'Wireless Headphones' shows unusual demand spike. Consider investigating potential causes.",
          severity: "high",
          data: {
            impact: -5,
            confidence: 92,
            recommendations: [
              "Check for marketing campaigns",
              "Review competitor activity",
              "Prepare for potential stockout"
            ]
          },
          isRead: true,
          isActioned: false,
          createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "3",
          insightType: "recommendation",
          title: "Pricing Optimization Opportunity",
          description: "Analysis suggests 8% price increase on premium products could increase revenue by 12% without significant demand loss.",
          severity: "low",
          data: {
            impact: 12,
            confidence: 78,
            recommendations: [
              "Test price increase on small subset",
              "Monitor customer response",
              "Adjust pricing strategy gradually"
            ]
          },
          isRead: false,
          isActioned: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: "4",
          insightType: "pattern",
          title: "Seasonal Demand Pattern",
          description: "Strong correlation detected between weather patterns and beverage sales. Prepare for upcoming seasonal changes.",
          severity: "medium",
          data: {
            impact: 20,
            confidence: 88,
            recommendations: [
              "Increase beverage inventory",
              "Plan seasonal promotions",
              "Adjust staffing schedules"
            ]
          },
          isRead: false,
          isActioned: false,
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "5",
          insightType: "anomaly",
          title: "Critical Stockout Risk",
          description: "Multiple products approaching critical stock levels. Immediate action required to prevent stockouts.",
          severity: "critical",
          data: {
            impact: -25,
            confidence: 95,
            recommendations: [
              "Place emergency orders immediately",
              "Review reorder points",
              "Implement safety stock policies"
            ]
          },
          isRead: false,
          isActioned: false,
          createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        }
      ];

      res.json(mockInsights);
    } catch (error) {
      console.error("Error fetching AI insights:", error);
      res.status(500).json({ error: "Failed to fetch AI insights" });
    }
  });

  app.patch("/api/stores/:storeId/ai/insights/:insightId", async (req, res) => {
    try {
      const { storeId, insightId } = req.params;
      const updates = req.body;

      // In a real implementation, you would update the database
      // For now, we'll just return success
      res.json({ success: true, message: "Insight updated successfully" });
    } catch (error) {
      console.error("Error updating AI insight:", error);
      res.status(500).json({ error: "Failed to update AI insight" });
    }
  });

  app.post("/api/stores/:storeId/ai/train-model", async (req, res) => {
    try {
      const { storeId } = req.params;
      const { modelType, parameters } = req.body;

      // Simulate model training
      await new Promise(resolve => setTimeout(resolve, 2000));

      const newModel = await db.insert(forecastModels).values({
        storeId,
        name: `${modelType.toUpperCase()} Model`,
        description: `AI model trained on ${new Date().toLocaleDateString()}`,
        modelType,
        parameters: JSON.stringify(parameters),
        accuracy: (Math.random() * 0.3 + 0.7).toString(), // 70-100% accuracy
        isActive: true,
        lastTrained: new Date(),
      }).returning();

      res.json(newModel[0]);
    } catch (error) {
      console.error("Error training model:", error);
      res.status(500).json({ error: "Failed to train model" });
    }
  });

  app.get("/api/stores/:storeId/ai/seasonal-patterns", async (req, res) => {
    try {
      const { storeId } = req.params;
      
      // Generate mock seasonal pattern data
      const patterns = [
        { dayOfWeek: 1, averageDemand: 45, confidence: 0.85 },
        { dayOfWeek: 2, averageDemand: 52, confidence: 0.88 },
        { dayOfWeek: 3, averageDemand: 48, confidence: 0.82 },
        { dayOfWeek: 4, averageDemand: 55, confidence: 0.90 },
        { dayOfWeek: 5, averageDemand: 62, confidence: 0.92 },
        { dayOfWeek: 6, averageDemand: 58, confidence: 0.89 },
        { dayOfWeek: 0, averageDemand: 40, confidence: 0.78 },
      ];

      res.json(patterns);
    } catch (error) {
      console.error("Error fetching seasonal patterns:", error);
      res.status(500).json({ error: "Failed to fetch seasonal patterns" });
    }
  });

  app.get("/api/stores/:storeId/ai/external-factors", async (req, res) => {
    try {
      const { storeId } = req.params;
      
      // Generate mock external factors data
      const factors = [
        {
          id: "1",
          factorType: "holiday",
          name: "Black Friday",
          description: "Major shopping holiday",
          startDate: new Date("2024-11-29").toISOString(),
          endDate: new Date("2024-11-30").toISOString(),
          impact: "positive",
          impactStrength: 0.8,
          isActive: true,
        },
        {
          id: "2",
          factorType: "weather",
          name: "Heat Wave",
          description: "Unusually hot weather affecting sales",
          startDate: new Date("2024-07-15").toISOString(),
          endDate: new Date("2024-07-20").toISOString(),
          impact: "negative",
          impactStrength: -0.3,
          isActive: true,
        },
        {
          id: "3",
          factorType: "event",
          name: "Local Festival",
          description: "Annual community festival",
          startDate: new Date("2024-09-10").toISOString(),
          endDate: new Date("2024-09-12").toISOString(),
          impact: "positive",
          impactStrength: 0.5,
          isActive: true,
        }
      ];

      res.json(factors);
    } catch (error) {
      console.error("Error fetching external factors:", error);
      res.status(500).json({ error: "Failed to fetch external factors" });
    }
  });

  // OpenAI Integration Routes
  const openaiService = new OpenAIService();

  // Chat endpoint for frontend integration
  app.post("/api/openai/chat", async (req, res) => {
    try {
      const { message, storeId, sessionId } = req.body;
      
      // Process message with OpenAI
      const openaiResponse = await openaiService.processChatMessage(message, storeId);
      
      res.json({
        fulfillmentText: openaiResponse.text,
        payload: openaiResponse.payload
      });
    } catch (error) {
      console.error("OpenAI chat error:", error);
      res.status(500).json({
        fulfillmentText: "I'm sorry, I encountered an error processing your request."
      });
    }
  });

  // IP Whitelist routes
  app.get("/api/ip-whitelist", authenticateUser, async (req: any, res) => {
    try {
      const user = req.session.user;
      let whitelist: any[] = [];

      if (user.role === "admin") {
        // Admin can see all whitelists
        whitelist = await storage.getAllIpWhitelists();
      } else if (user.role === "manager") {
        // Manager can see whitelists for their store
        const accessibleStores = await storage.getUserAccessibleStores(user.id);
        whitelist = [];
        for (const store of accessibleStores) {
          const storeWhitelist = await storage.getIpWhitelistForStore(store.id);
          whitelist.push(...storeWhitelist);
        }
      } else {
        // Cashier can only see their own whitelist
        whitelist = await storage.getIpWhitelistForUser(user.id);
      }

      res.json(whitelist);
    } catch (error) {
      console.error("Error fetching IP whitelist:", error);
      res.status(500).json({ message: "Failed to fetch IP whitelist" });
    }
  });

  app.post("/api/ip-whitelist", authenticateUser, async (req: any, res) => {
    try {
      const { ipAddress, userId, description } = req.body;
      const currentUser = req.session.user;

      // Validate permissions
      if (currentUser.role === "cashier") {
        return res.status(403).json({ message: "Cashiers cannot manage IP whitelists" });
      }

      if (currentUser.role === "manager") {
        // Manager can only whitelist IPs for users in their stores
        const accessibleStores = await storage.getUserAccessibleStores(currentUser.id);
        const targetUser = await storage.getUser(userId);
        
        if (!targetUser || !targetUser.storeId || 
            !accessibleStores.some(store => store.id === targetUser.storeId)) {
          return res.status(403).json({ message: "You can only whitelist IPs for users in your stores" });
        }
      }

      const whitelist = await storage.addIpToWhitelist(
        ipAddress, 
        userId, 
        currentUser.id, 
        description
      );

      res.json(whitelist);
    } catch (error) {
      console.error("Error adding IP to whitelist:", error);
      res.status(500).json({ message: "Failed to add IP to whitelist" });
    }
  });

  app.delete("/api/ip-whitelist/:ipAddress/:userId", authenticateUser, async (req: any, res) => {
    try {
      const { ipAddress, userId } = req.params;
      const currentUser = req.session.user;

      // Validate permissions
      if (currentUser.role === "cashier") {
        return res.status(403).json({ message: "Cashiers cannot manage IP whitelists" });
      }

      if (currentUser.role === "manager") {
        // Manager can only remove IPs for users in their stores
        const accessibleStores = await storage.getUserAccessibleStores(currentUser.id);
        const targetUser = await storage.getUser(userId);
        
        if (!targetUser || !targetUser.storeId || 
            !accessibleStores.some(store => store.id === targetUser.storeId)) {
          return res.status(403).json({ message: "You can only remove IPs for users in your stores" });
        }
      }

      await storage.removeIpFromWhitelist(ipAddress, userId);
      res.json({ message: "IP removed from whitelist" });
    } catch (error) {
      console.error("Error removing IP from whitelist:", error);
      res.status(500).json({ message: "Failed to remove IP from whitelist" });
    }
  });

  app.get("/api/ip-whitelist/logs", authenticateUser, async (req: any, res) => {
    try {
      const user = req.session.user;
      
      // Only admins can view logs
      if (user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can view IP access logs" });
      }

      const logs = await storage.getIpAccessLogs(100);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching IP access logs:", error);
      res.status(500).json({ message: "Failed to fetch IP access logs" });
    }
  });

  // Performance monitoring endpoints (admin only)
  app.get("/api/performance/metrics", authenticateUser, (req, res) => {
    // Only allow admin users to access performance metrics
    if (req.session.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    getPerformanceMetrics(req, res);
  });

  app.delete("/api/performance/metrics", authenticateUser, (req, res) => {
    // Only allow admin users to clear performance metrics
    if (req.session.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    clearPerformanceMetrics(req, res);
  });

  // Enhanced monitoring endpoints
  app.get("/api/monitoring/performance", authenticateUser, (req, res) => {
    if (req.session.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const metrics = monitoringService.getPerformanceMetrics();
    res.json({
      status: 'success',
      data: metrics,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/monitoring/business", authenticateUser, (req, res) => {
    if (req.session.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const metrics = monitoringService.getBusinessMetrics();
    res.json({
      status: 'success',
      data: metrics,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/monitoring/all", authenticateUser, (req, res) => {
    if (req.session.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const allMetrics = monitoringService.getAllMetrics();
    const performanceMetrics = monitoringService.getPerformanceMetrics();
    const businessMetrics = monitoringService.getBusinessMetrics();
    
    res.json({
      status: 'success',
      data: {
        performance: performanceMetrics,
        business: businessMetrics,
        raw: Object.fromEntries(allMetrics)
      },
      timestamp: new Date().toISOString()
    });
  });

  app.delete("/api/monitoring/clear", authenticateUser, (req, res) => {
    if (req.session.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    monitoringService.clearMetrics();
    res.json({
      status: 'success',
      message: 'All monitoring metrics cleared',
      timestamp: new Date().toISOString()
    });
  });

  // Create HTTP server
  const server = createServer(app);
  
  return server;
}
