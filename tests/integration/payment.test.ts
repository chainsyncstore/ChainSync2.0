import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerRoutes } from '@server/routes';
import { storage } from '@server/storage';
import { PaymentService } from '@server/payment/service';

// Mock the PaymentService
vi.mock('@server/payment/service', () => ({
  PaymentService: vi.fn().mockImplementation(() => ({
    generateReference: vi.fn().mockReturnValue('PAYSTACK_TEST_REF_123'),
    mockPaystackPayment: vi.fn().mockResolvedValue({
      data: {
        authorization_url: 'https://checkout.paystack.com/test',
        reference: 'PAYSTACK_TEST_REF_123',
        access_code: 'test_access_code'
      }
    }),
    mockFlutterwavePayment: vi.fn().mockResolvedValue({
      data: {
        link: 'https://checkout.flutterwave.com/test',
        reference: 'FLUTTERWAVE_TEST_REF_123',
        access_code: 'test_access_code'
      }
    }),
    verifyPaystackPayment: vi.fn().mockResolvedValue(true),
    verifyFlutterwavePayment: vi.fn().mockResolvedValue(true)
  }))
}));

describe('Payment Integration Tests', () => {
  let app: express.Application;
  let testUser: any;
  let testStore: any;
  let sessionCookie: string;

  beforeEach(async () => {
    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Setup session middleware
    app.use(session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false }
    }));

    // Register routes
    await registerRoutes(app);

    // Create test user
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
      location: 'Test Location',
      isActive: true
    });

    // Create test store
    testStore = await storage.createStore({
      name: 'Payment Test Store',
      ownerId: testUser.id,
      address: 'Test Address',
      phone: '+1234567890',
      email: 'paymentuser@example.com',
      isActive: true
    });

    // Update user with store ID
    await storage.updateUser(testUser.id, { storeId: testStore.id });

    // Login to get session
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'paymentuser@example.com',
        password: 'StrongPass123!'
      });

    sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';
  });

  describe('POST /api/payment/initialize', () => {
    it('should initialize Paystack payment successfully', async () => {
      const paymentData = {
        email: 'paymentuser@example.com',
        amount: 5000, // Amount in kobo (50 NGN)
        currency: 'NGN',
        provider: 'paystack',
        tier: 'premium',
        metadata: {
          userId: testUser.id,
          storeId: testStore.id
        }
      };

      const response = await request(app)
        .post('/api/payment/initialize')
        .send(paymentData)
        .expect(200);

      expect(response.body).toHaveProperty('authorization_url');
      expect(response.body).toHaveProperty('reference');
      expect(response.body).toHaveProperty('access_code');
      expect(response.body.reference).toContain('PAYSTACK');
    });

    it('should initialize Flutterwave payment successfully', async () => {
      const paymentData = {
        email: 'paymentuser@example.com',
        amount: 5000, // Amount in kobo (50 NGN)
        currency: 'NGN',
        provider: 'flutterwave',
        tier: 'premium',
        metadata: {
          userId: testUser.id,
          storeId: testStore.id
        }
      };

      const response = await request(app)
        .post('/api/payment/initialize')
        .send(paymentData)
        .expect(200);

      expect(response.body).toHaveProperty('link');
      expect(response.body).toHaveProperty('reference');
      expect(response.body).toHaveProperty('access_code');
      expect(response.body.reference).toContain('FLUTTERWAVE');
    });

    it('should reject missing required parameters', async () => {
      const invalidData = {
        email: 'paymentuser@example.com',
        // Missing amount, currency, provider, tier
      };

      const response = await request(app)
        .post('/api/payment/initialize')
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('Missing required payment parameters');
    });

    it('should reject unsupported payment provider', async () => {
      const paymentData = {
        email: 'paymentuser@example.com',
        amount: 5000,
        currency: 'NGN',
        provider: 'unsupported_provider',
        tier: 'premium'
      };

      const response = await request(app)
        .post('/api/payment/initialize')
        .send(paymentData)
        .expect(400);

      expect(response.body.message).toBe('Unsupported payment provider');
    });

    it('should include metadata in payment request', async () => {
      const paymentData = {
        email: 'paymentuser@example.com',
        amount: 5000,
        currency: 'NGN',
        provider: 'paystack',
        tier: 'premium',
        metadata: {
          userId: testUser.id,
          storeId: testStore.id,
          customField: 'customValue'
        }
      };

      const response = await request(app)
        .post('/api/payment/initialize')
        .send(paymentData)
        .expect(200);

      expect(response.body).toHaveProperty('reference');
    });
  });

  describe('POST /api/payment/verify', () => {
    it('should verify Paystack payment successfully', async () => {
      const verificationData = {
        reference: 'PAYSTACK_TEST_REF_123',
        status: 'success'
      };

      const response = await request(app)
        .post('/api/payment/verify')
        .send(verificationData)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data.success).toBe(true);
      expect(response.body.message).toBe('Payment verified successfully');
    });

    it('should verify Flutterwave payment successfully', async () => {
      const verificationData = {
        reference: 'FLUTTERWAVE_TEST_REF_123',
        status: 'success'
      };

      const response = await request(app)
        .post('/api/payment/verify')
        .send(verificationData)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data.success).toBe(true);
      expect(response.body.message).toBe('Payment verified successfully');
    });

    it('should reject missing payment reference', async () => {
      const verificationData = {
        status: 'success'
        // Missing reference
      };

      const response = await request(app)
        .post('/api/payment/verify')
        .send(verificationData)
        .expect(422);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Payment reference is required');
    });

    it('should handle payment verification failure', async () => {
      // Mock the verification to fail
      const mockPaymentService = new PaymentService();
      vi.mocked(mockPaymentService.verifyPaystackPayment).mockResolvedValueOnce(false);

      const verificationData = {
        reference: 'PAYSTACK_FAILED_REF',
        status: 'failed'
      };

      const response = await request(app)
        .post('/api/payment/verify')
        .send(verificationData)
        .expect(400);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Payment verification failed');
    });
  });

  describe('POST /api/payment/webhook', () => {
    it('should handle Paystack webhook successfully', async () => {
      const webhookData = {
        reference: 'PAYSTACK_TEST_REF_123',
        status: 'success',
        provider: 'paystack',
        data: {
          amount: 5000,
          currency: 'NGN',
          customer: {
            email: 'paymentuser@example.com'
          }
        }
      };

      const response = await request(app)
        .post('/api/payment/webhook')
        .send(webhookData)
        .expect(200);

      expect(response.body.message).toBe('Webhook processed successfully');
    });

    it('should handle Flutterwave webhook successfully', async () => {
      const webhookData = {
        reference: 'FLUTTERWAVE_TEST_REF_123',
        status: 'successful',
        provider: 'flutterwave',
        data: {
          amount: 5000,
          currency: 'NGN',
          customer: {
            email: 'paymentuser@example.com'
          }
        }
      };

      const response = await request(app)
        .post('/api/payment/webhook')
        .send(webhookData)
        .expect(200);

      expect(response.body.message).toBe('Webhook processed successfully');
    });

    it('should handle failed payment webhook', async () => {
      const webhookData = {
        reference: 'PAYSTACK_FAILED_REF',
        status: 'failed',
        provider: 'paystack',
        data: {
          amount: 5000,
          currency: 'NGN',
          customer: {
            email: 'paymentuser@example.com'
          }
        }
      };

      const response = await request(app)
        .post('/api/payment/webhook')
        .send(webhookData)
        .expect(200);

      expect(response.body.message).toBe('Webhook processed successfully');
    });

    it('should handle webhook with missing data', async () => {
      const webhookData = {
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/payment/webhook')
        .send(webhookData)
        .expect(400);

      expect(response.body.message).toBe('Invalid webhook data');
    });
  });

  describe('Payment Error Handling', () => {
    it('should handle payment service errors gracefully', async () => {
      // Mock the payment service to throw an error
      const mockPaymentService = new PaymentService();
      vi.mocked(mockPaymentService.mockPaystackPayment).mockRejectedValueOnce(
        new Error('Payment service unavailable')
      );

      const paymentData = {
        email: 'paymentuser@example.com',
        amount: 5000,
        currency: 'NGN',
        provider: 'paystack',
        tier: 'premium'
      };

      const response = await request(app)
        .post('/api/payment/initialize')
        .send(paymentData)
        .expect(500);

      expect(response.body.message).toBe('Failed to initialize payment');
    });

    it('should handle verification service errors', async () => {
      // Mock the verification service to throw an error
      const mockPaymentService = new PaymentService();
      vi.mocked(mockPaymentService.verifyPaystackPayment).mockRejectedValueOnce(
        new Error('Verification service error')
      );

      const verificationData = {
        reference: 'PAYSTACK_ERROR_REF',
        status: 'success'
      };

      const response = await request(app)
        .post('/api/payment/verify')
        .send(verificationData)
        .expect(400);

      expect(response.body.status).toBe('error');
    });
  });

  describe('Payment Security', () => {
    it('should validate payment amounts', async () => {
      const paymentData = {
        email: 'paymentuser@example.com',
        amount: -1000, // Negative amount
        currency: 'NGN',
        provider: 'paystack',
        tier: 'premium'
      };

      const response = await request(app)
        .post('/api/payment/initialize')
        .send(paymentData)
        .expect(400);

      expect(response.body.message).toBe('Invalid payment amount');
    });

    it('should validate email format', async () => {
      const paymentData = {
        email: 'invalid-email',
        amount: 5000,
        currency: 'NGN',
        provider: 'paystack',
        tier: 'premium'
      };

      const response = await request(app)
        .post('/api/payment/initialize')
        .send(paymentData)
        .expect(400);

      expect(response.body.message).toBe('Invalid email format');
    });

    it('should validate supported currencies', async () => {
      const paymentData = {
        email: 'paymentuser@example.com',
        amount: 5000,
        currency: 'INVALID_CURRENCY',
        provider: 'paystack',
        tier: 'premium'
      };

      const response = await request(app)
        .post('/api/payment/initialize')
        .send(paymentData)
        .expect(400);

      expect(response.body.message).toBe('Unsupported currency');
    });
  });
}); 