// Database storage implementation - Referenced from javascript_database and javascript_log_in_with_replit blueprints
import {
  users,
  routers,
  routerGroups,
  monitoredPorts,
  trafficData,
  alerts,
  notifications,
  type User,
  type UpsertUser,
  type Router,
  type InsertRouter,
  type RouterGroup,
  type InsertRouterGroup,
  type MonitoredPort,
  type InsertMonitoredPort,
  type TrafficData,
  type Alert,
  type Notification,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lt, sql } from "drizzle-orm";
import CryptoJS from "crypto-js";

const ENCRYPTION_KEY = process.env.SESSION_SECRET || "default-key-change-in-production";

function encryptPassword(password: string): string {
  return CryptoJS.AES.encrypt(password, ENCRYPTION_KEY).toString();
}

function decryptPassword(encryptedPassword: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedPassword, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export interface IStorage {
  // User operations (IMPORTANT: mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Router operations
  getRouters(userId: string): Promise<Router[]>;
  getAllRouters(): Promise<Router[]>;
  getRouter(id: string): Promise<Router | undefined>;
  createRouter(router: Omit<InsertRouter, "encryptedPassword"> & { password: string }, userId: string): Promise<Router>;
  updateRouter(id: string, data: Partial<InsertRouter> & { password?: string }): Promise<Router>;
  deleteRouter(id: string): Promise<void>;
  updateRouterConnection(id: string, connected: boolean): Promise<void>;
  updateRouterReachability(id: string, reachable: boolean): Promise<void>;
  updateRouterHostname(id: string, hostname: string): Promise<void>;
  getRouterCredentials(id: string): Promise<{ username: string; password: string } | undefined>;

  // Router Groups operations
  getRouterGroups(userId: string): Promise<RouterGroup[]>;
  getRouterGroup(id: string): Promise<RouterGroup | undefined>;
  createRouterGroup(group: InsertRouterGroup, userId: string): Promise<RouterGroup>;
  updateRouterGroup(id: string, data: Partial<InsertRouterGroup>): Promise<RouterGroup>;
  deleteRouterGroup(id: string): Promise<void>;

  // Monitored Ports operations
  getMonitoredPorts(routerId: string): Promise<MonitoredPort[]>;
  getMonitoredPort(id: string): Promise<MonitoredPort | undefined>;
  createMonitoredPort(port: InsertMonitoredPort): Promise<MonitoredPort>;
  updateMonitoredPort(id: string, data: Partial<InsertMonitoredPort>): Promise<MonitoredPort>;
  deleteMonitoredPort(id: string): Promise<void>;
  getAllEnabledPorts(): Promise<(MonitoredPort & { router: Router })[]>;

  // Traffic Data operations
  insertTrafficData(data: Omit<TrafficData, "id" | "timestamp">): Promise<void>;
  getTrafficData(routerId: string, portId: string, since: Date): Promise<TrafficData[]>;
  getTrafficDataByPortName(routerId: string, portName: string, since: Date): Promise<TrafficData[]>;
  getRecentTraffic(routerId: string, since: Date): Promise<TrafficData[]>;
  cleanupOldTrafficData(before: Date): Promise<number>;

  // Alert operations
  getAlerts(userId: string): Promise<(Alert & { routerName: string })[]>;
  getAllAlerts(): Promise<Alert[]>;
  getLatestAlertForPort(portId: string): Promise<Alert | undefined>;
  getLatestUnacknowledgedAlertForPort(portId: string): Promise<Alert | undefined>;
  createAlert(alert: Omit<Alert, "id" | "createdAt" | "acknowledged" | "acknowledgedAt">): Promise<Alert>;
  acknowledgeAlert(id: string): Promise<void>;

  // Notification operations
  createNotification(notification: Omit<Notification, "id" | "sentAt" | "read">): Promise<Notification>;
  getNotifications(userId: string): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations (IMPORTANT: mandatory for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // Router operations
  async getRouters(userId: string): Promise<Router[]> {
    return db.select().from(routers).where(eq(routers.userId, userId)).orderBy(desc(routers.createdAt));
  }

  async getAllRouters(): Promise<Router[]> {
    return db.select().from(routers).orderBy(desc(routers.createdAt));
  }

  async getRouter(id: string): Promise<Router | undefined> {
    const [router] = await db.select().from(routers).where(eq(routers.id, id));
    return router;
  }

  async createRouter(routerData: Omit<InsertRouter, "encryptedPassword"> & { password: string }, userId: string): Promise<Router> {
    const { password, ...rest } = routerData;
    const [router] = await db
      .insert(routers)
      .values({
        ...rest,
        userId,
        encryptedPassword: encryptPassword(password),
      })
      .returning();
    return router;
  }

  async updateRouter(id: string, data: Partial<InsertRouter> & { password?: string }): Promise<Router> {
    const { password, ...rest } = data;
    const updateData: any = { ...rest, updatedAt: new Date() };
    
    if (password) {
      updateData.encryptedPassword = encryptPassword(password);
    }

    const [router] = await db
      .update(routers)
      .set(updateData)
      .where(eq(routers.id, id))
      .returning();
    return router;
  }

  async deleteRouter(id: string): Promise<void> {
    await db.delete(routers).where(eq(routers.id, id));
  }

  async updateRouterConnection(id: string, connected: boolean): Promise<void> {
    await db
      .update(routers)
      .set({
        connected,
        lastConnected: connected ? new Date() : undefined,
      })
      .where(eq(routers.id, id));
  }

  async updateRouterReachability(id: string, reachable: boolean): Promise<void> {
    await db
      .update(routers)
      .set({ reachable })
      .where(eq(routers.id, id));
  }

  async updateRouterHostname(id: string, hostname: string): Promise<void> {
    await db
      .update(routers)
      .set({ ipAddress: hostname })
      .where(eq(routers.id, id));
  }

  async getRouterCredentials(id: string): Promise<{ username: string; password: string } | undefined> {
    const [router] = await db.select().from(routers).where(eq(routers.id, id));
    if (!router) return undefined;
    
    return {
      username: router.username,
      password: decryptPassword(router.encryptedPassword),
    };
  }

  // Router Groups operations
  async getRouterGroups(userId: string): Promise<RouterGroup[]> {
    return db.select().from(routerGroups).where(eq(routerGroups.userId, userId)).orderBy(desc(routerGroups.createdAt));
  }

  async getRouterGroup(id: string): Promise<RouterGroup | undefined> {
    const [group] = await db.select().from(routerGroups).where(eq(routerGroups.id, id));
    return group;
  }

  async createRouterGroup(groupData: InsertRouterGroup, userId: string): Promise<RouterGroup> {
    const [group] = await db
      .insert(routerGroups)
      .values({
        ...groupData,
        userId,
      })
      .returning();
    return group;
  }

  async updateRouterGroup(id: string, data: Partial<InsertRouterGroup>): Promise<RouterGroup> {
    const [group] = await db
      .update(routerGroups)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(routerGroups.id, id))
      .returning();
    return group;
  }

  async deleteRouterGroup(id: string): Promise<void> {
    await db.delete(routerGroups).where(eq(routerGroups.id, id));
  }

  // Monitored Ports operations
  async getMonitoredPorts(routerId: string): Promise<MonitoredPort[]> {
    return db.select().from(monitoredPorts).where(eq(monitoredPorts.routerId, routerId));
  }

  async getMonitoredPort(id: string): Promise<MonitoredPort | undefined> {
    const [port] = await db.select().from(monitoredPorts).where(eq(monitoredPorts.id, id));
    return port;
  }

  async createMonitoredPort(portData: InsertMonitoredPort): Promise<MonitoredPort> {
    const [port] = await db.insert(monitoredPorts).values(portData).returning();
    return port;
  }

  async updateMonitoredPort(id: string, data: Partial<InsertMonitoredPort>): Promise<MonitoredPort> {
    const [port] = await db
      .update(monitoredPorts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(monitoredPorts.id, id))
      .returning();
    return port;
  }

  async deleteMonitoredPort(id: string): Promise<void> {
    await db.delete(monitoredPorts).where(eq(monitoredPorts.id, id));
  }

  async getAllEnabledPorts(): Promise<(MonitoredPort & { router: Router })[]> {
    // Return all enabled ports regardless of router connection status
    // This allows the scheduler to check reachability and attempt connections
    // for all routers, not just those already connected
    const result = await db
      .select()
      .from(monitoredPorts)
      .innerJoin(routers, eq(monitoredPorts.routerId, routers.id))
      .where(eq(monitoredPorts.enabled, true));

    return result.map(r => ({ ...r.monitored_ports, router: r.routers }));
  }

  // Traffic Data operations
  async insertTrafficData(data: Omit<TrafficData, "id" | "timestamp">): Promise<void> {
    await db.insert(trafficData).values(data);
  }

  async getTrafficData(routerId: string, portId: string, since: Date): Promise<TrafficData[]> {
    return db
      .select()
      .from(trafficData)
      .where(
        and(
          eq(trafficData.routerId, routerId),
          eq(trafficData.portId, portId),
          gte(trafficData.timestamp, since)
        )
      )
      .orderBy(trafficData.timestamp);
  }

  async getTrafficDataByPortName(routerId: string, portName: string, since: Date): Promise<TrafficData[]> {
    return db
      .select()
      .from(trafficData)
      .where(
        and(
          eq(trafficData.routerId, routerId),
          eq(trafficData.portName, portName),
          gte(trafficData.timestamp, since)
        )
      )
      .orderBy(trafficData.timestamp);
  }

  async getRecentTraffic(routerId: string, since: Date): Promise<TrafficData[]> {
    return db
      .select()
      .from(trafficData)
      .where(
        and(
          eq(trafficData.routerId, routerId),
          gte(trafficData.timestamp, since)
        )
      )
      .orderBy(trafficData.timestamp);
  }

  async cleanupOldTrafficData(before: Date): Promise<number> {
    const result = await db
      .delete(trafficData)
      .where(lt(trafficData.timestamp, before));
    
    return result.rowCount || 0;
  }

  // Alert operations
  async getAlerts(userId: string): Promise<(Alert & { routerName: string })[]> {
    const results = await db
      .select({
        alert: alerts,
        routerName: routers.name,
      })
      .from(alerts)
      .leftJoin(routers, eq(alerts.routerId, routers.id))
      .where(eq(alerts.userId, userId))
      .orderBy(desc(alerts.createdAt));
    
    return results.map(r => ({
      ...r.alert,
      routerName: r.routerName || "Unknown Router",
    }));
  }

  async getLatestAlertForPort(portId: string): Promise<Alert | undefined> {
    const [alert] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.portId, portId))
      .orderBy(desc(alerts.createdAt))
      .limit(1);
    return alert;
  }

  async getLatestUnacknowledgedAlertForPort(portId: string): Promise<Alert | undefined> {
    const [alert] = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.portId, portId), eq(alerts.acknowledged, false)))
      .orderBy(desc(alerts.createdAt))
      .limit(1);
    return alert;
  }

  async getAllAlerts(): Promise<Alert[]> {
    return db.select().from(alerts).orderBy(desc(alerts.createdAt));
  }

  async createAlert(alertData: Omit<Alert, "id" | "createdAt" | "acknowledged" | "acknowledgedAt">): Promise<Alert> {
    const [alert] = await db.insert(alerts).values(alertData).returning();
    return alert;
  }

  async acknowledgeAlert(id: string): Promise<void> {
    await db
      .update(alerts)
      .set({
        acknowledged: true,
        acknowledgedAt: new Date(),
      })
      .where(eq(alerts.id, id));
  }

  // Notification operations
  async createNotification(notificationData: Omit<Notification, "id" | "sentAt" | "read">): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(notificationData).returning();
    return notification;
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.sentAt));
  }

  async markNotificationRead(id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id));
  }
}

export const storage = new DatabaseStorage();
