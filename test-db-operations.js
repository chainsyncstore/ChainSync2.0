import fetch from 'node-fetch';

const testDbOperations = async () => {
  try {
    console.log('🧪 Testing database operations...');
    
    // Test health check endpoint
    console.log('📡 Testing health check...');
    const healthResponse = await fetch('http://localhost:5173/api/health', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('📊 Health check status:', healthResponse.status);
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('📊 Health check data:', healthData);
    } else {
      const errorData = await healthResponse.text();
      console.log('❌ Health check failed:', errorData);
    }
    
    // Test CSRF token endpoint
    console.log('\n📡 Testing CSRF token...');
    const csrfResponse = await fetch('http://localhost:5173/api/auth/csrf-token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('📊 CSRF status:', csrfResponse.status);
    
    if (csrfResponse.ok) {
      const csrfData = await csrfResponse.json();
      console.log('✅ CSRF token received:', csrfData);
    } else {
      const errorData = await csrfResponse.text();
      console.log('❌ CSRF failed:', errorData);
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
};

testDbOperations();
