import { createContext, useContext } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

export interface LayoutContextValue {
  sidebarFooter: ReactNode | null;
  setSidebarFooter: Dispatch<SetStateAction<ReactNode | null>>;
}

const defaultLayoutContext: LayoutContextValue = {
  sidebarFooter: null,
  setSidebarFooter: (() => undefined) as Dispatch<SetStateAction<ReactNode | null>>,
};

export const LayoutContext = createContext<LayoutContextValue>(defaultLayoutContext);

export function useLayout(): LayoutContextValue {
  return useContext(LayoutContext);
}
