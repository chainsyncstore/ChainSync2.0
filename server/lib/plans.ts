export interface Plan {
  code: string;
  name: string;
  maxStores: number;
  availableRoles: ('ADMIN' | 'MANAGER' | 'CASHIER')[];
}

export const plans: Record<string, Plan> = {
  basic: {
    code: 'basic',
    name: 'Basic Plan',
    maxStores: 1,
    availableRoles: ['ADMIN', 'CASHIER'],
  },
  pro: {
    code: 'pro',
    name: 'Pro Plan',
    maxStores: 10,
    availableRoles: ['ADMIN', 'MANAGER', 'CASHIER'],
  },
  enterprise: {
    code: 'enterprise',
    name: 'Enterprise Plan',
    maxStores: Infinity,
    availableRoles: ['ADMIN', 'MANAGER', 'CASHIER'],
  },
};

export function getPlan(planCode: string): Plan | undefined {
  const plan = plans[planCode];
  if (plan) {
    return plan;
  }
  if (planCode.startsWith('PRO') || planCode.startsWith('PREMIUM')) {
    return plans.pro;
  }
  if (planCode.startsWith('ENTERPRISE')) {
    return plans.enterprise;
  }
  // Default to basic for unknown or legacy plan codes
  return plans.basic;
}
