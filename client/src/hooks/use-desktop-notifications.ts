import { useCallback, useMemo, useState } from "react";

const DEFAULT_ICON_URL = "/branding/chainsync-logo-solid.svg";

export type DesktopNotificationPermission = NotificationPermission | "unsupported";

interface DesktopNotificationOptions {
  iconUrl?: string;
  tagPrefix?: string;
  disabled?: boolean;
}

interface NotificationPayload {
  title: string;
  body: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
}

const getInitialPermission = (): DesktopNotificationPermission => {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
};

export function useDesktopNotifications(options: DesktopNotificationOptions = {}) {
  const { iconUrl = DEFAULT_ICON_URL, tagPrefix = "chainsync", disabled = false } = options;
  const [permission, setPermission] = useState<DesktopNotificationPermission>(() => getInitialPermission());
  const supportsNotifications = permission !== "unsupported";

  const requestPermission = useCallback(async () => {
    if (!supportsNotifications || disabled) {
      return permission;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (error) {
      console.warn("Desktop notification permission request failed", error);
      const current = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
      setPermission(current);
      return current;
    }
  }, [supportsNotifications, disabled, permission]);

  const canNotify = useMemo(() => supportsNotifications && permission === "granted" && !disabled, [supportsNotifications, permission, disabled]);

  const showNotification = useCallback(
    (payload: NotificationPayload) => {
      if (!canNotify) {
        return false;
      }

      try {
        const tag = payload.tag ?? `${tagPrefix}-${Date.now()}`;
        new Notification(payload.title, {
          body: payload.body,
          icon: iconUrl,
          badge: iconUrl,
          requireInteraction: payload.requireInteraction ?? false,
          data: payload.data,
          tag,
        });
        return true;
      } catch (error) {
        console.warn("Failed to show desktop notification", error);
        return false;
      }
    },
    [canNotify, iconUrl, tagPrefix],
  );

  const sendPreviewNotification = useCallback(() => {
    return showNotification({
      title: "ChainSync Alert",
      body: "Desktop notifications are active on this device.",
      tag: `${tagPrefix}-preview`,
      data: { preview: true },
    });
  }, [showNotification, tagPrefix]);

  return {
    permission,
    supportsNotifications,
    canNotify,
    requestPermission,
    showNotification,
    sendPreviewNotification,
  } as const;
}
