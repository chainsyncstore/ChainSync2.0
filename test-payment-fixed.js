// Simple test for payment callback after service worker fixes
const http = require('http');

async function testPaymentCallback() {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/payment/verify',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const data = {
    reference: 'PAYSTACK_' + Date.now() + '_TEST',
    status: 'success'
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (error) {
          resolve({ statusCode: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

// Run test
testPaymentCallback()
  .then(result => {
    console.log('Payment verification test result:', result);
    if (result.statusCode === 200) {
      console.log('✅ Payment callback working correctly');
    } else {
      console.log('❌ Payment callback has issues');
    }
  })
  .catch(error => {
    console.error('Test failed:', error.message);
  });
