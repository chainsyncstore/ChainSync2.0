export type AlertStatus = "low_stock" | "out_of_stock" | "overstocked";
export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertProductSummary {
  id: string;
  name: string | null;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  price?: string | null;
}

export interface StoreAlertDetail {
  id: string;
  storeId: string;
  productId: string;
  status: AlertStatus;
  severity: AlertSeverity;
  quantity: number;
  minStockLevel: number | null;
  maxStockLevel: number | null;
  price: string | null;
  alertId: string | null;
  alertCreatedAt: string | null;
  updatedAt: string | null;
  product: AlertProductSummary;
}

export interface StoreAlertStats {
  lowStock: number;
  outOfStock: number;
  overstocked: number;
  total: number;
}

export interface StoreAlertsResponse {
  storeId: string;
  storeName: string;
  currency: string;
  stats: StoreAlertStats;
  alerts: StoreAlertDetail[];
}

export interface AlertsOverviewStore {
  storeId: string;
  storeName: string;
  currency: string;
  lowStock: number;
  outOfStock: number;
  overstocked: number;
  total: number;
}

export interface AlertsOverviewResponse {
  totals: {
    storesWithAlerts: number;
    lowStock: number;
    outOfStock: number;
    overstocked: number;
    total: number;
  };
  stores: AlertsOverviewStore[];
}
