import { z } from 'zod';

export const envSchema = z.object({
  // Postgres (Neon)
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // App
  APP_URL: z.string().url(),
  CORS_ORIGINS: z.string().min(1),
  SESSION_SECRET: z.string().min(16),

  // Security
  JWT_SECRET: z.string().min(16).optional(),
  ADMIN_2FA_ISSUER: z.string().default('ChainSync'),

  // Payments (Subscriptions only)
  PAYSTACK_SECRET_KEY: z.string().min(1),
  PAYSTACK_PUBLIC_KEY: z.string().min(1),
  FLW_SECRET_KEY: z.string().min(1),
  FLW_PUBLIC_KEY: z.string().min(1),
  WEBHOOK_SECRET_PAYSTACK: z.string().min(1),
  WEBHOOK_SECRET_FLW: z.string().min(1),

  // Feature flags
  ENABLE_OFFLINE_POS: z.string().transform((v) => v === 'true').default('true' as any),

  // Optional/infra
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & { ENABLE_OFFLINE_POS: boolean };

export function loadEnv(raw: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data as Env;
}


