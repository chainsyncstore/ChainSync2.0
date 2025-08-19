import fetch from 'node-fetch';

async function testFrontendSignup() {
  try {
    console.log('🧪 Testing frontend-style signup...');
    
    // First, get a CSRF token
    console.log('🔑 Fetching CSRF token...');
    const csrfResponse = await fetch('https://chainsync.store/api/auth/csrf-token', {
      method: 'GET',
      credentials: 'include',
    });
    
    if (!csrfResponse.ok) {
      console.error('❌ Failed to get CSRF token:', csrfResponse.status, csrfResponse.statusText);
      return;
    }
    
    const csrfData = await csrfResponse.json();
    const csrfToken = csrfData.csrfToken;
    console.log('✅ CSRF token received:', csrfToken ? 'Yes' : 'No');
    
    // Get cookies from the response
    const cookies = csrfResponse.headers.get('set-cookie');
    console.log('🍪 Cookies received:', cookies ? 'Yes' : 'No');
    
    // Simulate the exact data the frontend would send
    const signupData = {
      firstName: "Test",
      lastName: "User",
      email: `test${Date.now()}@example.com`,
      phone: "+1234567890",
      companyName: "Test Company",
      password: "TestPass123!", // This should meet the new requirements
      tier: "basic",
      location: "nigeria",
      recaptchaToken: `dev-token-signup-${Date.now()}` // Simulate the fallback token
    };
    
    console.log('📤 Sending frontend-style signup request with data:', {
      ...signupData,
      password: '[HIDDEN]'
    });
    
    const response = await fetch('https://chainsync.store/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        'Cookie': cookies || '',
      },
      credentials: 'include',
      body: JSON.stringify(signupData)
    });
    
    console.log('📥 Response status:', response.status);
    console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('📥 Response body:', responseText);
    
    if (response.ok) {
      console.log('✅ Frontend-style signup successful!');
      try {
        const data = JSON.parse(responseText);
        console.log('📊 Response data:', data);
      } catch (e) {
        console.log('⚠️ Response is not valid JSON');
      }
    } else {
      console.log('❌ Frontend-style signup failed with status:', response.status);
      try {
        const errorData = JSON.parse(responseText);
        console.log('🚨 Error details:', errorData);
        
        // Show validation details if available
        if (errorData.details && Array.isArray(errorData.details)) {
          console.log('🔍 Validation errors:');
          errorData.details.forEach((detail, index) => {
            console.log(`  ${index + 1}. Field: ${detail.field}, Message: ${detail.message}`);
          });
        }
      } catch (e) {
        console.log('⚠️ Error response is not valid JSON');
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
testFrontendSignup();
