-- Migration: Add subscription tracking tables
-- This migration adds tables to track upfront fees, subscriptions, and billing credits

-- Create subscription_status enum
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'cancelled', 'suspended');

-- Create subscriptions table
CREATE TABLE "public"."subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "tier" varchar(50) NOT NULL,
  "status" "public"."subscription_status" NOT NULL DEFAULT 'trial',
  "upfrontFeePaid" decimal(10,2) NOT NULL,
  "upfrontFeeCurrency" varchar(3) NOT NULL,
  "monthlyAmount" decimal(10,2) NOT NULL,
  "monthlyCurrency" varchar(3) NOT NULL,
  "trialStartDate" timestamp NOT NULL DEFAULT NOW(),
  "trialEndDate" timestamp NOT NULL,
  "nextBillingDate" timestamp,
  "upfrontFeeCredited" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp NOT NULL DEFAULT NOW()
);

-- Create subscription_payments table
CREATE TABLE "public"."subscription_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "subscriptionId" uuid NOT NULL REFERENCES "public"."subscriptions"("id") ON DELETE CASCADE,
  "paymentReference" varchar(255) NOT NULL,
  "amount" decimal(10,2) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "paymentType" varchar(50) NOT NULL, -- 'upfront_fee', 'monthly_billing'
  "status" varchar(50) NOT NULL, -- 'pending', 'completed', 'failed'
  "provider" varchar(50) NOT NULL, -- 'paystack', 'flutterwave'
  "metadata" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX "subscriptions_user_id_idx" ON "public"."subscriptions"("userId");
CREATE INDEX "subscriptions_status_idx" ON "public"."subscriptions"("status");
CREATE INDEX "subscriptions_trial_end_date_idx" ON "public"."subscriptions"("trialEndDate");
CREATE INDEX "subscription_payments_subscription_id_idx" ON "public"."subscription_payments"("subscriptionId");
CREATE INDEX "subscription_payments_reference_idx" ON "public"."subscription_payments"("paymentReference");
CREATE INDEX "subscription_payments_status_idx" ON "public"."subscription_payments"("status");

-- Add subscription_id to users table for easy lookup
ALTER TABLE "public"."users" ADD COLUMN "subscriptionId" uuid REFERENCES "public"."subscriptions"("id");

-- Create index for subscription lookup
CREATE INDEX "users_subscription_id_idx" ON "public"."users"("subscriptionId");
