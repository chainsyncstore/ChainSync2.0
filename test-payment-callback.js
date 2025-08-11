// Test script to verify payment callback route is working
const http = require('http');

// Test the payment callback route with Paystack parameters
function testPaystackCallback() {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/payment/callback?reference=PAYSTACK_1754901314619_LX3865&trxref=PAYSTACK_1754901314619_LX3865&status=success',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    console.log(`\n=== PAYSTACK CALLBACK TEST ===`);
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Response body:');
      console.log(data);
    });
  });

  req.on('error', (error) => {
    console.error('Error testing Paystack callback:', error);
  });

  req.end();
}

// Test the payment callback route with Flutterwave parameters
function testFlutterwaveCallback() {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/payment/callback?trx_ref=FLUTTERWAVE_1754901314619_LX3865&status=successful',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    console.log(`\n=== FLUTTERWAVE CALLBACK TEST ===`);
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Response body:');
      console.log(data);
    });
  });

  req.on('error', (error) => {
    console.error('Error testing Flutterwave callback:', error);
  });

  req.end();
}

// Test the payment verification API for Paystack
function testPaystackVerification() {
  const postData = JSON.stringify({
    reference: 'PAYSTACK_1754901314619_LX3865',
    status: 'success'
  });

  const options = {
    hostname: 'localhost',
    port: 5000, // Server port
    path: '/api/payment/verify',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`\n=== PAYSTACK VERIFICATION API TEST ===`);
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Payment verification response:');
      console.log(data);
    });
  });

  req.on('error', (error) => {
    console.error('Error testing Paystack verification:', error);
  });

  req.write(postData);
  req.end();
}

// Test the payment verification API for Flutterwave
function testFlutterwaveVerification() {
  const postData = JSON.stringify({
    reference: 'FLUTTERWAVE_1754901314619_LX3865',
    status: 'successful'
  });

  const options = {
    hostname: 'localhost',
    port: 5000, // Server port
    path: '/api/payment/verify',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`\n=== FLUTTERWAVE VERIFICATION API TEST ===`);
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Payment verification response:');
      console.log(data);
    });
  });

  req.on('error', (error) => {
    console.error('Error testing Flutterwave verification:', error);
  });

  req.write(postData);
  req.end();
}

// Test the Paystack webhook endpoint
function testPaystackWebhook() {
  const postData = JSON.stringify({
    event: 'charge.success',
    data: {
      reference: 'PAYSTACK_1754901314619_LX3865',
      amount: 500000,
      status: 'success',
      customer: { email: 'test@example.com' }
    }
  });

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/payment/paystack-webhook',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`\n=== PAYSTACK WEBHOOK TEST ===`);
    console.log(`Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Webhook response:');
      console.log(data);
    });
  });

  req.on('error', (error) => {
    console.error('Error testing Paystack webhook:', error);
  });

  req.write(postData);
  req.end();
}

// Test the Flutterwave webhook endpoint
function testFlutterwaveWebhook() {
  const postData = JSON.stringify({
    event: 'charge.completed',
    data: {
      tx_ref: 'FLUTTERWAVE_1754901314619_LX3865',
      amount: 500000,
      status: 'successful',
      customer: { email: 'test@example.com' }
    }
  });

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/payment/flutterwave-webhook',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`\n=== FLUTTERWAVE WEBHOOK TEST ===`);
    console.log(`Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Webhook response:');
      console.log(data);
    });
  });

  req.on('error', (error) => {
    console.error('Error testing Flutterwave webhook:', error);
  });

  req.write(postData);
  req.end();
}

console.log('Testing payment callback routes...');
testPaystackCallback();

setTimeout(() => {
  testFlutterwaveCallback();
}, 1000);

setTimeout(() => {
  console.log('\nTesting payment verification APIs...');
  testPaystackVerification();
}, 2000);

setTimeout(() => {
  testFlutterwaveVerification();
}, 3000);

setTimeout(() => {
  console.log('\nTesting webhook endpoints...');
  testPaystackWebhook();
}, 4000);

setTimeout(() => {
  testFlutterwaveWebhook();
}, 5000);
