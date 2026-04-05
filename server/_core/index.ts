import "dotenv/config";
import express from "express";
import { createServer } from "http";
import fs from "fs";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { startCronJobs } from "../cron-jobs";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // One-time migration endpoint: add status column to devices table if missing
  app.post("/api/migrate", async (_req, res) => {
    try {
      const mysql = await import("mysql2/promise");
      const conn = await mysql.createConnection(process.env.DATABASE_URL!);
      // Check if status column exists
      const [cols] = await conn.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'status'`
      ) as any[];
      if (cols.length === 0) {
        await conn.execute(
          `ALTER TABLE devices ADD COLUMN status ENUM('approved','pending','rejected') NOT NULL DEFAULT 'approved'`
        );
        await conn.end();
        res.json({ ok: true, message: "status column added" });
      } else {
        await conn.end();
        res.json({ ok: true, message: "status column already exists" });
      }
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Serve static frontend files in production
  const distWebPath = path.join(process.cwd(), "dist-web");
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(distWebPath));
  }

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // SPA fallback: serve route-specific .html first, then index.html for all non-API routes in production
  if (process.env.NODE_ENV === "production") {
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) return;
      // Try exact path + .html (e.g. /admin/employees -> dist-web/admin/employees.html)
      const htmlPath = path.join(distWebPath, req.path.replace(/\/$/, "") + ".html");
      if (fs.existsSync(htmlPath)) {
        return res.sendFile(htmlPath);
      }
      // Try path/index.html (e.g. /admin -> dist-web/admin/index.html)
      const indexPath = path.join(distWebPath, req.path.replace(/\/$/, ""), "index.html");
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
      // Fallback to root index.html
      res.sendFile(path.join(distWebPath, "index.html"));
    });
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);

// Start cron jobs for push notifications
startCronJobs();
