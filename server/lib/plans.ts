export type PlanCode =
  | 'BASIC_NGN'
  | 'PRO_NGN'
  | 'ENTERPRISE_NGN'
  | 'BASIC_USD'
  | 'PRO_USD'
  | 'ENTERPRISE_USD';

export type Provider = 'PAYSTACK' | 'FLW';

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  currency: 'NGN' | 'USD';
  amountSmallestUnit: number; // kobo for NGN, cents for USD
  provider: Provider;
  // Environment variable that stores the provider's plan/payment_plan ID
  providerPlanIdEnv: string;
}

export const PLANS: Record<PlanCode, PlanDefinition> = {
  BASIC_NGN: {
    code: 'BASIC_NGN',
    name: 'Basic (NGN)',
    currency: 'NGN',
    amountSmallestUnit: 3000000,
    provider: 'PAYSTACK',
    providerPlanIdEnv: 'PAYSTACK_PLAN_BASIC',
  },
  PRO_NGN: {
    code: 'PRO_NGN',
    name: 'Pro (NGN)',
    currency: 'NGN',
    amountSmallestUnit: 10000000,
    provider: 'PAYSTACK',
    providerPlanIdEnv: 'PAYSTACK_PLAN_PRO',
  },
  ENTERPRISE_NGN: {
    code: 'ENTERPRISE_NGN',
    name: 'Enterprise (NGN)',
    currency: 'NGN',
    amountSmallestUnit: 50000000,
    provider: 'PAYSTACK',
    providerPlanIdEnv: 'PAYSTACK_PLAN_ENTERPRISE',
  },
  BASIC_USD: {
    code: 'BASIC_USD',
    name: 'Basic (USD)',
    currency: 'USD',
    amountSmallestUnit: 3000,
    provider: 'FLW',
    providerPlanIdEnv: 'FLW_PLAN_BASIC',
  },
  PRO_USD: {
    code: 'PRO_USD',
    name: 'Pro (USD)',
    currency: 'USD',
    amountSmallestUnit: 10000,
    provider: 'FLW',
    providerPlanIdEnv: 'FLW_PLAN_PRO',
  },
  ENTERPRISE_USD: {
    code: 'ENTERPRISE_USD',
    name: 'Enterprise (USD)',
    currency: 'USD',
    amountSmallestUnit: 50000,
    provider: 'FLW',
    providerPlanIdEnv: 'FLW_PLAN_ENTERPRISE',
  },
};

export function getPlan(code: string): PlanDefinition | null {
  return PLANS[code as PlanCode] || null;
}


