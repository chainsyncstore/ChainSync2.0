#!/usr/bin/env node

/**
 * Render Deployment Test Script
 * 
 * This script helps diagnose common deployment issues on Render
 * Run this script to test your deployment from your local machine
 */

import fetch from 'node-fetch';

const TEST_CONFIG = {
  // Update this with your actual Render URL
  RENDER_URL: process.env.RENDER_URL || 'https://your-app-name.onrender.com',
  
  // Test endpoints
  ENDPOINTS: {
    health: '/api/health',
    signup: '/api/auth/signup',
    csrf: '/api/auth/csrf-token'
  },
  
  // Test data for signup
  TEST_SIGNUP_DATA: {
    firstName: 'Test',
    lastName: 'User',
    email: `test-${Date.now()}@example.com`,
    phone: '1234567890',
    companyName: 'Test Company',
    password: 'SecurePass123!',
    confirmPassword: 'SecurePass123!',
    tier: 'basic',
    location: 'international'
  }
};

class RenderDeploymentTester {
  constructor() {
    this.results = [];
    this.errors = [];
  }

  async runTests() {
    console.log('🚀 Render Deployment Test Suite');
    console.log('================================');
    console.log(`Testing: ${TEST_CONFIG.RENDER_URL}`);
    console.log('');

    try {
      // Test 1: Basic connectivity
      await this.testBasicConnectivity();
      
      // Test 2: Health check endpoint
      await this.testHealthEndpoint();
      
      // Test 3: CSRF token endpoint
      await this.testCsrfEndpoint();
      
      // Test 4: Signup endpoint (without actual submission)
      await this.testSignupEndpoint();
      
      // Test 5: CORS headers
      await this.testCorsHeaders();
      
    } catch (error) {
      this.errors.push(`Test suite failed: ${error.message}`);
    }

    // Display results
    this.displayResults();
  }

  async testBasicConnectivity() {
    console.log('🔍 Test 1: Basic Connectivity');
    
    try {
      const response = await fetch(TEST_CONFIG.RENDER_URL, {
        method: 'GET',
        timeout: 10000
      });
      
      if (response.ok) {
        this.results.push('✅ Basic connectivity: SUCCESS');
        console.log('   ✅ Basic connectivity: SUCCESS');
      } else {
        this.results.push(`❌ Basic connectivity: HTTP ${response.status}`);
        console.log(`   ❌ Basic connectivity: HTTP ${response.status}`);
      }
    } catch (error) {
      const message = `❌ Basic connectivity: ${error.message}`;
      this.results.push(message);
      this.errors.push(message);
      console.log(`   ${message}`);
    }
  }

  async testHealthEndpoint() {
    console.log('🔍 Test 2: Health Check Endpoint');
    
    try {
      const response = await fetch(`${TEST_CONFIG.RENDER_URL}${TEST_CONFIG.ENDPOINTS.health}`, {
        method: 'GET',
        timeout: 10000
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.database === 'connected') {
          this.results.push('✅ Health check: SUCCESS (Database connected)');
          console.log('   ✅ Health check: SUCCESS (Database connected)');
        } else {
          this.results.push('⚠️ Health check: WARNING (Database disconnected)');
          console.log('   ⚠️ Health check: WARNING (Database disconnected)');
          this.errors.push('Database connection failed in health check');
        }
        
        console.log(`   📊 Status: ${data.status}`);
        console.log(`   🗄️ Database: ${data.database}`);
        console.log(`   ⏰ Uptime: ${Math.round(data.uptime)}s`);
        
      } else {
        const message = `❌ Health check: HTTP ${response.status}`;
        this.results.push(message);
        this.errors.push(message);
        console.log(`   ${message}`);
      }
    } catch (error) {
      const message = `❌ Health check: ${error.message}`;
      this.results.push(message);
      this.errors.push(message);
      console.log(`   ${message}`);
    }
  }

  async testCsrfEndpoint() {
    console.log('🔍 Test 3: CSRF Token Endpoint');
    
    try {
      const response = await fetch(`${TEST_CONFIG.RENDER_URL}${TEST_CONFIG.ENDPOINTS.csrf}`, {
        method: 'GET',
        timeout: 10000
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.csrfToken) {
          this.results.push('✅ CSRF endpoint: SUCCESS');
          console.log('   ✅ CSRF endpoint: SUCCESS');
          console.log(`   🔑 Token length: ${data.csrfToken.length} characters`);
        } else {
          this.results.push('⚠️ CSRF endpoint: WARNING (No token)');
          console.log('   ⚠️ CSRF endpoint: WARNING (No token)');
        }
      } else {
        const message = `❌ CSRF endpoint: HTTP ${response.status}`;
        this.results.push(message);
        this.errors.push(message);
        console.log(`   ${message}`);
      }
    } catch (error) {
      const message = `❌ CSRF endpoint: ${error.message}`;
      this.results.push(message);
      this.errors.push(message);
      console.log(`   ${message}`);
    }
  }

  async testSignupEndpoint() {
    console.log('🔍 Test 4: Signup Endpoint (Structure Test)');
    
    try {
      const response = await fetch(`${TEST_CONFIG.RENDER_URL}${TEST_CONFIG.ENDPOINTS.signup}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'test-token'
        },
        body: JSON.stringify(TEST_CONFIG.TEST_SIGNUP_DATA),
        timeout: 10000
      });
      
      // We expect this to fail due to missing CSRF token, but we want to see the response
      if (response.status === 403) {
        this.results.push('✅ Signup endpoint: SUCCESS (CSRF protection working)');
        console.log('   ✅ Signup endpoint: SUCCESS (CSRF protection working)');
      } else if (response.status === 400) {
        this.results.push('✅ Signup endpoint: SUCCESS (Validation working)');
        console.log('   ✅ Signup endpoint: SUCCESS (Validation working)');
      } else {
        this.results.push(`⚠️ Signup endpoint: WARNING (HTTP ${response.status})`);
        console.log(`   ⚠️ Signup endpoint: WARNING (HTTP ${response.status})`);
      }
      
      console.log(`   📝 Response status: ${response.status}`);
      
    } catch (error) {
      const message = `❌ Signup endpoint: ${error.message}`;
      this.results.push(message);
      this.errors.push(message);
      console.log(`   ${message}`);
    }
  }

  async testCorsHeaders() {
    console.log('🔍 Test 5: CORS Headers');
    
    try {
      const response = await fetch(`${TEST_CONFIG.RENDER_URL}${TEST_CONFIG.ENDPOINTS.health}`, {
        method: 'GET',
        headers: {
          'Origin': 'https://example.com'
        },
        timeout: 10000
      });
      
      const corsHeader = response.headers.get('access-control-allow-origin');
      
      if (corsHeader) {
        this.results.push('✅ CORS headers: SUCCESS');
        console.log('   ✅ CORS headers: SUCCESS');
        console.log(`   🌐 CORS origin: ${corsHeader}`);
      } else {
        this.results.push('⚠️ CORS headers: WARNING (No CORS header)');
        console.log('   ⚠️ CORS headers: WARNING (No CORS header)');
      }
      
    } catch (error) {
      const message = `❌ CORS test: ${error.message}`;
      this.results.push(message);
      this.errors.push(message);
      console.log(`   ${message}`);
    }
  }

  displayResults() {
    console.log('');
    console.log('📊 Test Results Summary');
    console.log('========================');
    
    this.results.forEach(result => {
      console.log(result);
    });
    
    if (this.errors.length > 0) {
      console.log('');
      console.log('🚨 Issues Found');
      console.log('===============');
      this.errors.forEach(error => {
        console.log(`• ${error}`);
      });
      
      console.log('');
      console.log('💡 Next Steps');
      console.log('==============');
      console.log('1. Check Render environment variables');
      console.log('2. Verify database connection string');
      console.log('3. Check Render service logs');
      console.log('4. Ensure all required secrets are set');
      console.log('5. Test database connectivity from Render');
    } else {
      console.log('');
      console.log('🎉 All tests passed! Your deployment appears to be working correctly.');
    }
    
    console.log('');
    console.log('📚 For detailed troubleshooting, see: RENDER_DEPLOYMENT_TROUBLESHOOTING.md');
  }
}

// Run the tests
async function main() {
  const tester = new RenderDeploymentTester();
  await tester.runTests();
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node test-render-deployment.js [options]

Options:
  --url <url>     Set custom Render URL to test
  --help, -h      Show this help message

Environment Variables:
  RENDER_URL       Set the Render URL to test

Examples:
  node test-render-deployment.js
  RENDER_URL=https://myapp.onrender.com node test-render-deployment.js
  node test-render-deployment.js --url https://myapp.onrender.com
`);
  process.exit(0);
}

// Check for custom URL argument
const urlArgIndex = process.argv.indexOf('--url');
if (urlArgIndex !== -1 && process.argv[urlArgIndex + 1]) {
  TEST_CONFIG.RENDER_URL = process.argv[urlArgIndex + 1];
}

main().catch(console.error);
