import { useQuery } from "@tanstack/react-query";
import { CalendarIcon, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/pos-utils";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { CurrencyCode, Money } from "@shared/lib/currency";
import { useAnalyticsScope } from "./analytics-scope-context";

interface TimeseriesResponse {
  baseCurrency: CurrencyCode;
  points: TimeseriesPoint[];
}

interface TimeseriesPoint {
  date: string;
  total: Money;
  normalized?: {
    amount: number;
    currency: CurrencyCode;
    baseCurrency: CurrencyCode;
  };
  transactions: number;
  customers?: number;
  averageOrder: Money;
}

interface ChartPoint {
  date: string;
  revenue: number;
  transactions: number;
  customers: number;
  averageOrder: number;
  revenueMoney: Money;
  averageOrderMoney: Money;
}

interface ChartProps {
  className?: string;
}

const CHART_TYPES = [
  { value: "line", label: "Line Chart", icon: TrendingUp },
  { value: "bar", label: "Bar Chart", icon: BarChart3 },
  { value: "area", label: "Area Chart", icon: TrendingDown },
  { value: "pie", label: "Pie Chart", icon: PieChartIcon },
];

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"];

export default function SalesChart({ className }: ChartProps) {
  const [chartType, setChartType] = useState("line");
  const {
    selectedStoreId,
    dateRange,
    displayCurrency,
    resolvedCurrency,
  } = useAnalyticsScope();

  const hasExplicitRange = Boolean(dateRange.start && dateRange.end);
  const effectiveRange = useMemo(() => {
    if (dateRange.start && dateRange.end) {
      return dateRange;
    }
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    return { start, end };
  }, [dateRange]);

  const startDate = effectiveRange.start;
  const endDate = effectiveRange.end;
  const storeId = selectedStoreId ?? "";

  const { data: timeseries, isLoading } = useQuery<TimeseriesResponse>({
    queryKey: [
      "/api/analytics/timeseries",
      storeId,
      startDate?.toISOString() ?? null,
      endDate?.toISOString() ?? null,
      displayCurrency,
    ],
    queryFn: async () => {
      const start = startDate?.toISOString();
      const end = endDate?.toISOString();
      const params = new URLSearchParams();
      params.set('interval', 'day');
      if (storeId) params.set('store_id', storeId);
      if (start) params.set('date_from', start);
      if (end) params.set('date_to', end);
      params.set('normalize_currency', displayCurrency === 'native' ? 'false' : 'true');
      if (displayCurrency !== 'native') {
        params.set('target_currency', resolvedCurrency);
      }
      const response = await apiRequest("GET", `/api/analytics/timeseries?${params.toString()}`);
      return response.json();
    },
    enabled: Boolean(storeId) && !!startDate && !!endDate,
  });

  const chartCurrency: CurrencyCode = (timeseries?.points?.[0]?.normalized?.currency
    || timeseries?.points?.[0]?.total.currency
    || timeseries?.baseCurrency
    || resolvedCurrency) as CurrencyCode;

  const chartPoints: ChartPoint[] = (timeseries?.points ?? []).map((point) => {
    const revenueMoney: Money = point.normalized
      ? { amount: point.normalized.amount, currency: point.normalized.currency }
      : point.total;
    const transactions = point.transactions ?? 0;
    const averageOrderMoney: Money = point.normalized && transactions > 0
      ? { amount: point.normalized.amount / transactions, currency: point.normalized.currency }
      : point.averageOrder ?? { amount: 0, currency: revenueMoney.currency };
    const customers = typeof point.customers === 'number' ? point.customers : transactions;
    return {
      date: point.date,
      revenue: revenueMoney.amount,
      transactions,
      customers,
      averageOrder: averageOrderMoney.amount,
      revenueMoney,
      averageOrderMoney,
    };
  });

  const totalRevenueMoney: Money = {
    amount: chartPoints.reduce((sum, item) => sum + item.revenueMoney.amount, 0),
    currency: chartCurrency,
  };
  const totalTransactions = chartPoints.reduce((sum, item) => sum + item.transactions, 0);
  const totalCustomers = chartPoints.reduce((sum, item) => sum + item.customers, 0);
  const averageOrderMoney: Money = totalTransactions > 0
    ? { amount: totalRevenueMoney.amount / totalTransactions, currency: totalRevenueMoney.currency }
    : { amount: 0, currency: totalRevenueMoney.currency };

  // Calculate growth rates
  const revenueGrowth = chartPoints.length >= 2 
    ? ((chartPoints[chartPoints.length - 1].revenue - chartPoints[chartPoints.length - 2].revenue) / (chartPoints[chartPoints.length - 2].revenue || 1)) * 100 
    : 0;

  const transactionGrowth = chartPoints.length >= 2 
    ? ((chartPoints[chartPoints.length - 1].transactions - chartPoints[chartPoints.length - 2].transactions) / (chartPoints[chartPoints.length - 2].transactions || 1)) * 100 
    : 0;

  const renderChart = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (chartPoints.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No sales data available for the selected period</p>
          </div>
        </div>
      );
    }

    switch (chartType) {
      case "line":
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartPoints}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => formatDate(new Date(value), "MMM dd")}
              />
              <YAxis 
                tickFormatter={(value) => formatCurrency({ amount: value, currency: chartCurrency })}
                domain={[0, 'dataMax + 100']}
              />
              <Tooltip 
                formatter={(value: any, name: string) => [
                  name === 'revenue'
                    ? formatCurrency({ amount: value, currency: chartCurrency })
                    : value,
                  name === 'revenue' ? 'Revenue' : name === 'transactions' ? 'Transactions' : 'Customers'
                ]}
                labelFormatter={(label) => formatDate(new Date(label), "MMM dd, yyyy")}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={{ fill: "#3B82F6", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey="transactions" 
                stroke="#10B981" 
                strokeWidth={2}
                dot={{ fill: "#10B981", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case "bar":
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartPoints}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => formatDate(new Date(value), "MMM dd")}
              />
              <YAxis 
                tickFormatter={(value) => formatCurrency({ amount: value, currency: chartCurrency })}
                domain={[0, 'dataMax + 100']}
              />
              <Tooltip 
                formatter={(value: any, name: string) => [
                  name === 'revenue'
                    ? formatCurrency({ amount: value, currency: chartCurrency })
                    : value,
                  name === 'revenue' ? 'Revenue' : 'Transactions'
                ]}
                labelFormatter={(label) => formatDate(new Date(label), "MMM dd, yyyy")}
              />
              <Legend />
              <Bar dataKey="revenue" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="transactions" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );

      case "area":
        return (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={chartPoints}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => formatDate(new Date(value), "MMM dd")}
              />
              <YAxis
                tickFormatter={(value) => formatCurrency({ amount: value, currency: chartCurrency })}
                domain={[0, 'dataMax + 100']}
              />
              <Tooltip
                formatter={(value: any, name: string) => [
                  name === 'revenue'
                    ? formatCurrency({ amount: value, currency: chartCurrency })
                    : value,
                  name === 'revenue' ? 'Revenue' : 'Transactions'
                ]}
                labelFormatter={(label) => formatDate(new Date(label), "MMM dd, yyyy")}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="revenue"
                stackId="1"
                stroke="#3B82F6"
                fill="#3B82F6"
                fillOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="transactions"
                stackId="2"
                stroke="#10B981"
                fill="#10B981"
                fillOpacity={0.6}
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      case "pie": {
        // For pie chart, we'll show revenue distribution by day
        const pieData = chartPoints.map((item, index) => ({
          name: formatDate(new Date(item.date), "MMM dd"),
          value: item.revenue,
          color: COLORS[index % COLORS.length],
        }));

        return (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any) => [formatCurrency({ amount: value, currency: chartCurrency }), "Revenue"]}
              />
            </PieChart>
          </ResponsiveContainer>
        );
      }

      default:
        return null;
    }
  };

  return (
    <Card className={cn("relative", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">Sales Analytics</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <CalendarIcon className="h-4 w-4" />
            {startDate && endDate ? (
              <span>{formatDate(startDate, "MMM dd, yyyy")} – {formatDate(endDate, "MMM dd, yyyy")}</span>
            ) : (
              <span>Select a date range to view analytics</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            {/* Chart Type Selector */}
            <Select value={chartType} onValueChange={setChartType}>
              <SelectTrigger className="w-32 bg-white border border-gray-200 hover:bg-gray-50">
                <SelectValue placeholder="Chart Type" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-white border border-gray-200 shadow-lg min-w-[8rem]">
                {CHART_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <SelectItem key={type.value} value={type.value} className="cursor-pointer hover:bg-gray-100">
                      <div className="flex items-center space-x-2">
                        <Icon className="w-4 h-4" />
                        <span>{type.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {displayCurrency !== 'native' ? (
              <div className="flex items-center space-x-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <DollarSign className="h-3 w-3" />
                <span>{resolvedCurrency}</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                <DollarSign className="h-3 w-3" />
                <span>{chartCurrency}</span>
              </div>
            )}
          </div>
          {hasExplicitRange ? null : (
            <p className="text-xs text-muted-foreground">
              Showing default 30-day range. Select dates in the scope controls to customize.
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
            <DollarSign className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-gray-600">Total Revenue</p>
              <p className="text-lg font-semibold text-blue-600">{formatCurrency(totalRevenueMoney)}</p>
              <div className="flex items-center space-x-1">
                {revenueGrowth >= 0 ? (
                  <TrendingUp className="w-3 h-3 text-green-600" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-600" />
                )}
                <span className={`text-xs ${revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {Math.abs(revenueGrowth).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
            <ShoppingCart className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-sm text-gray-600">Transactions</p>
              <p className="text-lg font-semibold text-green-600">{totalTransactions}</p>
              <div className="flex items-center space-x-1">
                {transactionGrowth >= 0 ? (
                  <TrendingUp className="w-3 h-3 text-green-600" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-600" />
                )}
                <span className={`text-xs ${transactionGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {Math.abs(transactionGrowth).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3 bg-purple-50 rounded-lg">
            <Users className="w-8 h-8 text-purple-600" />
            <div>
              <p className="text-sm text-gray-600">Customers</p>
              <p className="text-lg font-semibold text-purple-600">{totalCustomers}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3 bg-orange-50 rounded-lg">
            <DollarSign className="w-8 h-8 text-orange-600" />
            <div>
              <p className="text-sm text-gray-600">Avg. Order</p>
              <p className="text-lg font-semibold text-orange-600">{formatCurrency(averageOrderMoney)}</p>
            </div>
          </div>
        </div>

        {/* Chart */}
        {renderChart()}

        {/* Exports */}
        <div className="mt-4 flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={() => {
              const start = startDate?.toISOString();
              const end = endDate?.toISOString();
              const params = new URLSearchParams();
              params.set('interval', 'day');
              if (storeId) params.set('store_id', storeId);
              if (start) params.set('date_from', start);
              if (end) params.set('date_to', end);
              window.open(`/api/analytics/export.csv?${params.toString()}`, '_blank');
            }}
            disabled={!storeId || !startDate || !endDate}
          >
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const start = startDate?.toISOString();
              const end = endDate?.toISOString();
              const params = new URLSearchParams();
              params.set('interval', 'day');
              if (storeId) params.set('store_id', storeId);
              if (start) params.set('date_from', start);
              if (end) params.set('date_to', end);
              window.open(`/api/analytics/export.pdf?${params.toString()}`, '_blank');
            }}
            disabled={!storeId || !startDate || !endDate}
          >
            Export PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
