import { formatDateTime } from "@/lib/pos-utils";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TopBarProps {
  title: string;
  subtitle: string;
  currentDateTime: Date;
  onLogout: () => void;
}

export default function TopBar({ title, subtitle, currentDateTime, onLogout }: TopBarProps) {
  return (
    <header className="bg-white shadow-sm border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
          <p className="text-slate-600">{subtitle}</p>
        </div>
        <div className="flex items-center space-x-4">
          {/* Real-time Status */}
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-slate-600">Live Sync</span>
          </div>
          {/* Current Date/Time */}
          <div className="text-sm text-slate-600">
            <span>{formatDateTime(currentDateTime)}</span>
          </div>
          {/* Logout Button */}
          <Button
            variant="ghost"
            onClick={onLogout}
            className="text-slate-600 hover:text-slate-800 hover:bg-slate-100"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
