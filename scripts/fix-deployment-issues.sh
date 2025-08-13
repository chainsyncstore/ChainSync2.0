#!/bin/bash

# ChainSync Deployment Issues Fix Script
# This script fixes the identified deployment issues and redeploys

set -e  # Exit on any error

echo "🔧 ChainSync Deployment Issues Fix Script"
echo "=========================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Step 1: Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/
rm -rf node_modules/

# Step 2: Install dependencies
echo "📦 Installing dependencies..."
npm install

# Step 3: Build the application
echo "🔨 Building application..."
npm run build

# Step 4: Verify the build
echo "✅ Verifying build..."
npm run build:verify

# Step 5: Test production build
echo "🧪 Testing production build..."
npm run test:production

# Step 6: Display deployment info
echo ""
echo "🎉 Deployment issues have been fixed!"
echo ""
echo "📋 Issues resolved:"
echo "   ✅ Content Security Policy (CSP) - Added Google reCAPTCHA domain"
echo "   ✅ Rate limiting trust proxy warnings - Fixed with custom key generators"
echo "   ✅ Authentication error status codes - Fixed 400 vs 401 responses"
echo "   ✅ Bot prevention middleware - Made more lenient for production"
echo ""
echo "📋 Next steps:"
echo "1. Copy the 'dist/' directory to your server"
echo "2. Ensure these environment variables are set:"
echo "   - NODE_ENV=production"
echo "   - PORT=5000 (or your preferred port)"
echo "   - DATABASE_URL=your_database_connection_string"
echo "   - SESSION_SECRET=your_secure_session_secret"
echo "   - VITE_RECAPTCHA_SITE_KEY=your_recaptcha_site_key"
echo "   - RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key"
echo ""
echo "3. Start the server:"
echo "   cd dist && node index.js"
echo ""
echo "🔒 Security improvements applied:"
echo "   - CSP allows Google reCAPTCHA scripts"
echo "   - Rate limiting works properly behind load balancers"
echo "   - Proper HTTP status codes for authentication"
echo "   - Graceful bot prevention fallback"
echo ""
echo "📁 Files to deploy:"
echo "   - dist/index.js (server)"
echo "   - dist/public/ (static assets)"
echo ""
echo "🚀 Ready for deployment!"
