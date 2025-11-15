import { Plus, Search, ScanLine, Power, PowerOff, RefreshCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ScannerProfile } from "@/lib/peripherals";

// eslint-disable-next-line no-unused-vars
type OnScanHandler = (barcode: string) => void;
// eslint-disable-next-line no-unused-vars
type SelectProfileHandler = (profileId: string) => void;

async function getCachedBarcode(barcode: string): Promise<any | null> {
  try {
    const cache = await caches.open('chainsync-offline-v1.0.1');
    const key = `/api/products/barcode/${barcode}`;
    const res = await cache.match(key);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

interface BarcodeScannerProps {
  onScan: OnScanHandler;
  onOpenSearch: () => void;
  isLoading?: boolean;
  isScannerActive?: boolean;
  onActivateScanner?: () => void;
  onDeactivateScanner?: () => void;
  isScanning?: boolean;
  inputBuffer?: string;
  profiles?: ScannerProfile[];
  selectedProfile?: ScannerProfile;
  onSelectProfile?: SelectProfileHandler;
  onRefreshProfiles?: () => Promise<void>;
}

export default function BarcodeScanner({ 
  onScan, 
  onOpenSearch, 
  isLoading,
  isScannerActive = false,
  onActivateScanner,
  onDeactivateScanner,
  isScanning = false,
  inputBuffer = "",
  profiles = [],
  selectedProfile,
  onSelectProfile,
  onRefreshProfiles,
}: BarcodeScannerProps) {
  const [barcodeInput, setBarcodeInput] = useState("");

  const profileDisplay = useMemo(() => {
    if (!selectedProfile) return "Auto-detect";
    const label = selectedProfile.label || "Detected";
    const connection = selectedProfile.connection?.replace(/-/g, " ") || "";
    return connection ? `${label} • ${connection}` : label;
  }, [selectedProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (barcodeInput.trim()) {
      try {
        onScan(barcodeInput.trim());
      } catch (err) {
        console.error('Barcode scan submission failed', err);
        const p = await getCachedBarcode(barcodeInput.trim());
        if (p) {
          // Parent will fetch product via API normally; here we just preserve UX feedback
        }
      }
      setBarcodeInput("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      void handleSubmit(e);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800">Product Scanner</h3>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {onSelectProfile && (
            <div className="flex items-center gap-2">
              <Select value={selectedProfile?.id} onValueChange={onSelectProfile}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select scanner" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.label || profile.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {onRefreshProfiles && (
                <Button size="icon" variant="ghost" onClick={() => { void onRefreshProfiles(); }} title="Refresh devices">
                  <RefreshCcw className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
          <div className="flex items-center space-x-2">
            {isScannerActive && (
              <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                <ScanLine className="w-3 h-3 mr-1" />
                Scanner Active
              </Badge>
            )}
            {isScanning && inputBuffer && (
              <Badge variant="outline" className="font-mono text-xs">
                {inputBuffer}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {onSelectProfile && selectedProfile && (
        <div className="mb-3 text-xs text-slate-500 flex items-center justify-between">
          <span>Profile: {profileDisplay}</span>
          <span>{selectedProfile.vendorHint || "Generic"}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
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
              className="text-lg font-mono pr-12 h-12 sm:h-10"
              autoFocus
              disabled={isLoading}
            />
            <ScanLine className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>
        <div className="flex flex-col space-y-2 sm:space-y-2">
          <Button
            type="submit"
            disabled={!barcodeInput.trim() || isLoading}
            className="px-4 sm:px-6 py-3 font-medium min-h-[48px] sm:min-h-[40px]"
          >
            <Plus className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Add Item</span>
            <span className="sm:hidden">Add</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onOpenSearch}
            className="px-4 sm:px-6 py-3 font-medium min-h-[48px] sm:min-h-[40px]"
          >
            <Search className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Search</span>
            <span className="sm:hidden">Search</span>
          </Button>
          {onActivateScanner && onDeactivateScanner && (
            <Button
              type="button"
              variant={isScannerActive ? "destructive" : "default"}
              onClick={isScannerActive ? onDeactivateScanner : onActivateScanner}
              className="px-4 sm:px-6 py-3 font-medium min-h-[48px] sm:min-h-[40px]"
            >
              {isScannerActive ? (
                <>
                  <PowerOff className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Deactivate Scanner</span>
                  <span className="sm:hidden">Deactivate</span>
                </>
              ) : (
                <>
                  <Power className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Activate Scanner</span>
                  <span className="sm:hidden">Activate</span>
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
