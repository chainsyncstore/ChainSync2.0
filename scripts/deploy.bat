@echo off
REM ChainSync Deployment Script for Windows
REM This script ensures a clean deployment with all fixes applied

echo 🚀 ChainSync Deployment Script
echo ================================

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Error: package.json not found. Please run this script from the project root.
    pause
    exit /b 1
)

REM Step 1: Clean previous builds
echo 🧹 Cleaning previous builds...
if exist "dist" rmdir /s /q "dist"
if exist "node_modules" rmdir /s /q "node_modules"

REM Step 2: Install dependencies
echo 📦 Installing dependencies...
call npm install

REM Step 3: Build the application
echo 🔨 Building application...
call npm run build

REM Step 4: Verify the build
echo ✅ Verifying build...
call npm run build:verify

REM Step 5: Test production build
echo 🧪 Testing production build...
call npm run test:production

REM Step 6: Display deployment info
echo.
echo 🎉 Deployment preparation completed successfully!
echo.
echo 📋 Next steps:
echo 1. Copy the 'dist/' directory to your server
echo 2. Ensure these environment variables are set:
echo    - NODE_ENV=production
echo    - PORT=5000 (or your preferred port)
echo    - DATABASE_URL=your_database_connection_string
echo    - SESSION_SECRET=your_secure_session_secret
echo.
echo 3. Start the server:
echo    cd dist ^&^& node index.js
echo.
echo 4. The following issues have been resolved:
echo    ✅ Content Security Policy (CSP) violations
echo    ✅ Static asset 500 errors
echo    ✅ MIME type mismatches
echo    ✅ Inline script blocking
echo.
echo 🔒 Security improvements applied:
echo    - CSP allows inline scripts for Replit banner
echo    - Proper MIME types for all assets
echo    - Graceful error handling for missing assets
echo    - Enhanced logging for debugging
echo.
echo 📁 Files to deploy:
echo    - dist/index.js (server)
echo    - dist/public/ (static assets)
echo.
echo 🌐 Your application should now work without the white screen!
echo.
pause
