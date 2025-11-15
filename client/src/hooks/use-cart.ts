import { useState, useCallback, useEffect } from "react";
import { saveCart, loadCart, clearCart as clearCartStorage } from "@/lib/utils";
import type { CartItem, CartSummary, PaymentData } from "@/types/pos";

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState<PaymentData>({ method: "cash" });
  const [taxRate, setTaxRate] = useState(0.085);
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
    const cartData = { items, payment, taxRate, redeemValue, redeemPoints };
    saveCart(cartData);
  }, [items, payment, taxRate, redeemValue, redeemPoints]);

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

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(itemId);
      return;
    }
    
    setItems(currentItems =>
      currentItems.map(item =>
        item.id === itemId
          ? { ...item, quantity, total: quantity * item.price }
          : item
      )
    );
  }, [removeItem]);

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
  const computedTax = taxableSubtotal * Math.max(0, taxRate);
  const summary: CartSummary = {
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal,
    redeemDiscount: appliedRedeemDiscount,
    tax: computedTax,
    total: taxableSubtotal + computedTax,
    taxRate,
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
    redeemValue,
    setRedeemValue: updateRedeemValue,
    redeemPoints,
    setRedeemPoints: updateRedeemPoints,
  };
}
