import fetch from 'node-fetch';

async function testLogin() {
  const loginUrl = 'http://localhost:5001/api/auth/login';
  
  // Test credentials
  const credentials = {
    email: 'admin@chainsync.com',
    password: 'Admin123!'
  };
  
  console.log('🔐 Testing login with:', credentials.email);
  
  try {
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(credentials)
    });
    
    const responseText = await response.text();
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers.raw());
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.log('Response body (text):', responseText);
      return;
    }
    
    console.log('Response body (JSON):', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('✅ Login successful!');
      if (data.user) {
        console.log('User data:', data.user);
      }
    } else {
      console.log('❌ Login failed:', data.message || data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('❌ Request failed:', error);
  }
}

testLogin();
