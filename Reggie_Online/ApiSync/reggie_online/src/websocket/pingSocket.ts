export type PingSocketHandlers = {
  onOpen?: () => void;
  onClose?: () => void;
  onMessage?: (data: unknown) => void;
};

const WS_PING_URL = import.meta.env.VITE_WS_PING as string | undefined;

export function createPingSocket(handlers: PingSocketHandlers = {}) {
  const url = WS_PING_URL?.trim();
  if (!url) {
    throw new Error("VITE_WS_PING is missing or empty.");
  }
  const socket = new WebSocket(url);

  socket.onopen = () => handlers.onOpen?.();
  socket.onclose = () => handlers.onClose?.();
  socket.onmessage = (event) => {
    try {
      handlers.onMessage?.(JSON.parse(event.data));
    } catch {
      handlers.onMessage?.(event.data);
    }
  };

  return socket;
}

export type ReconnectingPingSocketOptions = {
  /** First reconnect delay (default 1000ms). */
  initialDelayMs?: number;
  /** Cap backoff (default 30000ms). */
  maxDelayMs?: number;
};

/**
 * Keeps a ping WebSocket alive: reconnects with exponential backoff after close/error
 * and reconnects soon after the browser regains network (`online` event).
 * Returns a disconnect function for useEffect cleanup.
 */
export function createReconnectingPingSocket(
  handlers: PingSocketHandlers = {},
  options: ReconnectingPingSocketOptions = {}
): () => void {
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30000;

  let aborted = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let attempt = 0;

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const nextBackoffMs = () => {
    const exp = Math.min(maxDelayMs, initialDelayMs * 2 ** attempt);
    const jitter = exp * (0.85 + Math.random() * 0.3);
    attempt += 1;
    return Math.min(maxDelayMs, Math.round(jitter));
  };

  const scheduleReconnect = () => {
    if (aborted) return;
    clearReconnectTimer();
    const delay = nextBackoffMs();
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (aborted) return;
    const url = WS_PING_URL?.trim();
    if (!url) {
      if (import.meta.env.DEV) {
        console.warn("[pingSocket] VITE_WS_PING is not set; reconnecting ping WebSocket is disabled.");
      }
      return;
    }

    if (socket !== null) {
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    socket = ws;

    ws.onopen = () => {
      attempt = 0;
      handlers.onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        handlers.onMessage?.(JSON.parse(event.data));
      } catch {
        handlers.onMessage?.(event.data);
      }
    };

    ws.onerror = () => {
      // Browser will usually emit onclose after onerror; reconnect is scheduled from onclose.
    };

    ws.onclose = () => {
      socket = null;
      handlers.onClose?.();
      if (!aborted) {
        scheduleReconnect();
      }
    };
  };

  const onBrowserOnline = () => {
    if (aborted) return;
    clearReconnectTimer();
    attempt = 0;
    if (socket !== null) {
      if (socket.readyState === WebSocket.OPEN) {
        return;
      }
      socket.close();
      socket = null;
    }
    connect();
  };

  window.addEventListener("online", onBrowserOnline);
  connect();

  return () => {
    aborted = true;
    clearReconnectTimer();
    window.removeEventListener("online", onBrowserOnline);
    if (socket !== null) {
      const ws = socket;
      socket = null;
      ws.close();
    }
  };
}
