import { createContext, useContext } from "react";

export interface LayoutContextValue {
  sidebarFooter: React.ReactNode | null;
  setSidebarFooter: (footer: React.ReactNode | null) => void;
}

const defaultLayoutContext: LayoutContextValue = {
  sidebarFooter: null,
  setSidebarFooter: () => undefined,
};

export const LayoutContext = createContext<LayoutContextValue>(defaultLayoutContext);

export function useLayout(): LayoutContextValue {
  return useContext(LayoutContext);
}
