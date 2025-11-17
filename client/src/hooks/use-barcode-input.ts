import { useCallback, useEffect } from "react";

import { useScannerContext } from "./use-barcode-scanner";

interface UseBarcodeInputOptions {
  // eslint-disable-next-line no-unused-vars
  onScan?: (code: string) => void;
  enabled?: boolean;
  autoActivate?: boolean;
}

export function useBarcodeInput({ onScan, enabled = true, autoActivate = true }: UseBarcodeInputOptions = {}) {
  const {
    setOnScan,
    activateScanner,
    deactivateScanner,
    isScannerActive,
    isScanning,
    inputBuffer,
  } = useScannerContext();

  const handleScan = useCallback((code: string) => {
    onScan?.(code);
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return () => undefined;
    setOnScan(handleScan);
    if (autoActivate) activateScanner();
    return () => {
      setOnScan(undefined);
      if (autoActivate) deactivateScanner();
    };
  }, [enabled, autoActivate, setOnScan, handleScan, activateScanner, deactivateScanner]);

  return {
    isScannerActive,
    isScanning,
    inputBuffer,
  } as const;
}
