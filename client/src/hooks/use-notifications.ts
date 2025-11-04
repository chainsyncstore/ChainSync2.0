import { useState, useCallback } from "react";
import type { NotificationData } from "@/types/pos";

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(current => current.filter(notification => notification.id !== id));
  }, []);

  const addNotification = useCallback((notification: Omit<NotificationData, "id" | "timestamp">) => {
    const newNotification: NotificationData = {
      ...notification,
      id: `notification-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date(),
    };

    setNotifications(current => [newNotification, ...current]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeNotification(newNotification.id);
    }, 5000);

    return newNotification.id;
  }, [removeNotification]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    addNotification,
    removeNotification,
    clearNotifications,
  };
}
