import { RouterOSAPI } from "routeros-client";
import * as snmp from "net-snmp";
import https from "https";
import net from "net";

export interface MikrotikConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  restEnabled?: boolean;
  restPort?: number;
  snmpEnabled?: boolean;
  snmpCommunity?: string;
  snmpVersion?: string;
  snmpPort?: number;
}

export interface InterfaceStats {
  name: string;
  rxBytesPerSecond: number;
  txBytesPerSecond: number;
  totalBytesPerSecond: number;
}

export interface RouterInfo {
  identity: string;
  model: string;
  routerOsVersion: string;
  uptime: string;
}

// Standard SNMP OIDs for interface statistics (IF-MIB)
const SNMP_OIDS = {
  ifDescr: "1.3.6.1.2.1.2.2.1.2",         // Interface description
  ifInOctets: "1.3.6.1.2.1.2.2.1.10",      // Bytes received (32-bit, for fallback)
  ifOutOctets: "1.3.6.1.2.1.2.2.1.16",     // Bytes transmitted (32-bit, for fallback)
  ifHCInOctets: "1.3.6.1.2.1.31.1.1.1.6",  // High Capacity bytes received (64-bit)
  ifHCOutOctets: "1.3.6.1.2.1.31.1.1.1.10", // High Capacity bytes transmitted (64-bit)
  ifOperStatus: "1.3.6.1.2.1.2.2.1.8",     // Interface operational status
  sysDescr: "1.3.6.1.2.1.1.1.0",           // System description
  sysUpTime: "1.3.6.1.2.1.1.3.0",          // System uptime
  sysName: "1.3.6.1.2.1.1.5.0",            // System name
};

// Global cache for SNMP byte counters (persists across client instances)
const snmpByteCountCache: Map<string, { rx: number; tx: number; timestamp: number }> = new Map();

export class MikrotikClient {
  private connection: MikrotikConnection;

  constructor(connection: MikrotikConnection) {
    this.connection = connection;
  }

  private getSNMPVersion(): number {
    const version = this.connection.snmpVersion || "2c";
    if (version === "1") return snmp.Version1;
    // Only v1 and v2c supported (v3 requires auth/priv parameters)
    return snmp.Version2c;
  }

  private createSNMPSession(): snmp.Session {
    const options: snmp.SessionOptions = {
      port: this.connection.snmpPort || 161,
      retries: 1,
      timeout: 5000,
      version: this.getSNMPVersion(),
    };

    return snmp.createSession(
      this.connection.host,
      this.connection.snmpCommunity || "public",
      options
    );
  }

  async checkReachability(): Promise<boolean> {
    // Network reachability check using TCP connection tests
    // NOTE: ICMP ping is not available in Replit cloud environment due to security restrictions
    // This method tests common ports to determine if the host is reachable on the network
    
    return new Promise((resolve) => {
      // Test multiple common ports to maximize chance of detecting reachability
      // Include MikroTik-specific ports and common web ports
      const portsToTest = [
        this.connection.port, // Primary API port
        8291, // MikroTik Winbox port (commonly open)
        80,   // HTTP (commonly open)
        443,  // HTTPS (commonly open)
        ...(this.connection.restEnabled ? [this.connection.restPort || 443] : []),
        ...(this.connection.snmpEnabled ? [this.connection.snmpPort || 161] : []),
      ];
      
      // Remove duplicates
      const uniquePorts = [...new Set(portsToTest)];
      
      let tested = 0;
      let reachable = false;
      
      // Try each port with a quick timeout
      for (const port of uniquePorts) {
        const socket = new net.Socket();
        socket.setTimeout(2000); // 2 second timeout per port
        
        socket.on('connect', () => {
          reachable = true;
          socket.destroy();
          resolve(true);
        });
        
        socket.on('timeout', () => {
          socket.destroy();
          tested++;
          if (tested >= uniquePorts.length && !reachable) {
            resolve(false);
          }
        });
        
        socket.on('error', () => {
          socket.destroy();
          tested++;
          if (tested >= uniquePorts.length && !reachable) {
            resolve(false);
          }
        });
        
        socket.connect(port, this.connection.host);
      }
      
      // Edge case: no ports to test
      if (uniquePorts.length === 0) {
        resolve(false);
      }
    });
  }

  async testSNMPConnection(): Promise<boolean> {
    if (!this.connection.snmpEnabled) {
      return false;
    }

    return new Promise((resolve) => {
      const session = this.createSNMPSession();
      
      session.get([SNMP_OIDS.sysName], (error, varbinds) => {
        session.close();
        if (error) {
          console.error("SNMP connection test failed:", error);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  async getRouterInfoViaSNMP(): Promise<RouterInfo | null> {
    if (!this.connection.snmpEnabled) {
      return null;
    }

    return new Promise((resolve) => {
      const session = this.createSNMPSession();
      const oids = [SNMP_OIDS.sysName, SNMP_OIDS.sysDescr, SNMP_OIDS.sysUpTime];

      session.get(oids, (error, varbinds) => {
        session.close();
        
        if (error) {
          console.error("Failed to get router info via SNMP:", error);
          resolve(null);
          return;
        }

        if (!Array.isArray(varbinds) || varbinds.length < 3) {
          resolve(null);
          return;
        }

        const sysName = varbinds[0].value?.toString() || "Unknown";
        const sysDescr = varbinds[1].value?.toString() || "";
        const sysUpTime = varbinds[2].value?.toString() || "0";

        // Parse MikroTik system description
        const modelMatch = sysDescr.match(/RouterOS\s+([^\s]+)/);
        const versionMatch = sysDescr.match(/version\s+([^\s]+)/);

        resolve({
          identity: sysName,
          model: modelMatch ? modelMatch[1] : "MikroTik",
          routerOsVersion: versionMatch ? versionMatch[1] : "Unknown",
          uptime: this.formatUptime(parseInt(sysUpTime)),
        });
      });
    });
  }

  private formatUptime(ticks: number): string {
    const seconds = Math.floor(ticks / 100);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  private processSNMPResults(
    interfaceData: Map<string, { name?: string; rxBytes?: number; txBytes?: number }>,
    resolve: (value: InterfaceStats[]) => void
  ): void {
    const now = Date.now();
    const results: InterfaceStats[] = [];

    for (const [index, data] of interfaceData.entries()) {
      if (!data.name || data.rxBytes === undefined || data.txBytes === undefined) {
        continue;
      }

      const key = `${this.connection.host}:${data.name}`;
      const previous = snmpByteCountCache.get(key);

      let rxBytesPerSecond = 0;
      let txBytesPerSecond = 0;

      if (previous) {
        const timeDelta = (now - previous.timestamp) / 1000; // Convert to seconds
        if (timeDelta > 0) {
          rxBytesPerSecond = Math.max(0, (data.rxBytes - previous.rx) / timeDelta);
          txBytesPerSecond = Math.max(0, (data.txBytes - previous.tx) / timeDelta);
        }
      }

      // Store current values for next calculation
      snmpByteCountCache.set(key, {
        rx: data.rxBytes,
        tx: data.txBytes,
        timestamp: now,
      });

      results.push({
        name: data.name,
        rxBytesPerSecond,
        txBytesPerSecond,
        totalBytesPerSecond: rxBytesPerSecond + txBytesPerSecond,
      });
    }

    resolve(results);
  }

  async getInterfaceStatsViaSNMP(): Promise<InterfaceStats[]> {
    if (!this.connection.snmpEnabled) {
      return [];
    }

    return new Promise((resolve) => {
      const session = this.createSNMPSession();
      const interfaceData: Map<string, { name?: string; rxBytes?: number; txBytes?: number }> = new Map();

      // First, get interface names
      session.table(SNMP_OIDS.ifDescr, 100, (error, table) => {
        if (error) {
          console.error("Failed to get interface names via SNMP:", error);
          session.close();
          resolve([]);
          return;
        }

        // Store interface names
        for (const [index, entry] of Object.entries(table)) {
          const name = entry[SNMP_OIDS.ifDescr + "." + index]?.toString();
          if (name) {
            interfaceData.set(index, { name });
          }
        }

        // Try to get 64-bit counters first (prevents rollover issues)
        session.table(SNMP_OIDS.ifHCInOctets, 100, (error2, rxTable64) => {
          // If 64-bit counters fail, try 32-bit as fallback
          if (error2) {
            console.log("64-bit counters not available, using 32-bit counters");
            
            // Get 32-bit RX bytes
            session.table(SNMP_OIDS.ifInOctets, 100, (error2_32, rxTable32) => {
              if (error2_32) {
                console.error("Failed to get RX bytes via SNMP:", error2_32);
                session.close();
                resolve([]);
                return;
              }

              for (const [index, entry] of Object.entries(rxTable32)) {
                const rxBytes = parseInt(entry[SNMP_OIDS.ifInOctets + "." + index]?.toString() || "0");
                const iface = interfaceData.get(index);
                if (iface) {
                  iface.rxBytes = rxBytes;
                }
              }

              // Get 32-bit TX bytes
              session.table(SNMP_OIDS.ifOutOctets, 100, (error3_32, txTable32) => {
                session.close();

                if (error3_32) {
                  console.error("Failed to get TX bytes via SNMP:", error3_32);
                  resolve([]);
                  return;
                }

                for (const [index, entry] of Object.entries(txTable32)) {
                  const txBytes = parseInt(entry[SNMP_OIDS.ifOutOctets + "." + index]?.toString() || "0");
                  const iface = interfaceData.get(index);
                  if (iface) {
                    iface.txBytes = txBytes;
                  }
                }

                // Process results after getting 32-bit counters
                this.processSNMPResults(interfaceData, resolve);
              });
            });
            return;
          }

          // Use 64-bit counters
          for (const [index, entry] of Object.entries(rxTable64)) {
            const rxBytes = parseInt(entry[SNMP_OIDS.ifHCInOctets + "." + index]?.toString() || "0");
            const iface = interfaceData.get(index);
            if (iface) {
              iface.rxBytes = rxBytes;
            }
          }

          // Get 64-bit TX bytes
          session.table(SNMP_OIDS.ifHCOutOctets, 100, (error3, txTable64) => {
            session.close();

            if (error3) {
              console.error("Failed to get TX bytes via SNMP:", error3);
              resolve([]);
              return;
            }

            for (const [index, entry] of Object.entries(txTable64)) {
              const txBytes = parseInt(entry[SNMP_OIDS.ifHCOutOctets + "." + index]?.toString() || "0");
              const iface = interfaceData.get(index);
              if (iface) {
                iface.txBytes = txBytes;
              }
            }

            // Process results after getting 64-bit counters
            this.processSNMPResults(interfaceData, resolve);
          });
        });
      });
    });
  }

  async getInterfaceListViaSNMP(): Promise<string[]> {
    if (!this.connection.snmpEnabled) {
      return [];
    }

    return new Promise((resolve) => {
      const session = this.createSNMPSession();

      session.table(SNMP_OIDS.ifDescr, 100, (error, table) => {
        session.close();

        if (error) {
          console.error("Failed to get interface list via SNMP:", error);
          resolve([]);
          return;
        }

        const interfaces: string[] = [];
        for (const [_, entry] of Object.entries(table)) {
          const name = Object.values(entry)[0]?.toString();
          if (name) {
            interfaces.push(name);
          }
        }

        resolve(interfaces);
      });
    });
  }

  // ============ REST API Methods (RouterOS v7.1+) ============

  private async restRequest(endpoint: string, allowSelfSigned: boolean = true): Promise<any> {
    const restPort = this.connection.restPort || 443;
    const auth = Buffer.from(`${this.connection.user}:${this.connection.password}`).toString('base64');

    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.connection.host,
        port: restPort,
        path: endpoint,
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
        },
        // SECURITY NOTE: MikroTik routers typically use self-signed certificates for REST API.
        // allowSelfSigned=true is the practical default for MikroTik compatibility.
        // For production deployments with proper CA-signed certificates, set to false.
        // Future enhancement: Add per-router configuration option for certificate verification.
        rejectUnauthorized: !allowSelfSigned,
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              reject(new Error(`Failed to parse REST API response: ${error}`));
            }
          } else {
            reject(new Error(`REST API request failed: ${res.statusCode} ${res.statusMessage}`));
          }
        });
      });

      req.on('error', (error: any) => {
        console.error(`REST API request to ${endpoint} failed:`, error.message);
        reject(error);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('REST API request timeout'));
      });

      req.end();
    });
  }

  async testRESTConnection(): Promise<boolean> {
    if (!this.connection.restEnabled) {
      return false;
    }

    try {
      await this.restRequest('/rest/system/resource');
      return true;
    } catch (error) {
      console.error("REST API connection test failed:", error);
      return false;
    }
  }

  async getRouterInfoViaREST(): Promise<RouterInfo | null> {
    if (!this.connection.restEnabled) {
      return null;
    }

    try {
      const [identity, resource] = await Promise.all([
        this.restRequest('/rest/system/identity'),
        this.restRequest('/rest/system/resource'),
      ]);

      // MikroTik REST API returns objects directly, not arrays
      return {
        identity: identity?.name || 'Unknown',
        model: resource?.['board-name'] || 'Unknown',
        routerOsVersion: resource?.['version'] || 'Unknown',
        uptime: resource?.['uptime'] || '0',
      };
    } catch (error) {
      console.error("Failed to get router info via REST:", error);
      return null;
    }
  }

  async getInterfaceListViaREST(): Promise<string[]> {
    if (!this.connection.restEnabled) {
      return [];
    }

    try {
      const interfaces = await this.restRequest('/rest/interface');
      return interfaces.map((iface: any) => iface.name).filter(Boolean);
    } catch (error) {
      console.error("Failed to get interface list via REST:", error);
      return [];
    }
  }

  async getInterfaceStatsViaREST(): Promise<InterfaceStats[]> {
    if (!this.connection.restEnabled) {
      return [];
    }

    try {
      console.log(`[REST API] Attempting to connect to ${this.connection.host}:${this.connection.restPort || 443}...`);
      // Get current interface stats
      const interfaces = await this.restRequest('/rest/interface');
      console.log(`[REST API] Successfully retrieved ${interfaces.length} interfaces`);
      console.log(`[REST API] Interface names:`, interfaces.map((i: any) => i.name).join(', '));
      
      const result: InterfaceStats[] = [];
      
      for (const iface of interfaces) {
        // REST API doesn't provide real-time rates directly, so we calculate from byte counters
        const name = iface.name;
        const rxBytes = parseInt(iface['rx-byte'] || '0');
        const txBytes = parseInt(iface['tx-byte'] || '0');
        
        // Use cache to calculate rates (same approach as SNMP)
        const cacheKey = `rest-${this.connection.host}-${name}`;
        const cached = snmpByteCountCache.get(cacheKey);
        const now = Date.now();
        
        let rxRate = 0;
        let txRate = 0;
        
        if (cached) {
          const timeDiff = (now - cached.timestamp) / 1000; // seconds
          if (timeDiff > 0) {
            rxRate = Math.max(0, (rxBytes - cached.rx) / timeDiff);
            txRate = Math.max(0, (txBytes - cached.tx) / timeDiff);
          }
        }
        
        // Always add the interface to results (even on first poll with 0 rates)
        result.push({
          name,
          rxBytesPerSecond: rxRate,
          txBytesPerSecond: txRate,
          totalBytesPerSecond: rxRate + txRate,
        });
        
        // Update cache for next poll
        snmpByteCountCache.set(cacheKey, { rx: rxBytes, tx: txBytes, timestamp: now });
      }
      
      return result;
    } catch (error) {
      console.error("Failed to get interface stats via REST:", error);
      return [];
    }
  }

  async testConnection(): Promise<boolean> {
    // Try native API first
    try {
      const api = new RouterOSAPI({
        host: this.connection.host,
        user: this.connection.user,
        password: this.connection.password,
        port: this.connection.port,
        timeout: 10,
      });

      await api.connect();
      await api.close();
      return true;
    } catch (error: any) {
      console.error("MikroTik native API connection test failed:", error);
      
      // Try REST API if enabled
      if (this.connection.restEnabled) {
        console.log("Falling back to REST API connection test...");
        const restSuccess = await this.testRESTConnection();
        if (restSuccess) return true;
      }
      
      // Try SNMP if enabled
      if (this.connection.snmpEnabled) {
        console.log("Falling back to SNMP connection test...");
        return await this.testSNMPConnection();
      }
      
      return false;
    }
  }

  async getInterfaceStats(): Promise<InterfaceStats[]> {
    let api: RouterOSAPI | null = null;

    try {
      api = new RouterOSAPI({
        host: this.connection.host,
        user: this.connection.user,
        password: this.connection.password,
        port: this.connection.port,
        timeout: 10,
      });

      await api.connect();

      // Get interface traffic statistics
      const stats = await api.write("/interface/monitor-traffic", [
        "=interface=all",
        "=once="
      ]);

      await api.close();

      // Transform the data into our format
      const result: InterfaceStats[] = [];
      
      if (Array.isArray(stats)) {
        for (const stat of stats) {
          const name = stat.name || stat.interface || "unknown";
          const rxRate = parseInt(stat["rx-bits-per-second"] || "0") / 8; // Convert bits to bytes
          const txRate = parseInt(stat["tx-bits-per-second"] || "0") / 8;

          result.push({
            name,
            rxBytesPerSecond: rxRate,
            txBytesPerSecond: txRate,
            totalBytesPerSecond: rxRate + txRate,
          });
        }
      }

      return result;
    } catch (error: any) {
      console.error("Failed to get interface stats via native API:", error);
      if (api) {
        try {
          await api.close();
        } catch (e) {
          // Ignore close errors
        }
      }
      
      // Try REST API if enabled
      if (this.connection.restEnabled) {
        console.log("Native API failed, falling back to REST API...");
        try {
          const restStats = await this.getInterfaceStatsViaREST();
          if (restStats.length > 0) return restStats;
        } catch (restError) {
          console.error("REST API also failed:", restError);
        }
      }
      
      // Try SNMP if enabled (for any API failure: connection, permission, timeout, etc.)
      if (this.connection.snmpEnabled) {
        console.log("Native API and REST API failed, falling back to SNMP...");
        return await this.getInterfaceStatsViaSNMP();
      }
      
      throw new Error("Failed to retrieve interface statistics from MikroTik router");
    }
  }

  async getInterfaceList(): Promise<string[]> {
    let api: RouterOSAPI | null = null;

    try {
      api = new RouterOSAPI({
        host: this.connection.host,
        user: this.connection.user,
        password: this.connection.password,
        port: this.connection.port,
        timeout: 10,
      });

      await api.connect();
      const interfaces = await api.write("/interface/print");
      await api.close();

      if (Array.isArray(interfaces)) {
        return interfaces.map((iface: any) => iface.name).filter(Boolean);
      }

      return [];
    } catch (error: any) {
      console.error("Failed to get interface list via native API:", error);
      if (api) {
        try {
          await api.close();
        } catch (e) {
          // Ignore close errors
        }
      }
      
      // Try REST API if enabled
      if (this.connection.restEnabled) {
        console.log("Native API failed, falling back to REST API for interface list...");
        const restList = await this.getInterfaceListViaREST();
        if (restList.length > 0) return restList;
      }
      
      // Try SNMP if enabled
      if (this.connection.snmpEnabled) {
        console.log("Native API and REST API failed, falling back to SNMP for interface list...");
        return await this.getInterfaceListViaSNMP();
      }
      
      return [];
    }
  }
}
