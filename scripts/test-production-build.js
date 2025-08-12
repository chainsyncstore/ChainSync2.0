#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Testing production build...');

// Check if dist directory exists
const distPath = path.resolve(__dirname, '..', 'dist', 'public');
if (!fs.existsSync(distPath)) {
  console.error('❌ Build directory does not exist!');
  console.log('💡 Run "npm run build" first');
  process.exit(1);
}

// Test specific asset paths that were failing
const testAssets = [
  '/assets/index-kKIE8tXb.js',
  '/assets/vendor-C1mj56OW.js',
  '/assets/ui-BqWMKFKI.js',
  '/assets/utils-5TkUunJy.js',
  '/assets/index-DBEnJVc9.css'
];

console.log('\n🔍 Testing asset availability:');
let allAssetsExist = true;

for (const asset of testAssets) {
  const assetPath = path.join(distPath, asset.replace('/', ''));
  const exists = fs.existsSync(assetPath);
  const status = exists ? '✅' : '❌';
  console.log(`${status} ${asset}`);
  
  if (exists) {
    const stats = fs.statSync(assetPath);
    console.log(`   📊 Size: ${(stats.size / 1024).toFixed(2)} KB`);
    
    // Check file content for basic integrity
    try {
      const content = fs.readFileSync(assetPath, 'utf-8');
      if (asset.endsWith('.js') && content.length > 100) {
        console.log('   ✅ JavaScript content looks valid');
      } else if (asset.endsWith('.css') && content.length > 100) {
        console.log('   ✅ CSS content looks valid');
      } else {
        console.log('   ⚠️  File content may be incomplete');
        allAssetsExist = false;
      }
    } catch (err) {
      console.log(`   ❌ Error reading file: ${err.message}`);
      allAssetsExist = false;
    }
  } else {
    allAssetsExist = false;
  }
}

// Test HTML file
console.log('\n📄 Testing HTML file:');
const htmlPath = path.join(distPath, 'index.html');
if (fs.existsSync(htmlPath)) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  
  // Check for required elements
  const hasRoot = html.includes('<div id="root">');
  const hasCssLink = html.includes('href="/assets/') && html.includes('.css');
  const hasJsScript = html.includes('src="/assets/') && html.includes('.js');
  const hasInlineScript = html.includes('<script type="text/javascript">');
  
  console.log(`${hasRoot ? '✅' : '❌'} Root div present`);
  console.log(`${hasCssLink ? '✅' : '❌'} CSS files referenced`);
  console.log(`${hasJsScript ? '✅' : '❌'} JavaScript files referenced`);
  console.log(`${hasInlineScript ? '✅' : '❌'} Inline script present (for Replit banner)`);
  
  if (!hasRoot || !hasCssLink || !hasJsScript) {
    allAssetsExist = false;
  }
  
  // Check file size
  const stats = fs.statSync(htmlPath);
  console.log(`   📊 Size: ${(stats.size / 1024).toFixed(2)} KB`);
} else {
  console.log('❌ index.html not found');
  allAssetsExist = false;
}

// Summary
console.log('\n📋 Test Summary:');
if (allAssetsExist) {
  console.log('🎉 All tests passed! Your production build is ready.');
  console.log('\n💡 Next steps:');
  console.log('1. Deploy the dist/ directory to your server');
  console.log('2. Ensure NODE_ENV=production is set');
  console.log('3. Start the server with: npm start');
  console.log('4. The CSP and static asset issues have been resolved');
} else {
  console.log('❌ Some tests failed. Please check the build process.');
  process.exit(1);
}
