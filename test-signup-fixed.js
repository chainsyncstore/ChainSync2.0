const fetch = require('node-fetch');

async function testSignup() {
  try {
    console.log('🧪 Testing signup endpoint with fixes applied...');
    
    const signupData = {
      firstName: "Test",
      lastName: "User",
      email: `test${Date.now()}@example.com`,
      phone: "+1234567890",
      companyName: "Test Company",
      password: "TestPass123!", // Updated to match new validation requirements
      tier: "pro", // This should now work with the corrected schema
      location: "international",
      recaptchaToken: "test-token" // Add a test captcha token
    };
    
    console.log('📤 Sending signup request with data:', {
      ...signupData,
      password: '[HIDDEN]'
    });
    
    const response = await fetch('https://chainsync.store/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(signupData)
    });
    
    console.log('📥 Response status:', response.status);
    console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('📥 Response body:', responseText);
    
    if (response.ok) {
      console.log('✅ Signup successful!');
      try {
        const data = JSON.parse(responseText);
        console.log('📊 Response data:', data);
      } catch (parseError) {
        console.log('⚠️ Response is not valid JSON:', parseError.message);
      }
    } else {
      console.log('❌ Signup failed with status:', response.status);
      try {
        const errorData = JSON.parse(responseText);
        console.log('🚨 Error details:', errorData);
      } catch (parseError) {
        console.log('⚠️ Error response is not valid JSON:', parseError.message);
      }
    }
    
  } catch (error) {
    console.error('💥 Test failed with error:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
  }
}

// Run the test
testSignup();
