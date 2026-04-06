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
import attendanceSsrRouter from "../attendance-ssr";

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

  // SSR attendance page
  app.use(attendanceSsrRouter);

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

  // Excel export endpoint - server-side xlsx generation
  app.get("/api/export/excel", async (req, res) => {
    try {
      const XLSX = await import("xlsx");
      const { type, startDate, endDate } = req.query as Record<string, string>;
      const dbModule = await import("../db");

      let headers: string[] = [];
      let rows: string[][] = [];
      let filename = "report.xlsx";

      if (type === "attendance_detail") {
        const records = await dbModule.getAllAttendance(startDate, endDate);
        headers = ["日期", "員工姓名", "帳號", "上班時間", "下班時間", "班次", "狀態", "備註"];
        const STATUS_LABELS: Record<string, string> = { normal: "正常", late: "遲到", early_leave: "早退", absent: "缺勤" };
        // 台灣時間 UTC+8
        const toTW = (v: unknown) => { if (!v) return null; const d = new Date(v as string); return new Date(d.getTime() + 8 * 60 * 60 * 1000); };
        const fmt = (v: unknown) => { const d = toTW(v); if (!d) return ""; return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`; };
        const fmtD = (v: unknown) => { const d = toTW(v); if (!d) return ""; return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`; };
        rows = records.map((r: any) => [fmtD(r.date), r.employeeName ?? "", r.employeeUsername ?? "", fmt(r.clockInTime), fmt(r.clockOutTime), r.shiftLabel ?? "", STATUS_LABELS[r.status ?? ""] ?? r.status ?? "", r.note ?? ""]);
        filename = `打卡明細_${startDate ?? ""}_${endDate ?? ""}.xlsx`;
      } else if (type === "leave_records") {
        const records = await dbModule.getAllLeaveRequests("approved");
        headers = ["員工姓名", "假別", "開始日期", "結束日期", "天數", "申請時間", "備註"];
        const LEAVE_LABELS: Record<string, string> = { annual: "特休", sick: "病假", personal: "事假", marriage: "婚假", bereavement: "喪假", official: "公假", other: "休假" };
        const fmtD = (v: unknown) => { if (!v) return ""; const d = new Date(v as string); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
        const fmt = (v: unknown) => { if (!v) return ""; const d = new Date(v as string); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
        rows = (records as any[]).map(l => [l.employeeName ?? "", LEAVE_LABELS[l.leaveType ?? ""] ?? l.leaveType ?? "", fmtD(l.startDate), fmtD(l.endDate), String(l.totalDays ?? ""), fmt(l.createdAt), l.reason ?? ""]);
        filename = `請假紀錄_${startDate ?? ""}_${endDate ?? ""}.xlsx`;
      }

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = headers.map((h, i) => ({ wch: Math.min(Math.max(Math.max(h.length, ...rows.map(r => (r[i] ?? "").length)) + 2, 10), 40) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "資料");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader("Cache-Control", "no-cache");
      res.send(buf);
    } catch (err: any) {
      console.error("[Excel Export]", err);
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
    // JS/CSS assets have content-hash in filename → long cache
    app.use("/_expo", express.static(path.join(distWebPath, "_expo"), {
      maxAge: "1y",
      immutable: true,
    }));
    // HTML pages must NOT be cached so new deploys take effect immediately
    app.use(express.static(distWebPath, {
      setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      },
    }));
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
    const noCache = (res: any) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    };
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) return;
      // SSR routes - skip SPA fallback
      if (req.path.startsWith("/attendance-v2")) return;
      // Try exact path + .html (e.g. /admin/employees -> dist-web/admin/employees.html)
      const htmlPath = path.join(distWebPath, req.path.replace(/\/$/, "") + ".html");
      if (fs.existsSync(htmlPath)) {
        noCache(res);
        return res.sendFile(htmlPath);
      }
      // Try path/index.html (e.g. /admin -> dist-web/admin/index.html)
      const indexPath = path.join(distWebPath, req.path.replace(/\/$/, ""), "index.html");
      if (fs.existsSync(indexPath)) {
        noCache(res);
        return res.sendFile(indexPath);
      }
      // Fallback to root index.html
      noCache(res);
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
