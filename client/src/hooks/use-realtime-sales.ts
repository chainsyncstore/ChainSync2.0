import { useQueryClient } from "@tanstack/react-query";
import { type Dispatch, useEffect, useRef } from "react";

type SaleCreatedEventPayload = {
  event?: string;
  orgId?: string;
  storeId?: string;
  delta?: unknown;
  saleId?: string;
  occurredAt?: string;
};

interface Options {
  orgId?: string | null;
  storeId?: string | null;
  enabled?: boolean;
  onSaleCreated?: Dispatch<SaleCreatedEventPayload>;
}

export function useRealtimeSales(options: Options) {
  const { orgId, storeId, enabled = true, onSaleCreated } = options;
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!orgId && !storeId) return;
    if (!navigator.onLine) return;

    let cancelled = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (cancelled) return;
      const base = window.location.origin.replace(/^http/, 'ws');
      const ws = new WebSocket(`${base}/ws/notifications`);
      wsRef.current = ws;

      ws.onopen = async () => {
        let token = '';
        try {
          const url = storeId
            ? `/api/auth/realtime-token?storeId=${encodeURIComponent(storeId)}`
            : '/api/auth/realtime-token';
          const r = await fetch(url, { credentials: 'include' });
          const j = await r.json();
          token = j.token || '';
        } catch (error) {
          console.warn('Failed to fetch realtime auth token', error);
        }

        try {
          ws.send(JSON.stringify({ type: 'auth', data: { token, storeId: storeId || '' } }));
          if (orgId) ws.send(JSON.stringify({ type: 'subscribe', data: { channel: `org:${orgId}` } }));
          if (storeId) ws.send(JSON.stringify({ type: 'subscribe', data: { channel: `store:${storeId}` } }));
        } catch (error) {
          console.warn('Failed to send realtime websocket auth', error);
        }
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'event' && msg.data?.event === 'sale:created') {
            const payload = msg.data as SaleCreatedEventPayload;
            if (!storeId || payload?.storeId === storeId) {
              try {
                onSaleCreated?.(payload);
              } catch (error) {
                console.warn('Failed to handle realtime sale callback', error);
              }
            }

            void queryClient.invalidateQueries({ queryKey: ["/api/analytics/overview"] });
            if (storeId && payload?.storeId === storeId) {
              void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "analytics/daily-sales"] });
              void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "analytics/profit-loss"] });
            }
          }
        } catch (error) {
          console.warn('Failed to process realtime sale message', error);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (cancelled) return;
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // Ignore
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const socket = wsRef.current;
      if (socket) {
        try {
          socket.close();
        } catch (error) {
          console.warn('Failed to close realtime websocket cleanly', error);
        }
      }
      wsRef.current = null;
    };
  }, [enabled, orgId, storeId, queryClient, onSaleCreated]);
}


