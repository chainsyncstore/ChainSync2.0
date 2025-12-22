/**
 * Comprehensive Report Generator
 * 
 * Generates a downloadable HTML report with sales analytics data,
 * interactive charts, and detailed financial breakdown.
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
        refundTax?: Money;
        netRevenue: Money;
        totalDiscount: Money;
        totalTax: Money;
        transactionCount: number;
        refundCount: number;
        averageOrderValue: Money;
        cogs: Money;
        refundCogs?: Money;
        netCogs?: Money; // New
        netTax?: Money; // New
        stockLoss?: Money;
        manufacturerRefund?: Money;
        grossStockLoss?: Money;
        grossProfit?: Money;
        netProfit?: Money;
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
        refundTax?: number;
        refundCount: number;
        netRevenue: number;
        cogs: number;
        refundCogs?: number;
        netCogs?: number; // New
        netTax?: number; // New
        stockLoss: number;
        manufacturerRefund: number;
        grossStockLoss: number;
        profit: number;
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
    const currency = data.currency;

    const toMoney = (amount: number): Money => ({ amount, currency: currency as any });

    // Summary Cards Data
    const summaryItems = [
        { label: 'Total Revenue', value: formatCurrency(data.summary.totalRevenue) },
        { label: 'Net Revenue', value: formatCurrency(data.summary.netRevenue) },
        { label: 'Gross Profit', value: formatCurrency(data.summary.grossProfit || toMoney(0)) },
        { label: 'Net Profit', value: formatCurrency(data.summary.netProfit || data.summary.profit || toMoney(0)), highlight: true },
        { label: 'COGS', value: formatCurrency(data.summary.cogs || toMoney(0)) },
        { label: 'Transactions', value: data.summary.transactionCount },
        { label: 'Avg Order Value', value: formatCurrency(data.summary.averageOrderValue) },
        { label: 'Refunds (Net)', value: formatCurrency(data.summary.totalRefunds) },
        { label: 'Tax Refunded', value: formatCurrency(data.summary.refundTax || toMoney(0)) },
        { label: 'Cost of Returns', value: formatCurrency(data.summary.refundCogs || toMoney(0)), className: 'text-green-600' },
    ];

    // Prepare Chart Data
    const chartLabels = data.timeseries.map(d => formatDateForDisplay(d.date));
    const revenueData = data.timeseries.map(d => d.revenue);
    const netRevenueData = data.timeseries.map(d => d.netRevenue);
    const profitData = data.timeseries.map(d => d.profit);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sales Report - ${data.storeName}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --primary: #2563eb;
            --text-main: #1f2937;
            --text-muted: #6b7280;
            --bg-card: #ffffff;
            --border: #e5e7eb;
        }
        * {
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.5;
            color: var(--text-main);
            background-color: #f3f4f6;
            margin: 0;
            padding: 2rem;
            -webkit-print-color-adjust: exact;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            margin-bottom: 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 {
            margin: 0;
            font-size: 1.875rem;
            font-weight: 700;
        }
        .header p {
            color: var(--text-muted);
            margin: 0.25rem 0 0;
        }
        .card {
            background: var(--bg-card);
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            border: 1px solid var(--border);
            width: 100%;
            /* Removed overflow: hidden to allow child scrollbars to render naturally */
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        /* ... existing styles ... */
        .table-wrapper {
            width: 100%;
            max-width: 100%; /* Ensure it respects parent padding */
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            padding-bottom: 12px; /* Increased space for scrollbar */
            margin-bottom: 1rem;
            border: 1px solid var(--border);
            border-radius: 0.375rem;
            
            /* Firefox Scrollbar Support */
            scrollbar-width: thin;
            scrollbar-color: #6b7280 #f3f4f6;
        }
        .table-wrapper::-webkit-scrollbar {
            height: 12px;
        }
        .table-wrapper::-webkit-scrollbar-track {
            background: #f3f4f6;
            border-radius: 6px;
        }
        .table-wrapper::-webkit-scrollbar-thumb {
            background: #6b7280;
            border-radius: 6px;
            border: 2px solid #f3f4f6;
        }
        table {
            width: max-content; /* Force table to take necessary space */
            min-width: 100%;    /* But at least full width */
            border-collapse: collapse;
            font-size: 0.8rem;
        }
        th, td {
            padding: 0.6rem 0.8rem;
            border-bottom: 1px solid var(--border);
            white-space: nowrap;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div>
                <h1>Sales Comprehensive Report</h1>
                <p>${data.storeName || 'Store Report'}</p>
            </div>
            <div class="text-right">
                <p><strong>Period:</strong> ${periodStart} - ${periodEnd}</p>
                <p>Generated on ${new Date().toLocaleDateString()}</p>
            </div>
        </div>

        <!-- Summary Metrics -->
         <h2 class="section-title">Financial Summary</h2>
        <div class="summary-grid">
            ${summaryItems.map(item => `
                <div class="stat-card">
                    <div class="stat-label">${item.label}</div>
                    <div class="stat-value ${item.highlight ? 'highlight' : ''}">${item.value}</div>
                </div>
            `).join('')}
        </div>
        
        <div class="summary-grid">
             <div class="stat-card loss-section">
                <div class="stat-label">Stock Loss (Net)</div>
                <div class="stat-value">${formatCurrency(data.summary.stockLoss || toMoney(0))}</div>
            </div>
             <div class="stat-card refresh-section">
                <div class="stat-label">Manufacturer Refunds</div>
                <div class="stat-value">${formatCurrency(data.summary.manufacturerRefund || toMoney(0))}</div>
            </div>
             <div class="stat-card">
                <div class="stat-label">Gross Stock Loss</div>
                <div class="stat-value">${formatCurrency(data.summary.grossStockLoss || toMoney(0))}</div>
            </div>
        </div>

        <!-- Chart -->
        <div class="card">
            <h2 class="section-title">Revenue Trend</h2>
            <div style="height: 400px; width: 100%;">
                <canvas id="revenueChart"></canvas>
            </div>
        </div>

        <!-- Tables breakdown -->
        <div class="page-break"></div>
        <div class="card">
            <h2 class="section-title">Daily Sales Breakdown</h2>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th class="text-right">Revenue</th>
                            <th class="text-right">Tax Collected</th>
                            <th class="text-right" style="color:#ef4444">Tax Refunded</th>
                            <th class="text-right">Net Tax</th>
                            <th class="text-right">Refunds<br><span style="font-size:0.7em;font-weight:400">(Net)</span></th>
                            <th class="text-right">Net Rev</th>
                            <th class="text-right">COGS<br><span style="font-size:0.7em;font-weight:400">(Gross)</span></th>
                            <th class="text-right" style="color:#16a34a">Cost of Returns</th>
                            <th class="text-right">COGS<br><span style="font-size:0.7em;font-weight:400">(Net)</span></th>
                            <th class="text-right">Stock Loss<br><span style="font-size:0.7em;font-weight:400">(Gross)</span></th>
                            <th class="text-right">Mfr Refund<br><span style="font-size:0.7em;font-weight:400">(Recovery)</span></th>
                            <th class="text-right">Stock Loss<br><span style="font-size:0.7em;font-weight:400">(Net)</span></th>
                            <th class="text-right">Net Profit</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.timeseries.map(d => `
                        <tr>
                            <td>${formatDateForDisplay(d.date)}</td>
                            <td class="text-right">${formatCurrency(toMoney(d.revenue))}</td>
                            <td class="text-right" style="color: #6b7280">${formatCurrency(toMoney(d.tax))}</td>
                            <td class="text-right" style="color: #ef4444">${d.refundTax ? '-' + formatCurrency(toMoney(d.refundTax)) : '-'}</td>
                            <td class="text-right">${formatCurrency(toMoney(d.netTax || (d.tax - (d.refundTax || 0))))}</td>
                            <td class="text-right" style="color: #ef4444">${d.refunds > 0 ? '-' : ''}${formatCurrency(toMoney(d.refunds))}</td>
                            <td class="text-right">${formatCurrency(toMoney(d.netRevenue))}</td>
                            <td class="text-right">${formatCurrency(toMoney(d.cogs))}</td>
                            <td class="text-right" style="color:#16a34a">${formatCurrency(toMoney(d.refundCogs || 0))}</td>
                            <td class="text-right">${formatCurrency(toMoney(d.netCogs || (d.cogs - (d.refundCogs || 0))))}</td>
                            <td class="text-right">${formatCurrency(toMoney(d.grossStockLoss))}</td>
                            <td class="text-right" style="color:green">(${formatCurrency(toMoney(d.manufacturerRefund))})</td>
                            <td class="text-right" style="color:red">${formatCurrency(toMoney(d.stockLoss))}</td>
                            <td class="text-right"><strong>${formatCurrency(toMoney(d.profit))}</strong></td>
                        </tr>
                        `).join('')}
                            <tr style="background-color: #f3f4f6; font-weight: bold;">
                                <td>TOTAL</td>
                                <td class="text-right">${formatCurrency(data.summary.totalRevenue)}</td>
                                <td class="text-right">${formatCurrency(data.summary.totalTax)}</td>
                                <td class="text-right" style="color: #ef4444">(${formatCurrency(data.summary.refundTax || toMoney(0))})</td>
                                <td class="text-right">${formatCurrency(data.summary.netTax || toMoney((data.summary.totalTax.amount - (data.summary.refundTax?.amount || 0))))}</td>
                                <td class="text-right" style="color: #ef4444">${formatCurrency(data.summary.totalRefunds)}</td>
                                <td class="text-right">${formatCurrency(data.summary.netRevenue)}</td>
                                <td class="text-right">${formatCurrency(data.summary.cogs || toMoney(0))}</td>
                                <td class="text-right" style="color:#16a34a">${formatCurrency(data.summary.refundCogs || toMoney(0))}</td>
                                <td class="text-right">${formatCurrency(data.summary.netCogs || toMoney((data.summary.cogs?.amount || 0) - (data.summary.refundCogs?.amount || 0)))}</td>
                                <td class="text-right">${formatCurrency(data.summary.grossStockLoss || toMoney(0))}</td>
                                <td class="text-right" style="color:green">(${formatCurrency(data.summary.manufacturerRefund || toMoney(0))})</td>
                                <td class="text-right" style="color:red">${formatCurrency(data.summary.stockLoss || toMoney(0))}</td>
                                <td class="text-right">${formatCurrency(data.summary.netProfit || data.summary.profit || toMoney(0))}</td>
                            </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="card">
            <h2 class="section-title">Top Performing Products</h2>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Product</th>
                            <th>SKU</th>
                            <th class="text-right">Units Sold</th>
                            <th class="text-right">Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.topProducts.length ? data.topProducts.map((p, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${p.name}</td>
                            <td>${p.sku || '-'}</td>
                            <td class="text-right">${p.salesCount}</td>
                            <td class="text-right">${formatCurrency(p.revenue)}</td>
                        </tr>
                        `).join('') : '<tr><td colspan="5" class="text-center">No product data available</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        const ctx = document.getElementById('revenueChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(chartLabels)},
                datasets: [
                    {
                        label: 'Gross Revenue',
                        data: ${JSON.stringify(revenueData)},
                        borderColor: '#9ca3af',
                        tension: 0.3,
                        borderDash: [5, 5],
                        hidden: true
                    },
                    {
                        label: 'Net Revenue',
                        data: ${JSON.stringify(netRevenueData)},
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'Net Profit',
                        data: ${JSON.stringify(profitData)},
                        borderColor: '#10b981',
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return new Intl.NumberFormat('en-US', { style: 'currency', currency: '${currency}' }).format(value);
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('en-US', { style: 'currency', currency: '${currency}' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>
    `;
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
                description: "Your comprehensive sales report (HTML) has been downloaded.",
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
