#!/usr/bin/env node

/**
 * CSP Configuration Test Script
 * This script tests if the Content Security Policy allows reCAPTCHA domains
 */

console.log('🔒 Testing CSP Configuration for reCAPTCHA...\n');

const requiredDomains = [
  'https://www.google.com',
  'https://www.gstatic.com', 
  'https://www.recaptcha.net'
];

const cspDirectives = {
  scriptSrc: ["'self'", "'unsafe-inline'", "https://replit.com", "https://www.google.com", "https://www.gstatic.com", "https://www.recaptcha.net"],
  frameSrc: ["'self'", "https://www.google.com", "https://www.recaptcha.net"]
};

console.log('📋 Current CSP Configuration:');
console.log('script-src:', cspDirectives.scriptSrc.join(' '));
console.log('frame-src:', cspDirectives.frameSrc.join(' '));
console.log('');

console.log('✅ Checking required domains:');
requiredDomains.forEach(domain => {
  const scriptAllowed = cspDirectives.scriptSrc.includes(domain);
  const frameAllowed = cspDirectives.frameSrc.includes(domain);
  
  if (scriptAllowed && frameAllowed) {
    console.log(`  ✅ ${domain} - Allowed for scripts and frames`);
  } else if (scriptAllowed) {
    console.log(`  ⚠️  ${domain} - Allowed for scripts only`);
  } else if (frameAllowed) {
    console.log(`  ⚠️  ${domain} - Allowed for frames only`);
  } else {
    console.log(`  ❌ ${domain} - Not allowed`);
  }
});

console.log('\n🔍 reCAPTCHA Domain Requirements:');
console.log('  • google.com - Main reCAPTCHA API');
console.log('  • gstatic.com - Static assets and scripts');
console.log('  • recaptcha.net - Alternative domain for some regions');

console.log('\n📝 Recommendations:');
if (cspDirectives.scriptSrc.includes('https://www.gstatic.com')) {
  console.log('  ✅ gstatic.com is allowed - reCAPTCHA scripts should load');
} else {
  console.log('  ❌ gstatic.com is missing - reCAPTCHA scripts will be blocked');
}

if (cspDirectives.frameSrc.includes('https://www.google.com')) {
  console.log('  ✅ google.com frames are allowed - reCAPTCHA iframes should work');
} else {
  console.log('  ❌ google.com frames are blocked - reCAPTCHA iframes may fail');
}

console.log('\n🚀 CSP Configuration Test Complete!');
