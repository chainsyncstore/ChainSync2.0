import { describe, it, expect } from 'vitest';
import { convertMoney, normalizeMoney, type Money, type CurrencyRates } from '@shared/lib/currency';

const rates: CurrencyRates = {
  NGN: { NGN: 1, USD: 0.000625 },
  USD: { USD: 1, NGN: 1600 },
};

describe('currency helpers', () => {
  it('returns identical money when converting within the same currency', () => {
    const input: Money = { amount: 100, currency: 'NGN' };
    const result = convertMoney(input, 'NGN');
    expect(result).toEqual(input);
  });

  it('converts using direct rate when available', () => {
    const input: Money = { amount: 100, currency: 'USD' };
    const result = convertMoney({ ...input, rates }, 'NGN');
    expect(result.currency).toBe('NGN');
    expect(result.amount).toBeCloseTo(160000, 2);
  });

  it('converts via base currency when direct rate is missing', () => {
    const customRates: CurrencyRates = {
      NGN: { NGN: 1 },
      USD: { USD: 1, NGN: 1600 },
    };
    const input: Money = { amount: 200, currency: 'NGN' };
    const result = convertMoney({ ...input, rates: customRates, baseCurrency: 'USD' }, 'USD');
    expect(result.currency).toBe('USD');
    expect(result.amount).toBeCloseTo(0.125, 3);
  });

  it('normalizes mixed currency amounts', () => {
    const values: Money[] = [
      { amount: 100, currency: 'USD' },
      { amount: 160000, currency: 'NGN' },
    ];
    const result = normalizeMoney(values, 'USD', rates);
    expect(result.currency).toBe('USD');
    expect(result.amount).toBeCloseTo(200, 2);
  });

  it('throws on unsupported currency', () => {
    expect(() => convertMoney({ amount: 10, currency: 'NGN' }, 'EUR' as any)).toThrowError('Unsupported currency');
  });
});
