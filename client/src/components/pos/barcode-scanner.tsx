import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Search, ScanLine } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onOpenSearch: () => void;
  isLoading?: boolean;
}

export default function BarcodeScanner({ onScan, onOpenSearch, isLoading }: BarcodeScannerProps) {
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
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Product Scanner</h3>
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
        </div>
      </form>
    </div>
  );
}
