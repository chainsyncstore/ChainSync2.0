import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ScanBarcode,
  Package,
  TrendingUp,
  AlertTriangle,
  Upload,
  Building2,
  Settings,
  Link as LinkIcon,
} from "lucide-react";

interface SidebarProps {
  userRole: string;
  userName: string;
  userInitials: string;
  selectedStore: string;
  stores: Array<{ id: string; name: string }>;
  onStoreChange: (storeId: string) => void;
  alertCount: number;
}

const navigationItems = [
  { path: "/", icon: ScanBarcode, label: "Point of Sale" },
  { path: "/inventory", icon: Package, label: "Inventory" },
  { path: "/analytics", icon: TrendingUp, label: "Analytics" },
  { path: "/alerts", icon: AlertTriangle, label: "Alerts", hasAlert: true },
  { path: "/data-import", icon: Upload, label: "Data Import" },
  { path: "/multi-store", icon: Building2, label: "Multi-Store" },
  { path: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar({
  userRole,
  userName,
  userInitials,
  selectedStore,
  stores,
  onStoreChange,
  alertCount,
}: SidebarProps) {
  const [location] = useLocation();

  return (
    <div className="w-64 bg-white shadow-lg border-r border-slate-200 flex flex-col">
      {/* Logo and Brand */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <LinkIcon className="text-white text-xl" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">ChainSync</h1>
            <p className="text-sm text-slate-500">POS & Analytics</p>
          </div>
        </div>
      </div>

      {/* User Role Indicator */}
      <div className="px-6 py-4 bg-blue-50 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-medium">{userInitials}</span>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">{userName}</p>
            <p className="text-xs text-primary font-medium capitalize">{userRole}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path;
          const showAlert = item.hasAlert && alertCount > 0;

          return (
            <Link key={item.path} href={item.path}>
              <a
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors",
                  isActive
                    ? "bg-primary text-white"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
                {showAlert && (
                  <Badge variant="destructive" className="ml-auto text-xs">
                    {alertCount}
                  </Badge>
                )}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Store Selector */}
      <div className="p-4 border-t border-slate-200">
        <select
          value={selectedStore}
          onChange={(e) => onStoreChange(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
