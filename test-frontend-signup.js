import fetch from 'node-fetch';

const testFrontendSignup = async () => {
  try {
    console.log('🧪 Testing signup through frontend proxy...');
    
    // Step 1: Get CSRF token through frontend proxy
    console.log('📡 Step 1: Fetching CSRF token through frontend...');
    const csrfResponse = await fetch('http://localhost:5173/api/auth/csrf-token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('📊 CSRF Response status:', csrfResponse.status);
    
    if (!csrfResponse.ok) {
      console.error('❌ CSRF token request failed:', csrfResponse.status, csrfResponse.statusText);
      return;
    }
    
    const csrfData = await csrfResponse.json();
    console.log('✅ CSRF token received:', csrfData.csrfToken ? 'Yes' : 'No');
    
    if (!csrfData.csrfToken) {
      console.error('❌ No CSRF token in response');
      return;
    }
    
    // Step 2: Test signup with CSRF token through frontend proxy
    console.log('📡 Step 2: Testing signup through frontend proxy...');
    const signupResponse = await fetch('http://localhost:5173/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfData.csrfToken
      },
      body: JSON.stringify({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
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

testFrontendSignup();
