import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Setting up Production Environment for ChainSync');
console.log('');

// Read the production environment template
const prodEnvPath = path.join(__dirname, 'render.env.production');
const prodEnvContent = fs.readFileSync(prodEnvPath, 'utf8');

// Update with your actual Neon database URL
let updatedContent = prodEnvContent
  .replace(/DATABASE_URL="[^"]*"/, 'DATABASE_URL="postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"')
  .replace(/DIRECT_URL="[^"]*"/, 'DIRECT_URL="postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"')
  .replace(/JWT_SECRET="[^"]*"/, 'JWT_SECRET="prod-jwt-secret-key-change-this-in-production-12345678901234567890123456789012"')
  .replace(/JWT_REFRESH_SECRET="[^"]*"/, 'JWT_REFRESH_SECRET="prod-jwt-refresh-secret-key-change-this-in-production-12345678901234567890123456789012"')
  .replace(/SESSION_SECRET="[^"]*"/, 'SESSION_SECRET="prod-session-secret-key-change-this-in-production-12345678901234567890123456789012"')
  .replace(/CSRF_SECRET="[^"]*"/, 'CSRF_SECRET="prod-csrf-secret-key-change-this-in-production-12345678901234567890123456789012"')
  .replace(/APP_URL="[^"]*"/, 'APP_URL="https://chainsync.store"')
  .replace(/BASE_URL="[^"]*"/, 'BASE_URL="https://chainsync.store"')
  .replace(/FRONTEND_URL="[^"]*"/, 'FRONTEND_URL="https://chainsync.store"')
  .replace(/ALLOWED_ORIGINS="[^"]*"/, 'ALLOWED_ORIGINS="https://chainsync.store,https://www.chainsync.store"')
  .replace(/PRODUCTION_DOMAIN="[^"]*"/, 'PRODUCTION_DOMAIN="https://chainsync.store"')
  .replace(/PRODUCTION_WWW_DOMAIN="[^"]*"/, 'PRODUCTION_WWW_DOMAIN="https://www.chainsync.store"');

// Write the updated production environment file
fs.writeFileSync(prodEnvPath, updatedContent);

console.log('✅ Production environment file updated with your database URL');
console.log('');
console.log('📋 Next Steps for Production Deployment:');
console.log('');
console.log('1. 🗄️  Database Setup:');
console.log('   - Your Neon database is already configured');
console.log('   - Database URL: ✅ Set');
console.log('');
console.log('2. 🔧 Render.com Environment Variables:');
console.log('   Go to your Render dashboard and set these environment variables:');
console.log('');
console.log('   DATABASE_URL=postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
console.log('   DIRECT_URL=postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
console.log('   SESSION_SECRET=prod-session-secret-key-change-this-in-production-12345678901234567890123456789012');
console.log('   JWT_SECRET=prod-jwt-secret-key-change-this-in-production-12345678901234567890123456789012');
console.log('   JWT_REFRESH_SECRET=prod-jwt-refresh-secret-key-change-this-in-production-12345678901234567890123456789012');
console.log('   CSRF_SECRET=prod-csrf-secret-key-change-this-in-production-12345678901234567890123456789012');
console.log('   APP_URL=https://chainsync.store');
console.log('   BASE_URL=https://chainsync.store');
console.log('   FRONTEND_URL=https://chainsync.store');
console.log('   ALLOWED_ORIGINS=https://chainsync.store,https://www.chainsync.store');
console.log('   PRODUCTION_DOMAIN=https://chainsync.store');
console.log('   PRODUCTION_WWW_DOMAIN=https://www.chainsync.store');
console.log('   NODE_ENV=production');
console.log('   PORT=10000');
console.log('');
console.log('3. 🔄 Deploy to Render:');
console.log('   - Push your changes to GitHub');
console.log('   - Render will automatically rebuild and deploy');
console.log('');
console.log('4. 🧪 Test the Deployment:');
console.log('   - Visit https://chainsync.store');
console.log('   - Try the signup functionality');
console.log('   - Check the browser console for any errors');
console.log('');
console.log('⚠️  Important Security Notes:');
console.log('   - Change the secret keys in production');
console.log('   - Set up proper email configuration');
console.log('   - Configure reCAPTCHA for production');
console.log('   - Set up monitoring and logging');
console.log('');
console.log('🚀 Your ChainSync application should now work in production!');
