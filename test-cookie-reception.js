import fetch from 'node-fetch';

const testCookieReception = async () => {
  try {
    console.log('🧪 Testing cookie reception...');
    
    // Step 1: Get CSRF token
    console.log('📡 Step 1: Fetching CSRF token...');
    const csrfResponse = await fetch('http://localhost:5173/api/auth/csrf-token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!csrfResponse.ok) {
      console.error('❌ CSRF token request failed:', csrfResponse.status, csrfResponse.statusText);
      return;
    }
    
    const csrfData = await csrfResponse.json();
    console.log('✅ CSRF token received:', csrfData.csrfToken ? 'Yes' : 'No');
    
    // Get the Set-Cookie header
    const setCookieHeader = csrfResponse.headers.get('set-cookie');
    console.log('🍪 Set-Cookie header:', setCookieHeader);
    
    // Extract the cookie value
    let cookieValue = '';
    if (setCookieHeader) {
      const match = setCookieHeader.match(/csrf-token=([^;]+)/);
      if (match) {
        cookieValue = match[1];
        console.log('🍪 Extracted cookie value:', cookieValue);
      }
    }
    
    // Step 2: Test signup with the cookie value
    console.log('📡 Step 2: Testing signup with cookie...');
    const signupResponse = await fetch('http://localhost:5173/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfData.csrfToken,
        'Cookie': `csrf-token=${cookieValue}`
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

testCookieReception();
