/**
 * Comprehensive Report Generator
 * 
 * Generates a downloadable HTML report with sales analytics data
 * and an interactive Revenue Trend chart using Chart.js.
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
    profit?: Money;
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

function generateHtmlReport(data: ComprehensiveReportData): string {
  const periodStart = formatDateForDisplay(data.period.start);
  const periodEnd = formatDateForDisplay(data.period.end);

  // Generate chart data
  const chartLabels = data.timeseries.map(p => formatDateForDisplay(p.date));
  const revenueData = data.timeseries.map(p => p.revenue);
  const netRevenueData = data.timeseries.map(p => p.netRevenue);
  const refundData = data.timeseries.map(p => p.refunds);

  // Generate top products table rows
  const topProductsRows = data.topProducts.length > 0
    ? data.topProducts.map((p, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${p.name}</td>
          <td>${p.sku || '-'}</td>
          <td>${p.salesCount}</td>
          <td>${formatCurrency(p.revenue)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="5" style="text-align: center;">No product data available</td></tr>';

  // Generate daily data table rows
  const dailyDataRows = data.timeseries.map(d => `
    <tr>
      <td>${formatDateForDisplay(d.date)}</td>
      <td style="text-align: right;">${formatCurrency({ amount: d.revenue, currency: data.currency as Money["currency"] })}</td>
      <td style="text-align: right;">${formatCurrency({ amount: d.refunds, currency: data.currency as Money["currency"] })}</td>
      <td style="text-align: right;">${formatCurrency({ amount: d.netRevenue, currency: data.currency as Money["currency"] })}</td>
      <td style="text-align: right;">${d.transactions}</td>
      <td style="text-align: right;">${formatCurrency({ amount: d.discount, currency: data.currency as Money["currency"] })}</td>
      <td style="text-align: right;">${formatCurrency({ amount: d.tax, currency: data.currency as Money["currency"] })}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sales Analytics Report - ${data.storeName || 'Store'}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      line-height: 1.6;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header {
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: white;
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
    }
    .header h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    .header .period { opacity: 0.9; font-size: 0.9rem; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .summary-card {
      background: white;
      border-radius: 10px;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .summary-card .label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-card .value { font-size: 1.5rem; font-weight: 600; color: #1e293b; margin-top: 0.25rem; }
    .summary-card .value.positive { color: #10b981; }
    .summary-card .value.negative { color: #ef4444; }
    .card {
      background: white;
      border-radius: 10px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 2rem;
    }
    .card h2 { font-size: 1.1rem; margin-bottom: 1rem; color: #334155; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: 600; color: #475569; }
    tr:hover { background: #f8fafc; }
    .chart-container { height: 400px; position: relative; }
    .page-break { page-break-before: always; margin-top: 2rem; padding-top: 2rem; border-top: 2px dashed #e2e8f0; }
    @media print {
      body { background: white; padding: 0; }
      .page-break { page-break-before: always; margin: 0; padding: 0; border: none; }
      .card { box-shadow: none; border: 1px solid #e2e8f0; }
    }
    .generated-at { text-align: center; color: #94a3b8; font-size: 0.75rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>📊 Sales Analytics Report</h1>
      <div class="period">${data.storeName || 'Store'} • ${periodStart} – ${periodEnd}</div>
    </div>

    <!-- Summary Cards -->
    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Total Revenue</div>
        <div class="value">${formatCurrency(data.summary.totalRevenue)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Refunds</div>
        <div class="value negative">${formatCurrency(data.summary.totalRefunds)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Net Revenue</div>
        <div class="value positive">${formatCurrency(data.summary.netRevenue)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Transactions</div>
        <div class="value">${data.summary.transactionCount.toLocaleString()}</div>
      </div>
      <div class="summary-card">
        <div class="label">Avg. Order Value</div>
        <div class="value">${formatCurrency(data.summary.averageOrderValue)}</div>
      </div>
      ${data.summary.profit ? `
      <div class="summary-card">
        <div class="label">Net Profit</div>
        <div class="value ${data.summary.profit.amount >= 0 ? 'positive' : 'negative'}">${formatCurrency(data.summary.profit)}</div>
      </div>
      ` : ''}
      ${data.summary.profitMargin !== undefined ? `
      <div class="summary-card">
        <div class="label">Profit Margin</div>
        <div class="value">${data.summary.profitMargin.toFixed(1)}%</div>
      </div>
      ` : ''}
      ${data.summary.cogs ? `
      <div class="summary-card">
        <div class="label">Cost of Goods Sold</div>
        <div class="value negative">${formatCurrency(data.summary.cogs)}</div>
      </div>
      ` : ''}
    </div>

    <!-- Top Products -->
    <div class="card">
      <h2>🏆 Top Performing Products</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Product</th>
            <th>SKU</th>
            <th>Units Sold</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${topProductsRows}
        </tbody>
      </table>
    </div>

    <!-- Daily Breakdown -->
    <div class="card">
      <h2>📅 Daily Sales Breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th style="text-align: right;">Revenue</th>
            <th style="text-align: right;">Refunds</th>
            <th style="text-align: right;">Net Revenue</th>
            <th style="text-align: right;">Transactions</th>
            <th style="text-align: right;">Discounts</th>
            <th style="text-align: right;">Tax</th>
          </tr>
        </thead>
        <tbody>
          ${dailyDataRows}
        </tbody>
      </table>
    </div>

    <!-- Page 2: Revenue Trend Chart -->
    <div class="page-break"></div>
    
    <div class="header" style="margin-top: 0;">
      <h1>📈 Revenue Trend Analysis</h1>
      <div class="period">${data.storeName || 'Store'} • ${periodStart} – ${periodEnd}</div>
    </div>

    <div class="card">
      <h2>Revenue Over Time</h2>
      <div class="chart-container">
        <canvas id="revenueTrendChart"></canvas>
      </div>
    </div>

    <div class="generated-at">
      Report generated on ${new Date().toLocaleString()} • ChainSync Analytics
    </div>
  </div>

  <script>
    const ctx = document.getElementById('revenueTrendChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(chartLabels)},
        datasets: [
          {
            label: 'Revenue',
            data: ${JSON.stringify(revenueData)},
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'Net Revenue',
            data: ${JSON.stringify(netRevenueData)},
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'Refunds',
            data: ${JSON.stringify(refundData)},
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index',
        },
        plugins: {
          legend: {
            position: 'top',
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: '${data.currency}',
                }).format(context.raw);
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: '${data.currency}',
                  notation: 'compact',
                }).format(value);
              },
            },
          },
        },
      },
    });
  </script>
</body>
</html>`;
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
      const htmlContent = generateHtmlReport(data);

      // Create and trigger download
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      const startDate = effectiveRange.start.toISOString().substring(0, 10);
      const endDate = effectiveRange.end.toISOString().substring(0, 10);
      anchor.download = `sales-report-${startDate}-to-${endDate}.html`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);

      toast({
        title: "Report downloaded",
        description: "Your comprehensive sales report has been downloaded. Open it in a browser to view the interactive chart.",
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
