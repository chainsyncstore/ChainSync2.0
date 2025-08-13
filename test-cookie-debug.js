import fetch from 'node-fetch';

const testCookieDebug = async () => {
  try {
    console.log('🧪 Testing cookie debugging...');
    
    // Step 1: Get CSRF token and check if cookie is set
    console.log('📡 Step 1: Fetching CSRF token...');
    const response = await fetch('http://localhost:5173/api/auth/csrf-token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('📊 Response status:', response.status);
    
    // Check for Set-Cookie header
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      console.log('🍪 Set-Cookie header found:', setCookieHeader);
    } else {
      console.log('❌ No Set-Cookie header found');
    }
    
    // Check all headers
    console.log('📊 All response headers:');
    for (const [key, value] of response.headers.entries()) {
      console.log(`  ${key}: ${value}`);
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

testCookieDebug();
