export type PingSocketHandlers = {
  onOpen?: () => void;
  onClose?: () => void;
  onMessage?: (data: unknown) => void;
};

const WS_PING_URL = import.meta.env.VITE_WS_PING as string;

export function createPingSocket(handlers: PingSocketHandlers = {}) {
  const socket = new WebSocket(WS_PING_URL);

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
