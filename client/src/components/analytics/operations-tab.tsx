import {
  Award,
  BarChart3,
  Crown,
  Loader2,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/pos-utils";
import type { Money } from "@shared/lib/currency";

interface StaffPerformance {
  userId: string;
  name: string;
  role: string;
  totalSales: number;
  totalRevenue: Money;
  avgTicket: Money;
  transactions: number;
  onShift: boolean;
}

interface StoreContribution {
  storeId: string;
  storeName: string;
  revenue: Money;
  transactions: number;
  staffCount: number;
}

interface AlertSummary {
  total: number;
  lowStock: number;
  staffing: number;
  incidents: number;
}

interface OperationsTabProps {
  hasAccess: boolean;
  staffPerformance: StaffPerformance[];
  storeContributions: StoreContribution[];
  alertsSummary: AlertSummary | null;
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
}

export default function OperationsTab({
  hasAccess,
  staffPerformance,
  storeContributions,
  alertsSummary,
  isLoading,
  isError,
  error,
}: OperationsTabProps) {
  const cashierPerformance = useMemo(
    () => staffPerformance.filter((member) => member.role.toLowerCase() === "cashier"),
    [staffPerformance],
  );
  const topStaff = useMemo(() => cashierPerformance.slice(0, 5), [cashierPerformance]);
  const topStores = useMemo(() => storeContributions.slice(0, 3), [storeContributions]);

  if (!hasAccess) {
    return (
      <Card className="border border-dashed border-slate-200">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          You don’t have access to operations insights.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="border border-slate-200">
        <CardContent className="flex h-40 items-center justify-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading operations metrics…
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-4 w-4" />
            Unable to load operations analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-destructive">
          {error?.message ?? "An unexpected error occurred."}
        </CardContent>
      </Card>
    );
  }

  if (cashierPerformance.length === 0) {
    return (
      <Card className="border border-dashed border-slate-200">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No cashier performance data available yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border border-slate-200">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              <span>Staff on shift</span>
              <Users className="h-4 w-4" />
            </div>
            <div className="text-2xl font-semibold">
              {cashierPerformance.filter((member) => member.onShift).length}
            </div>
            <p className="text-xs text-muted-foreground">Active users with recent transactions</p>
          </CardHeader>
        </Card>

        <Card className="border border-slate-200">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              <span>Top performer</span>
              <Crown className="h-4 w-4 text-amber-500" />
            </div>
            {topStaff[0] ? (
              <>
                <div className="text-lg font-semibold">{topStaff[0].name}</div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(topStaff[0].totalRevenue)} revenue • {topStaff[0].transactions} tickets
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No performance data yet.</p>
            )}
          </CardHeader>
        </Card>

        <Card className="border border-slate-200">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              <span>Alerts</span>
              <ShieldAlert className="h-4 w-4 text-red-500" />
            </div>
            <div className="text-2xl font-semibold text-red-600">{alertsSummary?.total ?? 0}</div>
            <p className="text-xs text-muted-foreground">Unresolved operational alerts</p>
          </CardHeader>
        </Card>
      </div>

      <Card className="border border-slate-200">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Staff performance leaderboard</CardTitle>
            <p className="text-sm text-muted-foreground">Ranked by revenue generated</p>
          </div>
          <Badge variant="outline" className="text-xs">
            Last 30 days
          </Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
                <TableHead className="text-right">Avg. ticket</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topStaff.map((member, index) => (
                <TableRow key={member.userId}>
                  <TableCell className="font-medium">
                    #{index + 1}
                  </TableCell>
                  <TableCell>{member.name}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{member.role}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(member.totalRevenue)}
                  </TableCell>
                  <TableCell className="text-right">{member.transactions.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{formatCurrency(member.avgTicket)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border border-slate-200">
          <CardHeader>
            <CardTitle>Store contribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {topStores.length === 0 ? (
              <p className="text-muted-foreground">No store contribution data available.</p>
            ) : (
              topStores.map((store) => (
                <div key={store.storeId} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{store.storeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {store.transactions.toLocaleString()} transactions • {store.staffCount} staff
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {formatCurrency(store.revenue)}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border border-slate-200">
          <CardHeader>
            <CardTitle>Operational insights</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <InsightTile
              icon={TrendingUp}
              title="Avg tickets per staff"
              value={computeAverageTickets(cashierPerformance).toFixed(1)}
              description="Workload distribution across active staff"
            />
            <InsightTile
              icon={Award}
              title="Revenue per staff"
              value={formatCurrency(computeRevenuePerStaff(cashierPerformance))}
              description="Average revenue contribution per staff"
            />
            <InsightTile
              icon={BarChart3}
              title="Staffing coverage"
              value={`${((cashierPerformance.filter((member) => member.onShift).length / Math.max(cashierPerformance.length, 1)) * 100).toFixed(1)}%`}
              description="Share of staff currently active"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function computeAverageTickets(staff: StaffPerformance[]): number {
  if (staff.length === 0) return 0;
  const totalTickets = staff.reduce((sum, member) => sum + member.transactions, 0);
  return totalTickets / staff.length;
}

function computeRevenuePerStaff(staff: StaffPerformance[]): Money {
  if (staff.length === 0) {
    return { amount: 0, currency: "USD" } satisfies Money;
  }
  const currency = staff[0].totalRevenue.currency;
  const totalRevenue = staff.reduce((sum, member) => sum + member.totalRevenue.amount, 0);
  return { amount: totalRevenue / staff.length, currency } satisfies Money;
}

interface InsightTileProps {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  value: string;
  description?: string;
}

function InsightTile({ icon: Icon, title, value, description }: InsightTileProps) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{title}</span>
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
      {description ? <p className="mt-2 text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}
