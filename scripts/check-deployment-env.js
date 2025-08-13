#!/usr/bin/env node

/**
 * Deployment Environment Check Script
 * This script checks if all required environment variables are properly configured
 * for the deployed ChainSync application.
 */

const requiredEnvVars = {
  // Database
  DATABASE_URL: 'PostgreSQL database connection string',
  DIRECT_URL: 'Direct database connection string',
  
  // Security
  JWT_SECRET: 'JWT signing secret key',
  JWT_REFRESH_SECRET: 'JWT refresh token secret',
  SESSION_SECRET: 'Session encryption secret',
  CSRF_SECRET: 'CSRF protection secret',
  
  // Payment Gateways
  PAYSTACK_SECRET_KEY: 'Paystack API secret key (starts with sk_)',
  FLUTTERWAVE_SECRET_KEY: 'Flutterwave API secret key (starts with FLWSECK_)',
  
  // Application
  BASE_URL: 'Base URL for the application (e.g., https://yourdomain.com)',
  NODE_ENV: 'Environment (should be production for deployed sites)',
  PORT: 'Port number (usually 5000 for Render)',
  
  // Email (optional but recommended)
  SMTP_HOST: 'SMTP server hostname',
  SMTP_USER: 'SMTP username/email',
  SMTP_PASS: 'SMTP password/app password'
};

const optionalEnvVars = {
  // reCAPTCHA (optional but recommended for production)
  VITE_RECAPTCHA_SITE_KEY: 'reCAPTCHA v3 site key',
  RECAPTCHA_SECRET_KEY: 'reCAPTCHA v3 secret key',
  
  // AI Features (optional)
  OPENAI_API_KEY: 'OpenAI API key for AI features',
  
  // Monitoring (optional)
  SENTRY_DSN: 'Sentry error tracking DSN'
};

function checkEnvironment() {
  console.log('🔍 Checking ChainSync deployment environment...\n');
  
  let missingRequired = [];
  let missingOptional = [];
  let configured = [];
  
  // Check required environment variables
  for (const [key, description] of Object.entries(requiredEnvVars)) {
    if (process.env[key]) {
      configured.push({ key, description, value: maskSensitiveValue(process.env[key]) });
    } else {
      missingRequired.push({ key, description });
    }
  }
  
  // Check optional environment variables
  for (const [key, description] of Object.entries(optionalEnvVars)) {
    if (process.env[key]) {
      configured.push({ key, description, value: maskSensitiveValue(process.env[key]) });
    } else {
      missingOptional.push({ key, description });
    }
  }
  
  // Display results
  if (configured.length > 0) {
    console.log('✅ Configured Environment Variables:');
    configured.forEach(({ key, description, value }) => {
      console.log(`   ${key}: ${value} (${description})`);
    });
    console.log('');
  }
  
  if (missingRequired.length > 0) {
    console.log('❌ MISSING REQUIRED Environment Variables:');
    missingRequired.forEach(({ key, description }) => {
      console.log(`   ${key}: ${description}`);
    });
    console.log('');
  }
  
  if (missingOptional.length > 0) {
    console.log('⚠️  Missing Optional Environment Variables:');
    missingOptional.forEach(({ key, description }) => {
      console.log(`   ${key}: ${description}`);
    });
    console.log('');
  }
  
  // Summary
  if (missingRequired.length === 0) {
    console.log('🎉 All required environment variables are configured!');
    console.log('✅ Your deployment should work properly.');
  } else {
    console.log('🚨 CRITICAL: Missing required environment variables!');
    console.log('❌ Your deployment will NOT work without these variables.');
    console.log('');
    console.log('To fix this:');
    console.log('1. Go to your Render dashboard');
    console.log('2. Navigate to your ChainSync service');
    console.log('3. Go to Environment tab');
    console.log('4. Add the missing environment variables');
    console.log('5. Redeploy your service');
  }
  
  // Payment-specific checks
  console.log('\n💳 Payment Gateway Status:');
  if (process.env.PAYSTACK_SECRET_KEY) {
    const isTest = process.env.PAYSTACK_SECRET_KEY.startsWith('sk_test_');
    console.log(`   Paystack: ✅ Configured (${isTest ? 'TEST' : 'LIVE'} mode)`);
  } else {
    console.log('   Paystack: ❌ NOT CONFIGURED - Nigerian users cannot make payments!');
  }
  
  if (process.env.FLUTTERWAVE_SECRET_KEY) {
    const isTest = process.env.FLUTTERWAVE_SECRET_KEY.startsWith('FLWSECK_TEST_');
    console.log(`   Flutterwave: ✅ Configured (${isTest ? 'TEST' : 'LIVE'} mode)`);
  } else {
    console.log('   Flutterwave: ❌ NOT CONFIGURED - International users cannot make payments!');
  }
  
  return missingRequired.length === 0;
}

function maskSensitiveValue(value) {
  if (!value) return 'undefined';
  
  // Mask sensitive values
  if (value.includes('sk_') || value.includes('FLWSECK_')) {
    return value.substring(0, 10) + '...' + value.substring(value.length - 4);
  }
  
  if (value.includes('://') && value.includes('@')) {
    // Database URL or similar
    const parts = value.split('@');
    if (parts.length === 2) {
      return parts[0].split('://')[0] + '://***:***@' + parts[1];
    }
  }
  
  return value.length > 20 ? value.substring(0, 20) + '...' : value;
}

// Run the check
const success = checkEnvironment();
process.exit(success ? 0 : 1);
