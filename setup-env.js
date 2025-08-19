const fs = require('fs');
const path = require('path');

// Read the example environment file
const envExamplePath = path.join(__dirname, 'env.example');
const envPath = path.join(__dirname, '.env');

if (!fs.existsSync(envPath)) {
  console.log('Creating .env file from env.example...');
  fs.copyFileSync(envExamplePath, envPath);
  console.log('✅ .env file created');
} else {
  console.log('✅ .env file already exists');
}

// Read the current .env file
const envContent = fs.readFileSync(envPath, 'utf8');

// Update essential variables for development
let updatedContent = envContent
  .replace(/DATABASE_URL="[^"]*"/, 'DATABASE_URL="postgresql://postgres:password@localhost:5432/chainsync"')
  .replace(/SESSION_SECRET="[^"]*"/, 'SESSION_SECRET="dev-session-secret-key-change-this-in-production-123456789"')
  .replace(/JWT_SECRET="[^"]*"/, 'JWT_SECRET="dev-jwt-secret-key-change-this-in-production-123456789"')
  .replace(/APP_URL="[^"]*"/, 'APP_URL="http://localhost:5000"')
  .replace(/BASE_URL="[^"]*"/, 'BASE_URL="http://localhost:5000"')
  .replace(/CORS_ORIGINS="[^"]*"/, 'CORS_ORIGINS="http://localhost:5173,http://localhost:3000,http://localhost:5000"')
  .replace(/NODE_ENV="[^"]*"/, 'NODE_ENV="development"')
  .replace(/PORT=[^"]*/, 'PORT=5000');

// Write the updated content back
fs.writeFileSync(envPath, updatedContent);

console.log('✅ Environment variables configured for development');
console.log('');
console.log('📋 Next steps:');
console.log('1. Set up PostgreSQL database (see instructions below)');
console.log('2. Run: npm run db:generate');
console.log('3. Run: npm run db:migrate');
console.log('4. Run: npm run db:seed');
console.log('5. Start the server: npm run dev:server');
console.log('');
console.log('🔧 PostgreSQL Setup Instructions:');
console.log('1. Open pgAdmin or psql');
console.log('2. Create a database named "chainsync"');
console.log('3. Create a user "postgres" with password "password" (or update DATABASE_URL in .env)');
console.log('4. Grant all privileges on database "chainsync" to user "postgres"');
console.log('');
console.log('💡 Alternative: Use the test server for quick testing:');
console.log('   npm run dev:test (for backend)');
console.log('   npm run dev:web (for frontend)');
