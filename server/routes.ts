// API Routes - Referenced from javascript_log_in_with_replit and javascript_websocket blueprints
import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { setupAuth, isAuthenticated, isAdmin, isSuperadmin, isEnabled } from "./replitAuth";
import { MikrotikClient } from "./mikrotik";
import { emailService } from "./emailService";
import { startScheduler, setWebSocketServer, startRealtimePolling, stopRealtimePolling } from "./scheduler";
import { insertRouterSchema, type Router } from "@shared/schema";
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

// Helper function to generate ETag from data
function generateETag(data: any): string {
  const hash = crypto
    .createHash('md5')
    .update(JSON.stringify(data))
    .digest('hex');
  return `"${hash}"`;
}

// Helper function to update interface metadata in background
async function updateCachedInterfaceMetadata(routerId: string, interfaces: any[]): Promise<void> {
  try {
    // Get all monitored ports for this router
    const monitoredPorts = await storage.getMonitoredPorts(routerId);
    
    // Create a map of interface data for quick lookup
    const interfaceMap = new Map(
      interfaces.map(iface => [iface.name, iface])
    );
    
    // Update metadata for each monitored port if interface data is available
    for (const port of monitoredPorts) {
      const interfaceData = interfaceMap.get(port.portName);
      if (interfaceData) {
        await storage.updateInterfaceMetadata(
          routerId,
          port.portName,
          {
            interfaceComment: interfaceData.comment || null,
            interfaceMacAddress: interfaceData.macAddress || null
          }
        );
      }
    }
  } catch (error) {
    console.error(`[Metadata Update] Failed to update interface metadata for router ${routerId}:`, error);
  }
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

  // Alias for /api/auth/user for frontend convenience
  app.get('/api/user', isAuthenticated, async (req: any, res) => {
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
      
      // Super admins can see all routers
      if (user?.isSuperadmin) {
        const routers = await storage.getAllRouters();
        return res.json(routers);
      }
      
      // Normal users see their own routers + routers assigned to them
      const ownRouters = await storage.getRouters(userId);
      const assignedRouters = await storage.getUserAssignedRouters(userId);
      
      // Merge and deduplicate based on router id
      const routerMap = new Map<string, Router>();
      ownRouters.forEach(r => routerMap.set(r.id, r));
      assignedRouters.forEach(r => routerMap.set(r.id, r));
      
      const routers = Array.from(routerMap.values());
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
      
      // Immediately check reachability and test connection methods after router creation
      try {
        const credentials = await storage.getRouterCredentials(router.id);
        if (credentials) {
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

          // Check reachability
          const isReachable = await client.checkReachability();
          await storage.updateRouterReachability(router.id, isReachable);
          
          console.log(`[Router Creation] ${router.name} reachability check: ${isReachable ? 'REACHABLE' : 'UNREACHABLE'}`);
          
          // Test connection methods (Native API → REST API → SNMP)
          if (isReachable) {
            try {
              const workingMethod = await client.findWorkingConnectionMethod();
              if (workingMethod) {
                await storage.updateRouterConnection(router.id, true);
                await storage.updateLastSuccessfulConnectionMethod(router.id, workingMethod);
                console.log(`[Router Creation] ${router.name} connection method: ${workingMethod.toUpperCase()}`);
                
                // Update interface metadata in background (non-blocking)
                client.getInterfaceStats().then(interfaces => {
                  updateCachedInterfaceMetadata(router.id, interfaces);
                }).catch(err => {
                  console.error(`[Router Creation] Failed to fetch interface metadata:`, err);
                });
              } else {
                await storage.updateRouterConnection(router.id, false);
                console.log(`[Router Creation] ${router.name} connection test failed - no working method found`);
              }
            } catch (connectionTestError) {
              console.error(`[Router Creation] Error testing connection methods:`, connectionTestError);
            }
          }
          
          // Return updated router with reachability and connection status
          const updatedRouter = await storage.getRouter(router.id);
          res.json(updatedRouter);
        } else {
          res.json(router);
        }
      } catch (reachabilityError) {
        console.error("Error checking reachability after router creation:", reachabilityError);
        // Still return the router even if reachability check fails
        res.json(router);
      }
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
      
      const user = await storage.getUser(userId);
      
      // Check access: super admin, owner, or assigned user
      const isOwner = router.userId === userId;
      const isSuperAdmin = user?.isSuperadmin;
      const isAssigned = await storage.isRouterAssignedToUser(req.params.id, userId);
      
      if (!isOwner && !isSuperAdmin && !isAssigned) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      // Set cache headers with ETag for conditional requests
      const etag = generateETag(router);
      res.setHeader('Cache-Control', 'private, max-age=30');
      res.setHeader('ETag', etag);
      
      // Handle conditional requests
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
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
      
      // Check if user has access (owner, assigned user, or superadmin)
      const hasAccess = await storage.canUserAccessRouter(req.params.id, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const updated = await storage.updateRouter(req.params.id, req.body);
      
      // Immediately check reachability and test connection methods after router update
      try {
        const credentials = await storage.getRouterCredentials(updated.id);
        if (credentials) {
          const client = new MikrotikClient({
            host: updated.ipAddress,
            port: updated.port,
            user: credentials.username,
            password: credentials.password,
            cloudDdnsHostname: updated.cloudDdnsHostname || undefined,
            restEnabled: updated.restEnabled || false,
            restPort: updated.restPort || 443,
            snmpEnabled: updated.snmpEnabled || false,
            snmpCommunity: updated.snmpCommunity || "public",
            snmpVersion: updated.snmpVersion || "2c",
            snmpPort: updated.snmpPort || 161,
            interfaceDisplayMode: (updated.interfaceDisplayMode as "static" | "none" | "all") || 'static',
          });

          // Check reachability
          const isReachable = await client.checkReachability();
          await storage.updateRouterReachability(updated.id, isReachable);
          
          console.log(`[Router Update] ${updated.name} reachability check: ${isReachable ? 'REACHABLE' : 'UNREACHABLE'}`);
          
          // Test connection methods (Native API → REST API → SNMP)
          if (isReachable) {
            try {
              const workingMethod = await client.findWorkingConnectionMethod();
              if (workingMethod) {
                await storage.updateRouterConnection(updated.id, true);
                await storage.updateLastSuccessfulConnectionMethod(updated.id, workingMethod);
                console.log(`[Router Update] ${updated.name} connection method: ${workingMethod.toUpperCase()}`);
                
                // Update interface metadata in background (non-blocking)
                client.getInterfaceStats().then(interfaces => {
                  updateCachedInterfaceMetadata(updated.id, interfaces);
                }).catch(err => {
                  console.error(`[Router Update] Failed to fetch interface metadata:`, err);
                });
              } else {
                await storage.updateRouterConnection(updated.id, false);
                console.log(`[Router Update] ${updated.name} connection test failed - no working method found`);
              }
            } catch (connectionTestError) {
              console.error(`[Router Update] Error testing connection methods:`, connectionTestError);
            }
          }
          
          // Return updated router with reachability and connection status
          const finalRouter = await storage.getRouter(updated.id);
          res.json(finalRouter);
        } else {
          res.json(updated);
        }
      } catch (reachabilityError) {
        console.error("Error checking reachability after router update:", reachabilityError);
        // Still return the router even if reachability check fails
        res.json(updated);
      }
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
      
      // Check if user has access (owner, assigned user, or superadmin)
      const hasAccess = await storage.canUserAccessRouter(req.params.id, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      await storage.deleteRouter(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting router:", error);
      res.status(500).json({ message: "Failed to delete router" });
    }
  });

  // Router assignment endpoints (super admin only)
  app.get("/api/routers/:id/assignments", isAuthenticated, isEnabled, isSuperadmin, async (req: any, res) => {
    try {
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      const assignments = await storage.getRouterAssignments(req.params.id);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching router assignments:", error);
      res.status(500).json({ message: "Failed to fetch router assignments" });
    }
  });

  app.post("/api/routers/:id/assignments", isAuthenticated, isEnabled, isSuperadmin, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { userIds } = req.body;
      
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: "userIds must be a non-empty array" });
      }
      
      const router = await storage.getRouter(req.params.id);
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      // Assign router to each user
      const assignments = [];
      for (const targetUserId of userIds) {
        try {
          const assignment = await storage.assignRouterToUser(req.params.id, targetUserId, userId);
          assignments.push(assignment);
        } catch (error: any) {
          console.log(`User ${targetUserId} already assigned to router ${req.params.id}`);
        }
      }
      
      res.json({ success: true, assignments });
    } catch (error) {
      console.error("Error assigning router to users:", error);
      res.status(500).json({ message: "Failed to assign router to users" });
    }
  });

  app.delete("/api/routers/:id/assignments/:userId", isAuthenticated, isEnabled, isSuperadmin, async (req: any, res) => {
    try {
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      await storage.unassignRouterFromUser(req.params.id, req.params.userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unassigning router from user:", error);
      res.status(500).json({ message: "Failed to unassign router from user" });
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
      
      // Check if user has access (owner, assigned user, or superadmin)
      const hasAccess = await storage.canUserAccessRouter(req.params.id, userId);
      if (!hasAccess) {
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
        
        // Update interface metadata in background (non-blocking)
        client.getInterfaceStats().then(interfaces => {
          updateCachedInterfaceMetadata(req.params.id, interfaces);
        }).catch(err => {
          console.error(`[Test Connection] Failed to fetch interface metadata:`, err);
        });
        
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
  // Get all monitored ports across all routers
  // Note: Interface comments are NOT fetched here to avoid timeout issues
  // Comments are fetched per-router on the RouterDetails page
  app.get("/api/monitored-ports", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const ports = await storage.getAllMonitoredPorts(userId);
      res.json(ports);
    } catch (error) {
      console.error("Error fetching all monitored ports:", error);
      res.status(500).json({ message: "Failed to fetch monitored ports" });
    }
  });

  app.get("/api/routers/:id/ports", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      // Check if user has access (owner, assigned user, or superadmin)
      const hasAccess = await storage.canUserAccessRouter(req.params.id, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      // Get monitored ports with cached interface metadata from database
      // This provides instant loading instead of waiting for live API calls
      // The scheduler updates this metadata during background polling (every 60s)
      const ports = await storage.getMonitoredPorts(req.params.id);
      
      // Return ports with cached interface comments from database
      const portsWithComments = ports.map(port => ({
        ...port,
        portComment: port.interfaceComment || undefined,
      }));
      
      // Set cache headers with ETag for conditional requests
      const etag = generateETag(portsWithComments);
      res.setHeader('Cache-Control', 'private, max-age=30');
      res.setHeader('ETag', etag);
      
      // Handle conditional requests
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
      
      res.json(portsWithComments);
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
      
      // Check if user has access (owner, assigned user, or superadmin)
      const hasAccess = await storage.canUserAccessRouter(req.params.id, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      // Fetch interface metadata from router
      let interfaceComment: string | undefined;
      let interfaceMacAddress: string | undefined;
      
      try {
        const { decryptPassword } = await import("./storage.js");
        const decryptedPassword = decryptPassword(router.encryptedPassword);
        
        const client = new MikrotikClient({
          host: router.cloudDdnsHostname || router.ipAddress,
          user: router.username,
          password: decryptedPassword,
          port: router.port,
          restEnabled: router.restEnabled || false,
          restPort: router.restPort || 443,
          snmpEnabled: router.snmpEnabled || false,
          snmpCommunity: router.snmpCommunity || 'public',
          snmpPort: router.snmpPort || 161,
          interfaceDisplayMode: (router.interfaceDisplayMode || 'static') as 'static' | 'none' | 'all',
        });
        
        const interfaces = await client.getInterfaceStats();
        const targetInterface = interfaces.find((iface: any) => iface.name === req.body.portName);
        
        if (targetInterface) {
          interfaceComment = targetInterface.comment || undefined;
          interfaceMacAddress = targetInterface.macAddress || undefined;
        }
      } catch (interfaceError) {
        console.error("Failed to fetch interface metadata:", interfaceError);
        // Continue without metadata - it's optional
      }
      
      const port = await storage.createMonitoredPort({
        ...req.body,
        routerId: req.params.id,
        interfaceComment,
        interfaceMacAddress,
        lastInterfaceUpdate: interfaceComment || interfaceMacAddress ? new Date() : undefined,
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
      
      // Check if user has access (owner, assigned user, or superadmin)
      const hasAccess = await storage.canUserAccessRouter(port.routerId, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const updated = await storage.updateMonitoredPort(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating port:", error);
      res.status(500).json({ message: "Failed to update port" });
    }
  });

  // Refresh interface metadata for a monitored port
  app.post("/api/ports/:id/refresh-metadata", isAuthenticated, isEnabled, async (req: any, res) => {
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
      
      // Check if user has access (owner, assigned user, or superadmin)
      const hasAccess = await storage.canUserAccessRouter(port.routerId, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      // Fetch fresh interface metadata from router
      try {
        const { decryptPassword } = await import("./storage.js");
        const decryptedPassword = decryptPassword(router.encryptedPassword);
        
        const client = new MikrotikClient({
          host: router.cloudDdnsHostname || router.ipAddress,
          user: router.username,
          password: decryptedPassword,
          port: router.port,
          restEnabled: router.restEnabled || false,
          restPort: router.restPort || 443,
          snmpEnabled: router.snmpEnabled || false,
          snmpCommunity: router.snmpCommunity || 'public',
          snmpPort: router.snmpPort || 161,
          interfaceDisplayMode: (router.interfaceDisplayMode || 'static') as 'static' | 'none' | 'all',
        });
        
        const interfaces = await client.getInterfaceStats();
        const targetInterface = interfaces.find((iface: any) => iface.name === port.portName);
        
        const updated = await storage.updateMonitoredPort(req.params.id, {
          interfaceComment: targetInterface?.comment || null,
          interfaceMacAddress: targetInterface?.macAddress || null,
          lastInterfaceUpdate: new Date(),
        });
        
        res.json(updated);
      } catch (interfaceError) {
        console.error("Failed to fetch interface metadata:", interfaceError);
        return res.status(500).json({ message: "Failed to fetch interface metadata from router" });
      }
    } catch (error) {
      console.error("Error refreshing interface metadata:", error);
      res.status(500).json({ message: "Failed to refresh interface metadata" });
    }
  });

  app.post("/api/ports/refresh-all-metadata", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get all monitored ports for this user
      const ports = await storage.getAllMonitoredPorts(userId);
      
      let successCount = 0;
      let failCount = 0;
      const results: { portId: string; portName: string; success: boolean; error?: string }[] = [];
      
      // Process each port
      for (const port of ports) {
        try {
          const router = await storage.getRouter(port.routerId);
          if (!router) {
            results.push({ portId: port.id, portName: port.portName, success: false, error: "Router not found" });
            failCount++;
            continue;
          }
          
          const { decryptPassword } = await import("./storage.js");
          const decryptedPassword = decryptPassword(router.encryptedPassword);
          
          const client = new MikrotikClient({
            host: router.cloudDdnsHostname || router.ipAddress,
            user: router.username,
            password: decryptedPassword,
            port: router.port,
            restEnabled: router.restEnabled || false,
            restPort: router.restPort || 443,
            snmpEnabled: router.snmpEnabled || false,
            snmpCommunity: router.snmpCommunity || 'public',
            snmpPort: router.snmpPort || 161,
            interfaceDisplayMode: (router.interfaceDisplayMode || 'static') as 'static' | 'none' | 'all',
          });
          
          const interfaces = await client.getInterfaceStats();
          const targetInterface = interfaces.find((iface: any) => iface.name === port.portName);
          
          await storage.updateMonitoredPort(port.id, {
            interfaceComment: targetInterface?.comment || null,
            interfaceMacAddress: targetInterface?.macAddress || null,
            lastInterfaceUpdate: new Date(),
          });
          
          results.push({ portId: port.id, portName: port.portName, success: true });
          successCount++;
        } catch (error: any) {
          console.error(`Failed to refresh metadata for port ${port.portName}:`, error);
          results.push({ 
            portId: port.id, 
            portName: port.portName, 
            success: false, 
            error: error.message || "Unknown error" 
          });
          failCount++;
        }
      }
      
      res.json({
        total: ports.length,
        success: successCount,
        failed: failCount,
        results,
      });
    } catch (error) {
      console.error("Error bulk refreshing interface metadata:", error);
      res.status(500).json({ message: "Failed to bulk refresh interface metadata" });
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
      
      // Check if user has access (owner, assigned user, or superadmin)
      const hasAccess = await storage.canUserAccessRouter(port.routerId, userId);
      if (!hasAccess) {
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
      
      // Check if user has access (owner, assigned user, or superadmin)
      const hasAccess = await storage.canUserAccessRouter(req.params.id, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Forbidden" });
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
      
      // Check if user has access (owner, assigned user, or superadmin)
      const hasAccess = await storage.canUserAccessRouter(req.params.id, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Forbidden" });
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

  // Get available interfaces for monitoring (from database cache - NEW, INSTANT LOAD)
  app.get("/api/routers/:id/available-interfaces", isAuthenticated, isEnabled, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const router = await storage.getRouter(req.params.id);
      
      if (!router) {
        return res.status(404).json({ message: "Router not found" });
      }
      
      // Check if user has access (owner, assigned user, or superadmin)
      const hasAccess = await storage.canUserAccessRouter(req.params.id, userId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      // Get cached interfaces from database (zero API calls to router!)
      const availableInterfaces = await storage.getAvailableInterfacesForMonitoring(req.params.id);
      
      // Transform to match expected format
      const interfaces = availableInterfaces.map(iface => ({
        name: iface.interfaceName,
        comment: iface.interfaceComment || undefined
      }));
      
      // Set cache headers
      const responseData = { interfaces };
      const etag = generateETag(responseData);
      res.setHeader('Cache-Control', 'private, max-age=30');
      res.setHeader('ETag', etag);
      
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
      
      res.json(responseData);
    } catch (error) {
      console.error("Error fetching available interfaces:", error);
      res.status(500).json({ message: "Failed to fetch available interfaces" });
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
      
      // Check if user has access (owner, assigned user, or superadmin)
      const hasAccess = await storage.canUserAccessRouter(req.params.id, userId);
      console.log(`[API /interfaces] Access check - userId: ${userId}, routerId: ${req.params.id}, hasAccess: ${hasAccess}`);
      
      if (!hasAccess) {
        console.log(`[API /interfaces] FORBIDDEN - User ${userId} cannot access router ${req.params.id}`);
        return res.status(403).json({ message: "Forbidden" });
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
      
      // Set cache headers with ETag for conditional requests
      const responseData = { interfaces };
      const etag = generateETag(responseData);
      res.setHeader('Cache-Control', 'private, max-age=30');
      res.setHeader('ETag', etag);
      
      // Handle conditional requests
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
      
      res.json(responseData);
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
      
      // Get user's full name for acknowledgment tracking
      const user = await storage.getUser(userId);
      const acknowledgedBy = user 
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || user.username || 'Unknown User'
        : 'Unknown User';
      
      await storage.acknowledgeAlert(req.params.id, acknowledgedBy);
      res.json({ success: true });
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });

  // Test endpoint to send dummy notification (for testing alert sound)
  app.post("/api/alerts/test-notification", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Import broadcastNotification from scheduler
      const { broadcastNotification } = await import("./scheduler");
      
      // Send test notification
      const testNotification = {
        title: "🔔 Test Alert",
        routerName: "Test Router",
        portName: "ether1",
        portComment: "TEST PORT",
        message: "This is a test notification to verify alert sound is working. You should hear a 3-second buzzer alarm!",
      };
      
      broadcastNotification(userId, testNotification);
      
      console.log(`[Test] Sent test notification to user ${userId} (${user.username})`);
      
      res.json({ 
        success: true, 
        message: "Test notification sent. Check for popup and listen for sound!",
        notification: testNotification
      });
    } catch (error) {
      console.error("Error sending test notification:", error);
      res.status(500).json({ message: "Failed to send test notification" });
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

  app.put("/api/settings/retention", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { retention_days } = req.body;
      
      // Validate retention_days
      const retentionDays = retention_days === null || retention_days === undefined || retention_days === 0 
        ? null 
        : parseInt(retention_days);
      
      if (retentionDays !== null && (isNaN(retentionDays) || retentionDays < 1)) {
        res.status(400).json({ message: "Retention days must be a positive number or null/0 for forever" });
        return;
      }
      
      // Update settings in database
      const settings = await storage.updateAppSettings({ retentionDays });
      
      // Apply TimescaleDB retention policy
      try {
        if (retentionDays === null) {
          // Remove retention policy (keep data forever)
          await db.execute(sql`
            SELECT remove_retention_policy('traffic_data', if_exists => true);
          `);
          console.log('[Retention] Retention policy removed - data will be kept forever');
        } else {
          // Remove existing policy first (if any)
          await db.execute(sql`
            SELECT remove_retention_policy('traffic_data', if_exists => true);
          `);
          
          // Add new retention policy
          await db.execute(sql`
            SELECT add_retention_policy('traffic_data', INTERVAL '${sql.raw(retentionDays.toString())} days');
          `);
          console.log(`[Retention] Retention policy updated to ${retentionDays} days`);
        }
      } catch (dbError) {
        console.error('[Retention] Error updating TimescaleDB retention policy:', dbError);
        // Don't fail the request - settings are saved, just log the error
        // This allows the system to work even if TimescaleDB isn't installed yet
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error updating retention settings:", error);
      res.status(500).json({ message: "Failed to update retention settings" });
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
      
      const settings = await storage.updateAppSettings({ logoUrl: localLogoPath });
      res.json(settings);
    } catch (error) {
      console.error("Error updating app settings:", error);
      res.status(500).json({ message: "Failed to update app settings" });
    }
  });

  // Helper function to extract log content from XML-wrapped log file
  function extractLogContent(rawContent: string): string {
    // Log files have format:
    // <workflow>...<logs>CONTENT</logs></workflow>ADDITIONAL_CONTENT
    // We want CONTENT + ADDITIONAL_CONTENT (everything except XML wrapper)
    
    // First, extract everything between <logs> and </logs>
    const logsMatch = rawContent.match(/<logs>([\s\S]*?)<\/logs>/);
    const logsContent = logsMatch ? logsMatch[1] : '';
    
    // Then, get everything after </workflow> (new logs continue here)
    const workflowEndIndex = rawContent.indexOf('</workflow>');
    const afterWorkflow = workflowEndIndex !== -1 
      ? rawContent.substring(workflowEndIndex + '</workflow>'.length)
      : '';
    
    return logsContent + afterWorkflow;
  }

  // Backup/Restore API routes (admin only)
  app.get("/api/backups", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const backupsDir = path.join(process.cwd(), 'backups');
      
      // Check if backups directory exists
      try {
        await fs.access(backupsDir);
      } catch {
        res.json({ backups: [] });
        return;
      }
      
      const files = await fs.readdir(backupsDir);
      const backupFiles = files.filter(f => f.endsWith('.sql.gz') || f.endsWith('.sql'));
      
      const backups = await Promise.all(
        backupFiles.map(async (file) => {
          const filePath = path.join(backupsDir, file);
          const stats = await fs.stat(filePath);
          return {
            filename: file,
            size: stats.size,
            created: stats.mtime,
          };
        })
      );
      
      // Sort by date, newest first
      backups.sort((a, b) => b.created.getTime() - a.created.getTime());
      
      res.json({ backups });
    } catch (error: any) {
      console.error("[Backups] Error listing backups:", error);
      res.status(500).json({ message: "Failed to list backups" });
    }
  });
  
  app.post("/api/backups/create", isAuthenticated, isAdmin, async (req, res) => {
    try {
      console.log("[Backup] Manual backup requested");
      
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const backupScript = path.join(process.cwd(), 'scripts', 'backup-database.sh');
      const { stdout, stderr } = await execAsync(`bash ${backupScript}`, {
        maxBuffer: 500 * 1024 * 1024 // 500MB buffer for large database backups
      });
      
      if (stderr && !stderr.includes('WARNING')) {
        console.error("[Backup] Backup stderr:", stderr);
      }
      
      console.log("[Backup] Manual backup completed");
      res.json({ message: "Backup created successfully", output: stdout });
    } catch (error: any) {
      console.error("[Backup] Error creating backup:", error);
      res.status(500).json({ message: `Failed to create backup: ${error.message}` });
    }
  });
  
  app.post("/api/backups/restore", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { filename, dataOnly = false } = req.body;
      
      if (!filename) {
        res.status(400).json({ message: "Filename is required" });
        return;
      }
      
      // Security: Validate filename (prevent path traversal)
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        res.status(400).json({ message: "Invalid filename" });
        return;
      }
      
      const backupsDir = path.join(process.cwd(), 'backups');
      const backupPath = path.join(backupsDir, filename);
      
      // Check if backup exists
      try {
        await fs.access(backupPath);
      } catch {
        res.status(404).json({ message: "Backup file not found" });
        return;
      }
      
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      if (dataOnly) {
        console.log(`[Restore] Data-only restore from: ${filename}`);
        
        // Read and parse SQL file to extract only data statements
        const backupContent = await fs.readFile(backupPath, 'utf-8');
        
        // Filter SQL: Keep only COPY statements for core tables (skip problematic tables)
        const coreTables = ['users', 'router_groups', 'routers', 'user_routers', 'monitored_ports', 'app_settings'];
        const dataStatements: string[] = [];
        const lines = backupContent.split('\n');
        let inCopyBlock = false;
        let copyBuffer: string[] = [];
        let currentTable = '';
        
        for (const line of lines) {
          // Detect COPY statements (data blocks)
          if (line.startsWith('COPY public.')) {
            // Extract table name: "COPY public.users (...) FROM stdin;"
            const match = line.match(/COPY public\.(\w+)/);
            if (match) {
              currentTable = match[1];
              
              // Only process core tables, skip alerts/notifications/traffic_data (schema changes)
              if (coreTables.includes(currentTable)) {
                inCopyBlock = true;
                copyBuffer = [line];
              }
            }
            continue;
          }
          
          // Collect COPY data until we hit the terminator
          if (inCopyBlock) {
            copyBuffer.push(line);
            if (line === '\\.') {
              inCopyBlock = false;
              dataStatements.push(copyBuffer.join('\n'));
              copyBuffer = [];
              currentTable = '';
            }
            continue;
          }
          
          // Keep sequence setval statements
          if (line.includes('pg_catalog.setval(')) {
            dataStatements.push(line);
            continue;
          }
        }
        
        if (dataStatements.length === 0) {
          res.status(400).json({ message: "No compatible data found in backup file for restore" });
          return;
        }
        
        console.log(`[Restore] Found ${dataStatements.length} compatible data statements for core tables`);
        
        // Create safe restore script with transaction and FK handling
        const dataOnlySQL = `
BEGIN;

-- Disable triggers and foreign key checks for fast import
SET session_replication_role = 'replica';

-- Truncate only core tables we're restoring (preserve alerts/notifications/traffic_data)
TRUNCATE TABLE user_routers CASCADE;
TRUNCATE TABLE monitored_ports CASCADE;
TRUNCATE TABLE routers CASCADE;
TRUNCATE TABLE router_groups CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE app_settings CASCADE;
TRUNCATE TABLE sessions CASCADE;

-- Insert data from backup (core tables only)
${dataStatements.join('\n\n')}

-- Re-enable triggers and foreign key checks
SET session_replication_role = 'origin';

COMMIT;
`;
        
        // Write temporary SQL file (use /tmp since app may not have write access to backups dir)
        const tempSQLPath = `/tmp/temp_restore_${Date.now()}.sql`;
        await fs.writeFile(tempSQLPath, dataOnlySQL, 'utf-8');
        
        try {
          // Execute data-only restore
          await execAsync(
            `PGPASSWORD="${process.env.PGPASSWORD}" psql -U "${process.env.PGUSER}" -h "${process.env.PGHOST}" -p "${process.env.PGPORT}" -d "${process.env.PGDATABASE}" --single-transaction --set ON_ERROR_STOP=1 -f "${tempSQLPath}"`,
            {
              shell: '/bin/bash',
              maxBuffer: 500 * 1024 * 1024
            }
          );
          
          console.log("[Restore] Data-only restore completed successfully");
          res.json({ message: "Core data restored (users, routers, groups, monitored ports). Alerts and traffic data preserved. Please refresh the page." });
        } finally {
          // Clean up temp file
          await fs.unlink(tempSQLPath).catch(() => {});
        }
      } else {
        console.log(`[Restore] Full restore from: ${filename}`);
        
        // Full restore (original behavior)
        const isCompressed = filename.endsWith('.gz');
        const decompressCmd = isCompressed ? `gunzip -c "${backupPath}"` : `cat "${backupPath}"`;
        
        const restoreScript = `
          # Drop and recreate database
          PGPASSWORD="${process.env.PGPASSWORD}" psql -U "${process.env.PGUSER}" -h "${process.env.PGHOST}" -p "${process.env.PGPORT}" -d postgres -c "DROP DATABASE IF EXISTS ${process.env.PGDATABASE};"
          PGPASSWORD="${process.env.PGPASSWORD}" psql -U "${process.env.PGUSER}" -h "${process.env.PGHOST}" -p "${process.env.PGPORT}" -d postgres -c "CREATE DATABASE ${process.env.PGDATABASE};"
          
          # Restore data
          ${decompressCmd} | PGPASSWORD="${process.env.PGPASSWORD}" psql -U "${process.env.PGUSER}" -h "${process.env.PGHOST}" -p "${process.env.PGPORT}" -d "${process.env.PGDATABASE}"
        `;
        
        await execAsync(restoreScript, { 
          shell: '/bin/bash',
          maxBuffer: 500 * 1024 * 1024
        });
        
        console.log("[Restore] Full restore completed successfully");
        res.json({ message: "Database restored successfully. Please refresh the page." });
      }
    } catch (error: any) {
      console.error("[Restore] Error restoring backup:", error);
      res.status(500).json({ message: `Failed to restore backup: ${error.message}` });
    }
  });

  // SSE endpoint for real-time log streaming (admin only)
  app.get("/api/logs/stream", isAuthenticated, isAdmin, async (req, res) => {
    console.log('[LogsSSE] Client connected to log stream');
    
    // Set headers for Server-Sent Events
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });
    
    res.flushHeaders();
    
    let lastSize = 0;
    let currentLogFile: string | null = null;
    let isStreaming = true;
    
    const streamLogs = async () => {
      if (!isStreaming) return;
      
      try {
        const logsDir = '/tmp/logs';
        const files = await fs.readdir(logsDir);
        
        // Find the latest "Start_application" log file
        const workflowLogs = files.filter(f => 
          f.startsWith('Start_application_') && f.endsWith('.log')
        );
        
        if (workflowLogs.length === 0) {
          if (lastSize === 0) {
            res.write(`data: ${JSON.stringify({ type: 'log', data: 'Waiting for logs...\n' })}\n\n`);
          }
          return;
        }

        // Sort by filename (which contains timestamp) to get the newest
        // Format: Start_application_YYYYMMDD_HHMMSS_NNN.log
        workflowLogs.sort((a, b) => b.localeCompare(a));
        const latestLog = workflowLogs[0];
        const logPath = path.join(logsDir, latestLog);

        // If log file changed, reset and send clear command + full new content
        if (currentLogFile !== latestLog) {
          console.log(`[LogsSSE] Switching from ${currentLogFile || 'none'} to new log file: ${latestLog}`);
          currentLogFile = latestLog;
          lastSize = 0;
          
          // Send clear command first to reset the frontend display
          res.write(`data: ${JSON.stringify({ type: 'clear' })}\n\n`);
          
          // Then send full content from new file, stripping XML wrapper
          const rawContent = await fs.readFile(logPath, 'utf-8');
          const content = extractLogContent(rawContent);
          res.write(`data: ${JSON.stringify({ type: 'log', data: content })}\n\n`);
          lastSize = rawContent.length;
          return;
        }

        // Check for new content
        const stats = await fs.stat(logPath);
        if (stats.size > lastSize) {
          // Read only the new part
          const fileHandle = await fs.open(logPath, 'r');
          const buffer = Buffer.alloc(stats.size - lastSize);
          await fileHandle.read(buffer, 0, buffer.length, lastSize);
          await fileHandle.close();
          
          const newContent = buffer.toString('utf-8');
          if (newContent) {
            // Send raw new content (it's just log lines, no XML wrapper)
            res.write(`data: ${JSON.stringify({ type: 'log', data: newContent })}\n\n`);
            lastSize = stats.size;
          }
        }
      } catch (error) {
        console.error('[LogsSSE] Error streaming logs:', error);
      }
    };
    
    // Start streaming immediately
    streamLogs();
    
    // Poll for new content every 500ms
    const pollInterval = setInterval(streamLogs, 500);
    
    req.on('close', () => {
      console.log('[LogsSSE] Client disconnected from log stream');
      isStreaming = false;
      clearInterval(pollInterval);
    });
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
    
    ws.on('message', async (message: string) => {
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
          
          // Check router ownership or superadmin status
          try {
            const router = await storage.getRouter(data.routerId);
            if (!router) {
              console.log(`[WebSocket] Router ${data.routerId} not found`);
              ws.send(JSON.stringify({ type: "error", message: "Router not found" }));
              return;
            }
            
            // Check if user has access (owner, assigned user, or superadmin)
            if (!userId) {
              console.log(`[WebSocket] User not authenticated`);
              ws.send(JSON.stringify({ type: "error", message: "Not authenticated" }));
              return;
            }
            
            const hasAccess = await storage.canUserAccessRouter(data.routerId, userId);
            console.log(`[WebSocket] Access check for start polling - userId: ${userId}, routerId: ${data.routerId}, hasAccess: ${hasAccess}`);
            
            if (!hasAccess) {
              console.log(`[WebSocket] FORBIDDEN - User ${userId} cannot access router ${data.routerId}`);
              ws.send(JSON.stringify({ type: "error", message: "Forbidden: You don't have access to this router" }));
              return;
            }
            
            console.log(`[WebSocket] Starting real-time polling for router ${data.routerId}`);
            activeRouterId = data.routerId;
            startRealtimePolling(data.routerId, ws);
            ws.send(JSON.stringify({ type: "realtime_polling_started", routerId: data.routerId }));
          } catch (error) {
            console.error(`[WebSocket] Error checking router access:`, error);
            ws.send(JSON.stringify({ type: "error", message: "Failed to verify router access" }));
          }
        }
        
        // Handle stop real-time traffic polling
        if (data.type === "stop_realtime_polling" && data.routerId) {
          console.log(`[WebSocket] Stopping real-time polling for router ${data.routerId}`);
          
          // Check router ownership or superadmin status (same as start)
          try {
            const router = await storage.getRouter(data.routerId);
            if (!router) {
              console.log(`[WebSocket] Router ${data.routerId} not found`);
              ws.send(JSON.stringify({ type: "error", message: "Router not found" }));
              return;
            }
            
            // Check if user has access (owner, assigned user, or superadmin)
            if (!userId) {
              console.log(`[WebSocket] User not authenticated`);
              ws.send(JSON.stringify({ type: "error", message: "Not authenticated" }));
              return;
            }
            
            const hasAccess = await storage.canUserAccessRouter(data.routerId, userId);
            console.log(`[WebSocket] Access check for stop polling - userId: ${userId}, routerId: ${data.routerId}, hasAccess: ${hasAccess}`);
            
            if (!hasAccess) {
              console.log(`[WebSocket] FORBIDDEN - User ${userId} cannot access router ${data.routerId}`);
              ws.send(JSON.stringify({ type: "error", message: "Forbidden: You don't have access to this router" }));
              return;
            }
            
            stopRealtimePolling(data.routerId, ws);
            if (activeRouterId === data.routerId) {
              activeRouterId = null;
            }
            ws.send(JSON.stringify({ type: "realtime_polling_stopped", routerId: data.routerId }));
          } catch (error) {
            console.error(`[WebSocket] Error checking router access:`, error);
            ws.send(JSON.stringify({ type: "error", message: "Failed to verify router access" }));
          }
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
