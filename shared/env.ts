import { z } from 'zod';

// Core env schema with optional payments/AI; strict on DB/Redis/session
export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  APP_URL: z.string().url(),
  BASE_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().min(1), // CSV list
  SESSION_SECRET: z.string().min(16),
  JWT_SECRET: z.string().min(16).optional(),
  ADMIN_2FA_ISSUER: z.string().default('ChainSync'),
  // Payments (optional in dev)
  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
  PAYSTACK_PUBLIC_KEY: z.string().min(1).optional(),
  FLUTTERWAVE_SECRET_KEY: z.string().min(1).optional(),
  FLUTTERWAVE_PUBLIC_KEY: z.string().min(1).optional(),
  WEBHOOK_SECRET_PAYSTACK: z.string().min(1).optional(),
  WEBHOOK_SECRET_FLW: z.string().min(1).optional(),
  // AI (optional)
  OPENAI_API_KEY: z.string().min(1).optional(),
  // Phase 8: Enhanced Observability & Security
  WS_ENABLED: z.string().transform((v) => v === 'true').default('true' as any),
  WS_PATH: z.string().default('/ws/notifications'),
  WS_HEARTBEAT_INTERVAL: z.string().transform((v) => parseInt(v) || 30000).default('30000' as any),
  WS_MAX_CONNECTIONS: z.string().transform((v) => parseInt(v) || 1000).default('1000' as any),
  AI_ANALYTICS_ENABLED: z.string().transform((v) => v === 'true').default('false' as any),
  AI_MODEL_CACHE_TTL: z.string().transform((v) => parseInt(v) || 3600).default('3600' as any),
  OFFLINE_SYNC_ENABLED: z.string().transform((v) => v === 'true').default('true' as any),
  OFFLINE_SYNC_INTERVAL: z.string().transform((v) => parseInt(v) || 30000).default('30000' as any),
  SECURITY_AUDIT_ENABLED: z.string().transform((v) => v === 'true').default('true' as any),
  MONITORING_ALERT_WEBHOOK: z.string().url().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Feature flags
  ENABLE_OFFLINE_POS: z.string().transform((v) => v === 'true').default('true' as any),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & {
  ENABLE_OFFLINE_POS: boolean;
  WS_ENABLED: boolean;
  WS_HEARTBEAT_INTERVAL: number;
  WS_MAX_CONNECTIONS: number;
  AI_ANALYTICS_ENABLED: boolean;
  AI_MODEL_CACHE_TTL: number;
  OFFLINE_SYNC_ENABLED: boolean;
  OFFLINE_SYNC_INTERVAL: number;
  SECURITY_AUDIT_ENABLED: boolean;
  BASE_URL?: string;
  FLUTTERWAVE_SECRET_KEY?: string;
  FLUTTERWAVE_PUBLIC_KEY?: string;
};

export function loadEnv(raw: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const data = parsed.data as Env;

  // Derived/compat values
  if (!data.BASE_URL) {
    data.BASE_URL = data.APP_URL;
  }
  // Backward-compatible FLW_* aliases
  if (!data.FLUTTERWAVE_SECRET_KEY && (raw.FLW_SECRET_KEY?.length || 0) > 0) {
    data.FLUTTERWAVE_SECRET_KEY = raw.FLW_SECRET_KEY as string;
  }
  if (!data.FLUTTERWAVE_PUBLIC_KEY && (raw.FLW_PUBLIC_KEY?.length || 0) > 0) {
    data.FLUTTERWAVE_PUBLIC_KEY = raw.FLW_PUBLIC_KEY as string;
  }

  // Production hard-requirements
  if (data.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!data.REDIS_URL) missing.push('REDIS_URL');
    if (missing.length) {
      throw new Error(`Invalid environment configuration:\n${missing.join(', ')} required in production`);
    }
  }

  return data;
}

export function parseCorsOrigins(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
