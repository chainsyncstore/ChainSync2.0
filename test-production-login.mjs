import fetch from 'node-fetch';

async function testProductionLogin() {
  const prodUrl = 'https://chainsync.store/api/auth/login';
  
  const credentials = {
    email: 'admin@chainsync.com',
    password: 'Admin123!'
  };
  
  console.log('🔐 Testing production login at:', prodUrl);
  console.log('   Email:', credentials.email);
  
  try {
    const response = await fetch(prodUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(credentials)
    });
    
    const responseText = await response.text();
    console.log('\n📡 Response status:', response.status);
    console.log('   Status text:', response.statusText);
    
    // Check for important headers
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      console.log('   🍪 Session cookie:', setCookie.substring(0, 50) + '...');
    }
    
    let data;
    try {
      data = JSON.parse(responseText);
      console.log('\n📦 Response body:', JSON.stringify(data, null, 2));
    } catch (e) {
      console.log('\n📦 Response body (text):', responseText);
    }
    
    if (response.ok) {
      console.log('\n✅ LOGIN SUCCESSFUL ON PRODUCTION!');
      console.log('   The production site is now working.');
      console.log('   You can login at: https://chainsync.store/login');
    } else {
      console.log('\n❌ Login failed:', data?.message || data?.error || 'Unknown error');
      console.log('\nPossible issues:');
      console.log('1. The server code may need to be redeployed');
      console.log('2. Check Render logs for errors');
      console.log('3. Environment variables may be missing');
    }
  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
    console.log('\nThis might mean:');
    console.log('- Server is down or restarting');
    console.log('- Network connectivity issue');
  }
}

testProductionLogin();
