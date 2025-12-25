import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NotificationChannels, NotificationScope } from "@/types/notifications";
import { defaultNotificationSettings, normalizeNotificationSettingsPayload } from "@/types/notifications";
import { useAuth } from "./use-auth";
import { useDesktopNotifications } from "./use-desktop-notifications";

interface SocketNotificationPayload {
  id?: string;
  type?: string;
  title?: string;
  message?: string;
  storeId?: string | null;
  userId?: string | null;
  priority?: string;
  data?: Record<string, unknown> | null;
}

const STORE_PERFORMANCE_EVENT = "store_performance";
const INVENTORY_EVENTS = new Set(["inventory_alert", "low_stock"]);
const SALES_EVENT = "sales_update";
const MONITORING_EVENT = "monitoring_alert";
const PAYMENT_EVENT = "payment_alert";
const AI_EVENT = "ai_insight";

const WS_PATH = "/ws/notifications";

export function useNotificationBridge() {
  const { user } = useAuth();
  const isEligible = Boolean(user && (user.role === "admin" || user.role === "manager"));
  const orgId = user?.orgId ?? null;
  const userStoreId = user?.storeId ?? null;

  const { canNotify, showNotification } = useDesktopNotifications({ disabled: !isEligible });

  const [channelPrefs, setChannelPrefs] = useState<NotificationChannels>(defaultNotificationSettings);
  const [notificationScope, setNotificationScope] = useState<NotificationScope | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const subscribedStoreChannelRef = useRef<string | null>(null);
  const pendingStoreChannelRef = useRef<string | null>(null);

  const scopedStoreId = notificationScope?.type === "store" ? notificationScope.storeId : null;

  const desiredStoreChannel = useMemo(() => {
    if (scopedStoreId) {
      return `store:${scopedStoreId}`;
    }
    if (user?.role === "manager" && userStoreId) {
      return `store:${userStoreId}`;
    }
    return null;
  }, [scopedStoreId, user?.role, userStoreId]);

  const loadSettings = useCallback(async () => {
    if (!isEligible) {
      setChannelPrefs(defaultNotificationSettings);
      setNotificationScope(null);
      return;
    }
    try {
      const response = await fetch("/api/settings", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load notification settings");
      const data = await response.json();
      if (data?.notifications) {
        setChannelPrefs(normalizeNotificationSettingsPayload(data.notifications));
      }
      if (data?.notificationScope) {
        setNotificationScope(data.notificationScope as NotificationScope);
      }
    } catch (error) {
      console.warn("Failed to load notification preferences", error);
    }
  }, [isEligible]);

  useEffect(() => {
    if (!isEligible) return;
    void loadSettings();
  }, [isEligible, loadSettings]);

  useEffect(() => {
    const handler = () => { void loadSettings(); };
    window.addEventListener("chainsync:notifications-updated", handler);
    return () => {
      window.removeEventListener("chainsync:notifications-updated", handler);
    };
  }, [loadSettings]);

  const matchesScope = useCallback((storeId?: string | null) => {
    if (scopedStoreId) {
      return storeId === scopedStoreId;
    }
    if (user?.role === "manager" && userStoreId) {
      if (!storeId) {
        return false;
      }
      return storeId === userStoreId;
    }
    return true;
  }, [scopedStoreId, user?.role, userStoreId]);

  const shouldNotifyForEvent = useCallback((eventType?: string) => {
    if (!eventType) return false;
    if (eventType === MONITORING_EVENT) {
      return Boolean(channelPrefs.systemHealth.email);
    }
    if (eventType === STORE_PERFORMANCE_EVENT || eventType === SALES_EVENT) {
      return Boolean(channelPrefs.storePerformance.inApp);
    }
    if (INVENTORY_EVENTS.has(eventType)) {
      return Boolean(channelPrefs.inventoryRisks.inApp);
    }
    if (eventType === PAYMENT_EVENT) {
      return Boolean(channelPrefs.paymentAlerts.inApp);
    }
    if (eventType === AI_EVENT) {
      return Boolean(channelPrefs.aiInsights.inApp);
    }
    return false;
  }, [channelPrefs.systemHealth.email, channelPrefs.storePerformance.inApp, channelPrefs.inventoryRisks.inApp, channelPrefs.paymentAlerts.inApp, channelPrefs.aiInsights.inApp]);

  const handleNotificationPayload = useCallback((payload: SocketNotificationPayload) => {
    if (!canNotify) return;
    if (!shouldNotifyForEvent(payload.type)) return;
    if (!matchesScope(payload.storeId ?? null)) return;

    const title = payload.title || "ChainSync alert";
    const body = payload.message || "You have a new ChainSync notification";
    const data = payload.data && typeof payload.data === "object" ? payload.data : {};
    const tag = payload.id ? `chainsync-${payload.id}` : undefined;

    showNotification({
      title,
      body,
      tag,
      data: {
        ...data,
        type: payload.type,
        storeId: payload.storeId ?? null,
        priority: payload.priority ?? null,
      },
    });
  }, [canNotify, matchesScope, shouldNotifyForEvent, showNotification]);

  useEffect(() => {
    if (!isEligible) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      try {
        const base = window.location.origin.replace(/^http/, "ws");
        const socket = new WebSocket(`${base}${WS_PATH}`);
        wsRef.current = socket;

        socket.onopen = async () => {
          // Guard: If hook was cleaned up during connection handshake, abort
          if (cancelled) return;

          let token = "";
          try {
            const res = await fetch("/api/auth/realtime-token", { credentials: "include" });
            const json = await res.json();
            token = json?.token || "";
          } catch (error) {
            console.warn("Failed to fetch realtime token", error);
          }

          // Guard: Check if socket was closed during async token fetch
          if (cancelled || socket.readyState !== WebSocket.OPEN) {
            return;
          }

          socket.send(JSON.stringify({ type: "auth", data: { token, storeId: userStoreId || "" } }));
          if (orgId && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "subscribe", data: { channel: `org:${orgId}` } }));
          }

          const initialStoreChannel = pendingStoreChannelRef.current;
          if (initialStoreChannel && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "subscribe", data: { channel: initialStoreChannel } }));
            subscribedStoreChannelRef.current = initialStoreChannel;
          }
        };

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message?.type === "notification" && message.data) {
              handleNotificationPayload(message.data as SocketNotificationPayload);
            }
          } catch (error) {
            console.warn("Failed to process notification message", error);
          }
        };

        socket.onclose = () => {
          wsRef.current = null;
          if (cancelled) return;
          if (reconnectTimerRef.current) {
            window.clearTimeout(reconnectTimerRef.current);
          }
          reconnectTimerRef.current = window.setTimeout(connect, 5000);
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch (error) {
        console.warn("WebSocket connection error", error);
        if (reconnectTimerRef.current) {
          window.clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = window.setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const socket = wsRef.current;
      if (socket) {
        socket.close();
        wsRef.current = null;
      }
    };
  }, [isEligible, orgId, userStoreId, handleNotificationPayload]);

  useEffect(() => {
    pendingStoreChannelRef.current = desiredStoreChannel;
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (subscribedStoreChannelRef.current === desiredStoreChannel) {
      return;
    }

    if (subscribedStoreChannelRef.current) {
      socket.send(JSON.stringify({ type: "unsubscribe", data: { channel: subscribedStoreChannelRef.current } }));
      subscribedStoreChannelRef.current = null;
    }

    if (desiredStoreChannel) {
      socket.send(JSON.stringify({ type: "subscribe", data: { channel: desiredStoreChannel } }));
      subscribedStoreChannelRef.current = desiredStoreChannel;
    }
  }, [desiredStoreChannel]);
}
