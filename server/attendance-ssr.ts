/**
 * Server-Side Rendered Attendance Records Page
 * Completely bypasses frontend JS caching issues.
 * Accessible at /attendance-v2 (no auth required for now, same as tRPC endpoints)
 */

import { Router, Request, Response } from "express";
import * as db from "./db";

const router = Router();

// Helper: format date to Taiwan local string
function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d as string);
  if (isNaN(dt.getTime())) return "—";
  // Convert UTC to UTC+8
  const tw = new Date(dt.getTime() + 8 * 60 * 60 * 1000);
  const h = String(tw.getUTCHours()).padStart(2, "0");
  const m = String(tw.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d as string);
  if (isNaN(dt.getTime())) return "—";
  const tw = new Date(dt.getTime() + 8 * 60 * 60 * 1000);
  const y = tw.getUTCFullYear();
  const mo = String(tw.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(tw.getUTCDate()).padStart(2, "0");
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const wd = weekdays[tw.getUTCDay()];
  return `${y}-${mo}-${dy}（週${wd}）`;
}

function diffMinutes(a: Date | string, b: Date | string): number {
  const da = a instanceof Date ? a : new Date(a as string);
  const db2 = b instanceof Date ? b : new Date(b as string);
  return Math.round((db2.getTime() - da.getTime()) / 60000);
}

function fmtDuration(mins: number): string {
  if (mins < 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}

function computeStatus(
  clockIn: Date | string | null,
  clockOut: Date | string | null,
  shift: { startTime: string; endTime: string } | undefined,
  storedStatus: string | null,
  lateThreshold: number
): string {
  if (!shift) return storedStatus || "normal";
  const toTWMinutes = (d: Date | string) => {
    const dt = d instanceof Date ? d : new Date(d as string);
    const tw = new Date(dt.getTime() + 8 * 60 * 60 * 1000);
    return tw.getUTCHours() * 60 + tw.getUTCMinutes();
  };
  const [sh, sm] = shift.startTime.split(":").map(Number);
  const [eh, em] = shift.endTime.split(":").map(Number);
  const shiftStart = sh * 60 + sm;
  const shiftEnd = eh * 60 + em;
  let status = "normal";
  if (clockIn) {
    const inMin = toTWMinutes(clockIn);
    if (inMin - shiftStart > lateThreshold) status = "late";
  }
  if (clockOut) {
    const outMin = toTWMinutes(clockOut);
    if (outMin < shiftEnd - 1) {
      status = "early_leave";
    } else if (status !== "late") {
      status = "normal";
    }
  }
  return status;
}

const STATUS_LABEL: Record<string, string> = {
  normal: "正常",
  late: "遲到",
  early_leave: "早退",
  absent: "缺勤",
};

const STATUS_COLOR: Record<string, string> = {
  normal: "#22c55e",
  late: "#f59e0b",
  early_leave: "#f97316",
  absent: "#ef4444",
};

// Handle both the original admin route and the v2 route
router.get(["/admin/attendance", "/attendance-v2"], async (req: Request, res: Response) => {
  try {
    // Parse query params
    const today = (() => {
      const now = new Date();
      const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      return `${tw.getUTCFullYear()}-${String(tw.getUTCMonth() + 1).padStart(2, "0")}-${String(tw.getUTCDate()).padStart(2, "0")}`;
    })();

    const sevenDaysAgo = (() => {
      const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
      return `${tw.getUTCFullYear()}-${String(tw.getUTCMonth() + 1).padStart(2, "0")}-${String(tw.getUTCDate()).padStart(2, "0")}`;
    })();

    const startDate = (req.query.startDate as string) || sevenDaysAgo;
    const endDate = (req.query.endDate as string) || today;
    const filterStatus = (req.query.status as string) || "all";
    const searchName = (req.query.search as string) || "";

    // Fetch data
    const [records, allSchedules, lateThresholdStr] = await Promise.all([
      db.getAllAttendance(startDate, endDate),
      db.getAllSchedulesByDateRange(startDate, endDate),
      db.getSetting("late_threshold_minutes"),
    ]);

    const lateThreshold = parseInt(lateThresholdStr || "10");

    // Build schedule map
    const scheduleMap = new Map<string, Array<{ startTime: string; endTime: string; label: string }>>();
    for (const s of allSchedules) {
      let sDateKey = "";
      if (s.date) {
        const d = s.date instanceof Date ? s.date : new Date(s.date as unknown as string);
        if (!isNaN(d.getTime())) {
          const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
          sDateKey = `${tw.getUTCFullYear()}-${String(tw.getUTCMonth() + 1).padStart(2, "0")}-${String(tw.getUTCDate()).padStart(2, "0")}`;
        } else {
          sDateKey = String(s.date).split("T")[0].split(" ")[0];
        }
      }
      const sKey = `${s.employeeId}_${sDateKey}`;
      if (s.shifts) {
        scheduleMap.set(sKey, s.shifts as Array<{ startTime: string; endTime: string; label: string }>);
      }
    }

    // Group records
    const map = new Map<string, {
      employeeId: number;
      employeeName: string;
      dateKey: string;
      dateRaw: any;
      shifts: Array<{
        id: number;
        shiftLabel: string;
        clockInTime: any;
        clockOutTime: any;
        status: string;
        note: string | null;
        clockInPhoto: string | null;
        clockOutPhoto: string | null;
      }>;
    }>();

    for (const r of records) {
      let dateKey = "";
      if (r.date) {
        const d = r.date instanceof Date ? r.date : new Date(r.date as unknown as string);
        if (!isNaN(d.getTime())) {
          const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
          dateKey = `${tw.getUTCFullYear()}-${String(tw.getUTCMonth() + 1).padStart(2, "0")}-${String(tw.getUTCDate()).padStart(2, "0")}`;
        } else {
          dateKey = String(r.date).split("T")[0].split(" ")[0];
        }
      }
      const groupKey = `${r.employeeId}_${dateKey}`;
      const shiftsForDay = scheduleMap.get(groupKey);
      const shiftLabel = r.shiftLabel || "一般班";
      const matchedShift = shiftsForDay?.find(s => s.label === shiftLabel);
      const dynamicStatus = computeStatus(
        r.clockInTime ? (r.clockInTime instanceof Date ? r.clockInTime : new Date(r.clockInTime as any)) : null,
        r.clockOutTime ? (r.clockOutTime instanceof Date ? r.clockOutTime : new Date(r.clockOutTime as any)) : null,
        matchedShift,
        r.status ?? null,
        lateThreshold
      );

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          employeeId: r.employeeId,
          employeeName: (r as any).employeeName ?? `#${r.employeeId}`,
          dateKey,
          dateRaw: r.date,
          shifts: [],
        });
      }
      map.get(groupKey)!.shifts.push({
        id: r.id,
        shiftLabel,
        clockInTime: r.clockInTime,
        clockOutTime: r.clockOutTime,
        status: dynamicStatus,
        note: r.note ?? null,
        clockInPhoto: (r as any).clockInPhoto ?? null,
        clockOutPhoto: (r as any).clockOutPhoto ?? null,
      });
    }

    let grouped = Array.from(map.values()).sort((a, b) =>
      new Date(b.dateRaw).getTime() - new Date(a.dateRaw).getTime()
    );

    // Filter by search name
    if (searchName) {
      grouped = grouped.filter(g => g.employeeName.includes(searchName));
    }

    // Filter by status
    if (filterStatus !== "all") {
      if (filterStatus === "no_clockout") {
        grouped = grouped.filter(g =>
          g.shifts.some(s => s.clockInTime && !s.clockOutTime)
        );
      } else {
        grouped = grouped.filter(g =>
          g.shifts.some(s => s.status === filterStatus)
        );
      }
    }

    // Count totals for filter buttons
    const allGrouped = Array.from(map.values());
    const counts = {
      all: allGrouped.length,
      normal: allGrouped.filter(g => g.shifts.every(s => s.status === "normal")).length,
      late: allGrouped.filter(g => g.shifts.some(s => s.status === "late")).length,
      early_leave: allGrouped.filter(g => g.shifts.some(s => s.status === "early_leave")).length,
      absent: allGrouped.filter(g => g.shifts.some(s => s.status === "absent")).length,
      no_clockout: allGrouped.filter(g => g.shifts.some(s => s.clockInTime && !s.clockOutTime)).length,
    };

    // Build HTML
    const filterButtons = [
      { key: "all", label: "全部", count: counts.all },
      { key: "normal", label: "正常", count: counts.normal },
      { key: "late", label: "遲到", count: counts.late },
      { key: "early_leave", label: "早退", count: counts.early_leave },
      { key: "absent", label: "缺勤", count: counts.absent },
      { key: "no_clockout", label: "未下班打卡", count: counts.no_clockout },
    ];

    const filterBtnsHtml = filterButtons.map(f => {
      const isActive = filterStatus === f.key;
      const bg = isActive ? "#1e40af" : "#f1f5f9";
      const color = isActive ? "#fff" : "#475569";
      const border = isActive ? "2px solid #1e40af" : "2px solid transparent";
      return `<button onclick="setFilter('${f.key}')" style="background:${bg};color:${color};border:${border};border-radius:20px;padding:6px 14px;font-size:13px;cursor:pointer;font-weight:${isActive ? "600" : "400"}">${f.label} <span style="opacity:0.8">${f.count}</span></button>`;
    }).join(" ");

    const cardsHtml = grouped.length === 0
      ? `<div style="text-align:center;padding:60px 20px;color:#94a3b8;font-size:15px">查無紀錄</div>`
      : grouped.map(g => {
        const shiftsHtml = g.shifts.map(s => {
          const st = s.status;
          const stLabel = STATUS_LABEL[st] || st;
          const stColor = STATUS_COLOR[st] || "#64748b";
          const inTime = fmtDateTime(s.clockInTime);
          const outTime = s.clockOutTime ? fmtDateTime(s.clockOutTime) : "—";
          const dur = s.clockInTime && s.clockOutTime
            ? fmtDuration(diffMinutes(s.clockInTime, s.clockOutTime))
            : "—";
          const photoHtml = (s.clockInPhoto || s.clockOutPhoto) ? `
            <div style="display:flex;gap:8px;margin-top:8px">
              ${s.clockInPhoto ? `<img src="${s.clockInPhoto}" onclick="openPhoto('${s.clockInPhoto}')" style="width:44px;height:44px;border-radius:6px;object-fit:cover;border:2px solid #3b82f6;cursor:pointer" title="上班照片">` : `<div style="width:44px;height:44px;border-radius:6px;background:#f1f5f9;border:2px solid #e2e8f0;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:10px">無</div>`}
              ${s.clockOutPhoto ? `<img src="${s.clockOutPhoto}" onclick="openPhoto('${s.clockOutPhoto}')" style="width:44px;height:44px;border-radius:6px;object-fit:cover;border:2px solid #10b981;cursor:pointer" title="下班照片">` : `<div style="width:44px;height:44px;border-radius:6px;background:#f1f5f9;border:2px solid #e2e8f0;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:10px">無</div>`}
            </div>` : "";
          return `
          <div style="padding:10px 0;border-bottom:1px solid #f1f5f9">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <div style="font-size:13px;color:#64748b">${s.shiftLabel}</div>
              <span style="background:${stColor}22;color:${stColor};border-radius:12px;padding:2px 10px;font-size:12px;font-weight:600">${stLabel}</span>
            </div>
            <div style="display:flex;gap:16px;margin-top:4px;font-size:14px;color:#334155">
              <span>🟢 ${inTime}</span>
              <span>🔵 ${outTime}</span>
              <span style="color:#94a3b8">${dur}</span>
            </div>
            ${s.note ? `<div style="margin-top:4px;font-size:12px;color:#94a3b8">📝 ${s.note}</div>` : ""}
            ${photoHtml}
          </div>`;
        }).join("");

        const avatarLetter = g.employeeName.charAt(0);
        return `
        <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <div style="width:36px;height:36px;border-radius:50%;background:#1e40af;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0">${avatarLetter}</div>
            <div>
              <div style="font-size:16px;font-weight:600;color:#1e293b">${g.employeeName}</div>
              <div style="font-size:12px;color:#94a3b8">${fmtDate(g.dateRaw)}</div>
            </div>
          </div>
          ${shiftsHtml}
        </div>`;
      }).join("");

    const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>打卡紀錄</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #1e293b; }
    input[type=date], input[type=text] { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; font-size: 14px; width: 100%; background: #fff; color: #1e293b; }
    .modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:1000; align-items:center; justify-content:center; }
    .modal.open { display:flex; }
    .modal img { max-width:92vw; max-height:85vh; border-radius:8px; }
    button { font-family: inherit; }
  </style>
</head>
<body>
  <!-- Photo modal -->
  <div class="modal" id="photoModal" onclick="closePhoto()">
    <img id="photoModalImg" src="" alt="打卡照片">
  </div>

  <div style="max-width:640px;margin:0 auto;padding:16px">
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div>
        <h1 style="font-size:20px;font-weight:700;color:#1e293b">打卡紀錄</h1>
        <div style="font-size:13px;color:#94a3b8;margin-top:2px">共 ${grouped.length} 筆紀錄</div>
      </div>
      <a href="/" style="color:#1e40af;font-size:14px;text-decoration:none">← 返回</a>
    </div>

    <!-- Date filter -->
    <form method="GET" action="/attendance-v2" id="filterForm">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div>
          <label style="font-size:12px;color:#64748b;display:block;margin-bottom:4px">開始日期</label>
          <input type="date" name="startDate" value="${startDate}" onchange="document.getElementById('filterForm').submit()">
        </div>
        <div>
          <label style="font-size:12px;color:#64748b;display:block;margin-bottom:4px">結束日期</label>
          <input type="date" name="endDate" value="${endDate}" onchange="document.getElementById('filterForm').submit()">
        </div>
      </div>
      <div style="margin-bottom:12px">
        <input type="text" name="search" value="${searchName}" placeholder="搜尋員工姓名..." onchange="document.getElementById('filterForm').submit()">
      </div>
      <input type="hidden" name="status" id="statusInput" value="${filterStatus}">
    </form>

    <!-- Status filter buttons -->
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      ${filterBtnsHtml}
    </div>

    <!-- Cards -->
    ${cardsHtml}
  </div>

  <script>
    function setFilter(status) {
      document.getElementById('statusInput').value = status;
      document.getElementById('filterForm').submit();
    }
    function openPhoto(url) {
      document.getElementById('photoModalImg').src = url;
      document.getElementById('photoModal').classList.add('open');
    }
    function closePhoto() {
      document.getElementById('photoModal').classList.remove('open');
    }
  </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.send(html);
  } catch (err: any) {
    console.error("[attendance-ssr]", err);
    res.status(500).send(`<pre>Error: ${err.message}</pre>`);
  }
});

export default router;
