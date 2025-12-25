/**
 * Analytics Dashboard v2 - Complete rebuild with prescribed metrics
 * 
 * Tabs:
 * - Overview: KPI cards for revenue, refunds, profit, inventory, customers
 * - Sales: Revenue metrics, chart, export
 * - Inventory & Alerts: SKUs, value, aging, low stock, out of stock
 * - Customers: Retention, engagement, segments
 * - Staff Performance: Leaderboard, operational insights
 * - Price Analysis: Product-specific price vs cost trends
 */

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Calendar as CalendarIcon,
  DollarSign,
  Package,
  Receipt,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Users,
  UserCheck,
  Award,
  Activity,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import ComprehensiveReportGenerator from "@/components/analytics/comprehensive-report-generator";
import { ProfitAdvisorTab } from "@/components/analytics/profit-advisor-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { CurrencyCode, Money } from "@shared/lib/currency";

// ============================================================================
// Types
// ============================================================================

interface DateRange {
  start: Date | null;
  end: Date | null;
}

type DatePreset = "7" | "30" | "90" | "365" | "custom";

interface Store {
  id: string;
  name: string;
  currency?: string;
}

interface OverviewData {
  period: { start: string; end: string };
  currency: CurrencyCode;
  revenue: { gross: Money; net: Money; transactionCount: number; delta: number | null };
  taxCollected: Money;
  refunds: { amount: Money; count: number; isNative: boolean };
  profit: { netProfit: Money; marginPercent: number; delta: number | null };
  inventory: { value: Money; itemCount: number };
  customers: { active: number; newThisPeriod: number; delta: number | null };
}

interface SalesData {
  period: { start: string; end: string };
  currency: CurrencyCode;
  totalRevenue: { value: Money; delta: number | null };
  netRevenue: { value: Money; delta: number | null };
  transactions: { value: number; delta: number | null };
  customers: { value: number; delta: number | null };
  avgOrder: { value: Money; delta: number | null };
  refunds: { value: Money; count: number; delta: number | null };
}

interface TimeseriesPoint {
  date: string;
  totalRevenue: Money;
  netRevenue: Money;
  transactions: number;
}

interface TimeseriesData {
  period: { start: string; end: string };
  interval: string;
  currency: CurrencyCode;
  points: TimeseriesPoint[];
}

interface PopularProduct {
  productId: string;
  name: string;
  sku: string | null;
  unitsSold: number;
  revenue: Money;
  sharePercent: number;
}

interface PopularProductsData {
  period: { start: string; end: string };
  currency: CurrencyCode;
  totalRevenue: Money;
  items: PopularProduct[];
}

interface ProfitLossData {
  period: { start: string; end: string };
  currency: CurrencyCode;
  revenue: Money;
  taxCollected: Money;
  refunds: Money;
  netRevenue: Money;
  cogs: Money;
  stockRemovalLoss: Money;
  promotionLoss: Money;
  netProfit: Money;
  marginPercent: number;
}

interface InventoryData {
  currency: CurrencyCode;
  totalSKUs: number;
  inventoryValue: Money;
  lowStockCount: number;
  outOfStockCount: number;
  aging: Array<{ bucket: string; skuCount: number; value: Money }>;
  oldestInventory: Array<{
    productId: string;
    name: string;
    quantity: number;
    value: Money;
    daysSinceRestock: number | null;
  }>;
  watchlist: {
    lowStock: Array<{
      productId: string;
      name: string;
      quantity: number;
      minLevel: number;
      percentToTarget: number;
    }>;
    outOfStock: Array<{
      productId: string;
      name: string;
      lastRestocked: string | null;
    }>;
  };
}

interface CustomersData {
  period: { start: string; end: string };
  currency: CurrencyCode;
  totalCustomers: { value: number; delta: number | null };
  newThisPeriod: { value: number; percent: number };
  loyalCustomers: { value: number; percent: number };
  retentionRate: { value: number; delta: number | null };
  segments: { new: number; repeat: number; newPercent: number; repeatPercent: number };
  engagement: {
    transactionsPerCustomer: number;
    avgOrderValue: Money;
    customerGrowth: number;
    churnRisk: number;
  };
}

interface StaffMember {
  rank: number;
  userId: string;
  name: string;
  role: string;
  revenue: Money;
  tickets: number;
  avgTicket: Money;
}

interface PriceTrendProduct {
  productId: string;
  name: string;
  sku: string | null;
  currentPrice: Money;
  currentCost: Money;
  eventCount: number;
}

interface PriceTrendsListData {
  period: { start: string; end: string };
  currency: CurrencyCode;
  items: PriceTrendProduct[];
}

interface PriceTrendTimelinePoint {
  date: string;
  salePrice: number | null;
  costPrice: number | null;
  eventType: 'price_change' | 'revaluation';
}

interface PriceTrendEvent {
  type: string;
  occurredAt: string;
  oldSalePrice?: number | null;
  newSalePrice?: number | null;
  oldCost?: number | null;
  newCost?: number | null;
  adjustmentAmount?: number | null;
  source?: string | null;
}

interface PriceTrendDetailData {
  period: { start: string; end: string };
  currency: CurrencyCode;
  product: {
    id: string;
    name: string;
    sku: string | null;
    currentSalePrice: Money;
    currentCostPrice: Money;
  };
  summary: {
    priceChangeCount: number;
    cogs: Money;
  };
  currentSnapshot: {
    quantity: number;
    avgCost: Money;
    totalValue: Money;
  };
  timeline: PriceTrendTimelinePoint[];
  recentEvents: PriceTrendEvent[];
}

interface StaffData {
  period: { start: string; end: string };
  currency: CurrencyCode;
  staffOnShift: number;
  topPerformer: StaffMember | null;
  leaderboard: StaffMember[];
  storeContribution: Array<{
    storeId: string;
    storeName: string;
    revenue: Money;
    tickets: number;
    staffCount: number;
  }>;
  operationalInsights: {
    avgTicketsPerStaff: number;
    revenuePerStaff: Money;
    activeStaffCount: number;
    totalTransactions: number;
    totalRevenue: Money;
  };
}

// ============================================================================
// Helpers
// ============================================================================

function formatMoney(money: Money | undefined | null): string {
  if (!money) return "—";
  const { amount, currency } = money;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function formatDelta(delta: number | null | undefined): { label: string; positive?: boolean; negative?: boolean } | null {
  if (delta === null || delta === undefined) return null;
  const label = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs prior`;
  return { label, positive: delta > 0, negative: delta < 0 };
}

function getPresetRange(preset: DatePreset): DateRange {
  if (preset === "custom") return { start: null, end: null };
  const end = new Date();
  const start = new Date();
  const days = parseInt(preset);
  start.setDate(start.getDate() - days);
  return { start, end };
}

// ============================================================================
// KPI Card Component
// ============================================================================

interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
  badge?: string;
  delta?: { label: string; positive?: boolean; negative?: boolean } | null;
  className?: string;
}

function KpiCard({ title, value, icon, subtitle, badge, delta, className }: KpiCardProps) {
  return (
    <Card className={cn("flex h-full flex-col border border-slate-200 bg-white/95 shadow-sm", className)}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="rounded-full bg-slate-100 p-2">{icon}</div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="space-y-1">
          <p className="text-3xl font-semibold leading-tight tracking-tight break-words">{value}</p>
          {badge && (
            <Badge variant="secondary" className="text-xs">
              {badge}
            </Badge>
          )}
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {delta && (
          <div
            className={cn(
              "mt-auto flex items-center justify-end gap-1 text-xs font-medium",
              delta.positive && "text-emerald-600",
              delta.negative && "text-red-600",
              !delta.positive && !delta.negative && "text-muted-foreground"
            )}
          >
            {delta.positive && <TrendingUp className="h-3 w-3" />}
            {delta.negative && <TrendingDown className="h-3 w-3" />}
            <span>{delta.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Scope Controls Component
// ============================================================================

/* eslint-disable no-unused-vars */
interface ScopeControlsProps {
  stores: Store[];
  isLoadingStores: boolean;
  selectedStoreId: string | null;
  onStoreChange: (storeId: string) => void;
  datePreset: DatePreset;
  onPresetChange: (newPreset: DatePreset) => void;
  dateRange: DateRange;
  onDateRangeChange: (newRange: DateRange) => void;
  storeSelectionLocked?: boolean;
}
/* eslint-enable no-unused-vars */

function ScopeControls({
  stores,
  isLoadingStores,
  selectedStoreId,
  onStoreChange,
  datePreset,
  onPresetChange,
  dateRange,
  onDateRangeChange,
  storeSelectionLocked = false,
}: ScopeControlsProps) {
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const presetOptions = [
    { value: "7", label: "Last 7 Days" },
    { value: "30", label: "Last 30 Days" },
    { value: "90", label: "Last 90 Days" },
    { value: "365", label: "Last Year" },
    { value: "custom", label: "Custom" },
  ];

  const formatSingleDate = (date: Date | null) => {
    if (!date) return "Select date";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Store</span>
        <Select
          value={selectedStoreId || undefined}
          onValueChange={onStoreChange}
          disabled={isLoadingStores || stores.length === 0 || storeSelectionLocked}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder={isLoadingStores ? "Loading..." : "Select store"} />
          </SelectTrigger>
          <SelectContent>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {storeSelectionLocked && (
          <span className="text-xs text-muted-foreground">Store access locked to your assignment.</span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Preset</span>
        <Select
          value={datePreset}
          onValueChange={(v) => {
            onPresetChange(v as DatePreset);
            if (v !== "custom") {
              onDateRangeChange(getPresetRange(v as DatePreset));
            }
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presetOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Start Date</span>
        <Popover open={startOpen} onOpenChange={setStartOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-40 justify-start gap-2">
              <CalendarIcon className="h-4 w-4" />
              <span className="text-sm">{formatSingleDate(dateRange.start)}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateRange.start || undefined}
              onSelect={(date) => {
                onDateRangeChange({ ...dateRange, start: date || null });
                onPresetChange("custom");
                setStartOpen(false);
              }}
              toDate={dateRange.end || undefined}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase text-muted-foreground">End Date</span>
        <Popover open={endOpen} onOpenChange={setEndOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-40 justify-start gap-2">
              <CalendarIcon className="h-4 w-4" />
              <span className="text-sm">{formatSingleDate(dateRange.end)}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateRange.end || undefined}
              onSelect={(date) => {
                onDateRangeChange({ ...dateRange, end: date || null });
                onPresetChange("custom");
                setEndOpen(false);
              }}
              fromDate={dateRange.start || undefined}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

// ============================================================================
// Overview Tab
// ============================================================================

interface OverviewTabProps {
  data: OverviewData | undefined;
  isLoading: boolean;
}

function OverviewTab({ data, isLoading }: OverviewTabProps) {
  if (isLoading) {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
      {[...Array(5)].map((_, i) => (
        <Card key={i} className="h-32 bg-slate-100" />
      ))}
    </div>;
  }

  if (!data) {
    return <div className="text-center text-muted-foreground py-8">No data available</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title="Gross Revenue"
          value={formatMoney(data.revenue.gross)}
          icon={<DollarSign className="h-4 w-4 text-slate-500" />}
          subtitle={`${data.revenue.transactionCount} transactions`}
          badge={data.currency}
          delta={formatDelta(data.revenue.delta)}
        />
        <KpiCard
          title="Net Revenue"
          value={formatMoney(data.revenue.net)}
          icon={<DollarSign className="h-4 w-4 text-slate-500" />}
          subtitle="After refunds"
          badge={data.currency}
        />
        {data.taxCollected && (
          <KpiCard
            title="Net Tax Collected"
            value={formatMoney(data.taxCollected)}
            icon={<Receipt className="h-4 w-4 text-slate-500" />}
            subtitle="Pass-through liability"
            badge={data.currency}
          />
        )}
        <KpiCard
          title="Refunds"
          value={formatMoney(data.refunds.amount)}
          icon={<RotateCcw className="h-4 w-4 text-slate-500" />}
          subtitle={`${data.refunds.count} refunds`}
          badge={data.refunds.isNative ? "Native" : undefined}
        />
        <KpiCard
          title="Net Profit"
          value={formatMoney(data.profit.netProfit)}
          icon={<TrendingUp className="h-4 w-4 text-slate-500" />}
          subtitle={`${data.profit.marginPercent.toFixed(1)}% margin`}
          delta={formatDelta(data.profit.delta)}
        />
        <KpiCard
          title="Inventory Value"
          value={formatMoney(data.inventory.value)}
          icon={<Package className="h-4 w-4 text-slate-500" />}
          subtitle={`${data.inventory.itemCount} items at cost`}
          badge={data.currency}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <KpiCard
          title="Active Customers"
          value={data.customers.active.toString()}
          icon={<Users className="h-4 w-4 text-slate-500" />}
          subtitle={`${data.customers.newThisPeriod} new this period`}
          delta={formatDelta(data.customers.delta)}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Sales Tab
// ============================================================================

interface SalesTabProps {
  storeId: string | null;
  currency: string;
  effectiveRange: { start: Date; end: Date };
  salesData: SalesData | undefined;
  timeseriesData: TimeseriesData | undefined;
  popularProducts: PopularProductsData | undefined;
  profitLoss: ProfitLossData | undefined;
  isLoading: boolean;
}

function SalesTab({ storeId, currency, effectiveRange, salesData, timeseriesData, popularProducts, profitLoss, isLoading }: SalesTabProps) {
  const chartData = useMemo(() => {
    if (!timeseriesData?.points) return [];
    return timeseriesData.points.map((p) => ({
      date: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      revenue: p.totalRevenue.amount,
      netRevenue: p.netRevenue.amount,
      transactions: p.transactions,
    }));
  }, [timeseriesData]);

  if (isLoading) {
    return <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => <Card key={i} className="h-28 bg-slate-100" />)}
      </div>
      <Card className="h-80 bg-slate-100" />
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ComprehensiveReportGenerator
          effectiveRange={effectiveRange}
          normalizeCurrency={false}
          storeId={storeId}
          currency={currency}
        />
      </div>

      {/* Sales KPI Cards */}
      {salesData && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            title="Total Revenue"
            value={formatMoney(salesData.totalRevenue.value)}
            icon={<DollarSign className="h-4 w-4 text-slate-500" />}
            delta={formatDelta(salesData.totalRevenue.delta)}
          />
          <KpiCard
            title="Net Revenue"
            value={formatMoney(salesData.netRevenue.value)}
            icon={<DollarSign className="h-4 w-4 text-slate-500" />}
            delta={formatDelta(salesData.netRevenue.delta)}
          />
          <KpiCard
            title="Transactions"
            value={salesData.transactions.value.toString()}
            icon={<BarChart3 className="h-4 w-4 text-slate-500" />}
            delta={formatDelta(salesData.transactions.delta)}
          />
          <KpiCard
            title="Customers"
            value={salesData.customers.value.toString()}
            icon={<Users className="h-4 w-4 text-slate-500" />}
            delta={formatDelta(salesData.customers.delta)}
          />
          <KpiCard
            title="Avg. Order"
            value={formatMoney(salesData.avgOrder.value)}
            icon={<DollarSign className="h-4 w-4 text-slate-500" />}
            delta={formatDelta(salesData.avgOrder.delta)}
          />
          <KpiCard
            title="Refunds"
            value={formatMoney(salesData.refunds.value)}
            icon={<RotateCcw className="h-4 w-4 text-slate-500" />}
            subtitle={`${salesData.refunds.count} refunds`}
            delta={formatDelta(salesData.refunds.delta)}
          />
        </div>
      )}

      {/* Revenue Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
            <CardDescription>Total and net revenue over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="Total Revenue" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="netRevenue" name="Net Revenue" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Popular Products */}
        {popularProducts && popularProducts.items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Popular Products</CardTitle>
              <CardDescription>Top selling SKUs by revenue</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {popularProducts.items.slice(0, 5).map((p, i) => (
                  <div key={p.productId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-muted-foreground">#{i + 1}</span>
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.unitsSold} units • {p.sku || "No SKU"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatMoney(p.revenue)}</p>
                      <p className="text-xs text-muted-foreground">{p.sharePercent}% of sales</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Profit & Loss Summary */}
        {profitLoss && (
          <Card>
            <CardHeader>
              <CardTitle>Profit & Loss Summary</CardTitle>
              <CardDescription>FIFO-based cost accounting</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Revenue Section */}
                <div className="flex justify-between">
                  <span>Gross Revenue</span>
                  <span className="font-medium">{formatMoney(profitLoss.revenue)}</span>
                </div>
                <div className="flex justify-between text-amber-600">
                  <span>Net Tax Collected</span>
                  <span>−{formatMoney(profitLoss.taxCollected)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Refunds</span>
                  <span>−{formatMoney(profitLoss.refunds)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-medium">Net Revenue</span>
                  <span className="font-medium">{formatMoney(profitLoss.netRevenue)}</span>
                </div>

                {/* Cost Section */}
                <div className="flex justify-between text-muted-foreground mt-2">
                  <span>COGS</span>
                  <span>−{formatMoney(profitLoss.cogs)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Stock Removal Loss</span>
                  <span>−{formatMoney(profitLoss.stockRemovalLoss)}</span>
                </div>
                {profitLoss.promotionLoss.amount > 0 && (
                  <div className="flex justify-between text-purple-600">
                    <span>Promotion Discounts</span>
                    <span>−{formatMoney(profitLoss.promotionLoss)}</span>
                  </div>
                )}

                {/* Profit Section */}
                <div className="border-t pt-2 flex justify-between font-bold">
                  <span>Net Profit</span>
                  <span className={profitLoss.netProfit.amount >= 0 ? "text-emerald-600" : "text-red-600"}>
                    {formatMoney(profitLoss.netProfit)}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Profit Margin</span>
                  <span>{profitLoss.marginPercent.toFixed(1)}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Inventory Tab
// ============================================================================

interface InventoryTabProps {
  data: InventoryData | undefined;
  isLoading: boolean;
}

function InventoryTab({ data, isLoading }: InventoryTabProps) {
  if (isLoading) {
    return <div className="animate-pulse grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => <Card key={i} className="h-28 bg-slate-100" />)}
    </div>;
  }

  if (!data) {
    return <div className="text-center text-muted-foreground py-8">No inventory data</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total SKUs"
          value={data.totalSKUs.toString()}
          icon={<Package className="h-4 w-4 text-slate-500" />}
        />
        <KpiCard
          title="Inventory Value"
          value={formatMoney(data.inventoryValue)}
          icon={<DollarSign className="h-4 w-4 text-slate-500" />}
          badge={data.currency}
        />
        <KpiCard
          title="Low Stock Items"
          value={data.lowStockCount.toString()}
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          className={data.lowStockCount > 0 ? "border-amber-200 bg-amber-50" : ""}
        />
        <KpiCard
          title="Out of Stock"
          value={data.outOfStockCount.toString()}
          icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          className={data.outOfStockCount > 0 ? "border-red-200 bg-red-50" : ""}
        />
      </div>

      {/* Aging & Watchlist */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Inventory Aging */}
        <Card>
          <CardHeader>
            <CardTitle>Inventory Aging</CardTitle>
            <CardDescription>Days since last restock</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.aging.map((bucket) => (
                <div key={bucket.bucket} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={bucket.bucket === "90+" ? "destructive" : bucket.bucket === "unknown" ? "secondary" : "outline"}>
                      {bucket.bucket} days
                    </Badge>
                    <span className="text-sm">{bucket.skuCount} SKUs</span>
                  </div>
                  <span className="font-medium">{formatMoney(bucket.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Oldest Inventory */}
        <Card>
          <CardHeader>
            <CardTitle>Oldest Inventory</CardTitle>
            <CardDescription>Items longest since restock</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.oldestInventory.map((item) => (
                <div key={item.productId} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} units • {item.daysSinceRestock ?? "?"} days old
                    </p>
                  </div>
                  <span className="font-medium">{formatMoney(item.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Watchlists */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Low Stock Watchlist */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Low Stock Watchlist
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.watchlist.lowStock.length === 0 ? (
              <p className="text-muted-foreground text-sm">No low stock items</p>
            ) : (
              <div className="space-y-3">
                {data.watchlist.lowStock.map((item) => (
                  <div key={item.productId}>
                    <div className="flex justify-between mb-1">
                      <span className="font-medium text-sm">{item.name}</span>
                      <span className="text-sm">{item.quantity}/{item.minLevel}</span>
                    </div>
                    <Progress value={item.percentToTarget} className="h-2" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Out of Stock Watchlist */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Out of Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.watchlist.outOfStock.length === 0 ? (
              <p className="text-muted-foreground text-sm">All items in stock</p>
            ) : (
              <div className="space-y-2">
                {data.watchlist.outOfStock.map((item) => (
                  <div key={item.productId} className="flex justify-between">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.lastRestocked ? `Last: ${new Date(item.lastRestocked).toLocaleDateString()}` : "Never restocked"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// Customers Tab
// ============================================================================

interface CustomersTabProps {
  data: CustomersData | undefined;
  isLoading: boolean;
}

function CustomersTab({ data, isLoading }: CustomersTabProps) {
  if (isLoading) {
    return <div className="animate-pulse grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => <Card key={i} className="h-28 bg-slate-100" />)}
    </div>;
  }

  if (!data) {
    return <div className="text-center text-muted-foreground py-8">No customer data</div>;
  }

  return (
    <div className="space-y-6">
      {/* Customer KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Customers"
          value={data.totalCustomers.value.toString()}
          icon={<Users className="h-4 w-4 text-slate-500" />}
          delta={formatDelta(data.totalCustomers.delta)}
        />
        <KpiCard
          title="New This Period"
          value={data.newThisPeriod.value.toString()}
          icon={<UserCheck className="h-4 w-4 text-slate-500" />}
          subtitle={`${data.newThisPeriod.percent}% of total`}
        />
        <KpiCard
          title="Loyal Customers"
          value={data.loyalCustomers.value.toString()}
          icon={<Award className="h-4 w-4 text-slate-500" />}
          subtitle={`${data.loyalCustomers.percent}% repeat buyers`}
        />
        <KpiCard
          title="Retention Rate"
          value={`${data.retentionRate.value}%`}
          icon={<Activity className="h-4 w-4 text-slate-500" />}
          delta={formatDelta(data.retentionRate.delta)}
        />
      </div>

      {/* Segments & Engagement */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Customer Segments */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Segments</CardTitle>
            <CardDescription>New vs. repeat customers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span>New Customers</span>
                  <span>{data.segments.newPercent}%</span>
                </div>
                <Progress value={data.segments.newPercent} className="h-3 bg-blue-100" />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span>Repeat Customers</span>
                  <span>{data.segments.repeatPercent}%</span>
                </div>
                <Progress value={data.segments.repeatPercent} className="h-3 bg-emerald-100" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Engagement Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Engagement & Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Transactions/Customer</p>
                <p className="text-2xl font-bold">{data.engagement.transactionsPerCustomer}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg. Order Value</p>
                <p className="text-2xl font-bold">{formatMoney(data.engagement.avgOrderValue)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Customer Growth</p>
                <p className={cn("text-2xl font-bold", data.engagement.customerGrowth >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {data.engagement.customerGrowth >= 0 ? "+" : ""}{data.engagement.customerGrowth}%
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Churn Risk</p>
                <p className={cn("text-2xl font-bold", data.engagement.churnRisk > 50 ? "text-red-600" : "text-amber-600")}>
                  {data.engagement.churnRisk}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// Staff Tab
// ============================================================================

interface StaffTabProps {
  data: StaffData | undefined;
  isLoading: boolean;
}

function StaffTab({ data, isLoading }: StaffTabProps) {
  if (isLoading) {
    return <div className="animate-pulse grid grid-cols-1 gap-4 md:grid-cols-3">
      {[...Array(3)].map((_, i) => <Card key={i} className="h-28 bg-slate-100" />)}
    </div>;
  }

  if (!data) {
    return <div className="text-center text-muted-foreground py-8">No staff data</div>;
  }

  return (
    <div className="space-y-6">
      {/* Staff Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          title="Staff on Shift"
          value={data.staffOnShift.toString()}
          icon={<Users className="h-4 w-4 text-slate-500" />}
          subtitle="Active in last hour"
        />
        {data.topPerformer && (
          <KpiCard
            title="Top Performer"
            value={data.topPerformer.name}
            icon={<Award className="h-4 w-4 text-amber-500" />}
            subtitle={`${formatMoney(data.topPerformer.revenue)} • ${data.topPerformer.tickets} tickets`}
          />
        )}
        <KpiCard
          title="Avg. Tickets/Staff"
          value={data.operationalInsights.avgTicketsPerStaff.toString()}
          icon={<BarChart3 className="h-4 w-4 text-slate-500" />}
        />
      </div>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle>Staff Performance Leaderboard</CardTitle>
          <CardDescription>Ranked by revenue for the selected period</CardDescription>
        </CardHeader>
        <CardContent>
          {data.leaderboard.length === 0 ? (
            <p className="text-muted-foreground text-sm">No staff activity in this period</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Rank</th>
                    <th className="text-left py-2">Name</th>
                    <th className="text-left py-2">Role</th>
                    <th className="text-right py-2">Revenue</th>
                    <th className="text-right py-2">Tickets</th>
                    <th className="text-right py-2">Avg. Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.map((s) => (
                    <tr key={s.userId} className="border-b">
                      <td className="py-2 font-bold text-muted-foreground">#{s.rank}</td>
                      <td className="py-2">{s.name}</td>
                      <td className="py-2 capitalize">{s.role}</td>
                      <td className="py-2 text-right font-medium">{formatMoney(s.revenue)}</td>
                      <td className="py-2 text-right">{s.tickets}</td>
                      <td className="py-2 text-right">{formatMoney(s.avgTicket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Store Contribution (if multi-store) */}
      {data.storeContribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Store Contribution</CardTitle>
            <CardDescription>Revenue and activity by store</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.storeContribution.map((s) => (
                <div key={s.storeId} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{s.storeName}</p>
                    <p className="text-xs text-muted-foreground">{s.staffCount} staff • {s.tickets} tickets</p>
                  </div>
                  <span className="font-semibold">{formatMoney(s.revenue)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Operational Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Operational Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Active Staff</p>
              <p className="text-2xl font-bold">{data.operationalInsights.activeStaffCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Transactions</p>
              <p className="text-2xl font-bold">{data.operationalInsights.totalTransactions}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold">{formatMoney(data.operationalInsights.totalRevenue)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Revenue/Staff</p>
              <p className="text-2xl font-bold">{formatMoney(data.operationalInsights.revenuePerStaff)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Price Analysis Tab
// ============================================================================

/* eslint-disable no-unused-vars */
interface PriceAnalysisTabProps {
  products: PriceTrendsListData | undefined;
  selectedProductId: string | null;
  onSelectProduct: (productId: string | null) => void;
  productDetail: PriceTrendDetailData | undefined;
  isLoading: boolean;
  isLoadingDetail: boolean;
  currency: CurrencyCode;
}
/* eslint-enable no-unused-vars */

function PriceAnalysisTab({
  products,
  selectedProductId,
  onSelectProduct,
  productDetail,
  isLoading,
  isLoadingDetail,
  currency,
}: PriceAnalysisTabProps) {
  const chartData = useMemo(() => {
    if (!productDetail?.timeline) return [];
    let lastSalePrice: number | null = null;
    let lastCostPrice: number | null = null;
    return productDetail.timeline.map((p) => {
      if (p.salePrice !== null) lastSalePrice = p.salePrice;
      if (p.costPrice !== null) lastCostPrice = p.costPrice;
      return {
        date: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        salePrice: lastSalePrice,
        costPrice: lastCostPrice,
      };
    });
  }, [productDetail]);

  if (isLoading) {
    return <div className="animate-pulse grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="h-80 bg-slate-100" />
      <Card className="h-80 bg-slate-100 lg:col-span-2" />
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Product Selector */}
        <Card>
          <CardHeader>
            <CardTitle>Products with Price Changes</CardTitle>
            <CardDescription>Select a product to view trends</CardDescription>
          </CardHeader>
          <CardContent>
            {!products || products.items.length === 0 ? (
              <p className="text-muted-foreground text-sm">No price changes in this period</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {products.items.map((p) => (
                  <button
                    key={p.productId}
                    onClick={() => onSelectProduct(p.productId)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-colors",
                      selectedProductId === p.productId
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.sku || "No SKU"}</p>
                      </div>
                      <Badge variant="secondary">{p.eventCount} changes</Badge>
                    </div>
                    <div className="mt-2 flex gap-4 text-xs">
                      <span>Price: {formatMoney(p.currentPrice)}</span>
                      <span>Cost: {formatMoney(p.currentCost)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Price vs Cost Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Price vs Cost Trend</CardTitle>
            {productDetail && (
              <CardDescription>
                {productDetail.product.name} • Latest: {formatMoney(productDetail.product.currentSalePrice)} sale / {formatMoney(productDetail.product.currentCostPrice)} cost
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {isLoadingDetail ? (
              <div className="h-64 bg-slate-100 animate-pulse rounded" />
            ) : chartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="stepAfter" dataKey="salePrice" name="Sale Price" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="stepAfter" dataKey="costPrice" name="Cost Price" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Select a product to view price trends
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product Detail */}
      {productDetail && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Summary Cards */}
          <Card>
            <CardHeader>
              <CardTitle>Price Change Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Price Changes</span>
                  <span className="font-medium">{productDetail.summary.priceChangeCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>COGS (Period)</span>
                  <span className="font-medium">{formatMoney(productDetail.summary.cogs)}</span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <p className="text-sm text-muted-foreground">Current Snapshot</p>
                  <p className="text-sm">{productDetail.currentSnapshot.quantity} units @ {formatMoney(productDetail.currentSnapshot.avgCost)} = {formatMoney(productDetail.currentSnapshot.totalValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Events */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Price Events</CardTitle>
            </CardHeader>
            <CardContent>
              {productDetail.recentEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm">No events in this period</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {productDetail.recentEvents.map((evt, i) => (
                    <div key={i} className="p-3 border rounded-lg">
                      <div className="flex justify-between items-start mb-1">
                        <Badge variant={evt.type === "Price Change" ? "outline" : "secondary"}>
                          {evt.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(evt.occurredAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm">
                        {evt.type === "Price Change" && (
                          <>
                            {evt.oldSalePrice !== null && evt.newSalePrice !== null && (
                              <p>Sale: {currency} {evt.oldSalePrice} → {evt.newSalePrice}</p>
                            )}
                            {evt.oldCost !== null && evt.newCost !== null && (
                              <p>Cost: {currency} {evt.oldCost} → {evt.newCost}</p>
                            )}
                          </>
                        )}
                        {evt.type === "Inventory Revaluation" && (
                          <>
                            {evt.oldCost !== null && evt.newCost !== null && (
                              <p>Avg Cost: {currency} {evt.oldCost} → {evt.newCost}</p>
                            )}
                            {evt.adjustmentAmount !== null && (
                              <p>Adjustment: {currency} {evt.adjustmentAmount}</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Analytics Page
// ============================================================================

export default function AnalyticsV2Page() {
  const { user } = useAuth();
  const managerStoreId = user?.role === "manager" ? user?.storeId ?? null : null;
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(managerStoreId);
  const [datePreset, setDatePreset] = useState<DatePreset>("30");
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange("30"));
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedPriceProductId, setSelectedPriceProductId] = useState<string | null>(null);

  // Fetch stores
  const { data: stores = [], isLoading: isLoadingStores } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  // Keep selection synced to manager assignment or default to first store for admins
  useEffect(() => {
    if (managerStoreId) {
      setSelectedStoreId(managerStoreId);
      return;
    }
    if (!selectedStoreId && stores.length > 0) {
      setSelectedStoreId(stores[0].id);
    }
  }, [managerStoreId, stores, selectedStoreId]);

  const visibleStores = useMemo(() => {
    if (managerStoreId) {
      return stores.filter((s) => s.id === managerStoreId);
    }
    return stores;
  }, [stores, managerStoreId]);

  const storeId = selectedStoreId || "";
  const hasStore = Boolean(storeId);
  const effectiveRange = useMemo(() => {
    if (dateRange.start && dateRange.end) return { start: dateRange.start, end: dateRange.end };
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start, end };
  }, [dateRange]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (storeId) params.set("store_id", storeId);
    params.set("date_from", effectiveRange.start.toISOString());
    params.set("date_to", effectiveRange.end.toISOString());
    return params.toString();
  }, [storeId, effectiveRange]);

  // Data queries
  const overviewQuery = useQuery<OverviewData>({
    queryKey: ["/api/analytics/v2/overview", queryParams],
    enabled: hasStore,
    queryFn: () => fetch(`/api/analytics/v2/overview?${queryParams}`, { credentials: "include" }).then(r => r.json()),
  });

  const salesQuery = useQuery<SalesData>({
    queryKey: ["/api/analytics/v2/sales", queryParams],
    enabled: hasStore && activeTab === "sales",
    queryFn: () => fetch(`/api/analytics/v2/sales?${queryParams}`, { credentials: "include" }).then(r => r.json()),
  });

  const timeseriesQuery = useQuery<TimeseriesData>({
    queryKey: ["/api/analytics/v2/sales/timeseries", queryParams],
    enabled: hasStore && activeTab === "sales",
    queryFn: () => fetch(`/api/analytics/v2/sales/timeseries?${queryParams}`, { credentials: "include" }).then(r => r.json()),
  });

  const popularProductsQuery = useQuery<PopularProductsData>({
    queryKey: ["/api/analytics/v2/products/popular", queryParams],
    enabled: hasStore && activeTab === "sales",
    queryFn: () => fetch(`/api/analytics/v2/products/popular?${queryParams}`, { credentials: "include" }).then(r => r.json()),
  });

  const profitLossQuery = useQuery<ProfitLossData>({
    queryKey: ["/api/analytics/v2/profit-loss", queryParams],
    enabled: hasStore && activeTab === "sales",
    queryFn: () => fetch(`/api/analytics/v2/profit-loss?${queryParams}`, { credentials: "include" }).then(r => r.json()),
  });

  const inventoryQuery = useQuery<InventoryData>({
    queryKey: ["/api/analytics/v2/inventory", storeId],
    enabled: hasStore && activeTab === "inventory",
    queryFn: () => fetch(`/api/analytics/v2/inventory?store_id=${storeId}`, { credentials: "include" }).then(r => r.json()),
  });

  const customersQuery = useQuery<CustomersData>({
    queryKey: ["/api/analytics/v2/customers", queryParams],
    enabled: hasStore && activeTab === "customers",
    queryFn: () => fetch(`/api/analytics/v2/customers?${queryParams}`, { credentials: "include" }).then(r => r.json()),
  });

  const staffQuery = useQuery<StaffData>({
    queryKey: ["/api/analytics/v2/staff", queryParams],
    enabled: hasStore && activeTab === "staff",
    queryFn: () => fetch(`/api/analytics/v2/staff?${queryParams}`, { credentials: "include" }).then(r => r.json()),
  });

  const priceTrendsQuery = useQuery<PriceTrendsListData>({
    queryKey: ["/api/analytics/v2/price-trends", queryParams],
    enabled: hasStore && activeTab === "price",
    queryFn: () => fetch(`/api/analytics/v2/price-trends?${queryParams}`, { credentials: "include" }).then(r => r.json()),
  });

  const priceTrendDetailQuery = useQuery<PriceTrendDetailData>({
    queryKey: ["/api/analytics/v2/price-trends", selectedPriceProductId, queryParams],
    enabled: hasStore && activeTab === "price" && Boolean(selectedPriceProductId),
    queryFn: () => fetch(`/api/analytics/v2/price-trends/${selectedPriceProductId}?${queryParams}`, { credentials: "include" }).then(r => r.json()),
  });

  const storeCurrency = useMemo(() => {
    const store = stores.find(s => s.id === storeId);
    return (store?.currency as CurrencyCode) || "NGN";
  }, [stores, storeId]);

  const isAdmin = user?.isAdmin || user?.role === "admin";
  const isManager = user?.role === "manager";
  const canViewStaff = isAdmin || isManager;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Business performance insights</p>
        </div>
        <ScopeControls
          stores={visibleStores}
          isLoadingStores={isLoadingStores}
          selectedStoreId={selectedStoreId}
          onStoreChange={setSelectedStoreId}
          datePreset={datePreset}
          onPresetChange={setDatePreset}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          storeSelectionLocked={Boolean(managerStoreId)}
        />
      </div>

      {!hasStore ? (
        <Card className="py-12 text-center">
          <p className="text-muted-foreground">Select a store to view analytics</p>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="inventory">Inventory & Alerts</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            {canViewStaff && <TabsTrigger value="staff">Staff</TabsTrigger>}
            <TabsTrigger value="price">Price Analysis</TabsTrigger>
            <TabsTrigger value="ai-insights" className="flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
              AI Insights
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab data={overviewQuery.data} isLoading={overviewQuery.isLoading} />
          </TabsContent>

          <TabsContent value="sales">
            <SalesTab
              storeId={selectedStoreId}
              currency={storeCurrency}
              effectiveRange={effectiveRange}
              salesData={salesQuery.data}
              timeseriesData={timeseriesQuery.data}
              popularProducts={popularProductsQuery.data}
              profitLoss={profitLossQuery.data}
              isLoading={salesQuery.isLoading || timeseriesQuery.isLoading}
            />
          </TabsContent>

          <TabsContent value="inventory">
            <InventoryTab data={inventoryQuery.data} isLoading={inventoryQuery.isLoading} />
          </TabsContent>

          <TabsContent value="customers">
            <CustomersTab data={customersQuery.data} isLoading={customersQuery.isLoading} />
          </TabsContent>

          {canViewStaff && (
            <TabsContent value="staff">
              <StaffTab data={staffQuery.data} isLoading={staffQuery.isLoading} />
            </TabsContent>
          )}

          <TabsContent value="price">
            <PriceAnalysisTab
              products={priceTrendsQuery.data}
              selectedProductId={selectedPriceProductId}
              onSelectProduct={setSelectedPriceProductId}
              productDetail={priceTrendDetailQuery.data}
              isLoading={priceTrendsQuery.isLoading}
              isLoadingDetail={priceTrendDetailQuery.isLoading}
              currency={storeCurrency}
            />
          </TabsContent>

          <TabsContent value="ai-insights">
            <ProfitAdvisorTab storeId={selectedStoreId} currency={storeCurrency} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
