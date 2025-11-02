import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Package, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/pos-utils";
import { apiRequest } from "@/lib/queryClient";
import type { Store, LowStockAlert, Product } from "@shared/schema";

import LowStockEmailOptOutToggle from "../../components/LowStockEmailOptOutToggle";

export default function Alerts() {
  const [selectedStore, setSelectedStore] = useState<string>("");
  const queryClient = useQueryClient();

  const userData = {
    role: "manager",
    name: "John Doe",
    initials: "JD",
  };

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  // Auto-select first store when stores are loaded
  useEffect(() => {
    if (stores.length > 0 && !selectedStore) {
      setSelectedStore(stores[0].id);
    }
  }, [stores, selectedStore]);

  const { data: alerts = [] } = useQuery<LowStockAlert[]>({
    queryKey: ["/api/stores", selectedStore, "alerts"],
    enabled: Boolean(selectedStore),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const resolveAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      await apiRequest("PUT", `/api/alerts/${alertId}/resolve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stores", selectedStore, "alerts"] });
    },
  });



  const alertsWithProducts = alerts.map((alert: any) => {
    const product = products.find((p: any) => p.id === alert.productId);
    return { ...alert, product };
  }).filter((alert: any) => alert.product);

  const criticalAlerts = alertsWithProducts.filter((alert: any) => alert.currentStock === 0);
  const warningAlerts = alertsWithProducts.filter((alert: any) => alert.currentStock > 0);

  return (
    <div className="space-y-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Preferences</CardTitle>
              </CardHeader>
              <CardContent>
                <LowStockEmailOptOutToggle />
              </CardContent>
            </Card>
            {/* Alert Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{alertsWithProducts.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Active stock alerts
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Critical</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{criticalAlerts.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Out of stock items
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Warning</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">{warningAlerts.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Low stock items
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Critical Alerts */}
            {criticalAlerts.length > 0 && (
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="text-red-700 flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    Critical Alerts - Out of Stock
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {criticalAlerts.map((alert: any) => (
                      <div key={alert.id} className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                            <Package className="w-6 h-6 text-red-600" />
                          </div>
                          <div>
                            <p className="font-medium text-red-900">{alert.product.name}</p>
                            <p className="text-sm text-red-700">SKU: {alert.product.barcode}</p>
                            <p className="text-xs text-red-600">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {formatDateTime(new Date(alert.createdAt))}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <Badge variant="destructive">OUT OF STOCK</Badge>
                            <p className="text-sm text-red-700 mt-1">
                              Min level: {alert.minStockLevel}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => resolveAlertMutation.mutate(alert.id)}
                            disabled={resolveAlertMutation.isPending}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Resolve
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Warning Alerts */}
            {warningAlerts.length > 0 && (
              <Card className="border-yellow-200">
                <CardHeader>
                  <CardTitle className="text-yellow-700 flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    Warning Alerts - Low Stock
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {warningAlerts.map((alert: any) => (
                      <div key={alert.id} className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                            <Package className="w-6 h-6 text-yellow-600" />
                          </div>
                          <div>
                            <p className="font-medium text-yellow-900">{alert.product.name}</p>
                            <p className="text-sm text-yellow-700">SKU: {alert.product.barcode}</p>
                            <p className="text-xs text-yellow-600">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {formatDateTime(new Date(alert.createdAt))}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                              {alert.currentStock} remaining
                            </Badge>
                            <p className="text-sm text-yellow-700 mt-1">
                              Min level: {alert.minStockLevel}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolveAlertMutation.mutate(alert.id)}
                            disabled={resolveAlertMutation.isPending}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Resolve
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* No Alerts State */}
            {alertsWithProducts.length === 0 && (
              <Card>
                <CardContent className="text-center py-12">
                  <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">All Clear!</h3>
                  <p className="text-gray-600">No active stock alerts. All inventory levels are healthy.</p>
                </CardContent>
              </Card>
            )}
          </div>
      </div>
    );
}
