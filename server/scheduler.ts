import cron from "node-cron";
import { storage } from "./storage";
import { MikrotikClient } from "./mikrotik";
import { emailService } from "./emailService";
import { WebSocket } from "ws";
import type { Alert } from "@shared/schema";

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
  comment?: string;
  timestamp: Date;
  rxBytesPerSecond: number;
  txBytesPerSecond: number;
  totalBytesPerSecond: number;
}

// Store data per router per interface: Map<routerId, Map<portName, data[]>>
const realtimeTrafficStore = new Map<string, Map<string, RealtimeTrafficData[]>>();
const MAX_ENTRIES_PER_INTERFACE = 7200; // 2 hours at 1 second intervals per interface

// Track consecutive threshold violations per port for 3-check confirmation
// Map<portId, { count: number, lastCheck: Date }>
const consecutiveViolations = new Map<string, { count: number; lastCheck: Date }>();

function incrementViolationCount(portId: string): number {
  const existing = consecutiveViolations.get(portId);
  const newCount = existing ? existing.count + 1 : 1;
  consecutiveViolations.set(portId, { count: newCount, lastCheck: new Date() });
  return newCount;
}

function resetViolationCount(portId: string): void {
  consecutiveViolations.delete(portId);
}

function getViolationCount(portId: string): number {
  return consecutiveViolations.get(portId)?.count || 0;
}

// Export function to reset violation counters when alerts are acknowledged
export function resetAlertViolationCounters(portId: string): void {
  resetViolationCount(`port_down_${portId}`);
  resetViolationCount(`traffic_${portId}`);
  console.log(`[Scheduler] Reset violation counters for port ${portId}`);
}

// Cleanup stale violation counters (older than 10 minutes)
function cleanupStaleViolationCounters(): void {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  let cleaned = 0;
  
  for (const [portId, data] of Array.from(consecutiveViolations.entries())) {
    if (data.lastCheck < tenMinutesAgo) {
      consecutiveViolations.delete(portId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[Scheduler] Cleaned up ${cleaned} stale violation counters`);
  }
}

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

// Get average traffic from last 3 data points for a specific port
// This helps avoid false alerts from temporary traffic spikes/drops
function getAverageTrafficForPort(routerId: string, portName: string, dataPoints: number = 3): {
  rxBytesPerSecond: number;
  txBytesPerSecond: number;
  totalBytesPerSecond: number;
} | null {
  const routerData = realtimeTrafficStore.get(routerId);
  if (!routerData) return null;
  
  const interfaceData = routerData.get(portName);
  if (!interfaceData || interfaceData.length === 0) return null;
  
  // Get the last N data points (default 3)
  const recentData = interfaceData.slice(-dataPoints);
  
  // Calculate average
  const avgRx = recentData.reduce((sum, d) => sum + d.rxBytesPerSecond, 0) / recentData.length;
  const avgTx = recentData.reduce((sum, d) => sum + d.txBytesPerSecond, 0) / recentData.length;
  const avgTotal = recentData.reduce((sum, d) => sum + d.totalBytesPerSecond, 0) / recentData.length;
  
  return {
    rxBytesPerSecond: avgRx,
    txBytesPerSecond: avgTx,
    totalBytesPerSecond: avgTotal,
  };
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

// Traffic data collection (runs every 1 second)
async function pollRouterTraffic() {
  try {
    // First, check reachability for ALL routers (not just those with monitored ports)
    const allRouters = await storage.getAllRouters();
    const reachableRouterIds = new Set<string>();
    
    // Process all routers in parallel for reachability checks
    await Promise.all(
      allRouters.map(async (router) => {
        try {
          const credentials = await storage.getRouterCredentials(router.id);
          if (!credentials) {
            console.log(`[Scheduler] Skipping reachability check for ${router.name} - no credentials`);
            return;
          }

          console.log(`[Scheduler] Checking reachability for ${router.name} (${router.ipAddress})...`);
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
            interfaceDisplayMode: (router.interfaceDisplayMode as "static" | "none" | "all") || 'static',
          });

          const isReachable = await client.checkReachability();
          console.log(`[Scheduler] Reachability result for ${router.name}: ${isReachable}`);
          await storage.updateRouterReachability(router.id, isReachable);
          
          if (isReachable) {
            reachableRouterIds.add(router.id);
          } else {
            console.log(`[Scheduler] Router ${router.name} is unreachable, marking as disconnected`);
            await storage.updateRouterConnection(router.id, false);
          }
        } catch (error) {
          console.log(`[Scheduler] Reachability check failed for ${router.name}, marking as unreachable`);
          // Mark as unreachable on error
          await storage.updateRouterReachability(router.id, false);
          await storage.updateRouterConnection(router.id, false);
        }
      })
    )

    // Collect traffic data for ALL reachable routers in parallel (so interface list is populated)
    await Promise.all(
      allRouters
        .filter(router => reachableRouterIds.has(router.id))
        .map(async (router) => {
          try {
            // Get router credentials
            const credentials = await storage.getRouterCredentials(router.id);
            if (!credentials) {
              return;
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
              interfaceDisplayMode: (router.interfaceDisplayMode as "static" | "none" | "all") || 'static',
            });

            // Use the last successful connection method (cached)
            // We do NOT re-test fallbacks during background operations to reduce API calls
            // Re-testing only happens when viewing/editing routers
            let stats: any[] = [];
            const storedMethod = router.lastSuccessfulConnectionMethod as 'native' | 'rest' | 'snmp' | null;
            
            if (storedMethod) {
              // Use the cached method directly - if it fails, skip this router
              console.log(`[Scheduler] Using stored method '${storedMethod}' for ${router.name}`);
              stats = await client.getInterfaceStatsWithMethod(storedMethod);
            } else {
              // No stored method - this means the router hasn't been tested yet
              // Skip this router - it will be tested when user views/edits it
              console.log(`[Scheduler] No stored method for ${router.name}, skipping (will be tested on view/edit)`);
              return;
            }

            // Update router connection status (only if reachable AND data retrieved successfully)
            await storage.updateRouterConnection(router.id, true);

            // Cloud DDNS hostname extraction: Store separately without replacing IP address
            // IP address is always used for reachability checks (TCP connection tests)
            // Cloud DDNS hostname is stored for reference and can be used for REST API connections
            if (storedMethod === 'rest' && /^\d+\.\d+\.\d+\.\d+$/.test(router.ipAddress)) {
              const extractedHostname = client.getExtractedHostname();
              if (extractedHostname && extractedHostname !== router.ipAddress) {
                console.log(`[Scheduler] Storing Cloud DDNS hostname ${extractedHostname} for router ${router.name} (IP: ${router.ipAddress})`);
                await storage.updateRouterCloudDdnsHostname(router.id, extractedHostname);
              }
            }

            // Store traffic data for ALL interfaces in memory for real-time display
            const timestamp = new Date();
            for (const stat of stats) {
              addRealtimeTraffic(router.id, {
                portName: stat.name,
                comment: stat.comment,
                timestamp,
                rxBytesPerSecond: stat.rxBytesPerSecond,
                txBytesPerSecond: stat.txBytesPerSecond,
                totalBytesPerSecond: stat.totalBytesPerSecond,
              });
            }
          } catch (error: any) {
            console.error(`[Scheduler] Failed to collect traffic for router ${router.name}:`, error?.message || error?.stack || error || 'Unknown error');
            // Update router connection status
            await storage.updateRouterConnection(router.id, false);
          }
        })
    )

    // Get all enabled monitored ports with their routers for database persistence
    const monitoredPorts = await storage.getAllEnabledPorts();

    // Group ports by router
    const portsByRouter = new Map<string, typeof monitoredPorts>();
    for (const port of monitoredPorts) {
      const existing = portsByRouter.get(port.router.id) || [];
      existing.push(port);
      portsByRouter.set(port.router.id, existing);
    }

    // Store traffic data to database for monitored ports only
    for (const [routerId, ports] of Array.from(portsByRouter)) {
      try {
        // Get the latest realtime data for this router
        const realtimeData = getRealtimeTraffic(routerId);
        
        // Store to database for each monitored port
        for (const port of ports) {
          const portData = realtimeData.filter(d => d.portName === port.portName);
          if (portData.length === 0) {
            console.warn(`[Scheduler] Port ${port.portName} not found in realtime data for router ${routerId}`);
            continue;
          }
          
          // Get the most recent data point
          const latestData = portData[portData.length - 1];
          
          // Store traffic data to database
          await storage.insertTrafficData({
            routerId: port.routerId,
            portId: port.id,
            portName: port.portName,
            rxBytesPerSecond: latestData.rxBytesPerSecond,
            txBytesPerSecond: latestData.txBytesPerSecond,
            totalBytesPerSecond: latestData.totalBytesPerSecond,
          });
        }
      } catch (error: any) {
        console.error(`[Scheduler] Failed to store traffic data for router ${routerId}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error("[Scheduler] Error in traffic polling:", error);
  }
}

// Alert checking with 3-consecutive-checks confirmation (runs every 60 seconds)
async function checkAlerts() {
  try {
    console.log("[Scheduler] Checking alerts...");

    // FIRST: Check router connectivity for all routers
    const allRouters = await storage.getAllRouters();
    
    for (const router of allRouters) {
      try {
        const credentials = await storage.getRouterCredentials(router.id);
        if (!credentials) {
          continue;
        }

        // Check if router is reachable (using database status from pollRouterTraffic)
        const isReachable = router.reachable !== false; // Default to true if not set
        
        // Check for existing unacknowledged router down alert (efficient query)
        const routerAlerts = await storage.getAlertsByRouter(router.id);
        const routerDownAlert = routerAlerts.find(
          (alert: Alert) => !alert.acknowledgedAt && alert.message.includes("Router is UNREACHABLE")
        );
        
        if (!isReachable) {
          // Router is DOWN - increment violation count
          const violationCount = incrementViolationCount(`router_down_${router.id}`);
          
          console.log(`[Scheduler] Router ${router.name} is unreachable (check ${violationCount}/3)`);
          
          // Create router down alert only after 3 consecutive checks
          if (violationCount >= 3 && !routerDownAlert) {
            const alert = await storage.createAlert({
              routerId: router.id,
              portId: null,
              portName: null,
              userId: router.userId,
              severity: "critical",
              message: `Router is UNREACHABLE - Cannot connect to ${router.name} (${router.ipAddress})`,
              currentTrafficBps: null,
              thresholdBps: null,
            });

            // Create notification
            const notification = await storage.createNotification({
              userId: router.userId,
              alertId: alert.id,
              type: "popup",
              title: `Router Down: ${router.name}`,
              message: alert.message,
            });

            // Send email notification - get user email
            const user = await storage.getUser(router.userId);
            if (user?.email) {
              await emailService.sendAlertEmail(user.email, {
                routerName: router.name,
                portName: 'Router Connectivity',
                currentTraffic: 'N/A',
                threshold: 'N/A',
                severity: alert.severity,
              });
            }

            // Broadcast real-time notification via WebSocket
            broadcastNotification(router.userId, {
              id: notification.id,
              title: notification.title,
              message: notification.message,
              severity: alert.severity,
              routerName: router.name,
              portName: null,
            });

            console.log(`[Scheduler] Router down alert created for ${router.name} (confirmed after 3 checks)`);
            resetViolationCount(`router_down_${router.id}`); // Reset after alert created
          }
        } else {
          // Router is UP - reset violation count
          resetViolationCount(`router_down_${router.id}`);
          
          // Auto-acknowledge router down alert if exists
          if (routerDownAlert) {
            await storage.acknowledgeAlert(routerDownAlert.id);
            resetViolationCount(`router_down_${router.id}`);
            console.log(`[Scheduler] Auto-acknowledged router down alert for ${router.name} (router came back online)`);
          }
        }
      } catch (error: any) {
        console.error(`[Scheduler] Error checking router connectivity for ${router.name}:`, error.message);
      }
    }

    // SECOND: Get all enabled monitored ports with their routers
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
          interfaceDisplayMode: (router.interfaceDisplayMode as "static" | "none" | "all") || 'static',
        });

        const stats = await client.getInterfaceStats();

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
          
          if (hasActiveAlert) {
            console.log(`[Scheduler] Found unacknowledged alert for ${router.name} - ${port.portName}: ${isPortDownAlert ? 'Port Down' : 'Traffic'} Alert`);
          }

          // Check port status (down/up)
          if (!stat.running) {
            // Port is DOWN - increment violation count
            const violationCount = incrementViolationCount(`port_down_${port.id}`);
            
            // Create port down alert only after 3 consecutive checks
            if (violationCount >= 3 && (!hasActiveAlert || !isPortDownAlert)) {
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

              console.log(`[Scheduler] Port down alert created for ${router.name} - ${port.portName} (confirmed after 3 checks)`);
              resetViolationCount(`port_down_${port.id}`); // Reset after alert created
            }
            resetViolationCount(`traffic_${port.id}`); // Reset traffic violation count
            continue; // Skip traffic threshold check for down ports
          }

          // Port is UP - reset port down violation count
          resetViolationCount(`port_down_${port.id}`);
          
          // Auto-acknowledge port down alert if exists
          if (hasActiveAlert && isPortDownAlert) {
            await storage.acknowledgeAlert(latestAlert!.id);
            resetViolationCount(`port_down_${port.id}`); // Reset counter on auto-acknowledge
            console.log(`[Scheduler] Auto-acknowledged port down alert for ${router.name} - ${port.portName} (port came back up)`);
            
            // Re-fetch latest unacknowledged alert
            latestAlert = await storage.getLatestUnacknowledgedAlertForPort(port.id);
            hasActiveAlert = !!latestAlert;
            isPortDownAlert = latestAlert && latestAlert.message.includes("is DOWN");
            isTrafficAlert = latestAlert && !latestAlert.message.includes("is DOWN");
          }

          // Check traffic threshold (RX only - download traffic)
          // Use AVERAGE of last 3 data points to avoid false alerts from temporary spikes/drops
          const avgTraffic = getAverageTrafficForPort(routerId, port.portName, 3);
          const currentRxTraffic = avgTraffic ? avgTraffic.rxBytesPerSecond : stat.rxBytesPerSecond;
          const isBelowThreshold = currentRxTraffic < port.minThresholdBps;
          
          console.log(`[Scheduler] ${router.name} - ${port.portName}: RX Traffic ${(currentRxTraffic / 1024).toFixed(2)} KB/s (avg of last 3) vs Threshold ${(port.minThresholdBps / 1024).toFixed(2)} KB/s (${isBelowThreshold ? 'BELOW' : 'ABOVE'})`);

          if (isBelowThreshold) {
            // Increment violation count
            const violationCount = incrementViolationCount(`traffic_${port.id}`);
            
            // Only create alert after 3 consecutive checks AND no active traffic alert
            if (violationCount >= 3 && (!hasActiveAlert || isPortDownAlert)) {
              // Determine severity based on how far below threshold
              const percentBelow = ((port.minThresholdBps - currentRxTraffic) / port.minThresholdBps) * 100;
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
                message: `RX traffic on ${port.portName} is below threshold: ${(currentRxTraffic / 1024).toFixed(2)} KB/s (avg) < ${(port.minThresholdBps / 1024).toFixed(2)} KB/s`,
                currentTrafficBps: currentRxTraffic,
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
                      currentTraffic: `${(currentRxTraffic / 1024).toFixed(2)} KB/s (RX avg)`,
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

              console.log(`[Scheduler] Alert created for ${router.name} - ${port.portName} (confirmed after 3 checks)`);
              resetViolationCount(`traffic_${port.id}`); // Reset after alert created
            }
          } else {
            // Traffic is above threshold - reset violation count
            resetViolationCount(`traffic_${port.id}`);
            
            // Auto-acknowledge traffic alert if traffic returned to normal
            if (hasActiveAlert && isTrafficAlert) {
              console.log(`[Scheduler] Auto-acknowledging traffic alert for ${router.name} - ${port.portName} (traffic returned to normal)`);
              await storage.acknowledgeAlert(latestAlert!.id);
              resetViolationCount(`traffic_${port.id}`); // Ensure counter is reset on auto-acknowledge
              console.log(`[Scheduler] Successfully auto-acknowledged alert for ${router.name} - ${port.portName}`);
            } else {
              console.log(`[Scheduler] No auto-acknowledgment needed for ${router.name} - ${port.portName} (hasActiveAlert: ${hasActiveAlert}, isTrafficAlert: ${isTrafficAlert})`);
            }
          }
        }
      } catch (error: any) {
        console.error(`[Scheduler] Error checking alerts for router ${routerId}:`, error);
        await storage.updateRouterConnection(routerId, false);
      }
    }

    console.log("[Scheduler] Alert check completed");
  } catch (error) {
    console.error("[Scheduler] Error in alert checking:", error);
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

// Execution guards to prevent concurrent runs
let isPollingTraffic = false;
let isCheckingAlerts = false;
let isPersistingData = false;

export function startScheduler() {
  console.log("[Scheduler] Starting traffic monitoring scheduler...");

  // Poll traffic every 60 seconds for real-time updates (data collection only)
  cron.schedule("*/60 * * * * *", () => {
    if (isPollingTraffic) {
      console.log("[Scheduler] Skipping traffic poll - previous execution still running");
      return;
    }
    
    isPollingTraffic = true;
    pollRouterTraffic()
      .catch(error => {
        console.error("[Scheduler] Unhandled error in real-time polling:", error);
      })
      .finally(() => {
        isPollingTraffic = false;
      });
  });

  // Check alerts every 60 seconds with 3-consecutive-checks confirmation
  cron.schedule("*/60 * * * * *", () => {
    if (isCheckingAlerts) {
      console.log("[Scheduler] Skipping alert check - previous execution still running");
      return;
    }
    
    isCheckingAlerts = true;
    checkAlerts()
      .catch(error => {
        console.error("[Scheduler] Unhandled error in alert checking:", error);
      })
      .finally(() => {
        isCheckingAlerts = false;
      });
  });

  // Persist to database every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    if (isPersistingData) {
      console.log("[Scheduler] Skipping data persistence - previous execution still running");
      return;
    }
    
    isPersistingData = true;
    persistTrafficData()
      .catch(error => {
        console.error("[Scheduler] Unhandled error in database persistence:", error);
      })
      .finally(() => {
        isPersistingData = false;
      });
  });

  // Clean up stale violation counters every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    cleanupStaleViolationCounters();
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
    checkAlerts().catch(error => {
      console.error("[Scheduler] Error in initial alert check:", error);
    });
  }, 5000); // Wait 5 seconds for app to fully initialize

  console.log("[Scheduler] Scheduler started successfully (60s real-time polling, 60s alert checking with 3-check confirmation, 5min database persistence, 5min counter cleanup, daily data cleanup)");
}
