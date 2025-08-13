import express from 'express';
import cors from 'cors';
import { z } from 'zod';

// Simple in-memory storage for testing
const users = new Map<string, any>();
const sessions = new Map<string, any>();

// Validation schemas
const SignupSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  companyName: z.string().min(1),
  password: z.string().min(8),
  tier: z.enum(["basic", "pro", "enterprise"]),
  location: z.enum(["nigeria", "international"]),
  recaptchaToken: z.string().optional()
});

const app = express();
const PORT = 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5000'],
  credentials: true
}));
app.use(express.json());

// CSRF token endpoint
app.get('/api/auth/csrf-token', (req, res) => {
  res.json({ csrfToken: 'test-csrf-token' });
});

// Signup endpoint
app.post('/api/auth/signup', (req, res) => {
  try {
    // Validate request body
    const validatedData = SignupSchema.parse(req.body);
    
    // Check if user already exists
    if (users.has(validatedData.email)) {
      return res.status(409).json({
        status: 'error',
        message: 'Email is already registered, please check details and try again.',
        code: 'DUPLICATE_EMAIL',
        timestamp: new Date().toISOString(),
        path: req.path
      });
    }
    
    // Create user
    const user = {
      id: `user_${Date.now()}`,
      email: validatedData.email,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      phone: validatedData.phone,
      companyName: validatedData.companyName,
      tier: validatedData.tier,
      location: validatedData.location,
      role: 'admin',
      isActive: false,
      emailVerified: false,
      signupCompleted: false,
      createdAt: new Date()
    };
    
    // Store user
    users.set(validatedData.email, user);
    
    // Return success response
    res.status(201).json({
      message: 'Account created successfully. Please verify your email to activate your account.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tier: user.tier,
        emailVerified: false
      },
      store: {
        id: `store_${Date.now()}`,
        name: user.companyName
      }
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed. Please check your input.',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
        path: req.path
      });
    }
    
    console.error('Signup error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Unable to complete signup. Please try again later.',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
      path: req.path
    });
  }
});

// Complete signup endpoint
app.post('/api/auth/complete-signup', (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Find user by ID
    let userFound = false;
    for (const [email, user] of users.entries()) {
      if (user.id === userId) {
        user.signupCompleted = true;
        user.isActive = true;
        user.emailVerified = true;
        userFound = true;
        break;
      }
    }
    
    if (!userFound) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
        code: 'NOT_FOUND'
      });
    }
    
    res.json({ message: 'Signup completed successfully' });
    
  } catch (error) {
    console.error('Complete signup error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to complete signup',
      code: 'SERVER_ERROR'
    });
  }
});

// Pending signup endpoint
app.get('/api/auth/pending-signup', (req, res) => {
  res.json({ pendingUserId: null });
});

// Payment initialization endpoint
app.post('/api/payment/initialize', (req, res) => {
  try {
    const { email, currency, provider, tier, userId, metadata } = req.body;
    
    // Mock payment initialization
    const paymentData = {
      authorization_url: `https://test-payment.com/pay?amount=100&currency=${currency}`,
      link: `https://test-payment.com/pay?amount=100&currency=${currency}`,
      reference: `ref_${Date.now()}`,
      amount: 100,
      currency: currency
    };
    
    res.json(paymentData);
    
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Payment initialization failed',
      code: 'PAYMENT_ERROR'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Test server running on http://localhost:${PORT}`);
  console.log(`📝 Signup endpoint: POST http://localhost:${PORT}/api/auth/signup`);
  console.log(`🔑 CSRF endpoint: GET http://localhost:${PORT}/api/auth/csrf-token`);
  console.log(`💳 Payment endpoint: POST http://localhost:${PORT}/api/payment/initialize`);
});

export default app;
