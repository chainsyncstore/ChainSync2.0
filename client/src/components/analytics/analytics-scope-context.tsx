import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import type { CurrencyCode } from "@shared/lib/currency";
import type { Store } from "@shared/schema";

export type DatePreset = "7" | "30" | "90" | "365" | "custom";

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

export type DisplayCurrency = "native" | CurrencyCode;

export interface AnalyticsScopeValue {
  stores: Store[];
  isLoadingStores: boolean;
  selectedStoreId: string | null;
  setSelectedStoreId: Dispatch<SetStateAction<string | null>>;
  datePreset: DatePreset;
  setDatePreset: Dispatch<SetStateAction<DatePreset>>;
  dateRange: DateRange;
  setCustomDateRange: Dispatch<SetStateAction<DateRange>>;
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: Dispatch<SetStateAction<DisplayCurrency>>;
  resolvedCurrency: CurrencyCode;
  availableCurrencies: DisplayCurrency[];
}

const AnalyticsScopeContext = createContext<AnalyticsScopeValue | undefined>(undefined);

function calculatePresetRange(preset: DatePreset): DateRange {
  const end = new Date();
  if (preset === "custom") {
    return { start: null, end: null };
  }

  const start = new Date(end);
  switch (preset) {
    case "7":
      start.setDate(start.getDate() - 7);
      break;
    case "30":
      start.setDate(start.getDate() - 30);
      break;
    case "90":
      start.setDate(start.getDate() - 90);
      break;
    case "365":
      start.setDate(start.getDate() - 365);
      break;
    default:
      break;
  }
  return { start, end };
}

interface ProviderProps {
  children: ReactNode;
  initialStoreId?: string | null;
  initialPreset?: DatePreset;
  initialDisplayCurrency?: DisplayCurrency;
}

export function AnalyticsScopeProvider({
  children,
  initialStoreId = null,
  initialPreset = "30",
  initialDisplayCurrency = "native",
}: ProviderProps) {
  const { data: stores = [], isPending: isLoadingStores } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(initialStoreId);
  const [datePreset, setDatePresetState] = useState<DatePreset>(initialPreset);
  const [dateRange, setDateRange] = useState<DateRange>(() => calculatePresetRange(initialPreset));
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>(initialDisplayCurrency);

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0) {
      setSelectedStoreId(stores[0].id);
    }
  }, [stores, selectedStoreId]);

  useEffect(() => {
    if (datePreset !== "custom") {
      setDateRange(calculatePresetRange(datePreset));
    }
  }, [datePreset]);

  const activeStoreCurrency = useMemo(() => {
    const activeStore = stores.find((store) => store.id === selectedStoreId);
    return (activeStore?.currency ?? "USD") as CurrencyCode;
  }, [stores, selectedStoreId]);

  useEffect(() => {
    if (displayCurrency === "native") {
      return;
    }
    if (displayCurrency && typeof displayCurrency === "string") {
      return;
    }
    setDisplayCurrencyState("native");
  }, [activeStoreCurrency, displayCurrency]);

  const resolvedCurrency = useMemo<CurrencyCode>(() => {
    if (displayCurrency === "native") {
      return activeStoreCurrency;
    }
    return displayCurrency;
  }, [activeStoreCurrency, displayCurrency]);

  const availableCurrencies = useMemo<DisplayCurrency[]>(() => {
    const unique = new Set<DisplayCurrency>(["native"]);
    unique.add(activeStoreCurrency);
    stores.forEach((store) => {
      if (store.currency) {
        unique.add(store.currency as CurrencyCode);
      }
    });
    unique.add("USD");
    unique.add("NGN");
    return Array.from(unique);
  }, [stores, activeStoreCurrency]);

  const value = useMemo<AnalyticsScopeValue>(() => ({
    stores,
    isLoadingStores,
    selectedStoreId,
    setSelectedStoreId,
    datePreset,
    setDatePreset: setDatePresetState,
    dateRange,
    setCustomDateRange: (updater: SetStateAction<DateRange>) => {
      setDatePresetState("custom");
      setDateRange((prevRange) => (typeof updater === "function" ? updater(prevRange) : updater));
    },
    displayCurrency,
    setDisplayCurrency: setDisplayCurrencyState,
    resolvedCurrency,
    availableCurrencies,
  }), [
    stores,
    isLoadingStores,
    selectedStoreId,
    datePreset,
    dateRange,
    displayCurrency,
    resolvedCurrency,
    availableCurrencies,
  ]);

  return (
    <AnalyticsScopeContext.Provider value={value}>
      {children}
    </AnalyticsScopeContext.Provider>
  );
}

export function useAnalyticsScope(): AnalyticsScopeValue {
  const context = useContext(AnalyticsScopeContext);
  if (!context) {
    throw new Error("useAnalyticsScope must be used within an AnalyticsScopeProvider");
  }
  return context;
}
