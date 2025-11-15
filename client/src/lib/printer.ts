import type { PrinterProfile } from "@/lib/peripherals";

export interface ReceiptLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  sku?: string | null;
}

export interface ReceiptTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  paymentMethod: string;
}

export interface ReceiptPrintJob {
  receiptNumber: string;
  storeName: string;
  storeAddress?: string;
  cashier?: string;
  timestamp: string;
  items: ReceiptLineItem[];
  totals: ReceiptTotals;
  footerNote?: string;
}

/* eslint-disable no-unused-vars */
type MatchesFn = (profile: PrinterProfile) => boolean;
type PrintFn = (job: ReceiptPrintJob) => Promise<void>;
/* eslint-enable no-unused-vars */

export interface ReceiptPrinterAdapter {
  id: string;
  label: string;
  matches: MatchesFn;
  print: PrintFn;
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function renderReceipt(job: ReceiptPrintJob): string {
  const lines: string[] = [];
  const divider = "--------------------------------";
  lines.push(job.storeName.toUpperCase());
  if (job.storeAddress) lines.push(job.storeAddress);
  if (job.cashier) lines.push(`Cashier: ${job.cashier}`);
  lines.push(`Receipt: ${job.receiptNumber}`);
  lines.push(`Date: ${new Date(job.timestamp).toLocaleString()}`);
  lines.push(divider);
  job.items.forEach((item) => {
    const qtyLine = `${item.name} x${item.quantity}`;
    const totalLine = formatCurrency(item.total, job.totals.currency);
    lines.push(`${qtyLine}`);
    lines.push(`  @ ${formatCurrency(item.unitPrice, job.totals.currency)}  ${totalLine}`);
  });
  lines.push(divider);
  lines.push(`Subtotal: ${formatCurrency(job.totals.subtotal, job.totals.currency)}`);
  if (job.totals.discount > 0) {
    lines.push(`Discount: -${formatCurrency(job.totals.discount, job.totals.currency)}`);
  }
  lines.push(`Tax: ${formatCurrency(job.totals.tax, job.totals.currency)}`);
  lines.push(`TOTAL: ${formatCurrency(job.totals.total, job.totals.currency)}`);
  lines.push(`Paid via ${job.totals.paymentMethod.toUpperCase()}`);
  lines.push(divider);
  lines.push(job.footerNote || "Thank you for shopping with us!");
  return lines.join("\n");
}

const mockAdapter: ReceiptPrinterAdapter = {
  id: "mock-thermal",
  label: "Mock Thermal Printer",
  matches: () => true,
  async print(job) {
    const content = renderReceipt(job);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${job.receiptNumber}.txt`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

const adapters: ReceiptPrinterAdapter[] = [mockAdapter];

export function getPrinterAdapter(profile: PrinterProfile): ReceiptPrinterAdapter {
  return adapters.find((adapter) => adapter.matches(profile)) || mockAdapter;
}
