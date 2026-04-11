import { useEffect } from "react";
import { createPingSocket } from "../websocket/pingSocket";

export function useRealtimePing() {
  useEffect(() => {
    const socket = createPingSocket();
    return () => socket.close();
  }, []);
}
