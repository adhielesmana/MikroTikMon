import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  boolean,
  integer,
  real,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table - Required for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - Required for Replit Auth, extended with role and enabled status
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique(), // For local authentication
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 20 }).notNull().default("user"), // 'admin' or 'user'
  isSuperadmin: boolean("is_superadmin").notNull().default(false), // Immutable hardcoded superadmin flag
  enabled: boolean("enabled").notNull().default(false), // New users disabled by default
  passwordHash: text("password_hash"), // For local authentication (super admin)
  mustChangePassword: boolean("must_change_password").notNull().default(false), // Force password change on first login
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Router Groups table - Organize routers by location/function
export const routerGroups = pgTable("router_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 7 }).default("#3b82f6"), // Hex color for UI
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique().on(table.userId, table.name),
]);

// Routers table - Stores MikroTik router configurations
export const routers = pgTable("routers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  groupId: varchar("group_id").references(() => routerGroups.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  ipAddress: varchar("ip_address", { length: 255 }).notNull(), // User-entered IP/hostname for reachability checks
  cloudDdnsHostname: varchar("cloud_ddns_hostname", { length: 255 }), // Auto-extracted Cloud DDNS hostname from SSL certificate
  port: integer("port").notNull().default(8728), // MikroTik API port
  username: varchar("username", { length: 255 }).notNull(),
  // Password is encrypted using crypto-js
  encryptedPassword: text("encrypted_password").notNull(),
  connected: boolean("connected").notNull().default(false),
  reachable: boolean("reachable").notNull().default(false), // Basic network connectivity check
  lastConnected: timestamp("last_connected"),
  // REST API configuration for HTTPS fallback (RouterOS v7.1+)
  restEnabled: boolean("rest_enabled").notNull().default(false),
  restPort: integer("rest_port").notNull().default(443), // HTTPS port
  // SNMP configuration for fallback monitoring
  snmpEnabled: boolean("snmp_enabled").notNull().default(false),
  snmpCommunity: varchar("snmp_community", { length: 255 }).default("public"),
  snmpVersion: varchar("snmp_version", { length: 10 }).default("2c"), // "1", "2c", or "3"
  snmpPort: integer("snmp_port").notNull().default(161),
  // Interface filtering - 'none' (hide all), 'static' (show static only), 'all' (show all including dynamic)
  interfaceDisplayMode: varchar("interface_display_mode", { length: 20 }).notNull().default("static"),
  // Last successful connection method - used by scheduler to avoid retesting fallbacks every time
  lastSuccessfulConnectionMethod: varchar("last_successful_connection_method", { length: 20 }).default("native"), // 'native', 'rest', or 'snmp'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User-Router Assignments table - Junction table for many-to-many relationship
// Allows super admins to assign routers to multiple users
export const userRouters = pgTable("user_routers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  routerId: varchar("router_id").notNull().references(() => routers.id, { onDelete: "cascade" }),
  assignedBy: varchar("assigned_by").notNull().references(() => users.id, { onDelete: "cascade" }), // Super admin who made the assignment
  assignedAt: timestamp("assigned_at").defaultNow(),
}, (table) => [
  unique().on(table.userId, table.routerId), // Prevent duplicate assignments
  index("idx_user_routers_user").on(table.userId),
  index("idx_user_routers_router").on(table.routerId),
]);

// Relations - Defined after all tables
export const routerGroupsRelations = relations(routerGroups, ({ one, many }) => ({
  user: one(users, {
    fields: [routerGroups.userId],
    references: [users.id],
  }),
  routers: many(routers),
}));

export const routersRelations = relations(routers, ({ one, many }) => ({
  user: one(users, {
    fields: [routers.userId],
    references: [users.id],
  }),
  group: one(routerGroups, {
    fields: [routers.groupId],
    references: [routerGroups.id],
  }),
  monitoredPorts: many(monitoredPorts),
  trafficData: many(trafficData),
  alerts: many(alerts),
  userAssignments: many(userRouters),
}));

export const userRoutersRelations = relations(userRouters, ({ one }) => ({
  user: one(users, {
    fields: [userRouters.userId],
    references: [users.id],
  }),
  router: one(routers, {
    fields: [userRouters.routerId],
    references: [routers.id],
  }),
  assignedByUser: one(users, {
    fields: [userRouters.assignedBy],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  routerAssignments: many(userRouters),
}));

// Router Group Schemas
export const insertRouterGroupSchema = createInsertSchema(routerGroups).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRouterGroup = z.infer<typeof insertRouterGroupSchema>;
export type RouterGroup = typeof routerGroups.$inferSelect;

// Custom schema for router input - accepts plain password instead of encryptedPassword
export const insertRouterSchema = z.object({
  name: z.string().min(1, "Router name is required"),
  ipAddress: z.string().min(1, "IP address is required"),
  port: z.number().min(1).max(65535).default(8728),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  groupId: z.string().optional(),
  restEnabled: z.boolean().default(false),
  restPort: z.number().min(1).max(65535).default(443),
  snmpEnabled: z.boolean().default(false),
  snmpCommunity: z.string().default("public"),
  snmpVersion: z.enum(["1", "2c"]).default("2c"), // Only v1 and v2c supported (v3 requires additional auth params)
  snmpPort: z.number().min(1).max(65535).default(161),
  interfaceDisplayMode: z.enum(["none", "static", "all"]).default("static"),
});

export type InsertRouter = z.infer<typeof insertRouterSchema>;
export type Router = typeof routers.$inferSelect;

// User-Router Assignment Schemas
export const insertUserRouterSchema = createInsertSchema(userRouters).omit({
  id: true,
  assignedAt: true,
});

export type InsertUserRouter = z.infer<typeof insertUserRouterSchema>;
export type UserRouter = typeof userRouters.$inferSelect;

// Router Interfaces table - Caches ALL interfaces from each router (monitored + unmonitored)
export const routerInterfaces = pgTable("router_interfaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  routerId: varchar("router_id").notNull().references(() => routers.id, { onDelete: "cascade" }),
  interfaceName: varchar("interface_name", { length: 255 }).notNull(),
  interfaceComment: text("interface_comment"),
  interfaceMacAddress: varchar("interface_mac_address", { length: 17 }),
  interfaceType: varchar("interface_type", { length: 50 }), // e.g., "ether", "vlan", "bridge"
  isRunning: boolean("is_running").default(false),
  isDisabled: boolean("is_disabled").default(false),
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique().on(table.routerId, table.interfaceName),
  index("idx_router_interfaces_router").on(table.routerId),
]);

export type RouterInterface = typeof routerInterfaces.$inferSelect;
export type InsertRouterInterface = typeof routerInterfaces.$inferInsert;

// Monitored Ports table - Stores which ports to monitor and their thresholds
export const monitoredPorts = pgTable("monitored_ports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  routerId: varchar("router_id").notNull().references(() => routers.id, { onDelete: "cascade" }),
  portName: varchar("port_name", { length: 255 }).notNull(), // e.g., "ether1", "ether2"
  enabled: boolean("enabled").notNull().default(true),
  // Minimum threshold in bytes per second
  minThresholdBps: integer("min_threshold_bps").notNull().default(0),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  popupNotifications: boolean("popup_notifications").notNull().default(true),
  // Cached interface metadata - fetched from router and stored for performance
  interfaceComment: text("interface_comment"), // Interface comment/description from MikroTik
  interfaceMacAddress: varchar("interface_mac_address", { length: 17 }), // MAC address in format XX:XX:XX:XX:XX:XX
  lastInterfaceUpdate: timestamp("last_interface_update"), // When we last fetched interface metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique().on(table.routerId, table.portName),
]);

export const monitoredPortsRelations = relations(monitoredPorts, ({ one, many }) => ({
  router: one(routers, {
    fields: [monitoredPorts.routerId],
    references: [routers.id],
  }),
  trafficData: many(trafficData),
  alerts: many(alerts),
}));

export const insertMonitoredPortSchema = createInsertSchema(monitoredPorts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMonitoredPort = z.infer<typeof insertMonitoredPortSchema>;
export type MonitoredPort = typeof monitoredPorts.$inferSelect;

// Traffic Data table - Stores historical traffic data
export const trafficData = pgTable("traffic_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  routerId: varchar("router_id").notNull().references(() => routers.id, { onDelete: "cascade" }),
  portId: varchar("port_id").references(() => monitoredPorts.id, { onDelete: "cascade" }), // Nullable for non-monitored interfaces
  portName: varchar("port_name", { length: 255 }).notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  rxBytesPerSecond: real("rx_bytes_per_second").notNull().default(0), // Download
  txBytesPerSecond: real("tx_bytes_per_second").notNull().default(0), // Upload
  totalBytesPerSecond: real("total_bytes_per_second").notNull().default(0), // Total
}, (table) => [
  index("idx_traffic_data_router_port_name_time").on(table.routerId, table.portName, table.timestamp),
  index("idx_traffic_data_timestamp").on(table.timestamp),
]);

export const trafficDataRelations = relations(trafficData, ({ one }) => ({
  router: one(routers, {
    fields: [trafficData.routerId],
    references: [routers.id],
  }),
  port: one(monitoredPorts, {
    fields: [trafficData.portId],
    references: [monitoredPorts.id],
  }),
}));

export type TrafficData = typeof trafficData.$inferSelect;

// Alerts table - Stores triggered alerts (supports both port-level and router-level alerts)
export const alerts = pgTable("alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  routerId: varchar("router_id").notNull().references(() => routers.id, { onDelete: "cascade" }),
  portId: varchar("port_id").references(() => monitoredPorts.id, { onDelete: "cascade" }), // nullable for router-level alerts
  portName: varchar("port_name", { length: 255 }), // nullable for router-level alerts
  portComment: varchar("port_comment", { length: 255 }), // Interface comment from MikroTik (nullable)
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  severity: varchar("severity", { length: 20 }).notNull().default("warning"), // 'critical', 'warning', 'info'
  message: text("message").notNull(),
  currentTrafficBps: real("current_traffic_bps"), // nullable for router-level alerts
  thresholdBps: real("threshold_bps"), // nullable for router-level alerts
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: varchar("acknowledged_by", { length: 255 }), // "system" for auto-acknowledgment or user's full name for manual acknowledgment
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_alerts_user_created").on(table.userId, table.createdAt),
  index("idx_alerts_router").on(table.routerId),
  // CRITICAL: Unique constraint to prevent duplicate alerts from multiple app instances
  // Only one unacknowledged alert per port allowed
  unique("unique_alert_port_unack").on(table.routerId, table.portId, table.acknowledged),
]);

export const alertsRelations = relations(alerts, ({ one }) => ({
  router: one(routers, {
    fields: [alerts.routerId],
    references: [routers.id],
  }),
  port: one(monitoredPorts, {
    fields: [alerts.portId],
    references: [monitoredPorts.id],
  }),
  user: one(users, {
    fields: [alerts.userId],
    references: [users.id],
  }),
}));

export type Alert = typeof alerts.$inferSelect;

// Notifications table - Stores notification history
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  alertId: varchar("alert_id").references(() => alerts.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(), // 'email', 'popup'
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  sentAt: timestamp("sent_at").defaultNow(),
}, (table) => [
  index("idx_notifications_user_sent").on(table.userId, table.sentAt),
]);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  alert: one(alerts, {
    fields: [notifications.alertId],
    references: [alerts.id],
  }),
}));

export type Notification = typeof notifications.$inferSelect;

// App Settings table - Global application settings
export const appSettings = pgTable("app_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  logoUrl: text("logo_url"), // Can be a file upload URL or external URL
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type AppSettings = typeof appSettings.$inferSelect;
