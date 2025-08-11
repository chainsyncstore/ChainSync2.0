// Test the payment callback route directly
const http = require('http');

function testPaymentCallbackRoute() {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/payment/callback?reference=PAYSTACK_TEST_123&trxref=PAYSTACK_TEST_123&status=success',
    method: 'GET',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };

  console.log('🧪 Testing payment callback route...');
  console.log('📍 URL:', `http://${options.hostname}:${options.port}${options.path}`);

  const req = http.request(options, (res) => {
    console.log(`\n📊 Response Status: ${res.statusCode}`);
    console.log(`📋 Response Headers:`, res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('\n📄 Response Body Preview:');
      console.log(data.substring(0, 500) + (data.length > 500 ? '...' : ''));
      
      if (res.statusCode === 200) {
        console.log('\n✅ Payment callback route is working!');
        
        if (data.includes('Payment Callback') || data.includes('Processing Payment')) {
          console.log('✅ Page content looks correct');
        } else {
          console.log('⚠️  Page content may be unexpected');
        }
      } else {
        console.log(`\n❌ Payment callback route returned status: ${res.statusCode}`);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
  });

  req.setTimeout(10000, () => {
    console.error('❌ Request timed out');
    req.destroy();
  });

  req.end();
}

// Run test
testPaymentCallbackRoute();
