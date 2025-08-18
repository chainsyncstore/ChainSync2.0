/**
 * DEPRECATED: This module has been superseded by `server/api/index.ts`.
 * Canonical entrypoint is `@server/api` (i.e., `server/api/index.ts`).
 * This shim re-exports `registerRoutes` to avoid duplicate route registration
 * and to keep tests/legacy imports working.
 */
export { registerRoutes } from './api';
