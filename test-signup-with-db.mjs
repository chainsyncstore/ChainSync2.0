import fetch from 'node-fetch';

const testSignupWithDatabase = async () => {
  try {
    console.log('🧪 Testing signup with actual database...');
    
    // Step 1: Get CSRF token
    console.log('📡 Step 1: Fetching CSRF token...');
    const csrfResponse = await fetch('http://localhost:5000/api/auth/csrf-token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!csrfResponse.ok) {
      console.error('❌ CSRF token request failed:', csrfResponse.status);
      return;
    }
    
    const csrfData = await csrfResponse.json();
    console.log('✅ CSRF token received');
    
    // Step 2: Test signup
    console.log('📡 Step 2: Testing signup...');
    const uniqueEmail = `test${Date.now()}@example.com`;
    const signupResponse = await fetch('http://localhost:5000/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfData.csrfToken
      },
      body: JSON.stringify({
        firstName: 'Test',
        lastName: 'User',
        email: uniqueEmail,
        phone: '+1234567890',
        companyName: 'Test Company',
        password: 'TestPassword123!',
        tier: 'basic',
        location: 'nigeria'
      })
    });
    
    console.log('📊 Signup response status:', signupResponse.status);
    
    if (signupResponse.ok) {
      const responseData = await signupResponse.json();
      console.log('✅ Signup successful:', responseData);
    } else {
      const errorData = await signupResponse.text();
      console.log('❌ Signup failed with error:', errorData);
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
};

testSignupWithDatabase();
