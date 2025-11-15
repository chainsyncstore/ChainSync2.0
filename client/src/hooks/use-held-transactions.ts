import { useCallback, useEffect, useMemo, useState } from "react";
import type { CartItem, PaymentData } from "@/types/pos";

const STORAGE_KEY = "pos_held_transactions";

export interface HeldLoyaltyState {
  customerPhone: string;
  loyaltyCustomer: { id: string; name?: string | null } | null;
  loyaltyBalance: number | null;
  redeemPoints: number;
}

export interface HeldTransactionPayload {
  storeId: string;
  items: CartItem[];
  payment: PaymentData;
  loyalty: HeldLoyaltyState;
}

export interface HeldTransaction extends HeldTransactionPayload {
  id: string;
  createdAt: string;
}

function safeParse(raw: string | null): HeldTransaction[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as HeldTransaction[];
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function readAllHeld(): HeldTransaction[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

function persistHeld(next: HeldTransaction[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function clonePayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function useHeldTransactions(storeId?: string | null) {
  const [allHeld, setAllHeld] = useState<HeldTransaction[]>(() => readAllHeld());

  useEffect(() => {
    setAllHeld(readAllHeld());
    const handler = () => setAllHeld(readAllHeld());
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const persist = useCallback((next: HeldTransaction[]) => {
    persistHeld(next);
    setAllHeld(next);
  }, []);

  const holdTransaction = useCallback((payload: HeldTransactionPayload) => {
    const entry: HeldTransaction = {
      id: `held_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      storeId: payload.storeId,
      items: clonePayload(payload.items),
      payment: clonePayload(payload.payment),
      loyalty: clonePayload(payload.loyalty),
    };
    persist([entry, ...allHeld]);
    return entry;
  }, [allHeld, persist]);

  const resumeTransaction = useCallback((id: string) => {
    const entry = allHeld.find((item) => item.id === id);
    if (!entry) return null;
    const next = allHeld.filter((item) => item.id !== id);
    persist(next);
    return clonePayload(entry);
  }, [allHeld, persist]);

  const discardTransaction = useCallback((id: string) => {
    const next = allHeld.filter((item) => item.id !== id);
    persist(next);
  }, [allHeld, persist]);

  const heldForStore = useMemo(() => {
    if (!storeId) return allHeld;
    return allHeld.filter((item) => item.storeId === storeId);
  }, [allHeld, storeId]);

  return {
    heldTransactions: heldForStore,
    holdTransaction,
    resumeTransaction,
    discardTransaction,
  };
}
