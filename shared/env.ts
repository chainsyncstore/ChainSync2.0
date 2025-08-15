import { z } from 'zod';

// Core env schema with optional payments/AI; strict on DB/Redis/session
export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
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
  // Feature flags
  ENABLE_OFFLINE_POS: z.string().transform((v) => v === 'true').default('true' as any),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & {
  ENABLE_OFFLINE_POS: boolean;
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

  return data;
}

export function parseCorsOrigins(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
