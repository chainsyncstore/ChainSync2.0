#!/usr/bin/env node

/**
 * Security Implementation Test Script
 * 
 * This script tests the enhanced security measures implemented:
 * 1. CSRF protection on POST endpoints
 * 2. Rate limiting on sensitive endpoints
 * 3. Bot prevention with captcha verification
 * 
 * Run with: node test-security-implementation.js
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Test configuration
const TEST_CONFIG = {
  signupEndpoint: '/api/auth/signup',
  paymentEndpoint: '/api/payment/initialize',
  verifyEmailEndpoint: '/api/auth/verify-email',
  resendVerificationEndpoint: '/api/auth/resend-verification',
  csrfEndpoint: '/api/auth/csrf-token'
};

// Test data
const TEST_DATA = {
  signup: {
    firstName: 'Test',
    lastName: 'User',
    email: `test${Date.now()}@example.com`,
    phone: '+1234567890',
    companyName: 'Test Company',
    password: 'TestPass123!',
    tier: 'basic',
    location: 'nigeria',
    captchaToken: 'test-captcha-token'
  },
  payment: {
    email: 'test@example.com',
    amount: 1000,
    currency: 'NGN',
    provider: 'paystack',
    tier: 'basic',
    captchaToken: 'test-captcha-token'
  },
  verifyEmail: {
    token: 'test-verification-token',
    captchaToken: 'test-captcha-token'
  },
  resendVerification: {
    email: 'test@example.com',
    captchaToken: 'test-captcha-token'
  }
};

class SecurityTestRunner {
  constructor() {
    this.results = [];
    this.csrfToken = null;
  }

  async log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async runTest(name, testFunction) {
    try {
      this.log(`Running test: ${name}`);
      await testFunction();
      this.log(`Test passed: ${name}`, 'success');
      this.results.push({ name, status: 'PASSED' });
    } catch (error) {
      this.log(`Test failed: ${name} - ${error.message}`, 'error');
      this.results.push({ name, status: 'FAILED', error: error.message });
    }
  }

  async getCsrfToken() {
    try {
      const response = await axios.get(`${BASE_URL}${TEST_CONFIG.csrfEndpoint}`);
      this.csrfToken = response.data.csrfToken;
      this.log(`CSRF token obtained: ${this.csrfToken ? 'SUCCESS' : 'FAILED'}`);
      return this.csrfToken;
    } catch (error) {
      this.log(`Failed to get CSRF token: ${error.message}`, 'error');
      throw error;
    }
  }

  async testCsrfProtection() {
    // Test without CSRF token
    try {
      await axios.post(`${BASE_URL}${TEST_CONFIG.signupEndpoint}`, TEST_DATA.signup);
      throw new Error('Request should have been blocked by CSRF protection');
    } catch (error) {
      if (error.response?.status === 403 && error.response.data?.error === 'CSRF token validation failed') {
        this.log('CSRF protection working correctly - blocked request without token');
      } else {
        throw new Error(`Unexpected response: ${error.response?.status} - ${error.response?.data?.error}`);
      }
    }
  }

  async testRateLimiting() {
    // Test rate limiting by making multiple requests
    const requests = [];
    for (let i = 0; i < 6; i++) {
      requests.push(
        axios.post(`${BASE_URL}${TEST_CONFIG.signupEndpoint}`, TEST_DATA.signup, {
          headers: { 'X-CSRF-Token': this.csrfToken }
        }).catch(error => error)
      );
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.some(response => 
      response.response?.status === 429 && 
      response.response.data?.error?.includes('Too many requests')
    );

    if (rateLimited) {
      this.log('Rate limiting working correctly - blocked excessive requests');
    } else {
      throw new Error('Rate limiting not working - excessive requests were not blocked');
    }
  }

  async testBotPrevention() {
    // Test with invalid captcha token
    try {
      await axios.post(`${BASE_URL}${TEST_CONFIG.signupEndpoint}`, TEST_DATA.signup, {
        headers: { 'X-CSRF-Token': this.csrfToken }
      });
      throw new Error('Request should have been blocked by bot prevention');
    } catch (error) {
      if (error.response?.status === 400 && error.response.data?.error === 'Captcha verification failed') {
        this.log('Bot prevention working correctly - blocked request with invalid captcha');
      } else {
        throw new Error(`Unexpected response: ${error.response?.status} - ${error.response?.data?.error}`);
      }
    }
  }

  async testPaymentEndpointSecurity() {
    // Test payment endpoint with invalid captcha
    try {
      await axios.post(`${BASE_URL}${TEST_CONFIG.paymentEndpoint}`, TEST_DATA.payment, {
        headers: { 'X-CSRF-Token': this.csrfToken }
      });
      throw new Error('Payment request should have been blocked by bot prevention');
    } catch (error) {
      if (error.response?.status === 400 && error.response.data?.error === 'Captcha verification failed') {
        this.log('Payment endpoint bot prevention working correctly');
      } else {
        throw new Error(`Unexpected payment response: ${error.response?.status} - ${error.response?.data?.error}`);
      }
    }
  }

  async testEmailVerificationSecurity() {
    // Test email verification endpoint with invalid captcha
    try {
      await axios.post(`${BASE_URL}${TEST_CONFIG.verifyEmailEndpoint}`, TEST_DATA.verifyEmail, {
        headers: { 'X-CSRF-Token': this.csrfToken }
      });
      throw new Error('Email verification should have been blocked by bot prevention');
    } catch (error) {
      if (error.response?.status === 400 && error.response.data?.error === 'Captcha verification failed') {
        this.log('Email verification bot prevention working correctly');
      } else {
        throw new Error(`Unexpected email verification response: ${error.response?.status} - ${error.response?.data?.error}`);
      }
    }
  }

  async runAllTests() {
    this.log('Starting Security Implementation Tests');
    this.log(`Testing against: ${BASE_URL}`);
    this.log('');

    // Run tests in sequence
    await this.runTest('Get CSRF Token', () => this.getCsrfToken());
    await this.runTest('CSRF Protection', () => this.testCsrfProtection());
    await this.runTest('Rate Limiting', () => this.testRateLimiting());
    await this.runTest('Bot Prevention - Signup', () => this.testBotPrevention());
    await this.runTest('Bot Prevention - Payment', () => this.testPaymentEndpointSecurity());
    await this.runTest('Bot Prevention - Email Verification', () => this.testEmailVerificationSecurity());

    // Print results summary
    this.log('');
    this.log('=== Test Results Summary ===');
    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;
    
    this.log(`Total Tests: ${this.results.length}`);
    this.log(`Passed: ${passed}`, passed > 0 ? 'success' : 'info');
    this.log(`Failed: ${failed}`, failed > 0 ? 'error' : 'info');

    if (failed > 0) {
      this.log('');
      this.log('Failed Tests:');
      this.results
        .filter(r => r.status === 'FAILED')
        .forEach(r => this.log(`  - ${r.name}: ${r.error}`, 'error'));
    }

    this.log('');
    if (failed === 0) {
      this.log('🎉 All security tests passed! Security implementation is working correctly.', 'success');
    } else {
      this.log('⚠️  Some security tests failed. Please review the implementation.', 'error');
      process.exit(1);
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const testRunner = new SecurityTestRunner();
  testRunner.runAllTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

module.exports = SecurityTestRunner;
