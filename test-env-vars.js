// Test script to check environment variables
console.log('Testing environment variables...');

// Check captcha-related environment variables
console.log('RECAPTCHA_SECRET_KEY:', process.env.RECAPTCHA_SECRET_KEY ? 'SET' : 'NOT SET');
console.log('HCAPTCHA_SECRET_KEY:', process.env.HCAPTCHA_SECRET_KEY ? 'SET' : 'NOT SET');
console.log('VITE_RECAPTCHA_SITE_KEY:', process.env.VITE_RECAPTCHA_SITE_KEY ? 'SET' : 'NOT SET');
console.log('VITE_HCAPTCHA_SITE_KEY:', process.env.VITE_HCAPTCHA_SITE_KEY ? 'SET' : 'NOT SET');

// Check other important environment variables
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');

// Check if we're in production
console.log('NODE_ENV:', process.env.NODE_ENV || 'NOT SET');

console.log('Environment check complete.');
