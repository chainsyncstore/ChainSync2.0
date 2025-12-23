import { useState, useCallback, useEffect } from "react";
import { saveCart, loadCart, clearCart as clearCartStorage } from "@/lib/utils";
import type { CartItem, CartSummary, PaymentData } from "@/types/pos";

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState<PaymentData>({ method: "cash" });
  const [taxRate, setTaxRate] = useState(0.085);
  const [taxIncluded, setTaxIncluded] = useState(false);
  const [redeemValue, setRedeemValue] = useState(0.01);
  const [redeemPoints, setRedeemPoints] = useState(0);

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = loadCart();
    if (savedCart) {
      if (savedCart.items && Array.isArray(savedCart.items)) {
        setItems(savedCart.items);
      }
      if (savedCart.payment) {
        setPayment(savedCart.payment);
      }
      if (typeof savedCart.taxRate === "number") {
        setTaxRate(Math.max(0, Math.min(1, savedCart.taxRate)));
      }
      if (typeof savedCart.taxIncluded === "boolean") {
        setTaxIncluded(savedCart.taxIncluded);
      }
      if (typeof savedCart.redeemValue === "number") {
        setRedeemValue(Math.max(0, savedCart.redeemValue));
      }
      if (typeof savedCart.redeemPoints === "number") {
        setRedeemPoints(Math.max(0, Math.floor(savedCart.redeemPoints)));
      }
    }
  }, []);

  // Save cart to localStorage whenever items or payment changes
  useEffect(() => {
    const cartData = { items, payment, taxRate, taxIncluded, redeemValue, redeemPoints };
    saveCart(cartData);
  }, [items, payment, taxRate, taxIncluded, redeemValue, redeemPoints]);

  const removeItem = useCallback((itemId: string) => {
    setItems(currentItems => currentItems.filter(item => item.id !== itemId));
  }, []);

  const addItem = useCallback((product: { id: string; name: string; barcode: string; price: number }) => {
    setItems(currentItems => {
      const existingItem = currentItems.find(item => item.productId === product.id);

      if (existingItem) {
        return currentItems.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
            : item
        );
      }

      return [...currentItems, {
        id: `${product.id}-${Date.now()}`,
        productId: product.id,
        name: product.name,
        barcode: product.barcode,
        price: product.price,
        quantity: 1,
        total: product.price,
      }];
    });
  }, [setItems]);

  const updateQuantity = useCallback((itemId: string, quantity: number | undefined) => {
    // Allow undefined/0 for editing, but don't auto-remove
    // User must explicitly delete or leave empty (blocked at checkout)
    setItems(currentItems =>
      currentItems.map(item =>
        item.id === itemId
          ? { ...item, quantity: quantity, total: (quantity ?? 0) * item.price }
          : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setPayment({ method: "cash" });
    setRedeemPoints(0);
    clearCartStorage();
  }, []);

  const hydrateCart = useCallback((nextItems: CartItem[], nextPayment: PaymentData) => {
    const clonedItems = nextItems.map((item) => ({ ...item }));
    setItems(clonedItems);
    setPayment({ ...nextPayment });
  }, []);

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const appliedRedeemDiscount = Math.min(subtotal, Math.max(0, redeemPoints) * Math.max(0, redeemValue));
  const taxableSubtotal = Math.max(0, subtotal - appliedRedeemDiscount);

  // Calculate tax based on mode
  // Tax included: back-calculate tax from the total (prices already contain tax)
  // Tax excluded: calculate tax on top of subtotal (current behavior)
  const effectiveTaxRate = Math.max(0, taxRate);
  let computedTax: number;
  let finalTotal: number;
  let displaySubtotal: number;

  if (taxIncluded && effectiveTaxRate > 0) {
    // Tax is already included in item prices
    // Back-calculate: subtotal already contains tax, so extract it
    // Formula: preTaxAmount = total / (1 + taxRate)
    // taxAmount = total - preTaxAmount
    const preTaxAmount = taxableSubtotal / (1 + effectiveTaxRate);
    computedTax = taxableSubtotal - preTaxAmount;
    displaySubtotal = preTaxAmount;
    finalTotal = taxableSubtotal; // Total is the same as item prices (tax already included)
  } else {
    // Tax is added on top of item prices (original behavior)
    computedTax = taxableSubtotal * effectiveTaxRate;
    displaySubtotal = taxableSubtotal;
    finalTotal = taxableSubtotal + computedTax;
  }

  const summary: CartSummary = {
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: displaySubtotal,
    redeemDiscount: appliedRedeemDiscount,
    tax: computedTax,
    total: finalTotal,
    taxRate,
    taxIncluded,
  };

  const updatePayment = useCallback((paymentData: Partial<PaymentData>) => {
    setPayment(current => ({ ...current, ...paymentData }));
  }, []);

  const calculateChange = useCallback((amountReceived: number) => {
    const changeDue = Math.max(0, amountReceived - summary.total);
    setPayment(current => ({ ...current, amountReceived, changeDue }));
    return changeDue;
  }, [summary.total]);

  const updateTaxRateValue = useCallback((value: number) => {
    setTaxRate(Math.max(0, Math.min(1, value)));
  }, []);

  const updateTaxIncluded = useCallback((value: boolean) => {
    setTaxIncluded(value);
  }, []);

  const updateRedeemValue = useCallback((value: number) => {
    setRedeemValue(Math.max(0, value));
  }, []);

  const updateRedeemPoints = useCallback((points: number) => {
    setRedeemPoints(Math.max(0, Math.floor(points)));
  }, []);

  return {
    items,
    summary,
    payment,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    hydrateCart,
    updatePayment,
    calculateChange,
    taxRate,
    setTaxRate: updateTaxRateValue,
    taxIncluded,
    setTaxIncluded: updateTaxIncluded,
    redeemValue,
    setRedeemValue: updateRedeemValue,
    redeemPoints,
    setRedeemPoints: updateRedeemPoints,
  };
}
