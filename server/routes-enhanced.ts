import type { Express } from "express";
import { createServer, type Server } from "http";

// Deprecated: All routes are now registered exclusively in `server/api/index.ts`.
// This file remains as a no-op to avoid accidental duplicate route registration
// and to prevent alternate session middleware from being applied.
export async function registerEnhancedRoutes(app: Express): Promise<Server> {
  return createServer(app);
}
