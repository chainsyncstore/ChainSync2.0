# ChainSync Deployment Troubleshooting Guide

## Common Deployment Issues & Solutions

### 1. White Screen with Console Errors

#### Issue: Content Security Policy (CSP) Violations
**Symptoms:**
- White screen after deployment
- Console error: "Refused to execute inline script because it violates Content Security Policy"
- Scripts blocked by CSP

**Solution:**
The CSP has been updated to allow inline scripts. Ensure your deployment uses the latest code with:
```typescript
scriptSrc: ["'self'", "'unsafe-inline'", "https://replit.com"]
```

**Verification:**
```bash
npm run build:verify
npm run test:production
```

#### Issue: Static Asset 500 Errors
**Symptoms:**
- Console errors: "GET /assets/... net::ERR_ABORTED 500 (Internal Server Error)"
- CSS files served with wrong MIME type
- JavaScript files failing to load

**Solutions:**
1. **Rebuild the application:**
   ```bash
   npm run build
   npm run build:verify
   ```

2. **Check file permissions:**
   ```bash
   ls -la dist/public/assets/
   ```

3. **Verify asset integrity:**
   ```bash
   npm run test:production
   ```

### 2. Build Verification Steps

#### Step 1: Clean Build
```bash
# Remove old build artifacts
rm -rf dist/
rm -rf node_modules/

# Reinstall dependencies
npm install

# Build fresh
npm run build
```

#### Step 2: Verify Build Output
```bash
npm run build:verify
```

**Expected Output:**
```
✅ index.html
✅ CSS files present
✅ JavaScript files present
🎉 Build verification completed successfully!
```

#### Step 3: Test Production Build
```bash
npm run test:production
```

### 3. Environment Configuration

#### Required Environment Variables
```env
NODE_ENV=production
PORT=5000
DATABASE_URL=your_database_connection_string
SESSION_SECRET=your_secure_session_secret
```

#### Security Headers
The application automatically sets:
- `Content-Type` headers for all assets
- Proper MIME types for CSS, JS, and HTML files
- Security headers via Helmet
- CORS configuration

### 4. Server Configuration

#### Static File Serving
The server automatically:
- Serves static files from `dist/public`
- Sets correct MIME types
- Handles 404s gracefully
- Provides SPA fallback for routing

#### Error Handling
- Static asset errors return 404 (not 500)
- Detailed logging for debugging
- Graceful fallbacks for missing assets

### 5. Deployment Checklist

#### Pre-Deployment
- [ ] Environment variables configured
- [ ] Database connection tested
- [ ] Dependencies installed
- [ ] Build process completed successfully

#### Post-Deployment
- [ ] Build verification passed
- [ ] Production test successful
- [ ] Assets loading correctly
- [ ] No console errors
- [ ] Application functional

### 6. Debugging Commands

#### Check Build Output
```bash
# List all built assets
ls -la dist/public/assets/

# Check file sizes
du -h dist/public/assets/*

# Verify HTML structure
cat dist/public/index.html
```

#### Test Asset Serving
```bash
# Test specific asset
curl -I https://yourdomain.com/assets/index-BNQywR1S.js

# Check MIME types
curl -H "Accept: text/css" https://yourdomain.com/assets/index-u0NJKQfB.css
```

#### Server Logs
```bash
# Check application logs
npm start 2>&1 | tee app.log

# Monitor real-time logs
tail -f app.log
```

### 7. Common Fixes

#### Fix 1: Rebuild Application
```bash
npm run build
npm run build:verify
```

#### Fix 2: Clear Browser Cache
- Hard refresh (Ctrl+F5 / Cmd+Shift+R)
- Clear browser cache and cookies
- Test in incognito/private mode

#### Fix 3: Check File Permissions
```bash
chmod -R 755 dist/
chmod -R 644 dist/public/assets/*
```

#### Fix 4: Verify Server Configuration
```bash
# Test production server
npm run test:production

# Check server startup
NODE_ENV=production npm start
```

### 8. Performance Optimization

#### Asset Optimization
- CSS and JS files are automatically minified
- Assets are chunked for better caching
- Vendor libraries are separated
- Tree shaking enabled for production

#### Caching Strategy
- Assets include content hashes for cache busting
- Static assets served with proper cache headers
- SPA routing handled efficiently

### 9. Monitoring & Maintenance

#### Health Checks
```bash
# Verify build integrity
npm run build:verify

# Test production setup
npm run test:production

# Check server status
curl -f https://yourdomain.com/health
```

#### Regular Maintenance
- Monitor server logs for errors
- Check asset loading performance
- Verify CSP compliance
- Update dependencies regularly

### 10. Getting Help

#### Debug Information
When reporting issues, include:
- Build verification output
- Production test results
- Console errors (screenshots)
- Server logs
- Environment configuration

#### Support Channels
- Check this troubleshooting guide
- Review server logs
- Test with minimal configuration
- Verify against known working setup

---

**Last Updated:** $(date)
**Version:** 1.0.0
