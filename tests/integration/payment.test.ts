import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerRoutes } from '@server/routes';
import { storage } from '@server/storage';
import { PaymentService } from '@server/payment/service';

const mockPaymentService = {
  initializePaystackPayment: vi.fn(),
  initializeFlutterwavePayment: vi.fn(),
  verifyPaystackPayment: vi.fn().mockResolvedValue(true),
  verifyFlutterwavePayment: vi.fn().mockResolvedValue(true),
  generateReference: vi.fn().mockReturnValue('PAYSTACK_TEST_REF_123'),
};

vi.mock('@server/payment/service', () => ({
  PaymentService: vi.fn().mockImplementation(() => mockPaymentService),
}));

describe('Payment Integration Tests', () => {
  let app: express.Application;
  let testUser: any;
  let testStore: any;
  let sessionCookie: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false, cookie: { secure: false } }));
    await registerRoutes(app);

    testUser = await storage.createUser({
      username: 'paymentuser@example.com',
      password: 'StrongPass123!',
      email: 'paymentuser@example.com',
      firstName: 'Payment',
      lastName: 'User',
      phone: '+1234567890',
      companyName: 'Payment Test Company',
      role: 'admin',
      tier: 'basic',
      location: 'international',
      isActive: true,
    });

    testStore = await storage.createStore({
      name: 'Payment Test Store',
      ownerId: testUser.id,
      address: 'Test Address',
      phone: '+1234567890',
      email: 'paymentuser@example.com',
      isActive: true,
    });

    await storage.updateUser(testUser.id, { storeId: testStore.id });

    const loginResponse = await request(app).post('/api/auth/login').send({
      username: 'paymentuser@example.com',
      password: 'StrongPass123!',
    });
    sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/payment/initialize', () => {
    it('should initialize Paystack payment successfully', async () => {
      mockPaymentService.initializePaystackPayment.mockResolvedValue({
        data: {
          authorization_url: 'https://checkout.paystack.com/test',
          reference: 'PAYSTACK_TEST_REF_123',
          access_code: 'test_access_code',
        },
      } as any);

      const paymentData = {
        email: 'paymentuser@example.com',
        currency: 'NGN',
        provider: 'paystack',
        tier: 'basic',
        metadata: { userId: testUser.id, storeId: testStore.id },
      };

      const response = await request(app).post('/api/payment/initialize').send(paymentData).expect(200);

      expect(response.body).toHaveProperty('authorization_url');
      expect(response.body).toHaveProperty('reference');
      expect(response.body).toHaveProperty('access_code');
      expect(response.body.reference).toContain('PAYSTACK');
    });

    it('should initialize Flutterwave payment successfully', async () => {
      mockPaymentService.initializeFlutterwavePayment.mockResolvedValue({
        data: {
          link: 'https://checkout.flutterwave.com/test',
        },
      } as any);
      const paymentData = {
        email: 'paymentuser@example.com',
        currency: 'USD',
        provider: 'flutterwave',
        tier: 'basic',
        metadata: { userId: testUser.id, storeId: testStore.id },
      };

      const response = await request(app).post('/api/payment/initialize').send(paymentData).expect(200);

      expect(response.body).toHaveProperty('link');
    });

    it('should reject missing required parameters', async () => {
      const invalidData = { email: 'paymentuser@example.com' };
      const response = await request(app).post('/api/payment/initialize').send(invalidData).expect(400);
      expect(response.body.message).toBe('Missing required payment parameters');
    });

    it('should reject unsupported payment provider', async () => {
      const paymentData = {
        email: 'paymentuser@example.com',
        currency: 'NGN',
        provider: 'unsupported_provider',
        tier: 'basic',
      };
      const response = await request(app).post('/api/payment/initialize').send(paymentData).expect(400);
      expect(response.body.message).toBe('Unsupported payment provider');
    });

    it('should include metadata in payment request', async () => {
      mockPaymentService.initializePaystackPayment.mockResolvedValue({
        data: {
          authorization_url: 'https://checkout.paystack.com/test',
          reference: 'PAYSTACK_TEST_REF_123',
          access_code: 'test_access_code',
        },
      } as any);
      const paymentData = {
        email: 'paymentuser@example.com',
        currency: 'NGN',
        provider: 'paystack',
        tier: 'basic',
        metadata: {
          userId: testUser.id,
          storeId: testStore.id,
          customField: 'customValue',
        },
      };
      const response = await request(app).post('/api/payment/initialize').send(paymentData).expect(200);
      expect(response.body).toHaveProperty('reference');
    });
  });

  describe('POST /api/payment/verify', () => {
    it('should verify Paystack payment successfully', async () => {
      const verificationData = { reference: 'PAYSTACK_TEST_REF_123', status: 'success' };
      const response = await request(app).post('/api/payment/verify').send(verificationData).expect(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.success).toBe(true);
      expect(response.body.message).toBe('Payment verified successfully');
    });

    it('should verify Flutterwave payment successfully', async () => {
      const verificationData = { reference: 'FLUTTERWAVE_TEST_REF_123', status: 'success' };
      const response = await request(app).post('/api/payment/verify').send(verificationData).expect(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.success).toBe(true);
      expect(response.body.message).toBe('Payment verified successfully');
    });

    it('should reject missing payment reference', async () => {
      const verificationData = { status: 'success' };
      const response = await request(app).post('/api/payment/verify').send(verificationData).expect(422);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Payment reference is required');
    });

    it('should handle payment verification failure', async () => {
      mockPaymentService.verifyPaystackPayment.mockResolvedValueOnce(false);
      const verificationData = { reference: 'PAYSTACK_FAILED_REF', status: 'failed' };
      const response = await request(app).post('/api/payment/verify').send(verificationData).expect(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Payment verification failed');
    });
  });

  describe('POST /api/payment/webhook', () => {
    it('should handle Paystack webhook successfully', async () => {
      const webhookData = { reference: 'PAYSTACK_TEST_REF_123', status: 'success', provider: 'paystack' };
      const response = await request(app).post('/api/payment/webhook').send(webhookData).expect(200);
      expect(response.body.message).toBe('Webhook processed successfully');
    });

    it('should handle Flutterwave webhook successfully', async () => {
      const webhookData = { reference: 'FLUTTERWAVE_TEST_REF_123', status: 'successful', provider: 'flutterwave' };
      const response = await request(app).post('/api/payment/webhook').send(webhookData).expect(200);
      expect(response.body.message).toBe('Webhook processed successfully');
    });

    it('should handle failed payment webhook', async () => {
      const webhookData = { reference: 'PAYSTACK_FAILED_REF', status: 'failed', provider: 'paystack' };
      const response = await request(app).post('/api/payment/webhook').send(webhookData).expect(200);
      expect(response.body.message).toBe('Webhook processed successfully');
    });

    it('should handle webhook with missing data', async () => {
      const webhookData = {};
      const response = await request(app).post('/api/payment/webhook').send(webhookData).expect(400);
      expect(response.body.message).toBe('Invalid webhook data');
    });
  });

  describe('Payment Error Handling', () => {
    it('should handle payment service errors gracefully', async () => {
      mockPaymentService.initializePaystackPayment.mockRejectedValueOnce(new Error('Payment service unavailable'));

      const paymentData = {
        email: 'paymentuser@example.com',
        currency: 'NGN',
        provider: 'paystack',
        tier: 'basic',
      };

      const response = await request(app).post('/api/payment/initialize').send(paymentData).expect(500);
      expect(response.body.message).toBe('Failed to initialize payment');
    });

    it('should handle verification service errors', async () => {
      mockPaymentService.verifyPaystackPayment.mockRejectedValueOnce(new Error('Verification service error'));

      const verificationData = { reference: 'PAYSTACK_ERROR_REF', status: 'success' };
      const response = await request(app).post('/api/payment/verify').send(verificationData).expect(400);
      expect(response.body.status).toBe('error');
    });
  });

  describe('Payment Security', () => {
    it('should validate invalid tier values', async () => {
      const paymentData = { email: 'paymentuser@example.com', currency: 'NGN', provider: 'paystack', tier: 'invalid_tier' };
      const response = await request(app).post('/api/payment/initialize').send(paymentData).expect(400);
      expect(response.body.message).toBe('Invalid subscription tier');
    });

    it('should validate email format', async () => {
      const paymentData = { email: 'invalid-email', currency: 'NGN', provider: 'paystack', tier: 'basic' };
      const response = await request(app).post('/api/payment/initialize').send(paymentData).expect(400);
      expect(response.body.message).toBe('Invalid email format');
    });

    it('should validate supported currencies', async () => {
      const paymentData = { email: 'paymentuser@example.com', currency: 'INVALID_CURRENCY', provider: 'paystack', tier: 'basic' };
      const response = await request(app).post('/api/payment/initialize').send(paymentData).expect(400);
      expect(response.body.message).toBe('Invalid currency');
    });

    it('should validate provider-currency mismatch', async () => {
      const paymentData = { email: 'paymentuser@example.com', currency: 'USD', provider: 'paystack', tier: 'basic' };
      const response = await request(app).post('/api/payment/initialize').send(paymentData).expect(400);
      expect(response.body.message).toBe('Payment provider does not match currency');
    });
  });
});
