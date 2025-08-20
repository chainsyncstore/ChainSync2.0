export interface PendingSignupData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  password: string;
  tier: string;
  location: string;
}

// In-memory stores for pending signups (fallback for dev/test or when Redis unavailable)
const tokenToSignup = new Map<string, PendingSignupData>();
const referenceToToken = new Map<string, string>();

import { getRedisClient } from '../lib/redis';

const TOKEN_TTL_SECONDS = 30 * 60; // 30 minutes
const KEY_PREFIX = 'chainsync:pending-signup';

function tokenKey(token: string): string {
  return `${KEY_PREFIX}:token:${token}`;
}
function referenceKey(reference: string): string {
  return `${KEY_PREFIX}:reference:${reference}`;
}

function generateToken(): string {
  return (
    Math.random().toString(36).slice(2) +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}

export const PendingSignup = {
  create(data: PendingSignupData): string {
    const token = generateToken();
    const client = getRedisClient();
    if (client) {
      const key = tokenKey(token);
      client.set(key, JSON.stringify(data), { EX: TOKEN_TTL_SECONDS }).catch(() => {});
    } else {
      tokenToSignup.set(token, data);
      // In-memory TTL best-effort
      setTimeout(() => tokenToSignup.delete(token), TOKEN_TTL_SECONDS * 1000).unref?.();
    }
    return token;
  },
  getByToken(token: string | undefined | null): PendingSignupData | undefined {
    if (!token) return undefined;
    const client = getRedisClient();
    if (client) {
      // Synchronous interface not available; this path is used only in a simple GET for presence.
      // For production, rely on reference association flow.
      // Fallback to undefined to avoid blocking.
      return undefined;
    }
    return tokenToSignup.get(token);
  },
  associateReference(token: string, reference: string): void {
    const client = getRedisClient();
    if (client) {
      client.multi()
        .set(referenceKey(reference), token, { EX: TOKEN_TTL_SECONDS })
        .expire(tokenKey(token), TOKEN_TTL_SECONDS)
        .exec()
        .catch(() => {});
    } else {
      referenceToToken.set(reference, token);
      setTimeout(() => referenceToToken.delete(reference), TOKEN_TTL_SECONDS * 1000).unref?.();
    }
  },
  getByReference(reference: string): PendingSignupData | undefined {
    const client = getRedisClient();
    if (client) {
      // This is called within a request handler; we need to block on Redis.
      // However, this module is synchronous. Provide a best-effort sync facade by using deasync-like pattern is not desired.
      // Instead, callers should fetch via helper that supports async. Provide a sync fallback path for memory mode.
      throw new Error('PendingSignup.getByReference requires Redis-less mode. Use getByReferenceAsync in production.');
    }
    const token = referenceToToken.get(reference);
    if (!token) return undefined;
    return tokenToSignup.get(token);
  },
  clearByReference(reference: string): void {
    const client = getRedisClient();
    if (client) {
      client.get(referenceKey(reference)).then((token) => {
        if (token) {
          client.del(referenceKey(reference)).catch(() => {});
          client.del(tokenKey(token)).catch(() => {});
        }
      }).catch(() => {});
    } else {
      const token = referenceToToken.get(reference);
      if (token) {
        referenceToToken.delete(reference);
        tokenToSignup.delete(token);
      }
    }
  },
  clearByToken(token: string): void {
    const client = getRedisClient();
    if (client) {
      client.del(tokenKey(token)).catch(() => {});
      // Best-effort: we cannot scan for references without blocking; rely on TTL
    } else {
      tokenToSignup.delete(token);
      for (const [ref, t] of referenceToToken.entries()) {
        if (t === token) referenceToToken.delete(ref);
      }
    }
  },
  // Async helpers for Redis-backed production paths
  async getByReferenceAsync(reference: string): Promise<PendingSignupData | undefined> {
    const client = getRedisClient();
    if (!client) {
      const token = referenceToToken.get(reference);
      if (!token) return undefined;
      return tokenToSignup.get(token);
    }
    try {
      const token = await client.get(referenceKey(reference));
      if (!token) return undefined;
      const json = await client.get(tokenKey(token));
      if (!json) return undefined;
      return JSON.parse(json) as PendingSignupData;
    } catch {
      return undefined;
    }
  }
};


