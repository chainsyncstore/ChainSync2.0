import cors from 'cors';
import express from 'express';
import PDFDocument from 'pdfkit';
import { z } from 'zod';

// Simple in-memory storage for testing
const users = new Map<string, any>();
const sessions = new Map<string, any>();
let currentSessionId: string | null = null;

type StoreRecord = {
  id: string;
  name: string;
  address?: string;
  currency: 'NGN' | 'USD';
  createdAt: string;
};

const stores: StoreRecord[] = [
  { id: 'store_1', name: 'Main Store', currency: 'NGN', createdAt: new Date().toISOString() },
  { id: 'store_2', name: 'Branch Store', currency: 'NGN', createdAt: new Date().toISOString() },
];

type StaffRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'manager' | 'cashier';
  createdAt: string;
  createdBy?: {
    id: string;
    name: string;
  } | null;
};

const storeStaff = new Map<string, StaffRecord[]>([
  ['store_1', []],
  ['store_2', []],
]);

function createStoreRecord(partial: { name: string; address?: string; currency: 'NGN' | 'USD' }) {
  const record: StoreRecord = {
    id: `store_${Date.now()}`,
    name: partial.name,
    address: partial.address,
    currency: partial.currency,
    createdAt: new Date().toISOString(),
  };
  stores.unshift(record);
  if (!storeStaff.has(record.id)) {
    storeStaff.set(record.id, []);
  }
  return record;
}

function getCurrentUser() {
  if (!currentSessionId) return null;
  return sessions.get(currentSessionId) ?? null;
}

function findStoreById(id: string) {
  return stores.find((store) => store.id === id) ?? null;
}

function getStaffForStore(id: string) {
  if (!storeStaff.has(id)) {
    storeStaff.set(id, []);
  }
  return storeStaff.get(id)!;
}

// Subscription & billing state for admin flows
const org = {
  id: 'org-test',
  name: 'Test Org',
  billingEmail: 'billing@example.com',
  isActive: true,
  lockedUntil: null as Date | null,
};

const subscription = {
  id: 'sub-test',
  orgId: org.id,
  planCode: 'pro',
  provider: 'PAYSTACK',
  status: 'TRIAL',
  autopayEnabled: false,
  autopayProvider: null as null | 'PAYSTACK' | 'FLW',
  autopayReference: null as string | null,
  autopayConfiguredAt: null as Date | null,
  autopayLastStatus: 'trial',
  trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  nextBillingDate: null as Date | null,
  currentPeriodEnd: null as Date | null,
};

type AutopayDetails = {
  autopayReference: string;
  email: string;
  last4: string;
  expMonth: string;
  expYear: string;
  cardType: string;
  bank: string;
};

let autopayDetails: AutopayDetails | null = null;
const subscriptionPayments: Array<Record<string, unknown>> = [];
const dunningEvents: Array<Record<string, unknown>> = [];

function getSubscriptionSummary() {
  return {
    id: subscription.id,
    status: subscription.status,
    tier: subscription.planCode,
    trialEndsAt: subscription.trialEndDate?.toISOString() ?? null,
    autopayEnabled: subscription.autopayEnabled,
    autopayProvider: subscription.autopayProvider,
    autopayConfiguredAt: subscription.autopayConfiguredAt?.toISOString() ?? null,
    autopayLastStatus: subscription.autopayLastStatus,
  };
}

function registerSubscriptionPayment(partial: Partial<Record<string, unknown>>) {
  subscriptionPayments.unshift({
    id: `pay_${Date.now()}`,
    provider: subscription.autopayProvider ?? subscription.provider,
    amount: '200.00',
    currency: 'NGN',
    status: 'completed',
    occurredAt: new Date().toISOString(),
    reference: `PAYMENT_${Date.now()}`,
    planCode: subscription.planCode,
    eventType: 'auto_renew',
    ...partial,
  });
}

function recordDunningAttempt() {
  const event = {
    id: `dunning_${Date.now()}`,
    subscriptionId: subscription.id,
    attempt: dunningEvents.length + 1,
    status: 'sent',
    sentAt: new Date().toISOString(),
  };
  dunningEvents.unshift(event);
  return event;
}

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
  const { email, username, role: incomingRole } = req.body || {};
  const identifier = email || username || '';
  const lower = String(identifier).toLowerCase();
  const normalizedRole = typeof incomingRole === 'string' && incomingRole.trim().length > 0
    ? incomingRole.trim().toLowerCase()
    : lower.includes('admin') ? 'admin' : lower.includes('manager') ? 'manager' : 'cashier';
  const role = ['admin', 'manager', 'cashier'].includes(normalizedRole) ? normalizedRole : 'cashier';
  const user = {
    id: `user_${role}`,
    email: identifier || `${role}@example.com`,
    firstName: role.charAt(0).toUpperCase() + role.slice(1),
    lastName: 'User',
    role,
    orgId: org.id,
    subscription: getSubscriptionSummary(),
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
  return res.json({
    ...user,
    subscription: getSubscriptionSummary(),
  });
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

app.get('/api/stores', (_req, res) => {
  res.json(stores);
});

app.post('/api/stores', (req, res) => {
  const { name, address, currency } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (currency !== 'NGN' && currency !== 'USD') {
    return res.status(400).json({ error: 'Unsupported currency' });
  }
  const record = createStoreRecord({ name: name.trim(), address: typeof address === 'string' ? address.trim() || undefined : undefined, currency });
  res.status(201).json({ store: record });
});

app.get('/api/stores/:id/analytics/daily-sales', (req, res) => {
  res.json({ transactions: 3, revenue: 315 });
});

app.get('/api/stores/:storeId/staff', (req, res) => {
  const store = findStoreById(req.params.storeId);
  if (!store) {
    return res.status(404).json({ error: 'Store not found' });
  }
  const staff = getStaffForStore(store.id);
  res.json({
    store: { id: store.id, name: store.name },
    staff,
  });
});

app.post('/api/stores/:storeId/staff', (req, res) => {
  const store = findStoreById(req.params.storeId);
  if (!store) {
    return res.status(404).json({ error: 'Store not found' });
  }
  const { firstName, lastName, email, role } = req.body || {};
  if (typeof firstName !== 'string' || !firstName.trim()) {
    return res.status(400).json({ error: 'First name required' });
  }
  if (typeof lastName !== 'string' || !lastName.trim()) {
    return res.status(400).json({ error: 'Last name required' });
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (role !== 'manager' && role !== 'cashier') {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const staffList = getStaffForStore(store.id);
  const record: StaffRecord = {
    id: `staff_${Date.now()}`,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim(),
    role,
    createdAt: new Date().toISOString(),
    createdBy: (() => {
      const user = getCurrentUser();
      if (!user) return null;
      return { id: user.id, name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email };
    })(),
  };
  staffList.unshift(record);
  const tempPassword = `Temp${Math.random().toString(36).slice(2, 8)}!`;
  res.status(201).json({
    staff: record,
    credentials: {
      email: record.email,
      password: tempPassword,
    },
  });
});

app.delete('/api/stores/:storeId/staff/:staffId', (req, res) => {
  const store = findStoreById(req.params.storeId);
  if (!store) {
    return res.status(404).json({ error: 'Store not found' });
  }
  const staffList = getStaffForStore(store.id);
  const index = staffList.findIndex((member) => member.id === req.params.staffId);
  if (index === -1) {
    return res.status(404).json({ error: 'Staff not found' });
  }
  staffList.splice(index, 1);
  res.json({ ok: true });
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

// Billing & subscription management endpoints
app.get('/api/admin/org/billing', (_req, res) => {
  res.json({ org: { id: org.id, billingEmail: org.billingEmail } });
});

app.patch('/api/admin/org/billing', (req, res) => {
  const { billingEmail } = req.body || {};
  if (!billingEmail || typeof billingEmail !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  org.billingEmail = billingEmail;
  res.json({ org: { id: org.id, billingEmail: org.billingEmail } });
});

app.get('/api/admin/subscriptions', (_req, res) => {
  res.json({ subscriptions: [{
    id: subscription.id,
    planCode: subscription.planCode,
    provider: subscription.autopayProvider ?? subscription.provider,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
  }] });
});

app.get('/api/admin/subscription-payments', (_req, res) => {
  res.json({ payments: subscriptionPayments });
});

app.get('/api/admin/dunning-events', (_req, res) => {
  res.json({ events: dunningEvents });
});

app.post('/api/admin/dunning/:subscriptionId/retry', (req, res) => {
  if (req.params.subscriptionId !== subscription.id) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
  recordDunningAttempt();
  res.json({ ok: true });
});

app.post('/api/admin/subscriptions/:id/update-payment', (req, res) => {
  if (req.params.id !== subscription.id) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
  const reference = `PAYSTACK_UPD_${Date.now()}`;
  res.json({
    redirectUrl: `https://checkout.paystack.com/${reference}`,
    reference,
    provider: 'PAYSTACK',
  });
});

const handleSubscribe = (req: express.Request, res: express.Response) => {
  const { orgId, planCode, email } = req.body || {};
  if (orgId !== org.id || typeof planCode !== 'string' || typeof email !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const reference = `PAYSTACK_SUB_${Date.now()}`;
  res.json({
    provider: 'PAYSTACK',
    reference,
    redirectUrl: `https://checkout.paystack.com/${reference}`,
  });
};

app.post('/billing/subscribe', handleSubscribe);
app.post('/api/billing/subscribe', handleSubscribe);

app.get('/api/billing/autopay', (_req, res) => {
  res.json({
    autopay: {
      enabled: subscription.autopayEnabled,
      provider: subscription.autopayProvider,
      status: subscription.autopayLastStatus,
      configuredAt: subscription.autopayConfiguredAt?.toISOString() ?? null,
      details: autopayDetails,
    },
  });
});

app.post('/api/billing/autopay/confirm', (req, res) => {
  const { provider, reference } = req.body || {};
  const normalized = typeof provider === 'string' ? provider.toString().toUpperCase() : '';
  if (!reference || (normalized !== 'PAYSTACK' && normalized !== 'FLW')) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  subscription.autopayEnabled = true;
  subscription.autopayProvider = normalized as 'PAYSTACK' | 'FLW';
  subscription.autopayReference = reference;
  subscription.autopayConfiguredAt = new Date();
  subscription.autopayLastStatus = 'configured';
  subscription.status = 'ACTIVE';
  subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  autopayDetails = {
    autopayReference: reference,
    email: org.billingEmail,
    last4: '4242',
    expMonth: '09',
    expYear: '30',
    cardType: 'visa',
    bank: 'Test Bank',
  };

  registerSubscriptionPayment({ status: 'completed', reference: `AUTO_${Date.now()}` });

  res.json({
    autopay: {
      enabled: true,
      provider: subscription.autopayProvider,
      status: subscription.autopayLastStatus,
      configuredAt: subscription.autopayConfiguredAt.toISOString(),
      details: autopayDetails,
    },
  });
});

app.delete('/api/billing/autopay', (_req, res) => {
  subscription.autopayEnabled = false;
  subscription.autopayProvider = null;
  subscription.autopayReference = null;
  subscription.autopayConfiguredAt = null;
  subscription.autopayLastStatus = 'disabled';
  autopayDetails = null;

  res.json({
    autopay: {
      enabled: false,
      provider: null,
      status: subscription.autopayLastStatus,
      configuredAt: null,
      details: null,
    },
  });
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
