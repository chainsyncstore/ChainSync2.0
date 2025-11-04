export function formatCurrency(amount: number, currency: 'USD' | 'NGN' = 'USD'): string {
  const locale = currency === 'NGN' ? 'en-NG' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDate(date: Date, format: string = "MMM dd, yyyy"): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  };

  if (format === "MMM dd") {
    options.year = undefined;
  } else if (format === "MMM dd, yyyy") {
    // Use default options
  } else if (format === "yyyy-MM-dd") {
    return date.toISOString().split('T')[0];
  }

  return new Intl.DateTimeFormat('en-US', options).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function generateReceiptNumber(): string {
  return `RCP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

export function calculateTax(subtotal: number, taxRate: number = 0.085): number {
  return subtotal * taxRate;
}

export function isValidBarcode(barcode: string): boolean {
  return /^[0-9a-zA-Z-]+$/.test(barcode) && barcode.length >= 4;
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`;
  }
  return phone;
}
