import { useEffect } from "react";
import { createReconnectingPingSocket } from "../websocket/pingSocket";

export function useRealtimePing() {
  useEffect(() => {
    return createReconnectingPingSocket();
  }, []);
}
