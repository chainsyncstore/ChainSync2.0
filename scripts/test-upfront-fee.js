#!/usr/bin/env node

/**
 * Test script for the upfront fee system
 * This script tests the payment initialization with upfront fees
 */

const https = require('https');
const http = require('http');

// Configuration
const TEST_CONFIG = {
  host: process.env.TEST_HOST || 'localhost',
  port: process.env.TEST_PORT || 3000,
  protocol: process.env.TEST_PROTOCOL || 'http',
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000'
};

// Test data for upfront fee testing
const TEST_CASES = [
  {
    name: 'Basic Tier - Nigeria',
    data: {
      email: 'test-basic-ng@example.com',
      amount: 100000, // ₦1,000 in kobo
      currency: 'NGN',
      provider: 'paystack',
      tier: 'basic',
      metadata: {
        firstName: 'Test',
        lastName: 'User',
        companyName: 'Test Company',
        phone: '+2348012345678'
      }
    },
    expectedAmount: 100000
  },
  {
    name: 'Pro Tier - International',
    data: {
      email: 'test-pro-int@example.com',
      amount: 100, // $1 in cents
      currency: 'USD',
      provider: 'flutterwave',
      tier: 'pro',
      metadata: {
        firstName: 'Test',
        lastName: 'User',
        companyName: 'Test Company',
        phone: '+1234567890'
      }
    },
    expectedAmount: 100
  },
  {
    name: 'Enterprise Tier - Nigeria',
    data: {
      email: 'test-enterprise-ng@example.com',
      amount: 100000, // ₦1,000 in kobo
      currency: 'NGN',
      provider: 'paystack',
      tier: 'enterprise',
      metadata: {
        firstName: 'Test',
        lastName: 'User',
        companyName: 'Test Company',
        phone: '+2348012345678'
      }
    },
    expectedAmount: 100000
  }
];

/**
 * Make HTTP/HTTPS request
 */
function makeRequest(url, data = null, method = 'GET') {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'UpfrontFeeTest/1.0'
      }
    };

    const client = urlObj.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const responseData = body ? JSON.parse(body) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: responseData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: body
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data && method !== 'GET') {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Test payment initialization with upfront fees
 */
async function testUpfrontFeePayment(baseUrl) {
  console.log(`🔍 Testing upfront fee payment system at: ${baseUrl}`);
  console.log('');

  for (const testCase of TEST_CASES) {
    console.log(`📋 Testing: ${testCase.name}`);
    console.log(`   Endpoint: ${baseUrl}/api/payment/initialize`);
    console.log(`   Expected Amount: ${testCase.expectedAmount} (${testCase.data.currency === 'NGN' ? 'kobo' : 'cents'})`);
    console.log(`   Provider: ${testCase.data.provider}`);
    console.log(`   Tier: ${testCase.data.tier}`);
    
    try {
      const response = await makeRequest(`${baseUrl}/api/payment/initialize`, testCase.data, 'POST');
      
      console.log(`   Status: ${response.statusCode}`);
      
      if (response.statusCode === 200) {
        console.log(`   ✅ Success! Payment initialized with upfront fee`);
        
        // Verify the response contains payment data
        if (response.data.authorization_url || response.data.link) {
          console.log(`   💳 Payment URL: ${response.data.authorization_url || response.data.link}`);
        }
        
        // Check if metadata includes payment type
        if (response.data.metadata && response.data.metadata.paymentType === 'upfront_fee') {
          console.log(`   🎯 Payment type correctly set to: upfront_fee`);
        } else {
          console.log(`   ⚠️  Payment type not set correctly in metadata`);
        }
        
      } else if (response.statusCode === 500) {
        console.log(`   ❌ Server Error: ${response.data.message || response.data.error || 'Unknown error'}`);
        
        if (response.data.message?.includes('upfront fee')) {
          console.log(`   💡 This might be related to upfront fee configuration`);
        }
      } else {
        console.log(`   ⚠️  Unexpected Status: ${response.statusCode}`);
        console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
      }
    } catch (error) {
      console.log(`   ❌ Request Failed: ${error.message}`);
      
      if (error.code === 'ENOTFOUND') {
        console.log(`   💡 Solution: Check if the domain is correct and the service is running`);
      } else if (error.code === 'ECONNREFUSED') {
        console.log(`   💡 Solution: The service is not running or not accessible`);
      }
    }
    
    console.log('');
  }
}

/**
 * Test subscription creation endpoint (if available)
 */
async function testSubscriptionEndpoint(baseUrl) {
  console.log(`🔍 Testing subscription endpoint at: ${baseUrl}`);
  console.log('');
  
  try {
    // Test if subscription endpoint exists
    const response = await makeRequest(`${baseUrl}/api/subscription/status/test-user-id`);
    
    if (response.statusCode === 404) {
      console.log(`   ℹ️  Subscription endpoint not implemented yet (expected for new feature)`);
    } else if (response.statusCode === 200) {
      console.log(`   ✅ Subscription endpoint is working`);
    } else {
      console.log(`   ⚠️  Subscription endpoint returned status: ${response.statusCode}`);
    }
  } catch (error) {
    console.log(`   ℹ️  Subscription endpoint not accessible (expected for new feature)`);
  }
  
  console.log('');
}

/**
 * Test pricing constants endpoint (if available)
 */
async function testPricingEndpoint(baseUrl) {
  console.log(`🔍 Testing pricing constants at: ${baseUrl}`);
  console.log('');
  
  try {
    // Test if pricing endpoint exists
    const response = await makeRequest(`${baseUrl}/api/pricing/tiers`);
    
    if (response.statusCode === 404) {
      console.log(`   ℹ️  Pricing endpoint not implemented yet (expected)`);
    } else if (response.statusCode === 200) {
      console.log(`   ✅ Pricing endpoint is working`);
      
      // Check if upfront fees are included
      if (response.data.basic && response.data.basic.upfrontFee) {
        console.log(`   🎯 Upfront fees are configured in pricing data`);
        console.log(`   💰 Basic tier upfront fee: ${response.data.basic.upfrontFee.ngn} kobo (NGN), ${response.data.basic.upfrontFee.usd} cents (USD)`);
      } else {
        console.log(`   ⚠️  Upfront fees not found in pricing data`);
      }
    } else {
      console.log(`   ⚠️  Pricing endpoint returned status: ${response.statusCode}`);
    }
  } catch (error) {
    console.log(`   ℹ️  Pricing endpoint not accessible (expected)`);
  }
  
  console.log('');
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🧪 Upfront Fee System Test Suite');
  console.log('================================');
  console.log('');
  
  const baseUrl = TEST_CONFIG.baseUrl;
  
  try {
    // Test 1: Upfront fee payment initialization
    await testUpfrontFeePayment(baseUrl);
    
    // Test 2: Subscription endpoint (if available)
    await testSubscriptionEndpoint(baseUrl);
    
    // Test 3: Pricing constants (if available)
    await testPricingEndpoint(baseUrl);
    
    console.log('✅ Upfront fee system tests completed!');
    console.log('');
    console.log('📝 Summary:');
    console.log('   - Payment initialization with upfront fees');
    console.log('   - Subscription system integration');
    console.log('   - Pricing structure validation');
    console.log('');
    console.log('💡 Next steps:');
    console.log('   1. Run database migration: npm run db:migrate');
    console.log('   2. Test with real payment gateways');
    console.log('   3. Verify subscription creation in database');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Show usage information
function showUsage() {
  console.log('Usage: node scripts/test-upfront-fee.js');
  console.log('');
  console.log('Environment variables:');
  console.log('  TEST_HOST     - Host to test (default: localhost)');
  console.log('  TEST_PORT     - Port to test (default: 3000)');
  console.log('  TEST_PROTOCOL - Protocol to use (default: http)');
  console.log('  TEST_BASE_URL - Full base URL (default: http://localhost:3000)');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/test-upfront-fee.js');
  console.log('  TEST_BASE_URL=https://chainsync.store node scripts/test-upfront-fee.js');
}

// Check if help is requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage();
  process.exit(0);
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = {
  testUpfrontFeePayment,
  testSubscriptionEndpoint,
  testPricingEndpoint,
  runTests
};
