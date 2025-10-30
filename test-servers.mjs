import fetch from 'node-fetch';

async function testServers() {
  console.log('🔍 Testing servers...\n');
  
  // Test backend
  try {
    console.log('1. Testing backend on port 5001...');
    const backendResp = await fetch('http://localhost:5001/healthz');
    console.log(`   Backend status: ${backendResp.status} ${backendResp.statusText}`);
    
    // Try login on backend
    const loginResp = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@chainsync.com',
        password: 'Admin123!'
      })
    });
    const loginData = await loginResp.json();
    console.log(`   Login test: ${loginResp.status} - ${loginData.status || loginData.message}`);
  } catch (err) {
    console.log(`   ❌ Backend error: ${err.message}`);
  }
  
  // Test frontend
  try {
    console.log('\n2. Testing frontend on port 5173...');
    const frontendResp = await fetch('http://localhost:5173/');
    console.log(`   Frontend status: ${frontendResp.status} ${frontendResp.statusText}`);
    
    // Try API proxy
    const proxyResp = await fetch('http://localhost:5173/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@chainsync.com',
        password: 'Admin123!'
      })
    });
    const proxyData = await proxyResp.json();
    console.log(`   Proxy test: ${proxyResp.status} - ${proxyData.status || proxyData.message}`);
  } catch (err) {
    console.log(`   ❌ Frontend error: ${err.message}`);
  }
  
  console.log('\n3. Testing CORS headers...');
  try {
    const corsResp = await fetch('http://localhost:5001/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    console.log(`   CORS preflight: ${corsResp.status}`);
    console.log(`   Access-Control-Allow-Origin: ${corsResp.headers.get('access-control-allow-origin')}`);
    console.log(`   Access-Control-Allow-Credentials: ${corsResp.headers.get('access-control-allow-credentials')}`);
  } catch (err) {
    console.log(`   ❌ CORS error: ${err.message}`);
  }
}

testServers();
