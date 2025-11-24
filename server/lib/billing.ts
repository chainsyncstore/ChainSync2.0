import { PRICING_TIERS, type ValidTier } from './constants';

export const DEFAULT_AUTOPAY_VERIFICATION_AMOUNTS: Record<'NGN' | 'USD', number> = {
  NGN: 10000, // ₦100 in kobo (Paystack minimum)
  USD: 100, // $1 in cents
};

export function getTierAmountMinor(tier: ValidTier, currency: 'NGN' | 'USD') {
  const config = PRICING_TIERS[tier];
  return currency === 'USD' ? config.usd : config.ngn;
}

export function getAutopayVerificationAmountMinor(currency: 'NGN' | 'USD') {
  const envValueRaw = currency === 'NGN'
    ? process.env.AUTOPAY_VERIFICATION_AMOUNT_NGN
    : process.env.AUTOPAY_VERIFICATION_AMOUNT_USD;
  const parsed = Number(envValueRaw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.trunc(parsed);
  }
  return DEFAULT_AUTOPAY_VERIFICATION_AMOUNTS[currency];
}

export function resolveClientBillingRedirectBase() {
  const raw = process.env.APP_URL || process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || '';
  if (!raw) return '';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}
