import cron from "node-cron";
import { storage } from "./storage";
import { MikrotikClient } from "./mikrotik";
import { emailService } from "./emailService";
import { WebSocket } from "ws";

let wss: any = null;
let userConnections: Map<string, Set<WebSocket>> | null = null;

export function setWebSocketServer(server: any, connections: Map<string, Set<WebSocket>>) {
  wss = server;
  userConnections = connections;
}

export function broadcastNotification(userId: string, notification: any) {
  if (!userConnections) return;

  // Send notification only to the specific user's connections
  const connections = userConnections.get(userId);
  if (!connections) return;

  connections.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "notification",
        data: notification,
      }));
    }
  });
}

async function pollRouterTraffic() {
  try {
    console.log("[Scheduler] Polling router traffic data...");

    // Get all enabled monitored ports with their routers
    const monitoredPorts = await storage.getAllEnabledPorts();

    // Group ports by router to minimize connections
    const portsByRouter = new Map<string, typeof monitoredPorts>();
    for (const port of monitoredPorts) {
      const existing = portsByRouter.get(port.router.id) || [];
      existing.push(port);
      portsByRouter.set(port.router.id, existing);
    }

    for (const [routerId, ports] of portsByRouter) {
      const router = ports[0].router;

      try {
        // Get router credentials
        const credentials = await storage.getRouterCredentials(routerId);
        if (!credentials) {
          console.error(`[Scheduler] No credentials for router ${routerId}`);
          continue;
        }

        // Connect to MikroTik and get stats
        const client = new MikrotikClient({
          host: router.ipAddress,
          port: router.port,
          user: credentials.username,
          password: credentials.password,
          restEnabled: router.restEnabled || false,
          restPort: router.restPort || 443,
          snmpEnabled: router.snmpEnabled || false,
          snmpCommunity: router.snmpCommunity || "public",
          snmpVersion: router.snmpVersion || "2c",
          snmpPort: router.snmpPort || 161,
        });

        // Check basic network reachability
        console.log(`[Scheduler] Checking reachability for router ${router.name} (${router.ipAddress})...`);
        const isReachable = await client.checkReachability();
        console.log(`[Scheduler] Reachability result for ${router.name}: ${isReachable}`);
        await storage.updateRouterReachability(routerId, isReachable);

        const stats = await client.getInterfaceStats();

        // Update router connection status
        await storage.updateRouterConnection(routerId, true);

        // Check if hostname was extracted from SSL certificate (when connecting via IP)
        const extractedHostname = client.getExtractedHostname();
        if (extractedHostname && /^\d+\.\d+\.\d+\.\d+$/.test(router.ipAddress)) {
          console.log(`[Scheduler] Updating router ${router.name} IP from ${router.ipAddress} to hostname ${extractedHostname}`);
          await storage.updateRouterHostname(routerId, extractedHostname);
        }

        // Process each monitored port
        for (const port of ports) {
          const stat = stats.find(s => s.name === port.portName);
          if (!stat) {
            console.warn(`[Scheduler] Port ${port.portName} not found in router stats`);
            continue;
          }

          // Store traffic data
          await storage.insertTrafficData({
            routerId: port.routerId,
            portId: port.id,
            portName: port.portName,
            rxBytesPerSecond: stat.rxBytesPerSecond,
            txBytesPerSecond: stat.txBytesPerSecond,
            totalBytesPerSecond: stat.totalBytesPerSecond,
          });

          // Check threshold and create alert if necessary
          const isBelowThreshold = stat.totalBytesPerSecond < port.minThresholdBps;
          
          // Check if there's already a recent unacknowledged alert for this port
          const latestAlert = await storage.getLatestAlertForPort(port.id);
          const hasActiveAlert = latestAlert && !latestAlert.acknowledged;

          // Only create a new alert if:
          // 1. Traffic is below threshold AND there's no active alert (first breach)
          // 2. Status changed (was OK, now breached - but this is covered by condition 1)
          if (isBelowThreshold && !hasActiveAlert) {
            // Determine severity based on how far below threshold
            const percentBelow = ((port.minThresholdBps - stat.totalBytesPerSecond) / port.minThresholdBps) * 100;
            let severity = "warning";
            if (percentBelow > 50) severity = "critical";
            else if (percentBelow > 25) severity = "warning";
            else severity = "info";

            // Create alert
            const alert = await storage.createAlert({
              routerId: port.routerId,
              portId: port.id,
              portName: port.portName,
              userId: router.userId,
              severity,
              message: `Traffic on ${port.portName} is below threshold: ${(stat.totalBytesPerSecond / 1024).toFixed(2)} KB/s < ${(port.minThresholdBps / 1024).toFixed(2)} KB/s`,
              currentTrafficBps: stat.totalBytesPerSecond,
              thresholdBps: port.minThresholdBps,
            });

            // Create notification
            const notification = await storage.createNotification({
              userId: router.userId,
              alertId: alert.id,
              type: "popup",
              title: `Traffic Alert: ${router.name}`,
              message: alert.message,
            });

            // Broadcast real-time notification via WebSocket
            broadcastNotification(router.userId, {
              id: notification.id,
              title: notification.title,
              message: notification.message,
              severity: alert.severity,
              routerName: router.name,
              portName: port.portName,
            });

            // Send email notification if enabled
            if (port.emailNotifications) {
              const user = await storage.getUser(router.userId);
              if (user && user.email) {
                try {
                  await emailService.sendAlertEmail(user.email, {
                    routerName: router.name,
                    portName: port.portName,
                    currentTraffic: `${(stat.totalBytesPerSecond / 1024).toFixed(2)} KB/s`,
                    threshold: `${(port.minThresholdBps / 1024).toFixed(2)} KB/s`,
                    severity: alert.severity,
                  });

                  // Record email notification
                  await storage.createNotification({
                    userId: router.userId,
                    alertId: alert.id,
                    type: "email",
                    title: notification.title,
                    message: notification.message,
                  });
                } catch (error) {
                  console.error(`[Scheduler] Failed to send email for alert ${alert.id}:`, error);
                }
              }
            }

            console.log(`[Scheduler] Alert created for ${router.name} - ${port.portName}`);
          }
        }
      } catch (error) {
        console.error(`[Scheduler] Error polling router ${routerId}:`, error);
        // Update router as disconnected
        await storage.updateRouterConnection(routerId, false);
        
        // Still try to check reachability even if connection fails
        try {
          console.log(`[Scheduler] Connection failed for ${router.name}, checking reachability...`);
          const credentials = await storage.getRouterCredentials(routerId);
          if (credentials) {
            const client = new MikrotikClient({
              host: router.ipAddress,
              port: router.port,
              user: credentials.username,
              password: credentials.password,
              restEnabled: router.restEnabled || false,
              restPort: router.restPort || 443,
              snmpEnabled: router.snmpEnabled || false,
              snmpCommunity: router.snmpCommunity || "public",
              snmpVersion: router.snmpVersion || "2c",
              snmpPort: router.snmpPort || 161,
            });
            const isReachable = await client.checkReachability();
            console.log(`[Scheduler] Reachability result for ${router.name} (after error): ${isReachable}`);
            await storage.updateRouterReachability(routerId, isReachable);
          }
        } catch (reachError) {
          console.log(`[Scheduler] Reachability check failed for ${router.name}, marking as unreachable`);
          // If reachability check fails, mark as unreachable
          await storage.updateRouterReachability(routerId, false);
        }
      }
    }

    console.log("[Scheduler] Traffic polling completed");
  } catch (error) {
    console.error("[Scheduler] Error in traffic polling:", error);
  }
}

export function startScheduler() {
  console.log("[Scheduler] Starting traffic monitoring scheduler...");

  // Poll traffic every 30 seconds
  cron.schedule("*/30 * * * * *", () => {
    pollRouterTraffic().catch(error => {
      console.error("[Scheduler] Unhandled error in scheduled task:", error);
    });
  });

  // Run immediately on startup
  setTimeout(() => {
    pollRouterTraffic().catch(error => {
      console.error("[Scheduler] Error in initial traffic poll:", error);
    });
  }, 5000); // Wait 5 seconds for app to fully initialize

  console.log("[Scheduler] Scheduler started successfully");
}
