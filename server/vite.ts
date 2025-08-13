import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { logger } from "./lib/logger";

const viteLogger = createLogger();

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Utility function to safely resolve paths
function safePathResolve(...paths: string[]): string {
  try {
    return path.resolve(__dirname, ...paths);
  } catch (error) {
    logger.error('Failed to resolve path', { paths, error: error instanceof Error ? error.message : String(error) });
    throw new Error(`Path resolution failed: ${paths.join('/')}`);
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        // Don't exit in development, just log the error
        if (process.env.NODE_ENV === 'production') {
          process.exit(1);
        }
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = safePathResolve("..", "client", "index.html");

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  try {
    const distPath = safePathResolve("..", "dist", "public");

    if (!fs.existsSync(distPath)) {
      throw new Error(
        `Could not find the build directory: ${distPath}, make sure to build the client first`,
      );
    }

    // Log the static serving setup
    logger.info('Setting up static file serving', { 
      distPath,
      exists: fs.existsSync(distPath),
      files: fs.readdirSync(distPath)
    });

    // Add a fallback middleware to ensure JavaScript files always have correct MIME type
    app.use((req, res, next) => {
      const path = req.path;
      
      // Force correct MIME type for JavaScript files
      if (path.endsWith('.js') || path.includes('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        logger.debug('Forced JavaScript MIME type for path', { path });
      }
      
      // Log all requests to help with debugging
      logger.debug('Request received in fallback middleware', { 
        path, 
        method: req.method,
        userAgent: req.get('User-Agent')
      });
      
      next();
    });

    // Serve static files from /dist/public with proper MIME types
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        // Get file extension for better MIME type detection
        const ext = path.extname(filePath).toLowerCase();
        
        // Enhanced MIME type detection that handles edge cases
        let contentType = null;
        
        // Check for JavaScript files first (most critical)
        if (filePath.includes('.js') || filePath.endsWith('.js') || ext === '.js') {
          contentType = 'application/javascript; charset=utf-8';
        } else if (filePath.includes('.css') || filePath.endsWith('.css') || ext === '.css') {
          contentType = 'text/css; charset=utf-8';
        } else if (filePath.includes('.html') || filePath.endsWith('.html') || ext === '.html') {
          contentType = 'text/html; charset=utf-8';
        } else if (ext === '.json') {
          contentType = 'application/json; charset=utf-8';
        } else if (ext === '.png') {
          contentType = 'image/png';
        } else if (ext === '.jpg' || ext === '.jpeg') {
          contentType = 'image/jpeg';
        } else if (ext === '.svg') {
          contentType = 'image/svg+xml';
        } else if (ext === '.ico') {
          contentType = 'image/x-icon';
        } else if (ext === '.woff') {
          contentType = 'font/woff';
        } else if (ext === '.woff2') {
          contentType = 'font/woff2';
        } else if (ext === '.ttf') {
          contentType = 'font/ttf';
        } else if (ext === '.eot') {
          contentType = 'application/vnd.ms-fontobject';
        }
        
        // Set the content type if we determined one
        if (contentType) {
          res.setHeader('Content-Type', contentType);
          
          // Add cache control headers
          if (contentType.includes('javascript') || contentType.includes('css')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
          } else if (contentType.includes('html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else if (contentType.includes('image/')) {
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day for images
          }
        }
        
        // Log MIME type setting for debugging
        logger.debug('Setting MIME type for file', {
          filePath,
          extension: ext,
          contentType: contentType || 'not set (using Express default)',
          finalContentType: res.getHeader('Content-Type')
        });
      }
    }));

    // Additional middleware to catch any JavaScript files that might have slipped through
    // with incorrect MIME types and force the correct content type
    app.use((req, res, next) => {
      const path = req.path;
      
      // Force correct MIME type for any JavaScript files
      if (path.includes('.js') || path.endsWith('.js')) {
        // Override any existing Content-Type header
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        logger.debug('Forced JavaScript MIME type override for path', { path });
      }
      
      next();
    });

    // Catch-all route to serve index.html for SPA routing
    // BUT exclude asset requests and API routes
    app.get("*", (req, res) => {
      const path = req.path;
      
      // Skip API routes
      if (path.startsWith('/api/')) {
        return res.status(404).json({
          error: 'API endpoint not found',
          path: path,
          message: 'The requested API endpoint could not be found'
        });
      }
      
      // Skip asset requests - these should be handled by static middleware above
      // Use a more precise check for assets to avoid interfering with JS files
      if (path.startsWith('/assets/') || 
          path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json|xml|txt|pdf|zip|mp4|webm|ogg|mp3|wav)$/i)) {
        return res.status(404).json({
          error: 'Asset not found',
          path: path,
          message: 'The requested asset could not be found'
        });
      }
      
      // Serve index.html for SPA routing (only for page routes)
      const indexPath = path.join(distPath, "index.html");
      
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).json({
          error: 'Page not found',
          path: path,
          message: 'The requested page could not be found'
        });
      }
    });
  } catch (error) {
    logger.error('Failed to setup static file serving', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}
