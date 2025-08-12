import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { logger } from "./lib/logger";

const viteLogger = createLogger();

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
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

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
  const distPath = path.resolve(import.meta.dirname, "..", "dist", "public");

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

  // Serve static files with proper MIME types and error handling
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (filePath.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html');
      } else if (filePath.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json');
      }
    },
    // Add error handling for missing files
    fallthrough: false
  }));

  // Handle 404s for static assets more gracefully
  app.use('/assets/*', (req, res) => {
    logger.warn('Static asset not found', { 
      path: req.path,
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer')
    });
    res.status(404).json({ 
      error: 'Asset not found',
      path: req.path 
    });
  });

  // fall through to index.html for SPA routing
  app.use("*", (req, res) => {
    // Only serve index.html for routes that look like pages, not assets
    if (req.path.startsWith('/assets/') || req.path.includes('.')) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    // Log SPA fallback
    logger.debug('Serving SPA fallback', { path: req.path });
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
