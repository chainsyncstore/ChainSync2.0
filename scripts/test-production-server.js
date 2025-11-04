#!/usr/bin/env node

import http from 'http';
import https from 'https';

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const req = client.request(urlObj, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

const BASE_URL = 'http://localhost:5000';

console.log('🧪 Testing Production Server...\n');

// Test functions
async function testEndpoint(endpoint, description, expectedStatus = 200) {
  try {
    const response = await makeRequest(`${BASE_URL}${endpoint}`);
    const status = response.status;
    const success = status === expectedStatus;
    
    console.log(`${success ? '✅' : '❌'} ${description}`);
    console.log(`   Status: ${status} ${status === expectedStatus ? '(Expected)' : '(Unexpected)'}`);
    
    if (response.headers['content-type']) {
      console.log(`   Content-Type: ${response.headers['content-type']}`);
    }
    
    if (response.headers['content-security-policy']) {
      console.log(`   CSP: ${response.headers['content-security-policy'].substring(0, 100)}...`);
    }
    
    return success;
  } catch (error) {
    console.log(`❌ ${description}`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function testAsset(endpoint, description, expectedType) {
  try {
    const response = await makeRequest(`${BASE_URL}${endpoint}`);
    const status = response.status;
    const contentType = response.headers['content-type'];
    const success = status === 200 && contentType?.includes(expectedType);
    
    console.log(`${success ? '✅' : '❌'} ${description}`);
    console.log(`   Status: ${status}, Content-Type: ${contentType}`);
    
    return success;
  } catch (error) {
    console.log(`❌ ${description}`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  let passedTests = 0;
  let totalTests = 0;
  
  console.log('📋 Testing Main Application...');
  totalTests++;
  if (await testEndpoint('/', 'Main page loads', 200)) passedTests++;
  
  console.log('\n📋 Testing Static Assets...');
  totalTests++;
  if (await testAsset('/assets/index-u0NJKQfB.css', 'CSS file loads with correct MIME type', 'text/css')) passedTests++;
  
  totalTests++;
  if (await testAsset('/assets/index-BNQywR1S.js', 'JavaScript file loads with correct MIME type', 'application/javascript')) passedTests++;
  
  console.log('\n📋 Testing API Endpoints...');
  totalTests++;
  if (await testEndpoint('/api/stores', 'Stores API endpoint', 200)) passedTests++;
  
  totalTests++;
  if (await testEndpoint('/api/auth/csrf-token', 'CSRF token endpoint', 200)) passedTests++;
  
  totalTests++;
  if (await testEndpoint('/api/health', 'Health check endpoint (should return index.html)', 200)) passedTests++;
  
  console.log('\n📋 Testing Security Headers...');
  try {
    const response = await makeRequest(`${BASE_URL}/`);
    const headers = response.headers;
    
    const securityHeaders = [
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection',
      'strict-transport-security'
    ];
    
    securityHeaders.forEach(header => {
      totalTests++;
      if (headers[header]) {
        console.log(`✅ ${header} header present`);
        passedTests++;
      } else {
        console.log(`❌ ${header} header missing`);
      }
    });
  } catch (error) {
    console.log(`❌ Error testing security headers: ${error.message}`);
  }
  
  console.log('\n📊 Test Results Summary');
  console.log(`   Passed: ${passedTests}/${totalTests} tests`);
  console.log(`   Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed! Production server is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above for details.');
  }
  
  return passedTests === totalTests;
}

// Run tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
