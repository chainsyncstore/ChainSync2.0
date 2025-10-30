import fetch from 'node-fetch';

async function testFrontendLogin() {
  const frontendUrl = 'http://localhost:5173';
  const credentials = {
    email: 'admin@chainsync.com',
    password: 'Admin123!'
  };
  
  console.log('🔐 Testing login through frontend proxy...');
  console.log('   Frontend URL:', frontendUrl);
  console.log('   Email:', credentials.email);
  
  try {
    // First get CSRF token if needed
    console.log('\n1. Getting CSRF token...');
    const csrfResp = await fetch(`${frontendUrl}/api/auth/csrf-token`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    let csrfToken = '';
    if (csrfResp.ok) {
      const csrfData = await csrfResp.json();
      csrfToken = csrfData.token || csrfData.csrfToken || '';
      console.log('   CSRF token obtained:', csrfToken ? 'Yes' : 'No');
    }
    
    // Now try login
    console.log('\n2. Attempting login...');
    const response = await fetch(`${frontendUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
      },
      body: JSON.stringify(credentials)
    });
    
    console.log('\n📡 Response:');
    console.log('   Status:', response.status, response.statusText);
    
    // Check for cookies
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      console.log('   🍪 Session cookie received!');
      console.log('      Cookie:', setCookie.substring(0, 80) + '...');
      
      // Check cookie domain
      if (setCookie.includes('Domain=localhost')) {
        console.log('   ✅ Cookie domain is correctly set to localhost');
      } else if (setCookie.includes('Domain=')) {
        const domainMatch = setCookie.match(/Domain=([^;]+)/);
        console.log('   ⚠️  Cookie domain is:', domainMatch ? domainMatch[1] : 'unknown');
      } else {
        console.log('   ⚠️  No explicit cookie domain set');
      }
    } else {
      console.log('   ❌ No session cookie in response');
    }
    
    // Parse response
    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
      console.log('\n📦 Response data:');
      console.log('   Status:', data.status);
      console.log('   Message:', data.message);
      if (data.user) {
        console.log('   User ID:', data.user.id);
        console.log('   User email:', data.user.email);
        console.log('   Is Admin:', data.user.is_admin || data.user.isAdmin);
      }
    } catch (e) {
      console.log('\n📦 Response (text):', responseText);
    }
    
    if (response.ok && data?.status === 'success') {
      console.log('\n✅ LOGIN SUCCESSFUL!');
      console.log('   The frontend proxy is working correctly.');
      console.log('   Session cookies are configured properly.');
      
      // Test if session persists
      console.log('\n3. Testing session persistence...');
      const meResponse = await fetch(`${frontendUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cookie': setCookie || ''
        }
      });
      
      console.log('   /api/auth/me status:', meResponse.status);
      if (meResponse.ok) {
        const meData = await meResponse.json();
        console.log('   ✅ Session is valid, user:', meData.email || meData.data?.email);
      } else {
        console.log('   ❌ Session check failed');
      }
      
    } else {
      console.log('\n❌ Login failed');
      console.log('   This might indicate:');
      console.log('   1. Cookie domain configuration issue');
      console.log('   2. CORS configuration problem');
      console.log('   3. Proxy not working correctly');
    }
    
  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
    console.log('\nPossible issues:');
    console.log('- Frontend not running on port 5173');
    console.log('- Backend not running on port 5001');
    console.log('- Vite proxy not configured correctly');
  }
}

testFrontendLogin();
