#!/usr/bin/env node

/**
 * Payment Endpoint Test Script
 * This script tests the payment initialization endpoint to help diagnose
 * payment issues on the deployed ChainSync site.
 */

import https from 'https';
import http from 'http';

function makeRequest(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'ChainSync-Payment-Test/1.0'
      }
    };

    const req = client.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsed
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: responseData
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function testPaymentEndpoint(baseUrl) {
  console.log(`🔍 Testing payment endpoint at: ${baseUrl}`);
  console.log('');

  const testCases = [
    {
      name: 'Paystack Basic Plan (Nigeria)',
      data: {
        email: 'test@example.com',
        currency: 'NGN',
        provider: 'paystack',
        tier: 'basic',
        metadata: {
          firstName: 'Test',
          lastName: 'User',
          companyName: 'Test Company',
          phone: '+2348012345678'
        }
      }
    },
    {
      name: 'Flutterwave Basic Plan (International)',
      data: {
        email: 'test@example.com',
        currency: 'USD',
        provider: 'flutterwave',
        tier: 'basic',
        metadata: {
          firstName: 'Test',
          lastName: 'User',
          companyName: 'Test Company',
          phone: '+1234567890'
        }
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`📋 Testing: ${testCase.name}`);
    console.log(`   Endpoint: ${baseUrl}/api/payment/initialize`);
    console.log(`   Data: ${JSON.stringify(testCase.data, null, 2)}`);
    
    try {
      const response = await makeRequest(`${baseUrl}/api/payment/initialize`, testCase.data);
      
      console.log(`   Status: ${response.statusCode}`);
      
      if (response.statusCode === 200) {
        console.log(`   ✅ Success! Payment URL: ${response.data.authorization_url || response.data.link || 'Not provided'}`);
      } else if (response.statusCode === 500) {
        console.log(`   ❌ Server Error: ${response.data.message || response.data.error || 'Unknown error'}`);
        
        if (response.data.message?.includes('Payment service keys are required')) {
          console.log(`   💡 Solution: Add PAYSTACK_SECRET_KEY and FLUTTERWAVE_SECRET_KEY environment variables`);
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

function showUsage() {
  console.log('Usage: node scripts/test-payment-endpoint.js <base-url>');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/test-payment-endpoint.js https://chainsync.onrender.com');
  console.log('  node scripts/test-payment-endpoint.js https://yourdomain.com');
  console.log('');
  console.log('This script will test both Paystack and Flutterwave payment endpoints');
  console.log('to help diagnose payment issues on your deployed ChainSync site.');
}

async function main() {
  const baseUrl = process.argv[2];
  
  if (!baseUrl) {
    showUsage();
    process.exit(1);
  }
  
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    console.log('❌ Error: Base URL must start with http:// or https://');
    showUsage();
    process.exit(1);
  }
  
  try {
    await testPaymentEndpoint(baseUrl);
    console.log('🎉 Payment endpoint testing completed!');
    console.log('');
    console.log('If you see errors, check:');
    console.log('1. Environment variables are set correctly');
    console.log('2. Payment service keys are valid');
    console.log('3. Database connection is working');
    console.log('4. Service is properly deployed');
  } catch (error) {
    console.error('❌ Testing failed:', error.message);
    process.exit(1);
  }
}

main();
