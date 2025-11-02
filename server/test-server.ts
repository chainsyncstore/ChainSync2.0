import cors from 'cors';
import express from 'express';
import PDFDocument from 'pdfkit';
import { z } from 'zod';

// Simple in-memory storage for testing
const users = new Map<string, any>();
const sessions = new Map<string, any>();
let currentSessionId: string | null = null;

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

// Health endpoints
app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

// CSRF token endpoint
app.get('/api/auth/csrf-token', (req, res) => {
  // In real server, this would also set a cookie. For tests we just return a token.
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

// Minimal auth endpoints for E2E tests
app.post('/api/auth/login', (req, res) => {
  const { email, username } = req.body || {};
  const identifier = email || username || '';
  const lower = String(identifier).toLowerCase();
  const role = lower.includes('admin') ? 'admin' : lower.includes('manager') ? 'manager' : 'cashier';
  const user = {
    id: `user_${role}`,
    email: identifier || `${role}@example.com`,
    firstName: role.charAt(0).toUpperCase() + role.slice(1),
    lastName: 'User',
    role,
  };
  const sid = `sid_${Date.now()}`;
  sessions.set(sid, user);
  currentSessionId = sid;
  res.cookie?.('chainsync.sid', sid, { httpOnly: false });
  return res.json({ status: 'success', user });
});

app.get('/api/auth/me', (_req, res) => {
  if (!currentSessionId) return res.status(401).json({ error: 'unauthorized' });
  const user = sessions.get(currentSessionId);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  return res.json(user);
});

app.post('/api/auth/logout', (req, res) => {
  if (currentSessionId) {
    sessions.delete(currentSessionId);
    currentSessionId = null;
  }
  try {
    // Clear the mock session cookie so the browser stops sending it
    res.clearCookie('chainsync.sid', {
      httpOnly: false,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });
    // Clear CSRF token cookie if present
    res.clearCookie('csrf-token', {
      httpOnly: false,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });
  } catch {
    /* no-op */
  }
  res.json({ ok: true });
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
    for (const [, user] of users.entries()) {
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
    const { currency } = req.body;
    
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

// Mock stores and analytics endpoints for POS and analytics pages
app.get('/api/stores', (_req, res) => {
  res.json([
    { id: 'store_1', name: 'Main Store' },
    { id: 'store_2', name: 'Branch Store' },
  ]);
});

app.get('/api/stores/:id/analytics/daily-sales', (req, res) => {
  res.json({ transactions: 3, revenue: 315 });
});

// Simple in-memory idempotency tracking for tests
const idempAccepts: Map<string, { count: number; response: any }> = new Map();

// POS sales endpoint (idempotent for E2E)
app.post('/api/pos/sales', (req, res) => {
  const body = req.body || {};
  if (!body || !body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({ error: 'invalid sale' });
  }
  const key = String(req.headers['idempotency-key'] || '');
  if (key && idempAccepts.has(key)) {
    const rec = idempAccepts.get(key)!;
    rec.count += 1;
    return res.status(200).json(rec.response);
  }
  const resp = { id: `sale_${Date.now()}`, total: body.total, acceptedAt: new Date().toISOString() };
  if (key) idempAccepts.set(key, { count: 1, response: resp });
  return res.status(201).json(resp);
});

// Inspection endpoint for E2E to assert single acceptance by key
app.get('/__idemp/:key', (req, res) => {
  const key = String(req.params.key || '');
  const rec = idempAccepts.get(key);
  res.json({ key, count: rec?.count || 0 });
});

// Product lookup by barcode
app.get('/api/products/barcode/:barcode', (req, res) => {
  const { barcode } = req.params;
  if (barcode === '12345') {
    return res.json({ id: 'product_1', name: 'Test Product', barcode: '12345', price: '9.99' });
  }
  return res.status(404).json({ error: 'not found' });
});

// Analytics exports
app.get('/api/analytics/export.csv', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="analytics_export.csv"');
  res.end(['date,revenue,discount,tax,transactions', '2024-01-01,105,0,5,1', '2024-01-02,210,0,10,1'].join('\n'));
});

app.get('/api/analytics/export.pdf', (_req, res) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="analytics_report.pdf"');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);
  doc.fontSize(16).text('Analytics Report (Test)');
  doc.text('This is a test PDF export.');
  doc.end();
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Test server running on http://localhost:${PORT}`);
  console.log(`📝 Signup endpoint: POST http://localhost:${PORT}/api/auth/signup`);
  console.log(`🔑 CSRF endpoint: GET http://localhost:${PORT}/api/auth/csrf-token`);
  console.log(`💳 Payment endpoint: POST http://localhost:${PORT}/api/payment/initialize`);
});

export default app;
