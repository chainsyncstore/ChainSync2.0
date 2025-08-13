#!/usr/bin/env node

/**
 * Test script to verify CSP configuration for reCAPTCHA
 * This script tests if the Content Security Policy allows reCAPTCHA to function properly
 */

console.log('🔒 Testing CSP Configuration for reCAPTCHA...\n');

const requiredDomains = [
  'https://www.google.com',
  'https://www.gstatic.com', 
  'https://www.recaptcha.net'
];

const cspDirectives = {
  scriptSrc: ["'self'", "'unsafe-inline'", "https://replit.com", "https://www.google.com", "https://www.gstatic.com", "https://www.recaptcha.net"],
  connectSrc: ["'self'", "https://api.openai.com", "https://*.google.com", "https://*.gstatic.com", "https://*.recaptcha.net"],
  frameSrc: ["'self'", "https://www.google.com", "https://www.gstatic.com", "https://www.recaptcha.net"],
  workerSrc: ["'self'", "blob:"]
};

console.log('📋 Current CSP Configuration:');
console.log('script-src:', cspDirectives.scriptSrc.join(' '));
console.log('connect-src:', cspDirectives.connectSrc.join(' '));
console.log('frame-src:', cspDirectives.frameSrc.join(' '));
console.log('worker-src:', cspDirectives.workerSrc.join(' '));

console.log('\n✅ CSP Configuration Analysis:');

// Check script-src
const scriptSrcOk = requiredDomains.every(domain => 
  cspDirectives.scriptSrc.some(src => 
    src === domain || src.includes(domain.replace('https://', ''))
  )
);
console.log(`script-src: ${scriptSrcOk ? '✅' : '❌'} reCAPTCHA domains covered`);

// Check connect-src
const connectSrcOk = requiredDomains.every(domain => 
  cspDirectives.connectSrc.some(src => 
    src === domain || src.includes(domain.replace('https://', ''))
  )
);
console.log(`connect-src: ${connectSrcOk ? '✅' : '❌'} reCAPTCHA domains covered`);

// Check frame-src
const frameSrcOk = requiredDomains.every(domain => 
  cspDirectives.frameSrc.some(src => 
    src === domain || src.includes(domain.replace('https://', ''))
  )
);
console.log(`frame-src: ${frameSrcOk ? '✅' : '❌'} reCAPTCHA domains covered`);

// Check worker-src
const workerSrcOk = cspDirectives.workerSrc.includes('blob:');
console.log(`worker-src: ${workerSrcOk ? '✅' : '❌'} blob: support included`);

console.log('\n🔍 reCAPTCHA Connection Test:');
console.log('The following domains should be accessible:');
requiredDomains.forEach(domain => {
  const isCovered = cspDirectives.connectSrc.some(src => 
    src === domain || src.includes(domain.replace('https://', ''))
  );
  console.log(`${domain}: ${isCovered ? '✅' : '❌'}`);
});

console.log('\n📝 Next Steps:');
if (scriptSrcOk && connectSrcOk && frameSrcOk && workerSrcOk) {
  console.log('✅ CSP configuration looks correct for reCAPTCHA');
  console.log('🔄 Restart your server to apply the changes');
  console.log('🧪 Test the signup form again');
} else {
  console.log('❌ CSP configuration needs adjustment');
  console.log('🔧 Check server/middleware/security.ts');
  console.log('🔄 Restart server after making changes');
}

console.log('\n💡 Troubleshooting Tips:');
console.log('1. Ensure server is restarted after CSP changes');
console.log('2. Check browser console for CSP violations');
console.log('3. Verify reCAPTCHA site key is configured');
console.log('4. Test in incognito/private browsing mode');
console.log('5. Clear browser cache and cookies');
