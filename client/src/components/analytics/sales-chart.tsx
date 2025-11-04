import { useQuery } from "@tanstack/react-query";
import { CalendarIcon, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/pos-utils";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface SalesData {
  date: string;
  revenue: number;
  transactions: number;
  customers: number;
  averageOrder: number;
}

interface ChartProps {
  storeId: string;
  className?: string;
}

const CHART_TYPES = [
  { value: "line", label: "Line Chart", icon: TrendingUp },
  { value: "bar", label: "Bar Chart", icon: BarChart3 },
  { value: "area", label: "Area Chart", icon: TrendingDown },
  { value: "pie", label: "Pie Chart", icon: PieChartIcon },
];

const DATE_RANGES = [
  { value: "7", label: "Last 7 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "90", label: "Last 90 Days" },
  { value: "365", label: "Last Year" },
];

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"];

export default function SalesChart({ storeId, className }: ChartProps) {
  const [chartType, setChartType] = useState("line");
  const [dateRange, setDateRange] = useState("30");
  const [startDate, setStartDate] = useState<Date | undefined>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  });
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Fetch sales data
  const { data: salesData = [], isLoading } = useQuery<SalesData[]>({
    queryKey: ["/api/analytics/timeseries", storeId, dateRange, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      const start = startDate?.toISOString();
      const end = endDate?.toISOString();
      const params = new URLSearchParams();
      params.set('interval', 'day');
      if (storeId) params.set('store_id', storeId);
      if (start) params.set('date_from', start);
      if (end) params.set('date_to', end);
      const response = await apiRequest("GET", `/api/analytics/timeseries?${params.toString()}`);
      return response.json();
    },
    enabled: !!startDate && !!endDate,
  });

  // Calculate summary statistics
  const totalRevenue = salesData.reduce((sum, item) => sum + item.revenue, 0);
  const totalTransactions = salesData.reduce((sum, item) => sum + item.transactions, 0);
  const totalCustomers = salesData.reduce((sum, item) => sum + item.customers, 0);
  const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  // Calculate growth rates
  const revenueGrowth = salesData.length >= 2 
    ? ((salesData[salesData.length - 1].revenue - salesData[salesData.length - 2].revenue) / salesData[salesData.length - 2].revenue) * 100 
    : 0;

  const transactionGrowth = salesData.length >= 2 
    ? ((salesData[salesData.length - 1].transactions - salesData[salesData.length - 2].transactions) / salesData[salesData.length - 2].transactions) * 100 
    : 0;

  const handleDateRangeChange = (range: string) => {
    setDateRange(range);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - parseInt(range));
    setStartDate(start);
    setEndDate(end);
  };

  const renderChart = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (salesData.length === 0) {
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
            <LineChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => formatDate(new Date(value), "MMM dd")}
              />
              <YAxis 
                tickFormatter={(value) => formatCurrency(value)}
                domain={[0, 'dataMax + 100']}
              />
              <Tooltip 
                formatter={(value: any, name: string) => [
                  name === 'revenue' ? formatCurrency(value) : value,
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
            <BarChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => formatDate(new Date(value), "MMM dd")}
              />
              <YAxis 
                tickFormatter={(value) => formatCurrency(value)}
                domain={[0, 'dataMax + 100']}
              />
              <Tooltip 
                formatter={(value: any, name: string) => [
                  name === 'revenue' ? formatCurrency(value) : value,
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
            <AreaChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => formatDate(new Date(value), "MMM dd")}
              />
              <YAxis 
                tickFormatter={(value) => formatCurrency(value)}
                domain={[0, 'dataMax + 100']}
              />
              <Tooltip 
                formatter={(value: any, name: string) => [
                  name === 'revenue' ? formatCurrency(value) : value,
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
        const pieData = salesData.map((item, index) => ({
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
                formatter={(value: any) => [formatCurrency(value), "Revenue"]}
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

            {/* Date Range Selector */}
            <Select value={dateRange} onValueChange={handleDateRangeChange}>
              <SelectTrigger className="w-40 bg-white border border-gray-200 hover:bg-gray-50">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-white border border-gray-200 shadow-lg min-w-[8rem]">
                {DATE_RANGES.map((range) => (
                  <SelectItem key={range.value} value={range.value} className="cursor-pointer hover:bg-gray-100">
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Custom Date Range */}
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-auto justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate && endDate ? (
                    <>
                      {formatDate(startDate, "MMM dd")} - {formatDate(endDate, "MMM dd")}
                    </>
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50 bg-white border border-gray-200 shadow-lg" align="end" side="bottom" sideOffset={4}>
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={startDate}
                  selected={{
                    from: startDate,
                    to: endDate,
                  }}
                  onSelect={(range) => {
                    setStartDate(range?.from);
                    setEndDate(range?.to);
                    if (range?.from && range?.to) {
                      setIsDatePickerOpen(false);
                    }
                  }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
            <DollarSign className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-gray-600">Total Revenue</p>
              <p className="text-lg font-semibold text-blue-600">{formatCurrency(totalRevenue)}</p>
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
              <p className="text-lg font-semibold text-orange-600">{formatCurrency(averageOrderValue)}</p>
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
          >
            Export PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
