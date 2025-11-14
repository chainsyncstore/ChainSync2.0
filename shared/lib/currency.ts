const SUPPORTED_CURRENCIES = ["NGN", "USD"] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export interface MoneyFormatOptions extends Intl.NumberFormatOptions {
  locale?: string;
}

export type CurrencyRates = Record<CurrencyCode, Record<CurrencyCode, number>>;

export interface ConversionInput extends Money {
  rates?: CurrencyRates;
  baseCurrency?: CurrencyCode;
}

export interface ConversionResult extends Money {
  input: Money;
  usedRate?: number;
}

function ensureCurrency(currency: string): asserts currency is CurrencyCode {
  if (!SUPPORTED_CURRENCIES.includes(currency as CurrencyCode)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
}

export function formatMoney(money: Money, options: MoneyFormatOptions = {}): string {
  ensureCurrency(money.currency);
  const { locale = "en-US", ...intlOptions } = options;
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
    ...intlOptions,
  });
  return formatter.format(money.amount);
}

export function convertMoney(input: ConversionInput, targetCurrency: CurrencyCode): ConversionResult {
  ensureCurrency(input.currency);
  ensureCurrency(targetCurrency);

  if (input.currency === targetCurrency) {
    return { input, amount: input.amount, currency: targetCurrency };
  }

  const rates = input.rates;
  if (!rates) {
    return {
      input,
      amount: input.amount,
      currency: input.currency,
    };
  }

  const directRate = rates[input.currency]?.[targetCurrency];
  if (typeof directRate === "number") {
    return {
      input,
      amount: input.amount * directRate,
      currency: targetCurrency,
      usedRate: directRate,
    };
  }

  const base = input.baseCurrency;
  if (base) {
    ensureCurrency(base);
    const toBase = rates[input.currency]?.[base];
    const fromBase = rates[base]?.[targetCurrency];
    if (typeof toBase === "number" && typeof fromBase === "number") {
      const computedRate = toBase * fromBase;
      return {
        input,
        amount: input.amount * computedRate,
        currency: targetCurrency,
        usedRate: computedRate,
      };
    }
  }

  return {
    input,
    amount: input.amount,
    currency: input.currency,
  };
}

export function normalizeMoney(values: Money[], targetCurrency: CurrencyCode, rates?: CurrencyRates, baseCurrency?: CurrencyCode): Money {
  const total = values.reduce((sum, money) => {
    const conversion = convertMoney({ ...money, rates, baseCurrency }, targetCurrency);
    return sum + (conversion.currency === targetCurrency ? conversion.amount : 0);
  }, 0);

  return { amount: total, currency: targetCurrency };
}

export function getSupportedCurrencies(): CurrencyCode[] {
  return [...SUPPORTED_CURRENCIES];
}
