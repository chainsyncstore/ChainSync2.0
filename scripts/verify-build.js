#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.resolve(__dirname, '..', 'dist', 'public');

console.log('🔍 Verifying build output...');
console.log(`📁 Build directory: ${distPath}`);

if (!fs.existsSync(distPath)) {
  console.error('❌ Build directory does not exist!');
  console.log('💡 Run "npm run build" first');
  process.exit(1);
}

// Check for essential files
const requiredFiles = [
  'index.html'
];

console.log('\n📋 Checking required files:');
let allFilesExist = true;

for (const file of requiredFiles) {
  const filePath = path.join(distPath, file);
  const exists = fs.existsSync(filePath);
  const status = exists ? '✅' : '❌';
  console.log(`${status} ${file}`);
  
  if (exists) {
    const stats = fs.statSync(filePath);
    console.log(`   📊 Size: ${(stats.size / 1024).toFixed(2)} KB`);
  }
  
  if (!exists) {
    allFilesExist = false;
  }
}

// Check for at least one CSS and one JS file
const assetsPath = path.join(distPath, 'assets');
if (fs.existsSync(assetsPath)) {
  const assets = fs.readdirSync(assetsPath);
  const hasCss = assets.some(asset => asset.endsWith('.css'));
  const hasJs = assets.some(asset => asset.endsWith('.js'));
  
  console.log(`\n📦 Asset verification:`);
  console.log(`${hasCss ? '✅' : '❌'} CSS files present`);
  console.log(`${hasJs ? '✅' : '❌'} JavaScript files present`);
  
  if (!hasCss || !hasJs) {
    allFilesExist = false;
  }
}

// List all files in assets directory
if (fs.existsSync(assetsPath)) {
  console.log('\n📦 Assets directory contents:');
  const assets = fs.readdirSync(assetsPath);
  assets.forEach(asset => {
    const assetPath = path.join(assetsPath, asset);
    const stats = fs.statSync(assetPath);
    const size = (stats.size / 1024).toFixed(2);
    console.log(`   📄 ${asset} (${size} KB)`);
  });
}

// Check for common build issues
console.log('\n🔧 Build health check:');
const indexHtmlPath = path.join(distPath, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  const content = fs.readFileSync(indexHtmlPath, 'utf-8');
  
  // Check if CSS and JS files are properly referenced
  const hasCssLink = content.includes('href="/assets/') && content.includes('.css');
  const hasJsScript = content.includes('src="/assets/') && content.includes('.js');
  
  console.log(`${hasCssLink ? '✅' : '❌'} CSS files referenced`);
  console.log(`${hasJsScript ? '✅' : '❌'} JavaScript files referenced`);
  
  if (!hasCssLink || !hasJsScript) {
    console.log('⚠️  Asset references may be incorrect');
  }
}

if (allFilesExist) {
  console.log('\n🎉 Build verification completed successfully!');
} else {
  console.log('\n❌ Build verification failed!');
  console.log('💡 Check the build process and try again');
  process.exit(1);
}
