// API Routes - Referenced from javascript_log_in_with_replit and javascript_websocket blueprints
import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin, isSuperadmin, isEnabled } from "./replitAuth";
import { MikrotikClient } from "./mikrotik";
import { emailService } from "./emailService";
import { startScheduler, setWebSocketServer, startRealtimePolling, stopRealtimePolling } from "./scheduler";
import { insertRouterSchema } from "@shared/schema";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcrypt";

// Helper function to get user ID from request (handles both OIDC and local/Google auth)
function getUserId(req: any): string {
  // For OIDC/Replit Auth users, the ID is in claims.sub
  if (req.user.claims?.sub) {
    return req.user.claims.sub;
  }
  // For local admin and Google OAuth users, the ID is directly on the user object
  if (req.user.id) {
    return req.user.id;
  }
  throw new Error("User ID not found in session");
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Health check endpoint (no auth required)
  app.get('/api/health', async (_req, res) => {
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Database health check endpoint (no auth required) - for login page status indicator
  app.get('/api/health/db', async (_req, res) => {
    try {
      // Try to query the database
      await storage.getAllUsers();
      res.status(200).json({ 
        status: 'connected',
        reachable: true,
        message: 'Database online and connected'
      });
    } catch (error) {
      console.error("Database health check failed:", error);
      res.status(200).json({ 
        status: 'disconnected',
        reachable: true,
        message: 'Database online but disconnected'
      });
    }
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Check which authentication methods are available
  app.get('/api/auth/methods', async (_req, res) => {
    try {
      const methods = {
        local: true, // Always available
        google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        replit: !!(process.env.REPL_ID && process.env.ISSUER_URL),
      };
      res.json(methods);
    } catch (error) {
      console.error("Error checking auth methods:", error);
      res.status(500).json({ message: "Failed to check auth methods" });
    }
  });

  // Router routes
  app.get("/api/routers", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      // Admin users can see all routers, normal users only see their own
      const routers = user?.role === "admin" 
        ? await storage.getAllRouters() 
        : await storage.getRouters(userId);
      
      res.json(routers);
    } catch (error) {
      console.error("Error fetching routers:", error);
      res.status(500).json({ message: "Failed to fetch routers" });
    }
  });

  app.post("/api/routers", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const data = insertRouterSchema.parse(req.body);
      
      const router = await storage.createRouter(data, userId);
      res.json(router);
    } catch (error: any) {
      console.error("Error creating router:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ message: "Invalid router data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create router" });
      }
    }
  });

  app.get("/api/routers/:id", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      // Check ownership
      if (router.userId !== userId) {
        const user = await storage.getUser(userId);
        if (!user || user.role !== "admin") {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      
      res.json(router);
    } catch (error) {
      console.error("Error fetching router:", error);
      res.status(500).json({ message: "Failed to fetch router" });
    }
  });

  app.patch("/api/routers/:id", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      // Check ownership - admin can modify any router, normal users only their own
      if (router.userId !== userId) {
        const user = await storage.getUser(userId);
        if (!user || user.role !== "admin") {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      
      const updated = await storage.updateRouter(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating router:", error);
      res.status(500).json({ message: "Failed to update router" });
    }
  });

  app.delete("/api/routers/:id", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      // Check ownership - admin can delete any router, normal users only their own
      if (router.userId !== userId) {
        const user = await storage.getUser(userId);
        if (!user || user.role !== "admin") {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      
      await storage.deleteRouter(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting router:", error);
      res.status(500).json({ message: "Failed to delete router" });
    }
  });

  app.post("/api/routers/test", isAuthenticated, async (req: any, res) => {
    try {
      const { ipAddress, port, username, password, restEnabled, restPort, snmpEnabled, snmpCommunity, snmpVersion, snmpPort } = req.body;
      
      const client = new MikrotikClient({
        host: ipAddress,
        port: port || 8728,
        user: username,
        password,
        restEnabled: restEnabled || false,
        restPort: restPort || 443,
        snmpEnabled: snmpEnabled || false,
        snmpCommunity: snmpCommunity || "public",
        snmpVersion: snmpVersion || "2c",
        snmpPort: snmpPort || 161,
      });
      
      const success = await client.testConnection();
      
      if (success) {
        res.json({ success: true, message: "Connection successful" });
      } else {
        res.status(400).json({ success: false, message: "Connection failed" });
      }
    } catch (error: any) {
      console.error("Error testing connection:", error);
      res.status(400).json({ success: false, message: error.message || "Connection failed" });
    }
  });

  app.post("/api/routers/:id/test", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      if (router.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const credentials = await storage.getRouterCredentials(req.params.id);
      if (!credentials) {
        return res.status(404).json({ message: "Router credentials not found" });
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
      
      // Test all connection methods and find which one works
      const workingMethod = await client.findWorkingConnectionMethod();
      
      if (workingMethod) {
        await storage.updateRouterConnection(req.params.id, true);
        await storage.updateLastSuccessfulConnectionMethod(req.params.id, workingMethod);
        res.json({ 
          success: true, 
          message: "Connection successful",
          method: workingMethod
        });
      } else {
        await storage.updateRouterConnection(req.params.id, false);
        res.status(400).json({ success: false, message: "Connection failed" });
      }
    } catch (error: any) {
      console.error("Error testing router connection:", error);
      res.status(400).json({ success: false, message: error.message || "Connection failed" });
    }
  });


  // Router Groups routes
  app.get("/api/router-groups", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const groups = await storage.getRouterGroups(userId);
      res.json(groups);
    } catch (error) {
      console.error("Error fetching router groups:", error);
      res.status(500).json({ message: "Failed to fetch router groups" });
    }
  });

  app.post("/api/router-groups", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const group = await storage.createRouterGroup(req.body, userId);
      res.json(group);
    } catch (error: any) {
      console.error("Error creating router group:", error);
      if (error.message?.includes("duplicate")) {
        res.status(400).json({ message: "A group with this name already exists" });
      } else {
        res.status(500).json({ message: "Failed to create router group" });
      }
    }
  });

  app.patch("/api/router-groups/:id", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const group = await storage.getRouterGroup(req.params.id);
      
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      
      if (group.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const updated = await storage.updateRouterGroup(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating router group:", error);
      res.status(500).json({ message: "Failed to update router group" });
    }
  });

  app.delete("/api/router-groups/:id", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const group = await storage.getRouterGroup(req.params.id);
      
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      
      if (group.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      await storage.deleteRouterGroup(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting router group:", error);
      res.status(500).json({ message: "Failed to delete router group" });
    }
  });

  // Monitored Ports routes
  app.get("/api/routers/:id/ports", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      if (router.userId !== userId) {
        const user = await storage.getUser(userId);
        if (!user || user.role !== "admin") {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      
      const ports = await storage.getMonitoredPorts(req.params.id);
      res.json(ports);
    } catch (error) {
      console.error("Error fetching monitored ports:", error);
      res.status(500).json({ message: "Failed to fetch monitored ports" });
    }
  });

  app.post("/api/routers/:id/ports", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      if (router.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const port = await storage.createMonitoredPort({
        ...req.body,
        routerId: req.params.id,
      });
      
      res.json(port);
    } catch (error) {
      console.error("Error creating monitored port:", error);
      res.status(500).json({ message: "Failed to create monitored port" });
    }
  });

  app.patch("/api/ports/:id", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const port = await storage.getMonitoredPort(req.params.id);
      
      if (!port) {
        return res.status(404).json({ message: "Port not found" });
      }
      
      const router = await storage.getRouter(port.routerId);
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      const userId = getUserId(req);
      if (router.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const updated = await storage.updateMonitoredPort(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating port:", error);
      res.status(500).json({ message: "Failed to update port" });
    }
  });

  app.delete("/api/ports/:id", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const port = await storage.getMonitoredPort(req.params.id);
      
      if (!port) {
        return res.status(404).json({ message: "Port not found" });
      }
      
      const router = await storage.getRouter(port.routerId);
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      const userId = getUserId(req);
      if (router.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      await storage.deleteMonitoredPort(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting port:", error);
      res.status(500).json({ message: "Failed to delete port" });
    }
  });

  // Traffic Data routes
  // Real-time traffic data (from in-memory store) - for current/recent viewing
  app.get("/api/routers/:id/traffic/realtime", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      if (router.userId !== userId) {
        const user = await storage.getUser(userId);
        if (!user || user.role !== "admin") {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      
      // Parse time range
      const timeRange = req.query.timeRange || "1h";
      let since = new Date();
      
      switch (timeRange) {
        case "15m":
          since = new Date(Date.now() - 15 * 60 * 1000);
          break;
        case "1h":
          since = new Date(Date.now() - 60 * 60 * 1000);
          break;
        case "6h":
        case "24h":
        case "7d":
        case "30d":
          // For longer ranges, redirect to database endpoint
          return res.redirect(`/api/routers/${req.params.id}/traffic?timeRange=${timeRange}`);
        default:
          since = new Date(Date.now() - 60 * 60 * 1000);
      }
      
      const { getRealtimeTraffic } = await import("./scheduler");
      const trafficData = getRealtimeTraffic(req.params.id, since);
      res.json(trafficData || []);
    } catch (error) {
      console.error("Error fetching real-time traffic data:", error);
      res.status(500).json({ message: "Failed to fetch real-time traffic data" });
    }
  });

  // Historical traffic data (from database) - for long-term analysis
  app.get("/api/routers/:id/traffic", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      if (router.userId !== userId) {
        const user = await storage.getUser(userId);
        if (!user || user.role !== "admin") {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      
      // Support custom date range via startDate and endDate query parameters
      let since = new Date();
      let until: Date | undefined = undefined;
      
      if (req.query.startDate) {
        // Custom date range
        since = new Date(req.query.startDate as string);
        if (req.query.endDate) {
          until = new Date(req.query.endDate as string);
        }
      } else {
        // Parse predefined time range
        const timeRange = req.query.timeRange || "1h";
        
        switch (timeRange) {
          case "15m":
            since = new Date(Date.now() - 15 * 60 * 1000);
            break;
          case "1h":
            since = new Date(Date.now() - 60 * 60 * 1000);
            break;
          case "12h":
            since = new Date(Date.now() - 12 * 60 * 60 * 1000);
            break;
          case "6h":
            since = new Date(Date.now() - 6 * 60 * 60 * 1000);
            break;
          case "1d":
          case "24h":
            since = new Date(Date.now() - 24 * 60 * 60 * 1000);
            break;
          case "7d":
            since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "30d":
            since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            since = new Date(Date.now() - 60 * 60 * 1000);
        }
      }
      
      const trafficData = await storage.getRecentTraffic(req.params.id, since, until);
      res.json(trafficData);
    } catch (error) {
      console.error("Error fetching traffic data:", error);
      res.status(500).json({ message: "Failed to fetch traffic data" });
    }
  });

  // Get all available interfaces for a router (from real-time traffic store)
  app.get("/api/routers/:id/interfaces", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      if (router.userId !== userId) {
        const user = await storage.getUser(userId);
        if (!user || user.role !== "admin") {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      
      // Get unique port names from real-time traffic store
      const { getRealtimeTraffic } = await import("./scheduler");
      const trafficData = getRealtimeTraffic(req.params.id);
      
      // Create a map to store the latest data for each interface (including comment)
      const interfaceMap = new Map<string, { name: string; comment?: string }>();
      
      for (const data of trafficData) {
        if (!interfaceMap.has(data.portName)) {
          interfaceMap.set(data.portName, {
            name: data.portName,
            comment: (data as any).comment || undefined
          });
        }
      }
      
      // Get array of interfaces
      let interfaces = Array.from(interfaceMap.values());
      
      // Filter based on router's interfaceDisplayMode setting
      if (router.interfaceDisplayMode === 'none') {
        // Hide all interfaces
        interfaces = [];
      } else if (router.interfaceDisplayMode === 'static') {
        // Show only static interfaces (exclude dynamic ones)
        const dynamicPrefixes = ['pppoe-', 'l2tp-', 'pptp-', 'sstp-', 'ovpn-'];
        interfaces = interfaces.filter(iface => {
          const lowerName = iface.name.toLowerCase();
          return !dynamicPrefixes.some(prefix => lowerName.startsWith(prefix));
        });
      }
      // else 'all' - show all interfaces (no filtering)
      
      res.json({ interfaces });
    } catch (error) {
      console.error("Error fetching interfaces:", error);
      res.status(500).json({ message: "Failed to fetch interfaces" });
    }
  });

  // Alert routes
  app.get("/api/alerts", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const alerts = await storage.getAlerts(userId);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.post("/api/alerts/:id/acknowledge", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const alerts = await storage.getAlerts(userId);
      const alert = alerts.find(a => a.id === req.params.id);
      
      if (!alert) {
        return res.status(404).json({ message: "Alert not found" });
      }
      
      await storage.acknowledgeAlert(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });

  // Admin routes - User management restricted to superadmin only
  app.get("/api/admin/users", isAuthenticated, isSuperadmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users", isAuthenticated, isSuperadmin, async (req, res) => {
    try {
      const { username, email, firstName, lastName, role, temporaryPassword } = req.body;

      // Validate required fields
      if (!username || !email || !firstName || !lastName) {
        return res.status(400).json({ message: "Username, email, first name, and last name are required" });
      }

      // Generate temporary password if not provided
      const tempPassword = temporaryPassword || crypto.randomBytes(8).toString('base64').slice(0, 12);
      
      // Hash the temporary password
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      // Create user with mustChangePassword flag
      const newUser = await storage.upsertUser({
        id: crypto.randomUUID(),
        username,
        email,
        firstName,
        lastName,
        role: role || "user",
        enabled: true,
        passwordHash,
        mustChangePassword: true,
      });

      // Send invitation email with temporary credentials
      try {
        await emailService.sendUserInvitationEmail(
          email,
          firstName,
          username,
          tempPassword
        );
      } catch (emailError) {
        console.error("Failed to send invitation email:", emailError);
        // Continue even if email fails - user is still created
      }

      // Return user info and temporary password (for admin to share if email fails)
      res.json({
        user: newUser,
        temporaryPassword: tempPassword,
        message: "User created successfully. Invitation email sent."
      });
    } catch (error: any) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: error.message || "Failed to create user" });
    }
  });

  app.patch("/api/admin/users/:id", isAuthenticated, isSuperadmin, async (req, res) => {
    try {
      const { enabled, role, isSuperadmin: promoteToSuperadmin } = req.body;
      const updateData: any = {};
      
      if (typeof enabled === "boolean") {
        updateData.enabled = enabled;
        
        // Send email if enabling user
        if (enabled) {
          const user = await storage.getUser(req.params.id);
          if (user && user.email && user.firstName) {
            await emailService.sendAccountApprovedEmail(user.email, user.firstName);
          }
        }
      }
      
      if (role) {
        updateData.role = role;
      }
      
      // Allow superadmin to promote other users to superadmin
      if (typeof promoteToSuperadmin === "boolean") {
        updateData.isSuperadmin = promoteToSuperadmin;
        if (promoteToSuperadmin) {
          updateData.role = "admin"; // Superadmins must be admins
        }
      }
      
      const user = await storage.updateUser(req.params.id, updateData);
      res.json(user);
    } catch (error: any) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: error.message || "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, isSuperadmin, async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: error.message || "Failed to delete user" });
    }
  });

  // Reset user password endpoint (superadmin only)
  app.post("/api/admin/users/:id/reset-password", isAuthenticated, isSuperadmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.isSuperadmin) {
        return res.status(403).json({ message: "Cannot reset superadmin password" });
      }
      
      // Generate temporary password
      const tempPassword = crypto.randomBytes(8).toString('base64').slice(0, 12);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      
      // Update user with new password and force password change
      await storage.updateUser(userId, {
        passwordHash,
        mustChangePassword: true,
      });
      
      // Send email with new temporary password
      try {
        await emailService.sendUserInvitationEmail(
          user.email || '',
          user.firstName || '',
          user.username || '',
          tempPassword
        );
      } catch (emailError) {
        console.error("Failed to send password reset email:", emailError);
      }
      
      res.json({
        success: true,
        temporaryPassword: tempPassword,
        message: "Password reset successfully. User will be prompted to change it on next login."
      });
    } catch (error: any) {
      console.error("Error resetting user password:", error);
      res.status(500).json({ message: error.message || "Failed to reset password" });
    }
  });

  app.get("/api/admin/routers", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const routers = await storage.getAllRouters();
      res.json(routers);
    } catch (error) {
      console.error("Error fetching all routers:", error);
      res.status(500).json({ message: "Failed to fetch routers" });
    }
  });

  // App Settings routes
  // Public endpoint for logo (no authentication required)
  app.get("/api/settings/public", async (req, res) => {
    try {
      const settings = await storage.getAppSettings();
      // Only return logo URL for public access
      res.json({ logoUrl: settings?.logoUrl || null });
    } catch (error) {
      console.error("Error fetching public settings:", error);
      res.json({ logoUrl: null });
    }
  });

  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getAppSettings();
      res.json(settings || { logoUrl: null });
    } catch (error) {
      console.error("Error fetching app settings:", error);
      res.status(500).json({ message: "Failed to fetch app settings" });
    }
  });

  app.put("/api/settings", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { logo_url } = req.body;
      
      let localLogoPath = "";
      
      if (logo_url && logo_url.trim() !== "") {
        // Download and save the logo locally
        try {
          console.log(`[Settings] Downloading logo from: ${logo_url}`);
          
          // Fetch the image
          const response = await fetch(logo_url);
          if (!response.ok) {
            throw new Error(`Failed to download image: ${response.statusText}`);
          }
          
          // Get the content type to determine file extension
          const contentType = response.headers.get('content-type') || '';
          let extension = '.png'; // default
          if (contentType.includes('svg')) extension = '.svg';
          else if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = '.jpg';
          else if (contentType.includes('png')) extension = '.png';
          else if (contentType.includes('gif')) extension = '.gif';
          else if (contentType.includes('webp')) extension = '.webp';
          
          // Generate a unique filename
          const filename = `logo-${crypto.randomBytes(8).toString('hex')}${extension}`;
          const logoDir = path.join(process.cwd(), 'attached_assets', 'logos');
          const localPath = path.join(logoDir, filename);
          
          // Ensure directory exists
          await fs.mkdir(logoDir, { recursive: true });
          
          // Download and save the file
          const buffer = await response.arrayBuffer();
          await fs.writeFile(localPath, Buffer.from(buffer));
          
          // Store the relative path that can be served by the frontend
          localLogoPath = `/attached_assets/logos/${filename}`;
          
          console.log(`[Settings] Logo saved to: ${localLogoPath}`);
          
          // Delete old logo if exists
          const currentSettings = await storage.getAppSettings();
          if (currentSettings?.logoUrl && currentSettings.logoUrl.startsWith('/attached_assets/logos/')) {
            try {
              const oldPath = path.join(process.cwd(), currentSettings.logoUrl);
              await fs.unlink(oldPath);
              console.log(`[Settings] Deleted old logo: ${oldPath}`);
            } catch (err) {
              // Ignore errors when deleting old logo
              console.log(`[Settings] Could not delete old logo (might not exist)`);
            }
          }
        } catch (downloadError: any) {
          console.error("[Settings] Error downloading/saving logo:", downloadError);
          console.log("[Settings] Falling back to using URL directly");
          // Fallback: Use the external URL directly instead of downloading
          localLogoPath = logo_url;
        }
      }
      
      const settings = await storage.updateAppSettings(localLogoPath);
      res.json(settings);
    } catch (error) {
      console.error("Error updating app settings:", error);
      res.status(500).json({ message: "Failed to update app settings" });
    }
  });

  // Create HTTP server
  const httpServer = createServer(app);

  // WebSocket server for real-time notifications - Referenced from javascript_websocket blueprint
  // Store user connections for targeted notifications
  const userConnections = new Map<string, Set<WebSocket>>();
  
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws: WebSocket, req) => {
    console.log('[WebSocket] Client connected');
    let userId: string | null = null;
    
    // Send authentication request
    ws.send(JSON.stringify({ type: "auth_required" }));
    
    // Track active router polling for cleanup
    let activeRouterId: string | null = null;
    
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);
        console.log(`[WebSocket] Received message type: ${data.type}`, data);
        
        // Handle authentication
        if (data.type === "auth" && data.userId) {
          userId = data.userId;
          
          // Add connection to user's set
          const uid = userId as string;
          if (!userConnections.has(uid)) {
            userConnections.set(uid, new Set());
          }
          userConnections.get(uid)!.add(ws);
          
          console.log(`[WebSocket] User ${userId} authenticated`);
          ws.send(JSON.stringify({ type: "auth_success" }));
        }
        
        // Handle start real-time traffic polling
        if (data.type === "start_realtime_polling" && data.routerId) {
          console.log(`[WebSocket] Checking auth for start polling - userId: ${userId}`);
          if (!userId) {
            console.log("[WebSocket] Not authenticated, sending error");
            ws.send(JSON.stringify({ type: "error", message: "Not authenticated" }));
            return;
          }
          
          console.log(`[WebSocket] Starting real-time polling for router ${data.routerId}`);
          activeRouterId = data.routerId;
          startRealtimePolling(data.routerId, ws);
          ws.send(JSON.stringify({ type: "realtime_polling_started", routerId: data.routerId }));
        }
        
        // Handle stop real-time traffic polling
        if (data.type === "stop_realtime_polling" && data.routerId) {
          console.log(`[WebSocket] Stopping real-time polling for router ${data.routerId}`);
          stopRealtimePolling(data.routerId, ws);
          if (activeRouterId === data.routerId) {
            activeRouterId = null;
          }
          ws.send(JSON.stringify({ type: "realtime_polling_stopped", routerId: data.routerId }));
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
      }
    });
    
    ws.on('close', () => {
      // Stop real-time polling if active
      if (activeRouterId) {
        console.log(`[WebSocket] Client disconnected, stopping real-time polling for router ${activeRouterId}`);
        stopRealtimePolling(activeRouterId, ws);
        activeRouterId = null;
      }
      
      if (userId && userConnections.has(userId)) {
        userConnections.get(userId)!.delete(ws);
        if (userConnections.get(userId)!.size === 0) {
          userConnections.delete(userId);
        }
      }
      console.log('[WebSocket] Client disconnected');
    });
    
    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });
  });

  // Set WebSocket server and user connections for scheduler
  setWebSocketServer(wss, userConnections);

  // Start background scheduler
  startScheduler();

  return httpServer;
}
