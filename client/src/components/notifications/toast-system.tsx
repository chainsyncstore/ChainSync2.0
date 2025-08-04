import { X, AlertTriangle, CheckCircle, Info, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NotificationData } from "@/types/pos";

interface ToastSystemProps {
  notifications: NotificationData[];
  onRemoveNotification: (id: string) => void;
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: "border-green-500 bg-green-50 text-green-800",
  error: "border-red-500 bg-red-50 text-red-800",
  warning: "border-yellow-500 bg-yellow-50 text-yellow-800",
  info: "border-blue-500 bg-blue-50 text-blue-800",
};

export default function ToastSystem({ notifications, onRemoveNotification }: ToastSystemProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-3">
      {notifications.map((notification) => {
        const Icon = iconMap[notification.type];
        
        return (
          <div
            key={notification.id}
            className={cn(
              "bg-white border-l-4 shadow-lg rounded-lg p-4 max-w-sm animate-in slide-in-from-right",
              colorMap[notification.type]
            )}
          >
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium">{notification.title}</p>
                <p className="text-sm mt-1">{notification.message}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="ml-2 h-6 w-6 p-0 text-current hover:bg-current/10"
                onClick={() => onRemoveNotification(notification.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
