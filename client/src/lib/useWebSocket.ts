import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { playAlertSound } from "./alertSound";

interface WebSocketMessage {
  type: string;
  data?: any;
}

interface NotificationData {
  id: string;
  title: string;
  message: string;
  severity: string;
  routerName: string;
  portName: string;
  portComment?: string | null;
}

export function useWebSocket(userId: string | null) {
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const userIdRef = useRef<string | null>(userId);
  const shouldReconnectRef = useRef<boolean>(true);
  const isMountedRef = useRef<boolean>(true);

  // Update userId ref when it changes
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const connect = () => {
    const currentUserId = userIdRef.current;
    if (!currentUserId) return;

    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log("[WebSocket] Connecting to", wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    // Expose globally for RouterDetails to use the same connection
    (window as any).__appWebSocket = ws;

    ws.onopen = () => {
      console.log("[WebSocket] Connected");
      if (isMountedRef.current) {
        setIsConnected(true);
      }
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        console.log("[WebSocket] Message received:", message);

        switch (message.type) {
          case "auth_required":
            // Authenticate with current user ID from ref
            const currentUserId = userIdRef.current;
            console.log("[WebSocket] Authenticating with userId:", currentUserId);
            if (currentUserId) {
              ws.send(JSON.stringify({ type: "auth", userId: currentUserId }));
            }
            break;

          case "auth_success":
            console.log("[WebSocket] Authentication successful");
            break;

          case "notification":
            // Display notification as toast
            const notification = message.data as NotificationData;
            handleNotification(notification);
            break;

          case "realtime_traffic":
          case "realtime_polling_started":
          case "realtime_polling_paused":
          case "realtime_polling_restarted":
          case "error":
            // These messages are handled by RouterDetails page's own WebSocket listener
            // Silently ignore them here to avoid console spam
            break;

          default:
            // Only log truly unknown message types
            console.log("[WebSocket] Unknown message type:", message.type);
        }
      } catch (error) {
        console.error("[WebSocket] Error parsing message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
      if (isMountedRef.current) {
        setIsConnected(false);
      }
    };

    ws.onclose = () => {
      console.log("[WebSocket] Disconnected");
      if (isMountedRef.current) {
        setIsConnected(false);
      }
      wsRef.current = null;

      // Only reconnect if we should (not if manually disconnected)
      if (shouldReconnectRef.current && userIdRef.current && isMountedRef.current) {
        console.log("[WebSocket] Reconnecting in 5 seconds...");
        reconnectTimeoutRef.current = setTimeout(() => {
          if (shouldReconnectRef.current && isMountedRef.current) {
            connect();
          }
        }, 5000);
      } else {
        console.log("[WebSocket] Not reconnecting (manual disconnect or unmounted)");
      }
    };
  };

  const handleNotification = async (notification: NotificationData) => {
    console.log("[WebSocket] Displaying notification:", notification);

    // Build port display with comment if available
    let portDisplay = notification.portName;
    if (notification.portComment) {
      portDisplay = `${notification.portName} (${notification.portComment})`;
    }

    toast({
      title: notification.title,
      description: `${notification.routerName} - ${portDisplay}: ${notification.message}`,
      variant: "destructive", // Always use red color for alerts
      duration: 10000, // Show for 10 seconds for critical alerts
    });

    // Play 3-second alert sound if enabled in settings
    const soundEnabled = localStorage.getItem("alertSoundEnabled");
    if (soundEnabled === null || soundEnabled === "true") {
      // Default to enabled if not set
      try {
        await playAlertSound();
      } catch (error) {
        console.error("[WebSocket] Failed to play alert sound:", error);
      }
    }
  };

  const disconnect = () => {
    console.log("[WebSocket] Manually disconnecting");
    shouldReconnectRef.current = false;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (isMountedRef.current) {
      setIsConnected(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    shouldReconnectRef.current = true;
    
    if (userId) {
      connect();
    } else {
      // Disconnect if userId becomes null (logout)
      disconnect();
    }

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [userId]);

  return { isConnected, disconnect };
}
