import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, type Plugin } from "vite";

// Compute a base directory that's safe across CJS and ESM runtimes
const baseDir = (typeof __dirname !== 'undefined')
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

// Utility function to safely resolve paths relative to the repository base directory
function safePathResolve(...pathsArr: string[]): string {
  try {
    return path.resolve(baseDir, ...pathsArr);
  } catch (error) {
    console.error('Failed to resolve path:', pathsArr, error);
    throw new Error(`Path resolution failed: ${pathsArr.join('/')}`);
  }
}

// Plugin to generate asset-manifest.json for service worker precaching
function assetManifestPlugin(): Plugin {
  return {
    name: 'asset-manifest',
    apply: 'build',
    writeBundle(options, bundle) {
      const outDir = options.dir || safePathResolve("dist", "public");
      const assets: string[] = [];
      
      for (const [fileName, chunk] of Object.entries(bundle)) {
        // Include JS and CSS files
        if (fileName.endsWith('.js') || fileName.endsWith('.css')) {
          assets.push(`/${fileName}`);
        }
      }
      
      const manifest = {
        files: assets,
        timestamp: Date.now(),
      };
      
      const manifestPath = path.join(outDir, 'asset-manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`Asset manifest generated with ${assets.length} files`);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    assetManifestPlugin(),
  ],
  resolve: {
    alias: {
      "@": safePathResolve("client", "src"),
      "@shared": safePathResolve("shared"),
      "@assets": safePathResolve("attached_assets"),
    },
  },
  root: safePathResolve("client"),
  build: {
    outDir: safePathResolve("dist", "public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Give the admin users page a stable, explicit chunk name so its
          // generated asset appears as admin-users-[hash].js rather than users-[hash].js
          if (id.includes(`${path.sep}client${path.sep}src${path.sep}pages${path.sep}admin${path.sep}users`)) {
            return 'admin-users';
          }

          // Preserve explicit groups first
          const map: Record<string, string> = {
            'recharts': 'charts',
            'react-hook-form': 'forms',
            '@hookform/resolvers': 'forms',
            '@radix-ui/react-dialog': 'ui',
            '@radix-ui/react-dropdown-menu': 'ui',
            '@radix-ui/react-select': 'ui',
            '@radix-ui/react-tabs': 'ui',
            '@radix-ui/react-toast': 'ui',
            '@radix-ui/react-popover': 'ui',
            '@radix-ui/react-hover-card': 'ui',
            'lucide-react': 'icons',
            'wouter': 'router',
            '@tanstack/react-query': 'reactQuery',
            'react-day-picker': 'daypicker',
            'date-fns': 'utils',
            'clsx': 'utils',
            'tailwind-merge': 'utils',
            'react': 'vendor',
            'react-dom': 'vendor',
          };

          if (id.includes('node_modules')) {
            // Try to map to explicit groups first
            for (const key of Object.keys(map)) {
              if (id.includes(`${path.sep}node_modules${path.sep}${key}${path.sep}`)) return map[key];
              if (id.includes(`/node_modules/${key}/`)) return map[key];
            }

            // Extract package name robustly on Windows/Unix
            const nmIndex = id.lastIndexOf('node_modules');
            const sub = id.slice(nmIndex + 'node_modules'.length + 1);
            const parts = sub.split(/[/\\]/).filter(Boolean);
            let pkg = parts[0] || 'vendor';
            if (pkg.startsWith('@') && parts.length >= 2) {
              pkg = `${pkg}/${parts[1]}`;
            }
            const name = pkg.replace(/[^a-zA-Z0-9@/_-]/g, '_').replace(/[\\/]/g, '_');
            return `vendor-${name}`;
          }

          // Default: let Rollup decide for app code
          return undefined;
        },
        // Ensure proper asset handling
        assetFileNames: (assetInfo) => {
          if (/\.(css)$/.test(assetInfo.name || '')) {
            return `assets/[name]-[hash].css`;
          }
          if (/\.(js)$/.test(assetInfo.name || '')) {
            return `assets/[name]-[hash].js`;
          }
          return `assets/[name]-[hash].[ext]`;
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    // Enable tree shaking and minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: process.env.NODE_ENV === 'production',
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    // Ensure proper source maps
    sourcemap: process.env.NODE_ENV === 'development',
    // Production optimizations
    target: 'es2015',
    cssCodeSplit: true,
    reportCompressedSize: false,
    // Ensure assets are properly handled
    assetsInlineLimit: 4096,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      }
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      'recharts',
      'react-hook-form',
      'date-fns',
      'clsx',
      'tailwind-merge',
    ],
  },
});
