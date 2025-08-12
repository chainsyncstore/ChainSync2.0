#!/bin/bash

# ChainSync Deployment Script
# This script ensures a clean deployment with all fixes applied

set -e  # Exit on any error

echo "🚀 ChainSync Deployment Script"
echo "================================"

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
echo "🎉 Deployment preparation completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Copy the 'dist/' directory to your server"
echo "2. Ensure these environment variables are set:"
echo "   - NODE_ENV=production"
echo "   - PORT=5000 (or your preferred port)"
echo "   - DATABASE_URL=your_database_connection_string"
echo "   - SESSION_SECRET=your_secure_session_secret"
echo ""
echo "3. Start the server:"
echo "   cd dist && node index.js"
echo ""
echo "4. The following issues have been resolved:"
echo "   ✅ Content Security Policy (CSP) violations"
echo "   ✅ Static asset 500 errors"
echo "   ✅ MIME type mismatches"
echo "   ✅ Inline script blocking"
echo ""
echo "🔒 Security improvements applied:"
echo "   - CSP allows inline scripts for Replit banner"
echo "   - Proper MIME types for all assets"
echo "   - Graceful error handling for missing assets"
echo "   - Enhanced logging for debugging"
echo ""
echo "📁 Files to deploy:"
echo "   - dist/index.js (server)"
echo "   - dist/public/ (static assets)"
echo ""
echo "🌐 Your application should now work without the white screen!"
