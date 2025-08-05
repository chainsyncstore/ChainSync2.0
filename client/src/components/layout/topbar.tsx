import { formatDateTime } from "@/lib/pos-utils";
import { LogOut, Menu, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MobileMenu from "@/components/mobile-menu";
import { useScannerContext } from "@/hooks/use-barcode-scanner";

interface TopBarProps {
  title: string;
  subtitle: string;
  currentDateTime: Date;
  onLogout: () => void;
  // Mobile menu props
  userRole?: string;
  userName?: string;
  userInitials?: string;
  selectedStore?: string;
  stores?: Array<{ id: string; name: string }>;
  onStoreChange?: (storeId: string) => void;
  alertCount?: number;
}

export default function TopBar({ 
  title, 
  subtitle, 
  currentDateTime, 
  onLogout,
  userRole,
  userName,
  userInitials,
  selectedStore,
  stores,
  onStoreChange,
  alertCount
}: TopBarProps) {
  const { isScannerActive, isScanning, inputBuffer } = useScannerContext();

  return (
    <header className="bg-white shadow-sm border-b border-slate-200 px-2 sm:px-4 lg:px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Mobile menu */}
          {userRole && userName && userInitials && selectedStore && stores && onStoreChange && (
            <MobileMenu
              userRole={userRole}
              userName={userName}
              userInitials={userInitials}
              selectedStore={selectedStore}
              stores={stores}
              onStoreChange={onStoreChange}
              alertCount={alertCount || 0}
            />
          )}
          <div>
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-800">{title}</h2>
            <p className="text-sm sm:text-base text-slate-600 hidden sm:block">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Scanner Status */}
          {isScannerActive && (
            <div className="flex items-center space-x-2">
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                <ScanLine className="w-3 h-3 mr-1" />
                Scanner Active
              </Badge>
              {isScanning && inputBuffer && (
                <Badge variant="outline" className="font-mono text-xs">
                  {inputBuffer}
                </Badge>
              )}
            </div>
          )}
          {/* Real-time Status */}
          <div className="hidden sm:flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-slate-600">Live Sync</span>
          </div>
          {/* Current Date/Time */}
          <div className="text-xs sm:text-sm text-slate-600 hidden md:block">
            <span>{formatDateTime(currentDateTime)}</span>
          </div>
          {/* Logout Button */}
          <Button
            variant="ghost"
            onClick={onLogout}
            size="sm"
            className="text-slate-600 hover:text-slate-800 hover:bg-slate-100"
          >
            <LogOut className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
