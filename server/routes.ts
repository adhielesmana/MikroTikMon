// API Routes - Referenced from javascript_log_in_with_replit and javascript_websocket blueprints
import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin, isEnabled } from "./replitAuth";
import { MikrotikClient } from "./mikrotik";
import { emailService } from "./emailService";
import { startScheduler, setWebSocketServer } from "./scheduler";
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

  // Check if default admin credentials should be shown on login page
  app.get('/api/auth/show-default-credentials', async (_req, res) => {
    try {
      const adminUser = await storage.getUser('super-admin-001');
      // Show default credentials only if admin still needs to change password
      const showCredentials = adminUser ? adminUser.mustChangePassword === true : true;
      res.json({ showDefaultCredentials: showCredentials });
    } catch (error) {
      // If admin user doesn't exist yet, show default credentials
      res.json({ showDefaultCredentials: true });
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
      
      // Extract unique port names
      let interfaceNames = Array.from(new Set(trafficData.map(d => d.portName)));
      
      // Filter based on router's interfaceDisplayMode setting
      if (router.interfaceDisplayMode === 'none') {
        // Hide all interfaces
        interfaceNames = [];
      } else if (router.interfaceDisplayMode === 'static') {
        // Show only static interfaces (exclude dynamic ones)
        const dynamicPrefixes = ['pppoe-', 'l2tp-', 'pptp-', 'sstp-', 'ovpn-'];
        interfaceNames = interfaceNames.filter(name => {
          const lowerName = name.toLowerCase();
          return !dynamicPrefixes.some(prefix => lowerName.startsWith(prefix));
        });
      }
      // else 'all' - show all interfaces (no filtering)
      
      res.json({ interfaces: interfaceNames });
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

  // Admin routes
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
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

  app.patch("/api/admin/users/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { enabled, role } = req.body;
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
      
      const user = await storage.updateUser(req.params.id, updateData);
      res.json(user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
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
          console.error("[Settings] Error downloading logo:", downloadError);
          return res.status(400).json({ message: `Failed to download logo: ${downloadError.message}` });
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
    
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);
        
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
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
      }
    });
    
    ws.on('close', () => {
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
