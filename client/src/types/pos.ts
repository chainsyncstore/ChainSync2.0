export interface CartItem {
  id: string;
  productId: string;
  name: string;
  barcode: string;
  price: number;
  quantity: number;
  total: number;
}

export interface CartSummary {
  itemCount: number;
  subtotal: number;
  redeemDiscount: number;
  tax: number;
  total: number;
  taxRate: number;
}

export interface PaymentData {
  method: "cash" | "card" | "digital";
  amountReceived?: number;
  changeDue?: number;
}

export interface DailySales {
  revenue: number;
  transactions: number;
}

export interface PopularProduct {
  product: {
    id: string;
    name: string;
    price: string;
  };
  salesCount: number;
}

export interface ProfitLossData {
  revenue: number;
  cost: number;
  profit: number;
}

export interface NotificationData {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  timestamp: Date;
}
