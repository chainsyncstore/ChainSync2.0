// Test script to verify payment callback functionality
// This tests the payment callback without service worker interference

const http = require('http');
const https = require('https');

// Test configuration
const TEST_CONFIG = {
  host: 'localhost',
  port: 3000,
  paymentReference: 'PAYSTACK_' + Date.now() + '_TEST',
  timeout: 10000
};

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
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

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.setTimeout(TEST_CONFIG.timeout);

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test 1: Test payment verification endpoint directly
async function testPaymentVerification() {
  console.log('\n=== Test 1: Payment Verification Endpoint ===');
  
  try {
    const response = await makeRequest({
      hostname: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      path: '/api/payment/verify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': JSON.stringify({
          reference: TEST_CONFIG.paymentReference,
          status: 'success'
        }).length
      }
    }, {
      reference: TEST_CONFIG.paymentReference,
      status: 'success'
    });

    console.log('Response Status:', response.statusCode);
    console.log('Response Data:', response.data);
    
    if (response.statusCode === 200) {
      console.log('✅ Payment verification endpoint working correctly');
    } else {
      console.log('❌ Payment verification endpoint returned error status');
    }
  } catch (error) {
    console.error('❌ Payment verification test failed:', error.message);
  }
}

// Test 2: Test payment callback page
async function testPaymentCallbackPage() {
  console.log('\n=== Test 2: Payment Callback Page ===');
  
  try {
    const response = await makeRequest({
      hostname: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      path: `/payment/callback?reference=${TEST_CONFIG.paymentReference}&trxref=${TEST_CONFIG.paymentReference}&status=success`,
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    console.log('Response Status:', response.statusCode);
    
    if (response.statusCode === 200) {
      console.log('✅ Payment callback page accessible');
      
      // Check if the page contains expected content
      const html = response.data;
      if (typeof html === 'string') {
        if (html.includes('Payment Callback') || html.includes('Processing Payment')) {
          console.log('✅ Payment callback page contains expected content');
        } else {
          console.log('⚠️  Payment callback page content may be unexpected');
        }
      }
    } else {
      console.log('❌ Payment callback page returned error status');
    }
  } catch (error) {
    console.error('❌ Payment callback page test failed:', error.message);
  }
}

// Test 3: Test service worker registration
async function testServiceWorkerRegistration() {
  console.log('\n=== Test 3: Service Worker Status ===');
  
  try {
    const response = await makeRequest({
      hostname: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      path: '/sw.js',
      method: 'GET',
      headers: {
        'Accept': 'application/javascript'
      }
    });

    console.log('Response Status:', response.statusCode);
    
    if (response.statusCode === 200) {
      console.log('✅ Service worker file accessible');
      
      // Check if service worker contains development mode check
      const swContent = response.data;
      if (typeof swContent === 'string') {
        if (swContent.includes('development mode')) {
          console.log('✅ Service worker has development mode protection');
        } else {
          console.log('⚠️  Service worker may not have development mode protection');
        }
      }
    } else {
      console.log('❌ Service worker file not accessible');
    }
  } catch (error) {
    console.error('❌ Service worker test failed:', error.message);
  }
}

// Test 4: Test API endpoints
async function testAPIEndpoints() {
  console.log('\n=== Test 4: API Endpoints ===');
  
  try {
    // Test a simple API endpoint
    const response = await makeRequest({
      hostname: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      path: '/api/health',
      method: 'GET'
    });

    console.log('Health Check Status:', response.statusCode);
    
    if (response.statusCode === 200) {
      console.log('✅ API endpoints accessible');
    } else {
      console.log('⚠️  API endpoints may have issues');
    }
  } catch (error) {
    console.log('⚠️  API endpoints test failed (this may be expected):', error.message);
  }
}

// Main test runner
async function runTests() {
  console.log('🧪 Starting Payment Callback Tests...');
  console.log(`📍 Testing against: ${TEST_CONFIG.host}:${TEST_CONFIG.port}`);
  console.log(`🔑 Test Payment Reference: ${TEST_CONFIG.paymentReference}`);
  
  try {
    await testPaymentVerification();
    await testPaymentCallbackPage();
    await testServiceWorkerRegistration();
    await testAPIEndpoints();
    
    console.log('\n🎉 All tests completed!');
    console.log('\n📋 Summary:');
    console.log('- If you see ✅ marks, the functionality is working correctly');
    console.log('- If you see ❌ marks, there are issues that need fixing');
    console.log('- If you see ⚠️ marks, there may be minor issues or expected behavior');
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  runTests,
  testPaymentVerification,
  testPaymentCallbackPage,
  testServiceWorkerRegistration,
  testAPIEndpoints
};
