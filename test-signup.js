const testSignup = async () => {
  try {
    // Test 1: Valid signup
    console.log('🧪 Testing valid signup...');
    const validResponse = await fetch('http://localhost:5000/api/auth/signup', {
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
        location: 'international'
      })
    });
    
    const validData = await validResponse.json();
    console.log('✅ Valid signup response:', validData);
    
    // Test 2: Duplicate email (should return DUPLICATE_EMAIL error)
    console.log('\n🧪 Testing duplicate email...');
    const duplicateResponse = await fetch('http://localhost:5000/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName: 'Another',
        lastName: 'User',
        email: 'test@example.com', // Same email
        phone: '+1234567890',
        companyName: 'Another Company',
        password: 'AnotherPassword123!',
        tier: 'basic',
        location: 'international'
      })
    });
    
    const duplicateData = await duplicateResponse.json();
    console.log('✅ Duplicate email response:', duplicateData);
    
    // Test 3: Invalid data (should return VALIDATION_ERROR)
    console.log('\n🧪 Testing invalid data...');
    const invalidResponse = await fetch('http://localhost:5000/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName: '', // Empty first name
        lastName: 'User',
        email: 'invalid-email', // Invalid email
        phone: '+1234567890',
        companyName: 'Test Company',
        password: '123', // Too short password
        tier: 'invalid-tier', // Invalid tier
        location: 'invalid-location' // Invalid location
      })
    });
    
    const invalidData = await invalidResponse.json();
    console.log('✅ Invalid data response:', invalidData);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

// Run the test
testSignup();
