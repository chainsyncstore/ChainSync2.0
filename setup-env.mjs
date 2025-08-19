import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Update essential variables for development with the actual Neon database
let updatedContent = envContent
  .replace(/DATABASE_URL="[^"]*"/, 'DATABASE_URL="postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"')
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
console.log('✅ Using your Neon PostgreSQL database');
console.log('');
console.log('📋 Next steps:');
console.log('1. Run: npm run db:generate');
console.log('2. Run: npm run db:migrate');
console.log('3. Run: npm run db:seed');
console.log('4. Start the server: npm run dev:server');
console.log('');
console.log('🚀 Your application will now use the full database setup!');
