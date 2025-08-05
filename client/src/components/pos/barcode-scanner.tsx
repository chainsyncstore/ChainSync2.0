import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, ScanLine, Power, PowerOff } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onOpenSearch: () => void;
  isLoading?: boolean;
  isScannerActive?: boolean;
  onActivateScanner?: () => void;
  onDeactivateScanner?: () => void;
  isScanning?: boolean;
  inputBuffer?: string;
}

export default function BarcodeScanner({ 
  onScan, 
  onOpenSearch, 
  isLoading,
  isScannerActive = false,
  onActivateScanner,
  onDeactivateScanner,
  isScanning = false,
  inputBuffer = ""
}: BarcodeScannerProps) {
  const [barcodeInput, setBarcodeInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (barcodeInput.trim()) {
      onScan(barcodeInput.trim());
      setBarcodeInput("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit(e);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800">Product Scanner</h3>
        <div className="flex items-center space-x-2">
          {isScannerActive && (
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <ScanLine className="w-3 h-3 mr-1" />
              Scanner Active
            </Badge>
          )}
          {isScanning && inputBuffer && (
            <Badge variant="outline" className="font-mono">
              {inputBuffer}
            </Badge>
          )}
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="flex space-x-4">
        <div className="flex-1">
          <Label htmlFor="barcode" className="block text-sm font-medium text-slate-700 mb-2">
            Scan or Enter Barcode
          </Label>
          <div className="relative">
            <Input
              id="barcode"
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Scan barcode or type manually..."
              className="text-lg font-mono pr-12"
              autoFocus
              disabled={isLoading}
            />
            <ScanLine className="absolute right-3 top-3 text-slate-400 w-6 h-6" />
          </div>
        </div>
        <div className="flex flex-col space-y-2">
          <Button
            type="submit"
            disabled={!barcodeInput.trim() || isLoading}
            className="px-6 py-3 font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onOpenSearch}
            className="px-6 py-3 font-medium"
          >
            <Search className="w-4 h-4 mr-2" />
            Search
          </Button>
          {onActivateScanner && onDeactivateScanner && (
            <Button
              type="button"
              variant={isScannerActive ? "destructive" : "default"}
              onClick={isScannerActive ? onDeactivateScanner : onActivateScanner}
              className="px-6 py-3 font-medium"
            >
              {isScannerActive ? (
                <>
                  <PowerOff className="w-4 h-4 mr-2" />
                  Deactivate Scanner
                </>
              ) : (
                <>
                  <Power className="w-4 h-4 mr-2" />
                  Activate Scanner
                </>
              )}
            </Button>
          )}
        </div>
      </form>
      
      {isScannerActive && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <ScanLine className="w-4 h-4 inline mr-2" />
            Scanner is active. Point your barcode scanner at a product to scan automatically.
            {onDeactivateScanner && (
              <button
                onClick={onDeactivateScanner}
                className="ml-2 text-blue-600 hover:text-blue-800 underline"
              >
                Deactivate
              </button>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
