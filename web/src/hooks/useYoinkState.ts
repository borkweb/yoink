import { useState, useEffect, useRef, useCallback } from 'react';
import type { YoinkState } from '../../../src/engine/types';

interface UseYoinkStateResult {
  state: YoinkState | null;
  connected: boolean;
  dispatch: (action: string, params?: Record<string, unknown>) => void;
}

export function useYoinkState(url?: string): UseYoinkStateResult {
  const [state, setState] = useState<YoinkState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);

  const wsUrl = url ?? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (cancelled) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        backoffRef.current = 1000;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'state:full' || msg.type === 'state:changed') {
            setState(msg.data);
          } else if (msg.type === 'error') {
            console.error('[yoink]', msg.message);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!cancelled) {
          reconnectTimer = setTimeout(() => {
            backoffRef.current = Math.min(backoffRef.current * 2, 10000);
            connect();
          }, backoffRef.current);
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror, triggering reconnect
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [wsUrl]);

  const dispatch = useCallback((action: string, params?: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, ...params }));
    }
  }, []);

  return { state, connected, dispatch };
}
