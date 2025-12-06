import { ArrowRightLeft, LogOut, Menu, RefreshCw, ScanLine, Settings } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useOfflineSyncIndicator } from "@/hooks/use-offline-sync-indicator";

interface CashierLayoutProps {
  children: React.ReactNode;
}

export default function CashierLayout({ children }: CashierLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { queuedCount, handleSyncNow } = useOfflineSyncIndicator();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const onSyncNow = async () => {
    setIsSyncing(true);
    try {
      await handleSyncNow?.();
    } catch {
      // Sync error handled by hook
    } finally {
      setIsSyncing(false);
    }
  };

  const navItems = [
    { href: "/pos", label: "Point of Sale", icon: ScanLine },
    { href: "/returns", label: "Returns & Swaps", icon: ArrowRightLeft },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="w-10 h-10">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="flex flex-col h-full">
                <div className="p-4 border-b bg-primary text-white">
                  <h2 className="font-bold text-lg">ChainSync POS</h2>
                  <p className="text-sm opacity-80">{user?.firstName || user?.username || "Cashier"}</p>
                </div>
                <nav className="flex-1 p-2 space-y-1">
                  {navItems.map((item) => {
                    const isActive = location === item.href || (item.href === "/pos" && location === "/");
                    return (
                      <Link key={item.href} href={item.href} onClick={() => setIsMenuOpen(false)}>
                        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${
                          isActive ? "bg-primary/10 text-primary" : "hover:bg-slate-100"
                        }`}>
                          <item.icon className="w-5 h-5" />
                          <span>{item.label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </nav>
                {/* Sync Status */}
                <div className="p-3 border-t space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-green-600">Online</span>
                    {queuedCount > 0 && <span className="text-amber-600">{queuedCount} pending</span>}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={onSyncNow}
                    disabled={isSyncing}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Sync Now
                  </Button>
                </div>
                {/* Logout */}
                <div className="p-3 border-t">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                  >
                    <LogOut className="w-5 h-5 mr-3" />
                    Logout
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <h1 className="font-semibold text-lg text-slate-800">
            {location === "/returns" ? "Returns & Swaps" : location === "/settings" ? "Settings" : "Point of Sale"}
          </h1>
        </div>
      </header>

      {/* Page Content */}
      <main className="p-4">
        {children}
      </main>
    </div>
  );
}
