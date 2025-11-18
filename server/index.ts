import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startAutoUpdate } from "./autoUpdate";
import { runMigrations } from "./migrations";
import path from "path";
import { mkdir } from "fs/promises";

const app = express();

// Ensure required directories exist on startup
async function ensureDirectoriesExist() {
  const directories = [
    path.resolve(import.meta.dirname, "..", "attached_assets"),
    path.resolve(import.meta.dirname, "..", "attached_assets", "logos"),
    path.resolve(import.meta.dirname, "..", "logs"),
    path.resolve(import.meta.dirname, "..", "backups"),
  ];

  for (const dir of directories) {
    try {
      await mkdir(dir, { recursive: true, mode: 0o755 });
      console.log(`✓ Ensured directory exists: ${dir}`);
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        console.error(`✗ Failed to create directory ${dir}:`, error);
      }
    }
  }
}

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

// Add cache control headers for static assets BEFORE serving them
app.use((req, res, next) => {
  const url = req.url;
  
  // Never cache HTML files - always get fresh version
  if (url.endsWith('.html') || url === '/') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  // Cache uploaded assets (logos, etc.) for 1 week with revalidation
  else if (url.startsWith('/attached_assets/')) {
    res.setHeader('Cache-Control', 'public, max-age=604800, must-revalidate');
    res.setHeader('Expires', new Date(Date.now() + 604800000).toUTCString());
  }
  // Cache static assets (JS, CSS, images, fonts) for 1 year
  // Vite adds content hashes to filenames, so these are immutable
  else if (url.match(/\.(js|css|mjs|woff2?|ttf|eot|otf|svg|png|jpg|jpeg|gif|webp|ico|avif|bmp)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Expires', new Date(Date.now() + 31536000000).toUTCString());
  }
  
  next();
});

// Serve attached_assets directory for uploaded files (logos, etc.)
const attachedAssetsPath = path.resolve(import.meta.dirname, "..", "attached_assets");
app.use("/attached_assets", express.static(attachedAssetsPath, {
  etag: true,
  lastModified: true
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Ensure all required directories exist before starting the server
  await ensureDirectoriesExist();

  // Run database migrations to ensure schema is up-to-date
  try {
    await runMigrations();
  } catch (error) {
    console.error("[Startup] Failed to run database migrations:", error);
    console.error("[Startup] Server will continue but may have database issues");
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Start automatic update checker (production only)
    if (app.get("env") === "production") {
      startAutoUpdate();
    }
  });
})();
