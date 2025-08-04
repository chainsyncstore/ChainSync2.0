import { useState, useEffect, useCallback } from "react";

export function useBarcodeScanner(onScan: (barcode: string) => void) {
  const [inputBuffer, setInputBuffer] = useState("");
  const [isScanning, setIsScanning] = useState(false);

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    // Ignore if user is typing in input fields
    if (event.target && (event.target as HTMLElement).tagName === "INPUT") {
      return;
    }

    if (event.key === "Enter") {
      if (inputBuffer.length > 3) { // Minimum barcode length
        onScan(inputBuffer);
        setInputBuffer("");
        setIsScanning(false);
      }
    } else if (/^[0-9a-zA-Z]$/.test(event.key)) {
      setInputBuffer(prev => prev + event.key);
      setIsScanning(true);
      
      // Clear buffer after 1 second of inactivity
      setTimeout(() => {
        setInputBuffer("");
        setIsScanning(false);
      }, 1000);
    }
  }, [inputBuffer, onScan]);

  useEffect(() => {
    document.addEventListener("keypress", handleKeyPress);
    return () => document.removeEventListener("keypress", handleKeyPress);
  }, [handleKeyPress]);

  return {
    isScanning,
    inputBuffer,
  };
}
