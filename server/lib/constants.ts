// Server-side constants for payment security and pricing
// All amounts stored in smallest unit (kobo for NGN, cents for USD)

export const PRICING_TIERS = {
  basic: {
    ngn: 3000000, // ₦30,000 in kobo
    usd: 3000,    // $30 in cents
  },
  pro: {
    ngn: 10000000, // ₦100,000 in kobo
    usd: 10000,    // $100 in cents
  },
  enterprise: {
    ngn: 50000000, // ₦500,000 in kobo
    usd: 50000,    // $500 in cents
  }
} as const;

// Trusted payment provider domains - only allow URLs from these hosts
export const TRUSTED_PAYMENT_PROVIDERS = {
  paystack: ['paystack.com', 'paystack.co'],
  flutterwave: ['flutterwave.com', 'flutterwave.co', 'ravepay.co']
} as const;

// Valid subscription tiers
export const VALID_TIERS = ['basic', 'pro', 'enterprise'] as const;

// Valid currencies
export const VALID_CURRENCIES = ['NGN', 'USD'] as const;

// Payment provider mapping by currency
export const CURRENCY_PROVIDER_MAP = {
  NGN: 'paystack',
  USD: 'flutterwave'
} as const;

// Type exports
export type ValidTier = typeof VALID_TIERS[number];
export type ValidCurrency = typeof VALID_CURRENCIES[number];
export type ValidProvider = keyof typeof TRUSTED_PAYMENT_PROVIDERS;
