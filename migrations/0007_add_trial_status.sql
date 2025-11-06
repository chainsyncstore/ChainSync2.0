ALTER TYPE "public"."subscription_status" ADD VALUE IF NOT EXISTS 'TRIAL';
ALTER TYPE "public"."subscription_status" ADD VALUE IF NOT EXISTS 'SUSPENDED';
