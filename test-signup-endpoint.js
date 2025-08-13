import fetch from 'node-fetch';

const testSignup = async () => {
  try {
    console.log('🧪 Testing signup endpoint...');
    
    const response = await fetch('http://localhost:5000/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
    
    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.text();
    console.log('📊 Response body:', data);
    
    if (response.ok) {
      console.log('✅ Signup successful!');
    } else {
      console.log('❌ Signup failed with status:', response.status);
    }
    
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
};

testSignup();
