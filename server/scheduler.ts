import cron from "node-cron";
import { storage } from "./storage";
import { MikrotikClient } from "./mikrotik";
import { emailService } from "./emailService";
import { WebSocket } from "ws";
import type { Alert } from "@shared/schema";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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

// On-demand real-time traffic polling state
// Tracks which routers are currently being monitored in real-time (when details page is open)
const activeRealtimePolling = new Map<string, { interval: NodeJS.Timeout; clients: Set<WebSocket> }>();

// Track consecutive threshold violations per port for 5-check confirmation
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

// Get all users who should receive alerts for a router (owner + assigned users)
async function getAllAlertRecipients(routerId: string, ownerId: string): Promise<string[]> {
  const userIds = new Set<string>();
  
  // Add router owner
  userIds.add(ownerId);
  
  // Add all assigned users
  try {
    const assignments = await storage.getRouterAssignments(routerId);
    for (const assignment of assignments) {
      userIds.add(assignment.userId);
    }
  } catch (error) {
    console.error(`[Scheduler] Error getting router assignments for ${routerId}:`, error);
  }
  
  return Array.from(userIds);
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

// Get last N data points per interface (not total)
// This ensures each interface gets its own data points, preventing one interface from dominating
export function getRealtimeTrafficPerInterface(routerId: string, pointsPerInterface: number = 100): RealtimeTrafficData[] {
  const routerData = realtimeTrafficStore.get(routerId);
  if (!routerData) return [];
  
  const result: RealtimeTrafficData[] = [];
  
  // Get last N points for each interface
  for (const interfaceData of Array.from(routerData.values())) {
    const lastPoints = interfaceData.slice(-pointsPerInterface);
    result.push(...lastPoints);
  }
  
  return result;
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

// Traffic data collection for monitored ports + reachability checks for all routers (runs every 60 seconds)
// Real-time traffic for all interfaces is now handled by on-demand polling when details page is open
async function pollRouterTraffic() {
  try {
    // Get all enabled monitored ports with their routers
    const monitoredPorts = await storage.getAllEnabledPorts();
    
    // Group ports by router to minimize connections
    const portsByRouter = new Map<string, typeof monitoredPorts>();
    for (const port of monitoredPorts) {
      const existing = portsByRouter.get(port.router.id) || [];
      existing.push(port);
      portsByRouter.set(port.router.id, existing);
    }

    // Get ALL routers and split into two groups
    const uniqueRouterIds = new Set(monitoredPorts.map(p => p.router.id));
    const allRouters = await storage.getAllRouters();
    const routersWithMonitoredPorts = allRouters.filter(r => uniqueRouterIds.has(r.id));
    const routersWithoutMonitoredPorts = allRouters.filter(r => !uniqueRouterIds.has(r.id));

    console.log(`[Scheduler] Polling ${routersWithMonitoredPorts.length} routers with monitored ports + ${routersWithoutMonitoredPorts.length} routers for reachability only`);

    // Collect traffic data for ALL routers (reachability determined by stats fetch success/failure)
    // This eliminates the separate reachability check, reducing API calls from 2 to 1 per router
    await Promise.all(
      routersWithMonitoredPorts.map(async (router) => {
          try {
            // Get router credentials
            const credentials = await storage.getRouterCredentials(router.id);
            if (!credentials) {
              return;
            }

            // Connect to MikroTik and get stats
            // This single call serves dual purpose: fetch data AND determine reachability
            const client = new MikrotikClient({
              host: router.ipAddress,
              port: router.port,
              user: credentials.username,
              password: credentials.password,
              cloudDdnsHostname: router.cloudDdnsHostname || undefined,
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
              // Use the cached method directly - ONE API/SNMP call gets ALL interface data
              console.log(`[Scheduler] Fetching all interfaces via '${storedMethod}' for ${router.name}`);
              stats = await client.getInterfaceStatsWithMethod(storedMethod);
              console.log(`[Scheduler] Retrieved ${stats.length} interfaces from ${router.name}`);
            } else {
              // No stored method - this means the router hasn't been tested yet
              // Skip this router - it will be tested when user views/edits it
              console.log(`[Scheduler] No stored method for ${router.name}, skipping (will be tested on view/edit)`);
              return;
            }

            // If we reach here, stats fetch succeeded = router is reachable
            await storage.updateRouterReachability(router.id, true);
            await storage.updateRouterConnection(router.id, true);

            // Cloud DDNS hostname extraction: Store separately without replacing IP address
            if (storedMethod === 'rest' && /^\d+\.\d+\.\d+\.\d+$/.test(router.ipAddress)) {
              const extractedHostname = client.getExtractedHostname();
              if (extractedHostname && extractedHostname !== router.ipAddress) {
                console.log(`[Scheduler] Storing Cloud DDNS hostname ${extractedHostname} for router ${router.name}`);
                await storage.updateRouterCloudDdnsHostname(router.id, extractedHostname);
              }
            }

            // Cache ALL interfaces to database (zero additional API calls - reusing fetched data)
            console.log(`[Scheduler] Caching ${stats.length} interfaces to database for ${router.name}`);
            for (const stat of stats) {
              await storage.upsertRouterInterface(router.id, {
                interfaceName: stat.name,
                interfaceComment: stat.comment || null,
                interfaceMacAddress: stat.macAddress || null,
                isRunning: stat.running,
              });
            }

            // Get monitored ports for this router
            const monitoredPortsForRouter = portsByRouter.get(router.id) || [];
            console.log(`[Scheduler] Processing ${monitoredPortsForRouter.length} monitored port(s) from single API response for ${router.name}`);
            
            // Process ALL monitored ports from the SINGLE API/SNMP response
            // No additional API calls needed - all data already fetched above
            const timestamp = new Date();
            for (const port of monitoredPortsForRouter) {
              const stat = stats.find(s => s.name === port.portName);
              if (!stat) {
                console.warn(`[Scheduler] Monitored port ${port.portName} not found in interface stats for ${router.name}`);
                continue;
              }
              
              // Update interface metadata (comment, MAC) seamlessly during polling
              await storage.updateInterfaceMetadata(router.id, port.portName, {
                interfaceComment: stat.comment || null,
                interfaceMacAddress: stat.macAddress || null,
              });
              
              // Store in-memory for alert checking
              addRealtimeTraffic(router.id, {
                portName: stat.name,
                comment: stat.comment,
                timestamp,
                rxBytesPerSecond: stat.rxBytesPerSecond,
                txBytesPerSecond: stat.txBytesPerSecond,
                totalBytesPerSecond: stat.totalBytesPerSecond,
              });
              
              // Store to database
              await storage.insertTrafficData({
                routerId: router.id,
                portId: port.id,
                portName: port.portName,
                rxBytesPerSecond: stat.rxBytesPerSecond,
                txBytesPerSecond: stat.txBytesPerSecond,
                totalBytesPerSecond: stat.totalBytesPerSecond,
              });
            }
            
            console.log(`[Scheduler] ✓ Successfully processed ${monitoredPortsForRouter.length} port(s) for ${router.name} with 1 API call`);
          } catch (error: any) {
            console.error(`[Scheduler] Failed to collect traffic for router ${router.name}:`, error?.message || error?.stack || error || 'Unknown error');
            // Stats fetch failed = router is unreachable
            await storage.updateRouterReachability(router.id, false);
            await storage.updateRouterConnection(router.id, false);
          }
        })
    );

    // Check reachability for routers WITHOUT monitored ports (lightweight check only)
    await Promise.all(
      routersWithoutMonitoredPorts.map(async (router) => {
        try {
          // Get router credentials
          const credentials = await storage.getRouterCredentials(router.id);
          if (!credentials) {
            return;
          }

          const client = new MikrotikClient({
            host: router.ipAddress,
            port: router.port,
            user: credentials.username,
            password: credentials.password,
            cloudDdnsHostname: router.cloudDdnsHostname || undefined,
            restEnabled: router.restEnabled || false,
            restPort: router.restPort || 443,
            snmpEnabled: router.snmpEnabled || false,
            snmpCommunity: router.snmpCommunity || "public",
            snmpVersion: router.snmpVersion || "2c",
            snmpPort: router.snmpPort || 161,
            interfaceDisplayMode: (router.interfaceDisplayMode as "static" | "none" | "all") || 'static',
          });

          // Lightweight reachability check (TCP port test)
          const isReachable = await client.checkReachability();
          await storage.updateRouterReachability(router.id, isReachable);
          
          if (isReachable) {
            console.log(`[Scheduler] Router ${router.name} is reachable (no monitored ports)`);
          } else {
            console.log(`[Scheduler] Router ${router.name} is unreachable (no monitored ports)`);
          }
        } catch (error: any) {
          console.error(`[Scheduler] Failed to check reachability for router ${router.name}:`, error?.message || 'Unknown error');
          await storage.updateRouterReachability(router.id, false);
        }
      })
    );
  } catch (error) {
    console.error("[Scheduler] Error in traffic polling:", error);
  }
}

// Alert checking with 5-consecutive-checks confirmation (runs every 30 seconds)
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
        
        // Check for existing unacknowledged router down alert (efficient database query)
        const routerDownAlert = await storage.getLatestUnacknowledgedRouterAlert(router.id);
        
        if (!isReachable) {
          // Router is DOWN - increment violation count
          const violationCount = incrementViolationCount(`router_down_${router.id}`);
          
          console.log(`[Scheduler] Router ${router.name} is unreachable (check ${violationCount}/5)`);
          
          // CRITICAL: Only create router down alert if NO active unacknowledged alert exists
          // This prevents duplicate alerts for the same ongoing issue
          if (violationCount >= 5 && !routerDownAlert) {
            // Get all users who should receive this alert (owner + assigned users)
            const recipientUserIds = await getAllAlertRecipients(router.id, router.userId);
            console.log(`[Scheduler] Router down alert for ${router.name} will notify ${recipientUserIds.length} user(s)`);
            
            // Create ONE alert for the router (using owner's userId for the alert record)
            const alert = await storage.createAlert({
              routerId: router.id,
              portId: null,
              portName: null,
              portComment: null,
              userId: router.userId,
              severity: "critical",
              message: `Router is UNREACHABLE - Cannot connect to ${router.name} (${router.ipAddress})`,
              currentTrafficBps: null,
              thresholdBps: null,
            });

            // Create notifications and send alerts to ALL users (owner + assigned)
            for (const userId of recipientUserIds) {
              // Create notification for this user
              const notification = await storage.createNotification({
                userId: userId,
                alertId: alert.id,
                type: "popup",
                title: `Router Down: ${router.name}`,
                message: alert.message,
              });

              // Send email notification
              const user = await storage.getUser(userId);
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
              broadcastNotification(userId, {
                id: notification.id,
                title: notification.title,
                message: notification.message,
                severity: alert.severity,
                routerName: router.name,
                portName: null,
              });
            }

            console.log(`[Scheduler] Router down alert created for ${router.name} and sent to ${recipientUserIds.length} user(s) (confirmed after 5 checks)`);
            // Do NOT reset counter here - keep counting to prevent creating alerts every 5 minutes
            // Counter will be reset when router comes back online or alert is acknowledged
          } else if (violationCount >= 5 && routerDownAlert) {
            console.log(`[Scheduler] ⚠️  Alert de-duplication: Router ${router.name} still unreachable but alert #${routerDownAlert.id} already active - NOT creating duplicate alert`);
          }
        } else {
          // Router is UP - reset violation count
          resetViolationCount(`router_down_${router.id}`);
          
          // Auto-acknowledge router down alert if exists
          if (routerDownAlert) {
            await storage.acknowledgeAlert(routerDownAlert.id, "system");
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

        // Connect to MikroTik and get ALL interface stats in ONE API/SNMP call
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

        console.log(`[Scheduler] Fetching all interfaces for alert checking on ${router.name}`);
        const stats = await client.getInterfaceStats();
        console.log(`[Scheduler] Processing ${ports.length} monitored port(s) from single API response for ${router.name}`);

        // Cache ALL interfaces to database (zero additional API calls - reusing fetched data)
        console.log(`[Scheduler] Caching ${stats.length} interfaces to database for ${router.name}`);
        for (const stat of stats) {
          await storage.upsertRouterInterface(router.id, {
            interfaceName: stat.name,
            interfaceComment: stat.comment || null,
            interfaceMacAddress: stat.macAddress || null,
            isRunning: stat.running,
          });
        }

        // Process ALL monitored ports from the SINGLE API/SNMP response
        // No additional API calls needed per port
        for (const port of ports) {
          const stat = stats.find(s => s.name === port.portName);
          if (!stat) {
            console.warn(`[Scheduler] Port ${port.portName} not found in router stats`);
            continue;
          }

          // Update interface metadata (comment, MAC) seamlessly during alert checking
          await storage.updateInterfaceMetadata(router.id, port.portName, {
            interfaceComment: stat.comment || null,
            interfaceMacAddress: stat.macAddress || null,
          });

          // Check if there's already an unacknowledged alert for this port
          let latestAlert = await storage.getLatestUnacknowledgedAlertForPort(port.id);
          let hasActiveAlert = !!latestAlert;
          let isPortDownAlert = latestAlert && latestAlert.message.includes("is DOWN");
          let isTrafficAlert = latestAlert && !latestAlert.message.includes("is DOWN");
          
          if (hasActiveAlert) {
            console.log(`[Scheduler] Found unacknowledged alert for ${router.name} - ${port.portName}: ${isPortDownAlert ? 'Port Down' : 'Traffic'} Alert #${latestAlert!.id}`);
          }

          // Check port status (down/up)
          if (!stat.running) {
            // Port is DOWN - increment violation count
            const violationCount = incrementViolationCount(`port_down_${port.id}`);
            
            // CRITICAL: Only create port down alert if NO active port down alert exists
            // This prevents duplicate alerts for the same ongoing issue
            if (violationCount >= 5 && !isPortDownAlert) {
              // Get all users who should receive this alert (owner + assigned users)
              const recipientUserIds = await getAllAlertRecipients(router.id, router.userId);
              console.log(`[Scheduler] Port down alert for ${router.name} - ${port.portName} will notify ${recipientUserIds.length} user(s)`);
              
              // Create ONE alert for the port (using owner's userId for the alert record)
              const alert = await storage.createAlert({
                routerId: port.routerId,
                portId: port.id,
                portName: port.portName,
                portComment: stat.comment || null,
                userId: router.userId,
                severity: "critical",
                message: `Port ${port.portName} is DOWN`,
                currentTrafficBps: 0,
                thresholdBps: port.minThresholdBps,
              });

              // Create notifications and send alerts to ALL users (owner + assigned)
              for (const userId of recipientUserIds) {
                // Create notification for this user
                const notification = await storage.createNotification({
                  userId: userId,
                  alertId: alert.id,
                  type: "popup",
                  title: `Port Down: ${router.name}`,
                  message: alert.message,
                });

                // Broadcast real-time notification via WebSocket
                broadcastNotification(userId, {
                  id: notification.id,
                  title: notification.title,
                  message: notification.message,
                  severity: alert.severity,
                  routerName: router.name,
                  portName: port.portName,
                  portComment: stat.comment || null,
                });
              }

              console.log(`[Scheduler] Port down alert created for ${router.name} - ${port.portName} and sent to ${recipientUserIds.length} user(s) (confirmed after 5 checks)`);
              // Do NOT reset counter here - keep counting to prevent creating alerts every 5 minutes
              // Counter will be reset when port comes back up or alert is acknowledged
            } else if (violationCount >= 5 && isPortDownAlert) {
              console.log(`[Scheduler] ⚠️  Alert de-duplication: Port ${router.name} - ${port.portName} still down but alert #${latestAlert!.id} already active - NOT creating duplicate alert`);
            }
            resetViolationCount(`traffic_${port.id}`); // Reset traffic violation count when port is down
            continue; // Skip traffic threshold check for down ports
          }

          // Port is UP - reset port down violation count
          resetViolationCount(`port_down_${port.id}`);
          
          // Auto-acknowledge port down alert if exists
          if (hasActiveAlert && isPortDownAlert) {
            await storage.acknowledgeAlert(latestAlert!.id, "system");
            resetViolationCount(`port_down_${port.id}`); // Reset counter on auto-acknowledge
            console.log(`[Scheduler] Auto-acknowledged port down alert for ${router.name} - ${port.portName} (port came back up)`);
            
            // Re-fetch latest unacknowledged alert
            latestAlert = await storage.getLatestUnacknowledgedAlertForPort(port.id);
            hasActiveAlert = !!latestAlert;
            isPortDownAlert = latestAlert && latestAlert.message.includes("is DOWN");
            isTrafficAlert = latestAlert && !latestAlert.message.includes("is DOWN");
          }

          // Check traffic threshold (Total traffic - RX + TX sum)
          // Use current sum (TX + RX) not average
          const currentTotalTraffic = stat.totalBytesPerSecond;
          const isBelowThreshold = currentTotalTraffic < port.minThresholdBps;
          
          console.log(`[Scheduler] ${router.name} - ${port.portName}: Total Traffic ${(currentTotalTraffic / 1024).toFixed(2)} KB/s (RX+TX sum) vs Threshold ${(port.minThresholdBps / 1024).toFixed(2)} KB/s (${isBelowThreshold ? 'BELOW' : 'ABOVE'})`);

          if (isBelowThreshold) {
            // Increment violation count
            const violationCount = incrementViolationCount(`traffic_${port.id}`);
            
            // CRITICAL: Only create traffic alert if NO active traffic alert exists
            // This prevents duplicate alerts for the same ongoing issue
            if (violationCount >= 5 && !isTrafficAlert) {
              // Get all users who should receive this alert (owner + assigned users)
              const recipientUserIds = await getAllAlertRecipients(router.id, router.userId);
              console.log(`[Scheduler] Traffic alert for ${router.name} - ${port.portName} will notify ${recipientUserIds.length} user(s)`);
              
              // Determine severity based on how far below threshold
              const percentBelow = ((port.minThresholdBps - currentTotalTraffic) / port.minThresholdBps) * 100;
              let severity = "warning";
              if (percentBelow > 50) severity = "critical";
              else if (percentBelow > 25) severity = "warning";
              else severity = "info";

              // Create ONE alert for the port (using owner's userId for the alert record)
              const alert = await storage.createAlert({
                routerId: port.routerId,
                portId: port.id,
                portName: port.portName,
                portComment: stat.comment || null,
                userId: router.userId,
                severity,
                message: `Total traffic on ${port.portName} is below threshold: ${(currentTotalTraffic / 1024).toFixed(2)} KB/s (RX+TX sum) < ${(port.minThresholdBps / 1024).toFixed(2)} KB/s`,
                currentTrafficBps: currentTotalTraffic,
                thresholdBps: port.minThresholdBps,
              });

              // Create notifications and send alerts to ALL users (owner + assigned)
              for (const userId of recipientUserIds) {
                // Create notification for this user
                const notification = await storage.createNotification({
                  userId: userId,
                  alertId: alert.id,
                  type: "popup",
                  title: `Traffic Alert: ${router.name}`,
                  message: alert.message,
                });

                // Broadcast real-time notification via WebSocket
                broadcastNotification(userId, {
                  id: notification.id,
                  title: notification.title,
                  message: notification.message,
                  severity: alert.severity,
                  routerName: router.name,
                  portName: port.portName,
                  portComment: stat.comment || null,
                });

                // Send email notification if enabled
                if (port.emailNotifications) {
                  const user = await storage.getUser(userId);
                  if (user && user.email) {
                    try {
                      await emailService.sendAlertEmail(user.email, {
                        routerName: router.name,
                        portName: port.portName,
                        currentTraffic: `${(currentTotalTraffic / 1024).toFixed(2)} KB/s (RX+TX sum)`,
                        threshold: `${(port.minThresholdBps / 1024).toFixed(2)} KB/s`,
                        severity: alert.severity,
                      });

                      // Record email notification
                      await storage.createNotification({
                        userId: userId,
                        alertId: alert.id,
                        type: "email",
                        title: `Traffic Alert: ${router.name}`,
                        message: alert.message,
                      });
                    } catch (error) {
                      console.error(`[Scheduler] Failed to send email for alert ${alert.id}:`, error);
                    }
                  }
                }
              }

              console.log(`[Scheduler] Traffic alert created for ${router.name} - ${port.portName} and sent to ${recipientUserIds.length} user(s) (confirmed after 5 checks)`);
              // Do NOT reset counter here - keep counting to prevent creating alerts every 5 minutes
              // Counter will be reset when traffic returns to normal or alert is acknowledged
            } else if (violationCount >= 5 && isTrafficAlert) {
              console.log(`[Scheduler] ⚠️  Alert de-duplication: Port ${router.name} - ${port.portName} still below threshold but alert #${latestAlert!.id} already active - NOT creating duplicate alert`);
            }
          } else {
            // Traffic is above threshold - reset violation count
            resetViolationCount(`traffic_${port.id}`);
            
            // Auto-acknowledge traffic alert if traffic returned to normal
            if (hasActiveAlert && isTrafficAlert) {
              console.log(`[Scheduler] Auto-acknowledging traffic alert for ${router.name} - ${port.portName} (traffic returned to normal)`);
              await storage.acknowledgeAlert(latestAlert!.id, "system");
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

// On-demand real-time traffic polling (1-second interval)
// This is triggered when router details page is opened
async function pollSingleRouterRealtime(routerId: string) {
  try {
    const router = await storage.getRouter(routerId);
    if (!router) {
      console.log(`[RealtimePoll] Router ${routerId} not found`);
      return;
    }

    const credentials = await storage.getRouterCredentials(router.id);
    if (!credentials) {
      console.log(`[RealtimePoll] No credentials for ${router.name}`);
      return;
    }

    const client = new MikrotikClient({
      host: router.ipAddress,
      port: router.port,
      user: credentials.username,
      password: credentials.password,
      cloudDdnsHostname: router.cloudDdnsHostname || undefined,
      restEnabled: router.restEnabled || false,
      restPort: router.restPort || 443,
      snmpEnabled: router.snmpEnabled || false,
      snmpCommunity: router.snmpCommunity || "public",
      snmpVersion: router.snmpVersion || "2c",
      snmpPort: router.snmpPort || 161,
      interfaceDisplayMode: (router.interfaceDisplayMode as "static" | "none" | "all") || 'static',
    });

    // Use cached connection method for efficiency
    const storedMethod = router.lastSuccessfulConnectionMethod as 'native' | 'rest' | 'snmp' | null;
    if (!storedMethod) {
      console.log(`[RealtimePoll] No connection method cached for ${router.name}`);
      return;
    }

    const stats = await client.getInterfaceStatsWithMethod(storedMethod);
    console.log(`[RealtimePoll] Retrieved ${stats.length} interfaces for ${router.name}`);
    
    // Cache ALL interfaces to database (zero additional API calls - reusing fetched data)
    for (const stat of stats) {
      await storage.upsertRouterInterface(router.id, {
        interfaceName: stat.name,
        interfaceComment: stat.comment || null,
        interfaceMacAddress: stat.macAddress || null,
        isRunning: stat.running,
      });
    }

    // Get monitored ports to update their metadata
    const monitoredPorts = await storage.getMonitoredPorts(router.id);
    
    // Store all interfaces in memory
    const timestamp = new Date();
    for (const stat of stats) {
      console.log(`[RealtimePoll] Storing ${stat.name}: RX ${(stat.rxBytesPerSecond/1024/1024).toFixed(2)} Mbps`);
      
      // Update interface metadata if this interface is a monitored port
      const monitoredPort = monitoredPorts.find(p => p.portName === stat.name);
      if (monitoredPort) {
        await storage.updateInterfaceMetadata(router.id, stat.name, {
          interfaceComment: stat.comment || null,
          interfaceMacAddress: stat.macAddress || null,
        });
      }
      
      addRealtimeTraffic(router.id, {
        portName: stat.name,
        comment: stat.comment,
        timestamp,
        rxBytesPerSecond: stat.rxBytesPerSecond,
        txBytesPerSecond: stat.txBytesPerSecond,
        totalBytesPerSecond: stat.totalBytesPerSecond,
      });
    }
    console.log(`[RealtimePoll] Stored ${stats.length} interfaces in memory`);


    // Broadcast real-time data to connected clients via WebSocket
    const pollingState = activeRealtimePolling.get(routerId);
    if (pollingState && pollingState.clients.size > 0) {
      // Get last 100 points PER INTERFACE (not total) to ensure all interfaces are represented
      const trafficData = getRealtimeTrafficPerInterface(routerId, 100);
      const message = JSON.stringify({
        type: "realtime_traffic",
        routerId,
        data: trafficData, // Already limited to 100 points per interface
      });
      
      pollingState.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  } catch (error: any) {
    console.error(`[RealtimePoll] Failed for router ${routerId}:`, error?.message || error);
  }
}

// Start on-demand real-time polling for a specific router
export function startRealtimePolling(routerId: string, client: WebSocket) {
  console.log(`[RealtimePoll] Starting real-time polling for router ${routerId}`);
  
  let pollingState = activeRealtimePolling.get(routerId);
  
  if (!pollingState) {
    // First client for this router - start polling
    const interval = setInterval(() => {
      pollSingleRouterRealtime(routerId).catch(error => {
        console.error(`[RealtimePoll] Error in real-time poll for ${routerId}:`, error);
      });
    }, 1000); // 1-second interval for true real-time
    
    pollingState = {
      interval,
      clients: new Set([client]),
    };
    activeRealtimePolling.set(routerId, pollingState);
    
    // Immediately poll once
    pollSingleRouterRealtime(routerId).catch(error => {
      console.error(`[RealtimePoll] Error in initial poll for ${routerId}:`, error);
    });
  } else {
    // Add client to existing polling
    pollingState.clients.add(client);
  }
  
  console.log(`[RealtimePoll] Router ${routerId} now has ${pollingState.clients.size} client(s)`);
}

// Stop on-demand real-time polling for a specific router
export function stopRealtimePolling(routerId: string, client: WebSocket) {
  const pollingState = activeRealtimePolling.get(routerId);
  
  if (!pollingState) {
    return;
  }
  
  pollingState.clients.delete(client);
  console.log(`[RealtimePoll] Client disconnected from router ${routerId}, ${pollingState.clients.size} client(s) remaining`);
  
  if (pollingState.clients.size === 0) {
    // No more clients - stop polling
    clearInterval(pollingState.interval);
    activeRealtimePolling.delete(routerId);
    console.log(`[RealtimePoll] Stopped real-time polling for router ${routerId} (no clients)`);
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

  // Check alerts every 60 seconds with 5-consecutive-checks confirmation (total 5 minutes)
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

  // Automated database backup daily at 3 AM (production only)
  if (process.env.NODE_ENV === "production") {
    cron.schedule("0 3 * * *", () => {
      createDatabaseBackup().catch(error => {
        console.error("[Scheduler] Unhandled error in database backup:", error);
      });
    });
  }

  // Run immediately on startup
  setTimeout(() => {
    pollRouterTraffic().catch(error => {
      console.error("[Scheduler] Error in initial traffic poll:", error);
    });
    checkAlerts().catch(error => {
      console.error("[Scheduler] Error in initial alert check:", error);
    });
  }, 5000); // Wait 5 seconds for app to fully initialize

  const backupStatus = process.env.NODE_ENV === "production" ? "daily database backup at 3 AM" : "database backup disabled (dev mode)";
  console.log(`[Scheduler] Scheduler started successfully (60s traffic polling + alert checking with 5-check confirmation = 5min total alert confirmation time, on-demand real-time traffic when router details page is open, 5min database persistence, 5min counter cleanup, daily data cleanup at 2 AM, ${backupStatus})`);
}

// Create automated database backup (compressed)
async function createDatabaseBackup(): Promise<void> {
  try {
    console.log("[Backup] Starting automated database backup...");
    
    const backupScript = "/app/scripts/backup-database.sh";
    const { stdout, stderr } = await execAsync(`bash ${backupScript}`);
    
    if (stdout) {
      console.log("[Backup] Backup completed successfully");
      // Log summary line only (last line of output)
      const summaryLine = stdout.trim().split('\n').slice(-3).join('\n');
      console.log(summaryLine);
    }
    
    if (stderr && !stderr.includes('WARNING')) {
      console.error("[Backup] Backup warnings:", stderr);
    }
  } catch (error: any) {
    console.error("[Backup] Failed to create database backup:", error.message);
    
    // Send alert to all superadmins
    try {
      const superadmins = await storage.getAllUsers();
      const admins = superadmins.filter(u => u.isSuperadmin);
      
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          title: "Database Backup Failed",
          message: `Automated database backup failed: ${error.message}`,
          type: "error",
          alertId: null,
        });
      }
    } catch (notifyError) {
      console.error("[Backup] Failed to send backup failure notification:", notifyError);
    }
  }
}
