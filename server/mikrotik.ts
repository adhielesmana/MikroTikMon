import { RouterOSAPI } from "routeros-client";
import * as snmp from "net-snmp";

export interface MikrotikConnection {
  host: string;
  port: number;
  user: string;
  password: string;
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

  async testConnection(): Promise<boolean> {
    // Try API first
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
      console.error("MikroTik API connection test failed:", error);
      
      // If API fails and SNMP is enabled, try SNMP
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
      console.error("Failed to get interface stats via API:", error);
      if (api) {
        try {
          await api.close();
        } catch (e) {
          // Ignore close errors
        }
      }
      
      // Fall back to SNMP if enabled (for any API failure: connection, permission, timeout, etc.)
      if (this.connection.snmpEnabled) {
        console.log("API failed, falling back to SNMP...");
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
      console.error("Failed to get interface list via API:", error);
      if (api) {
        try {
          await api.close();
        } catch (e) {
          // Ignore close errors
        }
      }
      
      // Fall back to SNMP if enabled
      if (this.connection.snmpEnabled) {
        console.log("API failed, falling back to SNMP for interface list...");
        return await this.getInterfaceListViaSNMP();
      }
      
      return [];
    }
  }
}
