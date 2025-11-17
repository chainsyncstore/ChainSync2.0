import { getRedisClient } from '../lib/redis';

export interface PendingSignupData {
  userId: string;
  orgId: string;
  email: string;
  tier: string;
  currencyCode: string;
  provider: 'PAYSTACK' | 'FLW';
  location: string;
  companyName: string;
  firstName: string;
  lastName: string;
  phone: string;
  createdAt: string;
  otpHash: string;
  otpSalt: string;
  otpExpiresAt: string;
  otpAttempts: number;
  otpResendCount: number;
  lastOtpSentAt: string;
}

// In-memory stores for pending signups (fallback for dev/test or when Redis unavailable)
const tokenToSignup = new Map<string, PendingSignupData>();
const referenceToToken = new Map<string, string>();
const emailToToken = new Map<string, string>();

const TOKEN_TTL_SECONDS = 60 * 60; // 60 minutes
const KEY_PREFIX = 'chainsync:pending-signup';

function tokenKey(token: string): string {
  return `${KEY_PREFIX}:token:${token}`;
}
function referenceKey(reference: string): string {
  return `${KEY_PREFIX}:reference:${reference}`;
}
function emailKey(email: string): string {
  return `${KEY_PREFIX}:email:${email.toLowerCase()}`;
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
      client
        .multi()
        .set(key, JSON.stringify(data), { EX: TOKEN_TTL_SECONDS })
        .set(emailKey(data.email), token, { EX: TOKEN_TTL_SECONDS })
        .exec()
        .catch(() => {});
    } else {
      tokenToSignup.set(token, data);
      // In-memory TTL best-effort
      setTimeout(() => tokenToSignup.delete(token), TOKEN_TTL_SECONDS * 1000).unref?.();
      emailToToken.set(data.email.toLowerCase(), token);
      setTimeout(() => {
        if (emailToToken.get(data.email.toLowerCase()) === token) {
          emailToToken.delete(data.email.toLowerCase());
        }
      }, TOKEN_TTL_SECONDS * 1000).unref?.();
    }
    return token;
  },
  getByEmail(email: string | undefined | null): PendingSignupData | undefined {
    if (!email) return undefined;
    const token = emailToToken.get(email.toLowerCase());
    if (!token) return undefined;
    return tokenToSignup.get(token);
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
  async getByTokenAsync(token: string | undefined | null): Promise<PendingSignupData | undefined> {
    if (!token) return undefined;
    const client = getRedisClient();
    if (!client) {
      return tokenToSignup.get(token);
    }
    try {
      const json = await client.get(tokenKey(token));
      if (!json) return undefined;
      return JSON.parse(json) as PendingSignupData;
    } catch {
      return undefined;
    }
  },
  async getByEmailWithTokenAsync(email: string | undefined | null): Promise<{ token: string; data: PendingSignupData } | undefined> {
    if (!email) return undefined;
    const normalized = email.toLowerCase();
    const client = getRedisClient();
    if (client) {
      try {
        const token = await client.get(emailKey(normalized));
        if (!token) return undefined;
        const json = await client.get(tokenKey(token));
        if (!json) return undefined;
        return { token, data: JSON.parse(json) as PendingSignupData };
      } catch {
        return undefined;
      }
    }

    const token = emailToToken.get(normalized);
    if (!token) return undefined;
    const data = tokenToSignup.get(token);
    if (!data) return undefined;
    return { token, data };
  },
  async updateToken(token: string, data: PendingSignupData): Promise<void> {
    const client = getRedisClient();
    if (client) {
      await client
        .multi()
        .set(tokenKey(token), JSON.stringify(data), { EX: TOKEN_TTL_SECONDS })
        .set(emailKey(data.email), token, { EX: TOKEN_TTL_SECONDS })
        .exec()
        .catch(() => {});
      return;
    }

    tokenToSignup.set(token, data);
    emailToToken.set(data.email.toLowerCase(), token);
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
      client
        .get(referenceKey(reference))
        .then(async (token) => {
          if (token) {
            try {
              const json = await client.get(tokenKey(token));
              if (json) {
                const data = JSON.parse(json) as PendingSignupData;
                await client.del(emailKey(data.email)).catch(() => {});
              }
            } catch {
              // swallow
            }
            client.del(referenceKey(reference)).catch(() => {});
            client.del(tokenKey(token)).catch(() => {});
          }
        })
        .catch(() => {});
    } else {
      const token = referenceToToken.get(reference);
      if (token) {
        referenceToToken.delete(reference);
        tokenToSignup.delete(token);
        const pending = emailToToken.entries();
        for (const [email, mappedToken] of pending) {
          if (mappedToken === token) {
            emailToToken.delete(email);
            break;
          }
        }
      }
    }
  },
  clearByToken(token: string): void {
    const client = getRedisClient();
    if (client) {
      client
        .get(tokenKey(token))
        .then(async (json) => {
          if (json) {
            try {
              const data = JSON.parse(json) as PendingSignupData;
              await client.del(emailKey(data.email)).catch(() => {});
            } catch {
              // ignore
            }
          }
          await client.del(tokenKey(token)).catch(() => {});
        })
        .catch(() => {});
      // Best-effort: we cannot scan for references without blocking; rely on TTL
    } else {
      tokenToSignup.delete(token);
      for (const [ref, t] of referenceToToken.entries()) {
        if (t === token) referenceToToken.delete(ref);
      }
      for (const [email, mappedToken] of emailToToken.entries()) {
        if (mappedToken === token) {
          emailToToken.delete(email);
          break;
        }
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


