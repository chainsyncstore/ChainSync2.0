import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface Options {
  orgId?: string | null;
  storeId?: string | null;
}

export function useRealtimeSales(options: Options) {
  const { orgId, storeId } = options;
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const base = window.location.origin.replace(/^http/, 'ws');
    const ws = new WebSocket(`${base}/ws/notifications`);
    wsRef.current = ws;

    ws.onopen = async () => {
      // Obtain a short-lived JWT for websocket auth
      let token = '';
      try {
        const r = await fetch('/api/auth/realtime-token', { credentials: 'include' });
        const j = await r.json();
        token = j.token || '';
      } catch {}
      ws.send(JSON.stringify({ type: 'auth', data: { token, storeId } }));
      if (orgId) ws.send(JSON.stringify({ type: 'subscribe', data: { channel: `org:${orgId}` } }));
      if (storeId) ws.send(JSON.stringify({ type: 'subscribe', data: { channel: `store:${storeId}` } }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'event' && msg.data?.event === 'sale:created') {
          // Invalidate analytics queries that show KPIs
          queryClient.invalidateQueries({ queryKey: ["/api/analytics/overview"] });
          if (storeId) {
            queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "analytics/daily-sales"] });
            queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "analytics/profit-loss"] });
          }
        }
      } catch {}
    };

    return () => {
      try { ws.close(); } catch {}
      wsRef.current = null;
    };
  }, [orgId, storeId, queryClient]);
}


