import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/pos-utils";
import type { Money } from "@shared/lib/currency";

interface DashboardCardsProps {
  dailySales: {
    revenue: Money;
    transactions: number;
  };
  profitLoss: {
    revenue: Money;
    cost: Money;
    profit: Money;
  };
  popularProducts: Array<{
    product: { id: string; name: string; price: string; currency?: string };
    salesCount: number;
  }>;
  additionalMetrics?: {
    totalProducts?: number;
    totalCustomers?: number;
    averageOrderValue?: Money;
  };
}

export default function DashboardCards({
  dailySales,
  profitLoss,
  popularProducts,
  additionalMetrics = {},
}: DashboardCardsProps) {
  const revenueAmount = dailySales.revenue.amount;
  const revenueCurrency = dailySales.revenue.currency;
  const profitAmount = profitLoss.revenue.amount;
  const profitValue = profitLoss.profit.amount;
  const profitMargin = profitAmount > 0 ? (profitValue / profitAmount) * 100 : 0;
  const avgOrderValue: Money = dailySales.transactions > 0
    ? { amount: revenueAmount / dailySales.transactions, currency: revenueCurrency }
    : { amount: 0, currency: revenueCurrency };
  const topProductSales = popularProducts.length > 0 ? popularProducts[0].salesCount : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Today's Revenue */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Today&apos;s Revenue</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(dailySales.revenue)}
          </div>
          <p className="text-xs text-muted-foreground">
            {dailySales.transactions} transactions
          </p>
        </CardContent>
      </Card>

      {/* Monthly Profit */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Monthly Profit</CardTitle>
          {profitLoss.profit.amount >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${profitLoss.profit.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(profitLoss.profit)}
          </div>
          <p className="text-xs text-muted-foreground">
            {profitMargin.toFixed(1)}% margin
          </p>
        </CardContent>
      </Card>

      {/* Average Order Value */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(avgOrderValue)}
          </div>
          <p className="text-xs text-muted-foreground">
            Per transaction
          </p>
        </CardContent>
      </Card>

      {/* Top Product Sales */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Top Product Sales</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            {topProductSales}
          </div>
          <p className="text-xs text-muted-foreground">
            {popularProducts.length > 0 ? popularProducts[0].product.name : 'No data'}
          </p>
        </CardContent>
      </Card>

      {/* Monthly Revenue */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(profitLoss.revenue)}
          </div>
          <p className="text-xs text-muted-foreground">
            Last 30 days
          </p>
        </CardContent>
      </Card>

      {/* Monthly Costs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Monthly Costs</CardTitle>
          <TrendingDown className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">
            {formatCurrency(profitLoss.cost)}
          </div>
          <p className="text-xs text-muted-foreground">
            Cost of goods sold
          </p>
        </CardContent>
      </Card>

      {/* Total Products */}
      {additionalMetrics.totalProducts !== undefined && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {additionalMetrics.totalProducts}
            </div>
            <p className="text-xs text-muted-foreground">
              In catalog
            </p>
          </CardContent>
        </Card>
      )}

      {/* Total Customers */}
      {additionalMetrics.totalCustomers !== undefined && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {additionalMetrics.totalCustomers}
            </div>
            <p className="text-xs text-muted-foreground">
              Registered
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
