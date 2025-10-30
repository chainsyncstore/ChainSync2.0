// COPY AND PASTE THIS INTO YOUR BROWSER CONSOLE AT http://localhost:5173/login

console.clear();
console.log('🔍 ChainSync Login Diagnostic Test\n');
console.log('Testing with: admin@chainsync.com / Admin123!\n');
console.log('=' .repeat(50));

// Test 1: Check if API is reachable
fetch('/api/auth/me')
  .then(r => {
    console.log(`✓ API Reachable: ${r.status} ${r.statusText}`);
    return r.json();
  })
  .then(data => console.log('  Current session:', data))
  .catch(e => console.error('✗ API Error:', e));

// Test 2: Try login directly via fetch
async function testDirectLogin() {
  try {
    console.log('\n🔐 Testing direct login via fetch...');
    
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        email: 'admin@chainsync.com',
        password: 'Admin123!'
      })
    });
    
    const data = await response.json();
    
    if (response.ok && data.status === 'success') {
      console.log('✅ LOGIN SUCCESSFUL!');
      console.log('  User:', data.user);
      console.log('  Session cookie:', document.cookie);
      console.log('\n👉 The backend is working! The issue is in the React component.');
      console.log('👉 Try refreshing the page and entering:');
      console.log('   Email: admin@chainsync.com');
      console.log('   Password: Admin123!');
    } else {
      console.log('❌ Login failed:', data.message || data);
      console.log('  Status:', response.status);
      console.log('  Response:', data);
    }
  } catch (error) {
    console.error('❌ Network error:', error);
  }
}

// Test 3: Check React components
console.log('\n📦 Checking React components...');
if (typeof React !== 'undefined') {
  console.log('✓ React is loaded');
} else {
  console.log('✗ React not found');
}

// Run the login test
testDirectLogin();

// Instructions
console.log('\n' + '=' .repeat(50));
console.log('📝 INSTRUCTIONS:');
console.log('1. If you see "LOGIN SUCCESSFUL" above, the backend works.');
console.log('2. Try entering in the login form:');
console.log('   - Email field: admin@chainsync.com');
console.log('   - Password field: Admin123!');
console.log('3. If that fails, refresh the page (F5) and try again.');
console.log('=' .repeat(50));
