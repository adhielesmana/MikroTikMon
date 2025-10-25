import { RouterOSAPI } from "routeros-client";

export interface MikrotikConnection {
  host: string;
  port: number;
  user: string;
  password: string;
}

export interface InterfaceStats {
  name: string;
  rxBytesPerSecond: number;
  txBytesPerSecond: number;
  totalBytesPerSecond: number;
}

export class MikrotikClient {
  private connection: MikrotikConnection;

  constructor(connection: MikrotikConnection) {
    this.connection = connection;
  }

  async testConnection(): Promise<boolean> {
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
    } catch (error) {
      console.error("MikroTik connection test failed:", error);
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
      // Note: This is a simplified version. Real implementation would track
      // byte counters over time to calculate per-second rates
      const interfaces = await api.write("/interface/print");
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
    } catch (error) {
      console.error("Failed to get interface stats:", error);
      if (api) {
        try {
          await api.close();
        } catch (e) {
          // Ignore close errors
        }
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
    } catch (error) {
      console.error("Failed to get interface list:", error);
      if (api) {
        try {
          await api.close();
        } catch (e) {
          // Ignore close errors
        }
      }
      return [];
    }
  }
}
