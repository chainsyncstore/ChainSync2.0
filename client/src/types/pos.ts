export interface CartItem {
  id: string;
  productId: string;
  name: string;
  barcode: string;
  price: number; // Current price (may be discounted or 0 for free items)
  quantity: number | undefined;
  total: number;
  // Promotional pricing fields
  originalPrice?: number; // Store original price when promotion applied
  promotionId?: string; // ID of applied promotion
  promotionName?: string; // Name of applied promotion
  promotionType?: 'percentage' | 'bundle'; // Type of promotion
  discountPercent?: number; // Discount percentage if applicable
  isFreeItem?: boolean; // True for bundle "free" items (price=0, originalPrice retained)

  // Bundle promotion metadata
  availableBundle?: {
    id: string; // Promotion ID
    name: string;
    buyQuantity: number;
    getQuantity: number;
  };
}

export interface CartSummary {
  itemCount: number;
  subtotal: number;
  redeemDiscount: number;
  tax: number;
  total: number;
  taxRate: number;
  taxIncluded: boolean;
}

export interface PaymentPortion {
  method: "cash" | "card" | "wallet";
  amount: number;
  reference?: string;
}

export interface PaymentData {
  method: "cash" | "card" | "digital" | "split";
  amountReceived?: number;
  changeDue?: number;
  split?: PaymentPortion[];
  walletReference?: string;
}

export type LoyaltySyncState = {
  state: "idle" | "online" | "cached" | "error";
  updatedAt?: number;
  message?: string;
};

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
