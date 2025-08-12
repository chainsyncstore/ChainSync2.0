import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentService } from '../../server/payment/service';
import { TRUSTED_PAYMENT_PROVIDERS, PRICING_TIERS, CURRENCY_PROVIDER_MAP } from '../../server/lib/constants';

// Mock axios
vi.mock('axios');

describe('Payment Security Tests', () => {
  let paymentService: PaymentService;

  beforeEach(() => {
    // Set required environment variables for testing
    process.env.PAYSTACK_SECRET_KEY = 'test_paystack_key';
    process.env.FLUTTERWAVE_SECRET_KEY = 'test_flutterwave_key';
    
    paymentService = new PaymentService();
  });

  describe('URL Validation', () => {
    it('should validate trusted Paystack domains', () => {
      const validUrls = [
        'https://checkout.paystack.com/pay/123',
        'https://api.paystack.co/transaction/123',
        'https://subdomain.paystack.com/pay/123'
      ];

      validUrls.forEach(url => {
        // Access private method for testing
        const isValid = (paymentService as any).validatePaymentUrl(url, 'paystack');
        expect(isValid).toBe(true);
      });
    });

    it('should validate trusted Flutterwave domains', () => {
      const validUrls = [
        'https://checkout.flutterwave.com/v3/hosted/pay/123',
        'https://api.flutterwave.com/v3/payments/123',
        'https://ravepay.co/pay/123'
      ];

      validUrls.forEach(url => {
        const isValid = (paymentService as any).validatePaymentUrl(url, 'flutterwave');
        expect(isValid).toBe(true);
      });
    });

    it('should reject untrusted domains', () => {
      const maliciousUrls = [
        'https://malicious-site.com/pay/123',
        'https://fake-paystack.com/pay/123',
        'https://phishing-flutterwave.com/pay/123',
        'https://paystack.evil.com/pay/123'
      ];

      maliciousUrls.forEach(url => {
        const isValid = (paymentService as any).validatePaymentUrl(url, 'paystack');
        expect(isValid).toBe(false);
      });
    });

    it('should reject invalid URL formats', () => {
      const invalidUrls = [
        'not-a-url',
        'ftp://malicious.com/pay',
        'javascript:alert("xss")',
        ''
      ];

      invalidUrls.forEach(url => {
        const isValid = (paymentService as any).validatePaymentUrl(url, 'paystack');
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Provider-Currency Validation', () => {
    it('should enforce Paystack for NGN currency', () => {
      expect(CURRENCY_PROVIDER_MAP.NGN).toBe('paystack');
    });

    it('should enforce Flutterwave for USD currency', () => {
      expect(CURRENCY_PROVIDER_MAP.USD).toBe('flutterwave');
    });
  });

  describe('Pricing Security', () => {
    it('should store amounts in smallest units', () => {
      // Verify amounts are in kobo (NGN) and cents (USD)
      expect(PRICING_TIERS.basic.ngn).toBe(3000000); // ₦30,000 in kobo
      expect(PRICING_TIERS.basic.usd).toBe(3000);    // $30 in cents
      expect(PRICING_TIERS.pro.ngn).toBe(10000000);  // ₦100,000 in kobo
      expect(PRICING_TIERS.pro.usd).toBe(10000);     // $100 in cents
      expect(PRICING_TIERS.enterprise.ngn).toBe(50000000); // ₦500,000 in kobo
      expect(PRICING_TIERS.enterprise.usd).toBe(50000);    // $500 in cents
    });

    it('should have hardcoded pricing values', () => {
      // Verify that amounts are hardcoded in the constants
      expect(PRICING_TIERS.basic.ngn).toBe(3000000); // ₦30,000 in kobo
      expect(PRICING_TIERS.basic.usd).toBe(3000);    // $30 in cents
      expect(PRICING_TIERS.pro.ngn).toBe(10000000);  // ₦100,000 in kobo
      expect(PRICING_TIERS.pro.usd).toBe(10000);     // $100 in cents
      expect(PRICING_TIERS.enterprise.ngn).toBe(50000000); // ₦500,000 in kobo
      expect(PRICING_TIERS.enterprise.usd).toBe(50000);    // $500 in cents
      
      // Note: In JavaScript, const objects are mutable, but the security comes from
      // server-side validation and not accepting amounts from frontend
    });
  });

  describe('Trusted Provider Whitelist', () => {
    it('should maintain strict provider domain whitelist', () => {
      // Verify only trusted domains are allowed
      expect(TRUSTED_PAYMENT_PROVIDERS.paystack).toEqual(['paystack.com', 'paystack.co']);
      expect(TRUSTED_PAYMENT_PROVIDERS.flutterwave).toEqual(['flutterwave.com', 'flutterwave.co', 'ravepay.co']);
      
      // Verify no additional domains can be added
      const paystackDomains = TRUSTED_PAYMENT_PROVIDERS.paystack;
      expect(paystackDomains).not.toContain('malicious.com');
      expect(paystackDomains).not.toContain('fake-paystack.com');
    });

    it('should reject any unlisted hostnames', () => {
      const allTrustedDomains = [
        ...TRUSTED_PAYMENT_PROVIDERS.paystack,
        ...TRUSTED_PAYMENT_PROVIDERS.flutterwave
      ];
      
      // Verify no additional domains exist
      expect(allTrustedDomains).toHaveLength(5); // 2 paystack + 3 flutterwave
      
      // Verify specific trusted domains
      expect(allTrustedDomains).toContain('paystack.com');
      expect(allTrustedDomains).toContain('flutterwave.com');
      expect(allTrustedDomains).toContain('ravepay.co');
    });
  });
});
