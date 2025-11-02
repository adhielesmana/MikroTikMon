import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";

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

          default:
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

  const handleNotification = (notification: NotificationData) => {
    console.log("[WebSocket] Displaying notification:", notification);

    // Determine toast variant based on severity
    let variant: "default" | "destructive" = "default";
    if (notification.severity === "critical") {
      variant = "destructive";
    }

    toast({
      title: notification.title,
      description: `${notification.routerName} - ${notification.portName}: ${notification.message}`,
      variant,
      duration: 10000, // Show for 10 seconds for critical alerts
    });

    // Play notification sound (optional)
    try {
      const audio = new Audio("/notification.mp3");
      audio.volume = 0.3;
      audio.play().catch(() => {
        // Ignore errors if audio fails to play
      });
    } catch (error) {
      // Ignore audio errors
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
