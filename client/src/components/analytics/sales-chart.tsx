import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { formatCurrency } from "@/lib/pos-utils";

interface SalesData {
  date: string;
  revenue: number;
  transactions: number;
  profit: number;
}

interface SalesChartProps {
  data: SalesData[];
  type?: "bar" | "line";
  title?: string;
}

// Mock data for demonstration
const mockSalesData: SalesData[] = [
  { date: "Mon", revenue: 2400, transactions: 45, profit: 600 },
  { date: "Tue", revenue: 1398, transactions: 32, profit: 350 },
  { date: "Wed", revenue: 9800, transactions: 78, profit: 2450 },
  { date: "Thu", revenue: 3908, transactions: 56, profit: 980 },
  { date: "Fri", revenue: 4800, transactions: 89, profit: 1200 },
  { date: "Sat", revenue: 3800, transactions: 67, profit: 950 },
  { date: "Sun", revenue: 4300, transactions: 71, profit: 1075 },
];

export default function SalesChart({ 
  data = mockSalesData, 
  type = "bar", 
  title = "Weekly Sales Overview" 
}: SalesChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.dataKey === "revenue" && `Revenue: ${formatCurrency(entry.value)}`}
              {entry.dataKey === "transactions" && `Transactions: ${entry.value}`}
              {entry.dataKey === "profit" && `Profit: ${formatCurrency(entry.value)}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            {type === "bar" ? (
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false}
                  tickLine={false}
                  className="text-sm"
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  className="text-sm"
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="revenue" 
                  fill="hsl(207, 90%, 54%)" 
                  radius={[4, 4, 0, 0]}
                  name="Revenue"
                />
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false}
                  tickLine={false}
                  className="text-sm"
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  className="text-sm"
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="hsl(207, 90%, 54%)" 
                  strokeWidth={3}
                  dot={{ fill: "hsl(207, 90%, 54%)", strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: "hsl(207, 90%, 54%)", strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="profit" 
                  stroke="hsl(142, 71%, 45%)" 
                  strokeWidth={2}
                  dot={{ fill: "hsl(142, 71%, 45%)", strokeWidth: 2, r: 3 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
