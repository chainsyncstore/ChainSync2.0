import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";

type BarcodeHandler = (code: string) => void; // eslint-disable-line no-unused-vars

interface ScannerContextType {
  isScanning: boolean;
  inputBuffer: string;
  isScannerActive: boolean;
  activateScanner: () => void;
  deactivateScanner: () => void;
  onScan: BarcodeHandler | null;
  setOnScan: (handler: BarcodeHandler) => void; // eslint-disable-line no-unused-vars
}

const ScannerContext = createContext<ScannerContextType | null>(null);

export function useScannerContext() {
  const context = useContext(ScannerContext);
  if (!context) {
    throw new Error("useScannerContext must be used within a ScannerProvider");
  }
  return context;
}

export function ScannerProvider({ children }: { children: React.ReactNode }) {
  const [inputBuffer, setInputBuffer] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [onScan, setOnScan] = useState<BarcodeHandler | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activateScanner = useCallback(() => {
    setIsScannerActive(true);
    setIsScanning(true);
    setInputBuffer("");
  }, []);

  const deactivateScanner = useCallback(() => {
    setIsScannerActive(false);
    setIsScanning(false);
    setInputBuffer("");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    // Only process if scanner is active
    if (!isScannerActive) {
      return;
    }

    // Ignore if user is typing in input fields, textareas, or contenteditable elements
    const target = event.target as HTMLElement;
    if (target && (
      target.tagName === "INPUT" || 
      target.tagName === "TEXTAREA" || 
      target.contentEditable === "true" ||
      target.closest('[contenteditable="true"]')
    )) {
      return;
    }

    if (event.key === "Enter") {
      if (inputBuffer.length > 3 && onScan) { // Minimum barcode length
        onScan(inputBuffer);
        setInputBuffer("");
        setIsScanning(false);
        // Keep scanner active for next scan
        setIsScannerActive(true);
      }
    } else if (/^[0-9a-zA-Z]$/.test(event.key)) {
      setInputBuffer(prev => prev + event.key);
      setIsScanning(true);
      
      // Clear buffer after 1 second of inactivity
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setInputBuffer("");
        setIsScanning(false);
      }, 1000);
    }
  }, [inputBuffer, onScan, isScannerActive]);

  useEffect(() => {
    document.addEventListener("keypress", handleKeyPress);
    return () => document.removeEventListener("keypress", handleKeyPress);
  }, [handleKeyPress]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const value: ScannerContextType = {
    isScanning,
    inputBuffer,
    isScannerActive,
    activateScanner,
    deactivateScanner,
    onScan,
    setOnScan,
  };

  return (
    <ScannerContext.Provider value={value}>
      {children}
    </ScannerContext.Provider>
  );
}

export function useBarcodeScanner(onScan: BarcodeHandler) {
  const [inputBuffer, setInputBuffer] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activateScanner = useCallback(() => {
    setIsScannerActive(true);
    setIsScanning(true);
    setInputBuffer("");
  }, []);

  const deactivateScanner = useCallback(() => {
    setIsScannerActive(false);
    setIsScanning(false);
    setInputBuffer("");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    // Only process if scanner is active
    if (!isScannerActive) {
      return;
    }

    // Ignore if user is typing in input fields, textareas, or contenteditable elements
    const target = event.target as HTMLElement;
    if (target && (
      target.tagName === "INPUT" || 
      target.tagName === "TEXTAREA" || 
      target.contentEditable === "true" ||
      target.closest('[contenteditable="true"]')
    )) {
      return;
    }

    if (event.key === "Enter") {
      if (inputBuffer.length > 3) { // Minimum barcode length
        onScan(inputBuffer);
        setInputBuffer("");
        setIsScanning(false);
        // Keep scanner active for next scan
        setIsScannerActive(true);
      }
    } else if (/^[0-9a-zA-Z]$/.test(event.key)) {
      setInputBuffer(prev => prev + event.key);
      setIsScanning(true);
      
      // Clear buffer after 1 second of inactivity
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setInputBuffer("");
        setIsScanning(false);
      }, 1000);
    }
  }, [inputBuffer, onScan, isScannerActive]);

  useEffect(() => {
    document.addEventListener("keypress", handleKeyPress);
    return () => document.removeEventListener("keypress", handleKeyPress);
  }, [handleKeyPress]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isScanning,
    inputBuffer,
    isScannerActive,
    activateScanner,
    deactivateScanner,
  };
}
