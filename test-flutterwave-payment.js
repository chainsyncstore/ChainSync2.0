// Test script to verify Flutterwave payment functionality
// This tests if Flutterwave has the same service worker issues as Paystack

const http = require('http');

// Test configuration
const TEST_CONFIG = {
  host: 'localhost',
  port: 3000,
  flutterwaveReference: 'FLUTTERWAVE_' + Date.now() + '_TEST',
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

// Test 1: Test Flutterwave payment verification endpoint
async function testFlutterwavePaymentVerification() {
  console.log('\n=== Test 1: Flutterwave Payment Verification Endpoint ===');
  
  try {
    const response = await makeRequest({
      hostname: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      path: '/api/payment/verify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': JSON.stringify({
          reference: TEST_CONFIG.flutterwaveReference,
          status: 'successful'
        }).length
      }
    }, {
      reference: TEST_CONFIG.flutterwaveReference,
      status: 'successful'
    });

    console.log('Response Status:', response.statusCode);
    console.log('Response Data:', response.data);
    
    if (response.statusCode === 200) {
      console.log('✅ Flutterwave payment verification endpoint working correctly');
    } else {
      console.log('❌ Flutterwave payment verification endpoint returned error status');
    }
  } catch (error) {
    console.error('❌ Flutterwave payment verification test failed:', error.message);
  }
}

// Test 2: Test Flutterwave payment callback page
async function testFlutterwavePaymentCallbackPage() {
  console.log('\n=== Test 2: Flutterwave Payment Callback Page ===');
  
  try {
    const response = await makeRequest({
      hostname: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      path: `/payment/callback?trx_ref=${TEST_CONFIG.flutterwaveReference}&status=successful`,
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    console.log('Response Status:', response.statusCode);
    
    if (response.statusCode === 200) {
      console.log('✅ Flutterwave payment callback page accessible');
      
      // Check if the page contains expected content
      const html = response.data;
      if (typeof html === 'string') {
        if (html.includes('Payment Callback') || html.includes('Processing Payment')) {
          console.log('✅ Flutterwave payment callback page contains expected content');
        } else {
          console.log('⚠️  Flutterwave payment callback page content may be unexpected');
        }
      }
    } else {
      console.log('❌ Flutterwave payment callback page returned error status');
    }
  } catch (error) {
    console.error('❌ Flutterwave payment callback page test failed:', error.message);
  }
}

// Test 3: Test Flutterwave webhook endpoint
async function testFlutterwaveWebhook() {
  console.log('\n=== Test 3: Flutterwave Webhook Endpoint ===');
  
  try {
    const webhookData = {
      event: 'charge.completed',
      data: {
        tx_ref: TEST_CONFIG.flutterwaveReference,
        amount: '5000',
        status: 'successful',
        customer: {
          email: 'test@example.com'
        }
      }
    };

    const response = await makeRequest({
      hostname: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      path: '/api/payment/flutterwave-webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': JSON.stringify(webhookData).length
      }
    }, webhookData);

    console.log('Response Status:', response.statusCode);
    console.log('Response Data:', response.data);
    
    if (response.statusCode === 200) {
      console.log('✅ Flutterwave webhook endpoint working correctly');
    } else {
      console.log('❌ Flutterwave webhook endpoint returned error status');
    }
  } catch (error) {
    console.error('❌ Flutterwave webhook test failed:', error.message);
  }
}

// Test 4: Test Flutterwave payment initialization
async function testFlutterwavePaymentInitialization() {
  console.log('\n=== Test 4: Flutterwave Payment Initialization ===');
  
  try {
    const paymentData = {
      email: 'test@example.com',
      amount: '5000',
      currency: 'NGN',
      reference: TEST_CONFIG.flutterwaveReference,
      callback_url: `http://${TEST_CONFIG.host}:${TEST_CONFIG.port}/payment/callback`
    };

    const response = await makeRequest({
      hostname: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      path: '/api/payment/initialize',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': JSON.stringify(paymentData).length
      }
    }, paymentData);

    console.log('Response Status:', response.statusCode);
    console.log('Response Data:', response.data);
    
    if (response.statusCode === 200) {
      console.log('✅ Flutterwave payment initialization working correctly');
    } else {
      console.log('❌ Flutterwave payment initialization returned error status');
    }
  } catch (error) {
    console.error('❌ Flutterwave payment initialization test failed:', error.message);
  }
}

// Test 5: Test service worker with Flutterwave flow
async function testServiceWorkerWithFlutterwave() {
  console.log('\n=== Test 5: Service Worker Status with Flutterwave ===');
  
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
        
        // Check if service worker handles Flutterwave URLs
        if (swContent.includes('flutterwave') || swContent.includes('trx_ref')) {
          console.log('✅ Service worker appears to handle Flutterwave URLs');
        } else {
          console.log('⚠️  Service worker may not specifically handle Flutterwave URLs');
        }
      }
    } else {
      console.log('❌ Service worker file not accessible');
    }
  } catch (error) {
    console.error('❌ Service worker test failed:', error.message);
  }
}

// Main test runner
async function runFlutterwaveTests() {
  console.log('🧪 Starting Flutterwave Payment Tests...');
  console.log(`📍 Testing against: ${TEST_CONFIG.host}:${TEST_CONFIG.port}`);
  console.log(`🔑 Test Flutterwave Reference: ${TEST_CONFIG.flutterwaveReference}`);
  
  try {
    await testFlutterwavePaymentVerification();
    await testFlutterwavePaymentCallbackPage();
    await testFlutterwaveWebhook();
    await testFlutterwavePaymentInitialization();
    await testServiceWorkerWithFlutterwave();
    
    console.log('\n🎉 All Flutterwave tests completed!');
    console.log('\n📋 Summary:');
    console.log('- If you see ✅ marks, the Flutterwave functionality is working correctly');
    console.log('- If you see ❌ marks, there are issues that need fixing');
    console.log('- If you see ⚠️ marks, there may be minor issues or expected behavior');
    
    console.log('\n🔍 Key Differences from Paystack:');
    console.log('- Flutterwave uses `trx_ref` parameter instead of `reference`/`trxref`');
    console.log('- Flutterwave callback status is `successful` instead of `success`');
    console.log('- Flutterwave has a dedicated webhook endpoint at `/api/payment/flutterwave-webhook`');
    
  } catch (error) {
    console.error('\n💥 Flutterwave test suite failed:', error.message);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runFlutterwaveTests().catch(console.error);
}

module.exports = {
  runFlutterwaveTests,
  testFlutterwavePaymentVerification,
  testFlutterwavePaymentCallbackPage,
  testFlutterwaveWebhook,
  testFlutterwavePaymentInitialization,
  testServiceWorkerWithFlutterwave
};
