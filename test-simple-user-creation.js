import fetch from 'node-fetch';

const testSimpleUserCreation = async () => {
  try {
    console.log('🧪 Testing simple user creation...');
    
    // Test if we can access the database through a simple endpoint
    console.log('📡 Testing database access through health check...');
    const healthResponse = await fetch('http://localhost:5173/api/health', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('✅ Health check successful:', healthData);
      
      if (healthData.database === 'connected') {
        console.log('✅ Database is connected and healthy');
      } else {
        console.log('❌ Database is not healthy:', healthData.database);
        return;
      }
    } else {
      console.log('❌ Health check failed:', healthResponse.status);
      return;
    }
    
    // Test if we can access the storage service
    console.log('\n📡 Testing storage service access...');
    
    // Try to get a list of users (this should work even if empty)
    const usersResponse = await fetch('http://localhost:5173/api/users', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('📊 Users endpoint status:', usersResponse.status);
    
    if (usersResponse.ok) {
      const usersData = await usersResponse.json();
      console.log('✅ Users endpoint working');
    } else {
      const errorData = await usersResponse.text();
      console.log('❌ Users endpoint failed:', errorData);
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
};

testSimpleUserCreation();
