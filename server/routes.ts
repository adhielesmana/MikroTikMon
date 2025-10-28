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

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Router routes
  app.get("/api/routers", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const routers = await storage.getRouters(userId);
      res.json(routers);
    } catch (error) {
      console.error("Error fetching routers:", error);
      res.status(500).json({ message: "Failed to fetch routers" });
    }
  });

  app.post("/api/routers", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      // Check ownership
      if (router.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
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
      const userId = req.user.claims.sub;
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      // Check ownership
      if (router.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
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
      const userId = req.user.claims.sub;
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
      });
      
      const success = await client.testConnection();
      
      if (success) {
        await storage.updateRouterConnection(req.params.id, true);
        res.json({ success: true, message: "Connection successful" });
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
      const userId = req.user.claims.sub;
      const groups = await storage.getRouterGroups(userId);
      res.json(groups);
    } catch (error) {
      console.error("Error fetching router groups:", error);
      res.status(500).json({ message: "Failed to fetch router groups" });
    }
  });

  app.post("/api/router-groups", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
      
      const userId = req.user.claims.sub;
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
      
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
          since = new Date(Date.now() - 6 * 60 * 60 * 1000);
          break;
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
      
      const trafficData = await storage.getRecentTraffic(req.params.id, since);
      res.json(trafficData);
    } catch (error) {
      console.error("Error fetching traffic data:", error);
      res.status(500).json({ message: "Failed to fetch traffic data" });
    }
  });

  // Get all available interfaces for a router (from real-time traffic store)
  app.get("/api/routers/:id/interfaces", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const interfaceNames = Array.from(new Set(trafficData.map(d => d.portName)));
      
      res.json(interfaceNames);
    } catch (error) {
      console.error("Error fetching interfaces:", error);
      res.status(500).json({ message: "Failed to fetch interfaces" });
    }
  });

  // Alert routes
  app.get("/api/alerts", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const alerts = await storage.getAlerts(userId);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.post("/api/alerts/:id/acknowledge", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
