# Build Troubleshooting Guide

This guide helps resolve common build issues with ChainSync.

## Common Build Errors

### 1. Content Security Policy Violations

**Error**: `Refused to load script because it violates CSP directive: "script-src 'self'"`

**Solution**: 
- CSP has been updated to allow Replit scripts
- Replit script loading is now conditional and only loads in Replit environments

### 2. 500 Server Errors for JavaScript Files

**Error**: `Failed to load resource: the server responded with a status of 500 ()`

**Causes**:
- Incorrect build output directory
- Missing build files
- Server configuration issues

**Solutions**:
1. **Clean and rebuild**:
   ```bash
   rm -rf dist/
   npm run build
   ```

2. **Verify build output**:
   ```bash
   npm run build:verify
   ```

3. **Check build directory structure**:
   ```
   dist/
   ├── public/
   │   ├── index.html
   │   └── assets/
   │       ├── index-[hash].css
   │       ├── index-[hash].js
   │       └── vendor-[hash].js
   └── index.js
   ```

### 3. MIME Type Mismatch

**Error**: `MIME type ('application/json') is not a supported stylesheet MIME type`

**Causes**:
- CSS files being served with wrong Content-Type
- Build configuration issues
- Server static file serving problems

**Solutions**:
1. **Fixed in server configuration** - Proper MIME types are now set
2. **Rebuild the project** to ensure correct file generation
3. **Check file extensions** in build output

## Build Process

### Development Mode
```bash
npm run dev
```
- Uses Vite dev server with HMR
- Serves files from `client/src/`
- No build step required

### Production Build
```bash
npm run build
```
- Builds client with Vite
- Bundles server with esbuild
- Outputs to `dist/` directory

### Build Verification
```bash
npm run build:verify
```
- Runs build and verifies output
- Checks file existence and sizes
- Validates asset references

## File Structure

```
ChainSync-2/
├── client/                 # Frontend source
│   ├── src/
│   └── index.html
├── server/                 # Backend source
├── dist/                   # Build output
│   ├── public/            # Static assets
│   └── index.js           # Server bundle
└── vite.config.ts         # Vite configuration
```

## Troubleshooting Steps

### Step 1: Clean Build
```bash
# Remove all build artifacts
rm -rf dist/
rm -rf node_modules/.vite/

# Reinstall dependencies
npm install

# Rebuild
npm run build
```

### Step 2: Verify Build Output
```bash
npm run build:verify
```

### Step 3: Check Server Configuration
- Ensure `NODE_ENV` is set correctly
- Verify port configuration
- Check CORS and security settings

### Step 4: Debug Development Mode
```bash
# Start with verbose logging
DEBUG=* npm run dev
```

## Environment Variables

### Required
- `NODE_ENV`: Set to `production` for production builds
- `PORT`: Server port (defaults to 5000)

### Optional
- `ALLOWED_ORIGINS`: CORS allowed origins
- `REPL_ID`: Replit environment identifier

## Common Issues and Fixes

### Issue: Build fails with TypeScript errors
**Fix**: Run `npm run check` to identify TypeScript issues

### Issue: Assets not loading in production
**Fix**: Ensure `dist/public/` directory exists and contains built files

### Issue: Server crashes on startup
**Fix**: Check server logs and ensure all dependencies are installed

### Issue: CORS errors
**Fix**: Verify `ALLOWED_ORIGINS` environment variable is set correctly

## Performance Optimization

### Build Optimization
- Tree shaking enabled
- Code splitting with manual chunks
- Terser minification
- Asset optimization

### Runtime Optimization
- Static file caching
- Proper MIME type handling
- Error boundary implementation
- Lazy loading support

## Support

If issues persist:
1. Check the build verification output
2. Review server logs
3. Verify environment configuration
4. Check for dependency conflicts
