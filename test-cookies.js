import fetch from 'node-fetch';

const testCookies = async () => {
  try {
    console.log('🧪 Testing CSRF token cookies...');
    
    // Step 1: Get CSRF token and check cookies
    console.log('📡 Step 1: Fetching CSRF token...');
    const response = await fetch('http://localhost:5000/api/auth/csrf-token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:');
    
    // Log all response headers
    for (const [key, value] of response.headers.entries()) {
      console.log(`  ${key}: ${value}`);
    }
    
    // Check for Set-Cookie header
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      console.log('🍪 Set-Cookie header found:', setCookieHeader);
    } else {
      console.log('❌ No Set-Cookie header found');
    }
    
    if (!response.ok) {
      console.error('❌ CSRF token request failed:', response.status, response.statusText);
      return;
    }
    
    const data = await response.json();
    console.log('📊 Response body:', data);
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
};

testCookies();
