// Pricing constants - all amounts in cents for precision
export const PRICING_TIERS = {
  basic: {
    ngn: 3000000, // ₦30,000 in kobo (cents)
    usd: 3000,    // $30 in cents
    stores: "1 store only",
    features: [
      "1 Store Management",
      "Basic POS System",
      "Inventory Tracking",
      "Sales Reports",
      "Customer Management",
      "Email Support"
    ]
  },
  pro: {
    ngn: 10000000, // ₦100,000 in kobo (cents)
    usd: 10000,    // $100 in cents
    stores: "Max 10 stores",
    features: [
      "Up to 10 Stores",
      "Advanced POS Features",
      "Real-time Analytics",
      "AI-powered Insights",
      "Multi-location Support",
      "Priority Support",
      "Custom Branding",
      "Advanced Reporting"
    ]
  },
  enterprise: {
    ngn: 50000000, // ₦500,000 in kobo (cents)
    usd: 50000,    // $500 in cents
    stores: "10+ stores",
    features: [
      "Unlimited Stores",
      "Custom Integrations",
      "Dedicated Account Manager",
      "White-label Solutions",
      "API Access",
      "24/7 Phone Support",
      "Custom Training",
      "Advanced Security"
    ]
  }
} as const;

// Payment provider domains for security validation
export const PAYMENT_PROVIDER_DOMAINS = {
  paystack: ['paystack.com', 'paystack.co'],
  flutterwave: ['flutterwave.com', 'flutterwave.co', 'ravepay.co']
} as const;

// Valid tier and location values
export const VALID_TIERS = ['basic', 'pro', 'enterprise'] as const;
export const VALID_LOCATIONS = ['nigeria', 'international'] as const;

// E.164 phone validation regex
export const PHONE_REGEX = /^\+?[1-9]\d{6,15}$/;

// reCAPTCHA v3 site key (should be set in environment variables)
export const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

// hCaptcha site key (alternative to reCAPTCHA)
export const HCAPTCHA_SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY || '';
