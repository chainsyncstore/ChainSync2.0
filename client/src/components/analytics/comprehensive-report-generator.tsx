/**
 * Comprehensive Report Generator
 * 
 * Generates a downloadable CSV report with sales analytics data
 * including COGS, Stock Loss, and Profit Breakdown.
 */

import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/pos-utils";
import type { Money } from "@shared/lib/currency";

interface ComprehensiveReportData {
  period: {
    start: string;
    end: string;
  };
  currency: string;
  summary: {
    totalRevenue: Money;
    totalRefunds: Money;
    netRevenue: Money;
    totalDiscount: Money;
    totalTax: Money;
    transactionCount: number;
    refundCount: number;
    averageOrderValue: Money;
    cogs?: Money;
    stockLoss?: Money;
    grossProfit?: Money;
    netProfit?: Money;
    profit?: Money; // Legacy support or alias
    profitMargin?: number;
  };
  timeseries: Array<{
    date: string;
    revenue: number;
    discount: number;
    tax: number;
    transactions: number;
    refunds: number;
    refundCount: number;
    netRevenue: number;
    cogs: number;
    stockLoss: number;
    profit: number; // Net Profit
  }>;
  topProducts: Array<{
    productId: string;
    name: string;
    sku: string | null;
    salesCount: number;
    revenue: Money;
  }>;
  storeName?: string;
}

interface ComprehensiveReportGeneratorProps {
  effectiveRange: { start: Date; end: Date };
  normalizeCurrency?: boolean;
  storeId: string | null;
  currency: string;
}

function formatDateForDisplay(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Helper to escape CSV fields
function esc(val: string | number | undefined): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCsvReport(data: ComprehensiveReportData): string {
  const periodStart = formatDateForDisplay(data.period.start);
  const periodEnd = formatDateForDisplay(data.period.end);
  const rows: string[] = [];
  const currency = data.currency;

  const toMoney = (amount: number): Money => ({
    amount,
    currency: currency as any
  });

  // Title
  rows.push(`Sales Analytics Report - ${data.storeName || 'Store'}`);
  rows.push(`Period: ${periodStart} - ${periodEnd}`);
  rows.push('');

  // Summary
  rows.push('SUMMARY METRICS');
  rows.push(`Total Revenue,${esc(formatCurrency(data.summary.totalRevenue))}`);
  rows.push(`Net Revenue,${esc(formatCurrency(data.summary.netRevenue))}`);
  rows.push(`Refunds,${esc(formatCurrency(data.summary.totalRefunds))}`);
  rows.push(`Transactions,${data.summary.transactionCount}`);
  rows.push(`Avg. Order Value,${esc(formatCurrency(data.summary.averageOrderValue))}`);
  if (data.summary.cogs) rows.push(`COGS,${esc(formatCurrency(data.summary.cogs))}`);
  if (data.summary.stockLoss) rows.push(`Stock Removal Loss,${esc(formatCurrency(data.summary.stockLoss))}`);
  if (data.summary.grossProfit) rows.push(`Gross Profit,${esc(formatCurrency(data.summary.grossProfit))}`);
  // Use netProfit if available, fallback to profit
  const netProfit = data.summary.netProfit || data.summary.profit;
  if (netProfit) rows.push(`Net Profit,${esc(formatCurrency(netProfit))}`);
  if (data.summary.profitMargin !== undefined) rows.push(`Profit Margin,${data.summary.profitMargin.toFixed(1)}%`);
  rows.push('');

  // Top Products
  rows.push('TOP PERFORMING PRODUCTS');
  rows.push('Rank,Product,SKU,Units Sold,Revenue');
  data.topProducts.forEach((p, i) => {
    rows.push(`${i + 1},${esc(p.name)},${esc(p.sku || '-')},${p.salesCount},${esc(formatCurrency(p.revenue))}`);
  });
  if (data.topProducts.length === 0) rows.push('No product data available');
  rows.push('');

  // Daily Breakdown
  rows.push('DAILY SALES BREAKDOWN');
  rows.push('Date,Revenue,Refunds,Net Revenue,COGS,Stock Loss,Gross Profit,Net Profit,Transactions,Tax');

  data.timeseries.forEach(d => {
    const grossProfit = d.netRevenue - (d.cogs || 0);
    rows.push([
      formatDateForDisplay(d.date),
      esc(formatCurrency(toMoney(d.revenue))),
      esc(formatCurrency(toMoney(d.refunds))),
      esc(formatCurrency(toMoney(d.netRevenue))),
      esc(formatCurrency(toMoney(d.cogs || 0))),
      esc(formatCurrency(toMoney(d.stockLoss || 0))),
      esc(formatCurrency(toMoney(grossProfit))),
      esc(formatCurrency(toMoney(d.profit))),
      d.transactions,
      esc(formatCurrency(toMoney(d.tax))),
    ].join(','));
  });

  // TOTAL ROW
  // Assuming summary object holds the total for the period
  const totalGrossProfit = data.summary.grossProfit || { amount: 0, currency: currency as any };
  const totalNetProfit = data.summary.netProfit || data.summary.profit || { amount: 0, currency: currency as any };

  rows.push([
    'TOTAL',
    esc(formatCurrency(data.summary.totalRevenue)),
    esc(formatCurrency(data.summary.totalRefunds)),
    esc(formatCurrency(data.summary.netRevenue)),
    esc(formatCurrency(data.summary.cogs || { amount: 0, currency: currency as any })),
    esc(formatCurrency(data.summary.stockLoss || { amount: 0, currency: currency as any })),
    esc(formatCurrency(totalGrossProfit)),
    esc(formatCurrency(totalNetProfit)),
    data.summary.transactionCount,
    esc(formatCurrency(data.summary.totalTax)),
  ].join(','));

  return rows.join('\n');
}

export default function ComprehensiveReportGenerator({
  effectiveRange,
  normalizeCurrency = false,
  storeId: selectedStoreId,
  currency: resolvedCurrency,
}: ComprehensiveReportGeneratorProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadReport = async () => {
    if (!selectedStoreId) {
      toast({
        title: "No store selected",
        description: "Select a store before generating the report.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const params = new URLSearchParams();
      params.set("store_id", selectedStoreId);
      params.set("date_from", effectiveRange.start.toISOString());
      params.set("date_to", effectiveRange.end.toISOString());
      params.set("interval", "day");
      if (normalizeCurrency) {
        params.set("normalize_currency", "true");
        params.set("target_currency", resolvedCurrency);
      }

      const response = await fetch(`/api/analytics/export-comprehensive?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch report data: ${response.statusText}`);
      }

      const data: ComprehensiveReportData = await response.json();
      const csvContent = generateCsvReport(data);

      // Create and trigger download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      const startDate = effectiveRange.start.toISOString().substring(0, 10);
      const endDate = effectiveRange.end.toISOString().substring(0, 10);
      anchor.download = `sales-report-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);

      toast({
        title: "Report downloaded",
        description: "Your comprehensive sales report (CSV) has been downloaded.",
      });
    } catch (error) {
      console.error("Failed to generate report:", error);
      toast({
        title: "Report generation failed",
        description: "We couldn't generate the report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      variant="default"
      onClick={handleDownloadReport}
      disabled={isGenerating || !selectedStoreId}
      className="gap-2"
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileText className="h-4 w-4" />
      )}
      Download Comprehensive Report
    </Button>
  );
}
