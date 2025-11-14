/**
 * Server-side currency helpers.
 * These are stubs and should be replaced with actual rate fetching and caching logic.
 */
import { convertMoney, normalizeMoney } from "@shared/lib/currency";
import type { CurrencyCode, CurrencyRates, Money } from "@shared/lib/currency";

export interface CurrencyRateProvider {
  getRates(): Promise<CurrencyRates | null>;
}

export class StaticCurrencyRateProvider implements CurrencyRateProvider {
  private rates: CurrencyRates;

  constructor(rates: CurrencyRates) {
    this.rates = rates;
  }

  async getRates(): Promise<CurrencyRates> {
    return { ...this.rates };
  }
}

export function getDefaultRates(): CurrencyRates {
  const usdToNgn = Number(process.env.DEFAULT_USD_TO_NGN_RATE ?? "1600");
  const ngnToUsd = usdToNgn === 0 ? 0 : 1 / usdToNgn;
  return {
    NGN: { NGN: 1, USD: Number.isFinite(ngnToUsd) ? ngnToUsd : 0 },
    USD: { USD: 1, NGN: Number.isFinite(usdToNgn) ? usdToNgn : 0 },
  } as CurrencyRates;
}

export interface ConvertAmountInput extends Money {
  targetCurrency: CurrencyCode;
  orgId: string;
  rates?: CurrencyRates;
  provider?: CurrencyRateProvider;
  baseCurrency?: CurrencyCode;
}

export async function convertAmount(input: ConvertAmountInput): Promise<Money> {
  const { targetCurrency, provider, orgId: _orgId, rates: providedRates, baseCurrency, ...money } = input;
  void _orgId;

  let rates = providedRates;
  if (!rates) {
    rates = provider ? await provider.getRates() : null;
  }
  if (!rates) {
    rates = getDefaultRates();
  }

  const conversion = convertMoney({ ...money, rates, baseCurrency }, targetCurrency);
  const rounded = Math.round((conversion.amount + Number.EPSILON) * 100) / 100;
  return { amount: rounded, currency: conversion.currency };
}

export function normalizeAmounts(values: Money[], targetCurrency: CurrencyCode, rates?: CurrencyRates, baseCurrency?: CurrencyCode): Money {
  const effectiveRates = rates ?? getDefaultRates();
  return normalizeMoney(values, targetCurrency, effectiveRates, baseCurrency);
}
