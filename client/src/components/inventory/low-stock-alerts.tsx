import { AlertTriangle, Package, Clock, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatCurrency } from "@/lib/pos-utils";

interface LowStockAlert {
  id: string;
  storeId: string;
  productId: string;
  currentStock: number;
  minStockLevel: number;
  isResolved: boolean;
  createdAt: string;
  product?: {
    id: string;
    name: string;
    barcode: string;
    price: string;
    category?: string;
  };
}

/* eslint-disable no-unused-vars -- callback arg names document the external contract */
interface LowStockAlertsProps {
  alerts: LowStockAlert[];
  onResolveAlert: (alertId: string) => void;
  onReorderProduct: (productId: string) => void;
  isResolving?: boolean;
}
/* eslint-enable no-unused-vars */

export default function LowStockAlerts({
  alerts,
  onResolveAlert,
  onReorderProduct,
  isResolving = false,
}: LowStockAlertsProps) {
  const criticalAlerts = alerts.filter(alert => alert.currentStock === 0);
  const warningAlerts = alerts.filter(alert => alert.currentStock > 0 && alert.currentStock <= alert.minStockLevel);

  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
            Stock Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">All Stock Levels Healthy</h3>
            <p className="text-gray-600">No low stock alerts at this time. All products are adequately stocked.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alerts.length}</div>
            <p className="text-xs text-muted-foreground">Active alerts</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{criticalAlerts.length}</div>
            <p className="text-xs text-muted-foreground">Out of stock</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warning</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{warningAlerts.length}</div>
            <p className="text-xs text-muted-foreground">Low stock</p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alerts */}
      {criticalAlerts.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Critical - Out of Stock ({criticalAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {criticalAlerts.map((alert) => (
                <div key={alert.id} className="bg-white border border-red-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                        <Package className="w-6 h-6 text-red-600" />
                      </div>
                      <div>
                        <p className="font-medium text-red-900">
                          {alert.product?.name || `Product ${alert.productId}`}
                        </p>
                        <p className="text-sm text-red-700">
                          SKU: {alert.product?.barcode || 'N/A'}
                        </p>
                        {alert.product?.category && (
                          <Badge variant="outline" className="text-xs mt-1 border-red-200 text-red-700">
                            {alert.product.category}
                          </Badge>
                        )}
                        <p className="text-xs text-red-600 flex items-center mt-1">
                          <Clock className="w-3 h-3 mr-1" />
                          {formatDateTime(new Date(alert.createdAt))}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <Badge variant="destructive" className="mb-2">
                          OUT OF STOCK
                        </Badge>
                        <p className="text-sm text-red-700">
                          Min level: {alert.minStockLevel}
                        </p>
                        {alert.product?.price && (
                          <p className="text-sm text-red-600">
                            {formatCurrency(parseFloat(alert.product.price))} each
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col space-y-2">
                        <Button
                          size="sm"
                          onClick={() => onReorderProduct(alert.productId)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Reorder Now
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onResolveAlert(alert.id)}
                          disabled={isResolving}
                          className="border-red-300 text-red-600 hover:bg-red-50"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Resolve
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warning Alerts */}
      {warningAlerts.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-yellow-700 flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Warning - Low Stock ({warningAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {warningAlerts.map((alert) => (
                <div key={alert.id} className="bg-white border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                        <Package className="w-6 h-6 text-yellow-600" />
                      </div>
                      <div>
                        <p className="font-medium text-yellow-900">
                          {alert.product?.name || `Product ${alert.productId}`}
                        </p>
                        <p className="text-sm text-yellow-700">
                          SKU: {alert.product?.barcode || 'N/A'}
                        </p>
                        {alert.product?.category && (
                          <Badge variant="outline" className="text-xs mt-1 border-yellow-200 text-yellow-700">
                            {alert.product.category}
                          </Badge>
                        )}
                        <p className="text-xs text-yellow-600 flex items-center mt-1">
                          <Clock className="w-3 h-3 mr-1" />
                          {formatDateTime(new Date(alert.createdAt))}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <Badge variant="secondary" className="mb-2 bg-yellow-100 text-yellow-800">
                          {alert.currentStock} remaining
                        </Badge>
                        <p className="text-sm text-yellow-700">
                          Min level: {alert.minStockLevel}
                        </p>
                        {alert.product?.price && (
                          <p className="text-sm text-yellow-600">
                            {formatCurrency(parseFloat(alert.product.price))} each
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col space-y-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onReorderProduct(alert.productId)}
                          className="border-yellow-400 text-yellow-700 hover:bg-yellow-100"
                        >
                          Reorder
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onResolveAlert(alert.id)}
                          disabled={isResolving}
                          className="border-yellow-300 text-yellow-600 hover:bg-yellow-50"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Resolve
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button variant="outline" disabled={alerts.length === 0}>
              Export Alert Report
            </Button>
            <Button variant="outline" disabled={alerts.length === 0}>
              Generate Purchase Orders
            </Button>
            <Button variant="outline" disabled={alerts.length === 0}>
              Mark All as Reviewed
            </Button>
            <Button variant="outline">
              Adjust Stock Levels
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
