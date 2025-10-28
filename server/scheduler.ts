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

// In-memory storage for real-time traffic data (last 2 hours per interface)
interface RealtimeTrafficData {
  routerId: string;
  portName: string;
  timestamp: Date;
  rxBytesPerSecond: number;
  txBytesPerSecond: number;
  totalBytesPerSecond: number;
}

// Store data per router per interface: Map<routerId, Map<portName, data[]>>
const realtimeTrafficStore = new Map<string, Map<string, RealtimeTrafficData[]>>();
const MAX_ENTRIES_PER_INTERFACE = 7200; // 2 hours at 1 second intervals per interface

export function getRealtimeTraffic(routerId: string, since?: Date): RealtimeTrafficData[] {
  const routerData = realtimeTrafficStore.get(routerId);
  if (!routerData) return [];
  
  // Flatten all interface data into a single array
  const allData: RealtimeTrafficData[] = [];
  for (const interfaceData of Array.from(routerData.values())) {
    allData.push(...interfaceData);
  }
  
  if (!since) return allData;
  return allData.filter(d => d.timestamp >= since);
}

function addRealtimeTraffic(routerId: string, data: Omit<RealtimeTrafficData, 'routerId'>) {
  // Get or create router's interface map
  let routerData = realtimeTrafficStore.get(routerId);
  if (!routerData) {
    routerData = new Map<string, RealtimeTrafficData[]>();
    realtimeTrafficStore.set(routerId, routerData);
  }
  
  // Get or create interface's data array
  let interfaceData = routerData.get(data.portName);
  if (!interfaceData) {
    interfaceData = [];
    routerData.set(data.portName, interfaceData);
  }
  
  // Add new data point
  interfaceData.push({ routerId, ...data });
  
  // Keep only last MAX_ENTRIES_PER_INTERFACE for this specific interface
  if (interfaceData.length > MAX_ENTRIES_PER_INTERFACE) {
    interfaceData.splice(0, interfaceData.length - MAX_ENTRIES_PER_INTERFACE);
  }
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

    for (const [routerId, ports] of Array.from(portsByRouter)) {
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

        // Store traffic data for ALL interfaces in memory for real-time display
        const timestamp = new Date();
        for (const stat of stats) {
          addRealtimeTraffic(routerId, {
            portName: stat.name,
            timestamp,
            rxBytesPerSecond: stat.rxBytesPerSecond,
            txBytesPerSecond: stat.txBytesPerSecond,
            totalBytesPerSecond: stat.totalBytesPerSecond,
          });
        }

        // Process each monitored port for alerting
        for (const port of ports) {
          const stat = stats.find(s => s.name === port.portName);
          if (!stat) {
            console.warn(`[Scheduler] Port ${port.portName} not found in router stats`);
            continue;
          }

          // Check if there's already a recent unacknowledged alert for this port
          let latestAlert = await storage.getLatestUnacknowledgedAlertForPort(port.id);
          let hasActiveAlert = !!latestAlert;
          let isPortDownAlert = latestAlert && latestAlert.message.includes("is DOWN");
          let isTrafficAlert = latestAlert && !latestAlert.message.includes("is DOWN");

          // Check port status (down/up)
          if (!stat.running) {
            // Port is DOWN - create port down alert (skip traffic threshold check)
            // Only skip if there's already an active PORT DOWN alert (not traffic alert)
            if (!hasActiveAlert || !isPortDownAlert) {
              const alert = await storage.createAlert({
                routerId: port.routerId,
                portId: port.id,
                portName: port.portName,
                userId: router.userId,
                severity: "critical",
                message: `Port ${port.portName} is DOWN`,
                currentTrafficBps: 0,
                thresholdBps: port.minThresholdBps,
              });

              // Create notification
              const notification = await storage.createNotification({
                userId: router.userId,
                alertId: alert.id,
                type: "popup",
                title: `Port Down: ${router.name}`,
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

              console.log(`[Scheduler] Port down alert created for ${router.name} - ${port.portName}`);
            }
            continue; // Skip traffic threshold check for down ports
          }

          // Port is UP - auto-acknowledge port down alert if exists
          if (hasActiveAlert && isPortDownAlert) {
            await storage.acknowledgeAlert(latestAlert!.id);
            console.log(`[Scheduler] Auto-acknowledged port down alert for ${router.name} - ${port.portName} (port came back up)`);
            
            // Re-fetch latest unacknowledged alert to check if there's now a different active alert (e.g., traffic alert)
            latestAlert = await storage.getLatestUnacknowledgedAlertForPort(port.id);
            hasActiveAlert = !!latestAlert;
            isPortDownAlert = latestAlert && latestAlert.message.includes("is DOWN");
            isTrafficAlert = latestAlert && !latestAlert.message.includes("is DOWN");
          }

          // Store traffic data (only for ports that are up)
          await storage.insertTrafficData({
            routerId: port.routerId,
            portId: port.id,
            portName: port.portName,
            rxBytesPerSecond: stat.rxBytesPerSecond,
            txBytesPerSecond: stat.txBytesPerSecond,
            totalBytesPerSecond: stat.totalBytesPerSecond,
          });

          // Check traffic threshold and create alert if necessary
          const isBelowThreshold = stat.totalBytesPerSecond < port.minThresholdBps;

          // Auto-acknowledge traffic alert if traffic returned to normal
          if (!isBelowThreshold && hasActiveAlert && isTrafficAlert) {
            await storage.acknowledgeAlert(latestAlert!.id);
            console.log(`[Scheduler] Auto-acknowledged alert for ${router.name} - ${port.portName} (traffic returned to normal)`);
          }

          // Only create a new traffic alert if:
          // 1. Traffic is below threshold AND there's no active TRAFFIC alert (first breach)
          // 2. Port down alerts don't prevent traffic alerts (they're separate)
          if (isBelowThreshold && (!hasActiveAlert || isPortDownAlert)) {
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

// Persist in-memory traffic data to database (runs every 5 minutes)
async function persistTrafficData() {
  try {
    console.log("[Scheduler] Persisting traffic data to database...");
    
    let totalPersisted = 0;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // Iterate over each router's data
    for (const [routerId, interfaceMap] of Array.from(realtimeTrafficStore.entries())) {
      // Iterate over each interface's data for this router
      for (const [portName, interfaceData] of Array.from(interfaceMap.entries())) {
        // Get the last 5 minutes of data for this interface
        const recentData = interfaceData.filter((d: RealtimeTrafficData) => d.timestamp >= fiveMinutesAgo);
        
        // Sample evenly to get ~5 data points per 5-minute period
        const sampleInterval = Math.floor(recentData.length / 5) || 1;
        for (let i = 0; i < recentData.length; i += sampleInterval) {
          if (i >= recentData.length) break;
          const sample = recentData[i];
          
          await storage.insertTrafficData({
            routerId: sample.routerId,
            portId: null,
            portName: sample.portName,
            rxBytesPerSecond: sample.rxBytesPerSecond,
            txBytesPerSecond: sample.txBytesPerSecond,
            totalBytesPerSecond: sample.totalBytesPerSecond,
          });
          totalPersisted++;
        }
      }
    }
    
    console.log(`[Scheduler] Persisted ${totalPersisted} traffic data points to database`);
  } catch (error) {
    console.error("[Scheduler] Error persisting traffic data:", error);
  }
}

// Clean up old traffic data (older than 2 years)
async function cleanupOldData() {
  try {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    
    console.log(`[Scheduler] Cleaning up traffic data older than ${twoYearsAgo.toISOString()}...`);
    const deletedCount = await storage.cleanupOldTrafficData(twoYearsAgo);
    console.log(`[Scheduler] Cleaned up ${deletedCount} old traffic data records`);
  } catch (error) {
    console.error("[Scheduler] Error cleaning up old data:", error);
  }
}

export function startScheduler() {
  console.log("[Scheduler] Starting traffic monitoring scheduler...");

  // Poll traffic every 1 second for real-time updates
  cron.schedule("* * * * * *", () => {
    pollRouterTraffic().catch(error => {
      console.error("[Scheduler] Unhandled error in real-time polling:", error);
    });
  });

  // Persist to database every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    persistTrafficData().catch(error => {
      console.error("[Scheduler] Unhandled error in database persistence:", error);
    });
  });

  // Clean up old data daily at 2 AM
  cron.schedule("0 2 * * *", () => {
    cleanupOldData().catch(error => {
      console.error("[Scheduler] Unhandled error in cleanup:", error);
    });
  });

  // Run immediately on startup
  setTimeout(() => {
    pollRouterTraffic().catch(error => {
      console.error("[Scheduler] Error in initial traffic poll:", error);
    });
  }, 5000); // Wait 5 seconds for app to fully initialize

  console.log("[Scheduler] Scheduler started successfully (1s real-time polling, 5min database persistence, daily cleanup)");
}
