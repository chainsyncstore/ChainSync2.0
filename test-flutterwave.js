// Simple Flutterwave payment test to check for service worker issues
const http = require('http');

async function testFlutterwavePayment() {
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
    reference: 'FLUTTERWAVE_' + Date.now() + '_TEST',
    status: 'successful'
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
console.log('🧪 Testing Flutterwave payment...');
testFlutterwavePayment()
  .then(result => {
    console.log('Flutterwave payment test result:', result);
    if (result.statusCode === 200) {
      console.log('✅ Flutterwave payment working correctly');
    } else {
      console.log('❌ Flutterwave payment has issues');
    }
  })
  .catch(error => {
    console.error('Test failed:', error.message);
  });
