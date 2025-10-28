#!/usr/bin/env node
import 'dotenv/config';

/**
 * Deployment Environment Check Script
 * This script checks if all required environment variables are properly configured
 * for the deployed ChainSync application.
 */

const requiredEnvVars = {
  // Core application
  APP_URL: 'Base URL for the application (e.g., https://yourdomain.com)',
  DATABASE_URL: 'PostgreSQL database connection string',
  CORS_ORIGINS: 'Comma/space separated list of allowed origins for CORS',
  SESSION_SECRET: 'Session encryption secret (>= 32 chars in production)',
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
  let problems = [];
  
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

  // Production-only requirements and stricter validations
  const isProd = (process.env.NODE_ENV || '').trim() === 'production';
  if (isProd && !process.env.REDIS_URL) {
    missingRequired.push({ key: 'REDIS_URL', description: 'Redis connection URL (required in production)' });
  }

  // SESSION_SECRET length requirement in production
  if (process.env.SESSION_SECRET) {
    if (isProd && process.env.SESSION_SECRET.length < 32) {
      problems.push('SESSION_SECRET must be at least 32 characters in production.');
    }
  }

  // Validate CORS_ORIGINS parses to at least one valid origin
  const cors = (process.env.CORS_ORIGINS || '').trim();
  if (cors.length === 0) {
    problems.push('CORS_ORIGINS is empty. Provide at least one origin such as https://your-frontend.example');
  } else {
    const parsed = parseCorsOrigins(cors);
    if (parsed.length === 0) {
      problems.push('CORS_ORIGINS must include at least one valid http(s) origin. Example: https://app.example.com,https://admin.example.com');
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

  if (problems.length > 0) {
    console.log('❌ INVALID Environment Configuration:');
    problems.forEach((msg) => {
      console.log(`   - ${msg}`);
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
  if (missingRequired.length === 0 && problems.length === 0) {
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
  
  return missingRequired.length === 0 && problems.length === 0;
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

function parseCorsOrigins(csv) {
  const raw = csv
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const normalized = new Set();
  for (const entry of raw) {
    try {
      const u = new URL(entry);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      const origin = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
      normalized.add(origin);
    } catch {
      // ignore invalid
    }
  }
  return Array.from(normalized);
}

// Run the check
const success = checkEnvironment();
process.exit(success ? 0 : 1);
