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

    // Serve static files from /dist/public with proper MIME types
    app.use(express.static(distPath, {
      setHeaders: (res, path) => {
        // Set proper MIME types for different file types
        if (path.endsWith('.css')) {
          res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript');
        } else if (path.endsWith('.html')) {
          res.setHeader('Content-Type', 'text/html');
        } else if (path.endsWith('.json')) {
          res.setHeader('Content-Type', 'application/json');
        } else if (path.endsWith('.png')) {
          res.setHeader('Content-Type', 'image/png');
        } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
          res.setHeader('Content-Type', 'image/jpeg');
        } else if (path.endsWith('.svg')) {
          res.setHeader('Content-Type', 'image/svg+xml');
        } else if (path.endsWith('.ico')) {
          res.setHeader('Content-Type', 'image/x-icon');
        }
        
        // Add cache control headers
        if (path.endsWith('.css') || path.endsWith('.js')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
        } else if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }));

    // Catch-all route to serve index.html for SPA routing
    app.get("*", (req, res) => {
      // Skip API routes
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({
          error: 'API endpoint not found',
          path: req.path,
          message: 'The requested API endpoint could not be found'
        });
      }
      
      // Serve index.html for all other routes (SPA routing)
      const indexPath = path.join(distPath, "index.html");
      
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).json({
          error: 'Page not found',
          path: req.path,
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
