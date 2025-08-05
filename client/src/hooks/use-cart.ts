import { useState, useCallback, useEffect } from "react";
import type { CartItem, CartSummary, PaymentData } from "@/types/pos";
import { CART_STORAGE_KEY, saveCart, loadCart, clearCart as clearCartStorage } from "@/lib/utils";

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState<PaymentData>({ method: "cash" });

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
    }
  }, []);

  // Save cart to localStorage whenever items or payment changes
  useEffect(() => {
    const cartData = { items, payment };
    saveCart(cartData);
  }, [items, payment]);

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
  }, []);

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
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems(currentItems => currentItems.filter(item => item.id !== itemId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setPayment({ method: "cash" });
    clearCartStorage();
  }, []);

  const summary: CartSummary = {
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.total, 0),
    tax: items.reduce((sum, item) => sum + item.total, 0) * 0.085, // 8.5% tax rate
    total: items.reduce((sum, item) => sum + item.total, 0) * 1.085,
  };

  const updatePayment = useCallback((paymentData: Partial<PaymentData>) => {
    setPayment(current => ({ ...current, ...paymentData }));
  }, []);

  const calculateChange = useCallback((amountReceived: number) => {
    const changeDue = Math.max(0, amountReceived - summary.total);
    setPayment(current => ({ ...current, amountReceived, changeDue }));
    return changeDue;
  }, [summary.total]);

  return {
    items,
    summary,
    payment,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    updatePayment,
    calculateChange,
  };
}
