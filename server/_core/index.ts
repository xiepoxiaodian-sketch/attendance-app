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

  // Migration endpoint: run all pending schema migrations
  app.post("/api/migrate", async (_req, res) => {
    try {
      const mysql = await import("mysql2/promise");
      const conn = await mysql.createConnection(process.env.DATABASE_URL!);
      const results: string[] = [];

      // Helper: check if column exists
      async function hasColumn(table: string, column: string): Promise<boolean> {
        const [rows] = await conn.execute(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
          [table, column]
        ) as any[];
        return rows.length > 0;
      }
      // Helper: check if table exists
      async function hasTable(table: string): Promise<boolean> {
        const [rows] = await conn.execute(
          `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
          [table]
        ) as any[];
        return rows.length > 0;
      }

      // 0009: devices.status column
      if (!(await hasColumn('devices', 'status'))) {
        await conn.execute(`ALTER TABLE devices ADD COLUMN status ENUM('approved','pending','rejected') NOT NULL DEFAULT 'approved'`);
        results.push('Added devices.status');
      }

      // 0011: employees.lineUserId column
      if (!(await hasColumn('employees', 'lineUserId'))) {
        await conn.execute(`ALTER TABLE employees ADD COLUMN lineUserId varchar(64)`);
        results.push('Added employees.lineUserId');
      }

      // 0012: lineOtpCodes table
      if (!(await hasTable('lineOtpCodes'))) {
        await conn.execute(`CREATE TABLE lineOtpCodes (
          id int AUTO_INCREMENT NOT NULL,
          employeeId int NOT NULL,
          code varchar(6) NOT NULL,
          expiresAt timestamp NOT NULL,
          used boolean NOT NULL DEFAULT false,
          createdAt timestamp NOT NULL DEFAULT (now()),
          CONSTRAINT lineOtpCodes_id PRIMARY KEY(id)
        )`);
        results.push('Created lineOtpCodes table');
      }

      // 0013: attendance.clockInPhoto and clockOutPhoto columns
      if (!(await hasColumn('attendance', 'clockInPhoto'))) {
        await conn.execute(`ALTER TABLE attendance ADD COLUMN clockInPhoto text`);
        results.push('Added attendance.clockInPhoto');
      }
      if (!(await hasColumn('attendance', 'clockOutPhoto'))) {
        await conn.execute(`ALTER TABLE attendance ADD COLUMN clockOutPhoto text`);
        results.push('Added attendance.clockOutPhoto');
      }

      await conn.end();
      res.json({ ok: true, applied: results, message: results.length > 0 ? results.join(', ') : 'All up to date' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // LINE Bot Webhook endpoint
  app.post("/api/line/webhook", async (req, res) => {
    try {
      const { lineWebhookHandler } = await import("../line-bot");
      await lineWebhookHandler(req, res);
    } catch (err: any) {
      console.error("[LINE Webhook] Error:", err);
      res.status(500).json({ ok: false });
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
