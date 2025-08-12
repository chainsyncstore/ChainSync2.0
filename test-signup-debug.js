async function testSignup() {
  try {
    console.log('Testing CSRF token endpoint...');
    
    // First, get CSRF token
    const csrfResponse = await fetch('http://localhost:5000/api/auth/csrf-token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!csrfResponse.ok) {
      console.error('CSRF token request failed:', csrfResponse.status, csrfResponse.statusText);
      return;
    }
    
    const csrfData = await csrfResponse.json();
    console.log('CSRF token received:', csrfData.csrfToken ? 'Yes' : 'No');
    
    // Now test signup endpoint
    console.log('\nTesting signup endpoint...');
    
    const signupData = {
      firstName: "Test",
      lastName: "User", 
      email: "test@example.com",
      phone: "+1234567890",
      companyName: "Test Company",
      password: "TestPassword123!",
      tier: "basic",
      location: "international"
    };
    
    const signupResponse = await fetch('http://localhost:5000/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfData.csrfToken
      },
      body: JSON.stringify(signupData)
    });
    
    console.log('Signup response status:', signupResponse.status);
    console.log('Signup response headers:', Object.fromEntries(signupResponse.headers.entries()));
    
    if (signupResponse.ok) {
      const responseData = await signupResponse.json();
      console.log('Signup successful:', responseData);
    } else {
      const errorData = await signupResponse.text();
      console.log('Signup failed with error:', errorData);
    }
    
  } catch (error) {
    console.error('Test failed with error:', error.message);
    console.error('Error details:', error);
  }
}

testSignup();
