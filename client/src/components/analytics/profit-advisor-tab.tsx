/**
 * Profit Advisor Tab - AI-powered insights for profit maximization
 * 
 * Displays:
 * - Product profitability rankings
 * - Restocking priority recommendations
 * - Problem product alerts (expired, damaged patterns)
 * - Stock level recommendations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Bot,
    CheckCircle2,
    Package,
    RefreshCw,
    ShoppingCart,
    Sparkles,
    TrendingDown,
    TrendingUp,
    X,
} from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/csrf";
import { cn } from "@/lib/utils";

// Types
interface AiInsight {
    id: string;
    storeId: string;
    insightType: string;
    productId: string | null;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
    data: Record<string, unknown>;
    isActionable: boolean;
    isDismissed: boolean;
    generatedAt: string;
}

interface ProductProfitability {
    productId: string;
    productName: string;
    unitsSold: number;
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    profitMargin: number;
    avgProfitPerUnit: number;
    currentStock: number;
    saleVelocity: number;
    daysToStockout: number | null;
    trend: 'increasing' | 'decreasing' | 'stable';
    refundedAmount?: number;
    stockLossAmount?: number;
}

interface RestockingPriority {
    productId: string;
    productName: string;
    currentStock: number;
    daysToStockout: number | null;
    profitMargin: number;
    saleVelocity: number;
    priorityScore: number;
    recommendation: string;
    minStockLevel: number;
}

interface InsightsResponse {
    success: boolean;
    storeId: string;
    insights: AiInsight[];
    grouped: {
        topProfitable: AiInsight[];
        lossMaking: AiInsight[];
        removalPatterns: AiInsight[];
        restockingPriority: AiInsight[];
        stockRecommendations: AiInsight[];
    };
    summary: {
        total: number;
        critical: number;
        warning: number;
        info: number;
        actionable: number;
    };
    generatedAt: string | null;
}

interface ProfitabilityResponse {
    success: boolean;
    storeId: string;
    products: ProductProfitability[];
    count: number;
}

interface RestockingResponse {
    success: boolean;
    storeId: string;
    priorities: RestockingPriority[];
    count: number;
}

// Helper functions
function formatCurrency(value: number, currency = 'NGN'): string {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        return `${currency} ${value.toLocaleString()}`;
    }
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

function getSeverityColor(severity: string): string {
    switch (severity) {
        case 'critical': return 'text-red-600 bg-red-50 border-red-200';
        case 'warning': return 'text-amber-600 bg-amber-50 border-amber-200';
        default: return 'text-blue-600 bg-blue-50 border-blue-200';
    }
}

function getTrendIcon(trend: string) {
    switch (trend) {
        case 'increasing': return <TrendingUp className="h-4 w-4 text-emerald-500" />;
        case 'decreasing': return <TrendingDown className="h-4 w-4 text-red-500" />;
        default: return <ArrowRight className="h-4 w-4 text-slate-400" />;
    }
}

// Components
interface ProfitAdvisorTabProps {
    storeId: string | null;
    currency?: string;
}

export function ProfitAdvisorTab({ storeId, currency = 'NGN' }: ProfitAdvisorTabProps) {
    const [productSearch, setProductSearch] = useState('');
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch insights
    const insightsQuery = useQuery<InsightsResponse>({
        queryKey: ['/api/ai/insights', storeId],
        enabled: Boolean(storeId),
        queryFn: async () => {
            const res = await fetch(`/api/ai/insights/${storeId}`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch insights');
            return res.json();
        },
        refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    });

    // Fetch profitability data
    const profitabilityQuery = useQuery<ProfitabilityResponse>({
        queryKey: ['/api/ai/insights', storeId, 'profitability'],
        enabled: Boolean(storeId),
        queryFn: async () => {
            const res = await fetch(`/api/ai/insights/${storeId}/profitability?limit=50`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch profitability');
            return res.json();
        },
    });

    // Fetch restocking priority
    const restockingQuery = useQuery<RestockingResponse>({
        queryKey: ['/api/ai/insights', storeId, 'restocking-priority'],
        enabled: Boolean(storeId),
        queryFn: async () => {
            const res = await fetch(`/api/ai/insights/${storeId}/restocking-priority?limit=20`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch restocking priority');
            return res.json();
        },
    });

    // Generate insights mutation
    const generateMutation = useMutation({
        mutationFn: async () => {
            const csrfToken = await getCsrfToken();
            const res = await fetch('/api/ai/insights/generate', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ storeId }),
            });
            if (!res.ok) throw new Error('Failed to generate insights');
            return res.json();
        },
        onSuccess: () => {
            toast({
                title: 'Insights Generated',
                description: 'AI insights have been refreshed.',
            });
            void queryClient.invalidateQueries({ queryKey: ['/api/ai/insights', storeId] });
        },
        onError: () => {
            toast({
                title: 'Error',
                description: 'Failed to generate insights. Please try again.',
                variant: 'destructive',
            });
        },
    });

    // Dismiss insight mutation
    const dismissMutation = useMutation({
        mutationFn: async (insightId: string) => {
            const csrfToken = await getCsrfToken();
            const res = await fetch(`/api/ai/insights/${insightId}/dismiss`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
            });
            if (!res.ok) throw new Error('Failed to dismiss insight');
            return res.json();
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['/api/ai/insights', storeId] });
        },
    });

    // Filter products by search
    const filteredProducts = profitabilityQuery.data?.products.filter(p =>
        p.productName.toLowerCase().includes(productSearch.toLowerCase())
    ) || [];

    if (!storeId) {
        return (
            <Card className="py-12 text-center">
                <p className="text-muted-foreground">Select a store to view AI insights</p>
            </Card>
        );
    }

    const isLoading = insightsQuery.isLoading || profitabilityQuery.isLoading || restockingQuery.isLoading;
    const insights = insightsQuery.data;
    const profitability = profitabilityQuery.data;
    const restocking = restockingQuery.data;

    // Top profitable from profitability data
    const topProfitable = [...(profitability?.products || [])]
        .filter(p => p.totalProfit > 0)
        .sort((a, b) => b.totalProfit - a.totalProfit)
        .slice(0, 5);

    // Loss makers from profitability data
    const lossMakers = [...(profitability?.products || [])]
        .filter(p => p.totalProfit < 0)
        .sort((a, b) => a.totalProfit - b.totalProfit)
        .slice(0, 5);

    return (
        <div className="space-y-6">
            {/* Header with refresh button */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-purple-600" />
                    <h2 className="text-lg font-semibold">AI Profit Advisor</h2>
                    {insights?.generatedAt && (
                        <span className="text-xs text-muted-foreground">
                            Last updated: {new Date(insights.generatedAt).toLocaleString()}
                        </span>
                    )}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending}
                >
                    <RefreshCw className={cn("h-4 w-4 mr-2", generateMutation.isPending && "animate-spin")} />
                    {generateMutation.isPending ? 'Generating...' : 'Refresh Insights'}
                </Button>
            </div>

            {/* Summary Cards */}
            {insights?.summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                        <CardContent className="pt-4">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-purple-500" />
                                <span className="text-sm font-medium">Total Insights</span>
                            </div>
                            <p className="text-2xl font-bold mt-1">{insights.summary.total}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                                <span className="text-sm font-medium">Critical</span>
                            </div>
                            <p className="text-2xl font-bold mt-1 text-red-600">{insights.summary.critical}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                                <span className="text-sm font-medium">Warnings</span>
                            </div>
                            <p className="text-2xl font-bold mt-1 text-amber-600">{insights.summary.warning}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                <span className="text-sm font-medium">Actionable</span>
                            </div>
                            <p className="text-2xl font-bold mt-1 text-emerald-600">{insights.summary.actionable}</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Loading State */}
            {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[1, 2, 3, 4].map(i => (
                        <Card key={i}>
                            <CardHeader>
                                <Skeleton className="h-5 w-32" />
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-4 w-1/2" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {!isLoading && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Profitable Products */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="h-5 w-5 text-emerald-500" />
                                Top Profitable Products
                            </CardTitle>
                            <CardDescription>Highest profit generators (90 days)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {topProfitable.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4">No profitability data available yet. Click &quot;Refresh Insights&quot; to generate.</p>
                            ) : (
                                <div className="space-y-3">
                                    {topProfitable.map((p, i) => (
                                        <div key={p.productId} className="flex items-center justify-between py-2 border-b last:border-0">
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg font-bold text-muted-foreground w-6">#{i + 1}</span>
                                                <div>
                                                    <p className="font-medium">{p.productName}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {p.unitsSold} units sold • {formatPercent(p.profitMargin)} margin
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right flex items-center gap-2">
                                                {getTrendIcon(p.trend)}
                                                <div>
                                                    <p className="font-semibold text-emerald-600">
                                                        {formatCurrency(p.totalProfit, currency)}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">profit</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Loss Making Products */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingDown className="h-5 w-5 text-red-500" />
                                Products Causing Losses
                            </CardTitle>
                            <CardDescription>Review pricing or discontinue</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {lossMakers.length === 0 ? (
                                <div className="flex items-center gap-2 py-4 text-emerald-600">
                                    <CheckCircle2 className="h-5 w-5" />
                                    <p className="text-sm">No loss-making products detected!</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {lossMakers.map((p) => (
                                        <div key={p.productId} className="flex items-center justify-between py-2 border-b last:border-0">
                                            <div className="flex items-center gap-3">
                                                <AlertTriangle className="h-4 w-4 text-red-500" />
                                                <div>
                                                    <p className="font-medium">{p.productName}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {p.unitsSold} units • Cost exceeds revenue
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold text-red-600">
                                                    {formatCurrency(p.totalProfit, currency)}
                                                </p>
                                                <p className="text-xs text-muted-foreground">loss</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Restocking Priority */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Package className="h-5 w-5 text-blue-500" />
                                Restocking Priority
                            </CardTitle>
                            <CardDescription>Ranked by profit potential & urgency</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!restocking?.priorities.length ? (
                                <p className="text-sm text-muted-foreground py-4">No restocking data available.</p>
                            ) : (
                                <div className="space-y-3">
                                    {restocking.priorities.slice(0, 8).map((p, i) => (
                                        <div key={p.productId} className="py-2 border-b last:border-0">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                                                    <div>
                                                        <p className="font-medium text-sm">{p.productName}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Stock: {p.currentStock} • {p.daysToStockout !== null ? `${p.daysToStockout}d to stockout` : 'No sales velocity'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Badge variant={p.priorityScore >= 70 ? 'destructive' : p.priorityScore >= 50 ? 'secondary' : 'outline'}>
                                                    Score: {p.priorityScore.toFixed(0)}
                                                </Badge>
                                            </div>
                                            <div className="mt-1">
                                                <Progress value={p.priorityScore} className="h-1.5" />
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">{p.recommendation}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Problem Product Alerts */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                                Problem Products
                            </CardTitle>
                            <CardDescription>Repeat expiration, damage, or defects</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!insights?.grouped.removalPatterns.length ? (
                                <div className="flex items-center gap-2 py-4 text-emerald-600">
                                    <CheckCircle2 className="h-5 w-5" />
                                    <p className="text-sm">No recurring issues detected!</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {insights.grouped.removalPatterns.slice(0, 5).map((insight) => (
                                        <Alert key={insight.id} className={cn("relative", getSeverityColor(insight.severity))}>
                                            <AlertTitle className="pr-8">{insight.title}</AlertTitle>
                                            <AlertDescription className="text-sm">
                                                {insight.description}
                                            </AlertDescription>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="absolute top-2 right-2 h-6 w-6"
                                                onClick={() => dismissMutation.mutate(insight.id)}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </Alert>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Product Profitability Search */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-purple-500" />
                        Product Profitability Lookup
                    </CardTitle>
                    <CardDescription>Search for any product to see its profit data</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4">
                        <Input
                            placeholder="Search products..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            className="max-w-sm"
                        />
                    </div>
                    {productSearch && filteredProducts.length > 0 && (
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium">Product</th>
                                        <th className="px-4 py-2 text-right font-medium">Units Sold</th>
                                        <th className="px-4 py-2 text-right font-medium">Revenue</th>
                                        <th className="px-4 py-2 text-right font-medium">Refunds</th>
                                        <th className="px-4 py-2 text-right font-medium">Cost</th>
                                        <th className="px-4 py-2 text-right font-medium">Stock Loss</th>
                                        <th className="px-4 py-2 text-right font-medium">Profit</th>
                                        <th className="px-4 py-2 text-right font-medium">Margin</th>
                                        <th className="px-4 py-2 text-right font-medium">Trend</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProducts.slice(0, 10).map(p => (
                                        <tr key={p.productId} className="border-t">
                                            <td className="px-4 py-2 font-medium">{p.productName}</td>
                                            <td className="px-4 py-2 text-right">{p.unitsSold}</td>
                                            <td className="px-4 py-2 text-right">{formatCurrency(p.totalRevenue, currency)}</td>
                                            <td className="px-4 py-2 text-right text-amber-600">{formatCurrency(p.refundedAmount ?? 0, currency)}</td>
                                            <td className="px-4 py-2 text-right">{formatCurrency(p.totalCost, currency)}</td>
                                            <td className="px-4 py-2 text-right text-red-600">{formatCurrency(p.stockLossAmount ?? 0, currency)}</td>
                                            <td className={cn("px-4 py-2 text-right font-medium", p.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                                                {formatCurrency(p.totalProfit, currency)}
                                            </td>
                                            <td className="px-4 py-2 text-right">{formatPercent(p.profitMargin)}</td>
                                            <td className="px-4 py-2 text-right">
                                                <div className="flex justify-end">{getTrendIcon(p.trend)}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {productSearch && filteredProducts.length === 0 && (
                        <p className="text-sm text-muted-foreground">No products found matching &quot;{productSearch}&quot;</p>
                    )}
                </CardContent>
            </Card>

            {/* Stock Level Recommendations */}
            {insights?.grouped.stockRecommendations && insights.grouped.stockRecommendations.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShoppingCart className="h-5 w-5 text-indigo-500" />
                            Stock Level Recommendations
                        </CardTitle>
                        <CardDescription>AI-suggested min/max adjustments based on sales patterns</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {insights.grouped.stockRecommendations.slice(0, 5).map((insight) => {
                                const data = insight.data as any;
                                return (
                                    <Alert key={insight.id} className="relative">
                                        <AlertTitle>{insight.title}</AlertTitle>
                                        <AlertDescription className="text-sm">
                                            {insight.description}
                                            {data?.current && data?.recommended && (
                                                <div className="mt-2 flex items-center gap-4 text-xs">
                                                    <span>Current: Min {data.current.min}, Max {data.current.max}</span>
                                                    <ArrowRight className="h-4 w-4" />
                                                    <span className="font-medium">Recommended: Min {data.recommended.min}, Max {data.recommended.max}</span>
                                                </div>
                                            )}
                                        </AlertDescription>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute top-2 right-2 h-6 w-6"
                                            onClick={() => dismissMutation.mutate(insight.id)}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </Alert>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

export default ProfitAdvisorTab;
