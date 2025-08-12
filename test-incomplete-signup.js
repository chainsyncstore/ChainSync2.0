#!/usr/bin/env node

/**
 * Test script for incomplete signup retry functionality
 * Tests the scenario where a user can retry signup with the same email
 */

const http = require('http');

function testIncompleteSignupRetry() {
  console.log('🧪 Testing incomplete signup retry functionality...\n');

  // Test 1: Initial signup attempt
  console.log('📝 Test 1: Initial signup attempt');
  testSignup({
    firstName: 'John',
    lastName: 'Doe',
    email: 'test-incomplete@example.com',
    phone: '+1234567890',
    companyName: 'Test Company',
    password: 'StrongPass123!',
    tier: 'basic',
    location: 'nigeria'
  }, 'Initial signup');

  // Test 2: Retry signup with same email (should resume incomplete signup)
  setTimeout(() => {
    console.log('\n📝 Test 2: Retry signup with same email (should resume)');
    testSignup({
      firstName: 'John',
      lastName: 'Doe',
      email: 'test-incomplete@example.com',
      phone: '+1234567890',
      companyName: 'Test Company',
      password: 'StrongPass123!',
      tier: 'basic',
      location: 'nigeria'
    }, 'Retry signup');
  }, 2000);

  // Test 3: Try to complete signup
  setTimeout(() => {
    console.log('\n📝 Test 3: Complete signup');
    testCompleteSignup('test-user-id');
  }, 4000);

  // Test 4: Cleanup abandoned signups
  setTimeout(() => {
    console.log('\n📝 Test 4: Cleanup abandoned signups');
    testCleanupAbandonedSignups();
  }, 6000);
}

function testSignup(userData, testName) {
  const postData = JSON.stringify(userData);
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/signup',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`   📊 Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        console.log(`   📋 Response: ${response.message}`);
        
        if (response.isResume) {
          console.log(`   ✅ SUCCESS: Incomplete signup resumed for ${testName}`);
          console.log(`   🔄 User ID: ${response.user.id}`);
          console.log(`   📊 Signup attempts: ${response.user.signupAttempts}`);
        } else if (res.statusCode === 201) {
          console.log(`   ✅ SUCCESS: New signup created for ${testName}`);
          console.log(`   🆔 User ID: ${response.user.id}`);
        } else {
          console.log(`   ⚠️  Unexpected response for ${testName}`);
        }
      } catch (parseError) {
        console.log(`   ❌ Failed to parse response for ${testName}:`, parseError.message);
      }
    });
  });

  req.on('error', (error) => {
    console.error(`   ❌ Request failed for ${testName}:`, error.message);
  });

  req.write(postData);
  req.end();
}

function testCompleteSignup(userId) {
  const postData = JSON.stringify({ userId });
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/complete-signup',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`   📊 Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        console.log(`   📋 Response: ${response.message}`);
        
        if (res.statusCode === 200) {
          console.log(`   ✅ SUCCESS: Signup completed for user ${userId}`);
        } else {
          console.log(`   ❌ Failed to complete signup for user ${userId}`);
        }
      } catch (parseError) {
        console.log(`   ❌ Failed to parse response:`, parseError.message);
      }
    });
  });

  req.on('error', (error) => {
    console.error(`   ❌ Request failed:`, error.message);
  });

  req.write(postData);
  req.end();
}

function testCleanupAbandonedSignups() {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/cleanup-abandoned-signups',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': '0'
    }
  };

  const req = http.request(options, (res) => {
    console.log(`   📊 Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        console.log(`   📋 Response: ${response.message}`);
        
        if (res.statusCode === 200) {
          console.log(`   ✅ SUCCESS: Cleaned up ${response.deletedCount} abandoned signups`);
        } else {
          console.log(`   ❌ Failed to cleanup abandoned signups`);
        }
      } catch (parseError) {
        console.log(`   ❌ Failed to parse response:`, parseError.message);
      }
    });
  });

  req.on('error', (error) => {
    console.error(`   ❌ Request failed:`, error.message);
  });

  req.end();
}

// Run the tests
console.log('🚀 Starting incomplete signup retry tests...\n');
testIncompleteSignupRetry();

