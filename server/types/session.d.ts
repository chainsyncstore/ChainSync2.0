// Global session typings for Express session usage across the auth flow
// Ensure the module is resolvable for augmentation
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    pendingUserId?: string;
    twofaVerified?: boolean;
    orgId?: string;
    user?: { id?: string; storeId?: string } | undefined;
  }
}
